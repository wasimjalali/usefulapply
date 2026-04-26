import { JOB_FEED_COUNTRY_OPTIONS } from '@/lib/job-feed/constants';
import type { JobFeedSettingsSuggestion } from '@/lib/job-feed/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

// CV "currentTitle" is user-authored free text. People often write composite
// titles like "AI Engineer | Product Builder | Founder" or "PM / Growth Lead".
// SerpAPI treats that as one literal query and returns nothing. Split on
// common separators before we hand anything to the search plan.
export function splitCompositeRole(rawTitle: string): string[] {
  if (!rawTitle) return [];
  return rawTitle
    .split(/[|/•·;]|\s+\/\s+|\s+&\s+|\s+and\s+|\s+-\s+|,/i)
    .map((part) => part.trim())
    // Drop filler words that show up between titles (e.g. "and", "or", "plus").
    .map((part) => part.replace(/^(and|or|plus|&)\s+/i, '').trim())
    .filter((part) => part.length >= 2 && part.length <= 60);
}

export function extractJobFeedSuggestionsFromCV(cv: StructuredCV): JobFeedSettingsSuggestion {
  const rawTitle = cv.personal?.currentTitle ?? cv.experience?.[0]?.position ?? '';
  const targetRoles = deriveTargetRoles(rawTitle, cv);

  const preferredLocations: string[] = [];
  if (cv.personal?.city && cv.personal?.country) {
    preferredLocations.push(`${cv.personal.city}, ${cv.personal.country}`);
  } else if (cv.personal?.city) {
    preferredLocations.push(cv.personal.city);
  }

  const targetCountries: string[] = [];
  const countryCode = inferCountryCodeFromLabel(cv.personal?.country);
  if (countryCode) {
    targetCountries.push(countryCode);
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
    target_countries: targetCountries,
    user_skills: userSkills,
    languages,
    seniority_target: inferSeniorityFromCV(cv),
    source: 'cv',
  };
}

function inferCountryCodeFromLabel(country: string | undefined): string | null {
  if (!country) return null;
  const normalized = country.trim().toLowerCase();
  if (!normalized) return null;

  // Try exact code match first (e.g. "US", "DE")
  if (normalized.length === 2) {
    const byCode = JOB_FEED_COUNTRY_OPTIONS.find((option) => option.value === normalized);
    if (byCode) return byCode.value;
  }

  // Common country label aliases
  const aliases: Record<string, string> = {
    'united states': 'us',
    'usa': 'us',
    'u.s.': 'us',
    'u.s.a.': 'us',
    'united states of america': 'us',
    'america': 'us',
    'canada': 'ca',
    'united kingdom': 'gb',
    'uk': 'gb',
    'great britain': 'gb',
    'england': 'gb',
    'scotland': 'gb',
    'wales': 'gb',
    'ireland': 'ie',
    'germany': 'de',
    'deutschland': 'de',
    'netherlands': 'nl',
    'holland': 'nl',
    'the netherlands': 'nl',
    'france': 'fr',
    'spain': 'es',
    'italy': 'it',
    'switzerland': 'ch',
    'austria': 'at',
    'belgium': 'be',
    'denmark': 'dk',
    'sweden': 'se',
    'norway': 'no',
    'finland': 'fi',
    'poland': 'pl',
    'australia': 'au',
    'new zealand': 'nz',
    'india': 'in',
    'singapore': 'sg',
    'united arab emirates': 'ae',
    'uae': 'ae',
  };

  if (aliases[normalized]) return aliases[normalized];

  // Try matching by label
  const byLabel = JOB_FEED_COUNTRY_OPTIONS.find((option) => option.label.toLowerCase() === normalized);
  return byLabel ? byLabel.value : null;
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

  // Split composite CV titles (e.g. "PM | Growth Lead | Founder") into
  // individual search terms. A single-title CV just returns one element.
  for (const part of splitCompositeRole(rawTitle)) {
    roles.add(part);
  }

  // Also add the most recent experience position if different — split too,
  // since people sometimes list "Founder & Lead Developer" as one position.
  const recentPosition = cv.experience?.[0]?.position;
  if (recentPosition) {
    for (const part of splitCompositeRole(recentPosition)) {
      roles.add(part);
    }
  }

  // Look up known variants. Match on the first split component so composite
  // titles still hit the variants map.
  const primaryRole = splitCompositeRole(rawTitle)[0] ?? rawTitle;
  const normalized = primaryRole.toLowerCase().trim();
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

  return [...roles].slice(0, 5);
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

export function estimateTotalExperienceYears(cv: StructuredCV): number {
  if (!cv.experience?.length) return 0;

  const now = new Date();
  let totalMonths = 0;
  for (const exp of cv.experience) {
    const start = parseYearMonthFromCVDate(exp.startDate?.normalized ?? exp.startDate?.raw);
    if (!start) continue;

    const end = (exp.current || !exp.endDate)
      ? { year: now.getFullYear(), month: now.getMonth() + 1 }
      : parseYearMonthFromCVDate(exp.endDate.normalized ?? exp.endDate.raw) ?? { year: now.getFullYear(), month: now.getMonth() + 1 };

    // Month-precision span. A role Jan-Nov 2022 = 10 months, not 0.
    // Dec 2022 - Jan 2023 = 1 month, not 12.
    const months = (end.year - start.year) * 12 + (end.month - start.month);
    totalMonths += Math.max(0, months);
  }

  return Math.round(totalMonths / 12);
}

function parseYearMonthFromCVDate(value: string | undefined): { year: number; month: number } | null {
  if (!value) return null;

  // Try ISO-ish "YYYY-MM" / "YYYY-MM-DD" first.
  const iso = value.match(/(\d{4})-(\d{1,2})(?:-\d{1,2})?/);
  if (iso) {
    const year = Number.parseInt(iso[1], 10);
    const month = Number.parseInt(iso[2], 10);
    if (month >= 1 && month <= 12) return { year, month };
  }

  // Month-name formats: "Jan 2022", "January 2022", "2022 Jan".
  const monthNames: Record<string, number> = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9,
    sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
    dec: 12, december: 12,
    // German month names for DACH-market CVs.
    januar: 1, februar: 2, märz: 3, maerz: 3, mai: 5, juni: 6, juli: 7,
    oktober: 10, dezember: 12,
  };

  const lower = value.toLowerCase();
  for (const [name, monthNum] of Object.entries(monthNames)) {
    if (lower.includes(name)) {
      const yearMatch = value.match(/\b(\d{4})\b/);
      if (yearMatch) return { year: Number.parseInt(yearMatch[1], 10), month: monthNum };
    }
  }

  // Year-only fallback ("2022"). Assume mid-year (July) so the estimate
  // averages out over many entries instead of systematically rounding down.
  const yearMatch = value.match(/\b(\d{4})\b/);
  if (yearMatch) {
    return { year: Number.parseInt(yearMatch[1], 10), month: 7 };
  }

  return null;
}

function parseYearFromCVDate(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(\d{4})/);
  return match ? parseInt(match[1], 10) : null;
}
