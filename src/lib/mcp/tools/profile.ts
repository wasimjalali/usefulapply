import { z } from 'zod';
import { ACCEPTED_CV_EXTENSIONS, hasCvParsingCapability } from '@/lib/cv-parser/parse-cv-core';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { checkToolRateLimit, consumeDailyQuota, refundDailyQuota } from '@/lib/mcp/quotas';
import { defineTool, ok, type AnyToolDefinition } from '@/lib/mcp/tools/framework';
import { ToolError } from '@/lib/mcp/tools/errors';
import {
  AVAILABILITY_CHOICES,
  AVAILABILITY_NOTE_MAX,
  SALARY_EXPECTATION_MAX,
  isAvailabilityChoice,
  normalizeLogisticsUpdate,
  type AvailabilityChoice,
  type LogisticsPatch,
} from '@/lib/profile/logistics';
import { deleteCvDocument, getCvDocument, parseAndSaveCv, type CvDocumentType } from '@/lib/services/documents';
import { InvalidInputError } from '@/lib/services/errors';
import {
  PhotoUnprocessableError,
  StorageQuotaError,
  hasProfilePhoto,
  removeProfilePhoto as removePhoto,
  prepareProfileWrite,
  replaceProfilePhoto,
  updateUserProfile,
  type UserEditableProfile,
} from '@/lib/services/profile';
import { FILE_BUCKET_LIMITS } from '@/storage/paths';
import { getProfile } from '@/db/repos/profiles';
import type { StructuredCV } from '@/lib/types/cv-schema';

const WRITE_DESTRUCTIVE = { readOnly: false, destructive: true, idempotent: false, openWorld: false } as const;
// Setting the same values twice leaves the same state.
const WRITE_DESTRUCTIVE_IDEMPOTENT = { readOnly: false, destructive: true, idempotent: true, openWorld: false } as const;

/** Same ceiling as the direct upload in /api/parse-cv. */
const MAX_CV_UPLOAD_BYTES = 4.5 * 1024 * 1024;
const MAX_CV_TEXT_CHARS = 200_000;
/** Base64 is 4 characters per 3 bytes. */
const base64Chars = (bytes: number) => Math.ceil(bytes / 3) * 4;

const cvTarget = z.enum(['primary', 'master']).describe("Which CV: 'primary' is the user's main CV, 'master' is the longer record of everything they have done.");
const DOC_TYPE: Record<'primary' | 'master', CvDocumentType> = { primary: 'primary_cv', master: 'master_cv' };

const BASE64_PATTERN = /^[A-Za-z0-9+/\s]*={0,2}\s*$/;

function decodeBase64(value: string, maxBytes: number): Buffer {
  if (!BASE64_PATTERN.test(value)) throw new InvalidInputError('The file is not valid base64');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0) throw new InvalidInputError('The file is empty');
  if (bytes.length > maxBytes) throw new InvalidInputError(`The file is larger than ${Math.round((maxBytes / 1024 / 1024) * 10) / 10} MB`);
  return bytes;
}

const CV_MIME_TYPES = new Set([...FILE_BUCKET_LIMITS['cv-files'].types, 'application/octet-stream']);

// ---------------------------------------------------------------------------
// save_cv
// ---------------------------------------------------------------------------

const saveCv = defineTool({
  name: 'save_cv',
  title: 'Save CV',
  description:
    "Parses a CV from plain text or an uploaded file (PDF, DOCX, TXT or MD) and saves it as the user's primary or master CV, replacing the one of that type if there is one. Costs no credits and has a daily limit. Returns the name and a count of the sections found.",
  hints: WRITE_DESTRUCTIVE,
  input: z.object({
    target: cvTarget,
    text: z.string().min(1).max(MAX_CV_TEXT_CHARS).optional().describe('The CV as plain text. Give either text or file.'),
    file: z
      .object({
        base64: z.string().min(1).max(base64Chars(MAX_CV_UPLOAD_BYTES) + 8).describe('The file bytes, base64 encoded. At most 4.5 MB once decoded.'),
        filename: z.string().min(1).max(200).describe('File name with its extension: .pdf, .docx, .txt or .md.'),
        mimeType: z.string().max(100).describe('The MIME type, for example application/pdf.'),
      })
      .optional()
      .describe('The CV as a file. Give either text or file.'),
  }),
  output: z.object({
    target: cvTarget,
    replacedExisting: z.boolean(),
    fileName: z.string(),
    name: z.string().nullable(),
    summaryPresent: z.boolean(),
    counts: z.object({
      experience: z.number(),
      education: z.number(),
      skillCategories: z.number(),
      certifications: z.number(),
      languages: z.number(),
      projects: z.number(),
      additionalSections: z.number(),
    }),
  }),
  async confirm({ target }, { userId }) {
    const existing = await getCvDocument(userId, DOC_TYPE[target]);
    return existing ? `Replace the saved ${target} CV (${existing.file_name}) with the new one?` : null;
  },
  async run({ target, text, file }, { userId }) {
    if ((text === undefined) === (file === undefined)) {
      throw new InvalidInputError('Give the CV as either text or file, not both');
    }
    await checkToolRateLimit('save_cv', userId);

    let fileName: string;
    let bytes: Buffer | undefined;
    if (file) {
      const ext = '.' + (file.filename.toLowerCase().split('.').pop() || '');
      if (!ACCEPTED_CV_EXTENSIONS.includes(ext) || ext === '.tex') {
        throw new InvalidInputError('Unsupported file type. Accepted formats: PDF, DOCX, TXT, MD.');
      }
      if (!CV_MIME_TYPES.has(file.mimeType.toLowerCase())) {
        throw new InvalidInputError('Unsupported file type. Accepted formats: PDF, DOCX, TXT, MD.');
      }
      fileName = file.filename.trim();
      bytes = decodeBase64(file.base64, MAX_CV_UPLOAD_BYTES);
    } else {
      fileName = 'cv.txt';
      if (Buffer.byteLength(text!, 'utf-8') > MAX_CV_UPLOAD_BYTES) throw new InvalidInputError('The text is larger than 4.5 MB');
      if (text!.trim().length === 0) throw new InvalidInputError('The text is empty');
    }
    if (!hasCvParsingCapability()) throw new ToolError('unavailable', 'CV parsing is unavailable right now. Try again later.');

    const type = DOC_TYPE[target];
    const existing = await getCvDocument(userId, type);
    await consumeDailyQuota('save_cv', userId);
    let saved;
    try {
      saved = await parseAndSaveCv(userId, { type, fileName, bytes, text: bytes ? undefined : text });
    } catch (error) {
      // The service rejects bad input before any model call runs, so that costs nothing.
      if (error instanceof InvalidInputError) await refundDailyQuota('save_cv', userId);
      throw error;
    }
    const cv: StructuredCV = saved.structuredCV;
    return ok({
      target,
      replacedExisting: existing !== null,
      fileName: saved.document.file_name,
      name: cv.personal?.fullName?.trim() || null,
      summaryPresent: Boolean(cv.summary?.trim()),
      counts: {
        experience: cv.experience?.length ?? 0,
        education: cv.education?.length ?? 0,
        skillCategories: cv.skills?.length ?? 0,
        certifications: cv.certifications?.length ?? 0,
        languages: cv.languages?.length ?? 0,
        projects: cv.projects?.length ?? 0,
        additionalSections: cv.additionalSections?.length ?? 0,
      },
    });
  },
});

// ---------------------------------------------------------------------------
// delete_cv
// ---------------------------------------------------------------------------

const deleteCv = defineTool({
  name: 'delete_cv',
  title: 'Delete CV',
  description: "Deletes the user's primary or master CV. Applications already created keep their own copies.",
  hints: WRITE_DESTRUCTIVE_IDEMPOTENT,
  input: z.object({ target: cvTarget }),
  output: z.object({ target: cvTarget, deleted: z.literal(true) }),
  async confirm({ target }, { userId }) {
    const existing = await getCvDocument(userId, DOC_TYPE[target]);
    return existing ? `Delete the saved ${target} CV (${existing.file_name})?` : null;
  },
  async run({ target }, { userId }) {
    await deleteCvDocument(userId, DOC_TYPE[target]);
    return ok({ target, deleted: true as const });
  },
});

// ---------------------------------------------------------------------------
// Profile photo
// ---------------------------------------------------------------------------

const PHOTO_EXTENSIONS: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_PHOTO_BYTES = FILE_BUCKET_LIMITS.avatars.maxBytes;

/** Same per-minute limit the web upload applies. */
async function checkPhotoRateLimit(userId: string): Promise<void> {
  const result = await checkRateLimit(`files-upload:${userId}`, RATE_LIMITS['files-upload']);
  if (!result.allowed) throw new ToolError('rate_limited', 'Too many uploads in a short time. Try again in a minute.');
}

const setProfilePhoto = defineTool({
  name: 'set_profile_photo',
  title: 'Set profile photo',
  description:
    "Sets the user's profile photo from a JPEG, PNG or WebP image, replacing the current one. The same photo appears on the account and in CV templates that show a photo. Returns whether a photo was replaced.",
  hints: WRITE_DESTRUCTIVE,
  input: z.object({
    file: z.object({
      base64: z.string().min(1).max(base64Chars(MAX_PHOTO_BYTES) + 8).describe('The image bytes, base64 encoded. At most 10 MB once decoded.'),
      mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    }),
  }),
  output: z.object({ set: z.literal(true), replacedExisting: z.boolean() }),
  async confirm(_args, { userId }) {
    return (await hasProfilePhoto(userId)) ? 'Replace the current profile photo with the new one?' : null;
  },
  async run({ file }, { userId }) {
    await checkPhotoRateLimit(userId);
    const bytes = decodeBase64(file.base64, MAX_PHOTO_BYTES);
    const ext = PHOTO_EXTENSIONS[file.mimeType];
    const upload = new File([new Uint8Array(bytes)], `photo${ext}`, { type: file.mimeType });
    const replacedExisting = await hasProfilePhoto(userId);
    try {
      await replaceProfilePhoto(userId, upload, ext);
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        throw new ToolError('storage_full', 'Storage limit reached. Delete some files to upload more.');
      }
      if (error instanceof PhotoUnprocessableError) {
        throw new ToolError('invalid_image', 'That image could not be processed. Try a JPEG or PNG.');
      }
      throw error;
    }
    return ok({ set: true as const, replacedExisting });
  },
});

const removeProfilePhoto = defineTool({
  name: 'remove_profile_photo',
  title: 'Remove profile photo',
  description: "Removes the user's profile photo from the account and from CV templates. Succeeds when there is no photo.",
  hints: WRITE_DESTRUCTIVE_IDEMPOTENT,
  input: z.object({}),
  output: z.object({ removed: z.literal(true), hadPhoto: z.boolean() }),
  async confirm(_args, { userId }) {
    return (await hasProfilePhoto(userId)) ? 'Remove the profile photo?' : null;
  },
  async run(_args, { userId }) {
    const hadPhoto = await hasProfilePhoto(userId);
    const fullyRemoved = await removePhoto(userId);
    if (!fullyRemoved) {
      throw new ToolError('partial_delete', 'The photo was unlinked but some files may remain. Run this again to finish removing it.');
    }
    return ok({ removed: true as const, hadPhoto });
  },
});

// ---------------------------------------------------------------------------
// update_profile
// ---------------------------------------------------------------------------

/** A link may be a bare domain, but never a script or data URL. */
const linkField = (what: string) =>
  z
    .string()
    .trim()
    .max(300)
    .refine((value) => !/^\s*(javascript|data|vbscript|file):/i.test(value), 'Not a web address')
    .nullable()
    .optional()
    .describe(`${what}. An empty string or null clears it; leave it out to keep the current value.`);

const textField = (what: string, max: number) =>
  z.string().trim().max(max).nullable().optional().describe(`${what}. An empty string or null clears it; leave it out to keep the current value.`);

const PROFILE_FIELDS = ['full_name', 'phone', 'location', 'linkedin_url', 'github_url', 'portfolio_url', 'website_url', 'date_of_birth', 'nationality'] as const;

/** [column, label used in the overwrite prompt] for the three start date and salary fields. */
const LOGISTICS_LABELS = [
  ['availability', 'start date'],
  ['availability_note', 'start date details'],
  ['salary_expectation', 'salary expectation'],
] as const;

/** Only the keys the caller gave, so a partial update leaves the others alone. */
function logisticsInputFrom(args: { availability?: AvailabilityChoice | null; availabilityNote?: string | null; salaryExpectation?: string | null }) {
  const given: { availability?: AvailabilityChoice | null; availabilityNote?: string | null; salaryExpectation?: string | null } = {};
  if (args.availability !== undefined) given.availability = args.availability;
  if (args.availabilityNote !== undefined) given.availabilityNote = args.availabilityNote;
  if (args.salaryExpectation !== undefined) given.salaryExpectation = args.salaryExpectation;
  return given;
}

const profileOutput = z.object({
  fullName: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  linkedinUrl: z.string().nullable(),
  githubUrl: z.string().nullable(),
  portfolioUrl: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  availability: z.enum(AVAILABILITY_CHOICES).nullable(),
  availabilityNote: z.string().nullable(),
  salaryExpectation: z.string().nullable(),
});

const updateProfile = defineTool({
  name: 'update_profile',
  title: 'Update profile',
  description:
    "Updates contact details the user's CV header and cover letter letterhead use. Also saves when the user can start and their salary expectation. Saving availability, even as null, records that the user was asked. A new start date (other than other) clears the old details unless new details are given. Only the fields given change. Returns the saved values.",
  hints: WRITE_DESTRUCTIVE_IDEMPOTENT,
  input: z.object({
    fullName: textField('Full name', 200),
    phone: textField('Phone number', 50),
    location: textField('City and country, for example Berlin, Germany', 200),
    linkedinUrl: linkField('LinkedIn profile address'),
    githubUrl: linkField('GitHub profile address'),
    portfolioUrl: linkField('Portfolio address'),
    websiteUrl: linkField('Personal website address'),
    dateOfBirth: textField('Date of birth, for CVs in markets that include it', 32),
    nationality: textField('Nationality, for CVs in markets that include it', 100),
    availability: z
      .enum(AVAILABILITY_CHOICES)
      .nullable()
      .optional()
      .describe(`When the user can start: ${AVAILABILITY_CHOICES.join(', ')}. Null clears it and records that the user was asked; leave it out to keep the current value.`),
    availabilityNote: textField('Details on the start date in the user\'s own words, for example "3 months to the end of the quarter"', AVAILABILITY_NOTE_MAX),
    salaryExpectation: textField('Salary expectation as the user states it, for example "65,000 EUR gross a year"', SALARY_EXPECTATION_MAX),
  }),
  output: profileOutput,
  async confirm(args, { userId }) {
    const profile = await getProfile(userId);
    if (!profile) return null;
    const given: Record<(typeof PROFILE_FIELDS)[number], string | null | undefined> = {
      full_name: args.fullName,
      phone: args.phone,
      location: args.location,
      linkedin_url: args.linkedinUrl,
      github_url: args.githubUrl,
      portfolio_url: args.portfolioUrl,
      website_url: args.websiteUrl,
      date_of_birth: args.dateOfBirth,
      nationality: args.nationality,
    };
    // Only a change to a value that is already saved overwrites anything.
    const overwritten = PROFILE_FIELDS.filter((key) => given[key] !== undefined && profile[key] && (given[key] || null) !== profile[key]);
    // Start date, details and salary: the write the service would make (a new choice clears the old
    // note), compared with what is saved. Clearing a saved value counts as overwriting it.
    const logisticsWrite = prepareProfileWrite(userId, logisticsInputFrom(args));
    const logisticsChanged = LOGISTICS_LABELS.filter(([column]) => {
      const saved = profile[column] ?? null;
      return column in logisticsWrite && saved !== null && (logisticsWrite[column] ?? null) !== saved;
    }).map(([, label]) => label);
    if (overwritten.length === 0 && logisticsChanged.length === 0) return null;
    const parts: string[] = [];
    if (overwritten.length > 0) parts.push(`${overwritten.length} saved contact detail${overwritten.length === 1 ? '' : 's'}`);
    if (logisticsChanged.length > 0) parts.push(`the saved ${logisticsChanged.join(' and ')}`);
    return `Overwrite ${parts.join(' and ')} on the profile?`;
  },
  async run(args, { userId }) {
    const updates: Partial<UserEditableProfile> & LogisticsPatch = {};
    const assign = (key: (typeof PROFILE_FIELDS)[number], value: string | null | undefined) => {
      if (value !== undefined) updates[key] = value === '' ? null : value;
    };
    assign('full_name', args.fullName);
    assign('phone', args.phone);
    assign('location', args.location);
    assign('linkedin_url', args.linkedinUrl);
    assign('github_url', args.githubUrl);
    assign('portfolio_url', args.portfolioUrl);
    assign('website_url', args.websiteUrl);
    assign('date_of_birth', args.dateOfBirth);
    assign('nationality', args.nationality);
    Object.assign(updates, normalizeLogisticsUpdate(logisticsInputFrom(args)));
    if (Object.keys(updates).length === 0) throw new InvalidInputError('Give at least one field to update');
    const profile = await updateUserProfile(userId, updates);
    return ok({
      fullName: profile.full_name,
      phone: profile.phone,
      location: profile.location,
      linkedinUrl: profile.linkedin_url,
      githubUrl: profile.github_url,
      portfolioUrl: profile.portfolio_url,
      websiteUrl: profile.website_url,
      dateOfBirth: profile.date_of_birth,
      nationality: profile.nationality,
      availability: isAvailabilityChoice(profile.availability) ? profile.availability : null,
      availabilityNote: profile.availability_note,
      salaryExpectation: profile.salary_expectation,
    });
  },
});

// ---------------------------------------------------------------------------
// update_notification_settings
// ---------------------------------------------------------------------------

const switchField = (what: string) => z.boolean().optional().describe(`${what}. Leave it out to keep the current value.`);

const notificationOutput = z.object({
  marketing: z.boolean(),
  followUpDue: z.boolean(),
  interviewTomorrow: z.boolean(),
  creditsLow: z.boolean(),
});

const updateNotificationSettings = defineTool({
  name: 'update_notification_settings',
  title: 'Update notification settings',
  description: 'Turns email notifications on or off. Only the settings given change. Returns all notification settings as saved.',
  hints: WRITE_DESTRUCTIVE_IDEMPOTENT,
  input: z.object({
    marketing: switchField('Product news and offers by email'),
    followUpDue: switchField('Email when a follow-up on an application is due'),
    interviewTomorrow: switchField('Email the day before an interview'),
    creditsLow: switchField('Email when credits are running low'),
  }),
  output: notificationOutput,
  async run(args, { userId }) {
    const updates: Partial<UserEditableProfile> = {};
    if (args.marketing !== undefined) updates.notify_marketing = args.marketing;
    if (args.followUpDue !== undefined) updates.notify_follow_up_due = args.followUpDue;
    if (args.interviewTomorrow !== undefined) updates.notify_interview_tomorrow = args.interviewTomorrow;
    if (args.creditsLow !== undefined) updates.notify_credits_low = args.creditsLow;
    if (Object.keys(updates).length === 0) throw new InvalidInputError('Give at least one setting to change');
    const profile = await updateUserProfile(userId, updates);
    return ok({
      marketing: profile.notify_marketing,
      followUpDue: profile.notify_follow_up_due,
      interviewTomorrow: profile.notify_interview_tomorrow,
      creditsLow: profile.notify_credits_low,
    });
  },
});

export const profileTools: AnyToolDefinition[] = [
  saveCv,
  deleteCv,
  setProfilePhoto,
  removeProfilePhoto,
  updateProfile,
  updateNotificationSettings,
];
