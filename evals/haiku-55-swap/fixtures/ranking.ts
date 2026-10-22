/**
 * Ranking fixtures: 12 sets = 6 profiles (p01 to p06) x 2 lists of 40 job postings.
 *
 * Each list mixes 10 real, public postings (the 16 job ads frozen in evals/dataset/cases.jsonl, with their
 * location fields entered by hand) and 30 synthetic postings written in the style of public ones. The
 * synthetic part is built to a recipe, so every posting's relevance is known by construction:
 *   5 strong matches, 6 adjacent roles, 6 wrong-level postings of the right family, 6 postings of the
 *   right family that break a hard constraint (wrong country, no sponsorship, wrong employment type, pay
 *   under the floor, on-site for a remote-only candidate), 5 wrong-family postings and 2 cross-posted
 *   duplicates. No personal data: companies are fictional, URLs use example.com.
 *
 * Reference: Opus 5.5 labels (0 to 3) from `run.ts ranking-labels`, stored in ranking-labels.json, when
 * that file exists; otherwise the designed relevance below. Hard-constraint flags are always the
 * deterministic ones computed here.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { JobFeedRankingCandidate } from '@/lib/job-feed/types';
import { PERSONAS, buildProfile, buildSettings, type Persona } from './personas';
import { pick, rng, shuffle } from '../lib/util';

export type Family =
  | 'backend' | 'devops' | 'data_engineer' | 'data_analyst' | 'marketing' | 'finance_fpa' | 'accounting' | 'ux_design' | 'supply_chain'
  | 'sales' | 'hr' | 'nursing' | 'product_manager' | 'customer_success' | 'enablement' | 'program_mgmt' | 'insurance_ops';

type Level = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'manager';
const LEVELS: Level[] = ['intern', 'junior', 'mid', 'senior', 'lead', 'manager'];
type Mode = 'remote' | 'hybrid' | 'onsite';
type Employment = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary';

export interface RankingJob {
  id: string;
  family: Family;
  level: Level;
  title: string;
  company: string;
  country: string;
  location: string;
  workMode: Mode;
  /** Remote postings: who may apply. 'global', 'eu', or a country code. */
  region: string;
  employmentType: Employment;
  salaryMax: number | null;
  salaryText: string | null;
  description: string;
  noSponsorship: boolean;
  freshnessDays: number;
  dupOf: string | null;
  source: string;
  slot: string;
}

export interface RankingSet {
  id: string;
  group: string;
  persona: Persona;
  list: 1 | 2;
  visibleCap: number;
  jobs: RankingJob[];
}

const PLACES: Record<string, { country: string; region: string }> = {
  Berlin: { country: 'de', region: 'eu' }, Hamburg: { country: 'de', region: 'eu' }, München: { country: 'de', region: 'eu' }, Köln: { country: 'de', region: 'eu' }, Frankfurt: { country: 'de', region: 'eu' }, Potsdam: { country: 'de', region: 'eu' }, Bonn: { country: 'de', region: 'eu' }, Düsseldorf: { country: 'de', region: 'eu' },
  London: { country: 'gb', region: 'gb' }, Manchester: { country: 'gb', region: 'gb' }, Leeds: { country: 'gb', region: 'gb' },
  Chicago: { country: 'us', region: 'us' }, 'New York': { country: 'us', region: 'us' }, Austin: { country: 'us', region: 'us' }, Minneapolis: { country: 'us', region: 'us' },
  Rotterdam: { country: 'nl', region: 'eu' }, Amsterdam: { country: 'nl', region: 'eu' }, Utrecht: { country: 'nl', region: 'eu' },
  Toronto: { country: 'ca', region: 'ca' }, Vancouver: { country: 'ca', region: 'ca' }, Dublin: { country: 'ie', region: 'eu' }, Zürich: { country: 'ch', region: 'ch' }, Madrid: { country: 'es', region: 'eu' }, Singapore: { country: 'sg', region: 'sg' },
};
const EU = new Set(['de', 'nl', 'ie', 'es', 'fr', 'it']);
const FOREIGN = ['Austin', 'Madrid', 'Singapore', 'Vancouver', 'Zürich'];

interface FamilyBank {
  titles: Record<Level, string[]>;
  skills: string[];
  duties: string[];
  salary: [number, number]; // mid-level range, in thousands of the local currency
}

const BANK: Record<Family, FamilyBank> = {
  backend: { titles: { intern: ['Backend Engineering Intern'], junior: ['Junior Backend Developer'], mid: ['Backend Engineer', 'Software Engineer, Backend'], senior: ['Senior Backend Engineer', 'Senior Platform Engineer'], lead: ['Staff Backend Engineer', 'Tech Lead, Backend'], manager: ['Engineering Manager, Backend'] }, skills: ['Python', 'Go', 'Java', 'PostgreSQL', 'Kafka', 'Kubernetes', 'Docker', 'AWS', 'REST APIs', 'Terraform'], duties: ['design and run services that handle millions of requests a day', 'own the reliability of the payments and ledger services', 'review code and mentor engineers on the team', 'carry a share of the on-call rotation', 'improve observability with metrics, traces and alerts', 'move legacy modules into smaller services'], salary: [70, 95] },
  devops: { titles: { intern: ['DevOps Intern'], junior: ['Junior DevOps Engineer'], mid: ['DevOps Engineer', 'Site Reliability Engineer'], senior: ['Senior DevOps Engineer', 'Senior Site Reliability Engineer'], lead: ['Staff SRE'], manager: ['SRE Manager'] }, skills: ['Kubernetes', 'Terraform', 'AWS', 'Docker', 'CI/CD', 'Prometheus', 'Linux', 'Python', 'Go'], duties: ['build the deployment pipeline and keep it fast', 'manage the Kubernetes clusters and their upgrades', 'write infrastructure as code for every environment', 'run incident reviews and drive the follow-ups'], salary: [70, 95] },
  data_engineer: { titles: { intern: ['Data Engineering Intern'], junior: ['Junior Data Engineer'], mid: ['Data Engineer', 'Analytics Engineer'], senior: ['Senior Data Engineer'], lead: ['Staff Data Engineer'], manager: ['Data Engineering Manager'] }, skills: ['Python', 'SQL', 'Spark', 'Airflow', 'dbt', 'Snowflake', 'BigQuery', 'Kafka'], duties: ['build and monitor the pipelines that feed analytics and models', 'model the warehouse in dbt with tests and documentation', 'cut the cost and runtime of the nightly batch', 'work with analysts on the semantic layer'], salary: [68, 92] },
  data_analyst: { titles: { intern: ['Data Analyst Intern'], junior: ['Junior Data Analyst'], mid: ['Data Analyst', 'BI Analyst'], senior: ['Senior Data Analyst', 'Senior BI Analyst'], lead: ['Lead Analyst'], manager: ['Analytics Manager'] }, skills: ['SQL', 'Power BI', 'Tableau', 'Python', 'Excel', 'dbt', 'statistics', 'forecasting'], duties: ['build and maintain dashboards for sales and operations', 'analyse sales and stock data and recommend actions', 'present findings to the business every week', 'document metric definitions with the data team'], salary: [55, 72] },
  marketing: { titles: { intern: ['Marketing Intern'], junior: ['Marketing Associate', 'Content Marketing Coordinator'], mid: ['Marketing Manager', 'Growth Marketing Manager'], senior: ['Senior Marketing Manager'], lead: ['Head of Marketing'], manager: ['Marketing Director'] }, skills: ['SEO', 'HubSpot', 'Google Analytics', 'email marketing', 'copywriting', 'social media', 'content marketing'], duties: ['write and publish blog posts, newsletters and landing pages', 'run the social calendar and report on reach', 'support campaign launches with the product team', 'track campaign results in Google Analytics'], salary: [38, 55] },
  finance_fpa: { titles: { intern: ['Finance Intern'], junior: ['Junior Financial Analyst'], mid: ['FP&A Analyst', 'Financial Analyst'], senior: ['Senior FP&A Analyst', 'Finance Business Partner'], lead: ['FP&A Lead'], manager: ['Finance Manager, FP&A'] }, skills: ['Excel', 'forecasting', 'Anaplan', 'SQL', 'variance analysis', 'budgeting', 'Power BI'], duties: ['own the monthly forecast and variance reporting', 'build planning models with the business units', 'prepare the board reporting pack', 'partner with department heads on headcount and spend'], salary: [75, 100] },
  accounting: { titles: { intern: ['Accounting Intern'], junior: ['Junior Accountant'], mid: ['Accountant', 'Payroll Specialist'], senior: ['Senior Accountant'], lead: ['Accounting Lead'], manager: ['Accounting Manager'] }, skills: ['bookkeeping', 'month-end close', 'payroll', 'VAT', 'Excel', 'SAP'], duties: ['run the month-end close for two entities', 'process payroll and reconcile accounts', 'prepare VAT returns and support the audit'], salary: [50, 68] },
  ux_design: { titles: { intern: ['UX Design Intern'], junior: ['Junior UX Designer', 'Instructional Designer'], mid: ['UX Designer', 'Learning Experience Designer'], senior: ['Senior UX Designer', 'Senior Instructional Designer'], lead: ['Lead Product Designer'], manager: ['Design Manager'] }, skills: ['Figma', 'user research', 'prototyping', 'accessibility', 'curriculum design', 'usability testing', 'storyboarding'], duties: ['run user interviews and usability tests and synthesise the findings', 'design flows and prototypes in Figma with product and engineering', 'build learning paths and assessments for adult learners', 'maintain the design system components'], salary: [65, 90] },
  supply_chain: { titles: { intern: ['Supply Chain Intern'], junior: ['Supply Chain Coordinator'], mid: ['Supply Chain Planner', 'Demand Planner'], senior: ['Senior Supply Chain Planner'], lead: ['Supply Chain Manager', 'Demand Planning Manager'], manager: ['Head of Supply Chain'] }, skills: ['S&OP', 'SAP', 'demand planning', 'inventory management', 'Excel', 'forecasting', 'Power BI'], duties: ['run the monthly S&OP cycle and agree the consensus plan', 'set safety stock and reorder rules for the main SKUs', 'lead a small planning team and coordinate with logistics partners', 'improve forecast accuracy and report on it'], salary: [60, 85] },
  sales: { titles: { intern: ['Sales Intern'], junior: ['Sales Development Representative'], mid: ['Account Executive', 'Sales Representative'], senior: ['Senior Account Executive'], lead: ['Sales Team Lead'], manager: ['Sales Manager'] }, skills: ['Salesforce', 'prospecting', 'negotiation', 'CRM', 'cold calling', 'quota attainment'], duties: ['open new accounts through outbound prospecting', 'run demos and close deals against a quarterly quota', 'forecast the pipeline in Salesforce'], salary: [45, 70] },
  hr: { titles: { intern: ['HR Intern'], junior: ['HR Assistant'], mid: ['HR Business Partner', 'Recruiter'], senior: ['Senior HR Business Partner'], lead: ['HR Lead'], manager: ['HR Manager'] }, skills: ['recruiting', 'employee relations', 'HRIS', 'onboarding', 'labour law'], duties: ['partner with managers on hiring and performance', 'run the onboarding programme', 'advise on employee relations cases'], salary: [48, 68] },
  nursing: { titles: { intern: ['Nursing Assistant Trainee'], junior: ['Registered Nurse, New Graduate'], mid: ['Registered Nurse, Medical-Surgical', 'Registered Nurse, Emergency'], senior: ['Senior Registered Nurse'], lead: ['Charge Nurse'], manager: ['Nurse Manager'] }, skills: ['acute care', 'triage', 'patient education', 'Epic', 'BLS', 'medication administration'], duties: ['care for patients on a 32-bed unit', 'document care in the electronic record', 'educate patients and families at discharge'], salary: [65, 85] },
  product_manager: { titles: { intern: ['Product Management Intern'], junior: ['Associate Product Manager'], mid: ['Product Manager'], senior: ['Senior Product Manager'], lead: ['Group Product Manager'], manager: ['Director of Product'] }, skills: ['roadmapping', 'discovery', 'A/B testing', 'SQL', 'stakeholder management', 'Jira', 'Amplitude'], duties: ['own the roadmap for one product area', 'run customer discovery and turn it into specs', 'work with engineering and design on weekly delivery'], salary: [75, 105] },
  customer_success: { titles: { intern: ['Customer Success Intern'], junior: ['Customer Success Associate'], mid: ['Customer Success Manager'], senior: ['Senior Customer Success Manager'], lead: ['Customer Success Lead'], manager: ['Head of Customer Success'] }, skills: ['Salesforce', 'renewals', 'account management', 'QBRs', 'Gainsight'], duties: ['own a book of mid-market accounts and drive renewals', 'run quarterly business reviews with customer leaders', 'flag expansion opportunities to the sales team'], salary: [60, 80] },
  enablement: { titles: { intern: ['Enablement Intern'], junior: ['Training Coordinator'], mid: ['Customer Enablement Specialist', 'Learning and Development Specialist'], senior: ['Senior Customer Enablement Manager'], lead: ['Enablement Lead'], manager: ['Head of Enablement'] }, skills: ['curriculum design', 'LMS administration', 'Figma', 'facilitation', 'customer education', 'assessment design'], duties: ['design and deliver training for customers and partners', 'measure completion and satisfaction for each programme', 'work with product to keep the material current'], salary: [65, 88] },
  program_mgmt: { titles: { intern: ['Program Management Intern'], junior: ['Program Coordinator'], mid: ['Program Manager'], senior: ['Senior Program Manager'], lead: ['Principal Program Manager'], manager: ['Director of Programs'] }, skills: ['project planning', 'stakeholder management', 'risk management', 'Jira', 'reporting', 'vendor management'], duties: ['run cross-team programmes from plan to delivery', 'track risks and dependencies and report to leadership', 'coordinate vendors and internal owners'], salary: [70, 95] },
  insurance_ops: { titles: { intern: ['Praktikant Versicherung'], junior: ['Sachbearbeiter/in Leistungen'], mid: ['Sachbearbeiter/in Leistungen'], senior: ['Senior Sachbearbeiter/in'], lead: ['Teamleitung Leistungen'], manager: ['Leitung Leistungsabteilung'] }, skills: ['Leistungsprüfung', 'Kundenservice', 'Gebührenordnung', 'MS Office'], duties: ['prüfen und bearbeiten Leistungsanträge', 'beraten Versicherte am Telefon und schriftlich'], salary: [40, 52] },
};

const COMPANY_A = ['Orchard', 'Kestrel', 'Brightwave', 'Northfield', 'Tideline', 'Cobalt', 'Maple', 'Harbour', 'Quill', 'Stonebridge', 'Lumen', 'Fathom', 'Aster', 'Redwood', 'Sable', 'Pinegate'];
const COMPANY_B = ['Systems', 'Labs', 'Group', 'Digital', 'Works', 'Logistics', 'Health', 'Capital', 'Software', 'Industries'];
const BLURBS = [
  (c: string) => `${c} builds software and services for mid-sized businesses and has grown from 30 to 400 people in five years.`,
  (c: string) => `${c} is a growing company with customers across Europe and North America and a culture built on small, accountable teams.`,
  (c: string) => `At ${c} we help our customers run their operations with less friction. We are profitable, remote-friendly and proud of low turnover.`,
  (c: string) => `${c} was founded by two engineers who wanted better tools for their own team. Today thousands of people use what we make every day.`,
];

/** Persona's view of each family: 3 = target, 2 = clearly adjacent, 1 = weakly related, 0 = unrelated. */
const FAMILY_FIT: Record<string, Partial<Record<Family, 0 | 1 | 2 | 3>>> = {
  p01: { backend: 3, devops: 2, data_engineer: 2, product_manager: 0 },
  p02: { data_analyst: 3, data_engineer: 2, finance_fpa: 1, product_manager: 1 },
  p03: { marketing: 3, sales: 1, customer_success: 1 },
  p04: { finance_fpa: 3, accounting: 1, data_analyst: 1, program_mgmt: 0 },
  p05: { ux_design: 3, enablement: 2, product_manager: 1, marketing: 1 },
  p06: { supply_chain: 3, program_mgmt: 1, data_analyst: 1 },
};
const ADJACENT: Record<string, Family[]> = { p01: ['devops', 'data_engineer'], p02: ['data_engineer', 'finance_fpa'], p03: ['sales', 'customer_success'], p04: ['accounting', 'data_analyst'], p05: ['enablement', 'product_manager'], p06: ['program_mgmt', 'data_analyst'] };
const UNRELATED: Family[] = ['nursing', 'hr', 'accounting', 'sales', 'product_manager', 'marketing', 'backend', 'supply_chain'];

function levelIndexFor(p: Persona): number {
  const targets = (p.settings.seniority_targets ?? []).map((l) => (l === 'staff' ? 'lead' : l)).map((l) => LEVELS.indexOf(l as Level)).filter((i) => i >= 0);
  return targets.length > 0 ? targets[0] : 2;
}

export function levelDistance(p: Persona, level: Level): number {
  const targets = (p.settings.seniority_targets ?? []).map((l) => (l === 'staff' ? 'lead' : l)).map((l) => LEVELS.indexOf(l as Level)).filter((i) => i >= 0);
  const idx = LEVELS.indexOf(level);
  return Math.min(...(targets.length > 0 ? targets : [2]).map((t) => Math.abs(t - idx)));
}

/** Hard-constraint violations for a posting, by the deterministic rules the product's prefilter and the ranker prompt state. */
export function hardViolations(p: Persona, job: RankingJob): string[] {
  const s = buildSettings(p);
  const out: string[] = [];
  const countries = new Set(s.target_countries);
  const regionOk = (): boolean => {
    if (job.region === 'global') return true;
    if (job.region === 'eu') return [...countries].some((c) => EU.has(c));
    return countries.has(job.region);
  };
  if (job.workMode === 'remote' ? !regionOk() : !countries.has(job.country)) out.push('country');
  if (s.remote_preferences.length === 1 && s.remote_preferences[0] === 'remote_only' && job.workMode !== 'remote') out.push('work_mode');
  if (!s.employment_types.includes(job.employmentType)) out.push('employment_type');
  if (s.salary_floor !== null && job.salaryMax !== null && job.salaryMax < s.salary_floor) out.push('salary');
  if (s.work_authorization_status === 'needs_sponsorship' && job.noSponsorship) out.push('sponsorship');
  return out;
}

/** Relevance by construction, 0 to 3. A hard violation is always 0. */
export function designedRelevance(p: Persona, job: RankingJob): number {
  if (hardViolations(p, job).length > 0) return 0;
  const fit = FAMILY_FIT[p.id]?.[job.family] ?? 0;
  const dist = levelDistance(p, job.level);
  if (dist >= 2) return 0;
  return Math.max(0, fit - dist);
}

// ---------------------------------------------------------------------------
// Public postings (the 16 ads frozen in evals/dataset/cases.jsonl)
// ---------------------------------------------------------------------------

interface PublicMeta { company: string; family: Family; level: Level; city: string; mode: Mode; region?: string; country?: string }
const PUBLIC: Record<string, PublicMeta> = {
  'syn-01': { company: 'Coinbase', family: 'marketing', level: 'junior', city: 'Remote - USA', mode: 'remote', region: 'us', country: 'us' },
  'syn-02': { company: 'Datadog', family: 'marketing', level: 'junior', city: 'Singapore', mode: 'hybrid' },
  'syn-03': { company: 'Elastic', family: 'marketing', level: 'junior', city: 'Canada', mode: 'remote', region: 'ca', country: 'ca' },
  'syn-04': { company: 'Datadog', family: 'customer_success', level: 'mid', city: 'Boston', mode: 'hybrid', country: 'us' },
  'syn-05': { company: 'Figma', family: 'enablement', level: 'senior', city: 'London', mode: 'hybrid' },
  'syn-06': { company: 'Figma', family: 'program_mgmt', level: 'mid', city: 'London', mode: 'hybrid' },
  'syn-07': { company: 'Cloudflare', family: 'backend', level: 'senior', city: 'Austin', mode: 'hybrid' },
  'syn-08': { company: 'Coinbase', family: 'backend', level: 'senior', city: 'Remote - USA', mode: 'remote', region: 'us', country: 'us' },
  'syn-09': { company: 'Duolingo', family: 'backend', level: 'senior', city: 'New York', mode: 'hybrid' },
  'syn-10': { company: 'Elastic', family: 'backend', level: 'senior', city: 'Madrid', mode: 'remote', region: 'es', country: 'es' },
  'syn-11': { company: 'Datadog', family: 'finance_fpa', level: 'mid', city: 'New York', mode: 'hybrid' },
  'syn-12': { company: 'GitLab', family: 'finance_fpa', level: 'senior', city: 'Remote', mode: 'remote', region: 'us', country: 'us' },
  'syn-13': { company: 'Okta', family: 'finance_fpa', level: 'lead', city: 'San Francisco', mode: 'hybrid', country: 'us' },
  'syn-14': { company: 'Airbnb', family: 'program_mgmt', level: 'senior', city: 'San Francisco', mode: 'hybrid', country: 'us' },
  'syn-15': { company: 'ottonova', family: 'sales', level: 'mid', city: 'München', mode: 'hybrid' },
  'syn-16': { company: 'ottonova', family: 'insurance_ops', level: 'junior', city: 'München', mode: 'onsite' },
};

function loadPublic(): RankingJob[] {
  const file = join(__dirname, '..', '..', 'dataset', 'cases.jsonl');
  const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as { id: string; jd?: string });
  return Object.entries(PUBLIC).map(([id, meta]) => {
    const row = rows.find((r) => r.id === id);
    if (!row?.jd) throw new Error(`public posting ${id} missing from evals/dataset/cases.jsonl`);
    const [titleLine] = row.jd.split('\n');
    const place = PLACES[meta.city];
    return {
      id: `pub-${id}`, family: meta.family, level: meta.level, title: titleLine.replace(/\s*\(.*?\)\s*$/, '').trim(), company: meta.company,
      country: meta.country ?? place?.country ?? 'us', location: meta.city, workMode: meta.mode, region: meta.region ?? place?.region ?? 'us',
      employmentType: 'full_time' as const, salaryMax: null, salaryText: null, description: row.jd, noSponsorship: /not\s+(?:able|available)\s+to\s+sponsor|no\s+(?:visa\s+)?sponsorship/i.test(row.jd),
      freshnessDays: 5, dupOf: null, source: `public:${id}`, slot: 'public',
    };
  });
}

// ---------------------------------------------------------------------------
// Synthetic postings
// ---------------------------------------------------------------------------

function describe(r: () => number, job: Omit<RankingJob, 'description'>, bank: FamilyBank): string {
  const company = job.company;
  const skills = shuffle(r, bank.skills).slice(0, 5);
  const duties = shuffle(r, bank.duties).slice(0, 4);
  const years = { intern: 'no experience required', junior: '0 to 2 years of experience', mid: '3+ years of experience', senior: '6+ years of experience', lead: '8+ years of experience, including leading people', manager: '8+ years of experience and 3+ years managing a team' }[job.level];
  const modeLine = job.workMode === 'remote' ? `This role is fully remote for candidates based in ${job.region === 'eu' ? 'the EU' : job.region.toUpperCase()}.` : job.workMode === 'hybrid' ? `This is a hybrid role: three days a week in our ${job.location} office.` : `This role is based on site in ${job.location}.`;
  return [
    `${job.title}`,
    `${job.location}`,
    '',
    pick(r, BLURBS)(company),
    '',
    'What you will do:',
    ...duties.map((d) => `- ${d}`),
    '',
    'What you bring:',
    `- ${years}`,
    ...skills.map((s) => `- Working knowledge of ${s}`),
    '- Clear written and spoken communication in English',
    '',
    'What we offer:',
    '- Flexible hours, a learning budget and 28 days of leave',
    '- A team that reviews work kindly and ships often',
    ...(job.salaryText ? [`- Salary: ${job.salaryText}`] : []),
    '',
    modeLine,
    ...(job.noSponsorship ? ['We are unable to sponsor work visas for this position.'] : []),
    `Please send your CV through our careers page. Contact: jobs@example.com.`,
  ].join('\n');
}

interface Recipe { slot: string; family: Family; level: Level; violation?: 'country' | 'sponsorship' | 'employment' | 'salary' | 'mode' }

function recipeFor(p: Persona, r: () => number): Recipe[] {
  const target = (Object.entries(FAMILY_FIT[p.id] ?? {}).find(([, v]) => v === 3)?.[0] ?? 'backend') as Family;
  const levelIdx = levelIndexFor(p);
  const okLevel = (): Level => LEVELS[Math.max(0, Math.min(5, levelIdx + (r() < 0.25 ? 1 : 0)))];
  const farLevel = (): Level => LEVELS[levelIdx >= 3 ? Math.max(0, levelIdx - 3) : Math.min(5, levelIdx + 3)];
  const adj = ADJACENT[p.id];
  const wrongFamilies = shuffle(r, UNRELATED.filter((f) => (FAMILY_FIT[p.id]?.[f] ?? 0) === 0 && f !== target && !adj.includes(f)));
  const violations: Recipe['violation'][] = ['country', 'employment', 'salary', 'mode', 'sponsorship', 'country'];
  const out: Recipe[] = [];
  for (let i = 0; i < 5; i += 1) out.push({ slot: 'strong', family: target, level: okLevel() });
  for (let i = 0; i < 6; i += 1) out.push({ slot: 'adjacent', family: adj[i % adj.length], level: okLevel() });
  for (let i = 0; i < 6; i += 1) out.push({ slot: 'wrong_level', family: target, level: farLevel() });
  for (let i = 0; i < 6; i += 1) out.push({ slot: 'hard', family: target, level: okLevel(), violation: violations[i] });
  for (let i = 0; i < 5; i += 1) out.push({ slot: 'wrong_family', family: wrongFamilies[i % wrongFamilies.length], level: okLevel() });
  return out;
}

function synthesize(p: Persona, list: 1 | 2): RankingJob[] {
  const personaIdx = PERSONAS.findIndex((x) => x.id === p.id);
  const r = rng(1000 + personaIdx * 17 + list * 131);
  const s = buildSettings(p);
  const cities = (s.target_cities.length > 0 ? s.target_cities : Object.keys(PLACES).filter((c) => s.target_countries.includes(PLACES[c].country))).filter((c) => PLACES[c]);
  const jobs: RankingJob[] = [];
  const recipes = recipeFor(p, r);
  recipes.forEach((rec, i) => {
    const bank = BANK[rec.family];
    const level = rec.level;
    const titles = bank.titles[level].length > 0 ? bank.titles[level] : bank.titles.mid;
    const title = pick(r, titles);
    const company = `${pick(r, COMPANY_A)} ${pick(r, COMPANY_B)}`;
    const remoteOnly = s.remote_preferences.length === 1 && s.remote_preferences[0] === 'remote_only';
    let city = pick(r, cities.length > 0 ? cities : ['Berlin']);
    let workMode: Mode = remoteOnly ? 'remote' : pick(r, ['hybrid', 'hybrid', 'remote', 'onsite'] as Mode[]);
    let region = workMode === 'remote' ? pick(r, [...s.target_countries, 'global']) : PLACES[city].region;
    let employmentType: Employment = pick(r, s.employment_types);
    let noSponsorship = false;
    const midSalary = bank.salary;
    let salaryMax: number | null = r() < 0.6 ? Math.round((midSalary[1] + (LEVELS.indexOf(level) - 2) * 10 + r() * 6) * 1000) : null;
    if (salaryMax !== null && s.salary_floor !== null && salaryMax < s.salary_floor && rec.violation !== 'salary') salaryMax = s.salary_floor + Math.round(r() * 10000);
    if (rec.violation === 'country') {
      const away = pick(r, FOREIGN.filter((c) => !s.target_countries.includes(PLACES[c].country)));
      city = away;
      workMode = remoteOnly ? 'remote' : 'onsite';
      region = PLACES[away].region === 'eu' ? 'es' : PLACES[away].country;
    }
    if (rec.violation === 'employment') employmentType = (['internship', 'part_time', 'temporary', 'contract'] as Employment[]).find((t) => !s.employment_types.includes(t)) ?? 'internship';
    if (rec.violation === 'salary') salaryMax = (s.salary_floor ?? 60000) - 12000;
    if (rec.violation === 'mode') workMode = remoteOnly ? 'onsite' : workMode;
    if (rec.violation === 'sponsorship') noSponsorship = s.work_authorization_status === 'needs_sponsorship';
    const place = PLACES[city];
    const symbol = place.country === 'gb' ? '£' : place.country === 'us' || place.country === 'ca' ? '$' : '€';
    const base: Omit<RankingJob, 'description'> = {
      id: `${p.id}-l${list}-${String(i + 1).padStart(2, '0')}`, family: rec.family, level, title, company,
      country: place.country, location: workMode === 'remote' ? `Remote (${region === 'eu' ? 'EU' : region.toUpperCase()})` : city, workMode, region, employmentType, salaryMax,
      salaryText: salaryMax !== null ? `${symbol}${Math.round((salaryMax - 12000) / 1000)}k to ${symbol}${Math.round(salaryMax / 1000)}k a year` : null,
      noSponsorship, freshnessDays: Math.floor(r() * 24), dupOf: null, source: 'synthetic', slot: rec.slot,
    };
    jobs.push({ ...base, description: describe(r, base, bank) });
  });
  // Two cross-posted duplicates of strong matches: same company and place, new id and a shortened ad.
  const strong = jobs.filter((j) => j.slot === 'strong').slice(0, 2);
  strong.forEach((j, i) => {
    jobs.push({ ...j, id: `${j.id}-dup`, title: `${j.title} (m/w/d)`, description: j.description.split('\n').slice(0, 14).join('\n'), dupOf: j.id, slot: 'duplicate', freshnessDays: j.freshnessDays + 3 + i });
  });
  return jobs;
}

function buildSet(p: Persona, list: 1 | 2): RankingSet {
  const personaIdx = PERSONAS.findIndex((x) => x.id === p.id);
  const r = rng(5000 + personaIdx * 31 + list);
  const synthetic = synthesize(p, list);
  const pub = shuffle(r, loadPublic()).slice(0, 10);
  const jobs = shuffle(r, [...synthetic, ...pub]).slice(0, 40);
  return { id: `${p.id}-l${list}`, group: `rank-${p.id}`, persona: p, list, visibleCap: list === 1 ? 10 : 25, jobs };
}

export const RANKING_SETS: RankingSet[] = PERSONAS.slice(0, 6).flatMap((p) => ([1, 2] as const).map((l) => buildSet(p, l)));

// ---------------------------------------------------------------------------
// Candidates for the shipped ranker
// ---------------------------------------------------------------------------

const overlap = (a: string, b: string): number => {
  const ta = new Set(a.toLowerCase().split(/[^a-z0-9&]+/).filter((t) => t.length > 2));
  const tb = b.toLowerCase().split(/[^a-z0-9&]+/).filter((t) => t.length > 2);
  return tb.length === 0 ? 0 : tb.filter((t) => ta.has(t)).length / tb.length;
};

export function toCandidates(set: RankingSet): JobFeedRankingCandidate[] {
  const s = buildSettings(set.persona);
  const r = rng(9000 + set.id.length * 7 + set.list);
  const scored = set.jobs.map((job) => {
    const roleScore = Math.round(Math.max(...s.target_roles.map((t) => overlap(job.title, t))) * 50);
    const score = Math.max(0, Math.min(100, roleScore + Math.max(0, 15 - job.freshnessDays) + Math.round(r() * 16 - 8) + (job.workMode === 'remote' ? 6 : 0)));
    return { job, roleScore, score };
  });
  const ranked = [...scored].sort((a, b) => b.score - a.score);
  return scored.map(({ job, roleScore, score }) => ({
    jobId: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workMode: job.workMode,
    employmentType: job.employmentType,
    salaryText: job.salaryText,
    description: job.description,
    applyUrl: `https://jobs.example.com/${job.id}`,
    freshnessDays: job.freshnessDays,
    deterministicRank: ranked.findIndex((x) => x.job.id === job.id) + 1,
    deterministicScore: score,
    deterministicFitLabel: score >= 55 ? 'strong' : 'good',
    scoreBreakdown: {
      targetRoleScore: roleScore,
      adjacentRoleScore: Math.round(r() * 20),
      freshnessScore: Math.max(0, 15 - job.freshnessDays),
      salaryScore: job.salaryText ? 5 : 0,
      remoteAlignmentScore: job.workMode === 'remote' ? 6 : 2,
      preferredLocationMatched: s.preferred_locations.includes(job.location),
      hasApplyUrl: true,
      hasEmploymentType: true,
      skillOverlapScore: Math.round(overlap(job.description, set.persona.profile.tools.join(' ')) * 40),
    },
  })) as JobFeedRankingCandidate[];
}

export function rankingInputs(set: RankingSet) {
  return {
    settings: buildSettings(set.persona),
    careerProfile: buildProfile(set.persona),
    candidates: toCandidates(set),
    visibleCap: set.visibleCap,
    yearsExperience: set.persona.ranking?.yearsExperience ?? null,
    negativeTerms: set.persona.ranking?.negativeTerms ?? [],
    excludedTerms: set.persona.ranking?.excludedTerms ?? [],
  };
}

// ---------------------------------------------------------------------------
// Reference labels
// ---------------------------------------------------------------------------

export const LABELS_FILE = join(__dirname, 'ranking-labels.json');
export type Labels = Record<string, Record<string, number>>;

export function loadLabels(): Labels | null {
  return existsSync(LABELS_FILE) ? (JSON.parse(readFileSync(LABELS_FILE, 'utf8')) as Labels) : null;
}

export function referenceRelevance(set: RankingSet, labels: Labels | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const job of set.jobs) {
    const labelled = labels?.[set.id]?.[job.id];
    out[job.id] = hardViolations(set.persona, job).length > 0 ? 0 : labelled ?? designedRelevance(set.persona, job);
  }
  return out;
}

/** NDCG@k with gains 2^rel - 1, over the jobs a ranker surfaced in order. */
export function ndcgAt(k: number, surfacedInOrder: string[], relevance: Record<string, number>): number {
  const gain = (rel: number) => 2 ** rel - 1;
  const dcg = surfacedInOrder.slice(0, k).reduce((a, id, i) => a + gain(relevance[id] ?? 0) / Math.log2(i + 2), 0);
  const ideal = Object.values(relevance).sort((a, b) => b - a).slice(0, k).reduce((a, rel, i) => a + gain(rel) / Math.log2(i + 2), 0);
  return ideal === 0 ? 1 : dcg / ideal;
}
