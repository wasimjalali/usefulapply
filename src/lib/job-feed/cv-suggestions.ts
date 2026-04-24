import type { JobFeedSettingsSuggestion } from '@/lib/job-feed/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

export function extractJobFeedSuggestionsFromCV(cv: StructuredCV): JobFeedSettingsSuggestion {
  const rawTitle = cv.personal?.currentTitle ?? cv.experience?.[0]?.position ?? '';
  const targetRoles = deriveTargetRoles(rawTitle, cv);

  const preferredLocations: string[] = [];
  if (cv.personal?.city && cv.personal?.country) {
    preferredLocations.push(`${cv.personal.city}, ${cv.personal.country}`);
  } else if (cv.personal?.city) {
    preferredLocations.push(cv.personal.city);
  }

  const userSkills: string[] = [];
  if (cv.skills?.length > 0) {
    for (const category of cv.skills) {
      for (const skill of category.skills) {
        const cleaned = skill.replace(/\s*\([^)]*\)\s*$/, '').trim();
        if (cleaned && !userSkills.includes(cleaned)) {
          userSkills.push(cleaned);
        }
        if (userSkills.length >= 50) break;
      }
      if (userSkills.length >= 50) break;
    }
  }

  const languages: string[] = [];
  if (cv.languages?.length > 0) {
    for (const lang of cv.languages) {
      if (lang.language && !languages.includes(lang.language)) {
        languages.push(lang.language);
      }
    }
  }
  if (languages.length === 0) {
    languages.push('English');
  }

  return {
    target_roles: targetRoles.slice(0, 3),
    preferred_locations: preferredLocations.slice(0, 4),
    user_skills: userSkills,
    languages,
    seniority_target: inferSeniorityFromCV(cv),
    source: 'cv',
  };
}

// ---------------------------------------------------------------------------
// Role derivation — generate relevant role variants from a raw CV title
// ---------------------------------------------------------------------------

const ROLE_VARIANTS: Record<string, string[]> = {
  // Product Management
  'product manager': ['Senior Product Manager', 'Lead Product Manager', 'Group Product Manager'],
  'senior product manager': ['Principal Product Manager', 'Lead Product Manager', 'Director of Product'],
  'principal product manager': ['Director of Product', 'VP of Product', 'Group Product Manager'],
  'director of product': ['VP of Product', 'Head of Product', 'Principal Product Manager'],
  'vp of product': ['VP of Product Management', 'Chief Product Officer', 'Director of Product'],
  'head of product': ['Director of Product', 'VP of Product', 'Chief Product Officer'],
  'growth product manager': ['Senior Growth PM', 'Head of Growth', 'Product Growth Lead'],
  'platform product manager': ['Senior Platform PM', 'Technical Product Manager', 'Head of Platform'],
  'technical product manager': ['Senior Technical PM', 'Platform Product Manager', 'Engineering Manager'],
  // Software Engineering
  'software engineer': ['Senior Software Engineer', 'Staff Software Engineer', 'Backend Engineer'],
  'senior software engineer': ['Staff Engineer', 'Principal Engineer', 'Engineering Manager'],
  'staff engineer': ['Principal Engineer', 'Distinguished Engineer', 'Engineering Manager'],
  'principal engineer': ['Distinguished Engineer', 'VP of Engineering', 'CTO'],
  'frontend engineer': ['Senior Frontend Engineer', 'Staff Frontend Engineer', 'Full-Stack Engineer'],
  'backend engineer': ['Senior Backend Engineer', 'Staff Backend Engineer', 'Full-Stack Engineer'],
  'full-stack engineer': ['Senior Full-Stack Engineer', 'Staff Engineer', 'Tech Lead'],
  'full stack engineer': ['Senior Full-Stack Engineer', 'Staff Engineer', 'Tech Lead'],
  'mobile engineer': ['Senior Mobile Engineer', 'iOS Engineer', 'Android Engineer'],
  'ios engineer': ['Senior iOS Engineer', 'Mobile Engineer', 'Staff iOS Engineer'],
  'android engineer': ['Senior Android Engineer', 'Mobile Engineer', 'Staff Android Engineer'],
  'data engineer': ['Senior Data Engineer', 'Staff Data Engineer', 'Data Architect'],
  'machine learning engineer': ['Senior ML Engineer', 'Staff ML Engineer', 'AI Engineer'],
  'devops engineer': ['Senior DevOps Engineer', 'Platform Engineer', 'Site Reliability Engineer'],
  'site reliability engineer': ['Senior SRE', 'Staff SRE', 'Platform Engineer'],
  // Design
  'ux designer': ['Senior UX Designer', 'Product Designer', 'Lead UX Designer'],
  'product designer': ['Senior Product Designer', 'Lead Product Designer', 'Head of Design'],
  'ui designer': ['Senior UI Designer', 'Product Designer', 'UI/UX Designer'],
  'ui/ux designer': ['Senior UI/UX Designer', 'Product Designer', 'Lead Designer'],
  'design lead': ['Head of Design', 'Principal Designer', 'Design Manager'],
  // Data / Analytics
  'data scientist': ['Senior Data Scientist', 'Staff Data Scientist', 'ML Engineer'],
  'data analyst': ['Senior Data Analyst', 'Analytics Engineer', 'Business Intelligence Analyst'],
  'analytics engineer': ['Senior Analytics Engineer', 'Data Engineer', 'Staff Analytics Engineer'],
  'business analyst': ['Senior Business Analyst', 'Product Analyst', 'Strategy Analyst'],
  // Marketing
  'marketing manager': ['Senior Marketing Manager', 'Director of Marketing', 'Head of Marketing'],
  'growth manager': ['Senior Growth Manager', 'Head of Growth', 'Growth Lead'],
  'content manager': ['Senior Content Manager', 'Head of Content', 'Content Strategist'],
  // Management
  'engineering manager': ['Senior Engineering Manager', 'Director of Engineering', 'VP of Engineering'],
  'director of engineering': ['VP of Engineering', 'CTO', 'Senior Engineering Manager'],
  'vp of engineering': ['CTO', 'VP Engineering', 'Chief Technology Officer'],
};

function deriveTargetRoles(rawTitle: string, cv: StructuredCV): string[] {
  if (!rawTitle) return [];

  const roles = new Set<string>();

  // Always include the raw title from the CV first
  roles.add(rawTitle);

  // Also add the most recent experience position if different
  const recentPosition = cv.experience?.[0]?.position;
  if (recentPosition && recentPosition !== rawTitle) {
    roles.add(recentPosition);
  }

  // Look up known variants
  const normalized = rawTitle.toLowerCase().trim();
  const variants = ROLE_VARIANTS[normalized];
  if (variants) {
    for (const v of variants.slice(0, 2)) {
      roles.add(v);
    }
  }

  // Strip common seniority prefixes and look up the base role for more matches
  const withoutSeniority = normalized
    .replace(/^(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|director of|vp of|chief)\s+/, '')
    .trim();
  if (withoutSeniority !== normalized) {
    const baseVariants = ROLE_VARIANTS[withoutSeniority];
    if (baseVariants) {
      for (const v of baseVariants.slice(0, 1)) {
        roles.add(v);
      }
    }
  }

  return [...roles].slice(0, 4);
}

// ---------------------------------------------------------------------------

function inferSeniorityFromCV(cv: StructuredCV): JobFeedSettingsSuggestion['seniority_target'] {
  const title = (cv.personal?.currentTitle ?? cv.experience?.[0]?.position ?? '').toLowerCase();

  if (/(intern|internship|co.op)/.test(title)) return 'intern';
  if (/(junior|jr|entry.level|associate)\b/.test(title)) return 'junior';
  if (/(staff|principal)\b/.test(title)) return 'staff';
  if (/(manager|management|director)\b/.test(title)) return 'manager';
  if (/(lead|head)\b/.test(title)) return 'lead';
  if (/(senior|sr)\b/.test(title)) return 'senior';

  const totalYears = estimateTotalExperienceYears(cv);
  if (totalYears >= 8) return 'senior';
  if (totalYears >= 3) return 'mid';
  if (totalYears >= 0) return 'junior';

  return 'mid';
}

function estimateTotalExperienceYears(cv: StructuredCV): number {
  if (!cv.experience?.length) return 0;

  let totalMonths = 0;
  for (const exp of cv.experience) {
    const startYear = parseYearFromCVDate(exp.startDate?.normalized ?? exp.startDate?.raw);
    if (!startYear) continue;

    let endYear: number;
    if (exp.current || !exp.endDate) {
      endYear = new Date().getFullYear();
    } else {
      endYear = parseYearFromCVDate(exp.endDate.normalized ?? exp.endDate.raw) ?? new Date().getFullYear();
    }

    totalMonths += Math.max(0, (endYear - startYear) * 12);
  }

  return Math.round(totalMonths / 12);
}

function parseYearFromCVDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}
