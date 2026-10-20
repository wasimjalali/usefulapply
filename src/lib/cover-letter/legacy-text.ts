import type { GeneratedCoverLetter } from '@/lib/types';

/**
 * The text of a cover letter that has no structured contract. Older letters
 * either hold the whole letter, header included, in `body` (the writer's
 * 3-agent format), or spread it over address fields around a body.
 *
 * Shared by the TXT export, the browser fallback export and the server export,
 * so all of them print the same words.
 */
export function legacyCoverLetterText(letter: GeneratedCoverLetter): string {
  // The body holds the full letter (3-agent architecture): return it as it is.
  if (!letter.applicantAddress.name && letter.body) {
    return letter.body;
  }
  return `${letter.applicantAddress.name}
${letter.applicantAddress.street}
${letter.applicantAddress.city}
${letter.applicantAddress.country}
${letter.applicantAddress.phone}
${letter.applicantAddress.email}

${letter.date}

${letter.companyAddress.companyName}
${letter.companyAddress.department || ''}
${letter.companyAddress.street || ''}
${letter.companyAddress.city || ''}

${letter.salutation}

${letter.body}

${letter.closing}

${letter.signatureName}`;
}
