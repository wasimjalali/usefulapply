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

export function parseYearMonthFromCVDate(value: string | undefined): { year: number; month: number } | null {
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
