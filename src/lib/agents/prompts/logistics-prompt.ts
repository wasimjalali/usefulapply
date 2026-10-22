/**
 * Applicant logistics in the kit writers and screening answers: availability,
 * notice period, start date, salary, work permit, relocation, travel and work
 * mode. They are facts about the applicant like any other, so they come from
 * the applicant (the Primary CV, the Master CV, their job preferences or their
 * own rewrite instruction), never from the ad and never from the model.
 *
 * Policy (decided 2026-10-21, after live kits said "I can start as soon as we
 * agree on a date" and "I have no notice period" with neither in any CV):
 * - stated availability is used as stated;
 * - otherwise the market-standard, non-committal wording with no date, or
 *   nothing at all and a next step instead; never "immediately";
 * - salary only when the applicant stated it, and never in an email;
 * - work permit, relocation, travel and work mode only from the applicant.
 *
 * There is no keyword scan. The full CV texts are in the same prompt, so the
 * model reads them and is told where a statement usually sits and what doesn't
 * count (a project date, a product or system being available, uptime, a
 * contract clause). A scan quoted product lines as possible availability and
 * could only ever point, never decide.
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
  pt: '"após o período de pré-aviso"',
  it: '"al termine del mio periodo di preavviso"',
  nl: '"na afloop van mijn opzegtermijn"',
};

export function standardAvailabilityWording(language: SupportedLanguage): string {
  return STANDARD_AVAILABILITY[language];
}

/**
 * Whole screening answers for the same cases, one set per language. Each
 * `start` sentence carries the language's STANDARD_AVAILABILITY phrase.
 */
const SCREENING_ANSWERS: Record<SupportedLanguage, { start: string; startOpen: string; salary: string }> = {
  en: {
    start: 'I can start after my notice period.',
    startOpen: 'My start date is open to discussion.',
    salary: 'My salary expectation is open to discussion.',
  },
  de: {
    start: 'Ich kann nach Ablauf meiner Kündigungsfrist beginnen.',
    startOpen: 'Den Eintrittstermin stimme ich gern mit Ihnen ab.',
    salary: 'Meine Gehaltsvorstellung bespreche ich gern im persönlichen Gespräch.',
  },
  fr: {
    start: 'Je peux commencer à l\'issue de mon préavis.',
    startOpen: 'Ma date de prise de poste reste à convenir avec vous.',
    salary: 'Mes prétentions salariales sont à discuter lors d\'un entretien.',
  },
  es: {
    start: 'Puedo incorporarme una vez finalizado mi preaviso.',
    startOpen: 'La fecha de incorporación es a convenir.',
    salary: 'Con gusto comentaré mis expectativas salariales en una entrevista.',
  },
  pt: {
    start: 'Posso começar após o período de pré-aviso.',
    startOpen: 'A data de início é a combinar.',
    salary: 'Terei todo o gosto em discutir a minha pretensão salarial numa entrevista.',
  },
  it: {
    start: 'Posso iniziare al termine del mio periodo di preavviso.',
    startOpen: 'La data di inizio è da concordare.',
    salary: 'Le mie aspettative economiche sono da discutere in sede di colloquio.',
  },
  nl: {
    start: 'Ik kan beginnen na afloop van mijn opzegtermijn.',
    startOpen: 'Mijn startdatum bespreek ik graag met u.',
    salary: 'Mijn salarisindicatie bespreek ik graag in een gesprek.',
  },
};

export function screeningLogisticsAnswers(language: SupportedLanguage): { start: string; startOpen: string; salary: string } {
  return SCREENING_ANSWERS[language];
}

const US_START = 'I can start after giving notice to my current employer.';

const SCREENING_LANGUAGES: SupportedLanguage[] = ['en', 'de', 'fr', 'es', 'pt', 'it', 'nl'];

/** The screening prompt's per-language answer list for one case. */
export function screeningAnswerList(kind: 'start' | 'startOpen' | 'salary'): string {
  const list = SCREENING_LANGUAGES
    .map((language) => `  ${LANGUAGE_NAMES[language]}: "${SCREENING_ANSWERS[language][kind]}"`)
    .join('\n');
  return kind === 'start' ? `${list}\n  English, for a US job: "${US_START}"` : list;
}

/** What isn't the applicant's own availability, however it is worded. */
const NOT_AVAILABILITY = 'A project date, a product, feature or system being available, uptime or a contract clause is not the applicant\'s availability and doesn\'t count.';

/** The APPLICANT LOGISTICS block for the application email or the cover letter user prompt. */
export function buildLogisticsBlock(context: MasterContext, document: 'email' | 'letter'): string {
  const language = normalizeLanguage(context.userLanguageOverride || context.detectedLanguage);
  const location = sanitizeAdText(context.job?.location) || 'Not specified';
  const useAsWritten = `use it as written (in ${LANGUAGE_NAMES[language]}) and add nothing to it`;

  const availability = `Check the Primary CV and the Master CV above for the applicant's own statement of their availability, notice period or start date. It usually sits in the header, the profile or the personal details. If either CV states it, ${useAsWritten}. ${NOT_AVAILABILITY}`;

  const salary = document === 'email'
    ? 'Salary never appears in the email, whatever the CVs, the job ad or an instruction say.'
    : `Salary appears only when the job ad asks for a salary expectation and the applicant stated their own (in the Primary CV, the Master CV${context.userInstruction ? ' or their rewrite instruction' : ''}), and then only as stated. It usually sits in the header, the profile or the personal details. A past role's pay, a compensation project, a pay band or a pay figure from the job ad is not the applicant's expectation and doesn't count. Otherwise salary stays out entirely, even when the job ad asks for one.`;

  const otherLogistics = document === 'letter'
    ? 'Relocation: only as the RELOCATION CONSTRAINT above allows. Work permit, visa, travel and remote or on-site willingness: only what the Primary CV, the Master CV or the applicant job preferences state. Never guessed.'
    : 'Work permit, visa, relocation, travel and remote or on-site willingness: only what the Primary CV or the Master CV states. Never guessed.';

  const instruction = !context.userInstruction
    ? ''
    : document === 'email'
      ? '\nThe applicant\'s rewrite instruction counts as the applicant speaking about their own availability: an availability, notice period or start date it states may be used as stated. This exception covers those three only, never salary, work permit, relocation, skills, experience, metrics or results.\n'
      : '\nThe applicant\'s rewrite instruction counts as the applicant speaking about their own logistics: an availability, notice period, start date or salary expectation it states may be used as stated (salary only when the job ad asks for one). This exception covers those logistics only, never work permit, relocation, skills, experience, metrics or results.\n';

  return `=== APPLICANT LOGISTICS (BINDING) ===
Availability, notice period, start date, salary, work permit, relocation, travel and remote or on-site willingness are facts about the applicant. They come only from the applicant. The job ad is never a source for them: its start date and salary range are the employer's.
Job location (the market): ${location}

Availability, notice period and start date:
${availability}
When the applicant hasn't stated it, don't invent it. ${document === 'email'
    ? 'The default is to leave availability out and close with a next step.'
    : 'The letter may leave availability out and close with a next step.'} Without a stated availability, if it is mentioned at all, it uses only the standard non-committal wording for this market, ${standardAvailabilityWording(language)}, with no date, and only when the CVs show a current role.
Never write that the applicant can start immediately, right away, at short notice or as soon as a date is agreed, or that they have no notice period, unless the applicant stated exactly that.

Salary:
${salary}

${otherLogistics}
${instruction}`;
}
