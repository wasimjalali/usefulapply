import { ClassicGreenTemplate } from '@/components/cv-templates/ClassicGreenTemplate';
import { GermanATSTemplate } from '@/components/cv-templates/GermanATSTemplate';
import { GermanClassicTemplate } from '@/components/cv-templates/GermanClassicTemplate';
import { USModernATSTemplate } from '@/components/cv-templates/USModernATSTemplate';
import { USPremiumATSTemplate } from '@/components/cv-templates/USPremiumATSTemplate';
import { USProfessionalTemplate } from '@/components/cv-templates/USProfessionalTemplate';
import { CvTemplateSwitch } from '@/components/cv-templates/render';
import { ContactRows, LanguageLine, SignatureBlock, SkillLines } from '@/components/cv-templates/shared';
import { FONT_FACES } from '@/lib/cv-templates/fonts';
import { formatDateRange, formatSingleDate, resolveHeading, sectionHeading } from '@/lib/cv-templates/locale';
import { cvPaper } from '@/lib/cv-templates/paper';
import { getPrintSpec, pageRule } from '@/lib/cv-templates/print-spec';
import { displayUrl, pickLetterLinks } from '@/lib/cv-templates/url';
import { LETTER_CSS, DIN } from './letter-html';
import { PRINT_BASE_CSS } from './print-css';
import { renderToStaticMarkup } from './static-markup';

/**
 * Bump when something that changes the output is not in the hash below: a
 * heading table, a date format, DOCX layout. Everything else is hashed.
 */
export const RENDERER_REVISION = 2;

/** A small fast hash (cyrb53), synchronous so it can run at module load. */
function cyrb53(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Derived, not typed: a hash of the template components, the shared pieces,
 * the print stylesheet, the page rules, the letter styles, the font list, the
 * markup renderer and the text helpers, as they are in this build. Change any
 * of them and the version changes, so a cached export can never be served for
 * output the current code would not produce.
 */
export const RENDERER_VERSION = `${RENDERER_REVISION}.${cyrb53(
  [
    PRINT_BASE_CSS,
    LETTER_CSS,
    JSON.stringify(DIN),
    JSON.stringify(FONT_FACES.map((face) => face.file)),
    pageRule('premium-ats'),
    pageRule('german-ats'),
    JSON.stringify(getPrintSpec('premium-ats')),
    JSON.stringify(getPrintSpec('german-ats')),
    ...[
      USPremiumATSTemplate, USModernATSTemplate, USProfessionalTemplate, GermanATSTemplate, GermanClassicTemplate, ClassicGreenTemplate,
      CvTemplateSwitch, SkillLines, LanguageLine, ContactRows, SignatureBlock,
      renderToStaticMarkup, formatDateRange, formatSingleDate, resolveHeading, sectionHeading, cvPaper, displayUrl, pickLetterLinks,
    ].map((fn) => fn.toString()),
  ].join('\n'),
)}`;
