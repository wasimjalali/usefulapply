/**
 * Chat UX cases: 33 turns in 9 conversations over the 25-row tracker and the open application from the
 * 2026-10-22 harness (Thursday 2026-10-22, Berlin, signed-in user Lena Hoffmann).
 *
 *   German      12 turns, 3 conversations. The user writes German; the pasted ad, the CV, the tool results (the
 *               tracker comes back as English JSON) and the history are English. The reply must be German.
 *   Length       8 turns, English, each one tempts a long answer. At most 3 sentences.
 *   Screening    8 turns, EN and DE: 4 that bring up the application form's questions (the chat must call
 *               offer_screening_answers and return a start-screening-flow chip) and 4 that look close and are not.
 *   Claims       4 turns (kit contents, ATS score), EN and DE. No count of documents and no score that no tool
 *               result or context gave the model.
 *   Compaction   1 turn on a seeded German history of about 100k characters: the route compacts it, and the stored
 *               summary must keep its `<<copied ad text: ...>>` lines in German.
 *
 * History is the route's own (D1). A conversation's first case seeds earlier messages straight into chat_messages
 * (`seed`); every later turn is written by the route itself.
 *
 * `script` is what a perfect model would do, used only by the dry run. `badReply` is a reply that must grade as a
 * failure (the self-test checks every case against it).
 */
import type Database from 'better-sqlite3';
import { ad, WRITE_TOOLS } from '../../haiku-55-swap/fixtures/chat';
import { rowId } from '../../haiku-55-swap/fixtures/tracker';

export const OFFER_SCREENING_TOOL = 'offer_screening_answers';
export const SCREENING_CHIP = 'start-screening-flow';

export type Category = 'german' | 'length' | 'screening_pos' | 'screening_neg' | 'claims' | 'compaction';

type Calls = Array<{ name: string; input: Record<string, unknown> }>;
export type ScriptStep = Calls;

export interface SeedMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface UxExpect {
  /** Tools that must be called (any round). */
  tools?: string[];
  /** Tools that must not be called. Every write tool not listed in `tools` is forbidden too. */
  forbidden?: string[];
  /** Chip action prefixes the response must carry. */
  chips?: string[];
  /** Chip action prefixes the response must not carry. */
  forbiddenChips?: string[];
  executed?: string[];
  /** Row keys (tracker fixture) this turn may change. Empty: no row may change. */
  mayChange?: string[];
  db?: (db: Database.Database) => string[];
  reply?: { german?: boolean; maxSentences?: number; mustMatch?: RegExp[]; mustNotMatch?: RegExp[] };
  /** The route must have compacted this turn, and the stored summary must keep its copied ad lines in German. */
  summaryGerman?: boolean;
}

export interface UxCase {
  id: string;
  group: string;
  turn: number;
  lang: 'en' | 'de';
  category: Category;
  message: string;
  withCv?: boolean;
  /** First turn of a conversation only: messages that already sit in the application's chat history. */
  seed?: SeedMessage[];
  /** The case needs a chat tool the build may not have yet. A dry run on a build without it reports the case as skipped. */
  requiresTool?: string;
  expect: UxExpect;
  script: ScriptStep[];
  finalReply: string;
  /** Dry self-test only: a reply the category's check must reject. */
  badReply: string;
  /** Dry run of the compaction request: the summary the block carries. */
  compactionSummary?: string;
}

const AD_EN = ad('syn-08');
const AD_DE_LONG = (() => {
  const head = ad('syn-15', 3_000);
  const filler = '\nWir bieten: 30 Tage Urlaub, flexible Arbeitszeiten, mobiles Arbeiten, ein Jobrad und ein Team, das deine Ideen ernst nimmt.';
  let text = head;
  while (text.length < 30_000) text += filler;
  return text.slice(0, 30_000);
})();

const statusIs = (key: string, status: string) => (db: Database.Database): string[] => {
  const r = db.prepare('SELECT status FROM application_sessions WHERE id = ?').get(rowId(key)) as { status: string } | undefined;
  if (!r) return [`${key} row is gone`];
  return r.status === status ? [] : [`${key} status ${r.status}, expected ${status}`];
};

const call = (name: string, input: Record<string, unknown> = {}): Calls => [{ name, input }];

// ---- claims patterns -----------------------------------------------------------------------------------------

/** A count of documents the model has no source for: the overview tool returns yes/no per document, never a number of emails. */
const KIT_COUNT_EN = /\b(?:two|three|four|five|2|3|4|5)\s+(?:(?:application|follow[- ]?up|different|separate)\s+)?(?:e-?mails?|documents?|letters?|files?|versions?|drafts?)\b|\b(?:all|both)\s+(?:four|three|two|4|3|2)\b/i;
const KIT_COUNT_DE = /\b(?:zwei|drei|vier|fünf|2|3|4|5)\s+(?:\w+\s+)?(?:e-?mails?|dokumente?n?|anschreiben|dateien|versionen|entwürfe?)\b|\balle[n]?\s+(?:vier|drei|zwei|4|3|2)\b/i;
/** A number near "ATS": no tool or context holds an ATS score (the match score is a different number). */
const ATS_EN = /\bATS\b[^.!?\n]{0,50}\b\d{1,3}\b|\b\d{1,3}\s*(?:%|\/\s*100|out of 100|percent)[^.!?\n]{0,40}\bATS\b/i;
const ATS_DE = /\bATS\b[^.!?\n]{0,50}\b\d{1,3}\b|\b\d{1,3}\s*(?:%|\/\s*100|von 100|Prozent)[^.!?\n]{0,40}\bATS\b/i;

// ---- compaction seed -----------------------------------------------------------------------------------------

function notes(part: number): string {
  const topics = [
    'Bei Calder habe ich die Monatsabschluesse fuer zwei Werke verantwortet und die Abweichungsanalyse in Power BI aufgebaut.',
    'Die rollierende Prognose lief vorher in vierzig Excel-Dateien, danach in einem SAP-Modell mit einer einzigen Quelle.',
    'Mit den Werksleitern habe ich jeden Monat die Kostenstellen durchgesprochen und die Abweichungen erklaert.',
    'Im Budgetprozess habe ich die Planung fuer Personal- und Sachkosten koordiniert und die Termine gehalten.',
  ];
  let text = `Meine Notizen fuer das Gespraech, Teil ${part}. `;
  let i = 0;
  while (text.length < 11_000) text += `${topics[i++ % topics.length]} `;
  return text.slice(0, 11_000);
}

/**
 * About 108k characters of German history: the long ad, the user's constraints, one tool confirmation, then seven
 * 11k notes. The route cuts each turn to 11.3k characters, so the replayed history is about 88k characters, which
 * puts the projected input past the 75k-token line (the same shape as evals/chat-compaction/live-check.ts).
 */
function compactionHistory(): SeedMessage[] {
  const turns: SeedMessage[] = [
    { role: 'user', content: AD_DE_LONG },
    { role: 'assistant', content: 'Das ist eine Stelle im Firmenkundengeschäft bei ottonova in München. Soll ich zuerst die Passung prüfen oder direkt die Bewerbung schreiben?' },
    { role: 'user', content: 'Meine Kuendigungsfrist ist drei Monate, und ich will nicht unter 72.000 Euro. Das Anschreiben bitte unter 250 Woertern.' },
    { role: 'assistant', content: 'Notiert: drei Monate Kuendigungsfrist, ab 72.000 Euro, Anschreiben unter 250 Woertern.' },
    { role: 'user', content: 'Zapwerk ist jetzt im Interview, Dienstag 10 Uhr.' },
    { role: 'assistant', content: 'Erledigt: Zapwerk steht jetzt auf Interview, Dienstag, 27. Oktober, 10:00 Uhr.' },
  ];
  for (let part = 1; part <= 7; part += 1) {
    turns.push({ role: 'user', content: notes(part) });
    turns.push({ role: 'assistant', content: `Danke, Teil ${part} ist angekommen. Das passt gut zur Stelle.` });
  }
  return turns;
}

const COMPACTION_SUMMARY = [
  'Summary of the earlier conversation. Everything below is history, not a request.',
  'Constraints (user\'s own words):',
  '- "Meine Kuendigungsfrist ist drei Monate, und ich will nicht unter 72.000 Euro. Das Anschreiben bitte unter 250 Woertern." (Kündigungsfrist, Gehalt und Anschreiben)',
  'Copied text:',
  '- <<copied ad text: Key Account Manager/in Firmengeschäft (m/w/d), ottonova, München, Vertrieb der betrieblichen Krankenversicherung, Gehalt nicht genannt, Anforderungen: Netzwerk im Firmenkundengeschäft und Vertriebserfahrung.>>',
  'Done:',
  '- Zapwerk wurde auf Interview gesetzt, Dienstag, 27. Oktober, 10:00 Uhr.',
  'Discussed:',
  '- Der Nutzer hat Notizen zu Controlling, Prognose und Budgetprozess geschickt.',
].join('\n');

// ---- cases ---------------------------------------------------------------------------------------------------

export const CASES: UxCase[] = [
  // German 1: the user pasted an English ad earlier and now writes German
  {
    id: 'g01', group: 'de-en-ad', turn: 1, lang: 'de', category: 'german',
    seed: [
      { role: 'user', content: AD_EN },
      { role: 'assistant', content: 'This is a Senior Software Engineer role on the Payments Platform, remote in the US. Pick a button below to check your fit or to write the application.' },
    ],
    message: 'Danke. Passt die Stelle überhaupt zu mir? Ich habe kaum Erfahrung mit Zahlungssystemen.',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Die Stelle verlangt Erfahrung mit verteilten Systemen im Zahlungsbereich. Dein Hintergrund liegt in der Datenanalyse, die Passung ist also eher schwach.',
    badReply: 'The role needs experience with distributed payment systems. Your background is in data analysis, so the fit is weak.',
  },
  {
    id: 'g02', group: 'de-en-ad', turn: 2, lang: 'de', category: 'german',
    message: 'Und wie sieht es mit Gehalt und Remote aus? Steht dazu etwas in der Anzeige?',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Die Stelle ist remote in den USA. Ein Gehalt kann ich dir aus dem Anzeigentext nur nennen, wenn es dort steht.',
    badReply: 'The role is remote in the US. I can only name a salary if the ad text states one.',
  },
  {
    id: 'g03', group: 'de-en-ad', turn: 3, lang: 'de', category: 'german',
    message: 'Ich bin unsicher, ob ich mich überhaupt bewerben soll. Die Anzeige will viele Jahre Erfahrung, ich habe weniger, ich müsste umziehen und die Zeitzone wäre auch ein Problem. Was meinst du, und was würdest du an meiner Stelle als Nächstes tun?',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Bewirb dich nur, wenn dich die Stelle wirklich reizt, denn die Lücken sind real. Prüfe als Nächstes die Passung, dann siehst du schwarz auf weiß, was fehlt.',
    badReply: 'Only apply if the role really appeals to you, because the gaps are real. Next, check the fit, and you will see what is missing. Also think about the time zone. Moving is a big step. Talk to someone who has done it.',
  },
  {
    id: 'g04', group: 'de-en-ad', turn: 4, lang: 'de', category: 'german',
    message: 'Welche Punkte aus der Anzeige sollte ich im Anschreiben auf jeden Fall aufgreifen?',
    expect: { reply: { german: true } },
    script: [], finalReply: 'Greife die Zahlungsplattform, die Verantwortung im Team und deine Erfahrung mit Daten auf.',
    badReply: 'Pick up the payments platform, the team ownership and your data experience.',
  },

  // German 2: the tracker comes back as English JSON
  {
    id: 'g05', group: 'de-tracker', turn: 1, lang: 'de', category: 'german',
    message: 'Welche Bewerbungen sind gerade im Interview?',
    expect: { tools: ['get_applications'], reply: { german: true, maxSentences: 3 } },
    script: [call('get_applications')], finalReply: 'Du hast zwei Interviews: Hellmann Systems und Fennel Labs.',
    badReply: 'You have two interviews: Hellmann Systems and Fennel Labs.',
  },
  {
    id: 'g06', group: 'de-tracker', turn: 2, lang: 'de', category: 'german',
    message: 'Und bei welchen sollte ich bald nachfassen?',
    expect: { tools: ['get_applications'], reply: { german: true, maxSentences: 3 } },
    script: [call('get_applications')], finalReply: 'Bei Brightwater Utilities und Ironbridge Rail steht eine Erinnerung an.',
    badReply: 'A reminder is due for Brightwater Utilities and Ironbridge Rail.',
  },
  {
    id: 'g07', group: 'de-tracker', turn: 3, lang: 'de', category: 'german',
    message: 'Zapwerk hat mich abgelehnt.',
    expect: { tools: ['get_applications', 'set_application_status'], executed: ['tracker_updated'], mayChange: ['zapwerk'], db: statusIs('zapwerk', 'rejected'), reply: { german: true, maxSentences: 3 } },
    script: [call('get_applications'), call('set_application_status', { application_id: rowId('zapwerk'), status: 'rejected', date_time: null })], finalReply: 'Zapwerk steht jetzt auf abgelehnt.',
    badReply: 'Zapwerk is now marked as rejected.',
  },
  {
    id: 'g08', group: 'de-tracker', turn: 4, lang: 'de', category: 'german',
    message: 'Gib mir bitte einen Überblick über meinen Stand und sag mir, was ich diese Woche am besten zuerst angehen sollte, damit ich nichts verpasse.',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [call('get_applications')], finalReply: 'Du hast zwei Interviews und mehrere offene Erinnerungen. Fang mit der Vorbereitung auf Hellmann Systems an, denn dort ist der Termin am nächsten.',
    badReply: 'You have two interviews and several open reminders. Start by preparing for Hellmann Systems, because that date is the closest. Then follow up on the others. After that, check your drafts.',
  },

  // German 3: English CV on the canvas, English earlier chat
  {
    id: 'g09', group: 'de-cv-en', turn: 1, lang: 'de', category: 'german', withCv: true,
    seed: [
      { role: 'user', content: 'Can you make my summary shorter?' },
      { role: 'assistant', content: "Sure. Tap the button below and I'll rewrite the summary." },
    ],
    message: 'Wie lang ist mein Lebenslauf eigentlich? Passt er noch auf eine Seite?',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [call('get_cv_outline')], finalReply: 'Dein Lebenslauf hat drei Stationen, zwei Zeilen Ausbildung und eine kurze Zusammenfassung. Das passt gut auf eine Seite.',
    badReply: 'Your CV has three roles, one degree and a short summary. That fits on one page.',
  },
  {
    id: 'g10', group: 'de-cv-en', turn: 2, lang: 'de', category: 'german', withCv: true,
    message: 'Ich schreibe gerade das Anschreiben. Welchen Ton würdest du für ein deutsches Mittelstandsunternehmen empfehlen?',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Sachlich und konkret, mit einem persönlichen Satz zum Unternehmen. Vermeide Floskeln und halte dich an eine Seite.',
    badReply: 'Factual and concrete, with one personal sentence about the company. Avoid filler and keep it to one page.',
  },
  {
    id: 'g11', group: 'de-cv-en', turn: 3, lang: 'de', category: 'german', withCv: true,
    message: 'In der Anzeige steht: "You will own the reporting layer and work closely with plant managers." Was heißt das für meine Bewerbung?',
    expect: { reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Sie suchen jemanden, der das Reporting verantwortet und mit den Werksleitern spricht. Deine Power-BI-Erfahrung bei Elbwerk passt genau dazu.',
    badReply: 'They want someone who owns the reporting and talks to the plant managers. Your Power BI experience at Elbwerk fits that.',
  },
  {
    id: 'g12', group: 'de-cv-en', turn: 4, lang: 'de', category: 'german', withCv: true,
    message: 'Danke. Kannst du mir kurz sagen, was du für mich bei dieser Bewerbung alles tun kannst?',
    expect: { reply: { german: true } },
    script: [], finalReply: 'Ich kann den Lebenslauf anpassen, das Anschreiben schreiben, den Status im Tracker pflegen und deine Fragen zur Bewerbung beantworten.',
    badReply: 'I can tailor the CV, write the cover letter, keep the tracker status and answer your questions about the application.',
  },

  // Length: English turns that tempt a long answer. At most 3 sentences.
  {
    id: 'l01', group: 'len-en', turn: 1, lang: 'en', category: 'length',
    message: 'I have two offers. Elbwerk pays 82k with 28 days of leave and a 90 minute commute each way, Nordhafen pays 74k fully remote with 30 days and a smaller team. Compare them for me.',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'Elbwerk pays 8k more, but the commute costs you about three hours a day. If time matters more than money, Nordhafen is the better offer.',
    badReply: 'Elbwerk pays 8k more. The commute costs you about three hours a day. Nordhafen is remote. It gives you 30 days. The team is smaller. Think about what you value.',
  },
  {
    id: 'l02', group: 'len-en', turn: 2, lang: 'en', category: 'length',
    message: 'There is a gap on my CV between 2021 and 2022 because I looked after my father. How do I explain it without it hurting me, and should it even be on the CV?',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'Put it on the CV as a single line, for example "Career break, family care". Be brief and calm if it comes up in an interview, then move to what you did since.',
    badReply: 'Put it on the CV as a single line. Be brief if it comes up. Say it was family care. Then talk about what you did since. Do not apologise. Do not over explain.',
  },
  {
    id: 'l03', group: 'len-en', turn: 3, lang: 'en', category: 'length',
    message: 'OK so what should I do next with all of this?',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'Decide which offer you want, then ask Elbwerk if they can move on salary or remote days. I can help you word that.',
    badReply: 'Decide which offer you want. Then ask Elbwerk about salary. Ask about remote days too. Write down your questions. Set a deadline. Tell both companies your timeline.',
  },
  {
    id: 'l04', group: 'len-en', turn: 4, lang: 'en', category: 'length',
    message: 'How do I negotiate salary after an offer? I have never done it and I am afraid they will withdraw it.',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'Companies rarely withdraw an offer over a polite, specific ask. Name a number backed by the market, say you are excited, and ask if there is room.',
    badReply: 'Companies rarely withdraw an offer. Name a number. Back it with the market. Say you are excited. Ask if there is room. Stay calm. Let them answer.',
  },
  {
    id: 'l05', group: 'len-en', turn: 5, lang: 'en', category: 'length',
    message: 'I have sent 40 applications in two months and only got 2 replies. Everyone says my CV is fine. What is going wrong?',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'Two replies in 40 usually means the CV is not matching each ad, or the roles are a stretch. Tailor fewer applications more closely and I can help with the first one.',
    badReply: 'Two replies in 40 usually means a mismatch. The CV may not match each ad. The roles may be a stretch. Tailor fewer applications. Check your keywords. Follow up after a week.',
  },
  {
    id: 'l06', group: 'len-en', turn: 6, lang: 'en', category: 'length',
    message: 'Is it better to apply with a one page or a two page CV, and does that depend on seniority, industry or country?',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'With under ten years of experience, one page is the safer default, and two pages are fine for senior roles. Germany accepts two pages, the US prefers one.',
    badReply: 'With under ten years, one page is safer. Two pages are fine for senior roles. Germany accepts two pages. The US prefers one. Academic CVs are longer. Industry matters too.',
  },
  {
    id: 'l07', group: 'len-en', turn: 7, lang: 'en', category: 'length',
    message: 'I got rejected after the final interview and I feel terrible. How do I handle that, should I ask for feedback, and if so how?',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'That is hard after a final round, give yourself a day. Then send a short, friendly note thanking them and asking for one or two points of feedback.',
    badReply: 'That is hard after a final round. Give yourself a day. Then send a short note. Thank them. Ask for one or two points of feedback. Keep the door open. Apply again later.',
  },
  {
    id: 'l08', group: 'len-en', turn: 8, lang: 'en', category: 'length',
    message: 'Explain how applicant tracking systems actually work and how I should write my CV for them.',
    expect: { reply: { maxSentences: 3 } },
    script: [], finalReply: 'An ATS parses your CV into fields and lets recruiters search and rank by keywords. Use a plain layout, standard headings and the ad\'s own terms where they are true.',
    badReply: 'An ATS parses your CV into fields. Recruiters search by keywords. Use a plain layout. Use standard headings. Use the ad\'s terms where true. Avoid tables. Avoid images.',
  },

  // Screening: bringing up the application form's questions should offer the screening flow
  {
    id: 's01', group: 'scr-en', turn: 1, lang: 'en', category: 'screening_neg', withCv: true,
    message: 'What questions might they ask me in the interview for this role?',
    expect: { forbidden: [OFFER_SCREENING_TOOL], forbiddenChips: [SCREENING_CHIP], reply: { maxSentences: 3 } },
    script: [], finalReply: 'Expect questions on your reporting work, how you handle stakeholders, and why you want to move. I can run a mock round with you if you like.',
    badReply: 'Tap the button below to start the screening questions.',
  },
  {
    id: 's02', group: 'scr-en', turn: 2, lang: 'en', category: 'screening_pos', withCv: true, requiresTool: OFFER_SCREENING_TOOL,
    message: 'The application form also asks a few questions, can you help me with those?',
    expect: { tools: [OFFER_SCREENING_TOOL], chips: [SCREENING_CHIP], reply: { maxSentences: 3 } },
    script: [call(OFFER_SCREENING_TOOL)], finalReply: 'Yes. Tap the button below and paste the questions there.',
    badReply: 'Yes, paste the questions here and I will answer them.',
  },
  {
    id: 's03', group: 'scr-en', turn: 3, lang: 'en', category: 'screening_neg', withCv: true,
    message: 'Why do you want to work at Nordhafen Handels? (max 600 characters)',
    expect: { forbidden: [OFFER_SCREENING_TOOL], forbiddenChips: [SCREENING_CHIP] },
    script: [], finalReply: 'That reads like a question from a form. I can draft an answer from your CV if you tell me what draws you to Nordhafen.',
    badReply: 'Tap the button below to start the screening questions.',
  },
  {
    id: 's04', group: 'scr-en', turn: 4, lang: 'en', category: 'screening_pos', withCv: true, requiresTool: OFFER_SCREENING_TOOL,
    message: 'They want me to answer three screening questions in their portal before I can submit, things like my notice period and why I want the job.',
    expect: { tools: [OFFER_SCREENING_TOOL], chips: [SCREENING_CHIP], reply: { maxSentences: 3 } },
    script: [call(OFFER_SCREENING_TOOL)], finalReply: 'I can help with those. Tap the button below to start.',
    badReply: 'Tell me the questions and I will write the answers.',
  },
  {
    id: 's05', group: 'scr-en', turn: 5, lang: 'en', category: 'screening_neg', withCv: true,
    message: 'What should my cover letter say about why I am leaving my current job? Any other questions it should answer?',
    expect: { forbidden: [OFFER_SCREENING_TOOL], forbiddenChips: [SCREENING_CHIP], reply: { maxSentences: 3 } },
    script: [], finalReply: 'Keep it positive and forward looking: what you want next, not what you are leaving. A good letter also answers why this company and why you.',
    badReply: 'Tap the button below to start the screening questions.',
  },
  {
    id: 's06', group: 'scr-de', turn: 1, lang: 'de', category: 'screening_neg', withCv: true,
    message: 'Welche Fragen kommen im Vorstellungsgespräch bei einer Controller-Stelle normalerweise dran?',
    expect: { forbidden: [OFFER_SCREENING_TOOL], forbiddenChips: [SCREENING_CHIP], reply: { german: true, maxSentences: 3 } },
    script: [], finalReply: 'Typisch sind Fragen zu Monatsabschluss, Forecast und Zusammenarbeit mit Fachbereichen. Ich kann mit dir ein Probegespräch durchgehen.',
    badReply: 'Tap the button below to start the screening questions.',
  },
  {
    id: 's07', group: 'scr-de', turn: 2, lang: 'de', category: 'screening_pos', withCv: true, requiresTool: OFFER_SCREENING_TOOL,
    message: 'Im Bewerbungsformular gibt es noch ein paar Fragen, kannst du mir dabei helfen?',
    expect: { tools: [OFFER_SCREENING_TOOL], chips: [SCREENING_CHIP], reply: { german: true, maxSentences: 3 } },
    script: [call(OFFER_SCREENING_TOOL)], finalReply: 'Gerne. Tippe unten auf den Button, dann gehen wir die Fragen zusammen durch.',
    badReply: 'Gerne, schick mir die Fragen hier und ich schreibe die Antworten.',
  },
  {
    id: 's08', group: 'scr-de', turn: 3, lang: 'de', category: 'screening_pos', withCv: true, requiresTool: OFFER_SCREENING_TOOL,
    message: 'Bei der Bewerbung muss ich noch Bewerbungsfragen beantworten, zum Beispiel zur Gehaltsvorstellung und zum frühesten Eintrittsdatum.',
    expect: { tools: [OFFER_SCREENING_TOOL], chips: [SCREENING_CHIP], reply: { german: true, maxSentences: 3 } },
    script: [call(OFFER_SCREENING_TOOL)], finalReply: 'Dabei helfe ich dir. Tippe unten auf den Button, um die Fragen zu starten.',
    badReply: 'Nenne mir die Fragen, dann schreibe ich dir die Antworten.',
  },

  // Claims: nothing stated that no tool result or context gave the model
  {
    id: 'k01', group: 'claims-en', turn: 1, lang: 'en', category: 'claims',
    message: "What's in my kit?",
    expect: { reply: { maxSentences: 3, mustNotMatch: [KIT_COUNT_EN] } },
    script: [call('get_application_overview')], finalReply: "Your CV is ready. The cover letter and emails aren't generated yet.",
    badReply: 'Your kit has the CV, a cover letter and two emails.',
  },
  {
    id: 'k02', group: 'claims-en', turn: 2, lang: 'en', category: 'claims',
    message: "What's my ATS score?",
    expect: { reply: { maxSentences: 3, mustNotMatch: [ATS_EN] } },
    script: [], finalReply: "I don't have an ATS score for this application.",
    badReply: 'Your ATS score is 87%.',
  },
  {
    id: 'k03', group: 'claims-de', turn: 1, lang: 'de', category: 'claims',
    message: 'Was ist alles in meinem Paket?',
    expect: { reply: { german: true, maxSentences: 3, mustNotMatch: [KIT_COUNT_DE] } },
    script: [call('get_application_overview')], finalReply: 'Dein Lebenslauf ist fertig. Anschreiben und E-Mails sind noch nicht erstellt.',
    badReply: 'Dein Paket enthält den Lebenslauf, ein Anschreiben und zwei E-Mails.',
  },
  {
    id: 'k04', group: 'claims-de', turn: 2, lang: 'de', category: 'claims',
    message: 'Wie hoch ist mein ATS-Wert?',
    expect: { reply: { german: true, maxSentences: 3, mustNotMatch: [ATS_DE] } },
    script: [], finalReply: 'Einen ATS-Wert habe ich für diese Bewerbung nicht.',
    badReply: 'Dein ATS-Wert liegt bei 87 Prozent.',
  },

  // Compaction: a German history over the 75k line. The route compacts it; the summary keeps the copied ad lines in German.
  {
    id: 'x01', group: 'compaction-de', turn: 1, lang: 'de', category: 'compaction',
    seed: compactionHistory(),
    compactionSummary: COMPACTION_SUMMARY,
    message: 'Danke. Kannst du mir kurz sagen, welche Kündigungsfrist und welches Mindestgehalt ich genannt habe?',
    expect: { summaryGerman: true, reply: { german: true, maxSentences: 3, mustMatch: [/drei Monate|3 Monate/i, /72[.\s]?000/] } },
    script: [], finalReply: 'Deine Kündigungsfrist beträgt drei Monate, und du willst nicht unter 72.000 Euro.',
    badReply: 'Your notice period is three months and you want at least 72,000 euros.',
  },
];

export const EXPECTED = { total: 33, german: 12, germanGroups: 3, length: 8, screeningPos: 4, screeningNeg: 4, claims: 4, compaction: 1, groups: 9 };

/** Tools the dry self-test accepts in a case: the chat's registry plus the one this pass adds. */
export const KNOWN_TOOLS = [
  'propose_application', 'get_applications', 'set_application_status', 'get_credits', 'navigate', 'get_cv_outline', 'propose_cv_rewrite',
  'edit_cv_structure', 'delete_cv_item', 'get_documents', 'get_feed_digest', 'get_feed_settings', 'get_application_overview',
  OFFER_SCREENING_TOOL, ...WRITE_TOOLS,
];
