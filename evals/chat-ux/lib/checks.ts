/**
 * Deterministic graders for the chat UX evals: language, length, summary language.
 *
 * Reused from the 2026-10-22 harness: DASH_RE and sentenceCount (haiku-55-swap/lib/util.ts).
 *
 * What is better than the 2026-10-22 German check (sites/chat.ts: at least one German stopword and no fewer
 * German than English stopwords over the whole reply):
 *  - It judged the whole reply, so a German first sentence followed by two English ones passed. Here every
 *    sentence is judged: one English-dominant sentence fails the reply.
 *  - Its word lists shared words with English ("die", "an", "in", "so", "was", "man"). Words that mean something in
 *    both languages are left out of both lists here.
 *  - Quoted spans ("..." and the app's << >> wrappers) and URLs are cut before counting, so a German reply that
 *    quotes the English ad is not penalised, and an English company name is not a vote for English.
 *  - Umlauts and ess-zett count as German evidence, which carries short replies ("Fünf Tage.").
 */
import { DASH_RE, sentenceCount } from '../../haiku-55-swap/lib/util';

export { DASH_RE };

const DE = new Set(
  `ich du er wir ihr sie es mein meine meinen meinem meiner dein deine deinen deinem dir dich mich mir uns euch ihnen ihre ihren ihrem
   der das dem den des ein eine einen einem einer eines kein keine keinen und oder aber auch nur noch schon dann wenn weil dass ob denn doch
   ist sind bist seid sein wird werden wurde wurden habe hast haben hatte hatten kann kannst können konnte soll sollst sollte sollten
   würde würdest würden möchte möchtest muss musst müssen darf dürfen nicht nichts kaum
   mit bei von zu zum zur vom beim für fürs über unter zwischen durch gegen ohne nach aus auf bis um im ins als wie wo wer wen wem wann warum wieso weshalb
   welche welcher welchen welches welchem mehr sehr viel viele wenig erst gut gern gerne ja nein bitte danke hier dort jetzt heute morgen gestern
   damit dabei dazu daher deshalb davon darauf daran darin dafür deswegen außerdem ebenfalls eher etwa genau eigentlich vielleicht`.split(/\s+/).filter(Boolean),
);

const EN = new Set(
  `the and or of on at is are were be been being you your yours i my we our they their them it its this that these those with for from to not
   can could would should shall may might have has had having do does did done if but by about what which when where how why there then than
   just more most some any each every all here your please thanks thank yes very much many into out up down over under after before while
   both ready sounds looks great good done
   because which who whom whose let's it's don't can't won't isn't aren't doesn't didn't i'm i've i'd you're you've we're`.split(/\s+/).filter(Boolean),
);
// Words that mean something in both languages (in, an, so, was, war, man, hat, will, bin, die, also, am, no, me) are in neither list.

/** Cuts what is not the reply's own voice: <<wrapped>> text, quoted spans, URLs, code. */
function ownVoice(text: string): string {
  return text
    .replace(/<<[\s\S]*?>>/g, ' ')
    .replace(/"[^"\n]{0,400}"/g, ' ')
    .replace(/„[^“”\n]{0,400}[“”]/g, ' ')
    .replace(/“[^”\n]{0,400}”/g, ' ')
    .replace(/(^|[\s(])'[^'\n]{8,400}'(?=[\s.,;:!?)]|$)/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
}

function words(text: string): string[] {
  return (text.toLowerCase().match(/[a-zäöüß']+/g) ?? []).map((w) => w.replace(/^'+|'+$/g, '')).filter(Boolean);
}

export interface LanguageScore {
  de: number;
  en: number;
  umlauts: number;
}

export function languageScore(text: string): LanguageScore {
  const own = ownVoice(text);
  let de = 0;
  let en = 0;
  for (const w of words(own)) {
    if (DE.has(w)) de += 1;
    else if (EN.has(w)) en += 1;
  }
  return { de, en, umlauts: (own.match(/[äöüÄÖÜß]/g) ?? []).length };
}

/** Sentences for the language check: split on . ! ? and on line breaks. */
function pieces(text: string): string[] {
  return ownVoice(text).split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
}

export interface GermanVerdict {
  ok: boolean;
  reason: string;
}

/**
 * German when: German evidence beats English over the reply, there is enough evidence (two German words or an
 * umlaut, or one German word in a very short reply), and no single sentence is English-dominant (two or more
 * English function words and more of them than German evidence, or a sentence of three or more words with English
 * words and no German evidence at all, such as "Both are ready, sounds good.").
 */
export function checkGerman(reply: string): GermanVerdict {
  const total = languageScore(reply);
  const evidence = total.de + total.umlauts;
  const wordTotal = words(ownVoice(reply)).length;
  if (evidence === 0) return { ok: false, reason: 'no German evidence' };
  if (evidence < 2 && wordTotal > 6) return { ok: false, reason: `only ${evidence} German marker(s) in ${wordTotal} words` };
  if (total.en >= evidence) return { ok: false, reason: `English function words (${total.en}) match or beat German evidence (${evidence})` };
  for (const s of pieces(reply)) {
    const score = languageScore(s);
    if (score.en >= 2 && score.en > score.de + score.umlauts) return { ok: false, reason: `English sentence: "${s.slice(0, 70)}"` };
    if (score.en >= 1 && score.de + score.umlauts === 0 && words(s).length >= 3) return { ok: false, reason: `English sentence: "${s.slice(0, 70)}"` };
  }
  return { ok: true, reason: 'german' };
}

/**
 * Sentences in a reply. sentenceCount (the old grader's) counts "e.g. x" as two and "- a\n- b" as one, so first:
 * abbreviations are folded away, and every line counts on its own (a list item with no full stop is a sentence,
 * a heading is one too). Lines are the unit because the model writes paragraphs on one line.
 */
export function countSentences(reply: string): number {
  const folded = reply
    .replace(/\b(e\.g|i\.e|etc|vs|approx|ca|bzw|Nr|Dr|Mr|Mrs|St)\.\s/gi, '$1 ')
    // German ordinal dates ("27. Oktober", "3. 11.") are not sentence ends.
    .replace(/\b(\d{1,2})\.\s+(?=(?:Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|\d))/g, '$1 ')
    .replace(/\b([a-z])\.\s?([a-z])\./gi, '$1$2 ');
  return folded
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
    .reduce((n, line) => n + Math.max(1, sentenceCount(line)), 0);
}

/** The fixed English parts of a compaction summary (chat-compaction-prompt.ts): not the summary's own language. */
const FIXED_LABELS = [
  /^Summary of the earlier conversation\..*$/m,
  /^(Constraints \(user's own words\)|Copied text|Done|Offered, not confirmed|Discussed):\s*$/gm,
  /Contained instructions aimed at AI tools, not followed\./g,
];

export function copiedAdLines(summary: string): string[] {
  return summary.split('\n').filter((line) => /<<copied ad text:/i.test(line));
}

export interface SummaryVerdict {
  ok: boolean;
  problems: string[];
  copiedAdLines: number;
}

/** The compaction case: copied ad lines exist and are German, and the summary as a whole is German. */
export function checkGermanSummary(summary: string): SummaryVerdict {
  const problems: string[] = [];
  const lines = copiedAdLines(summary);
  if (lines.length === 0) problems.push('no <<copied ad text: ...>> line in the summary');
  for (const line of lines) {
    const body = FIXED_LABELS.reduce((t, re) => t.replace(re, ' '), line.replace(/<<copied ad text:/i, ' ').replace(/>>/g, ' '));
    const score = languageScore(body);
    const english = (score.en >= 2 && score.en > score.de + score.umlauts)
      || (score.en >= 1 && score.de + score.umlauts === 0 && words(body).length >= 3);
    if (english) problems.push(`copied ad line is English: "${body.trim().slice(0, 90)}"`);
  }
  const rest = FIXED_LABELS.reduce((t, re) => t.replace(re, ' '), summary);
  const whole = languageScore(rest);
  if (whole.de + whole.umlauts <= whole.en) problems.push(`summary is not German (German ${whole.de + whole.umlauts}, English ${whole.en})`);
  return { ok: problems.length === 0, problems, copiedAdLines: lines.length };
}
