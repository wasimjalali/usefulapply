/**
 * Cover letter as plain text, for copying, the word count and the server export
 * of a letter without a structured copy. The PDF and DOCX are rendered on the server.
 */

import type { GeneratedCoverLetter } from '@/lib/types';
import { legacyCoverLetterText } from '@/lib/cover-letter/legacy-text';

export function formatCoverLetterAsText(letter: GeneratedCoverLetter): string {
  return legacyCoverLetterText(letter);
}

export function hasAddressPlaceholder(letter: GeneratedCoverLetter): boolean {
  const fullText = formatCoverLetterAsText(letter);
  return fullText.includes('[Company Address') || fullText.includes('[Insert Company Address');
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
