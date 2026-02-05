/**
 * Language Detection Utility
 * 
 * Detects the language of text content (currently supports English and German)
 * Used for determining output language for CV, cover letter, and email generation
 */

export type SupportedLanguage = 'en' | 'de';

/**
 * Detect language from text content
 * Currently supports English (en) and German (de)
 * 
 * @param text - Text to analyze
 * @returns 'de' if German indicators found, 'en' otherwise
 */
export function detectLanguage(text: string): SupportedLanguage {
  const germanIndicators = /\b(und|oder|für|mit|bei|auf|zur|zum|von|dem|den|des|wir|Sie|Ihre|Ihr|uns|werden|haben|sein|Anforderungen|Aufgaben|Verantwortung|Erfahrung|Kenntnisse|Qualifikationen|Bewerbung|Unternehmen|GmbH|AG)\b/gi;
  const matches = (text.match(germanIndicators) || []).length;
  
  // If 5 or more German indicators found, consider it German
  return matches >= 5 ? 'de' : 'en';
}

/**
 * Check if text is in German
 */
export function isGerman(text: string): boolean {
  return detectLanguage(text) === 'de';
}

/**
 * Check if text is in English
 */
export function isEnglish(text: string): boolean {
  return detectLanguage(text) === 'en';
}

/**
 * Get language name from code
 */
export function getLanguageName(code: SupportedLanguage): string {
  return code === 'de' ? 'German' : 'English';
}
