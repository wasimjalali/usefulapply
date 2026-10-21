/**
 * Applicant logistics in the kit writers: availability, notice period, start
 * date, salary, work permit, relocation, travel and work mode. They are facts
 * about the applicant like any other, so they come from the applicant (the
 * Primary CV, the Master CV, their job preferences or their own rewrite
 * instruction), never from the ad and never from the model.
 *
 * Policy (decided 2026-10-21, after live kits said "I can start as soon as we
 * agree on a date" and "I have no notice period" with neither in any CV):
 * - stated availability is used as stated;
 * - otherwise the market-standard, non-committal wording with no date, or
 *   nothing at all and a next step instead; never "immediately";
 * - salary only when the applicant stated it;
 * - work permit, relocation, travel and work mode only from the applicant.
 *
 * The block is per request, so it rides in the user prompt and the cached
 * system prefix stays static.
 */

import type { MasterContext } from '@/lib/agents/types';
import { sanitizeAdText } from '@/lib/agents/chat-tools/untrusted';
import { normalizeLanguage, type SupportedLanguage } from '@/lib/utils/language-detector';

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese (Portugal)',
  it: 'Italian',
  nl: 'Dutch',
};

/**
 * The non-committal availability wording for each output language: no date,
 * no promise, the notice period the applicant's current contract sets.
 */
const STANDARD_AVAILABILITY: Record<SupportedLanguage, string> = {
  en: '"after my notice period" (for a US job: "after giving notice to my current employer")',
  de: '"nach Ablauf meiner Kündigungsfrist"',
  fr: '"à l\'issue de mon préavis"',
  es: '"una vez finalizado mi preaviso"',
  pt: '"após o período de aviso prévio"',
  it: '"al termine del mio periodo di preavviso"',
  nl: '"na afloop van mijn opzegtermijn"',
};

export function standardAvailabilityWording(language: SupportedLanguage): string {
  return STANDARD_AVAILABILITY[language];
}

// A phrase must start at a word boundary that also holds for non-ASCII letters.
const START = '(?<![\\p{L}\\p{N}])';

// Phrases that state when a person can start. Bare "availability" is left out
// on purpose: "99.9% availability" is a CV achievement, not a start date.
const AVAILABILITY_PATTERN = new RegExp(
  START + '(?:' + [
    'notice period', 'period of notice', 'notice\\s*:',
    'available (?:to start|from|starting|as of|immediately)', 'immediately available', 'availability\\s*:',
    '(?:earliest )?start(?:ing)? date\\s*:', 'earliest start',
    '(?:can|able to) start (?:on|in|from|after|within|immediately)',
    'kündigungsfrist', 'verfügbar ab', 'sofort verfügbar', 'verfügbarkeit\\s*:',
    'eintrittstermin', 'frühestmöglich\\p{L}* eintritt', 'eintritt (?:ab|zum|möglich)',
    'préavis', 'disponible (?:à partir|dès|immédiatement|de suite)', 'disponibilité\\s*:',
    'preaviso', 'disponibilidad\\s*:', 'disponibilidad inmediata', 'incorporación (?:inmediata|a partir)', 'disponible a partir',
    'aviso prévio', 'disponibilidade\\s*:', 'disponibilidade imediata', 'disponível a partir',
    'preavviso', 'disponibilità\\s*:', 'disponibilità immediata', 'disponibile (?:da|dal|a partire)',
    'opzegtermijn', 'beschikbaar (?:per|vanaf)', 'beschikbaarheid\\s*:',
  ].join('|') + ')',
  'iu',
);

const SALARY_PATTERN = new RegExp(
  START + '(?:' + [
    'salary expectations?', 'expected salary', 'desired salary', 'target salary', 'salary requirements?', 'compensation expectations?',
    'gehaltsvorstellung', 'gehaltswunsch', 'gehaltserwartung', 'wunschgehalt',
    'prétentions? salariales?', 'salaire souhaité',
    'pretensi(?:ón|ones) salarial(?:es)?', 'expectativa salarial', 'salario deseado',
    'pretensão salarial', 'pretensões salariais',
    'retribuzione desiderata', 'aspettative economiche', 'ral desiderata',
    'salarisindicatie', 'salariswens', 'gewenst salaris',
  ].join('|') + ')',
  'iu',
);

const MAX_STATED_LINES = 3;
const MAX_STATED_LINE_LENGTH = 200;

function statedLines(pattern: RegExp, sources: Array<string | undefined>): string[] {
  const found: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.replace(/\s+/gu, ' ').trim();
      if (!line || !pattern.test(line) || found.includes(line.slice(0, MAX_STATED_LINE_LENGTH))) continue;
      found.push(line.slice(0, MAX_STATED_LINE_LENGTH));
      if (found.length === MAX_STATED_LINES) return found;
    }
  }
  return found;
}

/** Lines of the applicant's own CVs that look like a statement of their availability, notice period or start date. */
export function statedAvailabilityLines(context: Pick<MasterContext, 'rawCV' | 'masterCV'>): string[] {
  return statedLines(AVAILABILITY_PATTERN, [context.rawCV, context.masterCV]);
}

/** Lines of the applicant's own CVs that look like a statement of their salary expectation. */
export function statedSalaryLines(context: Pick<MasterContext, 'rawCV' | 'masterCV'>): string[] {
  return statedLines(SALARY_PATTERN, [context.rawCV, context.masterCV]);
}

/**
 * The APPLICANT LOGISTICS block for the application email or the cover letter
 * user prompt.
 */
export function buildLogisticsBlock(context: MasterContext, document: 'email' | 'letter'): string {
  const language = normalizeLanguage(context.userLanguageOverride || context.detectedLanguage);
  const location = sanitizeAdText(context.job?.location) || 'Not specified';
  const availability = statedAvailabilityLines(context);
  const salary = statedSalaryLines(context);
  const quoted = (lines: string[]) => lines.map((line) => `- "${line}"`).join('\n');
  const otherSources = document === 'letter'
    ? 'the Primary CV, the Master CV, the relocation constraint or the applicant job preferences in this prompt'
    : 'the Primary CV or the Master CV';

  return `=== APPLICANT LOGISTICS (BINDING) ===
Availability, notice period, start date, salary, work permit, relocation, travel and remote or on-site willingness are facts about the applicant. They come only from the applicant. The job ad is never a source for them: its start date and salary range are the employer's.
Job location (the market): ${location}

Availability, notice period and start date:
${availability.length > 0
    ? `These lines of the applicant's CVs look like a statement of their availability:\n${quoted(availability)}\nIf one of them states the applicant's own availability, notice period or start date, use it as written (in ${LANGUAGE_NAMES[language]}) and add nothing to it. A line about something else does not count.`
    : `Neither CV states the applicant's availability, notice period or start date.`}
When the applicant hasn't stated it, don't invent it. ${document === 'email'
    ? 'The default is to leave availability out and close with a next step.'
    : 'The letter may leave availability out and close with a next step.'} If availability is mentioned, it uses only the standard non-committal wording for this market, ${standardAvailabilityWording(language)}, with no date, and only when the CVs show a current role.
Never write that the applicant can start immediately, right away, at short notice or as soon as a date is agreed, or that they have no notice period, unless the applicant stated exactly that.

Salary:
${salary.length > 0
    ? `These lines of the applicant's CVs look like a statement of their salary expectation:\n${quoted(salary)}\nSalary is mentioned only when the job ad asks for a salary expectation, and only as the applicant stated it.`
    : `The applicant hasn't stated a salary expectation, so salary stays out entirely, even when the job ad asks for one.`}${document === 'letter' ? '\nThe salary floor in the applicant job preferences is a search filter, not a salary expectation, and never appears.' : ''}

Work permit, visa, relocation, travel and remote or on-site willingness: only what ${otherSources} state. Never guessed.
${context.userInstruction ? `
The applicant's rewrite instruction counts as the applicant speaking about their own logistics: an availability, notice period, start date or salary expectation it states may be used as stated. This exception covers those logistics only, never skills, experience, metrics or results.
` : ''}`;
}
