/**
 * CV Data Parser
 * Extracts structured CV data from raw text or ParsedCV format
 */

import type { CVData } from './types';
import type { ParsedCV } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import { splitIntoSections, normalizeHeader } from '@/lib/cv-parser/section-splitter';
import { parseCertificationsSection, parseProjectsSection, parseAdditionalInfoSection } from '@/lib/cv-parser/parse-other';

// Common words to exclude from names
const NAME_EXCLUSIONS = ['present', 'current', 'summary', 'profile', 'experience', 'education', 
  'skills', 'languages', 'certifications', 'objective', 'professional', 'work', 'contact'];

// Known language names for extraction
const KNOWN_LANGUAGES = [
  'english', 'german', 'french', 'spanish', 'italian', 'portuguese', 'dutch', 'russian',
  'chinese', 'japanese', 'korean', 'arabic', 'hindi', 'persian', 'farsi', 'dari', 'turkish',
  'polish', 'swedish', 'norwegian', 'danish', 'finnish', 'greek', 'hebrew', 'vietnamese',
  'thai', 'indonesian', 'malay', 'tagalog', 'bengali', 'urdu', 'punjabi', 'tamil', 'telugu'
];

/**
 * Parse raw CV text into structured CVData format
 */
export function parseRawCVText(rawText: string, fileName?: string): CVData {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract personal info from the beginning
  const personal = extractPersonalInfo(lines, rawText);
  
  // Use section splitter for projects and additional info (more reliable than regex)
  const sections = splitIntoSections(rawText);

  return {
    personal,
    summary: extractSummary(rawText),
    experience: extractExperience(rawText),
    education: extractEducation(rawText),
    skills: extractSkills(rawText),
    languages: extractLanguagesStrict(rawText),
    certifications: extractCertifications(rawText),
    projects: parseProjectsSection(sections),
    additionalInfo: parseAdditionalInfoSection(sections),
  };
}

/**
 * Convert ParsedCV to CVData format
 */
export function parsedCVToCVData(parsedCV: ParsedCV): CVData {
  const rawText = parsedCV.rawText;
  const sections = parsedCV.sections;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract personal info with improved algorithm
  const personal = extractPersonalInfoImproved(lines, rawText, sections.contactInfo || '');
  
  // Use section splitter for projects and additional info
  const splitSections = splitIntoSections(rawText);

  // Use section data if available, otherwise parse from raw text
  return {
    personal,
    summary: sections.summary || extractSummary(rawText),
    experience: sections.experience ? parseExperienceSection(sections.experience) : extractExperience(rawText),
    education: sections.education ? parseEducationSection(sections.education) : extractEducation(rawText),
    skills: sections.skills ? parseSkillsSection(sections.skills) : extractSkills(rawText),
    languages: extractLanguagesStrict(rawText),
    certifications: extractCertifications(rawText),
    projects: parseProjectsSection(splitSections),
    additionalInfo: parseAdditionalInfoSection(splitSections),
  };
}

/**
 * Convert StructuredCV to CVData format
 */
export function structuredCVToCVData(cv: StructuredCV): CVData {
  return {
    personal: {
      fullName: cv.personal.fullName,
      email: cv.personal.email,
      phone: cv.personal.phone,
      currentTitle: cv.personal.currentTitle, // Job title/tagline
      address: cv.personal.address,
      city: cv.personal.city,
      country: cv.personal.country,
      linkedIn: cv.personal.linkedIn,
      website: cv.personal.website,
      github: cv.personal.github,
      photoUrl: cv.personal.photoUrl,
      dateOfBirth: cv.personal.dateOfBirth,
      nationality: cv.personal.nationality,
    },
    summary: cv.summary,
    experience: cv.experience.map(exp => ({
      id: exp.id,
      company: exp.company,
      position: exp.position,
      location: exp.location,
      // CVDate objects may be plain objects from JSONB (null-safe access)
      startDate: typeof exp.startDate === 'object' && exp.startDate ? exp.startDate.raw : (exp.startDate as unknown as string) || '',
      endDate: typeof exp.endDate === 'object' && exp.endDate ? exp.endDate.raw : (exp.endDate as unknown as string) || undefined,
      current: exp.current,
      bullets: exp.bullets,
    })),
    education: cv.education.map(edu => ({
      id: edu.id,
      institution: edu.institution,
      degree: edu.degree,
      field: edu.field,
      location: edu.location,
      startDate: typeof edu.startDate === 'object' && edu.startDate ? edu.startDate.raw : (edu.startDate as unknown as string) || undefined,
      endDate: typeof edu.endDate === 'object' && edu.endDate ? edu.endDate.raw : (edu.endDate as unknown as string) || undefined,
      grade: edu.grade,
      highlights: edu.highlights,
    })),
    skills: cv.skills.map(skill => ({
      category: skill.category,
      items: skill.skills,
    })),
    languages: cv.languages.map(lang => ({
      language: lang.language,
      proficiency: lang.proficiency,
      certification: lang.certification,
    })),
    certifications: cv.certifications.map(cert => ({
      id: cert.id,
      name: cert.name,
      issuer: cert.issuer,
      date: typeof cert.date === 'object' && cert.date ? cert.date.raw : (cert.date as unknown as string) || undefined,
      credentialId: cert.credentialId,
    })),
    projects: cv.projects?.map(proj => ({
      id: proj.id,
      name: proj.name,
      description: proj.description,
      technologies: proj.technologies,
      url: proj.url,
    })),
    additionalInfo: cv.additionalSections?.flatMap(s => s.items) || undefined,
    sectionHeaders: cv.sectionHeaders,
    localizedStrings: cv.localizedStrings,
  };
}

// Helper functions

/**
 * Improved personal info extraction - handles various CV formats better
 */
function extractPersonalInfoImproved(lines: string[], rawText: string, contactInfo: string): CVData['personal'] {
  const allText = rawText + ' ' + contactInfo;
  
  const personal: CVData['personal'] = {
    fullName: '',
    email: '',
    phone: '',
  };
  
  // 1. Extract email first (most reliable identifier)
  const emailMatch = allText.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) personal.email = emailMatch[0];
  
  // 2. Extract phone number
  const phonePatterns = [
    /\+\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{2,4}/,  // International format
    /\(\d{3}\)\s*\d{3}[-.\s]?\d{4}/,  // US format (xxx) xxx-xxxx
    /\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/,  // US format xxx-xxx-xxxx
    /\d{4,5}[\s.-]?\d{5,7}/,  // European format
  ];
  for (const pattern of phonePatterns) {
    const match = allText.match(pattern);
    if (match) {
      personal.phone = match[0];
      break;
    }
  }
  
  // 3. Extract name - CRITICAL: Look for the actual person's name
  // Strategy: Find the first line that looks like a name (2-3 capitalized words, no special chars)
  const nameExclusions = [
    'contact', 'address', 'email', 'phone', 'profile', 'summary', 'experience', 
    'education', 'skills', 'languages', 'certifications', 'objective', 'professional',
    'work', 'self-employed', 'manager', 'specialist', 'developer', 'engineer',
    'e-commerce', 'marketing', 'digital', 'data', 'product', 'senior', 'junior',
    'key skills', 'date of birth', 'nationality', 'present', 'current'
  ];
  
  for (const line of lines.slice(0, 15)) {
    const trimmed = line.trim();
    
    // Skip empty or too long lines
    if (!trimmed || trimmed.length > 50 || trimmed.length < 3) continue;
    
    // Skip lines with special patterns
    if (trimmed.includes('@')) continue;  // Email
    if (trimmed.match(/\d{4}/)) continue;  // Contains year
    if (trimmed.match(/\+?\d{8,}/)) continue;  // Phone number
    if (trimmed.match(/https?:\/\//)) continue;  // URL
    if (trimmed.includes('|')) continue;  // Title separator
    if (trimmed.includes(':')) continue;  // Label: value
    
    // Skip section headers and job titles
    const lowerLine = trimmed.toLowerCase();
    if (nameExclusions.some(exc => lowerLine.includes(exc))) continue;
    
    // Check if it looks like a name: 2-4 words, mostly capitalized
    const words = trimmed.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const capitalizedWords = words.filter(w => /^[A-Z][a-z]+$/.test(w));
      if (capitalizedWords.length >= 2) {
        personal.fullName = trimmed;
        break;
      }
    }
    
    // Also accept single capitalized word as potential name if it's the first line
    if (words.length === 1 && /^[A-Z][a-z]+$/.test(trimmed) && lines.indexOf(line) < 3) {
      // Check next line for last name
      const nextIdx = lines.indexOf(line) + 1;
      if (nextIdx < lines.length) {
        const nextLine = lines[nextIdx].trim();
        if (/^[A-Z][a-z]+$/.test(nextLine)) {
          personal.fullName = `${trimmed} ${nextLine}`;
          break;
        }
      }
    }
  }
  
  // Fallback: Try to extract from email
  if (!personal.fullName && personal.email) {
    const emailName = personal.email.split('@')[0];
    const nameParts = emailName.split(/[._-]/).filter(p => p.length > 1);
    if (nameParts.length >= 2) {
      personal.fullName = nameParts
        .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
        .join(' ');
    }
  }
  
  // 4. Extract address - look for street/city patterns
  for (const line of lines.slice(0, 20)) {
    const trimmed = line.trim();
    // German address pattern: Street + number, or ZIP + City
    if (trimmed.match(/\d+\s*[A-Za-zäöüß]+(?:straße|str\.|weg|platz|allee)/i) ||
        trimmed.match(/\d{5}\s+[A-Za-zäöüß]+/i) ||  // German ZIP
        trimmed.match(/\d+.*(?:Street|St|Avenue|Ave|Road|Rd)/i)) {
      personal.address = trimmed;
      break;
    }
  }
  
  // 5. Extract date of birth
  const dobPatterns = [
    /(?:Date of Birth|DOB|Born|Geburtsdatum)[:\s]*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i,
    /(\d{1,2}\.\d{1,2}\.\d{4})(?=.*(?:birth|geboren|dob))/i,
  ];
  for (const pattern of dobPatterns) {
    const match = allText.match(pattern);
    if (match) {
      personal.dateOfBirth = match[1];
      break;
    }
  }
  
  // 6. Extract nationality
  const nationalityMatch = allText.match(/(?:Nationality|Staatsangehörigkeit|Nationalität)[:\s]*([A-Za-zäöüß]+)/i);
  if (nationalityMatch) personal.nationality = nationalityMatch[1];
  
  // 7. Extract LinkedIn
  const linkedInMatch = allText.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedInMatch) personal.linkedIn = `https://${linkedInMatch[0]}`;
  
  // 8. Extract GitHub
  const githubMatch = allText.match(/github\.com\/[\w-]+/i);
  if (githubMatch) personal.github = `https://${githubMatch[0]}`;
  
  return personal;
}

/**
 * Extract personal info from contact section and raw text
 */
function extractPersonalInfoFromSections(contactInfo: string, rawText: string): CVData['personal'] {
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const contactLines = contactInfo.split('\n').map(l => l.trim()).filter(Boolean);
  const allText = rawText + ' ' + contactInfo;
  
  const personal: CVData['personal'] = {
    fullName: '',
    email: '',
    phone: '',
  };
  
  // Extract email first (most reliable)
  const emailMatch = allText.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) personal.email = emailMatch[0];
  
  // Extract phone
  const phoneMatch = allText.match(/[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}/);
  if (phoneMatch) personal.phone = phoneMatch[0];
  
  // Extract name - look for patterns that are likely names
  // Priority: Look for name near email in contact section
  personal.fullName = extractNameFromText(contactLines.length > 0 ? contactLines : lines, personal.email);
  
  // Extract address
  for (const line of lines.slice(0, 15)) {
    if (line.match(/\d+.*(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Straße|Str\.|strasse)/i) ||
        line.match(/\d{5}/) || // ZIP code
        line.match(/[A-Z][a-z]+,\s*[A-Z]{2,}/)) { // City, State/Country
      personal.address = line;
      break;
    }
  }
  
  // Extract LinkedIn
  const linkedInMatch = allText.match(/linkedin\.com\/in\/[\w-]+/i);
  if (linkedInMatch) personal.linkedIn = `https://${linkedInMatch[0]}`;
  
  // Extract GitHub
  const githubMatch = allText.match(/github\.com\/[\w-]+/i);
  if (githubMatch) personal.github = `https://${githubMatch[0]}`;
  
  // Extract date of birth (common in EU CVs)
  const dobMatch = allText.match(/(?:Date of Birth|DOB|Born|Geburtsdatum)[:\s]*(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4})/i);
  if (dobMatch) personal.dateOfBirth = dobMatch[1];
  
  // Extract nationality
  const nationalityMatch = allText.match(/(?:Nationality|Staatsangehörigkeit)[:\s]*([A-Za-zäöüß]+)/i);
  if (nationalityMatch) personal.nationality = nationalityMatch[1];
  
  return personal;
}

/**
 * Legacy function for backward compatibility
 */
function extractPersonalInfo(lines: string[], rawText: string): CVData['personal'] {
  return extractPersonalInfoFromSections('', rawText);
}

/**
 * Extract name from text lines - improved algorithm
 */
function extractNameFromText(lines: string[], email?: string): string {
  // If we have an email, try to extract name from it first
  if (email) {
    const emailName = email.split('@')[0];
    // Check if email contains name-like pattern (e.g., firstname.lastname or firstnamelastname)
    const nameParts = emailName.split(/[._-]/).filter(p => p.length > 1);
    if (nameParts.length >= 2) {
      // Validate against lines - see if we can find a matching name
      for (const line of lines.slice(0, 10)) {
        const lineLower = line.toLowerCase();
        if (nameParts.every(part => lineLower.includes(part.toLowerCase()))) {
          // Found a line containing all parts of the email name
          if (isValidName(line)) {
            return cleanName(line);
          }
        }
      }
    }
  }
  
  // Look for name in first few lines
  for (const line of lines.slice(0, 8)) {
    if (isValidName(line)) {
      return cleanName(line);
    }
  }
  
  // Fallback: look for any capitalized name pattern
  for (const line of lines.slice(0, 15)) {
    const nameMatch = line.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)$/);
    if (nameMatch && isValidName(nameMatch[1])) {
      return nameMatch[1];
    }
  }
  
  return 'Name Not Found';
}

/**
 * Check if a string is likely a valid person name
 */
function isValidName(text: string): boolean {
  const cleaned = text.trim();
  
  // Must be reasonable length
  if (cleaned.length < 3 || cleaned.length > 60) return false;
  
  // Must not contain typical non-name patterns
  if (cleaned.includes('@')) return false;
  if (cleaned.match(/\d{4}/)) return false; // Year
  if (cleaned.match(/[+\d]{8,}/)) return false; // Phone
  if (cleaned.match(/https?:\/\//)) return false; // URL
  
  // Must not be a section header or common word
  const lowerText = cleaned.toLowerCase();
  if (NAME_EXCLUSIONS.some(word => lowerText === word || lowerText.startsWith(word + ' '))) {
    return false;
  }
  
  // Should look like a name (at least 2 words starting with capitals, or single name)
  const words = cleaned.split(/\s+/);
  if (words.length === 1) {
    // Single word - check if it's capitalized and not a common word
    return /^[A-Z][a-z]+$/.test(cleaned) && !NAME_EXCLUSIONS.includes(lowerText);
  }
  
  // Multiple words - at least first word should be capitalized
  const hasCapitalWords = words.filter(w => /^[A-Z]/.test(w)).length >= 1;
  const hasReasonableWords = words.every(w => w.length <= 20);
  
  return hasCapitalWords && hasReasonableWords;
}

/**
 * Clean up extracted name
 */
function cleanName(name: string): string {
  return name
    .replace(/^(name|full name|naam)[:\s]*/i, '')
    .replace(/[,;].*$/, '') // Remove anything after comma
    .trim();
}

function identifySections(text: string): Partial<Record<string, any>> {
  const sections: Partial<Record<string, any>> = {};
  
  const sectionPatterns = [
    { key: 'summary', patterns: [/professional\s*summary/i, /summary/i, /profile/i, /objective/i, /about\s*me/i] },
    { key: 'experience', patterns: [/work\s*experience/i, /experience/i, /employment/i, /work\s*history/i, /professional\s*experience/i] },
    { key: 'education', patterns: [/education/i, /academic/i, /qualifications/i] },
    { key: 'skills', patterns: [/skills/i, /technical\s*skills/i, /competencies/i, /expertise/i] },
    { key: 'languages', patterns: [/languages/i, /language\s*skills/i, /sprachkenntnisse/i] },
    { key: 'certifications', patterns: [/certifications?/i, /certificates?/i, /licenses?/i, /credentials/i] },
    { key: 'projects', patterns: [/projects?/i, /portfolio/i] },
  ];
  
  // This is a simplified section identifier
  // In production, you'd use more sophisticated NLP
  return sections;
}

function extractSummary(text: string): string | undefined {
  const summaryPatterns = [
    /(?:professional\s*summary|summary|profile|objective)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|skills|work|employment)|$)/i,
  ];
  
  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const summary = match[1].trim().split('\n').slice(0, 5).join(' ').trim();
      if (summary.length > 50) return summary;
    }
  }
  
  return undefined;
}

function extractExperience(text: string): CVData['experience'] {
  const experiences: CVData['experience'] = [];
  
  // Find experience section
  const expMatch = text.match(/(?:work\s*experience|experience|employment|professional\s*experience)[:\s]*\n([\s\S]*?)(?=\n\s*(?:education|skills|languages|certifications|projects|interests|references)|$)/i);
  if (!expMatch) return experiences;
  
  const expText = expMatch[1];
  
  // Split into job blocks - look for patterns like dates or job titles
  const jobBlocks = expText.split(/\n(?=\d{4}|\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/);
  
  for (const block of jobBlocks) {
    if (!block.trim() || block.trim().length < 20) continue;
    
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    
    const exp: any = {
      id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      company: '',
      position: '',
      location: '',
      startDate: '',
      endDate: '',
      current: false,
      bullets: [],
    };
    
    // Extract dates from first line
    const firstLine = lines[0];
    const dateMatch = firstLine.match(/(\d{4}|\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})\s*[-–—]\s*(\d{4}|Present|Current|Now|\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/i);
    
    if (dateMatch) {
      exp.startDate = dateMatch[1];
      exp.endDate = dateMatch[2];
      exp.current = /present|current|now/i.test(dateMatch[2]);
    }
    
    // Extract position and company from first few lines
    let descriptionStartIdx = 0;
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i];
      
      // Remove date if present
      const cleanLine = line.replace(/\d{4}|\d{1,2}\/\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}/gi, '')
                            .replace(/[-–—]\s*(Present|Current|Now)/i, '')
                            .trim();
      
      if (!cleanLine) continue;
      
      if (!exp.position && cleanLine.length < 100) {
        exp.position = cleanLine;
        descriptionStartIdx = i + 1;
      } else if (!exp.company && cleanLine.length < 100 && i < 2) {
        exp.company = cleanLine;
        descriptionStartIdx = i + 1;
      } else {
        break;
      }
    }
    
    // Extract bullets from remaining text
    const descriptionLines = lines.slice(descriptionStartIdx);
    const fullDescription = descriptionLines.join(' ').trim();
    
    if (fullDescription) {
      // Split by sentence endings or bullet markers
      const bulletCandidates = fullDescription
        .split(/[.!]\s+(?=[A-Z])|•\s*|−\s*|-\s+(?=[A-Z])/)
        .map(s => s.trim())
        .filter(s => s.length > 15 && s.length < 300);
      
      // Take meaningful sentences as bullets
      exp.bullets = bulletCandidates.slice(0, 5).map(bullet => {
        // Clean up the bullet
        bullet = bullet.replace(/^[•\-*−]\s*/, '');
        // Ensure it ends with period
        if (!bullet.match(/[.!?]$/)) {
          bullet += '.';
        }
        return bullet;
      });
    }
    
    // Only add if we have at least a position
    if (exp.position) {
      experiences.push(exp);
    }
  }
  
  return experiences.slice(0, 5);
}

function extractEducation(text: string): CVData['education'] {
  const education: CVData['education'] = [];
  
  const eduSection = text.match(/(?:education|academic|qualifications)[\s\S]*?(?=experience|skills|languages|certifications|$)/i);
  if (!eduSection) return education;
  
  const lines = eduSection[0].split('\n');
  let currentEdu: any = null;
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Check for degree patterns
    const degreeMatch = trimmed.match(/(Bachelor|Master|PhD|Doctorate|Associate|MBA|B\.?S\.?|M\.?S\.?|B\.?A\.?|M\.?A\.?)/i);
    
    if (degreeMatch) {
      if (currentEdu) education.push(currentEdu);
      
      currentEdu = {
        id: `edu-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        institution: '',
        degree: trimmed,
        field: '',
        highlights: [],
      };
    } else if (currentEdu && trimmed.match(/university|college|school|institute/i)) {
      currentEdu.institution = trimmed;
    }
  }
  
  if (currentEdu) education.push(currentEdu);
  
  return education.slice(0, 3);
}

function extractSkills(text: string): CVData['skills'] {
  const skills: CVData['skills'] = [];
  
  // Find skills section
  const skillMatch = text.match(/(?:skills|technical\s*skills|competencies|expertise)[:\s]*\n([\s\S]*?)(?=\n\s*(?:experience|education|languages|certifications|projects|interests|references)|$)/i);
  if (!skillMatch) return skills;
  
  const skillText = skillMatch[1];
  
  // Common skill categories
  const categoryPatterns = [
    { pattern: /(?:programming|coding|languages?|technical)/i, name: 'Programming' },
    { pattern: /(?:tools?|software|platforms?|applications?)/i, name: 'Tools & Platforms' },
    { pattern: /(?:frameworks?|libraries)/i, name: 'Frameworks' },
    { pattern: /(?:databases?|data)/i, name: 'Databases' },
    { pattern: /(?:cloud|aws|azure|gcp)/i, name: 'Cloud & Infrastructure' },
    { pattern: /(?:marketing|seo|analytics|campaigns?)/i, name: 'Marketing' },
    { pattern: /(?:design|creative|ui|ux)/i, name: 'Design' },
    { pattern: /(?:management|leadership|project)/i, name: 'Management' },
    { pattern: /(?:communication|soft\s*skills)/i, name: 'Soft Skills' },
  ];
  
  const lines = skillText.split('\n').map(l => l.trim()).filter(Boolean);
  const categorizedSkills = new Map<string, Set<string>>();
  const uncategorizedSkills = new Set<string>();
  
  for (const line of lines) {
    if (line.length < 3) continue;
    
    // Check if line starts with a category label
    let categoryFound = false;
    for (const { pattern, name } of categoryPatterns) {
      if (pattern.test(line)) {
        // Extract skills from this line
        const skillLine = line.replace(pattern, '').replace(/^[:\-–—•]\s*/, '').trim();
        if (skillLine) {
          const items = skillLine.split(/[,;|•&]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
          if (!categorizedSkills.has(name)) {
            categorizedSkills.set(name, new Set());
          }
          items.forEach(item => categorizedSkills.get(name)!.add(item));
          categoryFound = true;
          break;
        }
      }
    }
    
    // If no category found, split the line and add to uncategorized
    if (!categoryFound) {
      const items = line.split(/[,;|•&]/).map(s => s.trim()).filter(s => s.length > 1 && s.length < 50);
      items.forEach(item => uncategorizedSkills.add(item));
    }
  }
  
  // Convert categorized skills to output format
  for (const [category, items] of categorizedSkills) {
    if (items.size > 0) {
      skills.push({
        category,
        items: Array.from(items).slice(0, 15),
      });
    }
  }
  
  // Add uncategorized skills
  if (uncategorizedSkills.size > 0) {
    skills.push({
      category: 'Core Skills',
      items: Array.from(uncategorizedSkills).slice(0, 20),
    });
  }
  
  // If we have no categorized skills but have uncategorized, rename the category
  if (skills.length === 1 && skills[0].category === 'Core Skills') {
    skills[0].category = 'Technical Skills';
  }
  
  return skills.slice(0, 4); // Limit to 4 categories for clean display
}

/**
 * Strict language extraction - only extracts actual languages
 */
function extractLanguagesStrict(text: string): CVData['languages'] {
  const languages: CVData['languages'] = [];
  
  const proficiencyMap: Record<string, string> = {
    'native': 'Native',
    'fluent': 'Fluent',
    'professional': 'Professional',
    'intermediate': 'Intermediate',
    'basic': 'Basic',
    'beginner': 'Basic',
    'b2': 'Professional (B2)',
    'c1': 'Fluent (C1)',
    'c2': 'Native (C2)',
    'a1': 'Basic (A1)',
    'a2': 'Elementary (A2)',
    'b1': 'Intermediate (B1)',
    'muttersprachlich': 'Native',
    'fließend': 'Fluent',
    'gut': 'Professional',
    'grundkenntnisse': 'Basic',
  };
  
  // Find language section
  const langMatch = text.match(/(?:languages?|sprachkenntnisse|sprachen)[\s:]*\n?([\s\S]*?)(?=\n\s*(?:skills|experience|education|certifications|interests|hobbies|references|projects)|$)/i);
  
  if (langMatch) {
    const section = langMatch[1];
    const lines = section.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 100) continue;
      
      // Check if line contains a known language
      for (const lang of KNOWN_LANGUAGES) {
        const langRegex = new RegExp(`\\b${lang}\\b`, 'i');
        if (langRegex.test(trimmed)) {
          // Found a language - extract proficiency
          let proficiency = 'Proficient';
          
          // Try to find proficiency level
          for (const [key, value] of Object.entries(proficiencyMap)) {
            if (trimmed.toLowerCase().includes(key)) {
              proficiency = value;
              break;
            }
          }
          
          // Capitalize language name
          const capitalizedLang = lang.charAt(0).toUpperCase() + lang.slice(1);
          
          // Avoid duplicates
          if (!languages.some(l => l.language.toLowerCase() === lang)) {
            languages.push({
              language: capitalizedLang,
              proficiency,
            });
          }
        }
      }
    }
  }
  
  // Fallback: scan entire document for known languages with proficiency patterns
  if (languages.length === 0) {
    for (const lang of KNOWN_LANGUAGES) {
      const pattern = new RegExp(`\\b(${lang})\\b[\\s\\-:()]*(?:(native|fluent|professional|intermediate|basic|b1|b2|c1|c2|a1|a2))`, 'gi');
      const matches = text.matchAll(pattern);
      
      for (const match of matches) {
        const langName = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
        const prof = proficiencyMap[match[2].toLowerCase()] || match[2];
        
        if (!languages.some(l => l.language.toLowerCase() === langName.toLowerCase())) {
          languages.push({
            language: langName,
            proficiency: prof,
          });
        }
      }
    }
  }
  
  return languages.slice(0, 6);
}

// Keep old function for backward compatibility (unused)
function extractLanguages(text: string): CVData['languages'] {
  return extractLanguagesStrict(text);
}

function extractCertifications(text: string): CVData['certifications'] {
  const certifications: CVData['certifications'] = [];
  
  // Match certifications section, stopping at other sections
  const certMatch = text.match(/(?:certifications?|certificates?|zertifikate|licenses?)[:\s]*\n([\s\S]*?)(?=\n\s*(?:languages?|sprachen|skills|experience|education|references|interests|driver|führerschein)|$)/i);
  if (!certMatch) return certifications;
  
  const lines = certMatch[1].split('\n');
  
  // Language names to exclude from certifications
  const languageNames = ['english', 'german', 'french', 'spanish', 'italian', 'hindi', 'urdu', 
    'dari', 'farsi', 'persian', 'arabic', 'chinese', 'japanese', 'korean', 'portuguese',
    'native', 'fluent', 'intermediate', 'basic', 'proficient', 'b1', 'b2', 'c1', 'c2', 'a1', 'a2'];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 5) continue;
    
    // Skip if it looks like a language entry
    const lowerLine = trimmed.toLowerCase();
    if (languageNames.some(lang => lowerLine.startsWith(lang) || lowerLine.includes(`(${lang})`))) {
      continue;
    }
    
    // Skip section headers
    if (lowerLine.match(/^(certifications?|certificates?|zertifikate|licenses?)/)) continue;
    
    // Extract certification name and issuer
    let name = trimmed.replace(/^[•\-*]\s*/, '');
    let issuer = '';
    
    // Try to extract issuer from patterns like "Name - Issuer" or "Name (Issuer)"
    const issuerMatch = name.match(/^(.+?)\s*[-–—]\s*(.+)$/) || name.match(/^(.+?)\s*\(([^)]+)\)$/);
    if (issuerMatch) {
      name = issuerMatch[1].trim();
      issuer = issuerMatch[2].trim();
    }
    
    certifications.push({
      id: `cert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      issuer,
    });
  }
  
  return certifications.slice(0, 8);
}

function parseExperienceSection(sectionText: string): CVData['experience'] {
  return extractExperience(sectionText);
}

function parseEducationSection(sectionText: string): CVData['education'] {
  return extractEducation(sectionText);
}

function parseSkillsSection(sectionText: string): CVData['skills'] {
  // Split on commas, semicolons, newlines, and bullets — but NOT dashes (which separate "Skill - Level")
  const proficiencyKeywords = /^(native|fluent|proficient|professional|intermediate|basic|beginner|advanced|fundamental|fundamentals|expert|good|excellent|working knowledge|verhandlungssicher|fließend|grundkenntnisse|gute kenntnisse|sehr gute kenntnisse|fortgeschritten)$/i;

  const items = sectionText
    .split(/[,;\n•·]/)
    .map(s => {
      const trimmed = s.trim();
      // Normalize "Skill - Level" to "Skill (Level)" when Level is a known proficiency keyword
      const dashMatch = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch && proficiencyKeywords.test(dashMatch[2].trim())) {
        return `${dashMatch[1].trim()} (${dashMatch[2].trim()})`;
      }
      return trimmed;
    })
    .filter(s => s.length > 1 && s.length < 80);

  return items.length > 0 ? [{ category: 'Skills', items: [...new Set(items)].slice(0, 20) }] : [];
}
