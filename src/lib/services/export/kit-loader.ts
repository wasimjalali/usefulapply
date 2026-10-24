import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { legacyCoverLetterText } from '@/lib/cover-letter/legacy-text';
import { buildCvData, type ProfileLinks } from '@/lib/cv-templates/build-cv-data';
import { getDocumentByType } from '@/db/repos/documents';
import { getProfile } from '@/db/repos/profiles';
import { getKit } from '@/lib/services/kit';
import { NotFoundError } from '@/lib/services/errors';
import { bytesToBase64 } from '@/lib/cv-templates/fonts';
import { listPrefix, getObject } from '@/storage/r2';
import { storedFileKey, userOwnsKey } from '@/storage/paths';
import type { GeneratedCoverLetter } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { ExportAnswer, ExportEmail, ExportKit, KitLoader } from './types';

/**
 * Reads one application into the shape the exporter needs: the kit from the
 * shared `getKit` service (canonical columns first, `generated_artifacts` as the
 * fallback, the same reader the MCP tools use), plus the profile, the parsed
 * primary CV and the photo. Every query is scoped to the signed-in owner.
 *
 * This is the one seam to the kit; nothing else in the export service reaches
 * into the session row.
 */

const MAX_PHOTO_BYTES = 1024 * 1024;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function readEmail(value: unknown, label: string): ExportEmail | null {
  const record = asRecord(value);
  if (!record) return null;
  const subject = typeof record.subject === 'string' ? record.subject : '';
  const body = typeof record.body === 'string' ? record.body : '';
  return subject.trim() || body.trim() ? { label, subject, body } : null;
}

async function loadPhotoDataUri(userId: string, avatarUrl: string | null | undefined): Promise<string | null> {
  const candidates: string[] = [];
  const avatarKey = avatarUrl ? storedFileKey(avatarUrl) : null;
  if (avatarKey) candidates.push(avatarKey);
  if (candidates.length === 0) {
    const legacy = await listPrefix(`profile-photos/${userId}/`);
    if (legacy[0]) candidates.push(legacy[0].key);
  }
  for (const key of candidates) {
    // Ownership is checked on the key itself, not only on how it was found.
    if (!userOwnsKey(key, userId)) continue;
    const object = await getObject(key);
    if (!object || object.size > MAX_PHOTO_BYTES) continue;
    const type = object.httpMetadata?.contentType?.toLowerCase();
    if (type !== 'image/jpeg' && type !== 'image/jpg' && type !== 'image/png') continue;
    const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
    return `data:${type === 'image/png' ? 'image/png' : 'image/jpeg'};base64,${bytesToBase64(bytes)}`;
  }
  return null;
}

function profileLinksOf(profile: Awaited<ReturnType<typeof getProfile>>): ProfileLinks | null {
  return profile
    ? {
        linkedin_url: profile.linkedin_url,
        github_url: profile.github_url,
        portfolio_url: profile.portfolio_url,
        website_url: profile.website_url,
        date_of_birth: profile.date_of_birth,
        nationality: profile.nationality,
      }
    : null;
}

/**
 * The signed-in user's own CV with no application behind it: their profile, primary CV and photo, read
 * with their user id. Only a CV can be exported from it. Null when they have no primary CV.
 */
export async function loadBaseCvKit(userId: string): Promise<ExportKit | null> {
  const [profile, primary] = await Promise.all([getProfile(userId), getDocumentByType(userId, 'primary_cv')]);
  if (!primary) return null;
  const structuredCV = (primary.structured_data ?? null) as StructuredCV | null;
  const original = buildCvData({ structuredCV, showOptimized: false, profile: profileLinksOf(profile) });
  return {
    applicationId: '',
    jobTitle: '',
    company: '',
    templateId: null,
    applicantName: original?.personal.fullName || profile?.full_name || '',
    cv: original,
    originalCv: original,
    coverLetter: null,
    emails: [],
    answers: [],
    photoDataUri: await loadPhotoDataUri(userId, profile?.avatar_url),
  };
}

export const loadKitFromSession: KitLoader = async (userId, applicationId) => {
  let stored;
  try {
    stored = await getKit(userId, applicationId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }

  const [profile, primary] = await Promise.all([getProfile(userId), getDocumentByType(userId, 'primary_cv')]);
  const structuredCV = (primary?.structured_data ?? null) as StructuredCV | null;
  const profileLinks = profileLinksOf(profile);

  const tailored = buildCvData({
    structuredCV,
    optimizedCVData: stored.optimizedCVData as Parameters<typeof buildCvData>[0]['optimizedCVData'],
    showOptimized: true,
    profile: profileLinks,
  });
  const original = buildCvData({ structuredCV, showOptimized: false, profile: profileLinks });

  const letter = stored.coverLetter;
  const structuredLetter = letter && isStructuredCoverLetter(letter.structured) ? letter.structured : null;
  const legacyText = letter && !structuredLetter ? legacyCoverLetterText(letter as GeneratedCoverLetter) : null;

  const emails = [
    readEmail(stored.email, 'Application email'),
    readEmail(stored.followUpEmail, 'Follow-up email'),
  ].filter((email): email is ExportEmail => email !== null);

  const answers: ExportAnswer[] = (stored.screeningAnswers ?? [])
    .filter((item) => typeof item?.question === 'string' && typeof item?.answer === 'string')
    .map((item) => ({ question: item.question, answer: item.answer }));

  const photoDataUri = await loadPhotoDataUri(userId, profile?.avatar_url);

  const kit: ExportKit = {
    applicationId: stored.applicationId,
    jobTitle: stored.jobTitle,
    company: stored.company,
    templateId: stored.selectedTemplate ?? null,
    applicantName: tailored?.personal.fullName || profile?.full_name || '',
    cv: tailored,
    originalCv: original,
    coverLetter: structuredLetter || legacyText ? { structured: structuredLetter, legacyText } : null,
    emails,
    answers,
    photoDataUri,
  };
  return kit;
};
