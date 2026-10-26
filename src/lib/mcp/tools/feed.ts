import { z } from 'zod';
import { getSettings } from '@/db/repos/jobFeed';
import { getProfile } from '@/db/repos/profiles';
import { profileGaps } from '@/lib/profile/logistics';
import { START_DATE_NOTE, profileGapsSchema } from '@/lib/mcp/tools/spend';
import { CREDIT_COSTS } from '@/lib/credit-costs';
import {
  JOB_FEED_COUNTRY_OPTIONS,
  JOB_FEED_EMPLOYMENT_TYPE_OPTIONS,
  JOB_FEED_REMOTE_PREFERENCE_OPTIONS,
  JOB_FEED_SENIORITY_OPTIONS,
  JOB_FEED_TIER_LIMITS,
  getJobFeedTierLimits,
} from '@/lib/job-feed/constants';
import { toJobFeedInput } from '@/lib/job-feed/helpers';
import { splitCompositeRole } from '@/lib/job-feed/cv-experience';
import type { JobFeedFeedItem } from '@/lib/job-feed/types';
import { getJobFeedFeedbackAdmin } from '@/lib/job-feed/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { defineTool, ok, type AnyToolDefinition } from '@/lib/mcp/tools/framework';
import { ToolError } from '@/lib/mcp/tools/errors';
import {
  UNTRUSTED_NOTE,
  creditsSnapshot,
  idempotencyKeyField,
  mcpSpendLimit,
  waitForOperation,
  waitSecondsField,
  wrapLong,
  wrapLine,
  wrapShort,
  wrapUrl,
} from '@/lib/mcp/tools/shared';
import { requireFeedEditor, requireFeedViewer } from '@/lib/services/feed/access';
import { applyToFeedJob } from '@/lib/services/feed/apply';
import { generateCareerProfileForUser, readCareerProfile, readSearchStrategy } from '@/lib/services/feed/career-profile';
import type { CareerProfile } from '@/lib/job-feed/career-profile';
import { FeedError } from '@/lib/services/feed/errors';
import { recordFeedFeedback } from '@/lib/services/feed/feedback';
import { loadInboxPage, loadSavedJobs } from '@/lib/services/feed/inbox';
import { explainFeedRunBlocker, queueFeedRun } from '@/lib/services/feed/run';
import {
  changedFeedSettingFields,
  loadFeedSettings,
  updateFeedSettingsPartial,
  withdrawFeedConsent,
  type FeedSettingsPatch,
} from '@/lib/services/feed/settings';
import type { JobFeedSettings } from '@/db/types';

const READ_HINTS = { readOnly: true, destructive: false, idempotent: true, openWorld: false } as const;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** What a refusal from the feed services says to an agent, where the web copy would point at a screen the agent cannot use. */
const FEED_MESSAGES: Record<string, string> = {
  consent_required: 'The feed has no consent on file. The account owner gives it in the Job Feed settings of the web app.',
  profile_not_ready: 'The career profile is not ready yet. Try again in a few seconds.',
};

/** A refusal becomes a short message. A server fault (status 500 and up) stays an internal error: logged, and shown as the generic line. */
async function feedCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof FeedError && error.status < 500) {
      throw new ToolError(error.code, FEED_MESSAGES[error.code] ?? error.message);
    }
    throw error;
  }
}

/** The per-user ceiling the web route enforces, under the same key so the two channels share one budget. */
async function withinRateLimit(key: string, config: (typeof RATE_LIMITS)[keyof typeof RATE_LIMITS]): Promise<void> {
  const { allowed } = await checkRateLimit(key, config);
  if (!allowed) throw new ToolError('rate_limited', 'Too many requests. Try again in a minute.');
}

// ---------------------------------------------------------------------------
// get_job_feed
// ---------------------------------------------------------------------------

const feedItemSchema = z.object({
  jobId: z.string(),
  title: z.string(),
  company: z.string(),
  location: z.string().nullable(),
  workMode: z.string().nullable(),
  employmentType: z.string().nullable(),
  salaryText: z.string().nullable(),
  postedAtText: z.string().nullable(),
  via: z.string().nullable(),
  applyUrl: z.string().nullable(),
  fitLabel: z.enum(['strong', 'good']).nullable(),
  matchReason: z.string().nullable(),
  saved: z.boolean(),
  savedAt: z.string().nullable(),
  matchRating: z.enum(['helpful', 'not_relevant']).nullable(),
  applicationId: z.string().nullable(),
  generationStatus: z.string(),
  description: z.string().nullable().optional(),
  descriptionComplete: z.boolean().optional(),
  highlights: z.array(z.object({ title: z.string(), items: z.array(z.string()) })).optional(),
  sourceUrl: z.string().nullable().optional(),
  applyOptions: z.array(z.object({ title: z.string(), link: z.string() })).optional(),
});

function wrapOrNull(value: string | null | undefined, cap?: number): string | null {
  return value ? wrapLong(value, cap) : null;
}

/**
 * About how much description text one get_job_feed call returns. A description is never cut: a page with
 * `full` stops before the job that would pass this (the first job always fits) and says where to go on.
 */
const DESCRIPTION_BUDGET = 40_000;

/** The views of `items` that fit one page, and how many of them there are. */
function fitPage(items: JobFeedFeedItem[], detail: 'concise' | 'full'): z.infer<typeof feedItemSchema>[] {
  const views: z.infer<typeof feedItemSchema>[] = [];
  let used = 0;
  for (const item of items) {
    const view = toFeedItemView(item, detail);
    const size = (view.description?.length ?? 0) + JSON.stringify(view.highlights ?? []).length;
    if (detail === 'full' && views.length > 0 && used + size > DESCRIPTION_BUDGET) break;
    used += size;
    views.push(view);
  }
  return views;
}

function toFeedItemView(item: JobFeedFeedItem, detail: 'concise' | 'full'): z.infer<typeof feedItemSchema> {
  const view: z.infer<typeof feedItemSchema> = {
    jobId: item.id,
    // Every text whole, as the links are: wrapLine flattens and neutralizes like wrapShort without its 80-character cut.
    title: wrapLine(item.title),
    company: wrapLine(item.company),
    location: item.location ? wrapLine(item.location) : null,
    workMode: item.workMode ?? null,
    employmentType: item.employmentType ?? null,
    salaryText: item.salaryText ? wrapLine(item.salaryText) : null,
    postedAtText: item.postedAtText ? wrapLine(item.postedAtText) : null,
    via: item.via ? wrapLine(item.via) : null,
    applyUrl: wrapUrl(item.applyUrl),
    fitLabel: item.fitLabel,
    matchReason: wrapOrNull(item.matchReason, Number.POSITIVE_INFINITY),
    saved: Boolean(item.feedback.savedAt),
    savedAt: item.feedback.savedAt,
    matchRating: item.feedback.matchRating,
    applicationId: item.feedback.applicationSessionId,
    generationStatus: item.feedback.generationStatus,
  };
  if (detail === 'full') {
    view.description = wrapOrNull(item.description, Number.POSITIVE_INFINITY);
    view.descriptionComplete = item.descriptionComplete;
    view.highlights = item.highlights.map((highlight) => ({
      title: wrapLine(highlight.title),
      items: highlight.items.map((entry) => wrapLine(entry)),
    }));
    view.sourceUrl = wrapUrl(item.sourceUrl);
    view.applyOptions = item.applyOptions.flatMap((option) => {
      const link = wrapUrl(option.link);
      return link ? [{ title: wrapLine(option.title), link }] : [];
    });
  }
  return view;
}

const getJobFeed = defineTool({
  name: 'get_job_feed',
  title: 'Get job feed',
  description: `Returns a page of jobs from the user's job feed: the ranked inbox from the last 7 days, or the jobs they saved. Each job has a jobId, which other feed tools take. ${UNTRUSTED_NOTE}`,
  hints: READ_HINTS,
  input: z.object({
    view: z.enum(['inbox', 'saved']).describe('inbox is the ranked feed of the last 7 days. saved is the bookmarked jobs, newest first.'),
    offset: z.number().int().min(0).max(10_000).optional().describe('Jobs to skip. Defaults to 0.'),
    limit: z.number().int().min(1).max(50).optional().describe('Jobs to return, 1 to 50. Defaults to 10.'),
    detail: z.enum(['concise', 'full']).optional().describe('concise (the default) leaves out the job description. full adds the whole description, highlights and apply links. Descriptions are never cut: a full page holds about 40,000 characters of them and may return fewer jobs than the limit; read on from nextOffset.'),
  }),
  output: z.object({
    view: z.enum(['inbox', 'saved']),
    items: z.array(feedItemSchema),
    totalCount: z.number(),
    hasMore: z.boolean(),
    offset: z.number(),
    limit: z.number(),
    /** The offset of the next page, or null when this page reached the end. */
    nextOffset: z.number().nullable(),
  }),
  async run({ view, offset = 0, limit = 10, detail = 'concise' }, { userId }) {
    return feedCall(async () => {
      if (view === 'inbox') {
        await withinRateLimit(`job-feed-inbox:${userId}`, RATE_LIMITS['job-feed-inbox']);
        const page = await loadInboxPage(userId, offset, limit);
        const items = fitPage(page.items, detail);
        const hasMore = page.hasMore || items.length < page.items.length;
        return ok({
          view,
          items,
          totalCount: page.totalCount,
          hasMore,
          offset: page.offset,
          limit: page.limit,
          nextOffset: hasMore ? page.offset + items.length : null,
        });
      }
      await withinRateLimit(`job-feed-saved:${userId}`, RATE_LIMITS['job-feed-saved']);
      const saved = await loadSavedJobs(userId);
      const items = fitPage(saved.slice(offset, offset + limit), detail);
      const hasMore = offset + items.length < saved.length;
      return ok({
        view,
        items,
        totalCount: saved.length,
        hasMore,
        offset,
        limit,
        nextOffset: hasMore ? offset + items.length : null,
      });
    });
  },
});

// ---------------------------------------------------------------------------
// get_feed_settings, update_feed_settings
// ---------------------------------------------------------------------------

const settingsSchema = z.object({
  automationEnabled: z.boolean(),
  timezone: z.string(),
  countries: z.array(z.string()),
  cities: z.array(z.string()),
  roles: z.array(z.string()),
  workModes: z.array(z.string()),
  employmentTypes: z.array(z.string()),
  salaryFloor: z.number().nullable(),
  seniority: z.array(z.string()),
  languages: z.array(z.string()),
  workAuthorization: z.string().nullable(),
  excludedTerms: z.array(z.string()),
});

function toSettingsView(settings: JobFeedSettings): z.infer<typeof settingsSchema> {
  const input = toJobFeedInput(settings);
  return {
    automationEnabled: input.enabled,
    timezone: input.user_timezone,
    countries: input.target_countries,
    cities: input.target_cities,
    roles: input.target_roles,
    workModes: input.remote_preferences,
    employmentTypes: input.employment_types,
    salaryFloor: input.salary_floor,
    seniority: input.seniority_targets,
    languages: input.languages,
    workAuthorization: input.work_authorization_status,
    excludedTerms: input.excluded_terms,
  };
}

const getFeedSettings = defineTool({
  name: 'get_feed_settings',
  title: 'Get feed settings',
  description:
    "Returns the user's job feed settings: roles, countries, cities, work modes, salary floor, seniority, languages, excluded terms, whether the feed is switched on (it never runs by itself), the timezone, and whether consent for the feed is on file.",
  hints: READ_HINTS,
  input: z.object({}),
  output: z.object({
    configured: z.boolean(),
    canEdit: z.boolean(),
    consent: z.object({ given: z.boolean(), acceptedAt: z.string().nullable() }),
    /** Send it with update_feed_settings. Null before the feed is set up. */
    revision: z.number().nullable(),
    settings: settingsSchema.nullable(),
  }),
  async run(_args, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-overview:${userId}`, RATE_LIMITS['job-feed-overview']);
      const { settings, canEdit } = await loadFeedSettings(userId);
      return ok({
        configured: settings !== null,
        canEdit,
        consent: { given: Boolean(settings?.consent_accepted_at), acceptedAt: settings?.consent_accepted_at ?? null },
        revision: settings ? settings.revision : null,
        settings: settings ? toSettingsView(settings) : null,
      });
    });
  },
});

const COUNTRY_CODES = JOB_FEED_COUNTRY_OPTIONS.map((option) => option.value) as [string, ...string[]];
const WORK_MODES = JOB_FEED_REMOTE_PREFERENCE_OPTIONS.map((option) => option.value) as [string, ...string[]];
const EMPLOYMENT_TYPES = JOB_FEED_EMPLOYMENT_TYPE_OPTIONS.map((option) => option.value) as [string, ...string[]];
const SENIORITY = JOB_FEED_SENIORITY_OPTIONS.map((option) => option.value) as [string, ...string[]];
/** The most searches any plan runs in one run; the tool checks the user's own plan. */
const SEARCHES_PER_RUN_MAX = Math.max(...Object.values(JOB_FEED_TIER_LIMITS).map((limits) => limits.maxMainQueries));

const updateFeedSettings = defineTool({
  name: 'update_feed_settings',
  title: 'Update feed settings',
  description:
    'Changes the given job feed settings and leaves the others as saved. Returns the settings after the change and, when the roles or countries changed, the role and country searches the next feed run will make.',
  hints: { readOnly: false, destructive: true, idempotent: true, openWorld: false },
  input: z.object({
    revision: z.number().int().min(0)
      .describe('The revision from get_feed_settings (0 before the feed is set up). If the settings changed since, in the web app or another call, nothing is changed and the call fails: read them again and send the new revision.'),
    roles: z.array(z.string().trim().min(1).max(80)).min(1).max(50).optional()
      .describe('Job titles to search for. The search list holds a limited number of role and country searches (searchLimit), so fewer roles may be kept than sent: droppedRoles and warning in the result name any left out.'),
    countries: z.array(z.enum(COUNTRY_CODES)).min(1).max(12).optional()
      .describe(`Countries to search, as two-letter codes: ${COUNTRY_CODES.join(', ')}.`),
    workModes: z.array(z.enum(WORK_MODES)).min(1).max(5).optional()
      .describe(`Work arrangements to include: ${WORK_MODES.join(', ')}.`),
    employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)).min(1).max(5).optional()
      .describe(`Employment types to include: ${EMPLOYMENT_TYPES.join(', ')}. Roles of other types are filtered out of future feed runs.`),
    salaryFloor: z.number().int().min(0).max(10_000_000).nullable().optional()
      .describe('Minimum salary as a whole number in the local currency. null removes the floor.'),
    automationEnabled: z.boolean().optional()
      .describe('Whether the feed is switched on. It never runs by itself: when on, the user in the web app or run_job_feed starts runs, as many completed runs a day as the plan allows. Turning it on needs consent already on file.'),
    timezone: z.string().trim().min(1).max(80).optional()
      .describe('IANA timezone name, for example Europe/Berlin. The day the plan\'s runs a day count in follows this timezone.'),
    seniority: z.array(z.enum(SENIORITY)).max(SENIORITY.length).optional()
      .describe(`Levels to keep: ${SENIORITY.join(', ')}. A job whose ad is only for other levels is left out of the feed; an ad that does not say is kept. An empty list keeps every level.`),
    excludedTerms: z.array(z.string().trim().min(1).max(80)).max(20).optional()
      .describe('Words to avoid: titles, companies or keywords the user never wants to see, for example "Sales" or a staffing agency. Up to 20. An empty list clears them.'),
    cities: z.array(z.string().trim().min(1).max(80)).max(20).optional()
      .describe('Cities to search in, for example Berlin. A city named for the first time adds its country to the countries. Up to 20. An empty list clears them.'),
    languages: z.array(z.string().trim().min(1).max(40)).min(1).max(8).optional()
      .describe('Languages the user works in, as names, for example English, German. The ranking keeps ads written in or asking for these.'),
    workAuthorization: z.enum(['authorized', 'needs_sponsorship', 'open_to_both']).optional()
      .describe('authorized: may work in the target countries. needs_sponsorship: needs a visa sponsor; ads that rule sponsorship out are left out. open_to_both (the default): sponsorship plays no part.'),
  }),
  output: z.object({
    changed: z.array(z.string()),
    /** The revision after this call; send it with the next update. */
    revision: z.number(),
    settings: settingsSchema,
    searches: z.array(z.object({ role: z.string(), country: z.string() })).nullable(),
    searchLimit: z.number().nullable(),
    /** Roles sent that did not fit the search list. */
    droppedRoles: z.array(z.string()),
    warning: z.string().nullable(),
  }),
  async confirm(args, { userId }) {
    return feedCall(async () => {
      const { settings, searchLimit } = await loadFeedSettings(userId);
      const changed = changedFeedSettingFields(settings, toPatch(args), searchLimit);
      if (changed.length === 0) return null;
      return `Change the job feed settings (${changed.join(', ')})? The new values replace the saved ones.`;
    });
  },
  async run(args, { userId }) {
    const patch = toPatch(args);
    if (Object.keys(patch).length === 0) throw new ToolError('invalid_input', 'Send at least one setting to change.');
    return feedCall(async () => {
      await withinRateLimit(`job-feed-settings:${userId}`, RATE_LIMITS['job-feed-settings']);
      const { settings: before, searchLimit } = await loadFeedSettings(userId);
      const changed = changedFeedSettingFields(before, patch, searchLimit);
      if (before && changed.length === 0) {
        const droppedRoles = rolesNotKept(patch.roles ?? [], before.target_roles);
        return ok({ changed, revision: before.revision, settings: toSettingsView(before), searches: null, searchLimit: null, droppedRoles, warning: droppedWarning(droppedRoles, searchLimit) });
      }
      const saved = await updateFeedSettingsPartial({ userId, patch, clientRequestId: null, expectedRevision: args.revision });
      const droppedRoles = rolesNotKept(patch.roles ?? [], saved.settings.target_roles);
      return ok({
        changed,
        revision: saved.settings.revision,
        settings: toSettingsView(saved.settings),
        searches: saved.searches ? saved.searches.map((row) => ({ role: row.query, country: row.targetCountry })) : null,
        searchLimit: saved.searchLimit,
        droppedRoles,
        warning: droppedWarning(droppedRoles, saved.searchLimit),
      });
    });
  },
});

/**
 * The roles sent that were not saved. A save splits a composite role ("AI Engineer | PM") into its parts, so
 * a composite role reports each part that was left out ("PM" when only "AI Engineer" fit).
 */
function rolesNotKept(sent: string[], saved: string[]): string[] {
  const key = (role: string) => role.trim().toLowerCase().slice(0, 80);
  const kept = new Set(saved.map(key));
  return sent.flatMap((role) => {
    if (kept.has(key(role))) return [];
    const parts = splitCompositeRole(role);
    return parts.length === 0 ? [role] : parts.filter((part) => !kept.has(key(part)));
  });
}

/** Why roles were left out, in a sentence an agent can pass on. Null when none were. */
function droppedWarning(droppedRoles: string[], searchLimit: number): string | null {
  if (droppedRoles.length === 0) return null;
  return `${droppedRoles.length} of the roles sent did not fit: the search list holds ${searchLimit} role and country searches on this plan. Not saved: ${droppedRoles.join(', ')}. Send fewer roles or countries, or set the searches with update_feed_searches.`;
}

function toPatch(args: {
  revision?: number;
  roles?: string[];
  countries?: string[];
  workModes?: string[];
  employmentTypes?: string[];
  salaryFloor?: number | null;
  automationEnabled?: boolean;
  timezone?: string;
  seniority?: string[];
  excludedTerms?: string[];
  cities?: string[];
  languages?: string[];
  workAuthorization?: 'authorized' | 'needs_sponsorship' | 'open_to_both';
}): FeedSettingsPatch {
  const patch: FeedSettingsPatch = {};
  if (args.roles !== undefined) patch.roles = args.roles;
  if (args.countries !== undefined) patch.countries = args.countries;
  if (args.workModes !== undefined) patch.workModes = args.workModes;
  if (args.employmentTypes !== undefined) patch.employmentTypes = args.employmentTypes;
  if (args.salaryFloor !== undefined) patch.salaryFloor = args.salaryFloor;
  if (args.automationEnabled !== undefined) patch.automationEnabled = args.automationEnabled;
  if (args.timezone !== undefined) patch.timezone = args.timezone;
  if (args.seniority !== undefined) patch.seniority = [...new Set(args.seniority)];
  if (args.excludedTerms !== undefined) patch.excludedTerms = dedupeCaseless(args.excludedTerms);
  if (args.cities !== undefined) patch.cities = dedupeCaseless(args.cities);
  if (args.languages !== undefined) patch.languages = dedupeCaseless(args.languages);
  if (args.workAuthorization !== undefined) patch.workAuthorization = args.workAuthorization;
  return patch;
}

/** The first spelling of each value, compared without case. */
function dedupeCaseless(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// get_career_profile
// ---------------------------------------------------------------------------

const skillClusterSchema = z.object({ name: z.string(), skills: z.array(z.string()) });

const careerProfileSchema = z.object({
  function: z.string(),
  seniority: z.object({ level: z.string(), confidence: z.string() }),
  yearsTotal: z.number(),
  yearsInFunction: z.number(),
  inferredTitles: z.array(z.object({ title: z.string(), confidence: z.string() })),
  aspirationalTitles: z.array(z.string()),
  pivot: z.object({ from: z.string(), to: z.string() }).nullable(),
  primarySkills: z.array(skillClusterSchema),
  secondarySkills: z.array(skillClusterSchema),
  industries: z.array(z.string()),
  tools: z.array(z.string()),
  workingLanguages: z.array(z.string()),
  narrative: z.string(),
});

function toCareerProfileView(profile: CareerProfile): z.infer<typeof careerProfileSchema> {
  return {
    function: profile.function,
    seniority: { level: profile.seniority.level, confidence: profile.seniority.confidence },
    yearsTotal: profile.yearsTotal,
    yearsInFunction: profile.yearsInFunction,
    inferredTitles: profile.inferredTitles.map((title) => ({ title: title.canonical, confidence: title.confidence })),
    aspirationalTitles: profile.targetDirection.aspirationalTitles,
    pivot: profile.targetDirection.pivot ? { from: profile.targetDirection.pivot.from, to: profile.targetDirection.pivot.to } : null,
    primarySkills: profile.primarySkillClusters.map((cluster) => ({ name: cluster.name, skills: cluster.skills })),
    secondarySkills: profile.secondarySkillClusters.map((cluster) => ({ name: cluster.name, skills: cluster.skills })),
    industries: profile.industryDomains,
    tools: profile.toolsEnvironment,
    workingLanguages: profile.workingLanguages,
    narrative: profile.narrative,
  };
}

const getCareerProfile = defineTool({
  name: 'get_career_profile',
  title: 'Get career profile',
  description:
    "Returns the career profile the job feed derives from the user's CV (titles, seniority, skills, direction) and the search strategy it currently runs. Never generates either one: regenerate_career_profile reads the CV again, and update_feed_searches changes the searches.",
  hints: READ_HINTS,
  input: z.object({}),
  output: z.object({
    status: z.enum(['ok', 'no_cv', 'no_profile']),
    generatedAt: z.string().nullable(),
    cvNewerThanProfile: z.boolean(),
    profile: careerProfileSchema.nullable(),
    searchStrategy: z.object({
      status: z.enum(['ok', 'no_profile', 'profile_only', 'no_settings', 'no_countries']),
      generatedAt: z.string().nullable(),
      userConfirmed: z.boolean(),
      profileNewerThanStrategy: z.boolean(),
      queries: z.array(z.object({
        query: z.string(),
        targetCountry: z.string(),
        type: z.string(),
        expectedRecall: z.string(),
      })),
      negativeTerms: z.array(z.string()),
    }),
  }),
  async run(_args, { userId }) {
    return feedCall(async () => {
      await requireFeedViewer(userId);
      await withinRateLimit(`career-profile:${userId}`, RATE_LIMITS['job-feed-settings']);
      const [career, strategy] = await Promise.all([readCareerProfile(userId), readSearchStrategy(userId)]);
      const profile = career.profile;
      return ok({
        status: career.status,
        generatedAt: career.generatedAt,
        cvNewerThanProfile: career.cvNewerThanProfile,
        profile: profile ? toCareerProfileView(profile) : null,
        searchStrategy: {
          status: strategy.status,
          generatedAt: strategy.generatedAt,
          userConfirmed: strategy.strategy?.userConfirmed === true,
          profileNewerThanStrategy: strategy.profileNewerThanStrategy,
          queries: (strategy.strategy?.queries ?? []).map((query) => ({
            query: query.query,
            targetCountry: query.targetCountry,
            type: query.type,
            expectedRecall: query.expectedRecall,
          })),
          negativeTerms: strategy.strategy?.negativeTerms ?? [],
        },
      });
    });
  },
});

// ---------------------------------------------------------------------------
// regenerate_career_profile, update_feed_searches
// ---------------------------------------------------------------------------

const regenerateCareerProfile = defineTool({
  name: 'regenerate_career_profile',
  title: 'Regenerate career profile',
  description:
    "Reads the user's primary CV again and replaces the career profile the job feed derives from it (titles, seniority estimate, years, skills). Costs no credits. A changed CV is always read. An unchanged CV read in the last 5 minutes returns the stored profile as it is (regenerated false). The feed settings stay as saved: the seniority estimate never overrides the levels in the settings, which update_feed_settings changes.",
  hints: { readOnly: false, destructive: false, idempotent: false, openWorld: false },
  input: z.object({}),
  output: z.object({
    status: z.enum(['ok', 'no_cv']),
    /** False when the CV is unchanged and was read in the last 5 minutes: the stored profile is returned as it is. */
    regenerated: z.boolean(),
    generatedAt: z.string().nullable(),
    profile: careerProfileSchema.nullable(),
  }),
  async run(_args, { userId }) {
    return feedCall(async () => {
      await requireFeedEditor(userId);
      await withinRateLimit(`career-profile-generate:${userId}`, RATE_LIMITS['career-profile-generate']);
      const result = await generateCareerProfileForUser({ userId, force: true, clientRequestId: null, route: 'mcp:regenerate_career_profile' });
      if (result.status === 'no_cv' || !result.profile) {
        return ok({ status: 'no_cv' as const, regenerated: false, generatedAt: null, profile: null });
      }
      return ok({ status: 'ok' as const, regenerated: result.regenerated, generatedAt: result.generatedAt, profile: toCareerProfileView(result.profile) });
    });
  },
});

const updateFeedSearches = defineTool({
  name: 'update_feed_searches',
  title: 'Update feed searches',
  description:
    'Replaces the list of searches the job feed runs, in order: each is a role keyword and a country. The roles become the searched roles, and a country a search names joins the countries. Returns the searches saved. get_career_profile shows the current list.',
  hints: { readOnly: false, destructive: true, idempotent: true, openWorld: false },
  input: z.object({
    revision: z.number().int().min(0)
      .describe('The revision from get_feed_settings. If the settings changed since, nothing is changed and the call fails: read them again and send the new revision.'),
    searches: z.array(z.object({
      query: z.string().trim().min(1).max(80).describe('A role keyword, for example "Applied AI Engineer". Use the language ads in that country are written in when it differs.'),
      country: z.enum(COUNTRY_CODES).describe('Two-letter country code.'),
    })).min(1).max(50)
      .describe('The searches, best first. Each run makes a limited number of searches (searchLimit in the result); a longer list is refused.'),
  }),
  output: z.object({
    revision: z.number(),
    searches: z.array(z.object({ query: z.string(), country: z.string() })),
    roles: z.array(z.string()),
    countries: z.array(z.string()),
    searchLimit: z.number(),
  }),
  confirm({ searches }) {
    return `Replace the feed's searches with these ${searches.length}? The roles saved follow them.`;
  },
  async run({ revision, searches }, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-settings:${userId}`, RATE_LIMITS['job-feed-settings']);
      const saved = await updateFeedSettingsPartial({ userId, patch: { searches }, clientRequestId: null, expectedRevision: revision });
      return ok({
        revision: saved.settings.revision,
        searches: (saved.searches ?? []).map((row) => ({ query: row.query, country: row.targetCountry })),
        roles: saved.settings.target_roles,
        countries: saved.settings.target_countries,
        searchLimit: saved.searchLimit,
      });
    });
  },
});

// ---------------------------------------------------------------------------
// run_job_feed
// ---------------------------------------------------------------------------

const runJobFeed = defineTool({
  name: 'run_job_feed',
  title: 'Run job feed',
  description:
    "Queues a job search for the user and returns at once with a runId and its status: queued or running while it is in progress, completed or failed once it ended. The search runs in the background, usually within a couple of minutes, and the jobs it finds appear in get_job_feed when the run completes. It searches the saved search list, or the queries sent, through the same filtering and ranking as every run. Nothing runs on a schedule: this call, or the user in the web app, starts a run. The plan, or an account's own setting, sets how many completed runs a day are allowed (runsPerDay; a failed run can be started again), and it needs consent on file.",
  hints: { readOnly: false, destructive: false, idempotent: true, openWorld: true },
  input: z.object({
    queries: z.array(z.object({
      query: z.string().trim().min(1).max(80).describe('A role keyword, for example "Applied AI Engineer", in the language ads in that country use.'),
      country: z.enum(COUNTRY_CODES).describe('Two-letter country code.'),
    })).min(1).max(SEARCHES_PER_RUN_MAX).optional()
      .describe("This run's own searches instead of the saved search list, for example to try another title. Up to the plan's searches per run; the saved settings and list stay as they are. Without it the run searches the next part of the saved list."),
  }),
  output: z.object({
    runId: z.string().nullable(),
    status: z.string().nullable(),
    localDate: z.string().nullable(),
    /** True when this call queued the run. False when today's run was already queued, running or done. */
    started: z.boolean(),
    alreadyRanToday: z.boolean(),
    nextRunAt: z.string().nullable(),
    rawJobsFetched: z.number().nullable(),
    jobsAfterPrefilter: z.number().nullable(),
    rankedJobsCount: z.number().nullable(),
    failed: z.boolean(),
    /** Completed runs still allowed today after this one. */
    runsLeftToday: z.number(),
    runsPerDay: z.number(),
    /** Which run of the day this is, from 0. */
    runSlot: z.number().nullable(),
    /** Set when queries were sent but not used: a run was already queued or running, or none was allowed. */
    warning: z.string().nullable(),
  }),
  async run({ queries }, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-run:${userId}`, RATE_LIMITS['job-feed-run']);
      const blocker = await explainFeedRunBlocker(userId);
      if (blocker) throw new ToolError(blocker.code, blocker.message);
      // An agent cannot give the user's consent, so the run only goes ahead on consent already on file.
      // The run itself happens on the agent queue; this returns once it is queued.
      const limit = getJobFeedTierLimits((await requireFeedViewer(userId)).subscription_tier).maxMainQueries;
      if (queries && queries.length > limit) {
        throw new ToolError('invalid_input', `This plan runs at most ${limit} searches a run. Send ${limit} or fewer.`);
      }
      const result = await queueFeedRun(userId, {
        customQueries: queries ? queries.map((row) => ({ query: row.query, targetCountry: row.country })) : null,
      });
      return ok({
        runId: result.runId,
        status: result.status,
        localDate: result.localDate,
        started: result.started,
        alreadyRanToday: result.alreadyRanToday,
        nextRunAt: result.nextRunAt,
        rawJobsFetched: result.rawJobsFetched,
        jobsAfterPrefilter: result.jobsAfterPrefilter,
        rankedJobsCount: result.rankedJobsCount,
        failed: result.status === 'failed',
        runsLeftToday: result.runsLeftToday,
        runsPerDay: result.runsPerDay,
        runSlot: result.runSlot,
        warning: queries && !result.started
          ? (result.alreadyRanToday
            ? 'No run was started, so the queries sent were not searched: today\'s runs are used up.'
            : 'A run was already in progress, so the queries sent were not searched. Send them again once it has ended.')
          : null,
      });
    });
  },
});

// ---------------------------------------------------------------------------
// give_job_feedback
// ---------------------------------------------------------------------------

/** The tool's verbs and the values the feedback route stores them under. */
const FEEDBACK_ACTIONS = {
  save: 'saved',
  unsave: 'unsaved',
  dismiss: 'dismissed',
  rate_helpful: 'rated_helpful',
  rate_not_relevant: 'rated_not_relevant',
} as const;

const giveJobFeedback = defineTool({
  name: 'give_job_feedback',
  title: 'Give job feedback',
  description:
    'Saves, unsaves, dismisses or rates one job from the feed. Dismissing a job or rating it not relevant removes it from the feed and cannot be undone.',
  hints: { readOnly: false, destructive: true, idempotent: true, openWorld: false },
  input: z.object({
    jobId: z.string().min(1).max(100).describe('A jobId from get_job_feed.'),
    action: z.enum(['save', 'unsave', 'dismiss', 'rate_helpful', 'rate_not_relevant'])
      .describe('rate_helpful and rate_not_relevant record whether the match was good, and teach the ranking. dismiss and rate_not_relevant end the job.'),
  }),
  output: z.object({
    jobId: z.string(),
    action: z.enum(['save', 'unsave', 'dismiss', 'rate_helpful', 'rate_not_relevant']),
    savedAt: z.string().nullable(),
    dismissedAt: z.string().nullable(),
    matchRating: z.enum(['helpful', 'not_relevant']).nullable(),
    applicationId: z.string().nullable(),
  }),
  // Only the two verbs that end a job ask: a save, an unsave or a helpful rating is easy to take back or harmless.
  confirm({ action }) {
    if (action === 'dismiss') return 'Dismiss this job? It leaves your feed and cannot be brought back.';
    if (action === 'rate_not_relevant') return 'Mark this job as not relevant? It leaves your feed and cannot be brought back.';
    return null;
  },
  async run({ jobId, action }, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-feedback:${userId}`, RATE_LIMITS['job-feed-feedback']);
      if (action === 'unsave' && !(await getJobFeedFeedbackAdmin(userId, jobId))) {
        throw new ToolError('nothing_to_unsave', 'That job is not saved.');
      }
      const feedback = await recordFeedFeedback({
        userId,
        body: { jobId, action: FEEDBACK_ACTIONS[action] },
        analyticsRoute: 'mcp:give_job_feedback',
        source: 'mcp',
      });
      return ok({
        jobId,
        action,
        savedAt: feedback.savedAt,
        dismissedAt: feedback.dismissedAt,
        matchRating: feedback.matchRating,
        applicationId: feedback.applicationSessionId,
      });
    });
  },
});

// ---------------------------------------------------------------------------
// withdraw_feed_consent
// ---------------------------------------------------------------------------

const withdrawFeedConsentTool = defineTool({
  name: 'withdraw_feed_consent',
  title: 'Withdraw feed consent',
  description:
    "Withdraws the user's consent for job feed processing and switches the feed off. Saved jobs and settings stay, and only the user can give consent again, in the web app.",
  hints: { readOnly: false, destructive: true, idempotent: true, openWorld: false },
  input: z.object({}),
  output: z.object({ withdrawn: z.literal(true) }),
  async confirm(_args, { userId }) {
    const settings = await getSettings(userId);
    if (!settings || (!settings.consent_accepted_at && !settings.enabled)) return null;
    return 'Stop job feed processing? This withdraws consent and switches the feed off, and consent can only be given again in the web app.';
  },
  async run(_args, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-consent-withdraw:${userId}`, RATE_LIMITS['job-feed-settings']);
      await withdrawFeedConsent(userId);
      return ok({ withdrawn: true as const });
    });
  },
});

// ---------------------------------------------------------------------------
// apply_to_feed_job
// ---------------------------------------------------------------------------

const applyToFeedJobTool = defineTool({
  name: 'apply_to_feed_job',
  title: 'Apply to feed job',
  description: `Creates an application from a job in the user's feed, then runs a fit check (${CREDIT_COSTS.FIT_ANALYSIS} credits) or queues the full application kit (${CREDIT_COSTS.FULL_APPLICATION} credits, or ${CREDIT_COSTS.GENERATION_AFTER_FIT} after a fit check on the same job). A fit check returns its result directly; a kit returns an operationId to read with get_operation. ${START_DATE_NOTE} ${UNTRUSTED_NOTE}`,
  hints: { readOnly: false, destructive: false, idempotent: true, openWorld: false },
  input: z.object({
    jobId: z.string().min(1).max(100).describe('A jobId from get_job_feed. The user needs a primary CV on file.'),
    mode: z.enum(['fit', 'kit']).describe(`fit checks how well the CV matches the job (${CREDIT_COSTS.FIT_ANALYSIS} credits). kit writes the CV, cover letter, application email and follow-up email (${CREDIT_COSTS.FULL_APPLICATION} credits, or ${CREDIT_COSTS.GENERATION_AFTER_FIT} after a fit check on the same job).`),
    idempotencyKey: idempotencyKeyField,
    waitSeconds: waitSecondsField.describe('Kit only: seconds to wait for the kit before returning (0 to 20). Without it the call returns at once.'),
  }),
  output: z.object({
    applicationId: z.string(),
    mode: z.enum(['fit', 'kit']),
    status: z.enum(['pending', 'running', 'succeeded', 'failed', 'cancelled', 'kit_exists']),
    operationId: z.string().nullable(),
    pollAfterSeconds: z.number().nullable(),
    job: z.object({ title: z.string(), company: z.string() }),
    fit: z.object({
      fitLevel: z.enum(['strong', 'good', 'fair', 'weak']),
      score: z.number(),
      assessment: z.string(),
      matchingSkills: z.array(z.string()),
      missingSkills: z.array(z.string()),
    }).nullable(),
    revision: z.number().nullable(),
    creditsUsed: z.number(),
    replayed: z.boolean(),
    joinedRunning: z.boolean(),
    balance: z.object({ total: z.number(), monthly: z.number(), rollover: z.number(), addon: z.number() }),
    profileGaps: profileGapsSchema,
  }),
  async run({ jobId, mode, idempotencyKey, waitSeconds }, { userId }) {
    return feedCall(async () => {
      await withinRateLimit(`job-feed-apply:${userId}`, RATE_LIMITS['job-feed-apply']);
      const outcome = await applyToFeedJob({
        userId,
        jobId,
        mode,
        idempotencyKey,
        spendLimit: await mcpSpendLimit(userId),
      });
      const job = { title: wrapLine(outcome.job.title), company: wrapLine(outcome.job.company) };
      const gaps = profileGaps(await getProfile(userId));

      if (outcome.kind === 'kit_exists') {
        return ok({
          applicationId: outcome.applicationId,
          mode,
          status: 'kit_exists' as const,
          operationId: null,
          pollAfterSeconds: null,
          job,
          fit: null,
          revision: null,
          creditsUsed: 0,
          replayed: false,
          joinedRunning: false,
          balance: await creditsSnapshot(userId),
          profileGaps: gaps,
        });
      }

      if (outcome.kind === 'fit') {
        return ok({
          applicationId: outcome.applicationId,
          mode,
          status: 'succeeded' as const,
          operationId: outcome.operationId,
          pollAfterSeconds: null,
          job,
          fit: {
            fitLevel: outcome.fit.fitLevel,
            score: outcome.fit.score,
            assessment: wrapLong(outcome.fit.assessment),
            matchingSkills: outcome.fit.matchingSkills.map((skill) => wrapShort(skill)),
            missingSkills: outcome.fit.missingSkills.map((skill) => wrapShort(skill)),
          },
          revision: outcome.fit.revision,
          creditsUsed: outcome.replayed ? 0 : CREDIT_COSTS.FIT_ANALYSIS,
          replayed: outcome.replayed,
          joinedRunning: false,
          balance: await creditsSnapshot(userId),
          profileGaps: gaps,
        });
      }

      let status = outcome.status;
      if (waitSeconds && (status === 'pending' || status === 'running')) {
        const operation = await waitForOperation(userId, outcome.operationId, waitSeconds);
        if (operation) status = operation.status;
      }
      const running = status === 'pending' || status === 'running';
      return ok({
        applicationId: outcome.applicationId,
        mode,
        status,
        operationId: outcome.operationId,
        pollAfterSeconds: running ? 10 : null,
        job,
        fit: null,
        revision: null,
        creditsUsed: outcome.creditsReserved,
        replayed: outcome.replayed,
        joinedRunning: outcome.joinedRunning,
        balance: await creditsSnapshot(userId),
        profileGaps: gaps,
      });
    });
  },
});

export const feedTools: AnyToolDefinition[] = [
  getJobFeed,
  getFeedSettings,
  getCareerProfile,
  regenerateCareerProfile,
  runJobFeed,
  updateFeedSettings,
  updateFeedSearches,
  giveJobFeedback,
  withdrawFeedConsentTool,
  applyToFeedJobTool,
];
