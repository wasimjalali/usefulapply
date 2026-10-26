/**
 * Career profile synthesizer.
 *
 * Reads a literal `StructuredCV` and emits a `CareerProfile` for the job-feed
 * pipeline (search-strategy generation + ranker prior). Run only for paid
 * users.
 *
 * IMPORTANT: the output of this module is NEVER read by `src/lib/agents/**`.
 * Application-kit generation (CV writer, cover letter, fit assessment, email)
 * stays grounded in the literal `StructuredCV` to preserve anti-hallucination
 * guarantees in user-facing artifacts.
 */

import { callHaiku, type HaikuCallOptions } from '@/lib/models/haiku';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { StructuredCV } from '@/lib/types/cv-schema';
import { parseYearMonthFromCVDate } from '@/lib/job-feed/cv-experience';
import {
  CAREER_PROFILE_SCHEMA_VERSION,
  type CareerProfile,
  type CareerProfileTargetDirection,
} from '@/lib/job-feed/career-profile';

// Thinking counts toward max_tokens; the profile JSON itself is ~2k tokens.
const SYNTHESIS_MAX_TOKENS = 10000;

// The serialized CV in the prompt never exceeds this (about 33k tokens at the
// worst measured 1.8 chars/token, well under the 90k input budget).
export const SLIM_CV_MAX_CHARS = 60_000;
export const CV_TRUNCATED_MARKER = '[truncated]';

const ENUM_CONFIDENCE = { type: 'string', enum: ['high', 'medium', 'low'] };
const SKILL_CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    skills: { type: 'array', items: { type: 'string' } },
    evidenceStrength: { type: 'string', enum: ['strong', 'moderate', 'mentioned'] },
  },
  required: ['name', 'skills', 'evidenceStrength'],
  additionalProperties: false,
};

// Structured output (output_config.format). parseCareerProfileResponse still
// enforces the semantic rules (yearsInFunction <= yearsTotal, non-empty titles).
export const CAREER_PROFILE_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    version: { type: 'integer' },
    generatedAt: { type: 'string' },
    function: { type: 'string' },
    inferredTitles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          canonical: { type: 'string' },
          confidence: ENUM_CONFIDENCE,
          rationale: { type: 'string' },
        },
        required: ['canonical', 'confidence', 'rationale'],
        additionalProperties: false,
      },
    },
    seniority: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager'] },
        confidence: ENUM_CONFIDENCE,
        rationale: { type: 'string' },
      },
      required: ['level', 'confidence', 'rationale'],
      additionalProperties: false,
    },
    targetDirection: {
      type: 'object',
      properties: {
        aspirationalTitles: { type: 'array', items: { type: 'string' } },
        pivot: {
          anyOf: [
            {
              type: 'object',
              properties: { from: { type: 'string' }, to: { type: 'string' } },
              required: ['from', 'to'],
              additionalProperties: false,
            },
            { type: 'null' },
          ],
        },
        confidence: ENUM_CONFIDENCE,
        rationale: { type: 'string' },
      },
      required: ['aspirationalTitles', 'pivot', 'confidence', 'rationale'],
      additionalProperties: false,
    },
    yearsTotal: { type: 'integer' },
    yearsInFunction: { type: 'integer' },
    primarySkillClusters: { type: 'array', items: SKILL_CLUSTER_SCHEMA },
    secondarySkillClusters: { type: 'array', items: SKILL_CLUSTER_SCHEMA },
    industryDomains: { type: 'array', items: { type: 'string' } },
    toolsEnvironment: { type: 'array', items: { type: 'string' } },
    workingLanguages: { type: 'array', items: { type: 'string' } },
    narrative: { type: 'string' },
    negativeSignals: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'version', 'generatedAt', 'function', 'inferredTitles', 'seniority', 'targetDirection',
    'yearsTotal', 'yearsInFunction', 'primarySkillClusters', 'secondarySkillClusters',
    'industryDomains', 'toolsEnvironment', 'workingLanguages', 'narrative', 'negativeSignals',
  ],
  additionalProperties: false,
};

export const SYSTEM_TEXT = `# Role
You are a career profile synthesizer for an AI job-search assistant. You read a candidate's structured CV and produce a concise, structured semantic profile. Downstream systems will use the profile to (1) generate effective job-search keywords, (2) localize search queries per market, and (3) rank candidate jobs against this person.

# Anti-hallucination rules (hard)
- Every inferred title, skill cluster, function, domain, and signal MUST trace to evidence in the input CV (an experience entry, a bullet, a skill, a project, an education entry).
- Do NOT invent companies, skills, dates, technologies, or accomplishments that are not in the CV.
- If the CV is too thin or ambiguous to support a confident inference, set the relevant confidence field to "low" and explain why in the rationale. Honest uncertainty is preferred over confident invention.
- "Inferred" means "synthesized FROM evidence in the CV," not "guessed."
- Numbers (counts, amounts, percentages, team sizes, maxima, ranges) appear exactly as the CV states them, or not at all. Do not compute your own totals, maxima, ranges or how often a title appears.
- Tie a tool or skill to a piece of work only when that work's bullet names it. A tool that appears only in the skills list is a listed skill, not evidence of what it was used for.
- Keep each achievement with the role it belongs to, and keep the CV's own verbs and levels: "supported a migration" is not "led a migration", one result is not "repeatedly", B2 is not fluent.
- A role whose only bullet is "${CV_TRUNCATED_MARKER}" lost its detail to fit the input. Do not mention the truncation or guess the missing detail.

# Field guidance

## inferredTitles (array, 1-4 items)
Canonical, market-normalized job titles the candidate is well-positioned for. Rank by recency-and-fit. The first entry is the candidate's strongest match. Avoid composite titles ("PM | Founder | Growth Lead") — split them. Avoid wishful titles ("Director of Product" for a 2-year PM). Each entry needs a "rationale" pointing to the experience or skills that support the title.

## function
One of: "engineering", "product", "design", "data", "marketing", "sales", "growth", "operations", "finance", "hr", "legal", "research", "education", "support", "other". Pick the discipline the candidate has worked in MOST recently. Do not pick "other" unless no other label fits.

## seniority.level
One of: "intern", "junior", "mid", "senior", "lead", "staff", "manager". Combine title signals (Senior, Lead, Principal, Junior, Manager, Director) with years of experience and scope of responsibility (team size, budget, individual-contributor vs. people-management bullets). "manager" is reserved for people-management roles. "staff" maps to staff/principal IC tracks.

## targetDirection
Where this candidate is heading NEXT, which is not always the same as where they've been. Read the summary, the trajectory of the most recent role, and any recency trend in their skills.
- aspirationalTitles: 0-3 canonical titles the candidate is moving toward. If a senior IC shows people-management bullets trending up, "Engineering Manager" belongs here even if they've never held the title. If an analyst is picking up pipelines and warehousing, "Analytics Engineer" / "Data Engineer" belongs here. Leave EMPTY when the candidate is clearly deepening on their current track (the inferredTitles already cover them).
- pivot: set { "from": "<current track>", "to": "<target track>" } ONLY when there's real evidence of a deliberate career pivot. Null otherwise. Do not invent a pivot for someone who is simply progressing in seniority on the same track.
- confidence: "high" only with explicit evidence (a stated goal in the summary, a clear recent shift in responsibilities). "low" when you're reading weak tea leaves. Be conservative: a wrong aspirationalTitle steers the whole feed toward roles the candidate can't get.

## yearsTotal / yearsInFunction
Integer years. The user message lists durations computed in code from the CV's experience dates. They are facts: yearsTotal is the total, rounded; yearsInFunction is the sum of the listed durations of the roles in your chosen function, rounded, and never more than yearsTotal. Every duration you mention in a rationale or the narrative uses those figures. Do no date arithmetic of your own.

## primarySkillClusters (1-4 items) and secondarySkillClusters (0-4 items)
Group related skills into named clusters that describe what the candidate can DO, not just what tools they have used. Examples of cluster names: "modern web frontend", "backend services in Go and Postgres", "data engineering on AWS", "growth experimentation", "B2B SaaS product strategy", "user research and qualitative synthesis".
- Primary clusters: deep, repeated experience across multiple roles. evidenceStrength: "strong".
- Secondary clusters: present but less central. evidenceStrength: "moderate" or "mentioned".
Do NOT cluster a skill that appears once in a single bullet as primary. Do NOT include filler skills (Microsoft Office, Email, Communication) unless the candidate's function is one where those are core (Sales Ops, EA).

## industryDomains
Industries the candidate has actually worked in (e.g. "fintech", "consumer-saas", "enterprise-saas", "health-tech", "ecommerce", "ad-tech", "education", "gaming", "travel", "logistics", "media", "government", "non-profit"). Empty array if the candidate has only worked in industry-agnostic contexts. List an industry only when the CV names it or clearly describes it for an employer; never infer one from a company name, a project's users or the school the candidate attended.

## toolsEnvironment
Concrete tools, languages, frameworks, clouds, and platforms with strong evidence. Canonicalize (e.g. "JS" -> "JavaScript", "ts" -> "TypeScript"). Cap at ~15 entries. Don't pad.

## workingLanguages
Human languages (spoken and written) from the CV's languages section, by their English names (German, not Deutsch). Include every language listed at a level the candidate can work in (native, fluent, C1, C2, B2 or similar wording) and leave out beginner levels. Never programming, query or markup languages (Python, SQL, Java, HTML): those belong in toolsEnvironment. When the CV has no languages section, use the language the CV is written in.

## narrative
3-5 sentences. Plain English. No marketing fluff. The narrative is read by another AI as a soft prior: write it so that AI can quickly understand who this candidate is, what they are strong at, and what they want next only where the CV states it. Never state a goal, target role, location, work arrangement or other preference the CV does not state. Avoid words like "leverage", "robust", "spearheaded", "orchestrated", "delve", "navigate". No em-dashes (use commas, colons, periods, parentheses).

## negativeSignals
Roles the candidate is clearly NOT a fit for (used as keyword negatives downstream). Derived from absence of evidence + the candidate's apparent trajectory. Examples: a backend engineer with no design tools listed -> "Product Designer", "UX Designer". A junior developer -> "Engineering Manager", "Director of Engineering". Cap at ~6 entries. Be conservative — false negatives cost the candidate a relevant job.

# Response format
Return ONLY a single valid JSON object matching the schema below. No markdown, no code fences, no commentary.

{
  "version": ${CAREER_PROFILE_SCHEMA_VERSION},
  "generatedAt": "<ISO 8601 timestamp>",
  "function": "<string>",
  "inferredTitles": [
    { "canonical": "<string>", "confidence": "high|medium|low", "rationale": "<short string>" }
  ],
  "seniority": { "level": "<level>", "confidence": "high|medium|low", "rationale": "<short string>" },
  "targetDirection": {
    "aspirationalTitles": ["<string>"],
    "pivot": { "from": "<string>", "to": "<string>" },
    "confidence": "high|medium|low",
    "rationale": "<short string>"
  },
  "yearsTotal": <integer>,
  "yearsInFunction": <integer>,
  "primarySkillClusters": [
    { "name": "<string>", "skills": ["<string>"], "evidenceStrength": "strong|moderate|mentioned" }
  ],
  "secondarySkillClusters": [
    { "name": "<string>", "skills": ["<string>"], "evidenceStrength": "strong|moderate|mentioned" }
  ],
  "industryDomains": ["<string>"],
  "toolsEnvironment": ["<string>"],
  "workingLanguages": ["<string>"],
  "narrative": "<3-5 sentences>",
  "negativeSignals": ["<string>"]
}

# Self-check before returning
1. Every cluster, title, and signal traces to specific evidence in the CV.
2. yearsTotal, yearsInFunction and every duration you mention come from the durations in the user message; yearsInFunction <= yearsTotal.
3. inferredTitles[0] is the strongest, most-recent fit.
4. No invented companies, skills, or dates.
5. version equals ${CAREER_PROFILE_SCHEMA_VERSION}.
6. Narrative contains no em-dashes and no AI-tell phrases.
7. targetDirection.pivot is null unless there's real pivot evidence; aspirationalTitles is empty when the candidate is staying on their current track.
8. No goal, preference, number or tool-to-work link the CV does not state; workingLanguages holds human languages only.
`;

export interface GenerateCareerProfileResult {
  profile: CareerProfile;
  modelProvider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function generateCareerProfile(
  cv: StructuredCV,
  generationContext?: LlmGenerationContext,
): Promise<GenerateCareerProfileResult> {
  const startTime = Date.now();
  const durations = computeExperienceDurations(cv, new Date());

  const response = await callHaiku({
    ...buildCareerProfileCall(cv, durations),
    generationContext: generationContext ?? {
      requestExecutionId: crypto.randomUUID(),
      route: 'job-feed/career-profile',
      feature: 'job_feed',
      operation: 'career_profile_synthesis',
    },
  });

  const latencyMs = Date.now() - startTime;
  const profile = applyCvFacts(parseCareerProfileResponse(response.content), cv, durations);

  return {
    profile,
    modelProvider: response.provider,
    modelName: response.model,
    inputTokens: response.inputTokensTotal,
    outputTokens: response.usage.outputTokens,
    latencyMs,
  };
}

/**
 * The request without its generation context. SYSTEM_TEXT is the cached prefix (identical for every
 * user); the CV, today's year-month and the computed durations are in the user turn, after the marker.
 */
export function buildCareerProfileCall(
  cv: StructuredCV,
  durations: ExperienceDurations,
): Omit<HaikuCallOptions, 'generationContext'> {
  return {
    site: 'career_profile',
    system: { static: SYSTEM_TEXT },
    messages: [{ role: 'user', content: buildSynthesisUserPrompt(cv, durations) }],
    jsonSchema: CAREER_PROFILE_JSON_SCHEMA,
    maxTokens: SYNTHESIS_MAX_TOKENS,
    cacheTtl: '5m',
  };
}

export function buildSynthesisUserPrompt(cv: StructuredCV, durations: ExperienceDurations): string {
  const slimCV = capSlimCvToChars(slimStructuredCV(cv), SLIM_CV_MAX_CHARS);
  const total = durations.totalMonths === null
    ? 'unknown (no experience entry has a usable start date)'
    : `${formatYears(durations.totalMonths)} (overlapping roles counted once)`;
  const roleLines = durations.roles.map((r) => {
    const label = `${oneLine(r.position) || 'Untitled role'} at ${oneLine(r.company) || 'unnamed employer'}`;
    return r.months === null
      ? `- ${label}: no usable start date, not counted`
      : `- ${label}, ${r.start} to ${r.end}: ${formatYears(r.months)}`;
  });
  return [
    'Synthesize a career profile from this candidate\'s structured CV.',
    `Today (year-month): ${durations.today}`,
    '',
    'Durations computed in code from the CV\'s experience dates. Use these figures for yearsTotal, yearsInFunction and every duration you state:',
    `Total experience: ${total}`,
    ...roleLines,
    '',
    'CV:',
    JSON.stringify(slimCV, null, 2),
  ].join('\n');
}

export interface ExperienceRoleDuration {
  position: string;
  company: string;
  /** As written in the CV, for the prompt. */
  start: string;
  end: string;
  /** Inclusive month count (2025-05 to 2025-08 is 4), null when the start date can't be read. */
  months: number | null;
}

export interface ExperienceDurations {
  /** YYYY-MM, UTC. */
  today: string;
  roles: ExperienceRoleDuration[];
  /** Months covered by at least one role (overlaps counted once). 0 with no roles, null when no role is dated. */
  totalMonths: number | null;
}

/**
 * Role and total durations from the CV's experience dates, at month precision. Date math is a fact, not a
 * judgment, so code does it and the model is handed the numbers. A current role, or one without an end date,
 * runs to today; end dates past today are cut to today. Overlapping roles (freelance, a part-time job beside
 * a full-time one) count once in the total.
 */
export function computeExperienceDurations(cv: StructuredCV, now: Date): ExperienceDurations {
  const todayIndex = now.getUTCFullYear() * 12 + now.getUTCMonth();
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const toIndex = (ym: { year: number; month: number }) => ym.year * 12 + (ym.month - 1);

  const intervals: Array<[number, number]> = [];
  const roles = (cv.experience ?? []).map((e): ExperienceRoleDuration => {
    const startText = e.startDate?.normalized ?? e.startDate?.raw;
    const endText = e.current ? undefined : (e.endDate?.normalized ?? e.endDate?.raw);
    const start = parseYearMonthFromCVDate(startText);
    const parsedEnd = endText ? parseYearMonthFromCVDate(endText) : null;
    const base = { position: e.position ?? '', company: e.company ?? '', start: startText ?? 'no start date', end: !endText ? 'present' : parsedEnd ? endText : `${endText} (unreadable, counted to today)` };
    if (!start) return { ...base, months: null };
    const startIndex = toIndex(start);
    const endIndex = Math.min(parsedEnd ? toIndex(parsedEnd) : todayIndex, todayIndex);
    if (endIndex < startIndex) return { ...base, months: 0 };
    intervals.push([startIndex, endIndex]);
    return { ...base, months: endIndex - startIndex + 1 };
  });

  let totalMonths: number | null = roles.length === 0 ? 0 : null;
  if (intervals.length > 0) {
    intervals.sort((a, b) => a[0] - b[0]);
    totalMonths = 0;
    let [curStart, curEnd] = intervals[0];
    for (const [s, e] of intervals.slice(1)) {
      if (s <= curEnd + 1) {
        curEnd = Math.max(curEnd, e);
      } else {
        totalMonths += curEnd - curStart + 1;
        [curStart, curEnd] = [s, e];
      }
    }
    totalMonths += curEnd - curStart + 1;
  }
  return { today, roles, totalMonths };
}

function formatYears(months: number): string {
  return `${(months / 12).toFixed(1)} years`;
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Overwrite what code knows for sure: yearsTotal from the computed total (the model can't out-read the
 * dates), yearsInFunction capped by it, and workingLanguages limited to human languages the CV lists.
 */
export function applyCvFacts(profile: CareerProfile, cv: StructuredCV, durations: ExperienceDurations): CareerProfile {
  const yearsTotal = durations.totalMonths === null ? profile.yearsTotal : Math.round(durations.totalMonths / 12);
  return {
    ...profile,
    yearsTotal,
    yearsInFunction: Math.min(profile.yearsInFunction, yearsTotal),
    workingLanguages: filterWorkingLanguages(profile.workingLanguages, cv),
  };
}

/**
 * Keep only human languages. With a languages section, an entry survives when it names one of the listed
 * languages, in any of the common display languages ("German" matches "Deutsch", "English" matches
 * "Englisch") or verbatim ("Twi"). Without a section, an entry survives when it is a known language name.
 * Either way SQL, Java and C++ go.
 */
export function filterWorkingLanguages(entries: string[], cv: StructuredCV): string[] {
  const listed = (cv.languages ?? []).map((l) => l.language).filter((l): l is string => typeof l === 'string' && l.trim().length > 0);
  if (listed.length === 0) return entries.filter((entry) => languageCode(entry) !== null);
  const keys = new Set(listed.flatMap(languageKeys));
  return entries.filter((entry) => languageKeys(entry).some((key) => keys.has(key)));
}

function languageKeys(name: string): string[] {
  const normalized = normalizeLanguageName(name);
  const code = languageCode(name);
  return code ? [normalized, `code:${code}`] : [normalized];
}

function normalizeLanguageName(name: string): string {
  return name.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim().toLocaleLowerCase('en');
}

// ISO 639 codes for the languages a CV is likely to list, and the display languages a CV is likely to be
// written in. A name outside these still matches a CV entry verbatim.
const LANGUAGE_CODES = [
  'af', 'am', 'ar', 'az', 'be', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de', 'el', 'en', 'es', 'et', 'eu',
  'fa', 'fi', 'fil', 'fr', 'ga', 'gl', 'gu', 'ha', 'he', 'hi', 'hr', 'hu', 'hy', 'id', 'ig', 'is', 'it', 'ja',
  'ka', 'kk', 'km', 'kn', 'ko', 'ku', 'ky', 'lb', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms', 'mt', 'my',
  'ne', 'nl', 'no', 'nb', 'nn', 'pa', 'pl', 'ps', 'pt', 'ro', 'ru', 'si', 'sk', 'sl', 'so', 'sq', 'sr', 'sv',
  'sw', 'ta', 'te', 'th', 'tl', 'tr', 'uk', 'ur', 'uz', 'vi', 'xh', 'yo', 'yue', 'zh', 'zu',
];
const DISPLAY_LOCALES = ['en', 'de', 'fr', 'es', 'it', 'nl', 'pt', 'pl', 'sv', 'da', 'nb', 'fi', 'cs', 'ro', 'hu', 'el', 'tr', 'ru', 'uk', 'ar', 'zh', 'ja', 'ko'];

let languageCodeByName: Map<string, string> | null = null;

function languageCode(name: string): string | null {
  if (!languageCodeByName) {
    const map = new Map<string, string>();
    for (const locale of DISPLAY_LOCALES) {
      const names = new Intl.DisplayNames([locale], { type: 'language' });
      for (const code of LANGUAGE_CODES) {
        const display = names.of(code);
        if (display && display !== code) {
          const key = normalizeLanguageName(display);
          if (!map.has(key)) map.set(key, code);
        }
      }
    }
    for (const code of LANGUAGE_CODES) {
      const display = new Intl.DisplayNames([code], { type: 'language' }).of(code);
      if (display && display !== code) {
        const key = normalizeLanguageName(display);
        if (!map.has(key)) map.set(key, code);
      }
    }
    languageCodeByName = map;
  }
  return languageCodeByName.get(normalizeLanguageName(name)) ?? null;
}

/**
 * Strip parts of the StructuredCV that the synthesizer doesn't need so input
 * token cost stays bounded for very long CVs. Keeps everything that carries a
 * professional signal; drops UI metadata and template settings.
 */
export function slimStructuredCV(cv: StructuredCV) {
  return {
    personal: {
      currentTitle: cv.personal?.currentTitle ?? null,
      city: cv.personal?.city ?? null,
      country: cv.personal?.country ?? null,
    },
    summary: cv.summary ?? null,
    experience: (cv.experience ?? []).map((e) => ({
      company: e.company,
      position: e.position,
      location: e.location,
      startDate: e.startDate?.normalized ?? e.startDate?.raw ?? null,
      endDate: e.current ? 'present' : (e.endDate?.normalized ?? e.endDate?.raw ?? null),
      bullets: e.bullets ?? [],
    })),
    education: (cv.education ?? []).map((e) => ({
      institution: e.institution,
      degree: e.degree,
      field: e.field,
      endDate: e.endDate?.normalized ?? e.endDate?.raw ?? null,
    })),
    skills: cv.skills ?? [],
    certifications: (cv.certifications ?? []).map((c) => ({ name: c.name, issuer: c.issuer })),
    languages: (cv.languages ?? []).map((l) => ({ language: l.language, proficiency: l.proficiency })),
    projects: (cv.projects ?? []).map((p) => ({
      name: p.name,
      description: p.description,
      technologies: p.technologies ?? [],
    })),
    additionalSections: (cv.additionalSections ?? []).map((s) => ({
      title: s.title,
      items: s.items ?? [],
    })),
  };
}

/**
 * Keep the serialized CV under maxChars. Drops the oldest roles' bullets first
 * (replaced by one "[truncated]" bullet so the model sees the role existed and
 * lost detail), one role at a time, until it fits. Oldest = earliest startDate;
 * roles without a parseable date come after the dated ones, bottom of the list
 * first (reverse-chronological CVs end with their oldest roles). Throws when
 * dropping every role's bullets still doesn't fit, rather than sending a
 * request that blows the input budget.
 */
export function capSlimCvToChars<T extends { experience: Array<{ startDate: string | null; bullets: string[] }> }>(
  slim: T,
  maxChars: number,
): T {
  const serialize = (value: T) => JSON.stringify(value, null, 2);
  if (serialize(slim).length <= maxChars) return slim;

  const dated: number[] = [];
  const undated: number[] = [];
  slim.experience.forEach((role, index) => {
    (role.startDate && /^\d{4}/.test(role.startDate) ? dated : undated).push(index);
  });
  dated.sort((a, b) => (slim.experience[a].startDate as string).localeCompare(slim.experience[b].startDate as string) || b - a);
  undated.sort((a, b) => b - a);

  const capped = { ...slim, experience: slim.experience.map((role) => ({ ...role })) } as T;
  for (const index of [...dated, ...undated]) {
    const role = capped.experience[index];
    if (role.bullets.length === 1 && role.bullets[0] === CV_TRUNCATED_MARKER) continue;
    role.bullets = [CV_TRUNCATED_MARKER];
    if (serialize(capped).length <= maxChars) return capped;
  }
  throw new Error(`CV is too large for career profile synthesis: ${serialize(capped).length} chars after dropping all role bullets (cap ${maxChars}).`);
}

export class CareerProfileParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = 'CareerProfileParseError';
  }
}

export function parseCareerProfileResponse(content: string): CareerProfile {
  const trimmed = content.trim();
  const jsonStart = trimmed.indexOf('{');
  const jsonEnd = trimmed.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new CareerProfileParseError('Response did not contain a JSON object.', content);
  }
  const jsonText = trimmed.slice(jsonStart, jsonEnd + 1);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'JSON parse failed.';
    throw new CareerProfileParseError(`Career profile JSON parse failed: ${message}`, content);
  }

  return validateCareerProfilePayload(parsed);
}

function validateCareerProfilePayload(value: unknown): CareerProfile {
  if (!value || typeof value !== 'object') {
    throw new CareerProfileParseError('Career profile payload was not an object.', String(value));
  }

  const candidate = value as Record<string, unknown>;
  const inferredTitles = ensureArray(candidate.inferredTitles).map((t, idx) => {
    const title = ensureRecord(t, `inferredTitles[${idx}]`);
    return {
      canonical: ensureNonEmptyString(title.canonical, `inferredTitles[${idx}].canonical`),
      confidence: ensureConfidence(title.confidence, `inferredTitles[${idx}].confidence`),
      rationale: ensureString(title.rationale, `inferredTitles[${idx}].rationale`),
    };
  });
  if (inferredTitles.length === 0) {
    throw new CareerProfileParseError('inferredTitles must contain at least one entry.', '');
  }

  const seniorityRaw = ensureRecord(candidate.seniority, 'seniority');
  const seniority = {
    level: ensureSeniorityLevel(seniorityRaw.level, 'seniority.level'),
    confidence: ensureConfidence(seniorityRaw.confidence, 'seniority.confidence'),
    rationale: ensureString(seniorityRaw.rationale, 'seniority.rationale'),
  };

  const targetDirection = parseTargetDirection(candidate.targetDirection);

  const yearsTotal = clampInteger(candidate.yearsTotal, 0, 80, 'yearsTotal');
  const yearsInFunction = clampInteger(candidate.yearsInFunction, 0, yearsTotal, 'yearsInFunction');

  const primarySkillClusters = mapClusters(candidate.primarySkillClusters, 'primarySkillClusters');
  const secondarySkillClusters = mapClusters(candidate.secondarySkillClusters ?? [], 'secondarySkillClusters');

  const profile: CareerProfile = {
    version: CAREER_PROFILE_SCHEMA_VERSION,
    // The server's clock, never the model's: the model does not know the time and wrote dates like
    // 2026-10-01T00:00:00Z, which the card then showed as when the CV was read.
    generatedAt: new Date().toISOString(),
    function: ensureNonEmptyString(candidate.function, 'function'),
    inferredTitles,
    seniority,
    targetDirection,
    yearsTotal,
    yearsInFunction,
    primarySkillClusters,
    secondarySkillClusters,
    industryDomains: stringArray(candidate.industryDomains, 'industryDomains'),
    toolsEnvironment: stringArray(candidate.toolsEnvironment, 'toolsEnvironment'),
    workingLanguages: stringArray(candidate.workingLanguages, 'workingLanguages'),
    narrative: ensureString(candidate.narrative, 'narrative'),
    negativeSignals: stringArray(candidate.negativeSignals ?? [], 'negativeSignals'),
  };

  return profile;
}

// Degrades gracefully: targetDirection is a soft enhancement, so a model that
// omits it or returns a malformed confidence/rationale should NOT nuke the
// whole profile synthesis (there is no retry). Missing/invalid → a safe empty
// direction (no aspirational titles, low confidence). aspirationalTitles is the
// only field that carries real signal, and it's defaulted to [].
function parseTargetDirection(value: unknown): CareerProfileTargetDirection {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  const confidence = record.confidence;
  return {
    aspirationalTitles: stringArray(Array.isArray(record.aspirationalTitles) ? record.aspirationalTitles : [], 'targetDirection.aspirationalTitles').slice(0, 3),
    pivot: parsePivot(record.pivot),
    confidence: (confidence === 'high' || confidence === 'medium' || confidence === 'low') ? confidence : 'low',
    rationale: typeof record.rationale === 'string' ? record.rationale : '',
  };
}

function parsePivot(value: unknown): CareerProfileTargetDirection['pivot'] {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const from = typeof record.from === 'string' ? record.from.trim() : '';
  const to = typeof record.to === 'string' ? record.to.trim() : '';
  if (!from || !to) return null;
  return { from, to };
}

function ensureArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function ensureRecord(value: unknown, fieldPath: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CareerProfileParseError(`${fieldPath} must be an object.`, String(value));
  }
  return value as Record<string, unknown>;
}

function ensureString(value: unknown, fieldPath: string): string {
  if (typeof value !== 'string') {
    throw new CareerProfileParseError(`${fieldPath} must be a string.`, String(value));
  }
  return value;
}

function ensureNonEmptyString(value: unknown, fieldPath: string): string {
  const str = ensureString(value, fieldPath).trim();
  if (str.length === 0) {
    throw new CareerProfileParseError(`${fieldPath} must be a non-empty string.`, '');
  }
  return str;
}

function ensureConfidence(value: unknown, fieldPath: string): CareerProfile['seniority']['confidence'] {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  throw new CareerProfileParseError(`${fieldPath} must be "high", "medium", or "low".`, String(value));
}

const VALID_SENIORITY = new Set<CareerProfile['seniority']['level']>([
  'intern', 'junior', 'mid', 'senior', 'lead', 'staff', 'manager',
]);

function ensureSeniorityLevel(value: unknown, fieldPath: string): CareerProfile['seniority']['level'] {
  if (typeof value === 'string' && VALID_SENIORITY.has(value as CareerProfile['seniority']['level'])) {
    return value as CareerProfile['seniority']['level'];
  }
  throw new CareerProfileParseError(`${fieldPath} must be one of ${[...VALID_SENIORITY].join(', ')}.`, String(value));
}

function clampInteger(value: unknown, min: number, max: number, fieldPath: string): number {
  const num = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(num)) {
    throw new CareerProfileParseError(`${fieldPath} must be a number.`, String(value));
  }
  return Math.max(min, Math.min(max, Math.round(num)));
}

function mapClusters(value: unknown, fieldPath: string): CareerProfile['primarySkillClusters'] {
  return ensureArray(value).map((c, idx) => {
    const cluster = ensureRecord(c, `${fieldPath}[${idx}]`);
    const evidence = cluster.evidenceStrength;
    if (evidence !== 'strong' && evidence !== 'moderate' && evidence !== 'mentioned') {
      throw new CareerProfileParseError(`${fieldPath}[${idx}].evidenceStrength must be strong/moderate/mentioned.`, String(evidence));
    }
    return {
      name: ensureNonEmptyString(cluster.name, `${fieldPath}[${idx}].name`),
      skills: stringArray(cluster.skills, `${fieldPath}[${idx}].skills`),
      evidenceStrength: evidence,
    };
  });
}

function stringArray(value: unknown, fieldPath: string): string[] {
  if (!Array.isArray(value)) {
    throw new CareerProfileParseError(`${fieldPath} must be an array of strings.`, String(value));
  }
  const result: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim().length > 0) {
      result.push(entry.trim());
    }
  }
  return result;
}
