/**
 * Other Section Parsers — Certifications, Projects, Additional Info
 * 
 * Extracted from parse-optimized-cv.ts for modularity.
 */

import { CVData } from '../cv-templates/types';

export function parseCertificationsSection(sections: Map<string, string>): CVData['certifications'] {
  const content = sections.get('CERTIFICATIONS');
  if (!content) return [];
  
  const certifications: CVData['certifications'] = [];
  
  // Helper: Strip certification IDs from text
  const stripCertificationIds = (text: string): string => {
    return text
      // Remove "ID: xxx" patterns
      .replace(/\s*ID:\s*[a-zA-Z0-9\-]+/gi, '')
      // Remove standalone UUID-like patterns
      .replace(/\s*[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '')
      // Remove short alphanumeric IDs (like "8e478390df")
      .replace(/\s*ID:\s*[a-zA-Z0-9]{6,}/gi, '')
      // Remove verification codes
      .replace(/\s*Verification\s*(?:Code|ID)?:\s*[a-zA-Z0-9\-]+/gi, '')
      // Remove credential IDs
      .replace(/\s*Credential\s*ID:\s*[a-zA-Z0-9\-]+/gi, '')
      // Clean up any double spaces left behind
      .replace(/\s{2,}/g, ' ')
      .trim();
  };
  
  // Split by bullet points or newlines
  const entries = content.split(/[•\n]/).map(e => e.trim()).filter(e => e.length > 5);
  
  for (const entry of entries) {
    // Skip section headers
    if (entry.toUpperCase() === 'CERTIFICATIONS' || entry.toUpperCase() === 'CERTIFICATES') continue;
    
    // Strip IDs from the entry first
    const cleanEntry = stripCertificationIds(entry);
    
    let name = cleanEntry;
    let issuer = '';
    let date = '';
    
    // Pattern 1: "Name – Issuer | Date (Score)" - keep everything including score
    const fullMatch = cleanEntry.match(/^(.+?)\s*[–\-—]\s*(.+?)(?:\s*\|\s*(.+))?$/);
    if (fullMatch) {
      name = fullMatch[1].replace(/^[•\-]\s*/, '').trim();
      issuer = fullMatch[2].trim();
      date = fullMatch[3]?.trim() || '';
    } else {
      // Pattern 2: Try parentheses format: "Name (Issuer)"
      const issuerMatch = cleanEntry.match(/^(.+?)\s*\(([^)]+)\)/);
      if (issuerMatch) {
        name = issuerMatch[1].replace(/^[•\-]\s*/, '').trim();
        // Check if it's actually a score in parentheses
        if (!issuerMatch[2].match(/\d+%|\d+\/\d+/)) {
          issuer = issuerMatch[2].trim();
        }
      }
    }
    
    // Clean up name - also strip any remaining ID patterns
    name = stripCertificationIds(name.replace(/^[•\-]\s*/, '')).trim();
    issuer = stripCertificationIds(issuer).trim();
    date = stripCertificationIds(date).trim();
    
    if (name.length > 3) {
      certifications.push({
        id: `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name,
        issuer,
        date: date || undefined,
      });
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', certifications.length, 'certifications');
  
  return certifications;
}

export function parseProjectsSection(sections: Map<string, string>): CVData['projects'] | undefined {
  const content = sections.get('PROJECTS');
  if (!content) return undefined;
  
  const projects: NonNullable<CVData['projects']> = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  let currentProject: {
    name: string;
    description: string;
    bullets: string[];
    technologies: string[];
    url?: string;
  } | null = null;
  
  for (const line of lines) {
    // Check if it's a bullet point
    if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
      const bullet = line.replace(/^[•\-\*]\s*/, '').trim();
      if (currentProject && bullet) {
        currentProject.bullets.push(bullet);
      }
    } else if (line.length > 0 && line.length < 150) {
      // New project header
      if (currentProject && currentProject.name) {
        projects.push({
          id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: currentProject.name,
          description: currentProject.bullets.join(' ') || currentProject.description,
          technologies: currentProject.technologies,
          url: currentProject.url,
        });
      }
      currentProject = {
        name: line,
        description: '',
        bullets: [],
        technologies: [],
      };
    }
  }
  
  // Add last project
  if (currentProject && currentProject.name) {
    projects.push({
      id: `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: currentProject.name,
      description: currentProject.bullets.join(' ') || currentProject.description,
      technologies: currentProject.technologies,
      url: currentProject.url,
    });
  }
  
  console.log('[ParseOptimizedCV] Parsed', projects.length, 'projects');
  
  return projects.length > 0 ? projects : undefined;
}

/**
 * ATS-safe display titles for canonical custom section keys.
 */
const CUSTOM_SECTION_TITLES: Record<string, string> = {
  'ACHIEVEMENTS': 'Selected Achievements',
  'VOLUNTEER': 'Volunteer Experience',
  'PUBLICATIONS': 'Publications',
  'REFERENCES': 'References',
  'INTERESTS': 'Interests',
  'TEACHING': 'Teaching Experience',
  'RESEARCH': 'Research',
  'COURSEWORK': 'Relevant Coursework',
  'PORTFOLIO': 'Portfolio',
};

/** Canonical section keys that have dedicated renderers (not custom) */
const CANONICAL_KEYS = new Set([
  'SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS',
  'LANGUAGES', 'CERTIFICATIONS', 'PROJECTS', 'ADDITIONAL INFORMATION',
]);

/**
 * Extract all non-canonical sections as customSections for the generic fallback renderer.
 * This ensures no parsed section is ever silently dropped.
 */
export function parseCustomSections(sections: Map<string, string>): CVData['customSections'] {
  const custom: NonNullable<CVData['customSections']> = [];

  for (const [key, content] of sections) {
    if (CANONICAL_KEYS.has(key)) continue;
    if (!content || content.trim().length < 3) continue;

    const title = CUSTOM_SECTION_TITLES[key] || key.charAt(0) + key.slice(1).toLowerCase();
    const items = content
      .split(/[•\n]/)
      .map(i => i.trim())
      .filter(i => i.length > 2 && i.length < 500);

    if (items.length > 0) {
      custom.push({
        id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title,
        items: [...new Set(items)],
      });
    }
  }

  console.log('[ParseOther] Parsed', custom.length, 'custom sections:', custom.map(s => s.title).join(', '));
  return custom.length > 0 ? custom : undefined;
}

export function parseAdditionalInfoSection(sections: Map<string, string>): string[] | undefined {
  const content = sections.get('ADDITIONAL INFORMATION');
  if (!content) return undefined;
  
  // Split by common separators and clean up
  const items = content
    .split(/[,\n•]/)
    .map(i => i.trim())
    .filter(i => i.length > 2 && i.length < 200)
    .filter(i => !i.match(/^additional\s+information$/i));
  
  // Deduplicate
  const unique = [...new Set(items)];
  
  console.log('[ParseOptimizedCV] Parsed', unique.length, 'additional info items');
  
  return unique.length > 0 ? unique : undefined;
}
