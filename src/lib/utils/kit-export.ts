/**
 * Small export helpers for the Application Kit: file naming and emails and
 * answers as plain text. Every PDF and DOCX is rendered on the server.
 */

import type { ScreeningAnswerItem } from '@/store/useSessionStore';

export function sanitizeFilePart(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/** `Alex_Morgan_Pixellot_Cover_Letter.pdf` style names, shared across the kit. */
export function kitFilename(applicantName: string, company: string, suffix: string, ext: string): string {
  const parts = [sanitizeFilePart(applicantName || 'Applicant'), sanitizeFilePart(company), suffix].filter(Boolean);
  return `${parts.join('_')}.${ext}`;
}

export function formatEmailAsText(email: { subject: string; body: string }): string {
  return `Subject: ${email.subject}\n\n${email.body}`;
}

export function buildTextBlob(text: string): Blob {
  return new Blob([text], { type: 'text/plain;charset=utf-8' });
}

export function formatAnswersAsText(answers: ScreeningAnswerItem[]): string {
  return answers
    .map((a, i) => `${i + 1}. ${a.question}\n${a.answer}`)
    .join('\n\n');
}
