/**
 * Language Detection Utility
 *
 * Detects the language of text content. Supports the same 7 languages as the
 * CV section splitter so JD/CV detection stays in sync.
 * Used for determining output language for CV, cover letter, and email generation.
 */

export type SupportedLanguage = 'en' | 'de' | 'fr' | 'es' | 'pt' | 'it' | 'nl';

const LANGUAGE_INDICATORS: Record<Exclude<SupportedLanguage, 'en'>, RegExp> = {
  de: /\b(und|oder|für|mit|bei|auf|zur|zum|von|dem|den|des|wir|Sie|Ihre|Ihr|uns|werden|haben|sein|Anforderungen|Aufgaben|Verantwortung|Erfahrung|Kenntnisse|Qualifikationen|Bewerbung|Unternehmen|GmbH|AG)\b/gi,
  fr: /\b(le|la|les|un|une|des|et|ou|pour|avec|dans|sur|nous|vous|votre|expérience|compétences|exigences|missions|formation|entreprise|candidature|poste)\b/gi,
  es: /\b(el|la|los|las|un|una|y|o|para|con|en|sobre|nosotros|usted|su|sus|experiencia|conocimientos|requisitos|funciones|formación|empresa|candidatura|puesto)\b/gi,
  pt: /\b(o|a|os|as|um|uma|e|ou|para|com|em|sobre|nós|você|seu|sua|experiência|conhecimentos|requisitos|funções|formação|empresa|candidatura)\b/gi,
  it: /\b(il|la|i|le|un|una|uno|e|o|per|con|in|su|noi|voi|vostro|esperienza|competenze|requisiti|mansioni|formazione|azienda|candidatura|posizione)\b/gi,
  nl: /\b(de|het|een|en|of|voor|met|bij|op|over|wij|jij|u|uw|ervaring|kennis|vereisten|taken|opleiding|bedrijf|sollicitatie|vacature)\b/gi,
};

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
};

const SUPPORTED_LANGUAGES = new Set<SupportedLanguage>(Object.keys(LANGUAGE_NAMES) as SupportedLanguage[]);

export function normalizeLanguage(value: unknown): SupportedLanguage {
  return typeof value === 'string' && SUPPORTED_LANGUAGES.has(value as SupportedLanguage)
    ? value as SupportedLanguage
    : 'en';
}

/**
 * Detect language from text content.
 *
 * @param text - Text to analyze
 * @returns one of the 7 supported language codes; defaults to 'en'
 */
export function detectLanguage(text: string): SupportedLanguage {
  let best: { lang: SupportedLanguage; score: number } = { lang: 'en', score: 0 };

  for (const [lang, pattern] of Object.entries(LANGUAGE_INDICATORS) as Array<[Exclude<SupportedLanguage, 'en'>, RegExp]>) {
    const score = (text.match(pattern) || []).length;
    if (score > best.score) {
      best = { lang, score };
    }
  }

  // Threshold of 5 keeps short or code-mixed text classified as English by default.
  return best.score >= 5 ? best.lang : 'en';
}

export function isGerman(text: string): boolean {
  return detectLanguage(text) === 'de';
}

export function isEnglish(text: string): boolean {
  return detectLanguage(text) === 'en';
}

export function getLanguageName(code: SupportedLanguage): string {
  return LANGUAGE_NAMES[normalizeLanguage(code)];
}
