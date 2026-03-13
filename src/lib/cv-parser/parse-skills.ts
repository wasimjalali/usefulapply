/**
 * Skills & Languages Section Parser
 * 
 * Extracted from parse-optimized-cv.ts for modularity.
 * Handles parsing of skills, languages, and language extraction from skills.
 */

import { CVData } from '../cv-templates/types';

/**
 * Known proficiency-level keywords — used to detect "Skill - Level" patterns
 * and normalize them to "Skill (Level)" format.
 */
const PROFICIENCY_KEYWORDS = /^(native|fluent|proficient|professional|intermediate|basic|beginner|advanced|fundamental|fundamentals|expert|good|excellent|working knowledge|verhandlungssicher|fließend|grundkenntnisse|gute kenntnisse|sehr gute kenntnisse|fortgeschritten)$/i;

/**
 * Normalize a skill string: convert "Skill - Level" or "Skill: Level" to "Skill (Level)"
 * when the level part is a known proficiency keyword. Preserves "Skill (Level)" as-is.
 */
function normalizeSkillProficiency(item: string): string {
  // Already in "Skill (Level)" format — preserve
  if (/\(.+\)\s*$/.test(item)) return item;

  // Pattern: "Skill - Level" or "Skill – Level" or "Skill — Level"
  const dashMatch = item.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    const [, skillPart, levelPart] = dashMatch;
    if (PROFICIENCY_KEYWORDS.test(levelPart.trim())) {
      return `${skillPart.trim()} (${levelPart.trim()})`;
    }
  }
  // Pattern: "Skill: Level" (where Level is a known proficiency term, not a category header)
  const colonMatch = item.match(/^([^:]+):\s*(.+)$/);
  if (colonMatch) {
    const [, skillPart, levelPart] = colonMatch;
    if (PROFICIENCY_KEYWORDS.test(levelPart.trim())) {
      return `${skillPart.trim()} (${levelPart.trim()})`;
    }
  }
  return item;
}

/**
 * Check if a string looks like a language entry
 */
export function isLanguageEntry(text: string): boolean {
  const languagePatterns = [
    /^(german|deutsch|english|englisch|french|français|spanish|español|italian|italiano|portuguese|português|russian|russisch|chinese|chinesisch|mandarin|japanese|japanisch|korean|koreanisch|arabic|arabisch|persian|persisch|farsi|dari|urdu|hindi|turkish|türkisch|polish|polnisch|dutch|niederländisch|swedish|schwedisch|norwegian|norwegisch|danish|dänisch|finnish|finnisch|greek|griechisch|hebrew|hebräisch|vietnamese|thai|indonesian|malay|czech|tschechisch|hungarian|ungarisch|romanian|rumänisch|slovak|croatian|serbian|bulgarian|ukrainian|catalan|icelandic|latvian|lithuanian|estonian|slovenian)/i,
    /\b(native|fluent|proficient|intermediate|beginner|basic|advanced|B1|B2|C1|C2|A1|A2|muttersprache|verhandlungssicher|fließend|grundkenntnisse|gute kenntnisse|sehr gute kenntnisse|langue maternelle|courant|bilingue|notions|débutant|intermédiaire|avancé|nativo|intermedio|avanzado|básico)\b/i,
  ];
  
  return languagePatterns.some(pattern => pattern.test(text));
}

/**
 * Parse skills section and extract languages separately
 * Handles multiple formats:
 * 1. "Category Name: skill1, skill2, skill3"
 * 2. Category headers on separate lines followed by bullet points
 * 3. Flat list of skills
 */
export function parseSkillsSection(sections: Map<string, string>): CVData['skills'] {
  const content = sections.get('SKILLS');
  if (!content) return [];
  
  const skills: CVData['skills'] = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  // First, try to detect category headers on separate lines (Format 2)
  // Category headers are lines that:
  // - Don't start with bullets (•, -, *, –)
  // - Are followed by lines that DO start with bullets
  // - Look like category names (contain & or are short descriptive text)
  
  let currentCategory = '';
  let currentItems: string[] = [];
  let foundCategoryFormat = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip lines that look like languages
    if (isLanguageEntry(line)) continue;
    
    // Skip section headers
    if (/^(CORE COMPETENCIES|FÄHIGKEITEN|SKILLS|KOMPETENZEN|KERNKOMPETENZEN|KEY SKILLS|TECHNICAL SKILLS)/i.test(line)) {
      continue;
    }
    
    // Check if this is a bullet point (skill item)
    const isBullet = /^[•\-\*–▪►]/.test(line);
    
    if (isBullet) {
      // This is a skill item - add to current category
      const skill = normalizeSkillProficiency(line.replace(/^[•\-\*–▪►]\s*/, '').trim());
      if (skill && skill.length > 0 && skill.length < 100 && !isLanguageEntry(skill)) {
        currentItems.push(skill);
      }
    } else {
      // This might be a category header
      // Check if next line is a bullet (indicating this is a category header)
      const nextLine = lines[i + 1];
      const nextIsBullet = nextLine && /^[•\-\*–▪►]/.test(nextLine);
      
      // Also check: "Category: skill1, skill2" format
      // Category: items format — allow numbers (HTML5, CSS3), parentheses, dots
      const colonMatch = line.match(/^\*?\*?([A-Za-zÀ-ÿ0-9\s&\/\-().]+)\*?\*?\s*:\s*(.+)$/);
      
      if (colonMatch) {
        // Format 1: "Category: skill1, skill2"
        // Save previous category first
        if (currentCategory || currentItems.length > 0) {
          skills.push({ category: currentCategory, items: currentItems });
          foundCategoryFormat = true;
        }
        
        const category = colonMatch[1].trim();
        const itemsText = colonMatch[2].trim();
        const items = itemsText
          .split(/[,•·]/)
          .map(i => normalizeSkillProficiency(i.trim().replace(/^\*\*|\*\*$/g, '')))
          .filter(i => i.length > 0 && i.length < 100)
          .filter(i => !isLanguageEntry(i));
        
        if (items.length > 0) {
          skills.push({ category, items });
          foundCategoryFormat = true;
        }
        currentCategory = '';
        currentItems = [];
      } else if (nextIsBullet || (line.includes('&') && line.length < 60)) {
        // Format 2: Category header on its own line
        // Save previous category first
        if (currentCategory || currentItems.length > 0) {
          skills.push({ category: currentCategory, items: currentItems });
          foundCategoryFormat = true;
        }
        currentCategory = line;
        currentItems = [];
      } else if (line.length > 0 && line.length < 100) {
        // Could be a skill without bullet, or a category without following bullets
        // Treat as skill item if we already have a category
        if (currentCategory) {
          currentItems.push(normalizeSkillProficiency(line));
        } else {
          // Might be a standalone skill or category - check pattern
          // If it looks like a category name (contains keywords), start new category
          const looksLikeCategory = /^(E-Commerce|Marketing|AI|Web|Technical|Soft Skills|Digital|Webanalyse|Automation|Development|Frontend|Backend|DevOps|Cloud|Data|Analytics|Design|Management|Communication|Leadership|Programming|Languages|Frameworks|Tools|Databases|Infrastructure|Security|Testing|Mobile|Projektmanagement|Sprachen)/i.test(line);
          if (looksLikeCategory) {
            currentCategory = line;
            currentItems = [];
          } else {
            // Add as skill to current/default group
            currentItems.push(normalizeSkillProficiency(line));
          }
        }
      }
    }
  }
  
  // Don't forget the last category
  if (currentCategory || currentItems.length > 0) {
    skills.push({ category: currentCategory, items: currentItems });
    if (currentCategory) foundCategoryFormat = true;
  }
  
  // If we found category format, filter out empty categories and return
  if (foundCategoryFormat && skills.some(g => g.category && g.category.trim())) {
    const filtered = skills.filter(g => g.items.length > 0);
    console.log('[ParseOptimizedCV] Parsed', filtered.length, 'skill categories (with headers)');
    return filtered;
  }
  
  // Fallback: If no categories found, try to parse as flat list
  if (skills.length === 0 || !skills.some(g => g.category && g.category.trim())) {
    const allItems = content
      .split(/[,\n•·]/)
      .map(i => normalizeSkillProficiency(i.trim()))
      .filter(i => i.length > 0 && i.length < 100 && !i.includes(':'))
      .filter(i => !isLanguageEntry(i))
      .filter(i => !/^(CORE COMPETENCIES|FÄHIGKEITEN|SKILLS|KOMPETENZEN)/i.test(i));
    
    if (allItems.length > 0) {
      // Return as single group without category (flat list)
      console.log('[ParseOptimizedCV] Parsed', allItems.length, 'skills as flat list');
      return [{ category: '', items: allItems }];
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', skills.length, 'skill categories');
  return skills;
}

/**
 * Extract languages from skills section content
 */
export function extractLanguagesFromSkills(sections: Map<string, string>): CVData['languages'] {
  const content = sections.get('SKILLS');
  if (!content) return [];
  
  const languages: CVData['languages'] = [];
  
  // Split by lines and look for language patterns
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);
  
  for (const line of lines) {
    if (!isLanguageEntry(line)) continue;
    
    // Pattern 1: "Language (Level)" - e.g., "German (B2 Certified – Verhandlungssicher)"
    const parenMatch = line.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      languages.push({
        language: parenMatch[1].trim(),
        proficiency: parenMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 2: "Language – Level" or "Language - Level"
    const dashMatch = line.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
    if (dashMatch && !dashMatch[1].includes('(')) {
      languages.push({
        language: dashMatch[1].trim(),
        proficiency: dashMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 3: Just "Language (Level)" at end of line
    if (line.length > 2 && line.length < 80) {
      languages.push({
        language: line,
        proficiency: '',
      });
    }
  }
  
  return languages;
}

export function parseLanguagesSection(sections: Map<string, string>): CVData['languages'] {
  const content = sections.get('LANGUAGES');
  if (!content) return [];
  
  const languages: CVData['languages'] = [];
  
  // Split by common separators
  const entries = content.split(/[,\n•]/).map(e => e.trim()).filter(Boolean);
  
  for (const entry of entries) {
    // Skip section headers
    if (entry.toUpperCase() === 'LANGUAGES' || entry.toUpperCase() === 'LANGUAGE SKILLS') continue;
    
    // Pattern 1: "Language (Level)" - e.g., "German (B2 Certified – Verhandlungssicher)"
    const parenMatch = entry.match(/^([^(]+)\s*\(([^)]+)\)/);
    if (parenMatch) {
      languages.push({
        language: parenMatch[1].trim(),
        proficiency: parenMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 2: "Language – Level" or "Language - Level" or "Language — Level"
    const dashMatch = entry.match(/^(.+?)\s*[–\-—]\s*(.+)$/);
    if (dashMatch && !dashMatch[1].includes('(')) {
      languages.push({
        language: dashMatch[1].trim(),
        proficiency: dashMatch[2].trim(),
      });
      continue;
    }
    
    // Pattern 3: Just language name (if short enough)
    if (entry.length > 2 && entry.length < 50) {
      languages.push({
        language: entry,
        proficiency: '',
      });
    }
  }
  
  console.log('[ParseOptimizedCV] Parsed', languages.length, 'languages');
  
  return languages;
}
