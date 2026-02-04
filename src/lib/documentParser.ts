// PDF and DOCX parsing utilities
import mammoth from 'mammoth';
import type { ParsedCV } from './types';

/**
 * Parse a PDF file and extract text content
 */
export async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    // Use require for pdf-parse to avoid ESM issues
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('PDF parsing error:', error);
    throw new Error('Failed to parse PDF file');
  }
}

/**
 * Parse a DOCX file and extract text content
 */
export async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error('DOCX parsing error:', error);
    throw new Error('Failed to parse DOCX file');
  }
}

/**
 * Detect file type from buffer or filename
 */
export function detectFileType(filename: string): 'pdf' | 'docx' | 'unknown' {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'pdf') return 'pdf';
  if (extension === 'docx' || extension === 'doc') return 'docx';
  return 'unknown';
}

/**
 * Parse any supported document type
 */
export async function parseDocument(
  buffer: Buffer,
  filename: string
): Promise<ParsedCV> {
  const fileType = detectFileType(filename);
  
  if (fileType === 'unknown') {
    throw new Error('Unsupported file type. Please upload PDF or DOCX.');
  }

  let rawText: string;
  
  if (fileType === 'pdf') {
    rawText = await parsePDF(buffer);
  } else {
    rawText = await parseDOCX(buffer);
  }

  // Basic section detection (can be enhanced with AI later)
  const sections = extractSections(rawText);

  return {
    rawText,
    sections,
    fileName: filename,
    fileType,
  };
}

/**
 * Basic section extraction from CV text
 * This uses simple heuristics - could be enhanced with AI
 */
function extractSections(text: string): ParsedCV['sections'] {
  const sections: ParsedCV['sections'] = {};
  
  // Common section headers (case-insensitive)
  const sectionPatterns = {
    contactInfo: /^(contact|personal\s*info|details)/im,
    summary: /^(summary|profile|objective|about\s*me)/im,
    experience: /^(experience|work\s*history|employment|professional\s*experience)/im,
    education: /^(education|academic|qualifications)/im,
    skills: /^(skills|technical\s*skills|competencies|expertise)/im,
  };

  // Split text into lines for analysis
  const lines = text.split('\n');
  let currentSection: keyof typeof sections | 'other' = 'other';
  let currentContent: string[] = [];

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if this line is a section header
    let foundSection = false;
    for (const [section, pattern] of Object.entries(sectionPatterns)) {
      if (pattern.test(trimmedLine)) {
        // Save previous section content
        if (currentContent.length > 0) {
          sections[currentSection as keyof typeof sections] = currentContent.join('\n');
        }
        currentSection = section as keyof typeof sections;
        currentContent = [];
        foundSection = true;
        break;
      }
    }

    if (!foundSection && trimmedLine) {
      currentContent.push(trimmedLine);
    }
  }

  // Save last section
  if (currentContent.length > 0) {
    sections[currentSection as keyof typeof sections] = currentContent.join('\n');
  }

  return sections;
}

/**
 * Convert parsed CV back to formatted text
 */
export function cvToText(cv: ParsedCV): string {
  return cv.rawText;
}

/**
 * Parse document from base64 string
 */
export async function parseDocumentFromBase64(
  base64: string,
  filename: string
): Promise<ParsedCV> {
  const buffer = Buffer.from(base64, 'base64');
  return parseDocument(buffer, filename);
}

/**
 * Parse document by MIME type (legacy support)
 */
export async function parseByMimeType(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === 'application/pdf') {
    return parsePDF(buffer);
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return parseDOCX(buffer);
  } else {
    throw new Error('Unsupported file type');
  }
}
