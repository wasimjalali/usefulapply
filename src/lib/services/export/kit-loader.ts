import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { legacyCoverLetterText } from '@/lib/cover-letter/legacy-text';
import { buildCvData, type ProfileLinks } from '@/lib/cv-templates/build-cv-data';
import { getDocumentByType } from '@/db/repos/documents';
import { getProfile } from '@/db/repos/profiles';
import { getSession } from '@/db/repos/sessions';
import { bytesToBase64 } from '@/lib/cv-templates/fonts';
import { listPrefix, getObject } from '@/storage/r2';
import { storedFileKey, userOwnsKey } from '@/storage/paths';
import type { GeneratedCoverLetter } from '@/lib/types';
import type { StructuredCV } from '@/lib/types/cv-schema';
import type { ExportAnswer, ExportEmail, ExportKit, KitLoader } from './types';

/**
 * Reads one application into the shape the exporter needs, from the session
 * row and the profile, with every query scoped to the signed-in owner.
 *
 * This is the one seam to the kit: when the shared `getKit` service lands, the
 * orchestrator replaces this function and nothing else in the export service
 * changes.
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

export const loadKitFromSession: KitLoader = async (userId, applicationId) => {
  const row = await getSession(userId, applicationId);
  if (!row) return null;

  const [profile, primary] = await Promise.all([getProfile(userId), getDocumentByType(userId, 'primary_cv')]);
  const structuredCV = (primary?.structured_data ?? null) as StructuredCV | null;
  const artifacts = asRecord(row.generated_artifacts);
  const generated = asRecord(row.generated_cv);
  const optimized = (generated?._optimizedCVData ?? artifacts?.optimizedCVData) as Parameters<typeof buildCvData>[0]['optimizedCVData'];
  const profileLinks: ProfileLinks | null = profile
    ? {
        linkedin_url: profile.linkedin_url,
        github_url: profile.github_url,
        portfolio_url: profile.portfolio_url,
        website_url: profile.website_url,
        date_of_birth: profile.date_of_birth,
        nationality: profile.nationality,
      }
    : null;

  const tailored = buildCvData({ structuredCV, optimizedCVData: optimized, showOptimized: true, profile: profileLinks });
  const original = buildCvData({ structuredCV, showOptimized: false, profile: profileLinks });

  const letterRecord = asRecord(row.cover_letter);
  const structuredLetter = letterRecord && isStructuredCoverLetter(letterRecord.structured) ? letterRecord.structured : null;
  let legacyText: string | null = null;
  if (letterRecord && !structuredLetter) {
    legacyText = legacyCoverLetterText(letterRecord as unknown as GeneratedCoverLetter);
  } else if (typeof artifacts?.coverLetter === 'string' && artifacts.coverLetter.trim()) {
    legacyText = artifacts.coverLetter;
  }

  const emails = [
    readEmail(row.email ?? artifacts?.applicationEmail, 'Application email'),
    readEmail(row.follow_up_email ?? artifacts?.followUpEmail, 'Follow-up email'),
  ].filter((email): email is ExportEmail => email !== null);

  const answers: ExportAnswer[] = Array.isArray(generated?._screeningAnswers)
    ? (generated._screeningAnswers as Array<Record<string, unknown>>)
        .filter((item) => typeof item?.question === 'string' && typeof item?.answer === 'string')
        .map((item) => ({ question: item.question as string, answer: item.answer as string }))
    : [];

  const photoDataUri = await loadPhotoDataUri(userId, profile?.avatar_url);

  const kit: ExportKit = {
    applicationId: row.id,
    jobTitle: row.job_title ?? '',
    company: row.company ?? '',
    templateId: row.selected_template ?? null,
    letterLanguage: row.cover_letter_language ?? null,
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
