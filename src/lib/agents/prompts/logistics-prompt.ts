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
 * The scan below only points the model at likely lines. It is never told that
 * a CV says nothing: a miss falls back to "if a CV states it, use it", because
 * the CV text itself is in the same prompt.
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
    startOpen: 'Ma date de prise de poste est à convenir ensemble.',
    salary: 'Mes prétentions salariales sont à discuter lors d\'un entretien.',
  },
  es: {
    start: 'Puedo incorporarme una vez finalizado mi preaviso.',
    startOpen: 'La fecha de incorporación es a convenir.',
    salary: 'Mis expectativas salariales son negociables y las comento con gusto en una entrevista.',
  },
  pt: {
    start: 'Posso começar após o período de aviso prévio.',
    startOpen: 'A data de início é a combinar.',
    salary: 'A minha pretensão salarial é negociável e posso discuti-la numa entrevista.',
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

// A phrase must start at a word boundary that also holds for non-ASCII letters.
const START = '(?<![\\p{L}\\p{N}])';
// A label ("Availability: ...") opens a line or follows a separator, so a label
// word inside a sentence ("Project start date: 03/2021") is not a label.
const LABEL_START = '(?:^|[|;\\u2022\\u00B7]\\s*)(?:[-*\\u2022\\u00B7]\\s*)?';
// ":", "=", or a spaced hyphen or en dash ("Availability - immediately").
const LABEL_END = '\\s*(?::|=|[-\\u2013]\\s)';
// What follows "available from": a date or a month, not "SAP".
const DATE_AHEAD = '(?:\\d|(?:early|mid|late|anfang|mitte|ende|début|fin|inizio|fine|begin|eind)(?![\\p{L}])|jan|feb|mar|mär|apr|may|mai|jun|jul|aug|sep|oct|okt|nov|dec|dez|maa|mei)';
const COUNT = '(?:\\d+|one|two|three|four|six|eight|twelve|ein|einen|einem|zwei|drei|vier|sechs|un|une|una|um|uma|deux|dos|dois|due|trois|tres|três|tre|een|één|twee|drie)';

function labelled(labels: string[]): string {
  return LABEL_START + '(?:' + labels.join('|') + ')' + LABEL_END;
}

function phrased(phrases: string[]): string {
  return START + '(?:' + phrases.join('|') + ')';
}

// Statements of when a person can start. Bare "availability" and bare
// "notice period" are left out: "99.9% availability" is an achievement and
// "notice period clauses in supplier contracts" is someone's job.
const AVAILABILITY_PATTERN = new RegExp(
  labelled([
    'availability', 'available', 'date available', '(?:earliest (?:possible )?)?start(?:ing)?(?: date)?', 'notice(?: period)?',
    'verfügbarkeit', 'verfügbar', 'kündigungsfrist', 'eintritt(?:stermin|sdatum)?', 'frühest(?:er|möglicher) (?:eintritt(?:stermin)?|starttermin)', 'starttermin',
    'disponibilité', 'date de disponibilité', 'préavis', 'date de début',
    'disponibilidad', 'preaviso', 'incorporación', 'fecha de incorporación',
    'disponibilidade', 'aviso prévio', 'data de início',
    'disponibilità', 'preavviso', 'data di inizio',
    'beschikbaarheid', 'beschikbaar', 'opzegtermijn', 'startdatum',
  ]) + '|' + phrased([
    'my notice period', 'notice period (?:of|is)', COUNT + '[- ]?(?:weeks?|months?)[\'\\u2019]?s?\\s+notice',
    'available (?:to start|immediately|at short notice|for (?:an )?immediate start)', 'available (?:from|as of|starting)\\s+' + DATE_AHEAD,
    'immediately available', '(?:can|could|able to) start (?:on|in|from|after|within|immediately|asap|right away|straight away)',
    'earliest (?:possible )?start(?:ing)? date (?:is|would be)',
    'meine kündigungsfrist', 'kündigungsfrist (?:von|beträgt)', COUNT + '\\s*(?:wochen|monate?n?)\\s+kündigungsfrist',
    'verfügbar (?:ab|zum|sofort|nach)', 'sofort verfügbar', 'eintritt (?:ab|zum|möglich|nach)', 'frühestmöglich\\p{L}* (?:eintritt|start)', 'frühester (?:eintritt|starttermin)',
    'mon préavis', 'préavis (?:de|d[\'\\u2019])\\s*' + COUNT, 'disponible (?:à partir|dès|immédiatement|de suite|sous)', 'disponibilité immédiate',
    'mi preaviso', 'preaviso de\\s*' + COUNT, 'disponibilidad inmediata', 'incorporación (?:inmediata|a partir)', 'disponible (?:a partir|de inmediato|inmediatamente)',
    'meu aviso prévio', 'aviso prévio de\\s*' + COUNT, 'disponibilidade imediata', 'disponível (?:a partir|de imediato|imediatamente)',
    'mio preavviso', 'preavviso di\\s*' + COUNT, 'disponibilità immediata', 'disponibile (?:da subito|dal\\s*\\d|a partire|immediatamente)',
    'mijn opzegtermijn', 'opzegtermijn van\\s*' + COUNT, 'beschikbaar (?:per direct|per omgaande|per\\s*\\d|vanaf\\s*' + DATE_AHEAD + ')',
  ]),
  'iu',
);

const SALARY_PATTERN = new RegExp(
  labelled([
    'salary(?: expectations?| requirements?)?', '(?:desired|expected|target) (?:salary|compensation)', 'compensation(?: expectations?)?',
    'gehalt', 'gehaltsvorstellung(?:en)?', 'gehaltswunsch', 'wunschgehalt',
    'salaire(?: souhaité)?', 'rémunération(?: souhaitée)?', 'prétentions? salariales?',
    'salario(?: deseado)?', 'pretensi(?:ón|ones) salarial(?:es)?', 'expectativa salarial',
    'salário', 'pretensão salarial', 'pretensões salariais',
    'retribuzione(?: desiderata)?', 'ral(?: desiderata)?',
    'salaris', 'salarisindicatie', 'salariswens', 'gewenst salaris',
  ]) + '|' + phrased([
    'salary expectations?', 'expected salary', 'desired salary', 'target salary', 'salary requirements?', 'compensation expectations?', 'desired compensation',
    'gehaltsvorstellung', 'gehaltswunsch', 'gehaltserwartung', 'wunschgehalt',
    'prétentions? salariales?', 'salaire souhaité', 'rémunération souhaitée',
    'pretensi(?:ón|ones) salarial(?:es)?', 'expectativa salarial', 'salario deseado',
    'pretensão salarial', 'pretensões salariais',
    'retribuzione desiderata', 'aspettative economiche', 'ral desiderata',
    'salarisindicatie', 'salariswens', 'gewenst salaris',
  ]),
  'iu',
);

const MAX_STATED_LINES = 5;
const MAX_STATED_LINE_LENGTH = 200;
// How much of a long line to keep before the match, so the quote holds the phrase itself.
const LEAD_BEFORE_MATCH = 60;

/** The part of a line to quote: all of it when short, else a window around the match. */
function quoteAround(line: string, index: number): string {
  if (line.length <= MAX_STATED_LINE_LENGTH) return line;
  const start = Math.max(0, Math.min(index - LEAD_BEFORE_MATCH, line.length - MAX_STATED_LINE_LENGTH));
  const window = line.slice(start, start + MAX_STATED_LINE_LENGTH);
  return `${start > 0 ? '...' : ''}${window}${start + MAX_STATED_LINE_LENGTH < line.length ? '...' : ''}`;
}

function statedLines(pattern: RegExp, sources: Array<string | null | undefined>): string[] {
  const found: string[] = [];
  for (const source of sources) {
    if (!source) continue;
    for (const raw of source.split(/\r?\n/)) {
      const line = raw.replace(/\s+/gu, ' ').trim();
      const match = line ? pattern.exec(line) : null;
      if (!match) continue;
      const quote = quoteAround(line, match.index);
      if (found.includes(quote)) continue;
      found.push(quote);
      if (found.length === MAX_STATED_LINES) return found;
    }
  }
  return found;
}

/**
 * What the applicant has said about their own logistics, as lines to quote.
 * Today it is filled from a scan of their CVs; a structured profile value can
 * be added to the same lists later without touching the prompts.
 */
export interface StatedLogistics {
  /** Lines that may state the applicant's availability, notice period or start date. */
  availability: string[];
  /** Lines that may state the applicant's salary expectation. */
  salary: string[];
}

/** Scan the applicant's own texts (Primary CV first, then the Master CV) for likely logistics lines. */
export function findStatedLogistics(sources: Array<string | null | undefined>): StatedLogistics {
  return {
    availability: statedLines(AVAILABILITY_PATTERN, sources),
    salary: statedLines(SALARY_PATTERN, sources),
  };
}

const quoted = (lines: string[]) => lines.map((line) => `- "${line}"`).join('\n');

/**
 * The APPLICANT LOGISTICS block for the application email or the cover letter
 * user prompt. `stated` defaults to a scan of the context's CVs.
 */
export function buildLogisticsBlock(
  context: MasterContext,
  document: 'email' | 'letter',
  stated: StatedLogistics = findStatedLogistics([context.rawCV, context.masterCV]),
): string {
  const language = normalizeLanguage(context.userLanguageOverride || context.detectedLanguage);
  const location = sanitizeAdText(context.job?.location) || 'Not specified';
  const useAsWritten = `use it as written (in ${LANGUAGE_NAMES[language]}) and add nothing to it`;

  const availability = stated.availability.length > 0
    ? `These lines of the applicant's CVs may state their availability:\n${quoted(stated.availability)}\nIf one of them, or any other line of the Primary CV or Master CV, states the applicant's own availability, notice period or start date, ${useAsWritten}. A line about something else (a project date, a contract clause, system uptime) does not count.`
    : `A scan of the CVs flagged no line about availability. If the Primary CV or Master CV does state the applicant's own availability, notice period or start date, ${useAsWritten}.`;

  const salary = document === 'email'
    ? 'Salary never appears in the email, whatever the CVs, the job ad or an instruction say.'
    : `${stated.salary.length > 0
      ? `These lines of the applicant's CVs may state their salary expectation:\n${quoted(stated.salary)}\n`
      : 'A scan of the CVs flagged no line about a salary expectation.\n'}Salary appears only when the job ad asks for a salary expectation and the applicant stated their own (in the Primary CV, the Master CV${context.userInstruction ? ' or their rewrite instruction' : ''}), and then only as stated. Otherwise salary stays out entirely, even when the job ad asks for one. A pay figure from a past role or from the job ad is not the applicant's expectation.`;

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
    : 'The letter may leave availability out and close with a next step.'} If availability is mentioned, it uses only the standard non-committal wording for this market, ${standardAvailabilityWording(language)}, with no date, and only when the CVs show a current role.
Never write that the applicant can start immediately, right away, at short notice or as soon as a date is agreed, or that they have no notice period, unless the applicant stated exactly that.

Salary:
${salary}

${otherLogistics}
${instruction}`;
}
