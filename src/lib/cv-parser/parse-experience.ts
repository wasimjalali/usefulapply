/**
 * Experience Section Parser
 * 
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles parsing of work experience entries from CV text.
 */

import { CVData } from '../cv-templates/types';

export function parseExperienceSection(
  sections: Map<string, string>,
  originalExperience?: CVData['experience']
): CVData['experience'] {
  const content = sections.get('EXPERIENCE');
  if (!content) return originalExperience || [];
  
  const experiences: CVData['experience'] = [];
  
  // Enhanced parsing strategy:
  // 1. Detect new entries by multiple patterns (not just pipe)
  // 2. Track all lines and classify them properly
  // 3. Ensure bullets are captured for ALL entries
  
  const lines = content.split('\n');
  let currentEntry: {
    headerLines: string[];
    bullets: string[];
    location?: string;
    dates?: string;
  } | null = null;
  
  // Helper: Check if line looks like a new job entry header
  const isNewEntryHeader = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) return false;
    
    // Pattern 1: Contains pipe separator (e.g., "Position | Company")
    if (trimmed.includes('|') && !trimmed.startsWith('|') && trimmed.length > 10) {
      return true;
    }
    
    // Pattern 2: Job title patterns (Co-Founder, Manager, Specialist, etc.)
    const jobTitlePatterns = /^(Co-Founder|Founder|CEO|CTO|CFO|COO|Director|Manager|Specialist|Expert|Lead|Senior|Junior|Head of|Chief|VP|Vice President|Consultant|Analyst|Developer|Engineer|Designer|Coordinator|Assistant|Associate|Intern|Trainee|Volunteer)/i;
    if (jobTitlePatterns.test(trimmed) && !trimmed.startsWith('•') && !trimmed.startsWith('-')) {
      return true;
    }
    
    // Pattern 3: "Title at Company" or "Title – Company"
    if (/^[A-Z][^•\-\*]+\s+(at|–|—|@)\s+[A-Z]/i.test(trimmed)) {
      return true;
    }
    
    return false;
  };
  
  // Helper: Check if line is a bullet point
  const isBulletLine = (line: string): boolean => {
    const trimmed = line.trim();
    return trimmed.startsWith('•') || 
           trimmed.startsWith('-') || 
           trimmed.startsWith('*') ||
           trimmed.startsWith('–') ||
           trimmed.startsWith('▪') ||
           trimmed.startsWith('►');
  };
  
  // Helper: Check if line is a date/location line
  const isMetadataLine = (line: string): boolean => {
    const trimmed = line.trim();
    // Date patterns
    if (/\d{4}/.test(trimmed) || /Present|Current/i.test(trimmed)) return true;
    // Location patterns (city names, countries)
    if (/^[A-Z][a-z]+(?:,\s*[A-Z][a-z]+)?\s*$/.test(trimmed)) return true;
    // Short non-sentence lines (likely metadata)
    if (trimmed.length < 50 && !trimmed.endsWith('.') && !isBulletLine(trimmed)) return true;
    return false;
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    // Check if this is a bullet point
    if (isBulletLine(trimmedLine)) {
      // Add to current entry's bullets
      if (currentEntry) {
        const bulletText = trimmedLine.replace(/^[•\-\*–▪►]\s*/, '').trim();
        if (bulletText.length > 5) {
          currentEntry.bullets.push(bulletText);
        }
      }
      continue;
    }
    
    // Check if this is a new job entry header
    if (isNewEntryHeader(trimmedLine)) {
      // Save previous entry if exists
      if (currentEntry && currentEntry.headerLines.length > 0) {
        const parsed = parseExperienceFromLines(currentEntry.headerLines, currentEntry.bullets);
        if (parsed) {
          console.log(`[ParseOptimizedCV] Parsed entry: ${parsed.position} at ${parsed.company} with ${parsed.bullets.length} bullets`);
          experiences.push(parsed);
        }
      }
      
      // Start new entry
      currentEntry = {
        headerLines: [trimmedLine],
        bullets: [],
      };
      continue;
    }
    
    // If we have a current entry and this is metadata, add to header
    if (currentEntry && isMetadataLine(trimmedLine)) {
      // Only add to header if we haven't collected many bullets yet
      // (to avoid mixing up entries)
      if (currentEntry.bullets.length <= 1) {
        currentEntry.headerLines.push(trimmedLine);
      }
      continue;
    }
    
    // If line doesn't match any pattern but looks like content, 
    // it might be a continuation of the previous line or a bullet without marker
    if (currentEntry && trimmedLine.length > 20 && /^[A-Z]/.test(trimmedLine)) {
      // Treat as bullet if it starts with action verb
      const actionVerbs = /^(Managed|Developed|Created|Built|Led|Delivered|Achieved|Generated|Increased|Reduced|Implemented|Designed|Executed|Trained|Coached|Optimized|Launched|Established|Coordinated|Collaborated)/i;
      if (actionVerbs.test(trimmedLine)) {
        currentEntry.bullets.push(trimmedLine);
      }
    }
  }
  
  // Don't forget the last entry
  if (currentEntry && currentEntry.headerLines.length > 0) {
    const parsed = parseExperienceFromLines(currentEntry.headerLines, currentEntry.bullets);
    if (parsed) {
      console.log(`[ParseOptimizedCV] Parsed entry: ${parsed.position} at ${parsed.company} with ${parsed.bullets.length} bullets`);
      experiences.push(parsed);
    }
  }
  
  // Deduplicate by company name (in case of parsing errors)
  const seen = new Set<string>();
  const deduped = experiences.filter(exp => {
    const key = `${exp.company.toLowerCase()}-${exp.position.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Log detailed debug info
  console.log('[ParseOptimizedCV] Parsed', deduped.length, 'experience entries (after dedup)');
  deduped.forEach((exp, idx) => {
    console.log(`[ParseOptimizedCV] Entry ${idx + 1}: ${exp.position} | ${exp.company} | Bullets: ${exp.bullets.length}`);
  });
  
  return deduped.length > 0 ? deduped : (originalExperience || []);
}

export function parseExperienceFromLines(
  headerLines: string[],
  bullets: string[]
): CVData['experience'][0] | null {
  if (headerLines.length === 0) return null;
  
  let position = '';
  let company = '';
  let location = '';
  let startDate = '';
  let endDate: string | undefined;
  
  // Process header lines
  for (const line of headerLines) {
    // Try to extract dates first
    const dateMatch = line.match(/(\w+\.?\s*\d{4}|\d{4})\s*[–\-—]\s*(\w+\.?\s*\d{4}|\d{4}|Present|Current)/i);
    if (dateMatch) {
      startDate = dateMatch[1].trim();
      endDate = dateMatch[2].trim();
    }
    
    // Try to parse "Position | Company" or "Position | Company, Location"
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      
      // Remove dates from parts
      const cleanParts = parts.map(p => 
        p.replace(/(\w+\.?\s*\d{4}|\d{4})\s*[–\-—]\s*(\w+\.?\s*\d{4}|\d{4}|Present|Current)/i, '').trim()
      ).filter(p => p.length > 0);
      
      if (cleanParts.length >= 1 && !position) {
        position = cleanParts[0];
      }
      if (cleanParts.length >= 2 && !company) {
        // Company might include location: "Company, City"
        const companyPart = cleanParts[1];
        if (companyPart.includes(',')) {
          const companyParts = companyPart.split(',');
          company = companyParts[0].trim();
          location = companyParts.slice(1).join(',').trim();
        } else {
          company = companyPart;
        }
      }
      if (cleanParts.length >= 3 && !location) {
        location = cleanParts[2];
      }
    }
  }
  
  // Fallback: use first non-empty header line as position if not found
  if (!position && headerLines.length > 0) {
    position = headerLines[0].replace(/\|.*$/, '').trim();
  }
  
  // Clean up company name - remove "(Side Project)" etc.
  company = company.replace(/\s*\(Side Project\)/gi, '').trim();
  
  if (!position) return null;
  
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    position,
    company: company || '',
    location: location || undefined,
    startDate: startDate || '',
    endDate,
    current: endDate?.toLowerCase().includes('present') || endDate?.toLowerCase().includes('current'),
    bullets,
  };
}
