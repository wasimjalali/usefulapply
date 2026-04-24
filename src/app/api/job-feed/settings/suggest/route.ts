import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import type { JobFeedSettingsSuggestion } from '@/lib/job-feed/types';
import type { StructuredCV } from '@/lib/types/cv-schema';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIP(request);
    const { allowed } = checkRateLimit(`job-feed-settings:${ip}`, RATE_LIMITS['job-feed-settings']);
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 });
    }

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Query inference does not yet understand the newly added tables here.
    const typedSupabase = supabase as any;
    const { data: { user }, error: authError } = await typedSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const { data: document, error: docError } = await typedSupabase
      .from('documents')
      .select('structured_data')
      .eq('user_id', user.id)
      .eq('document_type', 'primary_cv')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (docError) {
      console.error('[job-feed/settings/suggest] Document fetch error:', docError.message);
      return NextResponse.json({ error: 'Failed to load CV data.' }, { status: 500 });
    }

    if (!document?.structured_data) {
      return NextResponse.json({ suggestion: null, reason: 'no_cv' });
    }

    const cv = document.structured_data as StructuredCV;
    const suggestion = extractSuggestionsFromCV(cv);

    return NextResponse.json({ suggestion });
  } catch (error) {
    console.error('[job-feed/settings/suggest] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to generate suggestions.' }, { status: 500 });
  }
}

function extractSuggestionsFromCV(cv: StructuredCV): JobFeedSettingsSuggestion {
  const targetRoles: string[] = [];
  if (cv.personal?.currentTitle) {
    targetRoles.push(cv.personal.currentTitle);
  }
  if (cv.experience?.length > 0) {
    const recentPosition = cv.experience[0].position;
    if (recentPosition && !targetRoles.includes(recentPosition)) {
      targetRoles.push(recentPosition);
    }
  }

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

  const seniorityTarget = inferSeniorityFromCV(cv);

  return {
    target_roles: targetRoles.slice(0, 3),
    preferred_locations: preferredLocations.slice(0, 4),
    user_skills: userSkills,
    languages,
    seniority_target: seniorityTarget,
    source: 'cv',
  };
}

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
