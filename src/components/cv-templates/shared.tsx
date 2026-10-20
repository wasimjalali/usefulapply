import type { CSSProperties, ReactNode } from 'react';
import { Github, Globe, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import type { CVData } from '@/lib/cv-templates/types';
import { uiText } from '@/lib/cv-templates/locale';
import { displayUrl, fullUrl } from '@/lib/cv-templates/url';

/**
 * Pieces the six templates share, so a layout rule is written once.
 *
 * Skills: every group renders as ONE wrapped line, "Label: a, b, c", with a bold
 * label. The old templates drew one bullet per skill, which made 100 skills a
 * page and a half, and cut groups and items to 5 without saying so. Nothing is
 * cut here and nothing is a list: a comma list also extracts cleanly. The label
 * is bold mixed case with a colon, not all caps: a simple parser reads an
 * all-caps bold line as a section title.
 */

interface SkillLinesProps {
  data: CVData;
  primary: string;
  text: string;
  gap: number;
  lineHeight: number;
}

/**
 * A vertical stack with a gap between its children, as a block with margins rather than a flex column.
 * A page can break inside a block stack at any child boundary, honouring `break-after: avoid` chains; a
 * flex column container pushed a heading and its first entry to the next page as one piece. The rule that
 * spaces the children is `.cv-stack > * + *` (print-css.ts for the export, globals.css for the canvas).
 */
export function stackGap(px: number): CSSProperties {
  return { ['--stack-gap' as string]: `calc(${px}px * var(--cv-d, 1))` };
}

export function SkillLines({ data, primary, text, gap, lineHeight }: SkillLinesProps) {
  return (
    <div className="cv-stack" style={stackGap(gap)}>
      {data.skills.map((group, index) => (
        <p
          key={`skill-${index}`}
          style={{ fontSize: '10pt', lineHeight: `calc(${lineHeight} * var(--cv-ld, 1))`, color: text, overflowWrap: 'break-word', breakInside: 'avoid' }}
        >
          <strong style={{ color: primary, fontWeight: 700 }}>{group.category}:</strong>{' '}
          {group.items.join(', ')}
        </p>
      ))}
    </div>
  );
}

interface LanguageLineProps {
  data: CVData;
  text: string;
  lineHeight: number;
}

/** Spoken languages: "Deutsch: Muttersprache, Englisch: C1". Its own section, never inside Skills. */
export function LanguageLine({ data, text, lineHeight }: LanguageLineProps) {
  return (
    <p style={{ fontSize: '10pt', lineHeight: `calc(${lineHeight} * var(--cv-ld, 1))`, color: text, overflowWrap: 'break-word' }}>
      {data.languages.map((lang, index) => (
        <span key={`lang-${index}`}>
          {index > 0 ? ', ' : ''}
          <strong>{lang.language}{lang.proficiency ? ':' : ''}</strong>
          {lang.proficiency ? ` ${lang.proficiency}` : ''}
        </span>
      ))}
    </p>
  );
}

interface ContactRowsProps {
  data: CVData;
  iconSize: number;
  iconColor?: string;
  iconGap: number;
  textColor: string;
  columnGap: number;
  rowGap: number;
  fontSize?: string;
}

function locationText(data: CVData): string {
  const p = data.personal;
  const parts: string[] = [];
  if (p.address) {
    parts.push(p.address);
    if (p.city && !p.address.toLowerCase().includes(p.city.toLowerCase())) parts.push(p.city);
    if (p.country && !p.address.toLowerCase().includes(p.country.toLowerCase())) parts.push(p.country);
  } else {
    if (p.city) parts.push(p.city);
    if (p.country) parts.push(p.country);
  }
  return parts.join(', ');
}

/**
 * The contact line: every item in one wrapping row. Contact details stay in the
 * page body, never in a header or footer.
 */
export function ContactRows({ data, iconSize, iconColor, iconGap, textColor, columnGap, rowGap, fontSize = '10pt' }: ContactRowsProps) {
  const p = data.personal;
  const icon = (Icon: typeof Mail) => <Icon style={{ width: `${iconSize}px`, height: `${iconSize}px`, color: iconColor, flexShrink: 0 }} />;
  const itemStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: `${iconGap}px`, color: textColor, textDecoration: 'none', whiteSpace: 'nowrap' };
  // The visible text is the address (linkedin.com/in/name), never a label alone: most ATS read only
  // the text, and a printed copy loses the link. The anchor keeps the full URL, so it stays clickable.
  const link = (raw: string, Icon: typeof Mail, key: string) => (
    <a key={key} href={fullUrl(raw)} target="_blank" rel="noopener noreferrer" style={itemStyle}>
      {icon(Icon)}
      <span>{displayUrl(raw)}</span>
    </a>
  );

  const items: ReactNode[] = [];
  if (p.email) {
    items.push(
      <a key="email" href={`mailto:${p.email}`} style={itemStyle}>
        {icon(Mail)}
        <span>{p.email}</span>
      </a>,
    );
  }
  if (p.phone) {
    items.push(
      <span key="phone" style={itemStyle}>
        {icon(Phone)}
        <span>{p.phone}</span>
      </span>,
    );
  }
  const where = locationText(data);
  if (where) {
    items.push(
      <span key="where" style={{ ...itemStyle, whiteSpace: 'normal' }}>
        {icon(MapPin)}
        <span>{where}</span>
      </span>,
    );
  }
  if (p.linkedIn) items.push(link(p.linkedIn, Linkedin, 'linkedin'));
  if (p.github) items.push(link(p.github, Github, 'github'));
  if (p.portfolio) items.push(link(p.portfolio, Globe, 'portfolio'));
  if (p.website) items.push(link(p.website, Globe, 'website'));

  // One flowing row: items wrap where the line ends. No balancing, so nothing is left alone on a line
  // while the line above still has room, and a long address or portfolio link flows like text.
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: `${columnGap}px`, rowGap: `calc(${rowGap}px * var(--cv-d, 1))`, fontSize, color: textColor }}>
      {items}
    </div>
  );
}

interface SignatureBlockProps {
  data: CVData;
  color: string;
  lineColor: string;
}

/**
 * The German signature block: room above the lines to sign, the place and date
 * on the left line, "Unterschrift" under the right one, labels under their
 * lines, and the whole block kept together.
 */
export function SignatureBlock({ data, color, lineColor }: SignatureBlockProps) {
  const signature = data.signature;
  if (!signature?.includeSignature) return null;
  const placeDate = [signature.city, signature.date].filter((part) => part && part.trim()).join(', ');
  const line: CSSProperties = { borderTop: `1px solid ${lineColor}`, marginTop: '0px', paddingTop: 'calc(3px * var(--cv-d, 1))', fontSize: '10pt', color };
  return (
    <div style={{ marginTop: 'calc(14mm * var(--cv-d, 1))', breakInside: 'avoid', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '24px' }}>
      <div style={{ width: '60mm' }}>
        <div style={{ minHeight: '5mm', fontSize: '10pt', color: '#1A1A1A', paddingBottom: '2px' }}>{placeDate}</div>
        <div style={line}>{uiText(data, 'cityLabel')}, {uiText(data, 'dateLabel')}</div>
      </div>
      <div style={{ width: '70mm' }}>
        <div style={{ minHeight: '5mm' }} />
        <div style={line}>{uiText(data, 'signatureLabel')}</div>
      </div>
    </div>
  );
}
