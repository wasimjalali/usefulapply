/**
 * The applicant's own start date and salary expectation: the only source the
 * kit writers may use for them (migration 0012, decided 2026-10-21 after live
 * kits invented "I can start as soon as we agree on a date").
 *
 * Pure and shared: the onboarding card, Settings, the MCP tools and the
 * writers all read this one contract. The database loader lives in
 * logistics.server.ts so this module stays safe for client bundles.
 */
import { InvalidInputError } from '@/lib/services/errors';

export const AVAILABILITY_CHOICES = ['immediately', '2_weeks', '1_month', '3_months', 'other'] as const;
export type AvailabilityChoice = (typeof AVAILABILITY_CHOICES)[number];

/** UI copy for the choices (onboarding card chips and the Settings select). */
export const AVAILABILITY_LABELS: Record<AvailabilityChoice, string> = {
  immediately: 'Right away',
  '2_weeks': 'In 2 weeks',
  '1_month': 'In 1 month',
  '3_months': 'In 3 months',
  other: 'Other',
};

export const AVAILABILITY_NOTE_MAX = 200;
export const SALARY_EXPECTATION_MAX = 120;

/** What the writers get. Every field null means the applicant never said, and nothing is invented. */
export interface ApplicantLogistics {
  availability: AvailabilityChoice | null;
  availabilityNote: string | null;
  salaryExpectation: string | null;
}

/** The profile columns this module reads (a subset of the profiles row). */
export interface LogisticsProfileFields {
  availability?: string | null;
  availability_note?: string | null;
  salary_expectation?: string | null;
  availability_asked_at?: string | null;
}

/** The update the profile service writes: snake_case columns, already validated. */
export interface LogisticsPatch {
  availability?: AvailabilityChoice | null;
  availability_note?: string | null;
  salary_expectation?: string | null;
}

export function isAvailabilityChoice(value: unknown): value is AvailabilityChoice {
  return typeof value === 'string' && (AVAILABILITY_CHOICES as readonly string[]).includes(value);
}

function cleanText(value: unknown, max: number, field: string, label: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw new InvalidInputError(`${label} must be text.`, field);
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0) return null;
  if (text.length > max) throw new InvalidInputError(`${label} can be at most ${max} characters.`, field);
  return text;
}

/**
 * Validates an update to the three fields. Only keys present in `input` are
 * returned, so a partial update leaves the others alone. Empty text becomes
 * null. Throws InvalidInputError with a message safe to show the user.
 */
export function normalizeLogisticsUpdate(input: {
  availability?: unknown;
  availabilityNote?: unknown;
  salaryExpectation?: unknown;
}): LogisticsPatch {
  const patch: LogisticsPatch = {};
  if ('availability' in input) {
    const value = input.availability;
    if (value === null || value === undefined || value === '') patch.availability = null;
    else if (isAvailabilityChoice(value)) patch.availability = value;
    else throw new InvalidInputError(`Pick when you can start: ${AVAILABILITY_CHOICES.join(', ')}.`, 'availability');
  }
  if ('availabilityNote' in input) {
    patch.availability_note = cleanText(input.availabilityNote, AVAILABILITY_NOTE_MAX, 'availabilityNote', 'The start date details');
  }
  if ('salaryExpectation' in input) {
    patch.salary_expectation = cleanText(input.salaryExpectation, SALARY_EXPECTATION_MAX, 'salaryExpectation', 'The salary expectation');
  }
  return patch;
}

/** True when an update touches any of the three fields, so the server stamps availability_asked_at. */
export function touchesLogistics(patch: LogisticsPatch): boolean {
  return 'availability' in patch || 'availability_note' in patch || 'salary_expectation' in patch;
}

/** The profile row's values as the writers see them. "Other" with no note counts as not given. */
export function logisticsFromProfile(profile: LogisticsProfileFields | null | undefined): ApplicantLogistics {
  const availability = isAvailabilityChoice(profile?.availability) ? profile.availability : null;
  const availabilityNote = profile?.availability_note?.trim() || null;
  const salaryExpectation = profile?.salary_expectation?.trim() || null;
  return {
    availability: availability === 'other' && !availabilityNote ? null : availability,
    availabilityNote,
    salaryExpectation,
  };
}

/**
 * Ask before the first kit? Only when the profile is loaded, availability is
 * empty and the user was never asked (a skip stamps availability_asked_at). A
 * null profile returns false, so callers wait for the profile to load first.
 */
export function needsAvailabilityPrompt(profile: LogisticsProfileFields | null | undefined): boolean {
  if (!profile) return false;
  if (profile.availability_asked_at) return false;
  return logisticsFromProfile(profile).availability === null;
}

/** Advisory gaps for MCP results: what the user hasn't told us yet. Never blocks anything. */
export function profileGaps(profile: LogisticsProfileFields | null | undefined): Array<'availability' | 'salaryExpectation'> {
  const logistics = logisticsFromProfile(profile);
  const gaps: Array<'availability' | 'salaryExpectation'> = [];
  if (logistics.availability === null) gaps.push('availability');
  if (logistics.salaryExpectation === null) gaps.push('salaryExpectation');
  return gaps;
}

/**
 * An English fact for the writer prompts; the writer phrases it in the
 * document's language. The note, when given, is the applicant's own words and
 * is passed as written.
 */
export function availabilityFact(logistics: ApplicantLogistics): string | null {
  const note = logistics.availabilityNote;
  switch (logistics.availability) {
    case null:
      return null;
    case 'immediately':
      return note ? `can start right away (${note})` : 'can start right away';
    case '2_weeks':
      return note ? `can start two weeks after accepting an offer (${note})` : 'can start two weeks after accepting an offer';
    case '1_month':
      return note ? `can start one month after accepting an offer (${note})` : 'can start one month after accepting an offer';
    case '3_months':
      return note ? `can start three months after accepting an offer (${note})` : 'can start three months after accepting an offer';
    case 'other':
      return note;
  }
}
