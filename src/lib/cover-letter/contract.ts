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
  const isText = (x: unknown): x is string => typeof x === 'string';
  const isFilled = (x: unknown): x is string => isText(x) && x.trim().length > 0;
  const isTextList = (x: unknown): x is string[] => Array.isArray(x) && x.every(isText);
  const isOptionalText = (x: unknown) => x === undefined || isText(x);
  const sender = v.sender as Partial<StructuredCoverLetter['sender']> | undefined;
  const recipient = v.recipient as Partial<StructuredCoverLetter['recipient']> | undefined;
  return (
    v.version === 2 &&
    isFilled(v.language) &&
    (v.market === 'us' || v.market === 'dach') &&
    isFilled(v.date) &&
    isFilled(v.subject) &&
    isFilled(v.salutation) &&
    isTextList(v.paragraphs) &&
    v.paragraphs.length > 0 &&
    isFilled(v.closing) &&
    isFilled(v.signatureName) &&
    isOptionalText(v.place) &&
    !!sender &&
    typeof sender === 'object' &&
    isFilled(sender.name) &&
    isTextList(sender.addressLines) &&
    isOptionalText(sender.phone) &&
    isOptionalText(sender.email) &&
    (sender.links === undefined || isTextList(sender.links)) &&
    !!recipient &&
    typeof recipient === 'object' &&
    isTextList(recipient.addressLines) &&
    isOptionalText(recipient.companyName) &&
    isOptionalText(recipient.contactPerson) &&
    isOptionalText(recipient.department)
  );
}
