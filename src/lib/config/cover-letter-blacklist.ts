/**
 * Cover Letter Blacklist - Anti-cliché phrases that make cover letters sound AI-generated
 * Extracted from unified-writer-agent.ts for reusability
 */

export const COVER_LETTER_BLACKLIST = {
  openings: [
    "I am writing to apply",
    "I am excited to apply",
    "I am writing to express my interest",
    "I wish to apply",
    "I would like to apply",
    "I am submitting my application",
    "I am reaching out regarding",
    "I came across your job posting",
  ],
  selfDescriptions: [
    "I am a highly motivated",
    "I am a dedicated professional",
    "I am a results-driven",
    "I am a team player",
    "I am a hard worker",
    "I am passionate about",
    "I am confident that",
    "I believe I would be",
    "I am the perfect fit",
    "I am uniquely qualified",
    "I think outside the box",
    "I go the extra mile",
    "I am a self-starter",
    "I am detail-oriented",
    "dynamic professional",
    "proactive individual",
  ],
  closings: [
    "Thank you for considering my application",
    "Thank you for your time and consideration",
    "I look forward to hearing from you",
    "Please do not hesitate to contact me",
    "I would welcome the opportunity",
    "I hope to hear from you soon",
    "References available upon request",
    "Please find attached",
  ],
  fillers: [
    "In today's fast-paced",
    "In this day and age",
    "leverage my skills",
    "utilize my experience",
    "bring to the table",
    "hit the ground running",
    "synergy",
    "paradigm",
    "circle back",
    "move the needle",
  ],
  greetings: [
    "To Whom It May Concern",
    "Dear Sir or Madam",
  ]
};

/**
 * Get all blacklisted phrases as a flat array
 */
export function getAllBlacklistedPhrases(): string[] {
  return [
    ...COVER_LETTER_BLACKLIST.openings,
    ...COVER_LETTER_BLACKLIST.selfDescriptions,
    ...COVER_LETTER_BLACKLIST.closings,
    ...COVER_LETTER_BLACKLIST.fillers,
    ...COVER_LETTER_BLACKLIST.greetings,
  ];
}

/**
 * Check if text contains any blacklisted phrases
 */
export function containsBlacklistedPhrase(text: string): boolean {
  return findBlacklistedPhrases(text).length > 0;
}

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

/**
 * Find all blacklisted phrases in text
 */
export function findBlacklistedPhrases(text: string): string[] {
  const normalizedText = text.replace(/\s+/g, ' ');
  return getAllBlacklistedPhrases().filter((phrase) => phrasePattern(phrase).test(normalizedText));
}

/**
 * Get blacklisted phrases by category
 */
export function getBlacklistByCategory(category: keyof typeof COVER_LETTER_BLACKLIST): string[] {
  return COVER_LETTER_BLACKLIST[category];
}
