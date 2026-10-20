/**
 * Builds the CVData a template renders from the stores' raw pieces. Shared by
 * the CV tab and the kit-wide Download all (which renders the CV offscreen),
 * so both always draw the same document.
 */

import { structuredCVToCVData } from '@/lib/cv-templates/parser';
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
  const isRendered: Record<SectionHeaderKey, boolean> = {
    summary: Boolean(data.summary?.trim()),
    skills: data.skills.length > 0,
    experience: data.experience.length > 0,
    education: data.education.length > 0,
    certifications: data.certifications.length > 0,
    languages: data.languages.length > 0,
    projects: (data.projects?.length ?? 0) > 0,
    additionalInfo: (data.additionalInfo?.length ?? 0) > 0,
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

  const repeats = (data.customSections ?? []).filter((section) => headerValues.has(section.title.trim().toLowerCase()));
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
