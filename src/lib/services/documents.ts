/**
 * Documents service: the user's primary and master CV.
 *
 * `parseAndSaveCv` is the server-side counterpart of what the browser does on
 * upload (POST /api/parse-cv, then a document save): it parses the file with
 * the same parser the route uses and stores the result through the same repo,
 * so a CV saved by an agent is byte-for-byte what the web upload would have
 * stored. Ownership comes from `userId`, never from the input.
 */

import * as documentsRepo from '@/db/repos/documents';
import type { Document } from '@/db/repos/documents';
import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import {
  ACCEPTED_CV_EXTENSIONS,
  CvParseError,
  hasCvParsingCapability,
  parseCvBuffer,
} from '@/lib/cv-parser/parse-cv-core';
import type { StructuredCV } from '@/lib/types/cv-schema';
import { InvalidInputError, NotFoundError } from './errors';

export type CvDocumentType = 'primary_cv' | 'master_cv';

/** Same ceiling the web upload applies to a stored file. */
export const MAX_CV_BYTES = 10 * 1024 * 1024;

export async function getCvDocument(userId: string, type: CvDocumentType): Promise<Document | null> {
  return documentsRepo.getDocumentByType(userId, type);
}

export async function deleteCvDocument(userId: string, type: CvDocumentType): Promise<void> {
  const existing = await documentsRepo.getDocumentByType(userId, type);
  if (!existing) throw new NotFoundError('Document');
  const { error } = await documentsRepo.deleteDocument(userId, existing.id);
  if (error) throw error;
}

function fileTypeFor(fileExt: string): 'pdf' | 'docx' | 'txt' {
  return fileExt === '.pdf' ? 'pdf' : fileExt === '.docx' ? 'docx' : 'txt';
}

/** The text sections the browser stores beside the structured CV. */
function sectionsFor(structured: StructuredCV): Record<string, string> {
  return {
    contactInfo: structured.personal
      ? `${structured.personal.fullName || ''}\n${structured.personal.email || ''}\n${structured.personal.phone || ''}`
      : '',
    summary: structured.summary || '',
    experience: structured.experience?.map((entry) =>
      `${entry.position} at ${entry.company}\n${entry.bullets?.join('\n') || ''}`,
    ).join('\n\n') || '',
    education: structured.education?.map((entry) =>
      `${entry.degree} - ${entry.institution}`,
    ).join('\n') || '',
    skills: structured.skills?.map((category) =>
      `${category.category}: ${category.skills?.join(', ') || ''}`,
    ).join('\n') || '',
  };
}

export interface ParseAndSaveCvInput {
  type: CvDocumentType;
  fileName: string;
  /** The file's bytes (PDF, DOCX, TXT, MD, TEX). Give this or `text`. */
  bytes?: Uint8Array;
  /** Plain text, treated as a .txt file. */
  text?: string;
  region?: 'US' | 'EU';
}

export async function parseAndSaveCv(
  userId: string,
  input: ParseAndSaveCvInput,
): Promise<{ document: Document; structuredCV: StructuredCV; rawText: string }> {
  const fileName = input.fileName.trim();
  if (!fileName) throw new InvalidInputError('A file name is required');
  let fileExt = '.' + (fileName.toLowerCase().split('.').pop() || '');
  let buffer: Buffer;
  if (input.bytes) {
    buffer = Buffer.from(input.bytes);
  } else if (typeof input.text === 'string') {
    buffer = Buffer.from(input.text, 'utf-8');
    if (!ACCEPTED_CV_EXTENSIONS.includes(fileExt)) fileExt = '.txt';
  } else {
    throw new InvalidInputError('Give the CV as a file or as text');
  }
  if (!ACCEPTED_CV_EXTENSIONS.includes(fileExt)) {
    throw new InvalidInputError('Unsupported file type. Accepted formats: PDF, DOCX, TXT, MD, TEX.');
  }
  if (buffer.length === 0) throw new InvalidInputError('The file is empty');
  if (buffer.length > MAX_CV_BYTES) throw new InvalidInputError('The file is larger than 10 MB');
  if (!hasCvParsingCapability()) throw new Error('CV parsing is not configured');

  const generationContext: LlmGenerationContext = {
    requestExecutionId: crypto.randomUUID(),
    userId,
    route: 'service:documents',
    feature: 'cv_parse',
    operation: 'parse_cv',
  };
  let parsed;
  try {
    parsed = await parseCvBuffer({
      buffer,
      fileExt,
      fileName,
      region: input.region === 'US' ? 'US' : 'EU',
      documentType: input.type,
      generationContext,
    });
  } catch (error) {
    if (error instanceof CvParseError && error.status === 400) throw new InvalidInputError(error.message);
    throw error;
  }

  const { structuredCV, rawText } = parsed;
  const sections = sectionsFor(structuredCV);
  const master = input.type === 'master_cv';
  const { document, error } = await documentsRepo.saveDocument(userId, input.type, {
    file_name: fileName,
    file_type: fileTypeFor(fileExt),
    file_size: buffer.length,
    raw_text: rawText,
    sections,
    structured_data: structuredCV,
    ...(master
      ? {
          all_skills: sections.skills ? sections.skills.split(/[,\n•·-]/).map((skill) => skill.trim()).filter(Boolean) : [],
          all_experiences: sections.experience ? sections.experience.split(/\n\n/).filter(Boolean) : [],
          all_education: sections.education ? sections.education.split(/\n\n/).filter(Boolean) : [],
        }
      : {}),
  });
  if (error || !document) throw error ?? new Error('Failed to save the CV');
  return { document, structuredCV, rawText };
}
