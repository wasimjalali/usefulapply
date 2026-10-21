import type { ReactNode } from 'react';
import { renderToStaticMarkup } from './static-markup';
import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { displayUrl, fullUrl, pickLetterLinks } from '@/lib/cv-templates/url';
import { fontFaceCssInline, type FontFileLoader } from '@/lib/cv-templates/fonts';
import type { PaperSize } from '@/lib/cv-templates/print-spec';
import { EXPORT_CSP, escapeHtml } from './cv-html';
import { PRINT_BASE_CSS } from './print-css';
import { formatLetterDate } from '@/lib/agents/cover-letter-structure';

/**
 * Cover letter pages. Two layouts, chosen by the letter's locale or the CV
 * template's market, never by what the writer says about itself:
 *
 *   us   business letter, block format, Letter, 1 in margins
 *   din  DIN 5008:2020 Form B on A4: margins 25 mm left and 20 mm right,
 *        address field 85 x 45 mm at 45 mm from the top and 20 mm from the
 *        left, information block at 125 mm, fold marks at 105 and 210 mm and
 *        the hole mark at 148.5 mm
 *
 * A letter without the structured contract renders its body as written, in
 * letter typography, with no header of its own: the legacy body already has one.
 */

export type LetterLayout = 'us' | 'din';

export type LetterInput =
  | { kind: 'structured'; letter: StructuredCoverLetter }
  | { kind: 'legacy'; text: string };

/** Zone sizes, in millimetres, taken from DIN 5008:2020 Form B. */
export const DIN = {
  marginLeft: 25,
  marginRight: 20,
  marginBottom: 18,
  marginTopContinuation: 20,
  addressTop: 45,
  addressLeft: 20,
  addressWidth: 85,
  addressHeight: 45,
  /** Rücksendeangabe, the return line, sits in the top 5 mm of the field. */
  returnLineHeight: 5,
  /** Zusatz- und Vermerkzone: 5 lines, 17.7 mm, with the return line on its top line. */
  noteZoneHeight: 17.7,
  /** Anschriftzone: 6 lines, 27.3 mm. The recipient starts here, 62.7 mm from the top. */
  recipientZoneHeight: 27.3,
  recipientTop: 62.7,
  infoLeft: 125,
  infoWidth: 75,
  /** The subject starts two blank lines under the address field. */
  bodyTop: 99,
  foldMarks: [105, 210],
  holeMark: 148.5,
} as const;

const US_STYLE = `
@page{size:Letter;margin:1in}
body{font-family:'Arimo','Arial',sans-serif;font-size:11pt;line-height:1.4;color:#111}
.sender{margin-bottom:1.4em}
.sender .name{font-weight:700;font-size:12pt}
.date{margin-bottom:1.4em}
.recipient{margin-bottom:1.4em}
.subject{font-weight:700;margin-bottom:1.4em}
.salutation{margin-bottom:1.4em}
.para{margin-bottom:1.4em;orphans:3;widows:3}
.closing{margin-bottom:3.4em}
.signature{font-weight:700}
`;

const DIN_STYLE = `
@page{size:A4;margin:${DIN.marginTopContinuation}mm 0 ${DIN.marginBottom}mm 0}
@page :first{margin:0 0 ${DIN.marginBottom}mm 0}
html,body{width:210mm}
body{position:relative;font-family:'Arimo','Arial',sans-serif;font-size:11pt;line-height:4.9mm;color:#111}
.flow{padding:0 ${DIN.marginRight}mm 0 ${DIN.marginLeft}mm}
.flow.first{padding-top:${DIN.bodyTop}mm}
.abs{position:absolute}
.letterhead{left:${DIN.marginLeft}mm;top:14mm;width:${210 - DIN.marginLeft - DIN.marginRight}mm;font-size:10pt;line-height:4.4mm}
.letterhead .name{font-weight:700;font-size:1.2em}
.field{left:${DIN.addressLeft}mm;top:${DIN.addressTop}mm;width:${DIN.addressWidth}mm;height:${DIN.addressHeight}mm}
.return-line{height:${DIN.returnLineHeight}mm;font-size:7pt;line-height:${DIN.returnLineHeight}mm;white-space:nowrap;overflow:hidden;border-bottom:0.25pt solid #444;width:${DIN.addressWidth}mm}
.recipient{position:absolute;left:0;top:${DIN.recipientTop - DIN.addressTop}mm;width:${DIN.addressWidth}mm;height:${DIN.recipientZoneHeight}mm;display:flex;flex-direction:column;justify-content:flex-start;line-height:4.5mm}
.info{left:${DIN.infoLeft}mm;top:${DIN.recipientTop}mm;width:${210 - DIN.marginRight - DIN.infoLeft}mm;text-align:right}
.mark{left:0;height:0;border-top:0.25pt solid #333}
.subject{font-weight:700;margin-bottom:4.9mm}
.salutation{margin-bottom:4.9mm}
.para{margin-bottom:4.9mm;orphans:3;widows:3}
.closing{margin-bottom:14.7mm}
.signature{}
`;

const LEGACY_STYLE = (layout: LetterLayout) =>
  layout === 'din'
    ? `
@page{size:A4;margin:${DIN.marginTopContinuation}mm ${DIN.marginRight}mm ${DIN.marginBottom}mm ${DIN.marginLeft}mm}
body{font-family:'Arimo','Arial',sans-serif;font-size:11pt;line-height:1.4;color:#111}
p{white-space:pre-line;margin-bottom:1.3em;orphans:3;widows:3}
`
    : `
@page{size:Letter;margin:1in}
body{font-family:'Arimo','Arial',sans-serif;font-size:11pt;line-height:1.4;color:#111}
p{white-space:pre-line;margin-bottom:1.3em;orphans:3;widows:3}
`;

/** Every letter stylesheet, for the renderer version hash. */
export const LETTER_CSS = [US_STYLE, DIN_STYLE, LEGACY_STYLE('us'), LEGACY_STYLE('din')].join('\n');

export function letterPaper(layout: LetterLayout): PaperSize {
  return layout === 'din' ? 'a4' : 'letter';
}

/** The sender's address lines, phone, email and at most two clean links (LinkedIn, then a personal site). */
function senderContactLines(letter: StructuredCoverLetter): string[] {
  const { sender } = letter;
  return [
    ...sender.addressLines,
    ...(sender.phone ? [sender.phone] : []),
    ...(sender.email ? [sender.email] : []),
    ...pickLetterLinks(sender.links).map((link) => displayUrl(link)),
  ].filter((line) => line.trim().length > 0);
}

/** One contact line as it is printed: a link line stays clickable with its full URL. */
function ContactLine({ line, letter }: { line: string; letter: StructuredCoverLetter }) {
  const target = pickLetterLinks(letter.sender.links).find((link) => displayUrl(link) === line);
  // A long address wraps after its slashes instead of running past the letterhead.
  return target ? <a href={fullUrl(target)} style={{ overflowWrap: 'anywhere' }}>{line.split('/').flatMap((part, i) => (i === 0 ? [part] : ['/', <wbr key={i} />, part]))}</a> : <>{line}</>;
}

/**
 * The recipient block in the order the plain-text letter uses (see
 * renderCoverLetterBody): DACH is company, department, contact person, address;
 * US is contact person, department, company, address.
 */
export function recipientLinesFor(letter: StructuredCoverLetter, layout: LetterLayout): string[] {
  const { recipient } = letter;
  const order = layout === 'din'
    ? [recipient.companyName, recipient.department, recipient.contactPerson]
    : [recipient.contactPerson, recipient.department, recipient.companyName];
  return [...order, ...recipient.addressLines].filter((line): line is string => Boolean(line && line.trim()));
}

/** DIN 5008 writes the closing without a comma. */
export function dinClosing(closing: string): string {
  return closing.trim().replace(/[,;:]+$/, '');
}

function UsLetter({ letter }: { letter: StructuredCoverLetter }) {
  const subject = letter.subject.trim();
  const recipient = recipientLinesFor(letter, 'us');
  return (
    <>
      <div className="sender">
        <div className="name">{letter.sender.name}</div>
        {senderContactLines(letter).map((line, index) => <div key={index}><ContactLine line={line} letter={letter} /></div>)}
      </div>
      <div className="date">{formatLetterDate(letter.date, letter.language)}</div>
      {recipient.length > 0 && (
        <div className="recipient">
          {recipient.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      )}
      {subject && <div className="subject">{/^re:/i.test(subject) ? subject : `Re: ${subject}`}</div>}
      <div className="salutation">{letter.salutation}</div>
      {letter.paragraphs.map((paragraph, index) => <p className="para" key={index}>{paragraph}</p>)}
      <div className="closing">{letter.closing}</div>
      <div className="signature">{letter.signatureName || letter.sender.name}</div>
    </>
  );
}

/**
 * The letterhead has 31 mm (14 to 45 mm) before the address field begins. Up to
 * 7 lines at 4.4 mm fit. More shrink the type and the line height so the block
 * never overprints the field.
 */
/**
 * The return line (Rücksendeangabe) over the address window: the sender's name,
 * street and postcode with city, on one short line. A sender block with more
 * lines (a title, a department, a country) keeps its full text in the
 * letterhead and gives the return line only the last two address lines.
 */
export function dinReturnLine(letter: StructuredCoverLetter): string {
  const address = letter.sender.addressLines.map((part) => part.trim()).filter(Boolean);
  // The line with the postcode and city is the end of the return address, whatever follows it (a country).
  let end = -1;
  address.forEach((line, index) => {
    if (/\b\d{4,5}\s+\p{L}/u.test(line)) end = index;
  });
  if (end < 0) end = address.length - 1;
  const street = end > 0 ? address[end - 1] : undefined;
  return [letter.sender.name, street, address[end]].filter(Boolean).join(' · ');
}

/** The most contact lines under the sender's name in a DIN letterhead (it has 31 mm above the address field). */
export const LETTERHEAD_MAX_CONTACT_LINES = 8;

/**
 * The sender's address, phone and email as letterhead lines, merged when there are too many: phone and
 * email share a line first, then the top address lines are joined, so the type never has to shrink until
 * lines overlap. The links come after these and keep their own lines.
 */
export function plainContactLines(letter: StructuredCoverLetter, cap = LETTERHEAD_MAX_CONTACT_LINES): string[] {
  const links = pickLetterLinks(letter.sender.links).length;
  const room = Math.max(1, cap - links);
  let address = letter.sender.addressLines.map((part) => part.trim()).filter(Boolean);
  let reach = [letter.sender.phone, letter.sender.email].map((part) => part?.trim() ?? '').filter(Boolean);
  if (address.length + reach.length > room && reach.length === 2) reach = [reach.join(' · ')];
  while (address.length + reach.length > room && address.length > 1) address = [`${address[0]} · ${address[1]}`, ...address.slice(2)];
  return [...address, ...reach];
}

/** Every letterhead line of a DIN letter under the name: the capped plain lines, then the clean links. */
export function dinSenderLines(letter: StructuredCoverLetter): string[] {
  return [...plainContactLines(letter), ...pickLetterLinks(letter.sender.links).map((link) => displayUrl(link))];
}

export function letterheadStyle(lines: number): { lineHeight?: string; fontSize?: string } {
  if (lines <= 7) return {};
  const lineHeightMm = Math.floor((30 / lines) * 100) / 100;
  return { lineHeight: `${lineHeightMm}mm`, fontSize: `${Math.max(6.5, Math.round(lineHeightMm * 2.2 * 10) / 10)}pt` };
}

function DinLetter({ letter }: { letter: StructuredCoverLetter }) {
  const returnLine = dinReturnLine(letter);
  const dateLine = [letter.place, formatLetterDate(letter.date, letter.language)].filter((part) => part && part.trim()).join(', ');
  const subject = letter.subject.trim();
  return (
    <>
      <div className="abs letterhead" style={letterheadStyle(1 + dinSenderLines(letter).length)}>
        <div className="name">{letter.sender.name}</div>
        {dinSenderLines(letter).map((line, index) => <div key={index}><ContactLine line={line} letter={letter} /></div>)}
      </div>
      <div className="abs field">
        <div className="return-line">{returnLine}</div>
        <div className="recipient">
          {recipientLinesFor(letter, 'din').map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </div>
      <div className="abs info">{dateLine}</div>
      {DIN.foldMarks.map((y) => (
        <div key={y} className="abs mark" style={{ top: `${y}mm`, width: '5mm' }} />
      ))}
      <div className="abs mark" style={{ top: `${DIN.holeMark}mm`, width: '4mm' }} />
      <div className="flow first">
        {subject && <div className="subject">{subject}</div>}
        <div className="salutation">{letter.salutation}</div>
        {letter.paragraphs.map((paragraph, index) => <p className="para" key={index}>{paragraph}</p>)}
        <div className="closing">{dinClosing(letter.closing)}</div>
        <div className="signature">{letter.signatureName || letter.sender.name}</div>
      </div>
    </>
  );
}

function LegacyLetter({ text }: { text: string }) {
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  return <>{paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}</>;
}

export interface LetterHtmlInput {
  input: LetterInput;
  layout: LetterLayout;
  loadFont: FontFileLoader;
  /** Title and language of the page. */
  title: string;
  language: string;
}

/** The plain text of a letter in reading order, for the eval and for the TXT fallback. */
export function letterPlainText(input: LetterInput, layout: LetterLayout): string {
  if (input.kind === 'legacy') return input.text;
  const letter = input.letter;
  const closing = layout === 'din' ? dinClosing(letter.closing) : letter.closing;
  return [
    letter.sender.name,
    ...senderContactLines(letter),
    '',
    [letter.place, formatLetterDate(letter.date, letter.language)].filter(Boolean).join(', '),
    '',
    ...recipientLinesFor(letter, layout),
    '',
    letter.subject,
    '',
    letter.salutation,
    '',
    letter.paragraphs.join('\n\n'),
    '',
    closing,
    '',
    letter.signatureName,
  ].join('\n');
}

export async function renderLetterHtml(args: LetterHtmlInput): Promise<{ html: string; text: string }> {
  const { input, layout } = args;
  let body: ReactNode;
  let style: string;
  if (input.kind === 'legacy') {
    body = <LegacyLetter text={input.text} />;
    style = LEGACY_STYLE(layout);
  } else if (layout === 'din') {
    body = <DinLetter letter={input.letter} />;
    style = DIN_STYLE;
  } else {
    body = <UsLetter letter={input.letter} />;
    style = US_STYLE;
  }
  const markup = renderToStaticMarkup(<>{body}</>);
  const text = letterPlainText(input, layout);
  const fonts = await fontFaceCssInline(args.loadFont, text);
  const html = `<!doctype html><html lang="${escapeHtml(args.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}"><title>${escapeHtml(args.title)}</title><style>${fonts}\n${PRINT_BASE_CSS}\n${style}</style></head><body>${markup}</body></html>`;
  return { html, text };
}
