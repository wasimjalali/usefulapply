/**
 * Document Parser Utility
 * Handles CV parsing via the parse-cv API
 * Extracted from documents page for reusability
 */

import type { ParsedCV } from '@/lib/types';

export interface ParseDocumentResult {
  parsedCV: ParsedCV;
  structuredCV: StructuredCVData | null;
}

export interface StructuredCVData {
  personal?: {
    fullName?: string;
    email?: string;
    phone?: string;
    address?: string;
    linkedIn?: string;
    github?: string;
  };
  summary?: string;
  experience?: Array<{
    company: string;
    position: string;
    startDate?: string;
    endDate?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
  }>;
  skills?: Array<{
    category: string;
    skills?: string[];
    items?: string[];
  }>;
  languages?: Array<{
    language: string;
    proficiency: string;
  }>;
  certifications?: Array<{
    name: string;
    issuer?: string;
    date?: string;
  }>;
}

/**
 * Parse a CV file (PDF or DOCX) using the parse-cv API
 * Returns both legacy ParsedCV format and structured CV data
 */
export async function parseDocument(file: File): Promise<ParseDocumentResult | null> {
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch('/api/parse-cv', {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const result = await response.json();
      
      // API returns { success, structuredCV, originalPdf, rawText }
      if (result.success && result.rawText) {
        // Create ParsedCV for backward compatibility
        const parsedCV: ParsedCV = {
          rawText: result.rawText,
          sections: {
            contactInfo: result.structuredCV?.personal ? 
              `${result.structuredCV.personal.fullName || ''}\n${result.structuredCV.personal.email || ''}\n${result.structuredCV.personal.phone || ''}` : '',
            summary: result.structuredCV?.summary || '',
            experience: result.structuredCV?.experience?.map((e: { company: string; position: string; bullets?: string[] }) => 
              `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
            ).join('\n\n') || '',
            education: result.structuredCV?.education?.map((e: { institution: string; degree: string }) => 
              `${e.degree} - ${e.institution}`
            ).join('\n') || '',
            skills: result.structuredCV?.skills?.map((s: { category: string; skills?: string[]; items?: string[] }) => 
              `${s.category}: ${s.skills?.join(', ') || s.items?.join(', ') || ''}`
            ).join('\n') || '',
          },
          fileName: file.name,
          fileType: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
        };
        
        // Return both the legacy format AND the structured CV
        return { 
          parsedCV, 
          structuredCV: result.structuredCV as StructuredCVData 
        };
      }
      
      // Fallback: try legacy format
      if (result.data) {
        return { parsedCV: result.data as ParsedCV, structuredCV: null };
      }
    }
    return null;
  } catch (error) {
    console.error('Document parse error:', error);
    return null;
  }
}

/**
 * Extract skills from parsed CV sections
 */
export function extractSkillsFromCV(parsedCV: ParsedCV): string[] {
  if (!parsedCV.sections.skills) return [];
  
  return parsedCV.sections.skills
    .split(/[,\n•·\-]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Extract experiences from parsed CV sections
 */
export function extractExperiencesFromCV(parsedCV: ParsedCV): string[] {
  if (!parsedCV.sections.experience) return [];
  
  return parsedCV.sections.experience
    .split(/\n\n/)
    .filter(Boolean);
}

/**
 * Extract education from parsed CV sections
 */
export function extractEducationFromCV(parsedCV: ParsedCV): string[] {
  if (!parsedCV.sections.education) return [];
  
  return parsedCV.sections.education
    .split(/\n\n/)
    .filter(Boolean);
}

/**
 * Validate file type for CV upload
 */
export function isValidCVFile(file: File): boolean {
  const validTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
  ];
  
  const validExtensions = ['.pdf', '.docx', '.doc'];
  const fileName = file.name.toLowerCase();
  
  return (
    validTypes.includes(file.type) ||
    validExtensions.some(ext => fileName.endsWith(ext))
  );
}

/**
 * Validate file size for CV upload (max 10MB)
 */
export function isValidCVFileSize(file: File, maxSizeMB = 10): boolean {
  return file.size <= maxSizeMB * 1024 * 1024;
}
