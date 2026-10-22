/**
 * Twelve fictional job seekers. One spec per person feeds three sites: the structured CV (career
 * profile synthesis), the inferred CareerProfile plus feed settings (search strategy) and, for the
 * first six, the ranking sets. Names and companies are made up; contacts are example.com.
 */
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import type { JobFeedSettings } from '@/lib/supabase/types';
import { rng } from '../lib/util';

type Level = 'intern' | 'junior' | 'mid' | 'senior' | 'lead' | 'staff' | 'manager';
type Conf = 'high' | 'medium' | 'low';

interface RoleSpec {
  company: string;
  position: string;
  start: string;
  end: string | null;
  location: string;
  bullets: string[];
}

interface CvSpec {
  name: string;
  title: string;
  city: string;
  country: string;
  summary: string;
  roles: RoleSpec[];
  education: Array<[string, string, string, string]>; // institution, degree, field, end year
  skills: Record<string, string[]>;
  certs: Array<[string, string]>;
  languages: Array<[string, string]>;
  projects?: Array<[string, string, string[]]>;
}

interface ProfileSpec {
  fn: string;
  titles: string[];
  level: Level;
  levelConf?: Conf;
  years: number;
  yearsInFn: number;
  clusters: Array<[string, string[]]>;
  secondary?: Array<[string, string[]]>;
  domains: string[];
  tools: string[];
  workingLanguages: string[];
  narrative: string;
  negative: string[];
  aspirational?: string[];
  pivot?: { from: string; to: string };
}

export interface Persona {
  id: string;
  label: string;
  tags: string[];
  cv: CvSpec;
  profile: ProfileSpec;
  settings: Partial<Pick<JobFeedSettings, 'target_countries' | 'target_cities' | 'target_roles' | 'preferred_locations' | 'remote_preference' | 'remote_preferences' | 'salary_floor' | 'languages' | 'seniority_target' | 'seniority_targets' | 'employment_types' | 'work_authorization_status' | 'user_skills' | 'excluded_terms'>>;
  /** Ranking only. */
  ranking?: { yearsExperience: number; negativeTerms: string[]; excludedTerms: string[] };
}

const ym = (s: string) => ({ raw: s, normalized: s, confidence: 'high' as const });

export function buildCv(p: Persona, index: number): StructuredCV {
  const c = p.cv;
  const now = '2026-10-22T00:00:00.000Z';
  return {
    id: `cv-${p.id}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFileName: `${p.id}.txt`,
    sourceFormat: 'txt',
    settings: { region: c.country === 'United States' ? 'US' : 'EU', includePhoto: false, pageSize: c.country === 'United States' ? 'letter' : 'a4', maxPages: 2, language: p.settings.languages?.[0] ?? 'en' },
    personal: { fullName: c.name, email: `${p.id}-${index}@example.com`, phone: '', currentTitle: c.title, city: c.city, country: c.country },
    summary: c.summary,
    experience: c.roles.map((r, i) => ({
      id: `${p.id}-exp-${i + 1}`,
      company: r.company,
      position: r.position,
      location: r.location,
      startDate: ym(r.start),
      ...(r.end ? { endDate: ym(r.end) } : {}),
      current: r.end === null,
      bullets: r.bullets,
    })),
    education: c.education.map(([institution, degree, field, end], i) => ({ id: `${p.id}-edu-${i + 1}`, institution, degree, field, endDate: ym(end) })),
    skills: Object.entries(c.skills).map(([category, skills], i) => ({ id: `${p.id}-sk-${i + 1}`, category, skills })),
    certifications: c.certs.map(([name, issuer], i) => ({ id: `${p.id}-cert-${i + 1}`, name, issuer })),
    languages: c.languages.map(([language, proficiency], i) => ({ id: `${p.id}-lang-${i + 1}`, language, proficiency })),
    ...(c.projects ? { projects: c.projects.map(([name, description, technologies], i) => ({ id: `${p.id}-proj-${i + 1}`, name, description, technologies })) } : {}),
  };
}

export function buildProfile(p: Persona): CareerProfile {
  const s = p.profile;
  const cluster = (name: string, skills: string[], strength: 'strong' | 'moderate' | 'mentioned') => ({ name, skills, evidenceStrength: strength });
  return {
    version: 2,
    generatedAt: '2026-10-22T00:00:00.000Z',
    function: s.fn,
    inferredTitles: s.titles.map((canonical, i) => ({ canonical, confidence: (i === 0 ? 'high' : 'medium') as Conf, rationale: `Matches the most recent roles and the CV title (${p.cv.title}).` })),
    seniority: { level: s.level, confidence: s.levelConf ?? 'high', rationale: `${s.years} years in total and the scope of the latest role.` },
    targetDirection: {
      aspirationalTitles: s.aspirational ?? [],
      pivot: s.pivot ?? null,
      confidence: s.pivot ? 'medium' : 'low',
      rationale: s.pivot ? `The summary and the latest bullets move from ${s.pivot.from} to ${s.pivot.to}.` : 'Deepening on the current track.',
    },
    yearsTotal: s.years,
    yearsInFunction: s.yearsInFn,
    primarySkillClusters: s.clusters.map(([n, k]) => cluster(n, k, 'strong')),
    secondarySkillClusters: (s.secondary ?? []).map(([n, k]) => cluster(n, k, 'moderate')),
    industryDomains: s.domains,
    toolsEnvironment: s.tools,
    workingLanguages: s.workingLanguages,
    narrative: s.narrative,
    negativeSignals: s.negative,
  };
}

export function buildSettings(p: Persona): JobFeedSettings {
  const st = p.settings;
  const levels = st.seniority_targets ?? (st.seniority_target ? [st.seniority_target] : []);
  const modes = st.remote_preferences ?? [st.remote_preference ?? 'flexible'];
  return {
    user_id: `eval-${p.id}`,
    enabled: true,
    consent_accepted_at: '2026-10-01T00:00:00.000Z',
    user_timezone: 'UTC',
    target_market: 'us_canada',
    target_countries: st.target_countries ?? [],
    target_cities: st.target_cities ?? [],
    target_roles: st.target_roles ?? [],
    preferred_locations: st.preferred_locations ?? [],
    remote_preference: modes[0],
    remote_preferences: modes,
    salary_floor: st.salary_floor ?? null,
    languages: st.languages ?? ['en'],
    seniority_target: levels[0] ?? null,
    seniority_targets: levels,
    employment_types: st.employment_types ?? ['full_time'],
    work_authorization_status: st.work_authorization_status ?? null,
    user_skills: st.user_skills ?? [],
    excluded_terms: st.excluded_terms ?? [],
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  } as JobFeedSettings;
}

const R = (company: string, position: string, start: string, end: string | null, location: string, bullets: string[]): RoleSpec => ({ company, position, start, end, location, bullets });

export const PERSONAS: Persona[] = [
  {
    id: 'p01', label: 'Senior backend engineer, Berlin', tags: ['senior', 'multi-language'],
    cv: {
      name: 'Felix Brandt', title: 'Senior Backend Engineer', city: 'Berlin', country: 'Germany',
      summary: 'Backend engineer with ten years building payment and logistics services in Python and Go. Cares about reliable APIs, observability and small teams.',
      roles: [
        R('Tidewater Pay GmbH', 'Senior Backend Engineer', '2020-04', null, 'Berlin', ['Designed the settlement service in Go (Postgres, Kafka) that processes 2 million transactions a day.', 'Cut p99 API latency from 480 ms to 140 ms by moving hot reads to a cache and batching writes.', 'Led the move from a monolith to six services on Kubernetes with two other engineers.', 'Mentored four engineers and ran the on-call rotation.']),
        R('Nordkai Logistics AG', 'Backend Engineer', '2016-09', '2020-03', 'Hamburg', ['Built the shipment tracking API in Python (Django, PostgreSQL) used by 300 carriers.', 'Wrote the event pipeline that feeds the customer notification service.', 'Introduced contract tests between services, halving integration bugs.']),
        R('Pixelforge Studios', 'Software Developer', '2014-10', '2016-08', 'Bremen', ['Developed REST backends for mobile games in Python and Flask.', 'Set up CI with GitHub Actions and Docker.']),
      ],
      education: [['TU Berlin', 'M.Sc.', 'Computer Science', '2014']],
      skills: { Languages: ['Go', 'Python', 'SQL'], Infrastructure: ['Kubernetes', 'Docker', 'Terraform', 'AWS'], Data: ['PostgreSQL', 'Kafka', 'Redis'] },
      certs: [['AWS Certified Developer Associate', 'Amazon Web Services']], languages: [['German', 'native'], ['English', 'C1']],
    },
    profile: { fn: 'engineering', titles: ['Senior Backend Engineer', 'Platform Engineer'], level: 'senior', years: 12, yearsInFn: 12, clusters: [['backend services in Go and Python', ['Go', 'Python', 'REST APIs', 'PostgreSQL']], ['event-driven systems', ['Kafka', 'Redis', 'microservices']]], secondary: [['cloud infrastructure', ['Kubernetes', 'Docker', 'Terraform', 'AWS']]], domains: ['fintech', 'logistics'], tools: ['Kubernetes', 'Docker', 'Terraform', 'AWS', 'PostgreSQL', 'Kafka'], workingLanguages: ['Go', 'Python', 'SQL'], narrative: 'Senior backend engineer with a decade in payments and logistics. Strongest in Go and Python services, Postgres and Kafka, with Kubernetes experience from a monolith migration. Has mentored engineers and carried on-call.', negative: ['Frontend Developer', 'QA Tester', 'Sales Engineer'], aspirational: ['Staff Engineer'] },
    settings: { target_countries: ['de'], target_cities: ['Berlin'], target_roles: ['Backend Engineer', 'Platform Engineer'], preferred_locations: ['Berlin', 'Potsdam'], remote_preferences: ['hybrid', 'remote_first'], salary_floor: 85000, languages: ['de', 'en'], seniority_targets: ['senior'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['Go', 'Python', 'PostgreSQL', 'Kubernetes', 'Kafka'], excluded_terms: ['Crypto'] },
    ranking: { yearsExperience: 12, negativeTerms: ['Frontend', 'QA'], excludedTerms: ['Crypto'] },
  },
  {
    id: 'p02', label: 'Data analyst, Hamburg', tags: ['mid', 'german-only'],
    cv: {
      name: 'Lena Hoffmann', title: 'Senior Data Analyst', city: 'Hamburg', country: 'Deutschland',
      summary: 'Data Analyst mit acht Jahren Erfahrung in Handel und Logistik. Schwerpunkt auf Reporting, Absatzprognosen und Self-Service-BI.',
      roles: [
        R('Elbwerk Logistik GmbH', 'Senior Data Analyst', '2021-03', null, 'Hamburg', ['Aufbau eines zentralen Power-BI-Reportings für Vertrieb und Lager mit 14 Standardberichten.', 'Absatzprognose für 3.500 Artikel in Python entwickelt, Prognosefehler um 18 Prozent gesenkt.', 'Migration der Datenbasis von Access nach SQL Server begleitet.']),
        R('Alster Versand AG', 'Data Analyst', '2017-09', '2021-02', 'Hamburg', ['Wöchentliche Retourenanalyse für die Geschäftsführung erstellt.', 'Datenqualitätsprüfungen in SQL automatisiert, 6 Stunden pro Woche gespart.', 'Mitarbeit an der Einführung eines Data Warehouse auf Snowflake.']),
        R('Hanse Möbel KG', 'Werkstudent Controlling', '2015-04', '2017-08', 'Hamburg', ['Monatliche Kostenstellenberichte in Excel vorbereitet.']),
      ],
      education: [['Universität Hamburg', 'M.Sc.', 'Wirtschaftsinformatik', '2017'], ['Universität Hamburg', 'B.Sc.', 'Betriebswirtschaftslehre', '2015']],
      skills: { Analyse: ['SQL', 'Power BI', 'Python', 'Excel'], Daten: ['Snowflake', 'SQL Server'] },
      certs: [], languages: [['Deutsch', 'Muttersprache'], ['Englisch', 'C1']],
    },
    profile: { fn: 'data', titles: ['Senior Data Analyst', 'BI Analyst'], level: 'senior', years: 11, yearsInFn: 9, clusters: [['reporting and BI', ['SQL', 'Power BI', 'Excel']], ['demand forecasting in Python', ['Python', 'pandas', 'forecasting']]], secondary: [['data warehousing', ['Snowflake', 'SQL Server']]], domains: ['retail', 'logistics'], tools: ['Power BI', 'SQL Server', 'Snowflake', 'Python'], workingLanguages: ['SQL', 'Python'], narrative: 'Senior data analyst in retail and logistics with a focus on BI reporting and demand forecasts. Built a central Power BI reporting layer and a Python forecast, and supported a warehouse rollout.', negative: ['Data Entry', 'Sales Representative'], aspirational: ['Analytics Engineer'] },
    settings: { target_countries: ['de'], target_cities: ['Hamburg'], target_roles: ['Data Analyst', 'BI Analyst'], preferred_locations: ['Hamburg', 'Lübeck'], remote_preferences: ['hybrid'], salary_floor: 62000, languages: ['de', 'en'], seniority_targets: ['senior', 'mid'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['SQL', 'Power BI', 'Python', 'Snowflake'] },
    ranking: { yearsExperience: 11, negativeTerms: ['Data Entry'], excludedTerms: [] },
  },
  {
    id: 'p03', label: 'Junior marketing, London, needs sponsorship', tags: ['junior', 'new-grad', 'sponsorship'],
    cv: {
      name: 'Amara Osei', title: 'Marketing Associate', city: 'London', country: 'United Kingdom',
      summary: 'Recent marketing graduate with two internships and a year running social media for a student startup. Looking for a junior role in content or growth marketing.',
      roles: [
        R('Greenroof Foods', 'Marketing Intern', '2025-06', '2025-12', 'London', ['Wrote 40 blog posts and newsletters; newsletter open rate rose from 22 to 31 percent.', 'Ran the Instagram calendar and grew followers by 3,000.']),
        R('Campus Cart', 'Social Media Lead (part time)', '2024-09', '2025-05', 'Manchester', ['Managed the startup\'s TikTok and Instagram, 12 posts a week.', 'Ran a student ambassador programme with 25 ambassadors.']),
      ],
      education: [['University of Manchester', 'BA', 'Marketing', '2025']],
      skills: { Marketing: ['SEO', 'Content marketing', 'Email marketing', 'Social media'], Tools: ['HubSpot', 'Google Analytics', 'Canva', 'Mailchimp'] },
      certs: [['Google Analytics Certification', 'Google']], languages: [['English', 'native'], ['Twi', 'fluent']],
    },
    profile: { fn: 'marketing', titles: ['Marketing Associate', 'Content Marketing Coordinator'], level: 'junior', years: 1, yearsInFn: 1, clusters: [['content and email marketing', ['Content marketing', 'Email marketing', 'SEO']], ['social media management', ['Instagram', 'TikTok', 'Social media']]], domains: ['food and consumer goods'], tools: ['HubSpot', 'Google Analytics', 'Mailchimp', 'Canva'], workingLanguages: [], narrative: 'Junior marketer with two internships and a student-startup social role. Writes content and newsletters and runs social calendars.', negative: ['Sales Development Representative', 'Paid Media Director'], aspirational: ['Growth Marketing Associate'] },
    settings: { target_countries: ['gb'], target_cities: ['London'], target_roles: ['Marketing Associate', 'Content Marketing Coordinator'], preferred_locations: ['London'], remote_preferences: ['hybrid', 'remote_first'], salary_floor: 28000, languages: ['en'], seniority_targets: ['junior', 'intern'], employment_types: ['full_time'], work_authorization_status: 'needs_sponsorship', user_skills: ['SEO', 'HubSpot', 'Google Analytics', 'Content marketing'] },
    ranking: { yearsExperience: 1, negativeTerms: ['Sales Development'], excludedTerms: [] },
  },
  {
    id: 'p04', label: 'FP&A analyst, Chicago, remote first', tags: ['mid', 'us'],
    cv: {
      name: 'Tomas Brandt', title: 'Financial Analyst', city: 'Chicago', country: 'United States',
      summary: 'Financial analyst with seven years in manufacturing and software finance. Owns monthly forecasts and variance reporting.',
      roles: [
        R('Calder Industrial Components', 'Financial Analyst', '2022-03', null, 'Chicago', ['Own the monthly forecast and variance reporting for two business units.', 'Improved forecast accuracy for the larger unit from 88% to 96%.', 'Built the headcount planning model in Excel and Power Query.']),
        R('Lakeshore Software', 'Junior Financial Analyst', '2019-07', '2022-02', 'Chicago', ['Prepared the board reporting pack each quarter.', 'Automated the revenue waterfall in SQL, saving three days a month.']),
      ],
      education: [['University of Illinois', 'BS', 'Finance', '2019']],
      skills: { Finance: ['FP&A', 'Forecasting', 'Variance analysis', 'Budgeting'], Tools: ['Excel', 'SQL', 'Power BI', 'Anaplan'] },
      certs: [['CFA Level II candidate', 'CFA Institute']], languages: [['English', 'native']],
    },
    profile: { fn: 'finance', titles: ['FP&A Analyst', 'Financial Analyst'], level: 'mid', years: 7, yearsInFn: 7, clusters: [['forecasting and variance reporting', ['Forecasting', 'Variance analysis', 'Budgeting']], ['finance tooling', ['Excel', 'SQL', 'Power BI', 'Anaplan']]], domains: ['manufacturing', 'software'], tools: ['Excel', 'SQL', 'Power BI', 'Anaplan'], workingLanguages: ['SQL'], narrative: 'Mid-level financial analyst with seven years across manufacturing and software. Owns forecasts and variance reports and builds the planning models.', negative: ['Accountant', 'Tax Preparer'], aspirational: ['Senior FP&A Analyst'] },
    settings: { target_countries: ['us'], target_cities: ['Chicago'], target_roles: ['FP&A Analyst', 'Financial Analyst'], preferred_locations: ['Chicago'], remote_preferences: ['remote_first', 'hybrid'], salary_floor: 85000, languages: ['en'], seniority_targets: ['mid', 'senior'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['FP&A', 'Excel', 'SQL', 'Anaplan', 'Forecasting'] },
    ranking: { yearsExperience: 7, negativeTerms: ['Accountant'], excludedTerms: ['Payroll'] },
  },
  {
    id: 'p05', label: 'Teacher turning to UX and learning design, remote only', tags: ['career-changer', 'remote-only'],
    cv: {
      name: 'Dana Whitfield', title: 'Secondary School Teacher', city: 'Toronto', country: 'Canada',
      summary: 'Teacher of eleven years moving into learning experience design. Built an online curriculum for 400 students and completed a UX design course.',
      roles: [
        R('Lakeview Secondary School', 'Teacher, Computer Science and Maths', '2015-09', null, 'Toronto', ['Designed and taught a project-based curriculum for 400 students across four grades.', 'Moved the curriculum online in 2020 and measured completion rates weekly.', 'Ran usability sessions with students on the new learning portal and gave the feedback to the vendor.']),
        R('Northside High School', 'Teacher', '2013-09', '2015-06', 'Mississauga', ['Taught maths for grades 9 to 11.']),
      ],
      education: [['University of Toronto', 'B.Ed.', 'Education', '2013'], ['University of Toronto', 'B.Sc.', 'Mathematics', '2012']],
      skills: { Design: ['Figma', 'User research', 'Prototyping', 'Curriculum design'], Teaching: ['Instructional design', 'Assessment design'] },
      certs: [['UX Design Certificate', 'Interaction Design Foundation']], languages: [['English', 'native'], ['French', 'B2']],
      projects: [['Course portal redesign', 'Redesigned a teacher dashboard in Figma as a course project, tested with 6 teachers.', ['Figma']]],
    },
    profile: { fn: 'design', titles: ['Instructional Designer', 'UX Designer'], level: 'mid', levelConf: 'medium', years: 11, yearsInFn: 1, clusters: [['curriculum and learning design', ['Curriculum design', 'Instructional design', 'Assessment design']]], secondary: [['UX design', ['Figma', 'User research', 'Prototyping']]], domains: ['education'], tools: ['Figma'], workingLanguages: [], narrative: 'Eleven years teaching, now moving into learning experience design. Strong in curriculum design, with early UX work from a course project.', negative: ['Graphic Designer', 'Substitute Teacher'], aspirational: ['Learning Experience Designer', 'UX Designer'], pivot: { from: 'teaching', to: 'learning experience design' } },
    settings: { target_countries: ['ca', 'us'], target_cities: [], target_roles: ['Instructional Designer', 'UX Designer'], preferred_locations: [], remote_preferences: ['remote_only'], salary_floor: 70000, languages: ['en'], seniority_targets: ['mid', 'junior'], employment_types: ['full_time', 'contract'], work_authorization_status: 'authorized', user_skills: ['Figma', 'Curriculum design', 'User research'] },
    ranking: { yearsExperience: 11, negativeTerms: ['Graphic Designer'], excludedTerms: [] },
  },
  {
    id: 'p06', label: 'Supply chain lead, Rotterdam, multi-country', tags: ['lead', 'multi-country'],
    cv: {
      name: 'Joris van Dijk', title: 'Supply Chain Manager', city: 'Rotterdam', country: 'Netherlands',
      summary: 'Supply chain manager with twelve years in port logistics and consumer goods. Leads planning teams and S&OP.',
      roles: [
        R('Maasport Logistics', 'Supply Chain Manager', '2019-01', null, 'Rotterdam', ['Lead a planning team of seven across Benelux and Germany.', 'Run the monthly S&OP cycle for 5,000 SKUs; forecast accuracy rose from 71% to 84%.', 'Cut inventory holding cost by 9% through safety stock rules.']),
        R('Delta Consumer Goods', 'Demand Planner', '2014-06', '2018-12', 'Utrecht', ['Planned demand for 800 SKUs in SAP APO.', 'Built the promotion uplift model in Excel.']),
        R('EuroFreight BV', 'Logistics Coordinator', '2012-02', '2014-05', 'Rotterdam', ['Coordinated 40 weekly container movements.']),
      ],
      education: [['Erasmus University Rotterdam', 'M.Sc.', 'Supply Chain Management', '2012']],
      skills: { Planning: ['S&OP', 'Demand planning', 'Inventory management'], Tools: ['SAP', 'Excel', 'Power BI'] },
      certs: [['CPIM', 'ASCM']], languages: [['Dutch', 'native'], ['English', 'C1'], ['German', 'B2']],
    },
    profile: { fn: 'operations', titles: ['Supply Chain Manager', 'Demand Planning Manager'], level: 'lead', years: 14, yearsInFn: 14, clusters: [['S&OP and demand planning', ['S&OP', 'Demand planning', 'Forecasting']], ['inventory optimisation', ['Inventory management', 'Safety stock']]], domains: ['port logistics', 'consumer goods'], tools: ['SAP', 'Excel', 'Power BI'], workingLanguages: [], narrative: 'Supply chain manager with fourteen years in logistics and consumer goods. Runs S&OP and leads a planning team across Benelux and Germany.', negative: ['Warehouse Operative', 'Truck Driver'], aspirational: ['Head of Supply Chain'] },
    settings: { target_countries: ['nl', 'de'], target_cities: ['Rotterdam', 'Utrecht'], target_roles: ['Supply Chain Manager', 'Demand Planning Manager'], preferred_locations: ['Rotterdam', 'Utrecht', 'Duisburg'], remote_preferences: ['hybrid', 'onsite'], salary_floor: 75000, languages: ['nl', 'en', 'de'], seniority_targets: ['lead', 'manager', 'senior'], employment_types: ['full_time', 'contract'], work_authorization_status: 'authorized', user_skills: ['S&OP', 'SAP', 'Demand planning', 'Inventory management'] },
    ranking: { yearsExperience: 14, negativeTerms: ['Warehouse Operative'], excludedTerms: [] },
  },
  {
    id: 'p07', label: 'Engineering manager with 25 years, Munich and Zurich', tags: ['manager', 'multi-country', '25-years'],
    cv: {
      name: 'Stefan Albrecht', title: 'Director of Engineering', city: 'München', country: 'Germany',
      summary: 'Engineering leader with twenty-five years in embedded and cloud software for industrial customers. Leads teams of up to forty.',
      roles: [
        R('Brenner Automation AG', 'Director of Engineering', '2018-01', null, 'München', ['Lead four teams (38 engineers) building the cloud platform for industrial sensors.', 'Own the engineering budget of 9 million euros and the hiring plan.', 'Moved the platform from private data centres to AWS in 14 months with no customer downtime.']),
        R('Lichtwerk GmbH', 'Head of Software', '2010-03', '2017-12', 'Augsburg', ['Grew the software group from 6 to 22 engineers.', 'Shipped the embedded firmware for three product generations in C++.']),
        R('Siedler Elektronik', 'Senior Embedded Engineer', '2003-05', '2010-02', 'Ulm', ['Developed real-time firmware in C for motor controllers.']),
        R('Technische Hochschule Ulm', 'Research Assistant', '2001-10', '2003-04', 'Ulm', ['Worked on a signal processing library in C.']),
      ],
      education: [['TU München', 'Dipl.-Ing.', 'Elektrotechnik', '2001']],
      skills: { Leadership: ['Engineering management', 'Hiring', 'Budgeting'], Technical: ['C++', 'C', 'AWS', 'Embedded systems', 'IoT platforms'] },
      certs: [], languages: [['German', 'native'], ['English', 'C2'], ['French', 'A2']],
    },
    profile: { fn: 'engineering', titles: ['Director of Engineering', 'Head of Software'], level: 'manager', years: 25, yearsInFn: 25, clusters: [['engineering leadership', ['Engineering management', 'Hiring', 'Budgeting']], ['embedded and IoT software', ['C++', 'C', 'Embedded systems', 'IoT platforms']]], secondary: [['cloud migration', ['AWS']]], domains: ['industrial automation', 'IoT'], tools: ['AWS', 'C++'], workingLanguages: ['C++', 'C'], narrative: 'Engineering leader with twenty-five years in industrial software, from embedded firmware to a cloud platform. Leads teams of up to 38 and owns budget and hiring.', negative: ['Junior Developer', 'Software Engineer'], aspirational: ['VP Engineering', 'CTO'] },
    settings: { target_countries: ['de', 'ch'], target_cities: ['München', 'Zürich'], target_roles: ['Director of Engineering', 'Head of Engineering'], preferred_locations: ['München', 'Zürich', 'Augsburg'], remote_preferences: ['hybrid'], salary_floor: 140000, languages: ['de', 'en'], seniority_targets: ['manager', 'lead'], employment_types: ['full_time'], work_authorization_status: 'open_to_both', user_skills: ['Engineering management', 'C++', 'AWS', 'IoT platforms'] },
  },
  {
    id: 'p08', label: 'New graduate, computer science, Toronto', tags: ['new-grad', 'thin-cv'],
    cv: {
      name: 'Ravi Menon', title: 'Computer Science Graduate', city: 'Toronto', country: 'Canada',
      summary: 'Computer science graduate looking for a first software role. Built a course scheduling app and interned on a data team.',
      roles: [R('Northwind Analytics', 'Data Intern', '2025-05', '2025-08', 'Toronto', ['Wrote SQL reports for the sales team and fixed three data quality issues.', 'Built a small dashboard in Metabase.'])],
      education: [['University of Waterloo', 'BCS', 'Computer Science', '2026']],
      skills: { Programming: ['Python', 'Java', 'JavaScript', 'SQL'], Tools: ['Git', 'Docker', 'Metabase'] },
      certs: [], languages: [['English', 'native'], ['Malayalam', 'fluent']],
      projects: [['Course scheduler', 'A web app that builds conflict-free timetables, used by 150 students.', ['React', 'Node.js', 'PostgreSQL']], ['Chess engine', 'A small alpha-beta chess engine in Java.', ['Java']]],
    },
    profile: { fn: 'engineering', titles: ['Software Developer', 'Junior Data Analyst'], level: 'junior', levelConf: 'medium', years: 0, yearsInFn: 0, clusters: [['web application development', ['React', 'Node.js', 'PostgreSQL', 'JavaScript']]], secondary: [['data reporting', ['SQL', 'Metabase', 'Python']]], domains: [], tools: ['Git', 'Docker', 'Metabase'], workingLanguages: ['Python', 'Java', 'JavaScript', 'SQL'], narrative: 'New computer science graduate with one data internship and two projects. Has built a web app with real users.', negative: ['Senior Engineer', 'Manager'], aspirational: [] },
    settings: { target_countries: ['ca'], target_cities: ['Toronto', 'Waterloo'], target_roles: ['Software Developer', 'Junior Developer'], preferred_locations: ['Toronto', 'Waterloo'], remote_preferences: ['hybrid', 'remote_first'], salary_floor: 60000, languages: ['en'], seniority_targets: ['junior', 'intern'], employment_types: ['full_time', 'internship'], work_authorization_status: 'authorized', user_skills: ['Python', 'Java', 'JavaScript', 'SQL', 'React'] },
  },
  {
    id: 'p09', label: 'Nurse moving to health informatics', tags: ['career-changer'],
    cv: {
      name: 'Grace Lindqvist', title: 'Registered Nurse', city: 'Minneapolis', country: 'United States',
      summary: 'Registered nurse with nine years in acute care. Super user for the hospital EHR and now moving into health informatics.',
      roles: [
        R('Riverside Medical Center', 'Registered Nurse, Medical-Surgical', '2017-08', null, 'Minneapolis', ['Care for 5 to 6 patients per shift on a 32-bed unit.', 'EHR super user: trained 60 nurses on the new charting workflow and collected their feedback for the vendor.', 'Led a unit project that cut documentation time per patient by 8 minutes.']),
        R('Lakes Community Hospital', 'Registered Nurse, Emergency', '2015-06', '2017-07', 'St. Paul', ['Triaged up to 40 patients a shift.']),
      ],
      education: [['University of Minnesota', 'BSN', 'Nursing', '2015'], ['Coursera', 'Certificate', 'Health Informatics', '2025']],
      skills: { Clinical: ['Acute care', 'Triage', 'Patient education'], Informatics: ['Epic', 'Workflow analysis', 'End-user training', 'SQL basics'] },
      certs: [['RN License (MN)', 'State of Minnesota'], ['BLS', 'American Heart Association']], languages: [['English', 'native']],
    },
    profile: { fn: 'other', titles: ['Clinical Informatics Specialist', 'Registered Nurse'], level: 'mid', levelConf: 'medium', years: 11, yearsInFn: 11, clusters: [['acute care nursing', ['Acute care', 'Triage', 'Patient education']]], secondary: [['clinical informatics', ['Epic', 'Workflow analysis', 'End-user training']]], domains: ['healthcare'], tools: ['Epic'], workingLanguages: [], narrative: 'Registered nurse with eleven years in acute care and emergency. Trained colleagues on the hospital EHR and is moving toward informatics.', negative: ['Software Engineer', 'Home Health Aide'], aspirational: ['Clinical Informatics Analyst'], pivot: { from: 'bedside nursing', to: 'clinical informatics' } },
    settings: { target_countries: ['us'], target_cities: [], target_roles: ['Clinical Informatics Analyst', 'EHR Trainer'], preferred_locations: ['Minneapolis'], remote_preferences: ['remote_first', 'hybrid'], salary_floor: 80000, languages: ['en'], seniority_targets: ['mid'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['Epic', 'Workflow analysis', 'End-user training'] },
  },
  {
    id: 'p10', label: 'Product manager, Amsterdam and Dublin, English only', tags: ['senior', 'multi-country'],
    cv: {
      name: 'Aoife Gallagher', title: 'Senior Product Manager', city: 'Amsterdam', country: 'Netherlands',
      summary: 'Product manager with nine years in B2B SaaS and marketplaces. Runs discovery, roadmaps and launches with engineering and design.',
      roles: [
        R('Canalside Software', 'Senior Product Manager', '2021-02', null, 'Amsterdam', ['Own the invoicing product used by 18,000 businesses; shipped self-serve onboarding that lifted activation from 31% to 44%.', 'Set the yearly roadmap with two engineering teams and a designer.', 'Ran 60 customer interviews a year and wrote the discovery notes the whole company reads.']),
        R('Liffey Market', 'Product Manager', '2017-09', '2021-01', 'Dublin', ['Launched the seller analytics dashboard, adopted by 70% of active sellers in six months.', 'Ran A/B tests on checkout; conversion rose 6%.']),
        R('Liffey Market', 'Associate Product Manager', '2016-09', '2017-08', 'Dublin', ['Wrote specs and triaged the backlog for the payments team.']),
      ],
      education: [['Trinity College Dublin', 'B.A.', 'Business and Computing', '2016']],
      skills: { Product: ['Roadmapping', 'Discovery', 'A/B testing', 'Stakeholder management'], Tools: ['Jira', 'Amplitude', 'Figma', 'SQL'] },
      certs: [], languages: [['English', 'native'], ['Irish', 'B2']],
    },
    profile: { fn: 'product', titles: ['Senior Product Manager', 'Product Manager'], level: 'senior', years: 10, yearsInFn: 10, clusters: [['B2B SaaS product management', ['Roadmapping', 'Discovery', 'Stakeholder management']], ['experimentation and analytics', ['A/B testing', 'Amplitude', 'SQL']]], domains: ['B2B SaaS', 'marketplaces', 'invoicing'], tools: ['Jira', 'Amplitude', 'Figma', 'SQL'], workingLanguages: ['SQL'], narrative: 'Senior product manager with ten years in B2B SaaS and marketplaces. Owns an invoicing product at scale and runs discovery and experiments.', negative: ['Project Manager', 'Product Owner (SAFe)'], aspirational: ['Group Product Manager'] },
    settings: { target_countries: ['nl', 'ie'], target_cities: ['Amsterdam', 'Dublin'], target_roles: ['Senior Product Manager', 'Product Manager'], preferred_locations: ['Amsterdam', 'Dublin', 'Utrecht'], remote_preferences: ['hybrid', 'remote_first'], salary_floor: 90000, languages: ['en'], seniority_targets: ['senior'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['Roadmapping', 'Discovery', 'A/B testing', 'SQL'] },
  },
  {
    id: 'p11', label: 'Sales representative, Köln, German only', tags: ['german-only', 'mid'],
    cv: {
      name: 'Miriam Schulte', title: 'Vertriebsmitarbeiterin Innendienst', city: 'Köln', country: 'Deutschland',
      summary: 'Vertriebsmitarbeiterin im Innendienst mit sechs Jahren Erfahrung im Großhandel für Haustechnik. Betreut Bestandskunden und gewinnt Neukunden.',
      roles: [
        R('Rheinhaus Haustechnik GmbH', 'Vertriebsmitarbeiterin Innendienst', '2020-04', null, 'Köln', ['Betreue 160 Bestandskunden im Handwerk und steigerte den Umsatz im Segment um 12 Prozent.', 'Erstelle Angebote und Ausschreibungsunterlagen, Erfolgsquote 38 Prozent.', 'Pflege das CRM (Salesforce) und bereite die Wochenberichte vor.']),
        R('Baustoffe Lenz', 'Kundenberaterin', '2017-02', '2020-03', 'Bonn', ['Beratung von Handwerkern am Telefon und im Verkaufsraum.', 'Aufbau einer Kundendatenbank mit 400 Einträgen.']),
      ],
      education: [['IHK Köln', 'Ausbildung', 'Kauffrau im Groß- und Außenhandel', '2017']],
      skills: { Vertrieb: ['Kundenbetreuung', 'Angebotserstellung', 'Neukundengewinnung'], Tools: ['Salesforce', 'SAP', 'Excel'] },
      certs: [], languages: [['Deutsch', 'Muttersprache'], ['Englisch', 'B1']],
    },
    profile: { fn: 'sales', titles: ['Vertriebsmitarbeiter Innendienst', 'Account Manager Innendienst'], level: 'mid', years: 9, yearsInFn: 9, clusters: [['Innendienst und Kundenbetreuung', ['Kundenbetreuung', 'Angebotserstellung', 'Neukundengewinnung']]], domains: ['Großhandel', 'Haustechnik'], tools: ['Salesforce', 'SAP', 'Excel'], workingLanguages: [], narrative: 'Vertriebsmitarbeiterin mit neun Jahren Erfahrung im Handel. Betreut Bestandskunden, erstellt Angebote und pflegt das CRM.', negative: ['Außendienst mit Firmenwagen und Gebiet', 'Callcenter Agent'], aspirational: ['Key Account Manager'] },
    settings: { target_countries: ['de'], target_cities: ['Köln', 'Bonn', 'Düsseldorf'], target_roles: ['Vertriebsmitarbeiter Innendienst', 'Key Account Manager'], preferred_locations: ['Köln', 'Bonn', 'Leverkusen'], remote_preferences: ['hybrid', 'onsite'], salary_floor: 48000, languages: ['de'], seniority_targets: ['mid'], employment_types: ['full_time'], work_authorization_status: 'authorized', user_skills: ['Salesforce', 'SAP', 'Angebotserstellung'] },
  },
  {
    id: 'p12', label: 'Freelance data engineer with a very long CV, remote only', tags: ['long-cv', 'remote-only', 'multi-country'],
    cv: {
      name: 'Ingrid Solberg', title: 'Freelance Data Engineer', city: 'Oslo', country: 'Norway',
      summary: 'Freelance data engineer with fifteen years of client work on pipelines, warehouses and analytics platforms. Works remotely with teams in Europe and North America.',
      roles: [],
      education: [['University of Oslo', 'M.Sc.', 'Informatics', '2009']],
      skills: { Data: ['Python', 'SQL', 'Spark', 'Airflow', 'dbt', 'Snowflake', 'BigQuery', 'Kafka'], Cloud: ['AWS', 'GCP', 'Terraform'] },
      certs: [['Google Cloud Professional Data Engineer', 'Google'], ['SnowPro Core', 'Snowflake']], languages: [['Norwegian', 'native'], ['English', 'C2'], ['German', 'B1']],
    },
    profile: { fn: 'data', titles: ['Data Engineer', 'Analytics Engineer'], level: 'senior', years: 17, yearsInFn: 17, clusters: [['data pipelines and warehousing', ['Python', 'SQL', 'Spark', 'Airflow', 'dbt']], ['cloud data platforms', ['Snowflake', 'BigQuery', 'AWS', 'GCP']]], secondary: [['streaming', ['Kafka']]], domains: ['retail', 'energy', 'fintech', 'healthcare'], tools: ['Airflow', 'dbt', 'Snowflake', 'BigQuery', 'Kafka', 'Terraform'], workingLanguages: ['Python', 'SQL'], narrative: 'Freelance data engineer with seventeen years of client engagements across retail, energy, fintech and healthcare. Builds pipelines and warehouses on Snowflake and BigQuery.', negative: ['Data Entry', 'Junior Analyst'], aspirational: ['Staff Data Engineer'] },
    settings: { target_countries: ['us', 'ca', 'de', 'gb'], target_cities: [], target_roles: ['Data Engineer', 'Analytics Engineer'], preferred_locations: [], remote_preferences: ['remote_only'], salary_floor: 110000, languages: ['en'], seniority_targets: ['senior', 'staff'], employment_types: ['contract', 'full_time'], work_authorization_status: 'open_to_both', user_skills: ['Python', 'SQL', 'Airflow', 'dbt', 'Snowflake', 'Spark'] },
  },
];

// ---------------------------------------------------------------------------
// The long CV: 70 client engagements, generated, so the serialized CV passes 60,000 characters
// ---------------------------------------------------------------------------

const CLIENT_SECTORS = ['grocery retail', 'wind energy', 'payments', 'hospital group', 'airline', 'insurance', 'telecom', 'publishing', 'logistics', 'e-commerce'];
const CLIENT_NAMES = ['Aurora', 'Beacon', 'Cinder', 'Dunmore', 'Eskil', 'Fjord', 'Garnet', 'Halden', 'Ibis', 'Juniper', 'Kestrel', 'Lumen', 'Marlow', 'Norrby', 'Ostra'];
const BULLET_BANK = [
  (r: () => number) => `Built Airflow pipelines that load ${Math.round(5 + r() * 80)} source tables into Snowflake every night, with data quality checks on each load.`,
  (r: () => number) => `Modelled the reporting layer in dbt: ${Math.round(20 + r() * 150)} models with tests and documentation, adopted by the analytics team.`,
  (r: () => number) => `Cut warehouse cost by ${Math.round(8 + r() * 30)} percent by partitioning the largest tables and moving cold data to cheaper storage.`,
  (r: () => number) => `Migrated a legacy on-premise ETL job set to Spark on AWS; batch runtime fell from ${Math.round(5 + r() * 6)} hours to ${Math.round(1 + r() * 2)}.`,
  (r: () => number) => `Introduced Kafka for ${Math.round(3 + r() * 9)} event streams and wrote the consumers in Python with exactly-once handling.`,
  (r: () => number) => `Wrote the Terraform for the data platform (${Math.round(2 + r() * 5)} environments) and documented the runbook for the client team.`,
  (r: () => number) => `Trained ${Math.round(4 + r() * 20)} analysts on SQL and the new semantic layer through four workshops.`,
  (r: () => number) => `Reviewed the data model with the product owner and removed ${Math.round(5 + r() * 25)} unused tables, simplifying the load schedule.`,
];

export function longCvRoles(): RoleSpec[] {
  const r = rng(12012);
  return Array.from({ length: 70 }, (_, i) => {
    const year = 2026 - Math.floor(i / 4.6);
    const start = `${year - 1}-${String(1 + (i % 12)).padStart(2, '0')}`;
    const end = i === 0 ? null : `${year}-${String(1 + ((i + 5) % 12)).padStart(2, '0')}`;
    const sector = CLIENT_SECTORS[i % CLIENT_SECTORS.length];
    return R(`${CLIENT_NAMES[i % CLIENT_NAMES.length]} ${['AS', 'AB', 'GmbH', 'Inc', 'Ltd'][i % 5]} (${sector}, client engagement ${70 - i})`, i % 3 === 0 ? 'Lead Data Engineer (freelance)' : 'Data Engineer (freelance)', start, end, 'Remote', Array.from({ length: 6 }, (_, k) => BULLET_BANK[(i + k * 3) % BULLET_BANK.length](r)));
  });
}

export function personaCv(p: Persona, index: number): StructuredCV {
  const cv = buildCv(p, index);
  if (p.id !== 'p12') return cv;
  const roles = longCvRoles();
  cv.experience = roles.map((role, i) => ({
    id: `p12-exp-${i + 1}`, company: role.company, position: role.position, location: role.location, startDate: ym(role.start), ...(role.end ? { endDate: ym(role.end) } : {}), current: role.end === null, bullets: role.bullets,
  }));
  return cv;
}
