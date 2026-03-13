/**
 * Education Section Parser
 * 
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles parsing of education entries from CV text.
 */

import { CVData } from '../cv-templates/types';

export function parseEducationSection(
  sections: Map<string, string>,
  original?: CVData['education']
): CVData['education'] {
  const content = sections.get('EDUCATION');
  
  // Education rarely changes significantly, use original if no content
  if (!content) return original || [];
  
  const education: CVData['education'] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  let currentEntry: Partial<CVData['education'][0]> & { highlights: string[] } = { highlights: [] };
  
  for (const line of lines) {
    // Check if it's a bullet point (highlight)
    if (line.startsWith('•') || line.startsWith('-')) {
      const highlight = line.replace(/^[•\-]\s*/, '').trim();
      if (highlight) currentEntry.highlights.push(highlight);
      continue;
    }
    
    // Check if this looks like a new education entry
    const hasDate = line.match(/\d{4}/);
    // Multilingual degree keywords (EN + DE + FR + ES + PT + IT + NL)
    const hasDegree = line.match(/bachelor|master|abitur|diploma|degree|certificate|bsc|msc|ba|ma|phd|diplom|magister|staatsexamen|vordiplom|licence|licenciatura|laurea|doutorado|doctorado|meester|kandidaat|ingenieur|ingeniero|mba|b\.?eng|m\.?eng|b\.?sc|m\.?sc|associate/i);
    // Multilingual institution keywords
    const hasInstitution = line.match(/university|school|college|hochschule|institut|academy|universität|fachhochschule|université|universidad|universidade|università|universiteit|polytechnic|escuela|escola|scuola|hogeschool/i);
    
    // If we have a date and already have some entry data, this might be a new entry
    if (hasDate && (currentEntry.degree || currentEntry.institution)) {
      // Save current entry
      if (currentEntry.degree || currentEntry.institution) {
        education.push({
          id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          degree: currentEntry.degree || '',
          institution: currentEntry.institution || '',
          field: currentEntry.field,
          location: currentEntry.location,
          startDate: currentEntry.startDate,
          endDate: currentEntry.endDate,
          grade: currentEntry.grade,
          highlights: currentEntry.highlights.length > 0 ? currentEntry.highlights : undefined,
        });
      }
      currentEntry = { highlights: [] };
    }
    
    // Extract degree
    if (hasDegree && !currentEntry.degree) {
      currentEntry.degree = line;
    }
    // Extract institution
    else if (hasInstitution && !currentEntry.institution) {
      currentEntry.institution = line;
    }
    // Extract date — supports: "2018 – 2022", "Jan 2018 – Dec 2022", "01/2018 – 12/2022",
    // "Oktober 2018 – Juni 2022", "2018-01 – 2022-12", and multilingual "present" equivalents
    else if (hasDate) {
      const presentPattern = 'Present|Current|Heute|Aktuell|Présent|Actuel|Actual|Attuale|Heden|Atualmente|Presente';
      // Try full date range first (month+year or numeric)
      const fullDateMatch = line.match(
        new RegExp(`([A-Za-zÀ-ÿ]+\\.?\\s*\\d{4}|\\d{1,2}[/.]\\d{4}|\\d{4}-\\d{2}|\\d{4})\\s*[–\\-—]\\s*([A-Za-zÀ-ÿ]+\\.?\\s*\\d{4}|\\d{1,2}[/.]\\d{4}|\\d{4}-\\d{2}|\\d{4}|${presentPattern})`, 'i')
      );
      if (fullDateMatch) {
        currentEntry.startDate = fullDateMatch[1].trim();
        currentEntry.endDate = fullDateMatch[2].trim();
      } else {
        // Fallback: simple year extraction
        const yearMatch = line.match(/(\d{4})\s*[–\-—]?\s*(\d{4})?/);
        if (yearMatch) {
          currentEntry.startDate = yearMatch[1];
          currentEntry.endDate = yearMatch[2] || yearMatch[1];
        }
      }
    }
  }
  
  // Add last entry
  if (currentEntry.degree || currentEntry.institution) {
    education.push({
      id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      degree: currentEntry.degree || '',
      institution: currentEntry.institution || '',
      field: currentEntry.field,
      location: currentEntry.location,
      startDate: currentEntry.startDate,
      endDate: currentEntry.endDate,
      grade: currentEntry.grade,
      highlights: currentEntry.highlights.length > 0 ? currentEntry.highlights : undefined,
    });
  }
  
  console.log('[ParseOptimizedCV] Parsed', education.length, 'education entries');
  
  return education.length > 0 ? education : (original || []);
}
