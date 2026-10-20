import type { StructuredCoverLetter } from '@/lib/cover-letter/contract';
import { looksGerman } from '@/lib/cv-templates/locale';
import { isDachTemplate } from '@/lib/cv-templates/print-spec';
import type { LetterLayout } from './letter-html';

/**
 * US business letter or DIN 5008 Form B. In order of authority:
 *   1. an explicit `letterLocale` ("de" means DIN, anything else the US letter)
 *   2. the structured letter's own market
 *   3. for a legacy letter, the language of its stored body: German means DIN
 *   4. the CV template's market
 *
 * application_sessions.cover_letter_language is NOT NULL DEFAULT 'en', so its
 * 'en' cannot mean "unknown" and it is not consulted. The language of the text
 * itself is read with an offline heuristic, so the layout is deterministic and
 * safe to put in the cache key.
 */
export function resolveLetterLayout(args: {
  letterLocale?: string | null;
  structured?: Pick<StructuredCoverLetter, 'market'> | null;
  legacyText?: string | null;
  templateId: string;
}): LetterLayout {
  const explicit = args.letterLocale?.trim().toLowerCase();
  if (explicit) return explicit.startsWith('de') ? 'din' : 'us';
  if (args.structured) return args.structured.market === 'dach' ? 'din' : 'us';
  if (args.legacyText && looksGerman(args.legacyText)) return 'din';
  return isDachTemplate(args.templateId) ? 'din' : 'us';
}
