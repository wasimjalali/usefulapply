/**
 * Scripted answers for the Anthropic Messages API, keyed by which writer is
 * asking (read off the system prompt). The fixtures are the same ones
 * scripts/verify-kit-isolation.ts uses, so the real validators, the real
 * context builders and the real writers all run; only the HTTP transport is
 * replaced.
 */

export type Writer =
  | 'applicant'
  | 'job'
  | 'metrics'
  | 'match'
  | 'fit'
  | 'cv'
  | 'coverLetter'
  | 'applicationEmail'
  | 'followUpEmail';

export const NAME = 'Tomas Brandt';

export const PRIMARY_CV = [
  'Tomas Brandt',
  'Financial Analyst',
  'Calder Industrial Components, Mar 2022 - Present',
  '- Own the monthly forecast and variance reporting for two business units',
  '- Improved forecast accuracy for the larger unit from 88% to 96%',
].join('\n');

export const JOB_DESCRIPTION = [
  'Senior FP&A Analyst at Northwind Foods.',
  'You own the rolling forecast and month-end reporting.',
  'Required: Forecasting.',
].join(' ');

const CV_JSON = JSON.stringify({
  personal: { fullName: NAME, email: 'tomas.brandt@example.com', city: 'Chicago', currentTitle: 'Financial Analyst' },
  summary: 'Financial analyst with 5 years of experience in budgeting, forecasting and month-end reporting.',
  experience: [{
    id: 'exp-1',
    company: 'Calder Industrial Components',
    position: 'Financial Analyst',
    startDate: 'Mar 2022',
    current: true,
    bullets: [
      'Own the monthly forecast and variance reporting for two business units',
      'Improved forecast accuracy for the larger unit from 88% to 96%',
    ],
  }],
  education: [{ id: 'edu-1', institution: 'University of Illinois Chicago', degree: 'B.S. Finance' }],
  skills: [{ category: 'Tools', items: ['Excel', 'Power BI', 'SAP'] }],
  languages: [{ language: 'English', proficiency: 'Native' }],
  certifications: [],
  projects: [],
  customSections: [],
  additionalInfo: [],
  analysis: { summary: 'Tailored to FP&A.', key_changes: ['Led with forecasting'], ats_compatibility: 82, missing_keywords_added: [] },
  sectionHeaders: { summary: 'Summary', experience: 'Experience' },
  localizedStrings: { present: 'Present' },
});

const LETTER_SENTENCES = [
  'At Calder Industrial Components I own the monthly forecast and variance reporting for two business units.',
  'I rebuilt the forecast model around order backlog, and accuracy for the larger unit rose from 88% to 96%.',
  'Month-end close reporting now takes 6 working days instead of 9 because I automated the journal checks in Excel VBA.',
  'Plant managers read the Power BI dashboards I build on SAP data every week.',
  'At Redfern Stores I prepared the weekly store P&L packs and the annual budget for the regional team.',
  'I also found a supplier rebate that was not being claimed, worth about 120,000 USD a year.',
];
const LETTER = [
  'Dear Hiring Team,',
  '',
  ...Array.from({ length: 30 }, (_, i) => LETTER_SENTENCES[i % LETTER_SENTENCES.length]),
  '',
  'Kind regards,',
  NAME,
].join('\n');

const APPLICATION_EMAIL = JSON.stringify({
  subject: `Application: Senior Financial Planning and Analysis Analyst, Corporate Finance, ${NAME}`,
  body: [
    'Dear Hiring Team,',
    '',
    'I own the monthly forecast for two business units at Calder Industrial Components. I rebuilt that model around order backlog. Accuracy for the larger unit rose from 88% to 96%. I shortened month-end reporting from 9 working days to 6. I build Power BI dashboards on SAP data for plant managers. My CV and cover letter are attached. I can talk any day next week.',
    '',
    'Kind regards,',
    NAME,
  ].join('\n'),
});

const FOLLOW_UP = JSON.stringify({
  subject: `Following Up: Senior Financial Planning and Analysis Analyst role, ${NAME}`,
  body: [
    'Dear Hiring Team,',
    '',
    Array.from({ length: 6 }, () => 'I applied last week and I am still keen on the role, because the month-end work you describe is the work I do every month at Calder Industrial Components for two business units.').join(' '),
    '',
    'Kind regards,',
    NAME,
  ].join('\n'),
  recommendedDelay: 5,
});

const FIT = [
  '**Good Fit (68%)**',
  '',
  '**Strengths:**',
  ...Array.from({ length: 12 }, (_, i) => `- Monthly forecasting and variance reporting for two business units, point ${i + 1}, from the Calder role`),
  '',
  '**Gaps:**',
  ...Array.from({ length: 10 }, (_, i) => `- No documented consolidation experience in a group finance team, gap ${i + 1}`),
  '',
  '**Recommendation:** Apply now and lead with the forecast accuracy work, because that is the strongest match to what this team needs.',
].join('\n');

const APPLICANT = JSON.stringify({
  name: NAME,
  email: 'tomas.brandt@example.com',
  phone: null,
  address: 'Chicago',
  headline: 'Financial Analyst',
  skills: ['Forecasting'],
  tools: [],
  languages: ['English'],
  experiences: [{
    company: 'Calder Industrial Components',
    title: 'Financial Analyst',
    startDate: 'Mar 2022',
    endDate: 'Present',
    bullets: [
      'Own the monthly forecast and variance reporting for two business units',
      'Improved forecast accuracy for the larger unit from 88% to 96%',
    ],
  }],
  certifications: [],
});

const JOB = JSON.stringify({
  title: 'Senior FP&A Analyst',
  companyName: 'Northwind Foods',
  location: null,
  workType: null,
  requiredSkills: ['Forecasting'],
  niceToHaveSkills: [],
  responsibilities: ['Own the rolling forecast'],
  startDate: null,
  expectedSalary: null,
});

const METRICS = JSON.stringify(['88%', '96%']);

const MATCH = JSON.stringify({
  details: [{
    requirement: 'Forecasting',
    evidence: 'Own the monthly forecast and variance reporting for two business units',
    tier: 1,
    claimable: true,
  }],
  score: 68,
});

/** Which writer is asking, read off its system prompt. */
export function writerFor(system: unknown): Writer | null {
  const text = Array.isArray(system)
    ? system.map((block) => (block as { text?: string }).text ?? '').join('\n')
    : String(system ?? '');
  if (text.includes('You are the Writer Agent for Useful Apply')) return 'cv';
  if (text.includes('You are an expert cover letter writer for Useful Apply')) return 'coverLetter';
  if (text.includes('You write job application emails for Useful Apply')) return 'applicationEmail';
  if (text.includes('You are the follow-up email writer for Useful Apply')) return 'followUpEmail';
  if (text.includes('You are Useful Apply, a senior talent acquisition specialist')) return 'fit';
  if (text.includes('You are a precise CV parser that extracts factual information')) return 'applicant';
  if (text.includes('You are a job description parser')) return 'job';
  if (text.includes('You are a precise data extraction tool')) return 'metrics';
  if (text.includes('ATS-calibrated skill matching engine')) return 'match';
  return null;
}

export function answerFor(writer: Writer): string {
  switch (writer) {
    case 'applicant': return APPLICANT;
    case 'job': return JOB;
    case 'metrics': return METRICS;
    case 'match': return MATCH;
    case 'fit': return FIT;
    case 'cv': return CV_JSON;
    case 'coverLetter': return LETTER;
    case 'applicationEmail': return APPLICATION_EMAIL;
    case 'followUpEmail': return FOLLOW_UP;
  }
}

/** The message object the Anthropic SDK expects for a text answer. */
export function messageFor(text: string) {
  return {
    id: `msg_stub_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}
