/**
 * CV Transformation Utilities
 * 
 * Helper functions for extracting and transforming CV content
 * Used by the agent-v2 API route for CV optimization
 */

import type { GeneratedCV } from '@/lib/types';

/**
 * Extract original experience bullets from CV text for a specific company/title
 */
export function extractOriginalExperience(cvText: string, company: string, title: string): string {
  // Escape special regex characters in company/title
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safeCompany = escapeRegex(company);
  const safeTitle = escapeRegex(title);
  
  // Try to find the experience section for this company/title
  // Look for bullet points (•, -, *) that follow the company/title mention
  const bulletPattern = /[•\-\*]\s*([^\n•\-\*]+)/g;
  
  // Find the section containing this company
  const sectionPattern = new RegExp(
    `(?:${safeCompany}|${safeTitle})[^]*?(?=(?:^[A-Z][a-z]+\\s+(?:at|@)|^[A-Z]{2,}|^(?:Education|Skills|Languages|Certifications)|$))`,
    'im'
  );
  
  const sectionMatch = cvText.match(sectionPattern);
  if (sectionMatch) {
    const section = sectionMatch[0];
    const bullets: string[] = [];
    let match;
    
    while ((match = bulletPattern.exec(section)) !== null) {
      const bullet = match[1].trim();
      // Only include actual bullet content (not dates, locations, etc.)
      if (bullet.length > 20 && !bullet.match(/^\d{4}/) && !bullet.match(/^[A-Z][a-z]+\s+\d{4}/)) {
        bullets.push(bullet);
      }
    }
    
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map(b => `• ${b}`).join('\n');
    }
  }
  
  // Fallback: look for any bullet points near the company name
  const companyIndex = cvText.toLowerCase().indexOf(company.toLowerCase());
  if (companyIndex !== -1) {
    const nearbyText = cvText.substring(companyIndex, companyIndex + 800);
    const bullets: string[] = [];
    let match;
    
    while ((match = bulletPattern.exec(nearbyText)) !== null) {
      const bullet = match[1].trim();
      if (bullet.length > 20 && !bullet.match(/^\d{4}/)) {
        bullets.push(bullet);
      }
    }
    
    if (bullets.length > 0) {
      return bullets.slice(0, 3).map(b => `• ${b}`).join('\n');
    }
  }
  
  return 'Original experience bullets not found';
}

/**
 * Extract headline/title from CV text
 */
export function extractOriginalHeadline(cvText: string): string {
  const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
  // Skip the name (usually first line), look for a title/headline in first 5 lines
  for (let i = 1; i < Math.min(5, lines.length); i++) {
    const line = lines[i];
    // Skip contact info lines
    if (line.includes('@') || line.match(/\d{5,}/) || line.match(/^\+?\d[\d\s\-()]+$/)) continue;
    // Look for job title patterns
    if (line.length > 10 && line.length < 80 && !line.includes('http')) {
      return line;
    }
  }
  return 'No headline found in original CV';
}

/**
 * Extract section content by header - uses strict header-based segmentation
 */
export function extractSectionByHeader(cvText: string, headerNames: string[], maxLength: number): string | null {
  const lines = cvText.split('\n');
  
  // Build regex pattern for headers: "## Header", "# Header", "Header:", "HEADER", etc.
  const headerPattern = headerNames.map(h => {
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return `(?:^#{1,3}\\s*${escaped}|^${escaped}\\s*:|^${escaped.toUpperCase()}\\s*$)`;
  }).join('|');
  
  const headerRegex = new RegExp(headerPattern, 'im');
  
  let startIndex = -1;
  let endIndex = lines.length;
  
  // Find the header line
  for (let i = 0; i < lines.length; i++) {
    if (headerRegex.test(lines[i].trim())) {
      startIndex = i + 1; // Start from line after header
      break;
    }
  }
  
  if (startIndex === -1) return null;
  
  // Find the next header (any header pattern)
  const nextHeaderRegex = /^(?:#{1,3}\s+\w|[A-Za-z][A-Za-z\s]+:$|[A-Z]{2,}(?:\s+[A-Z]{2,})*$)/;
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line && nextHeaderRegex.test(line)) {
      endIndex = i;
      break;
    }
  }
  
  // Extract content between headers
  const content = lines.slice(startIndex, endIndex)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join('\n')
    .substring(0, maxLength);
  
  return content || null;
}

/**
 * Transform OptimizedContent to GeneratedCV format with changes
 */
export function transformToGeneratedCV(
  optimizedContent: {
    summary: string;
    headline: string;
    experience: Array<{ company: string; title: string; bullets: string[] }>;
    skills: string[];
    matchScore: number;
  },
  originalCV: string,
  requirements: { title: string; company: string }
): {
  content: string;
  optimizedTagline: string;
  changes: Array<{ section: string; original: string; updated: string; reason: string }>;
  optimizedFor: string;
} {
  const changes: Array<{ section: string; original: string; updated: string; reason: string }> = [];
  
  // Extract original summary using header-based segmentation
  // Look for explicit headers like "## Summary", "# Profile", "Summary:", etc.
  const summaryHeaders = ['summary', 'profile', 'objective', 'about me', 'professional summary', 'career summary'];
  const originalSummary = extractSectionByHeader(originalCV, summaryHeaders, 300) || 'No summary section found in original CV';
  
  // Add summary change
  if (optimizedContent.summary) {
    changes.push({
      section: 'Professional Summary',
      original: originalSummary,
      updated: optimizedContent.summary,
      reason: `Optimized to highlight relevant experience for ${requirements.title} role at ${requirements.company}`,
    });
  }
  
  // Add headline/tagline change - extract actual original headline
  if (optimizedContent.headline) {
    const originalHeadline = extractOriginalHeadline(originalCV);
    changes.push({
      section: 'Professional Headline',
      original: originalHeadline,
      updated: optimizedContent.headline,
      reason: 'Updated to match target job title and highlight key expertise',
    });
  }
  
  // Add skills change - extract using header-based segmentation
  if (optimizedContent.skills && optimizedContent.skills.length > 0) {
    const skillsHeaders = ['skills', 'competencies', 'expertise', 'technical skills', 'core competencies', 'key skills'];
    const originalSkills = extractSectionByHeader(originalCV, skillsHeaders, 200) || 'No skills section found in original CV';
    
    changes.push({
      section: 'Skills & Competencies',
      original: originalSkills,
      updated: optimizedContent.skills.join(', '),
      reason: 'Reorganized and prioritized skills to match job requirements',
    });
  }
  
  // Add experience changes - extract actual original bullets
  if (optimizedContent.experience && optimizedContent.experience.length > 0) {
    optimizedContent.experience.forEach((exp) => {
      if (exp.bullets && exp.bullets.length > 0) {
        const originalBullets = extractOriginalExperience(originalCV, exp.company, exp.title);
        changes.push({
          section: `Experience: ${exp.title} at ${exp.company}`,
          original: originalBullets,
          updated: exp.bullets.map(b => `• ${b}`).join('\n'),
          reason: 'Enhanced with quantified achievements and relevant keywords',
        });
      }
    });
  }
  
  // Build full content string
  const contentParts = [
    `# ${optimizedContent.headline || 'Professional'}`,
    '',
    '## Professional Summary',
    optimizedContent.summary,
    '',
    '## Skills',
    optimizedContent.skills?.join(', ') || '',
    '',
    '## Experience',
    ...(optimizedContent.experience?.map(exp => 
      `### ${exp.title} at ${exp.company}\n${exp.bullets?.map(b => `• ${b}`).join('\n') || ''}`
    ) || []),
  ];
  
  return {
    content: contentParts.join('\n'),
    optimizedTagline: optimizedContent.headline || '',
    changes,
    optimizedFor: requirements.title,
  };
}
