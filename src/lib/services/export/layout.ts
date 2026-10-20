import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { isDachTemplate } from '@/lib/cv-templates/print-spec';
import type { LetterLayout } from './letter-html';

/**
 * US business letter or DIN 5008 Form B. In order of authority:
 *   1. an explicit `letterLocale` ("de" means DIN, anything else the US letter)
 *   2. the structured letter's own market
 *   3. the application's cover_letter_language when it is not the default
 *      English (German means DIN)
 *   4. the CV template's market
 */
export function resolveLetterLayout(args: {
  letterLocale?: string | null;
  structured?: Pick<StructuredCoverLetter, 'market'> | null;
  letterLanguage?: string | null;
  templateId: string;
}): LetterLayout {
  const explicit = args.letterLocale?.trim().toLowerCase();
  if (explicit) return explicit.startsWith('de') ? 'din' : 'us';
  if (args.structured) return args.structured.market === 'dach' ? 'din' : 'us';
  const language = args.letterLanguage?.trim().toLowerCase();
  if (language && !language.startsWith('en')) return language.startsWith('de') ? 'din' : 'us';
  return isDachTemplate(args.templateId) ? 'din' : 'us';
}
