/**
 * Small export helpers for the Application Kit: file naming, emails as TXT
 * and the screening answers document as PDF.
 */

import { jsPDF } from 'jspdf';
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

export function buildAnswersPdfBlob(answers: ScreeningAnswerItem[], company: string): Blob {
  const doc = new jsPDF();
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 6;
  let y = margin;

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(company ? `Screening answers: ${company}` : 'Screening answers', margin, y);
  y += lineHeight * 2;

  doc.setFontSize(11);
  answers.forEach((item, index) => {
    doc.setFont('helvetica', 'bold');
    const qLines: string[] = doc.splitTextToSize(`${index + 1}. ${item.question}`, maxWidth);
    ensureRoom(qLines.length * lineHeight + lineHeight);
    for (const line of qLines) {
      doc.text(line, margin, y);
      y += lineHeight;
    }
    doc.setFont('helvetica', 'normal');
    const aLines: string[] = doc.splitTextToSize(item.answer, maxWidth);
    for (const line of aLines) {
      ensureRoom(lineHeight);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += lineHeight;
  });

  return doc.output('blob');
}
