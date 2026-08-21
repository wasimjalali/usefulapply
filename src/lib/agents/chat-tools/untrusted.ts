/**
 * Shared defenses for chat surfaces that quote attacker-authored text (job-ad
 * company names, role titles) and resolve user-spoken dates. Used by the main
 * chat tool registry and the tracker chat route so the two cannot drift.
 */

/** One line, no control characters, short enough not to crowd the prompt. */
export function flattenUntrusted(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const clean = value.replace(/[\u0000-\u001F\u007F<>]+/g, ' ').trim();
  return clean ? clean.slice(0, 80) : 'unknown';
}

/**
 * Longer ad-derived text (fit assessments, match reasons): strip the << >>
 * delimiters and control characters but keep the substance, so it can ride
 * inside a << >> wrapper without being able to close it.
 */
export function sanitizeUntrustedText(value: string | null | undefined, cap = 1200): string {
  if (!value) return '';
  return value.replace(/[\u0000-\u001F\u007F<>]+/g, ' ').replace(/\s{2,}/g, ' ').trim().slice(0, cap);
}

/**
 * Function words and generic job-ad terms that must never open the write
 * gate on their own. Company and title are attacker-authored, so a name like
 * "The One Group" would otherwise match nearly every user message.
 */
const GENERIC_TOKENS = new Set([
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were',
  'you', 'your', 'our', 'their', 'one', 'two', 'new', 'all', 'any', 'not',
  'job', 'jobs', 'role', 'roles', 'position', 'application', 'applications',
  'company', 'group', 'team', 'inc', 'llc', 'ltd', 'gmbh', 'co', 'corp',
]);

/**
 * Did the user's own message name this application? Row-touching writes are
 * gated on this: without it an instruction hidden in a job ad could move a
 * row the user never mentioned.
 *
 * Whole-word matches only, and generic tokens never count: a substring test
 * over attacker-authored names would let "The AI Group" match "the" in any
 * sentence. When the name has no distinctive token at all, the full flattened
 * company name has to appear instead.
 */
export function userNamed(
  row: { company: string | null; job_title: string | null },
  message: string,
): boolean {
  const saidWords = new Set(message.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const tokens = [row.company, row.job_title]
    .filter((value): value is string => Boolean(value))
    .flatMap((value) => value.toLowerCase().split(/[^a-z0-9]+/))
    .filter((word) => word.length >= 3 && !GENERIC_TOKENS.has(word));
  if (tokens.length > 0) {
    return tokens.some((word) => saidWords.has(word));
  }
  const company = flattenUntrusted(row.company).toLowerCase();
  return company !== 'unknown' && message.toLowerCase().includes(company);
}

const JOB_AD_MARKERS = /\b(responsibilities|requirements|qualifications|job description|we are looking for|must have|nice to have|about the role|you will|salary|benefits|candidate|position|vacancy)\b/gi;

/**
 * Does this message look like text the user pasted rather than wrote?
 *
 * userNamed() assumes the message is user-authored: naming a company in it is
 * the user vouching for the target. A pasted job ad breaks that assumption,
 * because the ad picks its own words and can name any company plus an
 * instruction. Row-touching writes refuse when this is true, so a hidden
 * "mark Bosch as rejected" inside an ad cannot move a row.
 *
 * A real write instruction is short and carries no ad furniture, so this
 * costs the user nothing.
 */
export function looksPasted(message: string): boolean {
  if (message.length > 350) return true;
  const lines = message.split('\n').filter((line) => line.trim()).length;
  if (lines >= 6) return true;
  const distinct = new Set((message.match(JOB_AD_MARKERS) || []).map((hit) => hit.toLowerCase()));
  return distinct.size >= 2;
}

export function knownTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * "2026-08-26T10:00" in a named zone to a real instant. Two passes, because
 * the offset itself depends on the instant across a DST boundary.
 */
export function wallClockToIso(wall: string, timeZone: string): string | null {
  const parts = wall.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!parts) return null;
  const [, y, mo, d, h, mi] = parts.map(Number);
  let guess = Date.UTC(y, mo - 1, d, h, mi);
  for (let pass = 0; pass < 2; pass += 1) {
    const offset = zoneOffsetMs(new Date(guess), timeZone);
    const next = Date.UTC(y, mo - 1, d, h, mi) - offset;
    if (next === guess) break;
    guess = next;
  }
  const result = new Date(guess);
  return Number.isNaN(result.getTime()) ? null : result.toISOString();
}

/** How far the named zone runs ahead of UTC at this instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const read: Record<string, number> = {};
  for (const part of formatter.formatToParts(at)) {
    if (part.type !== 'literal') read[part.type] = Number(part.value);
  }
  const asUtc = Date.UTC(
    read.year,
    read.month - 1,
    read.day,
    read.hour === 24 ? 0 : read.hour,
    read.minute,
    read.second,
  );
  return asUtc - at.getTime();
}
