/**
 * Seed (or refresh) the directory reviewer account.
 *
 *   npx tsx scripts/seed-reviewer-account.ts \
 *     --base-url http://localhost:8797 \
 *     --credentials-out /path/outside/the/repo/reviewer.json \
 *     [--email reviewer@usefulapply.com] [--credits 40] [--remote]
 *
 * What it does, in order:
 *   1. Signs the reviewer up through the app's own sign-up endpoint on --base-url
 *      (so the password hash is the real one), or reuses the account when the
 *      credentials file still signs in.
 *   2. Marks the email verified and writes everything else through
 *      `wrangler d1 execute usefulapply-db` (--local unless --remote is passed):
 *      profile, credits plus a ledger row, a primary CV, one US and one German
 *      application with a stored kit and fit result, and job feed consent.
 *
 * The kits are stored data, not model output. Everyone and everything in them is
 * fictional. The account has no MFA (the product has none).
 *
 * The generated password is never printed. It is written only to
 * --credentials-out (mode 0600), which must be outside the repo or gitignored.
 * Re-running refreshes the data to the same state. Only this one user's rows are
 * touched. If the credentials file is missing or stale, the reviewer user is
 * deleted (cascading its own rows) and created again with a new password.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..');
const DB_NAME = 'usefulapply-db';

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  baseUrl: string;
  credentialsOut: string;
  email: string;
  credits: number;
  remote: boolean;
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let remote = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--remote') remote = true;
    else if (arg.startsWith('--')) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) fail(`Missing value for ${arg}`);
      values.set(arg.slice(2), value);
      i++;
    } else fail(`Unexpected argument ${arg}`);
  }
  const baseUrl = (values.get('base-url') ?? 'http://localhost:8797').replace(/\/+$/, '');
  const credentialsOut = values.get('credentials-out');
  if (!credentialsOut) fail('--credentials-out <path> is required');
  const email = (values.get('email') ?? 'reviewer@usefulapply.com').toLowerCase();
  if (!/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) fail(`Not a valid email: ${email}`);
  const credits = Number(values.get('credits') ?? 40);
  if (!Number.isFinite(credits) || credits < 0 || credits > 1000) fail('--credits must be a number from 0 to 1000');
  return { baseUrl, credentialsOut: resolve(credentialsOut), email, credits, remote };
}

function fail(message: string): never {
  console.error(`seed-reviewer-account: ${message}`);
  process.exit(1);
}

function isLocalUrl(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/** The credentials file must live outside the repo, or inside it only when git ignores it. */
function assertSafeCredentialsPath(path: string): void {
  if (path !== REPO_ROOT && !path.startsWith(REPO_ROOT + sep)) return;
  try {
    execFileSync('git', ['check-ignore', '-q', path], { cwd: REPO_ROOT, stdio: 'ignore' });
  } catch {
    fail(`--credentials-out ${path} is inside the repo and not gitignored. Use a path outside the repo.`);
  }
}

// ---------------------------------------------------------------------------
// D1 through wrangler
// ---------------------------------------------------------------------------

function sqlText(value: string | null | undefined): string {
  if (value === null || value === undefined) return 'NULL';
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlJson(value: unknown): string {
  return sqlText(JSON.stringify(value));
}

function sqlNum(value: number | null | undefined): string {
  return value === null || value === undefined ? 'NULL' : String(value);
}

function runWrangler(args: string[], remote: boolean): string {
  const target = remote ? '--remote' : '--local';
  return execFileSync('npx', ['wrangler', 'd1', 'execute', DB_NAME, target, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CI: '1' },
  });
}

function d1Rows<T>(sql: string, remote: boolean): T[] {
  const out = runWrangler(['--json', '--command', sql], remote);
  const parsed = JSON.parse(out.slice(out.indexOf('['))) as Array<{ results?: T[] }>;
  return parsed[0]?.results ?? [];
}

function d1Exec(sql: string, remote: boolean): void {
  const dir = mkdtempSync(join(tmpdir(), 'seed-reviewer-'));
  const file = join(dir, 'seed.sql');
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    runWrangler(['--yes', '--file', file], remote);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Auth through the app's own endpoints
// ---------------------------------------------------------------------------

function authHeaders(baseUrl: string): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  // Locally, a private address keeps this script out of the shared rate-limit buckets. Remote ignores it.
  if (isLocalUrl(baseUrl)) {
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
    headers['cf-connecting-ip'] = ip;
    headers['x-forwarded-for'] = ip;
  }
  return headers;
}

/**
 * A plain POST with no Origin and no Sec-Fetch headers, like the e2e specs' API client. Node's
 * global fetch adds `sec-fetch-mode`, which makes Better Auth demand a trusted Origin.
 */
function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<{ status: number; text: string }> {
  const target = new URL(url);
  const request = target.protocol === 'https:' ? httpsRequest : httpRequest;
  return new Promise((resolvePromise, reject) => {
    const req = request(target, { method: 'POST', headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolvePromise({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

async function signIn(baseUrl: string, email: string, password: string): Promise<boolean> {
  const response = await postJson(`${baseUrl}/api/auth/sign-in/email`, authHeaders(baseUrl), { email, password });
  return response.status >= 200 && response.status < 300;
}

async function signUp(baseUrl: string, email: string, password: string, name: string): Promise<string> {
  const response = await postJson(`${baseUrl}/api/auth/sign-up/email`, authHeaders(baseUrl), { email, password, name });
  if (response.status < 200 || response.status >= 300) fail(`Sign-up failed with HTTP ${response.status}: ${response.text.slice(0, 300)}`);
  const body = JSON.parse(response.text) as { user?: { id?: string } };
  if (!body.user?.id) fail('Sign-up returned no user id');
  return body.user.id;
}

function readCredentials(path: string, email: string): { email: string; password: string } | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { email?: string; password?: string };
    if (parsed.email === email && typeof parsed.password === 'string' && parsed.password.length >= 16) {
      return { email: parsed.email, password: parsed.password };
    }
  } catch {
    // An unreadable file counts as no credentials.
  }
  return null;
}

function writeCredentials(path: string, baseUrl: string, email: string, password: string): void {
  writeFileSync(path, `${JSON.stringify({ baseUrl, email, password }, null, 2)}\n`, { mode: 0o600 });
  chmodSync(path, 0o600);
}

function generatePassword(): string {
  // 24 random bytes in base64url is 32 characters. The suffix satisfies any composition rule.
  return `${randomBytes(24).toString('base64url')}-9aZ`;
}

// ---------------------------------------------------------------------------
// Fixtures (everything below is fictional)
// ---------------------------------------------------------------------------

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

/** "Jun 2021" or "06/2021" style raw dates with a normalized YYYY-MM. */
function cvDate(raw: string, normalized: string) {
  return { raw, normalized, confidence: 'high' as const };
}
function enDate(month: string, year: number) {
  return cvDate(`${month} ${year}`, `${year}-${MONTHS[month]}`);
}
function deDate(month: string, year: number) {
  return cvDate(`${MONTHS[month]}/${year}`, `${year}-${MONTHS[month]}`);
}

type Lang = 'en' | 'de';

interface CvText {
  summaryHeader: string;
  experience: string;
  education: string;
  skills: string;
  certifications: string;
  languages: string;
  present: string;
}
const CV_TEXT: Record<Lang, CvText> = {
  en: { summaryHeader: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', certifications: 'Certifications', languages: 'Languages', present: 'Present' },
  de: { summaryHeader: 'Profil', experience: 'Berufserfahrung', education: 'Ausbildung', skills: 'Kenntnisse', certifications: 'Zertifikate', languages: 'Sprachen', present: 'heute' },
};

const NAME = 'Jordan Whitfield';
const PERSONAL = {
  fullName: NAME,
  email: 'jordan.whitfield@example.com',
  phone: '+1 512 555 0142',
  currentTitle: 'Senior Software Engineer',
  address: '1200 Sample Street',
  city: 'Austin',
  country: 'USA',
  postalCode: '78701',
  linkedIn: 'https://www.linkedin.com/in/jordan-whitfield-sample',
  github: 'https://github.com/jordan-whitfield-sample',
};

function buildCv(lang: Lang, now: string) {
  const en = lang === 'en';
  const present = CV_TEXT[lang].present;
  const date = en ? enDate : deDate;
  return {
    id: randomUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFileName: 'jordan-whitfield-sample-cv.txt',
    sourceFormat: 'txt' as const,
    settings: en
      ? { region: 'US' as const, includePhoto: false, pageSize: 'letter' as const, maxPages: 2 as const, language: 'en' }
      : { region: 'EU' as const, includePhoto: false, pageSize: 'a4' as const, maxPages: 2 as const, language: 'de' },
    personal: PERSONAL,
    summary: en
      ? 'Senior software engineer with 8 years of experience building billing and data platforms on AWS. Leads small teams, works mostly in TypeScript, Node.js and PostgreSQL and has moved services to Kubernetes.'
      : 'Senior Software Engineer mit 8 Jahren Erfahrung im Aufbau von Abrechnungs- und Datenplattformen auf AWS. Leitet kleine Teams, arbeitet vor allem mit TypeScript, Node.js und PostgreSQL und hat Services nach Kubernetes migriert.',
    experience: [
      {
        id: 'exp-1',
        company: 'Brightwave Systems',
        position: 'Senior Software Engineer',
        location: 'Austin, TX',
        startDate: date('Jun', 2021),
        current: true,
        bullets: en
          ? [
              'Lead a team of 4 engineers building the billing platform API, which serves 1.2M requests per day',
              'Cut p95 API latency from 480 ms to 190 ms by redesigning PostgreSQL queries and adding Redis caching',
              'Moved 14 services from a single VM to Kubernetes on AWS EKS, reducing deploy time from 40 to 9 minutes',
              'Introduced Terraform modules that 6 teams now use for their infrastructure',
            ]
          : [
              'Leitung eines Teams aus 4 Entwicklern für die API der Abrechnungsplattform mit 1,2 Mio. Anfragen pro Tag',
              'p95-Latenz der API von 480 ms auf 190 ms gesenkt, durch neu gestaltete PostgreSQL-Abfragen und Redis-Caching',
              '14 Services von einer einzelnen VM auf Kubernetes (AWS EKS) migriert, Deployment-Zeit von 40 auf 9 Minuten reduziert',
              'Terraform-Module eingeführt, die heute 6 Teams für ihre Infrastruktur nutzen',
            ],
      },
      {
        id: 'exp-2',
        company: 'Lantern Analytics',
        position: 'Software Engineer',
        location: 'Denver, CO',
        startDate: date('Aug', 2018),
        endDate: date('May', 2021),
        current: false,
        bullets: en
          ? [
              'Built a TypeScript and Node.js ingestion service that handles 30 GB of event data per day',
              'Wrote Python batch jobs that replaced a manual weekly reporting process and saved about 10 hours a week',
              'Mentored 3 interns through their first production releases',
            ]
          : [
              'Ingestion-Service in TypeScript und Node.js entwickelt, der 30 GB Ereignisdaten pro Tag verarbeitet',
              'Python-Batch-Jobs geschrieben, die einen manuellen wöchentlichen Berichtsprozess ersetzten und etwa 10 Stunden pro Woche sparten',
              '3 Praktikanten bei ihren ersten Produktiv-Releases betreut',
            ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Northfield State University',
        degree: en ? 'B.S. Computer Science' : 'B.S. Informatik',
        location: 'Northfield, MN',
        startDate: cvDate(en ? 'Aug 2014' : '08/2014', '2014-08'),
        endDate: cvDate(en ? 'May 2018' : '05/2018', '2018-05'),
      },
    ],
    skills: [
      { id: 'sk-1', category: en ? 'Languages' : 'Sprachen und Frameworks', skills: ['TypeScript', 'JavaScript', 'Python', 'SQL', 'Node.js', 'React'] },
      { id: 'sk-2', category: en ? 'Cloud and infrastructure' : 'Cloud und Infrastruktur', skills: ['AWS', 'Kubernetes', 'Docker', 'Terraform', 'GitHub Actions'] },
      { id: 'sk-3', category: en ? 'Data' : 'Daten', skills: ['PostgreSQL', 'Redis'] },
    ],
    certifications: [
      { id: 'cert-1', name: 'AWS Certified Solutions Architect - Associate', issuer: 'Amazon Web Services', date: cvDate('2022', '2022-01') },
    ],
    languages: [
      { id: 'lang-1', language: en ? 'English' : 'Englisch', proficiency: en ? 'Native' : 'Muttersprache' },
      { id: 'lang-2', language: en ? 'German' : 'Deutsch', proficiency: 'B2' },
      { id: 'lang-3', language: en ? 'Spanish' : 'Spanisch', proficiency: en ? 'Conversational' : 'Gesprächssicher' },
    ],
    sectionHeaders: {
      summary: CV_TEXT[lang].summaryHeader,
      experience: CV_TEXT[lang].experience,
      education: CV_TEXT[lang].education,
      skills: CV_TEXT[lang].skills,
      certifications: CV_TEXT[lang].certifications,
      languages: CV_TEXT[lang].languages,
    },
    localizedStrings: { present },
  };
}

type FixtureCv = ReturnType<typeof buildCv>;

/** The plain-text CV, with hyphen date ranges and the localized section headings. */
function cvPlainText(cv: FixtureCv, lang: Lang): string {
  const h = CV_TEXT[lang];
  const lines: string[] = [cv.personal.fullName, cv.personal.currentTitle ?? '', `${cv.personal.city}, ${cv.personal.country} | ${cv.personal.email} | ${cv.personal.phone}`, ''];
  lines.push(h.summaryHeader.toUpperCase(), cv.summary ?? '', '');
  lines.push(h.experience.toUpperCase());
  for (const job of cv.experience) {
    lines.push(`${job.position}, ${job.company}, ${job.location}`, `${job.startDate.raw} - ${job.current ? h.present : job.endDate?.raw ?? ''}`);
    for (const bullet of job.bullets) lines.push(`- ${bullet}`);
    lines.push('');
  }
  lines.push(h.education.toUpperCase());
  for (const edu of cv.education) lines.push(`${edu.degree}, ${edu.institution}, ${edu.startDate?.raw} - ${edu.endDate?.raw}`);
  lines.push('', h.skills.toUpperCase());
  for (const group of cv.skills) lines.push(`${group.category}: ${group.skills.join(', ')}`);
  lines.push('', h.certifications.toUpperCase());
  for (const cert of cv.certifications) lines.push(`${cert.name}, ${cert.issuer}, ${cert.date?.raw}`);
  lines.push('', h.languages.toUpperCase());
  for (const language of cv.languages) lines.push(`${language.language}: ${language.proficiency}`);
  return lines.join('\n');
}

function longDate(lang: Lang, when: Date): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(when);
}

interface Letter {
  structured: {
    version: 2;
    language: string;
    market: 'us' | 'dach';
    sender: { name: string; addressLines: string[]; phone: string; email: string };
    recipient: { companyName: string; contactPerson: string; department: string; addressLines: string[] };
    place?: string;
    date: string;
    subject: string;
    salutation: string;
    paragraphs: string[];
    closing: string;
    signatureName: string;
  };
  body: string;
}

function letterText(l: Letter['structured']): string {
  const lines = [
    l.sender.name, ...l.sender.addressLines, l.sender.phone, l.sender.email, '',
    l.place ? `${l.place}, ${l.date}` : l.date, '',
    l.recipient.companyName, l.recipient.contactPerson, l.recipient.department, ...l.recipient.addressLines, '',
    l.subject, '',
    l.salutation, '',
    ...l.paragraphs.flatMap((p) => [p, '']),
    l.closing, '', l.signatureName,
  ];
  return lines.join('\n');
}

interface Fixture {
  id: string;
  title: string;
  company: string;
  jobUrl: string;
  jobDescription: string;
  lang: Lang;
  template: string;
  status: 'applied' | 'drafted';
  score: number;
  fitLevel: 'strong' | 'good';
  assessment: string;
  matching: string[];
  missing: string[];
  requirements: { hardSkills: string[]; niceToHave: string[]; responsibilities: string[]; location: string; workType: string };
  companyAddress: string;
  contactPerson: string;
  email: { subject: string; body: string };
  followUp: { subject: string; body: string; recommendedDelay: number };
  letter: (date: Date) => Letter;
  changes: Array<{ section: string; original: string; updated: string; reason: string }>;
}

const US_APP: Fixture = {
  id: 'a0000000-0000-4000-8000-00000000a001',
  title: 'Senior Software Engineer, Platform',
  company: 'Halcyon Cloud Labs',
  jobUrl: 'https://example.com/careers/halcyon-cloud-labs/senior-software-engineer-platform',
  jobDescription: [
    'Senior Software Engineer, Platform',
    'Halcyon Cloud Labs, Austin, TX (hybrid, 3 days a week in the office)',
    '',
    'Halcyon Cloud Labs builds deployment tooling for mid-size engineering teams. The Platform team owns the services that every other team ships on.',
    '',
    'What you will do',
    '- Design and run the APIs and services behind our deployment platform',
    '- Improve reliability and latency of our PostgreSQL-backed services',
    '- Move legacy services onto Kubernetes and keep our AWS infrastructure in Terraform',
    '- Mentor engineers and review designs across the team',
    '',
    'What we are looking for',
    '- 6+ years of backend experience, with TypeScript or Go',
    '- Strong PostgreSQL and AWS experience',
    '- Hands-on Kubernetes and CI/CD experience',
    '- Experience leading projects or small teams',
    'Nice to have: Terraform, Redis, observability tooling.',
    '',
    'Salary range: USD 165,000 to 195,000. Send applications to Ms. Priya Raman, Engineering Recruiting, Halcyon Cloud Labs, 400 Sample Avenue, Austin, TX 78701.',
    '',
    '(Sample posting for the Useful Apply reviewer account. Halcyon Cloud Labs is fictional.)',
  ].join('\n'),
  lang: 'en',
  template: 'premium-ats',
  status: 'applied',
  score: 82,
  fitLevel: 'strong',
  assessment:
    'You match the core of this role. Your billing platform work lines up with the Platform team: PostgreSQL tuning, a Kubernetes migration on AWS EKS and Terraform modules used by 6 teams. You also lead a team of 4, which the ad asks for. The ad lists TypeScript or Go, and your CV shows TypeScript, so that is covered.\n\nTwo gaps are worth knowing about. Your CV does not mention Go or observability tooling. Neither is a hard requirement, but expect questions about them in interviews.',
  matching: ['TypeScript', 'PostgreSQL', 'AWS', 'Kubernetes', 'Terraform', 'Redis', 'CI/CD'],
  missing: ['Go', 'Observability tooling'],
  requirements: {
    hardSkills: ['TypeScript', 'Go', 'PostgreSQL', 'AWS', 'Kubernetes', 'CI/CD'],
    niceToHave: ['Terraform', 'Redis', 'Observability tooling'],
    responsibilities: [
      'Design and run the APIs and services behind the deployment platform',
      'Improve reliability and latency of PostgreSQL-backed services',
      'Move legacy services onto Kubernetes and keep AWS infrastructure in Terraform',
      'Mentor engineers and review designs',
    ],
    location: 'Austin, TX',
    workType: 'hybrid',
  },
  companyAddress: '400 Sample Avenue, Austin, TX 78701',
  contactPerson: 'Ms. Priya Raman',
  email: {
    subject: 'Application for Senior Software Engineer, Platform at Halcyon Cloud Labs',
    body: [
      'Dear Ms. Raman,',
      '',
      'I am applying for the Senior Software Engineer, Platform role at Halcyon Cloud Labs. My CV and cover letter are attached.',
      '',
      'At Brightwave Systems I lead a team of 4 on a billing platform API that serves 1.2M requests per day. I cut p95 latency from 480 ms to 190 ms with PostgreSQL query changes and Redis caching, and I moved 14 services to Kubernetes on AWS EKS. That is close to the work your Platform team describes.',
      '',
      'I would welcome a conversation about the role.',
      '',
      'Best regards,',
      NAME,
    ].join('\n'),
  },
  followUp: {
    subject: 'Following up on my Senior Software Engineer, Platform application',
    body: [
      'Dear Ms. Raman,',
      '',
      'I applied for the Senior Software Engineer, Platform role at Halcyon Cloud Labs last week and wanted to check in. I remain very interested, and I am happy to share more detail on the Kubernetes migration or the latency work if that helps.',
      '',
      'Thank you for your time.',
      '',
      'Best regards,',
      NAME,
    ].join('\n'),
    recommendedDelay: 5,
  },
  changes: [
    {
      section: 'Summary',
      original: 'Senior software engineer with 8 years of experience building billing and data platforms on AWS.',
      updated: 'Senior software engineer with 8 years of experience building billing and data platforms on AWS. Leads small teams, works mostly in TypeScript, Node.js and PostgreSQL and has moved services to Kubernetes.',
      reason: 'The ad asks for backend depth in TypeScript and PostgreSQL, hands-on Kubernetes and team leadership.',
    },
    {
      section: 'Experience: Brightwave Systems',
      original: 'Moved 14 services to Kubernetes on AWS EKS',
      updated: 'Moved 14 services from a single VM to Kubernetes on AWS EKS, reducing deploy time from 40 to 9 minutes',
      reason: 'The ad lists Kubernetes and CI/CD, so the deploy time result comes first.',
    },
  ],
  letter: (date) => {
    const structured: Letter['structured'] = {
      version: 2,
      language: 'en',
      market: 'us',
      sender: { name: NAME, addressLines: ['1200 Sample Street', 'Austin, TX 78701'], phone: PERSONAL.phone, email: PERSONAL.email },
      recipient: { companyName: 'Halcyon Cloud Labs', contactPerson: 'Ms. Priya Raman', department: 'Engineering Recruiting', addressLines: ['400 Sample Avenue', 'Austin, TX 78701'] },
      date: longDate('en', date),
      subject: 'Application for Senior Software Engineer, Platform',
      salutation: 'Dear Ms. Raman,',
      paragraphs: [
        'I am writing to apply for the Senior Software Engineer, Platform position at Halcyon Cloud Labs. Your posting describes a team that owns the services every other team ships on, and that is the kind of work I have done for the last five years.',
        'At Brightwave Systems I lead a team of 4 engineers on the billing platform API, which serves 1.2M requests per day. I cut p95 latency from 480 ms to 190 ms by redesigning PostgreSQL queries and adding Redis caching. I also moved 14 services from a single VM to Kubernetes on AWS EKS, which brought deploy time down from 40 to 9 minutes, and I introduced Terraform modules that 6 teams now use.',
        'Before Brightwave, I built a TypeScript and Node.js ingestion service at Lantern Analytics that handles 30 GB of event data per day. My CV shows TypeScript rather than Go, and I would be glad to talk about how I would pick up Go on your team.',
        'Thank you for your time. I would welcome a conversation about the role.',
      ],
      closing: 'Sincerely,',
      signatureName: NAME,
    };
    return { structured, body: letterText(structured) };
  },
};

const DE_APP: Fixture = {
  id: 'a0000000-0000-4000-8000-00000000a002',
  title: 'Senior Backend Engineer (m/w/d)',
  company: 'Fjordwerk GmbH',
  jobUrl: 'https://example.com/karriere/fjordwerk/senior-backend-engineer',
  jobDescription: [
    'Senior Backend Engineer (m/w/d)',
    'Fjordwerk GmbH, Berlin (hybrid, 2 Tage pro Woche im Büro)',
    'Kennziffer: FW-2026-114',
    '',
    'Fjordwerk entwickelt Software für die Lagerlogistik mittelständischer Händler. Im Backend-Team verantworten wir die Dienste, auf denen unsere Produkte laufen.',
    '',
    'Ihre Aufgaben',
    '- Entwurf und Betrieb von APIs und Backend-Diensten für unsere Logistikplattform',
    '- Verbesserung von Zuverlässigkeit und Antwortzeiten unserer PostgreSQL-basierten Dienste',
    '- Migration bestehender Dienste nach Kubernetes auf AWS',
    '- Code-Reviews und fachliche Begleitung von Kolleginnen und Kollegen',
    '',
    'Ihr Profil',
    '- Mehr als 5 Jahre Erfahrung in der Backend-Entwicklung, idealerweise mit TypeScript',
    '- Sehr gute Kenntnisse in PostgreSQL und AWS',
    '- Praktische Erfahrung mit Kubernetes und CI/CD',
    '- Gute Deutschkenntnisse (mindestens B2) und gutes Englisch',
    'Von Vorteil: Terraform, Redis.',
    '',
    'Gehaltsrahmen: 78.000 bis 92.000 Euro brutto pro Jahr. Bitte richten Sie Ihre Bewerbung an Frau Sabine Köhler, Personalleitung, Fjordwerk GmbH, Musterstraße 118, 10119 Berlin.',
    '',
    '(Beispielanzeige für das Useful-Apply-Prüfkonto. Fjordwerk GmbH ist frei erfunden.)',
  ].join('\n'),
  lang: 'de',
  template: 'german-ats',
  status: 'drafted',
  score: 79,
  fitLevel: 'good',
  assessment:
    'Ihr Profil passt gut zu dieser Stelle. Sie bringen TypeScript, PostgreSQL und AWS mit, haben 14 Services nach Kubernetes migriert und leiten ein Team aus 4 Entwicklern. Die geforderten Deutschkenntnisse (mindestens B2) stehen mit B2 in Ihrem Lebenslauf.\n\nLücken: Ihr Lebenslauf nennt keine Erfahrung mit Logistik- oder Lagersoftware. Das ist keine harte Anforderung der Anzeige, kann aber im Gespräch Thema werden.',
  matching: ['TypeScript', 'PostgreSQL', 'AWS', 'Kubernetes', 'CI/CD', 'Terraform', 'Redis', 'Deutsch B2'],
  missing: ['Logistiksoftware'],
  requirements: {
    hardSkills: ['TypeScript', 'PostgreSQL', 'AWS', 'Kubernetes', 'CI/CD', 'Deutsch B2'],
    niceToHave: ['Terraform', 'Redis'],
    responsibilities: [
      'Entwurf und Betrieb von APIs und Backend-Diensten für die Logistikplattform',
      'Verbesserung von Zuverlässigkeit und Antwortzeiten PostgreSQL-basierter Dienste',
      'Migration bestehender Dienste nach Kubernetes auf AWS',
      'Code-Reviews und fachliche Begleitung',
    ],
    location: 'Berlin',
    workType: 'hybrid',
  },
  companyAddress: 'Musterstraße 118, 10119 Berlin',
  contactPerson: 'Frau Sabine Köhler',
  email: {
    subject: 'Bewerbung als Senior Backend Engineer (m/w/d), Kennziffer FW-2026-114',
    body: [
      'Sehr geehrte Frau Köhler,',
      '',
      'anbei erhalten Sie meine Bewerbung als Senior Backend Engineer (m/w/d), Kennziffer FW-2026-114. Lebenslauf und Anschreiben finden Sie im Anhang.',
      '',
      'Bei Brightwave Systems leite ich ein Team aus 4 Entwicklern und habe 14 Services nach Kubernetes auf AWS EKS migriert. Mit neu gestalteten PostgreSQL-Abfragen und Redis-Caching habe ich die p95-Latenz von 480 ms auf 190 ms gesenkt. Das passt gut zu den Aufgaben Ihres Backend-Teams.',
      '',
      'Über ein Gespräch freue ich mich.',
      '',
      'Mit freundlichen Grüßen',
      NAME,
    ].join('\n'),
  },
  followUp: {
    subject: 'Nachfrage zu meiner Bewerbung als Senior Backend Engineer (m/w/d)',
    body: [
      'Sehr geehrte Frau Köhler,',
      '',
      'vor einer Woche habe ich mich bei Fjordwerk als Senior Backend Engineer (m/w/d) beworben, Kennziffer FW-2026-114. Ich möchte kurz nachfragen, wie der Stand Ihres Auswahlverfahrens ist. Mein Interesse an der Stelle ist unverändert groß.',
      '',
      'Gern erläutere ich Ihnen die Kubernetes-Migration oder die Latenzverbesserung näher.',
      '',
      'Mit freundlichen Grüßen',
      NAME,
    ].join('\n'),
    recommendedDelay: 7,
  },
  changes: [
    {
      section: 'Profil',
      original: 'Senior software engineer with 8 years of experience building billing and data platforms on AWS.',
      updated: 'Senior Software Engineer mit 8 Jahren Erfahrung im Aufbau von Abrechnungs- und Datenplattformen auf AWS. Leitet kleine Teams, arbeitet vor allem mit TypeScript, Node.js und PostgreSQL und hat Services nach Kubernetes migriert.',
      reason: 'Die Anzeige verlangt TypeScript, PostgreSQL, AWS und Kubernetes. Der Lebenslauf ist auf Deutsch und folgt dem DACH-Aufbau.',
    },
    {
      section: 'Sprachen',
      original: 'German: B2',
      updated: 'Deutsch: B2',
      reason: 'Die Anzeige verlangt mindestens B2. Die Angabe stammt unverändert aus Ihrem Lebenslauf.',
    },
  ],
  letter: (date) => {
    const structured: Letter['structured'] = {
      version: 2,
      language: 'de',
      market: 'dach',
      sender: { name: NAME, addressLines: ['1200 Sample Street', '78701 Austin, TX', 'USA'], phone: PERSONAL.phone, email: PERSONAL.email },
      recipient: { companyName: 'Fjordwerk GmbH', contactPerson: 'Frau Sabine Köhler', department: 'Personalleitung', addressLines: ['Musterstraße 118', '10119 Berlin'] },
      place: 'Austin',
      date: longDate('de', date),
      subject: 'Bewerbung als Senior Backend Engineer (m/w/d), Kennziffer FW-2026-114',
      salutation: 'Sehr geehrte Frau Köhler,',
      paragraphs: [
        'mit großem Interesse habe ich Ihre Anzeige für die Position als Senior Backend Engineer (m/w/d) gelesen. Ihr Backend-Team verantwortet die Dienste, auf denen Ihre Produkte laufen. An solchen Plattformen arbeite ich seit mehreren Jahren.',
        'Bei Brightwave Systems leite ich ein Team aus 4 Entwicklern, das die API der Abrechnungsplattform mit 1,2 Mio. Anfragen pro Tag betreibt. Durch neu gestaltete PostgreSQL-Abfragen und Redis-Caching habe ich die p95-Latenz von 480 ms auf 190 ms gesenkt. Außerdem habe ich 14 Services von einer einzelnen VM auf Kubernetes (AWS EKS) migriert und die Deployment-Zeit von 40 auf 9 Minuten reduziert.',
        'Zuvor habe ich bei Lantern Analytics einen Ingestion-Service in TypeScript und Node.js entwickelt, der 30 GB Ereignisdaten pro Tag verarbeitet. Meine Deutschkenntnisse liegen auf dem Niveau B2.',
        'Über die Einladung zu einem Gespräch freue ich mich.',
      ],
      closing: 'Mit freundlichen Grüßen',
      signatureName: NAME,
    };
    return { structured, body: letterText(structured) };
  },
};

// ---------------------------------------------------------------------------
// SQL builders
// ---------------------------------------------------------------------------

/** The tailored CV as the writer stores it in `_optimizedCVData` (string dates, `items` in skill groups), not the StructuredCV shape. */
function optimizedCvData(cv: FixtureCv, app: Fixture) {
  return {
    personal: {
      fullName: cv.personal.fullName,
      email: cv.personal.email,
      phone: cv.personal.phone,
      currentTitle: cv.personal.currentTitle,
      address: cv.personal.address,
      city: cv.personal.city,
      country: cv.personal.country,
      linkedIn: cv.personal.linkedIn,
      github: cv.personal.github,
    },
    summary: cv.summary,
    experience: cv.experience.map((job) => ({
      id: job.id,
      company: job.company,
      position: job.position,
      location: job.location,
      startDate: job.startDate.raw,
      endDate: job.endDate?.raw,
      current: job.current,
      bullets: job.bullets,
    })),
    education: cv.education.map((edu) => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      location: edu.location,
      startDate: edu.startDate?.raw,
      endDate: edu.endDate?.raw,
    })),
    skills: cv.skills.map((group) => ({ category: group.category, items: group.skills })),
    languages: cv.languages.map((language) => ({ language: language.language, proficiency: language.proficiency })),
    certifications: cv.certifications.map((cert) => ({ id: cert.id, name: cert.name, issuer: cert.issuer, date: cert.date?.raw })),
    projects: [],
    customSections: [],
    analysis: {
      summary: app.changes[0]?.reason ?? '',
      key_changes: app.changes.map((change) => change.reason),
      ats_compatibility: app.score,
      missing_keywords_added: [],
    },
    sectionHeaders: cv.sectionHeaders,
    localizedStrings: cv.localizedStrings,
    additionalInfo: [],
  };
}

function applicationSql(userId: string, app: Fixture, now: string, nowDate: Date): string {
  const cv = buildCv(app.lang, now);
  const letter = app.letter(nowDate);
  const content = cvPlainText(cv, app.lang);
  const generatedCv = {
    content,
    changes: app.changes,
    optimizedFor: app.title,
    _optimizedCVData: optimizedCvData(cv, app),
    _screeningAnswers: [],
    _screeningUsageCount: 0,
  };
  const coverLetter = {
    applicantAddress: { name: '', street: '', city: '', country: '', phone: '', email: '' },
    date: '',
    companyAddress: { companyName: '', street: '' },
    salutation: '',
    closing: '',
    signatureName: '',
    body: letter.body,
    updatedAt: now,
    structured: letter.structured,
  };
  const email = { subject: app.email.subject, body: app.email.body, attachmentNote: app.lang === 'en' ? 'Please find my CV and cover letter attached.' : 'Anbei finden Sie meinen Lebenslauf und mein Anschreiben.' };
  const followUp = { subject: app.followUp.subject, body: app.followUp.body, recommendedDelay: app.followUp.recommendedDelay };
  const requirements = {
    title: app.title,
    company: app.company,
    hardSkills: app.requirements.hardSkills,
    softSkills: [],
    experienceLevel: 'senior',
    keywords: [],
    responsibilities: app.requirements.responsibilities,
    niceToHave: app.requirements.niceToHave,
    location: app.requirements.location,
    workType: app.requirements.workType,
    detectedLanguage: app.lang,
  };
  const gaps = {
    matchScore: app.score,
    matchingSkills: app.matching,
    missingSkills: app.missing,
    matchingExperience: [],
    missingExperience: [],
    suggestions: [],
  };
  const fit = { fitLevel: app.fitLevel, score: app.score, assessment: app.assessment, matchingSkills: app.matching, missingSkills: app.missing };
  const artifacts = {
    job: { title: app.title, companyName: app.company, requiredSkills: app.requirements.hardSkills, niceToHaveSkills: app.requirements.niceToHave, responsibilities: app.requirements.responsibilities, location: app.requirements.location, workType: app.requirements.workType },
    match: { score: app.score, matchedRequirements: app.matching, missingSkills: app.missing },
    optimizedCVData: optimizedCvData(cv, app),
    coverLetter: letter.body,
    coverLetterStructured: letter.structured,
    applicationEmail: { subject: email.subject, body: email.body },
    followUpEmail: followUp,
    detectedLanguage: app.lang,
  };
  return `INSERT INTO application_sessions (
  id, user_id, job_title, company, job_description, job_url, match_score, matching_skills, missing_skills, suggestions,
  requirements, gaps, generated_cv, cover_letter, email, company_address, company_contact_person, cv_edits,
  optimized_cv_text, email_subject, email_body, selected_template, status, cover_letter_language, fit_assessment,
  generation_completed, generation_status, generation_completed_at, follow_up_email, generated_artifacts,
  screening_turns_used, prep_turns_used, revision, created_at, updated_at
) VALUES (
  ${sqlText(app.id)}, ${sqlText(userId)}, ${sqlText(app.title)}, ${sqlText(app.company)}, ${sqlText(app.jobDescription)}, ${sqlText(app.jobUrl)},
  ${sqlNum(app.score)}, ${sqlJson(app.matching)}, ${sqlJson(app.missing)}, '[]',
  ${sqlJson(requirements)}, ${sqlJson(gaps)}, ${sqlJson(generatedCv)}, ${sqlJson(coverLetter)}, ${sqlJson(email)},
  ${sqlText(app.companyAddress)}, ${sqlText(app.contactPerson)}, '[]',
  ${sqlText(content)}, ${sqlText(email.subject)}, ${sqlText(email.body)}, ${sqlText(app.template)}, ${sqlText(app.status)}, ${sqlText(app.lang)}, ${sqlJson(fit)},
  1, 'succeeded', ${sqlText(now)}, ${sqlJson(followUp)}, ${sqlJson(artifacts)},
  0, 0, 1, ${sqlText(now)}, ${sqlText(now)}
);`;
}

function primaryCvSql(userId: string, now: string): string {
  const cv = buildCv('en', now);
  const raw = cvPlainText(cv, 'en');
  const skills = cv.skills.flatMap((group) => group.skills);
  const experiences = cv.experience.map((job) => `${job.position}, ${job.company}`);
  const education = cv.education.map((edu) => `${edu.degree}, ${edu.institution}`);
  return `INSERT INTO documents (id, user_id, type, file_name, file_type, file_size, raw_text, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
VALUES (${sqlText('d0000000-0000-4000-8000-00000000d001')}, ${sqlText(userId)}, 'primary_cv', 'jordan-whitfield-sample-cv.txt', 'txt', ${raw.length}, ${sqlText(raw)}, '{}', ${sqlJson(skills)}, ${sqlJson(experiences)}, ${sqlJson(education)}, ${sqlJson(cv)}, ${sqlText(now)}, ${sqlText(now)});`;
}

function jobFeedSql(userId: string, now: string): string {
  return `INSERT OR REPLACE INTO job_feed_settings (
  user_id, enabled, consent_accepted_at, user_timezone, target_market, target_countries, target_cities, target_roles,
  preferred_locations, remote_preference, remote_preferences, salary_floor, languages, seniority_target, seniority_targets,
  employment_types, work_authorization_status, user_skills, excluded_terms, created_at, updated_at
) VALUES (
  ${sqlText(userId)}, 1, ${sqlText(now)}, 'America/Chicago', 'us', ${sqlJson(['us'])}, ${sqlJson(['Austin'])},
  ${sqlJson(['Senior Software Engineer', 'Staff Software Engineer', 'Platform Engineer'])},
  ${sqlJson(['Austin, TX', 'Remote'])}, 'flexible', ${sqlJson(['hybrid', 'remote_first'])}, 150000, ${sqlJson(['English'])}, 'senior', ${sqlJson(['senior', 'staff'])},
  ${sqlJson(['full_time'])}, 'authorized', ${sqlJson(['TypeScript', 'PostgreSQL', 'AWS', 'Kubernetes', 'Terraform'])}, '[]', ${sqlText(now)}, ${sqlText(now)}
);`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafeCredentialsPath(args.credentialsOut);

  console.log(`Target: ${args.baseUrl}`);
  console.log(`Database: ${DB_NAME} (${args.remote ? 'REMOTE' : 'local'})`);
  if (args.remote) {
    console.log('--remote was passed: this writes to the live database for the reviewer account only.');
  } else if (!isLocalUrl(args.baseUrl)) {
    fail('A non-local --base-url needs --remote, so sign-up and the data writes hit the same environment.');
  }

  const existing = d1Rows<{ id: string }>(`SELECT id FROM user WHERE email = ${sqlText(args.email)}`, args.remote)[0];

  // Reuse the account when the stored password still signs in. Otherwise start clean.
  let password = readCredentials(args.credentialsOut, args.email)?.password ?? null;
  let userId: string | null = null;
  if (existing && password && (await signIn(args.baseUrl, args.email, password))) {
    userId = existing.id;
    console.log('Existing reviewer account found, sign-in works. Refreshing its data.');
  } else {
    if (existing) {
      console.log('Existing reviewer account found, but the credentials file does not sign in. Recreating the account.');
      d1Exec(
        `DELETE FROM profiles WHERE id = ${sqlText(existing.id)};\nDELETE FROM user WHERE id = ${sqlText(existing.id)};`,
        args.remote,
      );
    }
    password = generatePassword();
    writeCredentials(args.credentialsOut, args.baseUrl, args.email, password);
    userId = await signUp(args.baseUrl, args.email, password, NAME);
    console.log('Reviewer account created through the sign-up endpoint.');
  }

  // Current balance, for the ledger row.
  const creditsRow = d1Rows<{ total: number }>(
    `SELECT monthly_credits + rollover_credits + addon_credits AS total FROM user_credits WHERE user_id = ${sqlText(userId)}`,
    args.remote,
  )[0];
  const before = creditsRow?.total ?? 0;
  const delta = args.credits - before;

  const nowDate = new Date();
  const now = nowDate.toISOString();
  const u = sqlText(userId);
  const statements: string[] = [
    `UPDATE user SET email_verified = 1, name = ${sqlText(NAME)} WHERE id = ${u};`,
    `UPDATE profiles SET full_name = ${sqlText(NAME)}, phone = ${sqlText(PERSONAL.phone)}, location = 'Austin, TX', linkedin_url = ${sqlText(PERSONAL.linkedIn)}, github_url = ${sqlText(PERSONAL.github)}, timezone = 'America/Chicago', mcp_daily_credit_limit = 20, updated_at = ${sqlText(now)} WHERE id = ${u};`,
    `INSERT OR IGNORE INTO user_credits (id, user_id, plan_tier, version, created_at, updated_at) VALUES (${sqlText(randomUUID())}, ${u}, 'free', 0, ${sqlText(now)}, ${sqlText(now)});`,
    `UPDATE user_credits SET monthly_credits = ${args.credits}, rollover_credits = 0, addon_credits = 0, version = version + 1, updated_at = ${sqlText(now)} WHERE user_id = ${u};`,
  ];
  if (delta !== 0) {
    statements.push(
      `INSERT INTO credit_transactions (id, user_id, amount, transaction_type, transaction_kind, description, metadata, balance_before, balance_after, created_at)
VALUES (${sqlText(randomUUID())}, ${u}, ${delta}, 'reviewer_grant', 'grant', 'Reviewer account top-up', '{}', ${before}, ${args.credits}, ${sqlText(now)});`,
    );
  }
  statements.push(
    `DELETE FROM application_sessions WHERE user_id = ${u};`,
    `DELETE FROM documents WHERE user_id = ${u};`,
    primaryCvSql(userId, now),
    applicationSql(userId, US_APP, now, nowDate),
    applicationSql(userId, DE_APP, now, nowDate),
    jobFeedSql(userId, now),
  );
  d1Exec(`${statements.join('\n')}\n`, args.remote);

  // Read back, so a silent partial write fails loudly.
  const check = d1Rows<{ apps: number; docs: number; credits: number; verified: number; consent: number }>(
    `SELECT
       (SELECT COUNT(*) FROM application_sessions WHERE user_id = ${u} AND generation_status = 'succeeded' AND cover_letter IS NOT NULL AND email IS NOT NULL AND follow_up_email IS NOT NULL AND generated_cv IS NOT NULL AND fit_assessment IS NOT NULL) AS apps,
       (SELECT COUNT(*) FROM documents WHERE user_id = ${u} AND type = 'primary_cv') AS docs,
       (SELECT monthly_credits + rollover_credits + addon_credits FROM user_credits WHERE user_id = ${u}) AS credits,
       (SELECT email_verified FROM user WHERE id = ${u}) AS verified,
       (SELECT COUNT(*) FROM job_feed_settings WHERE user_id = ${u} AND consent_accepted_at IS NOT NULL) AS consent`,
    args.remote,
  )[0];
  if (!check || check.apps !== 2 || check.docs !== 1 || check.credits !== args.credits || check.verified !== 1 || check.consent !== 1) {
    fail(`Read-back check failed: ${JSON.stringify(check)}`);
  }
  if (!(await signIn(args.baseUrl, args.email, password))) fail('Read-back sign-in failed');

  console.log(`Seeded ${args.email}: 2 applications with full kits, 1 primary CV, ${check.credits} credits, feed consent on, email verified, sign-in works.`);
  console.log(`Credentials file: ${args.credentialsOut} (mode 0600). The password is not printed.`);
}

main().catch((error: unknown) => {
  console.error('seed-reviewer-account failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
