/**
 * AI parser stand-in: the extracted text of a CV goes to a language model that
 * returns the fields an ATS would store (name, contact, jobs with dates and
 * bullets, skills, education), and the result is scored against the source CV.
 * It stands for the LLM-based parsers many ATS products now use.
 *
 * Model: Workers AI `@cf/openai/gpt-oss-120b` through the eval worker's own AI
 * binding (account-authenticated by wrangler, so no key is handled here). The
 * input is the CV's own invented fixture text, not a real person's data. List
 * price $0.35 per M input tokens and $0.75 per M output tokens (Cloudflare
 * Workers AI pricing page, checked 2026-10-20); the run logs tokens and cost.
 */
import { visibleCvData } from '../../../src/lib/cv-templates/hidden';
import { formatDateRange } from '../../../src/lib/cv-templates/locale';
import type { CVData } from '../../../src/lib/cv-templates/types';
import { norm, squash } from './expect';
import { WORKER_URL } from './render';

export const AI_MODEL = '@cf/openai/gpt-oss-120b';
const PRICE_IN_PER_M = 0.35;
const PRICE_OUT_PER_M = 0.75;

export interface AiParsed {
  name: string;
  email: string;
  phone: string;
  jobs: Array<{ title: string; company: string; dates: string; bullets: string[] }>;
  skills: string[];
  education: Array<{ school: string; degree: string; date: string }>;
}

export interface AiUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
}

export const aiUsage: AiUsage = { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };

const SYSTEM = `You are the resume parser of an applicant tracking system. Read the resume text and return JSON only, with exactly these keys:
{"name": string, "email": string, "phone": string,
 "jobs": [{"title": string, "company": string, "dates": string, "bullets": [string]}],
 "skills": [string],
 "education": [{"school": string, "degree": string, "date": string}]}
Copy every value exactly as written in the text. Do not correct, translate, infer or add anything. "skills" holds each individual skill as its own string (split lists on commas), without the group label. "dates" is the date range printed with the job. Return {} fields as empty strings or arrays when the text has nothing.`;

async function callOnce(text: string): Promise<{ parsed: AiParsed | null; error?: string }> {
  let res: Response;
  try {
    res = await fetch(`${WORKER_URL}/ai`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: text },
        ],
        temperature: 0,
        max_tokens: 12000,
        // Copying fields out of a page of text needs little reasoning; low keeps a call to seconds, not minutes.
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(300_000),
    });
  } catch (error) {
    return { parsed: null, error: `AI call failed: ${error instanceof Error ? error.name : 'error'}` };
  }
  if (!res.ok) return { parsed: null, error: `AI call failed with ${res.status}` };
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  aiUsage.calls++;
  aiUsage.promptTokens += body.usage?.prompt_tokens ?? 0;
  aiUsage.completionTokens += body.usage?.completion_tokens ?? 0;
  aiUsage.costUsd = (aiUsage.promptTokens * PRICE_IN_PER_M + aiUsage.completionTokens * PRICE_OUT_PER_M) / 1_000_000;
  const content = body.choices?.[0]?.message?.content ?? '';
  try {
    return { parsed: JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1)) as AiParsed };
  } catch {
    return { parsed: null, error: 'the model did not return JSON' };
  }
}

/** Parses extracted CV text. One retry, then the failure is returned, never swallowed. */
export async function parseWithAi(text: string): Promise<{ parsed: AiParsed | null; error?: string }> {
  if (text.trim().length === 0) return { parsed: null, error: 'no text to parse' };
  const first = await callOnce(text);
  return first.parsed ? first : callOnce(text);
}

export interface AiScore {
  name: boolean;
  email: boolean;
  phone: boolean;
  jobs: { matched: number; total: number };
  bullets: { matched: number; total: number };
  skills: { matched: number; total: number };
  education: { matched: number; total: number };
  error?: string;
}

const digits = (value: string) => value.replace(/\D/g, '');
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();
const bulletText = (value: string) => squash(value.replace(/^[\s\u2022*\u2013-]+/, ''));

/** Exact comparison: a field counts only when the parser returned the CV's own value. */
export function scoreAi(result: { parsed: AiParsed | null; error?: string }, source: CVData): AiScore {
  const data = visibleCvData(source);
  const total = {
    jobs: data.experience.length,
    bullets: data.experience.reduce((n, job) => n + job.bullets.length, 0),
    skills: data.skills.reduce((n, group) => n + group.items.length, 0),
    education: data.education.length,
  };
  const empty: AiScore = {
    name: false,
    email: false,
    phone: false,
    jobs: { matched: 0, total: total.jobs },
    bullets: { matched: 0, total: total.bullets },
    skills: { matched: 0, total: total.skills },
    education: { matched: 0, total: total.education },
    error: result.error,
  };
  const p = result.parsed;
  if (!p) return empty;
  const jobs = Array.isArray(p.jobs) ? p.jobs : [];
  const parsedBullets = new Set(jobs.flatMap((job) => (Array.isArray(job.bullets) ? job.bullets : [])).map(bulletText));
  const parsedSkills = new Set((Array.isArray(p.skills) ? p.skills : []).map((skill) => norm(String(skill)).toLowerCase()));
  const schools = Array.isArray(p.education) ? p.education : [];
  return {
    name: same(p.name ?? '', data.personal.fullName),
    email: same(p.email ?? '', data.personal.email),
    phone: digits(p.phone ?? '').length >= 7 && digits(data.personal.phone).endsWith(digits(p.phone ?? '')),
    jobs: {
      matched: data.experience.filter((exp) => jobs.some((job) => same(job.title ?? '', exp.position) && same(job.company ?? '', exp.company) && same(job.dates ?? '', formatDateRange(data, exp)))).length,
      total: total.jobs,
    },
    bullets: { matched: data.experience.flatMap((exp) => exp.bullets).filter((bullet) => parsedBullets.has(bulletText(bullet))).length, total: total.bullets },
    skills: { matched: data.skills.flatMap((group) => group.items).filter((skill) => parsedSkills.has(norm(skill).toLowerCase())).length, total: total.skills },
    education: { matched: data.education.filter((edu) => schools.some((school) => same(school.school ?? '', edu.institution))).length, total: total.education },
    error: result.error,
  };
}
