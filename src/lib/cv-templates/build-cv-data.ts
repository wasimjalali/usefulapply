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

/**
 * The model sometimes reuses another section's header for additionalInfo
 * ("Certifications & Languages" twice on one CV). A duplicate is cleared so
 * the template falls back to its own default header.
 */
function dedupeAdditionalInfoHeader(headers: CVData['sectionHeaders']): CVData['sectionHeaders'] {
  if (!headers?.additionalInfo) return headers;
  const additional = headers.additionalInfo.trim().toLowerCase();
  const others = [
    headers.summary, headers.skills, headers.experience, headers.education,
    headers.certifications, headers.languages, headers.contact, headers.projects,
  ];
  if (others.some((header) => header && header.trim().toLowerCase() === additional)) {
    return { ...headers, additionalInfo: undefined };
  }
  return headers;
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
      sectionHeaders: dedupeAdditionalInfoHeader(optimizedCVData.sectionHeaders),
      localizedStrings: optimizedCVData.localizedStrings,
    };
    normalizePersonalLinks(tailored.personal);
    return tailored;
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
    merged.sectionHeaders = dedupeAdditionalInfoHeader(merged.sectionHeaders);
    return merged;
  }

  normalizePersonalLinks(parsed.personal);
  parsed.sectionHeaders = dedupeAdditionalInfoHeader(parsed.sectionHeaders);
  return parsed;
}
