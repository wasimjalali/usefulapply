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

import { callAnthropic } from '@/lib/models/anthropic';
import type { StructuredCV } from '@/lib/types/cv-schema';
import {
  CAREER_PROFILE_SCHEMA_VERSION,
  type CareerProfile,
  type CareerProfileTargetDirection,
} from '@/lib/job-feed/career-profile';

const SYNTHESIS_TEMPERATURE = 0.4;
const SYNTHESIS_MAX_TOKENS = 2500;

const SYSTEM_TEXT = `# Role
You are a career profile synthesizer for an AI job-search assistant. You read a candidate's structured CV and produce a concise, structured semantic profile. Downstream systems will use the profile to (1) generate effective job-search keywords, (2) localize search queries per market, and (3) rank candidate jobs against this person.

# Anti-hallucination rules (hard)
- Every inferred title, skill cluster, function, domain, and signal MUST trace to evidence in the input CV (an experience entry, a bullet, a skill, a project, an education entry).
- Do NOT invent companies, skills, dates, technologies, or accomplishments that are not in the CV.
- If the CV is too thin or ambiguous to support a confident inference, set the relevant confidence field to "low" and explain why in the rationale. Honest uncertainty is preferred over confident invention.
- "Inferred" means "synthesized FROM evidence in the CV," not "guessed."

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
Integer years. Compute from start/end dates in the CV's experience array. yearsInFunction <= yearsTotal. If dates are missing or "Present," compute from earliest start date to today (today = the moment of synthesis).

## primarySkillClusters (1-4 items) and secondarySkillClusters (0-4 items)
Group related skills into named clusters that describe what the candidate can DO, not just what tools they have used. Examples of cluster names: "modern web frontend", "backend services in Go and Postgres", "data engineering on AWS", "growth experimentation", "B2B SaaS product strategy", "user research and qualitative synthesis".
- Primary clusters: deep, repeated experience across multiple roles. evidenceStrength: "strong".
- Secondary clusters: present but less central. evidenceStrength: "moderate" or "mentioned".
Do NOT cluster a skill that appears once in a single bullet as primary. Do NOT include filler skills (Microsoft Office, Email, Communication) unless the candidate's function is one where those are core (Sales Ops, EA).

## industryDomains
Industries the candidate has actually worked in (e.g. "fintech", "consumer-saas", "enterprise-saas", "health-tech", "ecommerce", "ad-tech", "education", "gaming", "travel", "logistics", "media", "government", "non-profit"). Empty array if the candidate has only worked in industry-agnostic contexts.

## toolsEnvironment
Concrete tools, languages, frameworks, clouds, and platforms with strong evidence. Canonicalize (e.g. "JS" -> "JavaScript", "ts" -> "TypeScript"). Cap at ~15 entries. Don't pad.

## workingLanguages
Languages the candidate clearly SHIPS work in (writing code, writing copy, conducting research). Distinct from spoken languages — a German speaker who has only ever worked in English-language environments has English as their working language. Use the language listing as a hint, not a guarantee.

## narrative
3-5 sentences. Plain English. No marketing fluff. The narrative is read by another AI as a soft prior — write it so that AI can quickly understand who this candidate is, what they are strong at, and what they are looking for. Avoid words like "leverage", "robust", "spearheaded", "orchestrated", "delve", "navigate". No em-dashes (use commas, colons, periods, parentheses).

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
2. yearsInFunction <= yearsTotal.
3. inferredTitles[0] is the strongest, most-recent fit.
4. No invented companies, skills, or dates.
5. version equals ${CAREER_PROFILE_SCHEMA_VERSION}.
6. Narrative contains no em-dashes and no AI-tell phrases.
7. targetDirection.pivot is null unless there's real pivot evidence; aspirationalTitles is empty when the candidate is staying on their current track.
`;

export function buildCareerProfileSystemBlocks(): Array<{ type: 'text'; text: string; cache_control: { type: 'ephemeral' } }> {
  return [
    {
      type: 'text',
      text: SYSTEM_TEXT,
      cache_control: { type: 'ephemeral' as const },
    },
  ];
}

export interface GenerateCareerProfileResult {
  profile: CareerProfile;
  modelProvider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export async function generateCareerProfile(cv: StructuredCV): Promise<GenerateCareerProfileResult> {
  const startTime = Date.now();
  const userPrompt = buildSynthesisUserPrompt(cv);

  const response = await callAnthropic({
    prompt: userPrompt,
    systemBlocks: buildCareerProfileSystemBlocks(),
    temperature: SYNTHESIS_TEMPERATURE,
    maxTokens: SYNTHESIS_MAX_TOKENS,
    jsonMode: true,
  });

  const latencyMs = Date.now() - startTime;
  const profile = parseCareerProfileResponse(response.content);

  return {
    profile,
    modelProvider: response.provider ?? 'anthropic',
    modelName: response.model ?? 'unknown',
    inputTokens: response.usage?.inputTokens ?? 0,
    outputTokens: response.usage?.outputTokens ?? 0,
    latencyMs,
  };
}

function buildSynthesisUserPrompt(cv: StructuredCV): string {
  const slimCV = slimStructuredCV(cv);
  return [
    'Synthesize a career profile from this candidate\'s structured CV.',
    'Today\'s date for date math:',
    new Date().toISOString().slice(0, 10),
    '',
    'CV:',
    JSON.stringify(slimCV, null, 2),
  ].join('\n');
}

/**
 * Strip parts of the StructuredCV that the synthesizer doesn't need so input
 * token cost stays bounded for very long CVs. Keeps everything that carries a
 * professional signal; drops UI metadata and template settings.
 */
function slimStructuredCV(cv: StructuredCV): unknown {
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
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : new Date().toISOString(),
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
