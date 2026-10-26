/**
 * Phase 1 read tools: no risk, execute immediately. Every handler queries
 * through the repos with the session-derived userId, so it can only ever see
 * this user's rows.
 *
 * Company names and job titles are copied from job ads, so they are
 * attacker-authored text. They go into tool results flattened and wrapped in
 * << >>, which the system prompt tells the model to read as data, never as
 * instructions.
 */

import { listTrackerOverview, getSession, type TrackerApplicationRow } from '@/db/repos/sessions';
import { getUserCredits } from '@/db/repos/credits';
import { getDocuments } from '@/db/repos/documents';
import { listLatestJobFeedItemsAdmin } from '@/lib/job-feed/server';
import { CREDIT_COSTS, getTotalCredits } from '@/lib/credit-costs';
import { defaultFollowUpDue, parseDate } from '@/components/tracker/tracker-status';
import { dayKey } from '@/lib/utils/format-date';
import { flattenUntrusted, isoToWallClock, sanitizeUntrustedText } from './untrusted';
import { fitListsToBudget, type ChatTool } from './types';

function wrapped(value: string | null | undefined): string {
  return `<<${flattenUntrusted(value)}>>`;
}

function applicationLine(row: TrackerApplicationRow, todayKey: string, timeZone: string) {
  const followUpDue = parseDate(row.follow_up_due_at)
    ?? (row.status === 'applied' ? defaultFollowUpDue(row.created_at) : null);
  const interviewAt = parseDate(row.interview_at);
  // Day keys in the user's zone, matching the tracker UI: a follow-up due
  // today is due, not overdue, for the whole of that day.
  const followUpKey = followUpDue ? dayKey(followUpDue, timeZone) : null;
  const chase = row.status === 'applied' || row.status === 'follow_up';
  return {
    application_id: row.id,
    company: wrapped(row.company),
    role: wrapped(row.job_title),
    status: row.status,
    match_score: row.match_score,
    interview_at: row.interview_at,
    // The user's wall clock for the two instants above. The reply states these, never a UTC conversion of its own.
    interview_local: isoToWallClock(row.interview_at, timeZone),
    follow_up_due_at: followUpDue ? followUpDue.toISOString() : null,
    follow_up_due_local: followUpDue ? isoToWallClock(followUpDue.toISOString(), timeZone) : null,
    follow_up_overdue: Boolean(chase && followUpKey && followUpKey < todayKey),
    follow_up_due_today: Boolean(chase && followUpKey && followUpKey === todayKey),
    interview_upcoming: Boolean(interviewAt && dayKey(interviewAt, timeZone) >= todayKey),
  };
}

async function trackerSnapshot(userId: string, timeZone: string) {
  const rows = await listTrackerOverview(userId);
  const todayKey = dayKey(new Date(), timeZone);
  return rows.map((row) => applicationLine(row, todayKey, timeZone));
}

const getApplications: ChatTool = {
  name: 'get_applications',
  description:
    'The user\'s tracked job applications: company, role, status, match score, interview date, follow-up due date. Use for any question about where they stand, interviews, follow-ups or a specific company. Take times from interview_local and follow_up_due_local (the user\'s own clock), never from the UTC fields; for a follow-up, state the day only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    const applications = await trackerSnapshot(ctx.userId, ctx.timeZone);
    // Newest first from the repo; the result cap keeps a 300-row hunt from
    // flooding every remaining round's prompt, and truncated_lists says how
    // many of `count` are shown.
    return {
      data: fitListsToBudget({ count: applications.length, applications }, ['applications']),
    };
  },
};

const explainFit: ChatTool = {
  name: 'explain_fit',
  description:
    'The stored fit assessment for the application open in this conversation: score, matching skills, gaps and the written assessment. Use when the user asks why they scored what they did or how well they fit this role.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    if (!ctx.sessionId) {
      return { data: { error: 'No saved application is open in this conversation.' } };
    }
    const session = await getSession(ctx.userId, ctx.sessionId);
    if (!session) {
      return { data: { error: 'That application was not found.' } };
    }
    const fit = (session.fit_assessment ?? null) as
      | { score?: number; fitLevel?: string; assessment?: string; matchingSkills?: string[]; missingSkills?: string[] }
      | null;
    return {
      data: {
        company: wrapped(session.company),
        role: wrapped(session.job_title),
        match_score: fit?.score ?? session.match_score ?? null,
        fit_level: fit?.fitLevel ?? null,
        // Skills and the assessment were generated from the attacker-authored
        // job ad, so they get the same wrap-as-data treatment as names.
        matching_skills: (fit?.matchingSkills ?? session.matching_skills ?? [])
          .slice(0, 12)
          .map((skill: string) => wrapped(skill)),
        missing_skills: (fit?.missingSkills ?? session.missing_skills ?? [])
          .slice(0, 8)
          .map((skill: string) => wrapped(skill)),
        assessment: typeof fit?.assessment === 'string'
          ? `<<${sanitizeUntrustedText(fit.assessment, 1500)}>>`
          : null,
      },
    };
  },
};

const getCredits: ChatTool = {
  name: 'get_credits',
  description:
    'The user\'s credit balance and what each action costs. Use for any question about credits, what they can afford, or what an action costs.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    const { credits } = await getUserCredits(ctx.userId);
    if (!credits) {
      return { data: { error: 'No credit account found.' } };
    }
    return {
      data: {
        total_credits: getTotalCredits(credits),
        monthly_credits: credits.monthly_credits,
        rollover_credits: credits.rollover_credits,
        addon_credits: credits.addon_credits,
        plan_tier: credits.plan_tier ?? null,
        costs: {
          fit_analysis: CREDIT_COSTS.FIT_ANALYSIS,
          full_application_kit: CREDIT_COSTS.FULL_APPLICATION,
          kit_after_fit_analysis: CREDIT_COSTS.GENERATION_AFTER_FIT,
          cover_letter_rewrite: CREDIT_COSTS.COVER_LETTER_REGEN,
          email_rewrite: CREDIT_COSTS.EMAIL_REGEN,
          follow_up_email: CREDIT_COSTS.FOLLOW_UP_REGEN,
        },
      },
    };
  },
};

const getDocumentsTool: ChatTool = {
  name: 'get_documents',
  description:
    'The CV documents the user has uploaded: primary CV and master CV, with file names and upload dates. Use when they ask which CV is in use or what they uploaded.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    const documents = await getDocuments(ctx.userId);
    return {
      data: fitListsToBudget({
        documents: documents.map((doc) => ({
          type: doc.type,
          file_name: flattenUntrusted(doc.file_name),
          uploaded_at: doc.created_at,
          uploaded_local: isoToWallClock(doc.created_at, ctx.timeZone),
        })),
        has_primary_cv: documents.some((doc) => doc.type === 'primary_cv'),
        has_master_cv: documents.some((doc) => doc.type === 'master_cv'),
      }, ['documents']),
    };
  },
};

async function feedSnapshot(userId: string, limit: number, timeZone: string) {
  const { run, items } = await listLatestJobFeedItemsAdmin({ userId });
  if (!run) return { run_completed_at: null, run_completed_local: null, items: [] };
  return {
    run_completed_at: run.completed_at ?? null,
    run_completed_local: isoToWallClock(run.completed_at, timeZone),
    items: items.slice(0, limit).map((item) => ({
      // The stable id the feed write tools address a role by. An ordinal the
      // model inferred would drift the moment the list changes.
      job_id: item.id,
      title: wrapped(item.title),
      company: wrapped(item.company),
      location: item.location ? wrapped(item.location) : null,
      work_mode: item.workMode,
      salary: item.salaryText ? wrapped(item.salaryText) : null,
      fit: item.fitLabel,
      // Whole, as get_job_feed returns it: the ranker's reason is no longer cut at 160, so a 200 cut here would split words.
      why: item.matchReason ? `<<${sanitizeUntrustedText(item.matchReason, Number.POSITIVE_INFINITY)}>>` : null,
      saved: Boolean(item.feedback.savedAt),
      dismissed: Boolean(item.feedback.dismissedAt),
    })),
  };
}

const getFeedDigest: ChatTool = {
  name: 'get_feed_digest',
  description:
    'The latest job feed results: the strongest open matches with fit labels, why they match and a job_id for each. Use when the user asks what is in their feed or whether anything strong came in, and always before saving, dismissing or applying to a feed role.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    const digest = await feedSnapshot(ctx.userId, 8, ctx.timeZone);
    return { data: fitListsToBudget(digest, ['items']) };
  },
};

const morningBriefing: ChatTool = {
  name: 'morning_briefing',
  description:
    'One composed snapshot for "what should I do today": overdue and due follow-ups, upcoming interviews, strong new feed matches and the credit balance. Prefer this over separate calls when the user asks for a plan or overview of the day. State times from the _local fields, never from the UTC ones.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  handler: async (_args, ctx) => {
    const [applications, feed, creditsResult] = await Promise.all([
      trackerSnapshot(ctx.userId, ctx.timeZone),
      feedSnapshot(ctx.userId, 3, ctx.timeZone),
      getUserCredits(ctx.userId),
    ]);
    const inSevenDays = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return {
      data: fitListsToBudget({
        follow_ups_overdue: applications.filter((app) => app.follow_up_overdue),
        follow_ups_due_today: applications.filter((app) => app.follow_up_due_today),
        interviews_upcoming: applications.filter(
          (app) => app.interview_upcoming && app.interview_at && Date.parse(app.interview_at) <= inSevenDays,
        ),
        drafted_not_sent: applications.filter((app) => app.status === 'drafted').length,
        strong_feed_matches: feed.items.filter((item) => item.fit === 'strong'),
        total_credits: creditsResult.credits ? getTotalCredits(creditsResult.credits) : null,
      }, ['follow_ups_overdue', 'follow_ups_due_today', 'interviews_upcoming', 'strong_feed_matches']),
    };
  },
};

export const READ_TOOLS: ChatTool[] = [
  getApplications,
  explainFit,
  getCredits,
  getDocumentsTool,
  getFeedDigest,
  morningBriefing,
];
