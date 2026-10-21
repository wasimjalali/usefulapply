/**
 * Seed (or refresh) the directory reviewer account.
 *
 *   npx tsx scripts/seed-reviewer-account.ts \
 *     --base-url http://localhost:8797 \
 *     --credentials-out /path/outside/the/repo/reviewer.json \
 *     [--email reviewer@usefulapply.com] [--credits 200] [--remote --yes-production]
 *
 * Safety: --email must match reviewer@usefulapply.com or reviewer+<label>@usefulapply.com, and the
 * delete path re-checks the stored email before it deletes anything. --remote (the live database)
 * needs --yes-production as well, and the script prints what it is about to do first.
 *
 * What it does, in order:
 *   1. Signs the reviewer up through the app's own sign-up endpoint on --base-url
 *      (so the password hash is the real one), or reuses the account when the
 *      credentials file still signs in.
 *   2. Marks the email verified and writes everything else through
 *      `wrangler d1 execute usefulapply-db` (--local unless --remote is passed):
 *      profile and a Max plan (no Stripe ids), credits plus a ledger row, a primary CV,
 *      one US and one German application with a stored kit, fit result and chat
 *      history, job feed consent, a career profile, a confirmed search strategy and a
 *      few ranked feed items. Dates are stamped from the run date: ranked matches are
 *      new, one follow-up is due, one interview is 5 days out, so morning_briefing has content.
 *
 * Plan survival: the account is Max in profiles, user_credits and subscriptions, with
 * `user_credits.subscription_status` NULL and no Stripe ids. The daily sweep
 * (`processOverdueMonthlyResets`) only touches paid rows whose subscription_status is
 * 'active', so it never selects this one, and no Stripe webhook can match it. Nothing
 * refills credits or downgrades the plan. Re-run the seed to top credits back up.
 *
 * The kits are stored data, not model output. Everyone and everything in them is
 * fictional. The account has no MFA (the product has none).
 *
 * The generated password is never printed. It is written only to
 * --credentials-out (mode 0600), which must be outside the repo or gitignored.
 * Re-running refreshes the data to the same state. Only this one user's rows are
 * touched: every fixture primary key (documents, applications, chat, feed run, ranked items,
 * canonical jobs) is derived from the reviewer's user id, so several reviewer accounts coexist.
 * Shared feed postings are namespaced `reviewer-seed:<userId>:<key>`, upserted and never deleted
 * while another account references them. If the credentials file is missing or stale, the
 * reviewer user is deleted (cascading its own rows) and created again with a new password.
 */
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
  yesProduction: boolean;
}

/** The only addresses this script will ever create, refresh or delete. */
const REVIEWER_EMAIL = /^reviewer(\+[a-z0-9._-]+)?@usefulapply\.com$/;

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  let remote = false;
  let yesProduction = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--remote') remote = true;
    else if (arg === '--yes-production') yesProduction = true;
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
  if (!REVIEWER_EMAIL.test(email)) fail(`--email must be reviewer@usefulapply.com or reviewer+<label>@usefulapply.com, got ${email}. This script only manages reviewer accounts.`);
  const credits = Number(values.get('credits') ?? 200);
  if (!Number.isFinite(credits) || credits < 0 || credits > 1000) fail('--credits must be a number from 0 to 1000');
  if (remote && !yesProduction) fail('--remote writes to the production database. Add --yes-production to confirm.');
  if (yesProduction && !remote) fail('--yes-production only makes sense together with --remote.');
  return { baseUrl, credentialsOut: resolve(credentialsOut), email, credits, remote, yesProduction };
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

/**
 * A UUID-shaped id derived from the reviewer's user id, so two reviewer accounts never share a
 * primary key and a re-seed of one account reproduces its own ids.
 */
function seedId(userId: string, label: string): string {
  const hex = createHash('sha256').update(`reviewer-seed:${userId}:${label}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
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
  /** Stable label the application id is derived from (see seedId). */
  key: string;
  title: string;
  company: string;
  jobUrl: string;
  jobDescription: string;
  lang: Lang;
  template: string;
  status: 'applied' | 'interview';
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
  key: 'us-application',
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
  key: 'de-application',
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
  status: 'interview',
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

function applicationId(userId: string, app: Fixture): string {
  return seedId(userId, `application:${app.key}`);
}

function primaryCvDocumentId(userId: string): string {
  return seedId(userId, 'document:primary-cv');
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
  // One date per status, as the tracker writes them (see datesFor in chat-tools/write-tools.ts):
  // applied keeps a follow-up date, interview keeps an interview date. The follow-up is already due
  // (morning_briefing lists follow-ups due or overdue, so "tomorrow" would not show up). The interview
  // is 5 days out, inside the briefing's 7-day window for the whole review. Reminder emails are marked
  // sent so the daily cron never mails the reviewer inbox about fixture dates.
  const followUpDueAt = app.status === 'applied' ? new Date(nowDate.getTime() - 60 * 60 * 1000).toISOString() : null;
  const interviewAt = app.status === 'interview' ? new Date(nowDate.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString() : null;
  return `INSERT INTO application_sessions (
  id, user_id, job_title, company, job_description, job_url, match_score, matching_skills, missing_skills, suggestions,
  requirements, gaps, generated_cv, cover_letter, email, company_address, company_contact_person, cv_edits,
  optimized_cv_text, email_subject, email_body, selected_template, status, cover_letter_language, fit_assessment,
  generation_completed, generation_status, generation_completed_at, follow_up_email, generated_artifacts,
  screening_turns_used, prep_turns_used, revision, interview_at, follow_up_due_at, interview_reminder_sent_at,
  follow_up_reminder_sent_at, created_at, updated_at
) VALUES (
  ${sqlText(applicationId(userId, app))}, ${sqlText(userId)}, ${sqlText(app.title)}, ${sqlText(app.company)}, ${sqlText(app.jobDescription)}, ${sqlText(app.jobUrl)},
  ${sqlNum(app.score)}, ${sqlJson(app.matching)}, ${sqlJson(app.missing)}, '[]',
  ${sqlJson(requirements)}, ${sqlJson(gaps)}, ${sqlJson(generatedCv)}, ${sqlJson(coverLetter)}, ${sqlJson(email)},
  ${sqlText(app.companyAddress)}, ${sqlText(app.contactPerson)}, '[]',
  ${sqlText(content)}, ${sqlText(email.subject)}, ${sqlText(email.body)}, ${sqlText(app.template)}, ${sqlText(app.status)}, ${sqlText(app.lang)}, ${sqlJson(fit)},
  1, 'succeeded', ${sqlText(now)}, ${sqlJson(followUp)}, ${sqlJson(artifacts)},
  0, 0, 1, ${sqlText(interviewAt)}, ${sqlText(followUpDueAt)}, ${sqlText(interviewAt ? now : null)},
  ${sqlText(followUpDueAt ? now : null)}, ${sqlText(now)}, ${sqlText(now)}
);`;
}

function primaryCvSql(userId: string, now: string): string {
  const cv = buildCv('en', now);
  const raw = cvPlainText(cv, 'en');
  const skills = cv.skills.flatMap((group) => group.skills);
  const experiences = cv.experience.map((job) => `${job.position}, ${job.company}`);
  const education = cv.education.map((edu) => `${edu.degree}, ${edu.institution}`);
  return `INSERT INTO documents (id, user_id, type, file_name, file_type, file_size, raw_text, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
VALUES (${sqlText(primaryCvDocumentId(userId))}, ${sqlText(userId)}, 'primary_cv', 'jordan-whitfield-sample-cv.txt', 'txt', ${raw.length}, ${sqlText(raw)}, '{}', ${sqlJson(skills)}, ${sqlJson(experiences)}, ${sqlJson(education)}, ${sqlJson(cv)}, ${sqlText(now)}, ${sqlText(now)});`;
}

/** The reviewer's feed settings. One object feeds both the settings row and the strategy hash. */
const FEED_SETTINGS = {
  target_market: 'us',
  target_countries: ['us'],
  target_cities: ['Austin'],
  target_roles: ['Senior Software Engineer', 'Staff Software Engineer', 'Platform Engineer'],
  preferred_locations: ['Austin, TX', 'Remote'],
  remote_preference: 'flexible',
  remote_preferences: ['hybrid', 'remote_first'],
  salary_floor: 150000,
  languages: ['English'],
  seniority_target: 'senior',
  seniority_targets: ['senior', 'staff'],
  employment_types: ['full_time'],
  user_skills: ['TypeScript', 'PostgreSQL', 'AWS', 'Kubernetes', 'Terraform'],
};

/** Mirrors computeSettingsHash in src/lib/job-feed/search-strategy.ts (the strategy row key). */
function feedSettingsHash(): string {
  const f = FEED_SETTINGS;
  const material = {
    target_countries: [...f.target_countries].sort(),
    target_cities: [...f.target_cities].sort(),
    target_roles: [...f.target_roles].sort(),
    preferred_locations: [...f.preferred_locations].sort(),
    seniority_targets: [...f.seniority_targets].sort(),
    seniority_target: f.seniority_target,
    employment_types: [...f.employment_types].sort(),
    languages: [...f.languages].sort(),
    target_market: f.target_market,
    remote_preferences: [...f.remote_preferences].sort(),
    remote_preference: f.remote_preference,
  };
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 16);
}

function jobFeedSql(userId: string, now: string): string {
  const f = FEED_SETTINGS;
  return `INSERT OR REPLACE INTO job_feed_settings (
  user_id, enabled, consent_accepted_at, user_timezone, target_market, target_countries, target_cities, target_roles,
  preferred_locations, remote_preference, remote_preferences, salary_floor, languages, seniority_target, seniority_targets,
  employment_types, work_authorization_status, user_skills, excluded_terms, created_at, updated_at
) VALUES (
  ${sqlText(userId)}, 1, ${sqlText(now)}, 'America/Chicago', ${sqlText(f.target_market)}, ${sqlJson(f.target_countries)}, ${sqlJson(f.target_cities)},
  ${sqlJson(f.target_roles)},
  ${sqlJson(f.preferred_locations)}, ${sqlText(f.remote_preference)}, ${sqlJson(f.remote_preferences)}, ${f.salary_floor}, ${sqlJson(f.languages)}, ${sqlText(f.seniority_target)}, ${sqlJson(f.seniority_targets)},
  ${sqlJson(f.employment_types)}, 'authorized', ${sqlJson(f.user_skills)}, '[]', ${sqlText(now)}, ${sqlText(now)}
);`;
}

/**
 * The stored career profile (schema version 2, src/lib/job-feed/career-profile.ts) and a user-confirmed
 * search strategy (version 1, src/lib/job-feed/search-strategy.ts), so get_career_profile returns data
 * instead of no_profile. It is stored data, written from the fictional CV above. The strategy is marked
 * userConfirmed, so daily feed runs reuse it and never ask a model to regenerate it. The profile's
 * source document is the seeded primary CV, stamped with the same time, so the CV never reads as newer.
 */
function careerSql(userId: string, now: string): string {
  const profile = {
    version: 2,
    generatedAt: now,
    function: 'engineering',
    inferredTitles: [
      { canonical: 'Senior Software Engineer', confidence: 'high', rationale: 'Current title at Brightwave Systems, with 8 years of backend experience.' },
      { canonical: 'Platform Engineer', confidence: 'high', rationale: 'Moved 14 services to Kubernetes on AWS EKS and introduced shared Terraform modules.' },
      { canonical: 'Backend Engineer', confidence: 'medium', rationale: 'Built and tuned PostgreSQL-backed APIs and a Node.js ingestion service.' },
    ],
    seniority: { level: 'senior', confidence: 'high', rationale: 'Leads a team of 4 and owns the billing platform API.' },
    targetDirection: {
      aspirationalTitles: ['Staff Platform Engineer'],
      pivot: null,
      confidence: 'medium',
      rationale: 'The most recent role moved from building services to leading a team and shared infrastructure.',
    },
    yearsTotal: 8,
    yearsInFunction: 8,
    primarySkillClusters: [
      { name: 'backend services', skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Redis'], evidenceStrength: 'strong' },
      { name: 'cloud platform and infrastructure', skills: ['AWS', 'Kubernetes', 'Terraform', 'Docker', 'GitHub Actions'], evidenceStrength: 'strong' },
    ],
    secondarySkillClusters: [
      { name: 'data processing', skills: ['Python', 'SQL'], evidenceStrength: 'moderate' },
      { name: 'web frontend', skills: ['React', 'JavaScript'], evidenceStrength: 'mentioned' },
    ],
    industryDomains: ['billing and payments', 'data analytics'],
    toolsEnvironment: ['AWS', 'Kubernetes', 'Terraform', 'PostgreSQL', 'Redis', 'GitHub Actions'],
    workingLanguages: ['TypeScript', 'JavaScript', 'Python', 'SQL'],
    narrative:
      'Senior backend and platform engineer with 8 years of experience. Leads a team of 4 on a billing platform API that serves 1.2M requests per day. Cut p95 latency from 480 ms to 190 ms and moved 14 services to Kubernetes on AWS EKS. Works mostly in TypeScript, Node.js and PostgreSQL, with Terraform for infrastructure. Looks like a fit for platform and infrastructure roles at senior and staff level.',
    negativeSignals: ['Frontend-only roles', 'Mobile engineering', 'Machine learning research', 'Junior or intern roles'],
  };
  const query = (type: string, text: string, rationale: string, expectedRecall: string, fallbackTo: number | null) => ({
    type, query: text, targetCountry: 'us', rationale, expectedRecall, fallbackTo,
  });
  const strategy = {
    version: 1,
    generatedAt: now,
    sourceProfileGeneratedAt: now,
    userConfirmed: true,
    queries: [
      query('short_tail', 'Platform Engineer', 'Canonical title for the Kubernetes and Terraform work.', 'high', null),
      query('short_tail', 'Senior Software Engineer', 'Current title, broad recall.', 'high', null),
      query('long_tail', 'Senior Backend Engineer TypeScript PostgreSQL', 'Primary backend cluster for precision.', 'medium', 1),
      query('long_tail', 'Staff Platform Engineer Kubernetes AWS', 'Where the career is heading, on the cloud platform cluster.', 'medium', 0),
    ],
    negativeTerms: profile.negativeSignals,
  };
  return `DELETE FROM user_career_profiles WHERE user_id = ${sqlText(userId)};
DELETE FROM user_search_strategies WHERE user_id = ${sqlText(userId)};
INSERT INTO user_career_profiles (user_id, profile, version, source_document_id, source_document_updated_at, model_provider, model_name, created_at, updated_at)
VALUES (${sqlText(userId)}, ${sqlJson(profile)}, 2, ${sqlText(primaryCvDocumentId(userId))}, ${sqlText(now)}, 'seed', 'reviewer-fixture', ${sqlText(now)}, ${sqlText(now)});
INSERT INTO user_search_strategies (user_id, settings_hash, strategy, version, source_profile_generated_at, model_provider, model_name, created_at, updated_at)
VALUES (${sqlText(userId)}, ${sqlText(feedSettingsHash())}, ${sqlJson(strategy)}, 1, ${sqlText(now)}, 'seed', 'reviewer-fixture', ${sqlText(now)}, ${sqlText(now)});`;
}

/**
 * The chat history a real fit-then-kit session leaves behind. The dashboard shows its "saved job" starter
 * (with the 0.5-credit "Analyze this job description" chip) only while an application has no chat messages,
 * so a seeded application needs these rows to look finished. Wording follows useAgentWorkflow.ts
 * (formatFitAnalysisMessage and kitReadyMessage).
 */
function chatSql(userId: string, app: Fixture, nowDate: Date): string {
  const fitLabel = app.fitLevel === 'strong' ? 'Strong Fit' : 'Good Fit';
  const fitEmoji = app.fitLevel === 'strong' ? '🟢' : '🟡';
  const fitText = [
    `${fitEmoji} **${fitLabel}**`,
    `**Role:** ${app.title} at ${app.company}`,
    `**Match score:** ${app.score}%`,
    app.assessment,
    'If you want to move forward, generate the full application below.',
  ].join('\n\n');
  const kitText = `Your kit for ${app.company} is ready (ATS ${app.score}%): a tailored CV, a cover letter and two emails. Every claim comes from your CV. Review it before you send.`;
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: 'Analyze this job description' },
    { role: 'assistant', content: fitText },
    { role: 'user', content: 'Apply for This Job' },
    { role: 'assistant', content: kitText },
  ];
  return messages
    .map((message, index) => {
      const at = new Date(nowDate.getTime() - (messages.length - index) * 60_000).toISOString();
      return `INSERT INTO chat_messages (id, session_id, user_id, role, content, actions, created_at)
VALUES (${sqlText(seedId(userId, `chat:${app.key}:${index}`))}, ${sqlText(applicationId(userId, app))}, ${sqlText(userId)}, ${sqlText(message.role)}, ${sqlText(message.content)}, '[]', ${sqlText(at)});`;
    })
    .join('\n');
}

interface FeedJob {
  key: string;
  title: string;
  company: string;
  location: string;
  workMode: 'remote' | 'hybrid' | 'onsite';
  salaryMin: number;
  salaryMax: number;
  fit: 'strong' | 'good';
  reason: string;
  description: string;
}

/** Canonical keys are `reviewer-seed:<userId>:<job key>`, so each reviewer owns its own postings. */
const FEED_KEY_PREFIX = 'reviewer-seed:';

function feedKeyNamespace(userId: string): string {
  return `${FEED_KEY_PREFIX}${userId}:`;
}

/** Fictional postings, owned by one reviewer through the namespaced canonical key. */
const FEED_JOBS: FeedJob[] = [
  {
    key: 'meridian-freight-staff-platform',
    title: 'Staff Platform Engineer',
    company: 'Meridian Freight Systems',
    location: 'Austin, TX',
    workMode: 'hybrid',
    salaryMin: 185000,
    salaryMax: 215000,
    fit: 'strong',
    reason: 'Platform work on Kubernetes and AWS, with TypeScript and PostgreSQL. Matches your billing platform and EKS migration experience.',
    description: 'Meridian Freight Systems is hiring a Staff Platform Engineer to own the deployment and runtime platform for our routing services. You will lead a small team, run services on Kubernetes on AWS, manage infrastructure in Terraform and tune PostgreSQL-backed APIs. Requirements: 8+ years of backend experience, TypeScript or Go, Kubernetes, AWS. (Sample posting for the Useful Apply reviewer account. Meridian Freight Systems is fictional.)',
  },
  {
    key: 'orchard-health-senior-backend',
    title: 'Senior Backend Engineer',
    company: 'Orchard Health Labs',
    location: 'Remote (US)',
    workMode: 'remote',
    salaryMin: 160000,
    salaryMax: 190000,
    fit: 'strong',
    reason: 'TypeScript, Node.js and PostgreSQL on AWS, remote in the US. Close to your current stack.',
    description: 'Orchard Health Labs builds scheduling software for clinics. As a Senior Backend Engineer you will design APIs in TypeScript and Node.js, own PostgreSQL schemas and keep our AWS services reliable. Requirements: 6+ years of backend experience, strong PostgreSQL, CI/CD. (Sample posting for the Useful Apply reviewer account. Orchard Health Labs is fictional.)',
  },
  {
    key: 'tallgrass-data-senior-infra',
    title: 'Senior Software Engineer, Infrastructure',
    company: 'Tallgrass Data',
    location: 'Dallas, TX',
    workMode: 'hybrid',
    salaryMin: 155000,
    salaryMax: 185000,
    fit: 'good',
    reason: 'Infrastructure and data pipeline work. Your ingestion service and Terraform modules apply, Go is a gap.',
    description: 'Tallgrass Data runs event pipelines for retail analytics. The Infrastructure team needs a Senior Software Engineer to build ingestion services, manage Terraform and run Kubernetes clusters. Requirements: 6+ years of experience, Python or Go, AWS, Terraform. (Sample posting for the Useful Apply reviewer account. Tallgrass Data is fictional.)',
  },
  {
    key: 'bluepeak-mobility-platform',
    title: 'Platform Engineer',
    company: 'Bluepeak Mobility',
    location: 'Remote (US)',
    workMode: 'remote',
    salaryMin: 150000,
    salaryMax: 180000,
    fit: 'good',
    reason: 'Kubernetes, AWS and CI/CD in a remote platform team. Fewer leadership duties than your current role.',
    description: 'Bluepeak Mobility is looking for a Platform Engineer to improve deploy tooling and cluster reliability for our fleet software. Requirements: 5+ years of experience, Kubernetes, AWS, GitHub Actions or similar CI/CD. (Sample posting for the Useful Apply reviewer account. Bluepeak Mobility is fictional.)',
  },
  {
    key: 'copperline-financial-payments',
    title: 'Senior Software Engineer, Payments',
    company: 'Copperline Financial',
    location: 'Austin, TX',
    workMode: 'hybrid',
    salaryMin: 170000,
    salaryMax: 200000,
    fit: 'good',
    reason: 'Payments APIs on PostgreSQL and AWS. Your billing platform experience transfers directly.',
    description: 'Copperline Financial is hiring a Senior Software Engineer for its payments team. You will build and operate APIs that move money between accounts, with strong correctness and latency goals. Requirements: 6+ years of backend experience, PostgreSQL, TypeScript or Java, AWS. (Sample posting for the Useful Apply reviewer account. Copperline Financial is fictional.)',
  },
];

/** The date in `America/Chicago`, `daysAgo` days back, as YYYY-MM-DD (the shape of job_feed_runs.local_date). */
function chicagoDate(nowDate: Date, daysAgo: number): string {
  const shifted = new Date(nowDate.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(shifted);
}

/**
 * One completed run from yesterday (Chicago time) with 5 ranked items. Yesterday, so today's
 * "run my feed" is still allowed for a reviewer, and these items sit in the inbox backlog.
 */
function feedItemsSql(userId: string, now: string, nowDate: Date): string {
  const runId = seedId(userId, 'feed-run');
  const namespace = feedKeyNamespace(userId);
  const lines: string[] = [
    // Only this user's runs and feedback go. Ranked items cascade from the run. Canonical postings are
    // upserted below and never deleted here, so another account's ranked items and feedback survive.
    `DELETE FROM job_feed_runs WHERE user_id = ${sqlText(userId)};`,
    `DELETE FROM job_feed_feedback WHERE user_id = ${sqlText(userId)};`,
    `INSERT INTO job_feed_runs (id, user_id, local_date, local_timezone, trigger_source, status, idempotency_key, started_at, completed_at, result_summary, raw_jobs_fetched, jobs_after_prefilter, ranked_jobs_count, metadata, created_at, updated_at)
VALUES (${sqlText(runId)}, ${sqlText(userId)}, ${sqlText(chicagoDate(nowDate, 1))}, 'America/Chicago', 'manual', 'completed', ${sqlText(`reviewer-seed-run:${userId}`)}, ${sqlText(now)}, ${sqlText(now)}, 'Sample run for the reviewer account', ${FEED_JOBS.length}, ${FEED_JOBS.length}, ${FEED_JOBS.length}, '{}', ${sqlText(now)}, ${sqlText(now)});`,
  ];
  FEED_JOBS.forEach((job, index) => {
    const jobId = seedId(userId, `feed-job:${job.key}`);
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    lines.push(
      // The key is namespaced by user id, so the upsert can only ever hit this reviewer's own posting.
      `INSERT INTO job_feed_canonical_jobs (id, canonical_key, source_provider, source_job_id, title, title_normalized, company, company_normalized, location_text, location_normalized, work_mode, employment_type, salary_text, salary_min, salary_max, salary_currency, description, apply_url, source_url, posted_at_text, freshness_days, source_identifiers, first_seen_at, last_seen_at, created_at, updated_at)
VALUES (${sqlText(jobId)}, ${sqlText(`${namespace}${job.key}`)}, 'reviewer-seed', ${sqlText(job.key)}, ${sqlText(job.title)}, ${sqlText(normalize(job.title))}, ${sqlText(job.company)}, ${sqlText(normalize(job.company))}, ${sqlText(job.location)}, ${sqlText(normalize(job.location))}, ${sqlText(job.workMode)}, 'full_time', ${sqlText(`USD ${job.salaryMin.toLocaleString('en-US')} to ${job.salaryMax.toLocaleString('en-US')}`)}, ${job.salaryMin}, ${job.salaryMax}, 'USD', ${sqlText(job.description)}, ${sqlText(`https://example.com/jobs/${job.key}`)}, ${sqlText(`https://example.com/jobs/${job.key}`)}, '1 day ago', 1, '{}', ${sqlText(now)}, ${sqlText(now)}, ${sqlText(now)}, ${sqlText(now)})
ON CONFLICT(canonical_key) DO UPDATE SET title = excluded.title, title_normalized = excluded.title_normalized, company = excluded.company, company_normalized = excluded.company_normalized, location_text = excluded.location_text, location_normalized = excluded.location_normalized, work_mode = excluded.work_mode, salary_text = excluded.salary_text, salary_min = excluded.salary_min, salary_max = excluded.salary_max, description = excluded.description, last_seen_at = excluded.last_seen_at, updated_at = excluded.updated_at;`,
      `INSERT INTO job_feed_ranked_items (id, run_id, user_id, canonical_job_id, rank_position, fit_label, ranking_source, reason, deterministic_score, metadata, created_at)
VALUES (${sqlText(seedId(userId, `feed-ranked:${job.key}`))}, ${sqlText(runId)}, ${sqlText(userId)}, ${sqlText(jobId)}, ${index + 1}, ${sqlText(job.fit)}, 'llm', ${sqlText(job.reason)}, ${job.fit === 'strong' ? 90 - index : 75 - index}, ${sqlJson({ company_display: job.company })}, ${sqlText(now)});`,
    );
  });
  return lines.join('\n');
}

/**
 * Removes a reviewer's namespaced postings, for the delete-and-recreate path only. A posting another
 * account has ranked or given feedback on is kept. (The cascade from a canonical job reaches
 * job_feed_ranked_items and job_feed_feedback of every user, so this guard is what scopes the delete.)
 */
function deleteNamespacedJobsSql(userId: string): string {
  const namespace = feedKeyNamespace(userId);
  return `DELETE FROM job_feed_canonical_jobs
WHERE substr(canonical_key, 1, ${namespace.length}) = ${sqlText(namespace)}
  AND NOT EXISTS (SELECT 1 FROM job_feed_ranked_items r WHERE r.canonical_job_id = job_feed_canonical_jobs.id AND r.user_id <> ${sqlText(userId)})
  AND NOT EXISTS (SELECT 1 FROM job_feed_feedback f WHERE f.canonical_job_id = job_feed_canonical_jobs.id AND f.user_id <> ${sqlText(userId)});`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  assertSafeCredentialsPath(args.credentialsOut);

  if (args.remote) {
    if (isLocalUrl(args.baseUrl)) fail('--remote needs a non-local --base-url (the production site), so sign-up and the data writes hit the same environment.');
  } else if (!isLocalUrl(args.baseUrl)) {
    fail('A non-local --base-url needs --remote --yes-production, so sign-up and the data writes hit the same environment.');
  }

  console.log(`Target: ${args.baseUrl}`);
  console.log(`Database: ${DB_NAME} (${args.remote ? 'REMOTE, PRODUCTION' : 'local'})`);
  console.log(`Account: ${args.email} (reviewer pattern checked)`);
  console.log('Plan:');
  console.log('  1. Look the account up by that exact email. Sign in with the credentials file if it exists.');
  console.log('  2. If the sign-in fails, delete that one reviewer user (checked by id and email) and sign it up again with a new password.');
  console.log(`  3. Set it to Max, ${args.credits} credits, then clear its finished agent operations and replace its applications, CV, chat history, career profile, search strategy, feed run and feed settings.`);
  console.log('  4. Upsert this reviewer\'s own feed postings (keys "reviewer-seed:<its user id>:..."). Every other row is keyed to its user id, and no other user\'s rows are touched.');
  if (args.remote) console.log('--remote and --yes-production were both passed. Proceeding against the live database.');

  const existing = d1Rows<{ id: string; email: string }>(`SELECT id, email FROM user WHERE email = ${sqlText(args.email)}`, args.remote)[0];
  if (existing && (existing.email.toLowerCase() !== args.email || !REVIEWER_EMAIL.test(existing.email.toLowerCase()))) {
    fail(`The row found for ${args.email} has email ${existing.email}. Refusing to touch it.`);
  }

  // A live operation holds credits and an application's generation state. Settling it is the app's job, not this script's.
  if (existing) {
    const live = d1Rows<{ n: number }>(
      `SELECT COUNT(*) AS n FROM agent_operations WHERE user_id = ${sqlText(existing.id)} AND status IN ('pending', 'running')`,
      args.remote,
    )[0]?.n ?? 0;
    if (live > 0) {
      fail(`${args.email} has ${live} pending or running agent operation(s). Wait for them to finish (or be swept) and run the seed again. Refusing to reseed under a live operation.`);
    }
  }

  // Reuse the account when the stored password still signs in. Otherwise start clean.
  let password = readCredentials(args.credentialsOut, args.email)?.password ?? null;
  let userId: string | null = null;
  if (existing && password && (await signIn(args.baseUrl, args.email, password))) {
    userId = existing.id;
    console.log('Existing reviewer account found, sign-in works. Refreshing its data.');
  } else {
    if (existing) {
      console.log('Existing reviewer account found, but the credentials file does not sign in. Recreating the account.');
      // Each delete is keyed on the id AND the reviewer email, so a wrong id can never match another user.
      d1Exec(
        `${deleteNamespacedJobsSql(existing.id)}\nDELETE FROM profiles WHERE id = ${sqlText(existing.id)} AND email = ${sqlText(args.email)};\nDELETE FROM user WHERE id = ${sqlText(existing.id)} AND email = ${sqlText(args.email)};`,
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
    `UPDATE profiles SET subscription_tier = 'max', subscription_status = 'active' WHERE id = ${u};`,
    `INSERT OR IGNORE INTO user_credits (id, user_id, plan_tier, version, created_at, updated_at) VALUES (${sqlText(randomUUID())}, ${u}, 'max', 0, ${sqlText(now)}, ${sqlText(now)});`,
    // Max, no Stripe ids, subscription_status NULL: the monthly sweep only selects paid rows whose status is 'active'.
    `UPDATE user_credits SET plan_tier = 'max', monthly_credits = ${args.credits}, rollover_credits = 0, addon_credits = 0, stripe_customer_id = NULL, stripe_subscription_id = NULL, subscription_status = NULL, last_reset_date = ${sqlText(now)}, next_reset_date = ${sqlText(new Date(nowDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString())}, version = version + 1, updated_at = ${sqlText(now)} WHERE user_id = ${u};`,
    `DELETE FROM subscriptions WHERE user_id = ${u};`,
    `INSERT INTO subscriptions (id, user_id, tier, status, applications_used, applications_limit, cancel_at_period_end, created_at, updated_at) VALUES (${sqlText(randomUUID())}, ${u}, 'max', 'active', 2, 100, 0, ${sqlText(now)}, ${sqlText(now)});`,
  ];
  if (delta !== 0) {
    statements.push(
      `INSERT INTO credit_transactions (id, user_id, amount, transaction_type, transaction_kind, description, metadata, balance_before, balance_after, created_at)
VALUES (${sqlText(randomUUID())}, ${u}, ${delta}, 'reviewer_grant', 'grant', 'Reviewer account top-up', '{}', ${before}, ${args.credits}, ${sqlText(now)});`,
    );
  }
  statements.push(
    // Finished operations cache their results for ten minutes (replayed on the same input). The ids below are recreated, so drop them.
    `DELETE FROM agent_operations WHERE user_id = ${u} AND status IN ('succeeded', 'failed', 'cancelled');`,
    `DELETE FROM application_sessions WHERE user_id = ${u};`,
    `DELETE FROM documents WHERE user_id = ${u};`,
    primaryCvSql(userId, now),
    applicationSql(userId, US_APP, now, nowDate),
    applicationSql(userId, DE_APP, now, nowDate),
    chatSql(userId, US_APP, nowDate),
    chatSql(userId, DE_APP, nowDate),
    jobFeedSql(userId, now),
    careerSql(userId, now),
    feedItemsSql(userId, now, nowDate),
  );
  d1Exec(`${statements.join('\n')}\n`, args.remote);

  // Read back, so a silent partial write fails loudly.
  const check = d1Rows<{ apps: number; docs: number; credits: number; verified: number; consent: number; chat: number; feed: number; maxPlan: number; career: number; strategy: number; dated: number }>(
    `SELECT
       (SELECT COUNT(*) FROM chat_messages WHERE user_id = ${u}) AS chat,
       (SELECT COUNT(*) FROM job_feed_ranked_items WHERE user_id = ${u}) AS feed,
       (SELECT COUNT(*) FROM profiles p JOIN user_credits c ON c.user_id = p.id JOIN subscriptions s ON s.user_id = p.id WHERE p.id = ${u} AND p.subscription_tier = 'max' AND c.plan_tier = 'max' AND s.tier = 'max' AND c.stripe_subscription_id IS NULL) AS maxPlan,
       (SELECT COUNT(*) FROM application_sessions WHERE user_id = ${u} AND generation_status = 'succeeded' AND cover_letter IS NOT NULL AND email IS NOT NULL AND follow_up_email IS NOT NULL AND generated_cv IS NOT NULL AND fit_assessment IS NOT NULL) AS apps,
       (SELECT COUNT(*) FROM documents WHERE user_id = ${u} AND type = 'primary_cv') AS docs,
       (SELECT monthly_credits + rollover_credits + addon_credits FROM user_credits WHERE user_id = ${u}) AS credits,
       (SELECT email_verified FROM user WHERE id = ${u}) AS verified,
       (SELECT COUNT(*) FROM job_feed_settings WHERE user_id = ${u} AND consent_accepted_at IS NOT NULL) AS consent,
       (SELECT COUNT(*) FROM user_career_profiles WHERE user_id = ${u} AND json_extract(profile, '$.version') = 2 AND source_document_id IS NOT NULL) AS career,
       (SELECT COUNT(*) FROM user_search_strategies WHERE user_id = ${u} AND settings_hash = ${sqlText(feedSettingsHash())} AND json_array_length(json_extract(strategy, '$.queries')) > 0) AS strategy,
       (SELECT COUNT(*) FROM application_sessions WHERE user_id = ${u} AND ((status = 'applied' AND follow_up_due_at IS NOT NULL AND follow_up_due_at <= ${sqlText(now)}) OR (status = 'interview' AND interview_at > ${sqlText(now)}))) AS dated`,
    args.remote,
  )[0];
  if (!check || check.apps !== 2 || check.docs !== 1 || check.credits !== args.credits || check.verified !== 1 || check.consent !== 1
    || check.chat !== 8 || check.feed !== FEED_JOBS.length || check.maxPlan !== 1 || check.career !== 1 || check.strategy !== 1 || check.dated !== 2) {
    fail(`Read-back check failed: ${JSON.stringify(check)}`);
  }
  if (!(await signIn(args.baseUrl, args.email, password))) fail('Read-back sign-in failed');

  console.log(`Seeded ${args.email}: 2 applications with full kits, 1 primary CV, Max plan, ${check.credits} credits, ${check.feed} feed items, a career profile and search strategy, a due follow-up and an interview in 5 days, feed consent on, email verified, sign-in works.`);
  console.log(`Credentials file: ${args.credentialsOut} (mode 0600). The password is not printed.`);
}

main().catch((error: unknown) => {
  console.error('seed-reviewer-account failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
