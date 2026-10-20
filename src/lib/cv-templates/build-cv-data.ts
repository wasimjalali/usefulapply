/**
 * Builds the CVData a template renders from the stores' raw pieces. Shared by
 * the CV tab and the kit-wide Download all (which renders the CV offscreen),
 * so both always draw the same document.
 */

import { structuredCVToCVData } from '@/lib/cv-templates/parser';
import { inferCvLanguageFromHeaders } from '@/lib/cv-parser/section-splitter';
import type { CVData } from '@/lib/cv-templates/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { ApplicationSession } from '@/store/useSessionStore';

type OptimizedCVData = NonNullable<ApplicationSession['optimizedCVData']>;

export interface ProfileLinks {
  linkedin_url?: string | null;
  github_url?: string | null;
  portfolio_url?: string | null;
  website_url?: string | null;
  date_of_birth?: string | null;
  nationality?: string | null;
}

export interface BuildCvDataInput {
  structuredCV: StructuredCV | null;
  optimizedCVData?: OptimizedCVData;
  /** True for the tailored CV, false for the original. */
  showOptimized: boolean;
  editedOriginalCVData?: CVData | null;
  photoDataUrl?: string;
  profile?: ProfileLinks | null;
}

/**
 * Templates render these values straight into href. A schemeless value like
 * "wasim.dev" becomes a relative link and resolves against whatever host is
 * serving the page, so it gets an https:// prefix here.
 */
function normalizeExternalUrl(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  if (/^[\p{L}\p{N}_-]+(\.[\p{L}\p{N}_-]+)+([/?#]\S*)?$/u.test(trimmed)) return `https://${trimmed}`;
  // Anything else (javascript:, data:, free text) must never reach an href.
  return '';
}

type SectionHeaderKey = keyof NonNullable<CVData['sectionHeaders']>;

/**
 * The headers the reader actually sees, lowercased. A header only collides if
 * its section has content, so an unused one never costs another its heading.
 */
function renderedHeaders(data: CVData): Array<[SectionHeaderKey, string]> {
  const headers = data.sectionHeaders;
  if (!headers) return [];
  // A hidden section prints nothing, so its heading cannot collide with another.
  const shown = (key: SectionHeaderKey, present: boolean) => present && !(data.hiddenSections as string[] | undefined)?.includes(key);
  const isRendered: Record<SectionHeaderKey, boolean> = {
    summary: shown('summary', Boolean(data.summary?.trim())),
    skills: shown('skills', data.skills.some((group) => !group.hidden)),
    experience: shown('experience', data.experience.some((entry) => !entry.hidden)),
    education: shown('education', data.education.some((entry) => !entry.hidden)),
    certifications: shown('certifications', data.certifications.some((entry) => !entry.hidden)),
    languages: shown('languages', data.languages.some((entry) => !entry.hidden)),
    projects: shown('projects', (data.projects ?? []).some((entry) => !entry.hidden)),
    additionalInfo: shown('additionalInfo', (data.additionalInfo?.length ?? 0) > 0),
    contact: true,
  };
  const entries = Object.entries(headers) as Array<[SectionHeaderKey, string | undefined]>;
  return entries
    .filter(([key, header]) => Boolean(header?.trim()) && isRendered[key])
    .map(([key, header]) => [key, header!.trim().toLowerCase()]);
}

/**
 * One source heading can land on several sections. A CV with a combined
 * "Certifications & Languages" section gives the parser that same string for
 * the certifications header, the languages header and a catch-all section, so
 * the reader sees the heading three times over three different blocks.
 *
 * A heading shared by two rendered sections is dropped from both, leaving each
 * template its own default ("Certifications", "Languages"), and a catch-all
 * section that repeats a section heading is folded into additionalInfo, which
 * is where content like a driver's license belongs anyway.
 */
function resolveDuplicateHeaders(data: CVData): CVData {
  const headerValues = new Set(renderedHeaders(data).map(([, header]) => header));
  if (headerValues.size === 0) return data;

  let result = data;

  // Hidden custom sections are left exactly as they are: folding one into additionalInfo would print its items.
  const repeats = (data.customSections ?? []).filter((section) => !section.hidden && headerValues.has(section.title.trim().toLowerCase()));
  if (repeats.length > 0) {
    const kept = data.customSections!.filter((section) => !repeats.includes(section));
    const folded = [...(data.additionalInfo ?? []), ...repeats.flatMap((section) => section.items)];
    result = {
      ...result,
      customSections: kept.length > 0 ? kept : undefined,
      additionalInfo: folded.length > 0 ? folded : undefined,
    };
  }

  // Folding can give additionalInfo its first content, so count after it.
  const counts = new Map<string, number>();
  for (const [, header] of renderedHeaders(result)) {
    counts.set(header, (counts.get(header) ?? 0) + 1);
  }

  const headers = { ...result.sectionHeaders };
  let dropped = false;
  for (const [key, header] of renderedHeaders(result)) {
    if ((counts.get(header) ?? 0) > 1) {
      delete headers[key];
      dropped = true;
    }
  }
  return dropped ? { ...result, sectionHeaders: headers } : result;
}

function normalizePersonalLinks(personal: CVData['personal']) {
  personal.linkedIn = normalizeExternalUrl(personal.linkedIn);
  personal.github = normalizeExternalUrl(personal.github);
  personal.portfolio = normalizeExternalUrl(personal.portfolio);
  personal.website = normalizeExternalUrl(personal.website);
}

function mergeProfileLinks(personal: CVData['personal'], profile?: ProfileLinks | null) {
  if (!profile) return;
  personal.linkedIn = personal.linkedIn || profile.linkedin_url || '';
  personal.github = personal.github || profile.github_url || '';
  personal.portfolio = personal.portfolio || profile.portfolio_url || '';
  personal.website = personal.website || profile.website_url || '';
  personal.dateOfBirth = personal.dateOfBirth || profile.date_of_birth || '';
  personal.nationality = personal.nationality || profile.nationality || '';
}

export function buildCvData(input: BuildCvDataInput): CVData | null {
  const { structuredCV, optimizedCVData, showOptimized, editedOriginalCVData, photoDataUrl, profile } = input;
  if (!structuredCV) return null;

  const parsed: CVData = structuredCVToCVData(structuredCV);
  if (photoDataUrl) {
    parsed.personal.photoUrl = photoDataUrl;
  }
  // Personal links + DOB/nationality from the profile persist across sessions.
  mergeProfileLinks(parsed.personal, profile);

  // Tailored CV: structured JSON from the agent, used directly. Personal links
  // fall back to the original CV so the user never re-enters them per job.
  if (showOptimized && optimizedCVData) {
    const tailored: CVData = {
      // The tailored CV's own headings say what language it was written in; the parsed CV's setting is the fallback.
      language: optimizedCVData.sectionHeaders && Object.keys(optimizedCVData.sectionHeaders).length > 0
        ? inferCvLanguageFromHeaders(optimizedCVData.sectionHeaders)
        : parsed.language,
      personal: {
        fullName: optimizedCVData.personal.fullName,
        email: optimizedCVData.personal.email,
        phone: optimizedCVData.personal.phone || '',
        currentTitle: optimizedCVData.personal.currentTitle,
        address: optimizedCVData.personal.address || parsed.personal.address,
        city: optimizedCVData.personal.city || parsed.personal.city,
        country: optimizedCVData.personal.country || parsed.personal.country,
        linkedIn: optimizedCVData.personal.linkedIn || parsed.personal.linkedIn,
        website: optimizedCVData.personal.website || parsed.personal.website,
        github: optimizedCVData.personal.github || parsed.personal.github,
        portfolio: parsed.personal.portfolio,
        photoUrl: photoDataUrl,
        dateOfBirth: parsed.personal.dateOfBirth,
        nationality: parsed.personal.nationality,
      },
      summary: optimizedCVData.summary,
      experience: optimizedCVData.experience,
      education: optimizedCVData.education,
      skills: optimizedCVData.skills,
      languages: optimizedCVData.languages,
      certifications: optimizedCVData.certifications,
      projects: optimizedCVData.projects || undefined,
      customSections: optimizedCVData.customSections || undefined,
      additionalInfo: optimizedCVData.additionalInfo || (optimizedCVData.personal.driverLicense
        ? [`Driver's License: ${optimizedCVData.personal.driverLicense}`]
        : undefined),
      sectionHeaders: optimizedCVData.sectionHeaders,
      localizedStrings: optimizedCVData.localizedStrings,
      hiddenSections: optimizedCVData.hiddenSections,
      renamedHeadings: optimizedCVData.renamedHeadings as CVData['renamedHeadings'],
    };
    normalizePersonalLinks(tailored.personal);
    return resolveDuplicateHeaders(tailored);
  }

  // Original view: prefer the user's saved edits of the original CV. Also
  // taken pre-kit, where showOptimized is true but there is no tailored CV.
  if (!(showOptimized && optimizedCVData) && editedOriginalCVData) {
    const merged = { ...editedOriginalCVData, personal: { ...editedOriginalCVData.personal } };
    if (photoDataUrl) {
      merged.personal.photoUrl = photoDataUrl;
    }
    mergeProfileLinks(merged.personal, profile);
    normalizePersonalLinks(merged.personal);
    return resolveDuplicateHeaders(merged);
  }

  normalizePersonalLinks(parsed.personal);
  return resolveDuplicateHeaders(parsed);
}
