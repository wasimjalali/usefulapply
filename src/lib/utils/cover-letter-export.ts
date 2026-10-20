/**
 * Cover letter export: plain text, PDF (jsPDF) and DOCX (docx). Shared by the
 * cover letter tab and the kit-wide Download all.
 */

import { jsPDF } from 'jspdf';
import { Document, Packer, Paragraph, TextRun } from 'docx';
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

export function buildCoverLetterPdfBlob(letter: GeneratedCoverLetter): Blob {
  const doc = new jsPDF();
  
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const maxWidth = pageWidth - margin * 2;
  let yPos = margin;
  const lineHeight = 6;
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  
  // Check if this is body-only format (3-agent architecture)
  if (!letter.applicantAddress.name && letter.body) {
    // Body contains the full letter - just render it
    const bodyLines = doc.splitTextToSize(letter.body, maxWidth);
    for (const line of bodyLines) {
      if (yPos > 270) {
        doc.addPage();
        yPos = margin;
      }
      doc.text(line, margin, yPos);
      yPos += lineHeight;
    }
  } else {
    // Structured format - render each section
    // Applicant Address
    doc.setFont('helvetica', 'bold');
    doc.text(letter.applicantAddress.name, margin, yPos);
    doc.setFont('helvetica', 'normal');
    yPos += lineHeight;
    if (letter.applicantAddress.street) {
      doc.text(letter.applicantAddress.street, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.applicantAddress.city) {
      doc.text(letter.applicantAddress.city, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.applicantAddress.country) {
      doc.text(letter.applicantAddress.country, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.applicantAddress.phone) {
      doc.text(letter.applicantAddress.phone, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.applicantAddress.email) {
      doc.text(letter.applicantAddress.email, margin, yPos);
      yPos += lineHeight;
    }
    yPos += lineHeight;
    
    // Date
    if (letter.date) {
      doc.text(letter.date, margin, yPos);
      yPos += lineHeight * 2;
    }
    
    // Company Address
    if (letter.companyAddress.companyName) {
      doc.setFont('helvetica', 'bold');
      doc.text(letter.companyAddress.companyName, margin, yPos);
      doc.setFont('helvetica', 'normal');
      yPos += lineHeight;
    }
    if (letter.companyAddress.department) {
      doc.text(letter.companyAddress.department, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.companyAddress.street) {
      doc.text(letter.companyAddress.street, margin, yPos);
      yPos += lineHeight;
    }
    if (letter.companyAddress.city) {
      doc.text(letter.companyAddress.city, margin, yPos);
      yPos += lineHeight;
    }
    yPos += lineHeight;
    
    // Salutation
    if (letter.salutation) {
      doc.text(letter.salutation, margin, yPos);
      yPos += lineHeight * 2;
    }
    
    // Body - split into lines
    const bodyLines = doc.splitTextToSize(letter.body, maxWidth);
    for (const line of bodyLines) {
      if (yPos > 270) {
        doc.addPage();
        yPos = margin;
      }
      doc.text(line, margin, yPos);
      yPos += lineHeight;
    }
    yPos += lineHeight;
    
    // Closing
    if (letter.closing) {
      doc.text(letter.closing, margin, yPos);
      yPos += lineHeight * 3;
    }
    
    // Signature
    if (letter.signatureName) {
      doc.setFont('helvetica', 'bold');
      doc.text(letter.signatureName, margin, yPos);
    }
  }
  return doc.output('blob');
}

export async function buildCoverLetterDocxBlob(letter: GeneratedCoverLetter): Promise<Blob> {
  // Check if this is body-only format (3-agent architecture)
  const isBodyOnly = !letter.applicantAddress.name && letter.body;
  
  let children: Paragraph[];
  
  if (isBodyOnly) {
    // Body contains the full letter - split by paragraphs
    children = letter.body.split('\n\n').map(para => 
      new Paragraph({ 
        children: [new TextRun(para.trim())],
        spacing: { after: 200 },
      })
    );
  } else {
    // Structured format - render each section
    children = [
      // Applicant Address
      new Paragraph({
        children: [new TextRun({ text: letter.applicantAddress.name, bold: true })],
      }),
      ...(letter.applicantAddress.street ? [new Paragraph({ children: [new TextRun(letter.applicantAddress.street)] })] : []),
      ...(letter.applicantAddress.city ? [new Paragraph({ children: [new TextRun(letter.applicantAddress.city)] })] : []),
      ...(letter.applicantAddress.country ? [new Paragraph({ children: [new TextRun(letter.applicantAddress.country)] })] : []),
      ...(letter.applicantAddress.phone ? [new Paragraph({ children: [new TextRun(letter.applicantAddress.phone)] })] : []),
      ...(letter.applicantAddress.email ? [new Paragraph({ children: [new TextRun(letter.applicantAddress.email)] })] : []),
      new Paragraph({ children: [] }), // Empty line
      
      // Date
      ...(letter.date ? [new Paragraph({ children: [new TextRun(letter.date)] })] : []),
      new Paragraph({ children: [] }), // Empty line
      
      // Company Address
      ...(letter.companyAddress.companyName ? [new Paragraph({
        children: [new TextRun({ text: letter.companyAddress.companyName, bold: true })],
      })] : []),
      ...(letter.companyAddress.department ? [new Paragraph({ children: [new TextRun(letter.companyAddress.department)] })] : []),
      ...(letter.companyAddress.street ? [new Paragraph({ children: [new TextRun(letter.companyAddress.street)] })] : []),
      ...(letter.companyAddress.city ? [new Paragraph({ children: [new TextRun(letter.companyAddress.city)] })] : []),
      new Paragraph({ children: [] }), // Empty line
      
      // Salutation
      ...(letter.salutation ? [new Paragraph({ children: [new TextRun(letter.salutation)] })] : []),
      new Paragraph({ children: [] }), // Empty line
      
      // Body - split by paragraphs
      ...letter.body.split('\n\n').map(para => 
        new Paragraph({ 
          children: [new TextRun(para.trim())],
          spacing: { after: 200 },
        })
      ),
      
      // Closing
      ...(letter.closing ? [new Paragraph({ children: [new TextRun(letter.closing)] })] : []),
      new Paragraph({ children: [] }), // Empty line
      new Paragraph({ children: [] }), // Empty line
      
      // Signature
      ...(letter.signatureName ? [new Paragraph({
        children: [new TextRun({ text: letter.signatureName, bold: true })],
      })] : []),
    ];
  }
  
  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });
  return Packer.toBlob(doc);
}
