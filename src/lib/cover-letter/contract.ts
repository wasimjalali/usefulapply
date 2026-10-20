/**
 * Structured cover letter contract (PLAN.md section 5). The writer agent emits
 * it; the export renderer lays it out as a US business letter or DIN 5008 Form B.
 * Recipient fields hold verified details only and may be empty.
 */
export interface CoverLetterSender {
  name: string;
  addressLines: string[];
  phone?: string;
  email?: string;
  links?: string[];
}

export interface CoverLetterRecipient {
  companyName?: string;
  contactPerson?: string;
  department?: string;
  addressLines: string[];
}

export interface StructuredCoverLetter {
  version: 2;
  language: string;
  market: 'us' | 'dach';
  sender: CoverLetterSender;
  recipient: CoverLetterRecipient;
  place?: string;
  date: string;
  subject: string;
  salutation: string;
  paragraphs: string[];
  closing: string;
  signatureName: string;
}

export function isStructuredCoverLetter(value: unknown): value is StructuredCoverLetter {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StructuredCoverLetter>;
  return (
    v.version === 2 &&
    typeof v.subject === 'string' &&
    typeof v.salutation === 'string' &&
    typeof v.closing === 'string' &&
    typeof v.signatureName === 'string' &&
    typeof v.date === 'string' &&
    (v.market === 'us' || v.market === 'dach') &&
    Array.isArray(v.paragraphs) &&
    v.paragraphs.every((p) => typeof p === 'string') &&
    !!v.sender &&
    typeof v.sender.name === 'string' &&
    Array.isArray(v.sender.addressLines) &&
    !!v.recipient &&
    Array.isArray(v.recipient.addressLines)
  );
}
