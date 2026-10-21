import { z } from 'zod';
import { getCreditTransactions, getUserCredits } from '@/db/repos/credits';
import { getCanonicalJobsByIds } from '@/db/repos/admin';
import { getDocuments } from '@/db/repos/documents';
import { listInboxRankedItems } from '@/db/repos/jobFeed';
import { getProfile } from '@/db/repos/profiles';
import { listBriefingApplications } from '@/db/repos/sessions';
import { getBlockedCanonicalJobIdsAdmin } from '@/lib/job-feed/server';
import { defineTool, ok, type AnyToolDefinition } from '@/lib/mcp/tools/framework';
import { UNTRUSTED_NOTE, creditsSnapshot, dailySpend, wrapLong, wrapShort } from '@/lib/mcp/tools/shared';

const READ_HINTS = { readOnly: true, destructive: false, idempotent: true, openWorld: false } as const;

const getAccount = defineTool({
  name: 'get_account',
  title: 'Get account',
  description:
    "Returns the signed-in user's plan, credit balance, next credit reset date, today's agent credit limit and usage, whether a primary and a master CV are on file, and their profile name and email.",
  hints: READ_HINTS,
  input: z.object({}),
  output: z.object({
    plan: z.string(),
    credits: z.object({
      monthly: z.number(),
      rollover: z.number(),
      addon: z.number(),
      total: z.number(),
    }),
    nextResetDate: z.string().nullable(),
    dailyAgentCreditLimit: z.number(),
    dailyAgentCredits: z.object({
      limit: z.number(),
      used: z.number(),
      remaining: z.number(),
      resetsAt: z.string(),
    }),
    cvOnFile: z.object({ primary: z.boolean(), master: z.boolean() }),
    profile: z.object({ name: z.string().nullable(), email: z.string() }),
  }),
  async run(_args, { userId }) {
    const [{ credits, error }, snapshot, profile, documents, spend] = await Promise.all([
      getUserCredits(userId),
      creditsSnapshot(userId),
      getProfile(userId),
      getDocuments(userId),
      dailySpend(userId),
    ]);
    if (error || !credits || !profile) throw new Error('Account data missing');
    return ok({
      plan: credits.plan_tier,
      credits: snapshot,
      nextResetDate: credits.next_reset_date,
      dailyAgentCreditLimit: spend.limit,
      dailyAgentCredits: spend,
      cvOnFile: {
        primary: documents.some((d) => d.type === 'primary_cv'),
        master: documents.some((d) => d.type === 'master_cv'),
      },
      profile: { name: profile.full_name, email: profile.email },
    });
  },
});

/**
 * Ledger rows written before refunds stopped storing the failure message end "Released reservation
 * <id>: <raw error text>". Only the server-written shapes pass, cut before the first ": ", so no
 * error text, old or new, reaches the agent. Anything else is returned as null: the type says what it was.
 */
const SAFE_LEDGER_DESCRIPTIONS = [
  /^Released reservation \S+$/,
  /^Partial refund on reservation \S+$/,
  /^Credit reservation for \w+$/,
  /^\w+ credit (deduction|addition)$/,
  /^Initial free plan credits$/,
  /^Upgraded to [\w .-]+ plan$/,
  /^Purchased \d+ add-on pack \(\d+(\.\d+)? credits\)$/,
  /^Stripe (subscription|add-on) refund$/,
  /^Monthly credit reset for [\w .-]+ plan$/,
  /^Stripe subscription renewal$/,
];

function safeLedgerDescription(description: string | null): string | null {
  if (!description) return null;
  const head = description.split(': ')[0];
  return SAFE_LEDGER_DESCRIPTIONS.some((pattern) => pattern.test(head)) ? head : null;
}

const getCreditHistory = defineTool({
  name: 'get_credit_history',
  title: 'Get credit history',
  description: 'Returns the most recent credit transactions, newest first: amount (negative is spent), type, description, balance after and time.',
  hints: READ_HINTS,
  input: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('How many transactions to return (1 to 50, default 20).'),
  }),
  output: z.object({
    transactions: z.array(z.object({
      amount: z.number(),
      type: z.string(),
      description: z.string().nullable(),
      balanceAfter: z.number(),
      createdAt: z.string(),
    })),
  }),
  async run({ limit }, { userId }) {
    const { transactions } = await getCreditTransactions(userId, limit ?? 20);
    return ok({
      transactions: transactions.map((t) => ({
        amount: t.amount,
        type: t.transaction_type,
        description: safeLedgerDescription(t.description ?? null),
        balanceAfter: t.balance_after,
        createdAt: t.created_at,
      })),
    });
  },
});

const BRIEFING_LIMIT = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const briefingApplication = z.object({
  applicationId: z.string(),
  title: z.string(),
  company: z.string(),
  status: z.string(),
  dueAt: z.string().nullable(),
});
const briefingBucket = z.object({ count: z.number(), items: z.array(briefingApplication) });

const morningBriefing = defineTool({
  name: 'morning_briefing',
  title: 'Morning briefing',
  description:
    `Returns what needs attention today: follow-ups due or overdue, interviews in the next 7 days, applications whose generation is running or failed in the last 7 days, and strong job feed matches from the last 24 hours. Each bucket has a count and up to ${BRIEFING_LIMIT} items. ${UNTRUSTED_NOTE}`,
  hints: READ_HINTS,
  input: z.object({}),
  output: z.object({
    followUpsDue: briefingBucket,
    upcomingInterviews: briefingBucket,
    generationsInProgress: briefingBucket,
    generationsFailed: briefingBucket,
    newStrongMatches: z.object({
      count: z.number(),
      items: z.array(z.object({ jobId: z.string(), title: z.string(), company: z.string(), reason: z.string().nullable() })),
    }),
  }),
  async run(_args, { userId }) {
    const now = new Date();
    const nowIso = now.toISOString();
    const [rows, inbox, blocked] = await Promise.all([
      listBriefingApplications(userId, {
        now: nowIso,
        interviewUntil: new Date(now.getTime() + 7 * DAY_MS).toISOString(),
        failedSince: new Date(now.getTime() - 7 * DAY_MS).toISOString(),
      }),
      listInboxRankedItems(userId, new Date(now.getTime() - DAY_MS).toISOString()),
      getBlockedCanonicalJobIdsAdmin(userId),
    ]);

    const item = (row: (typeof rows)[number], dueAt: string | null) => ({
      applicationId: row.id,
      title: wrapShort(row.job_title),
      company: wrapShort(row.company),
      status: row.status,
      dueAt,
    });
    const bucket = (matching: typeof rows, dueOf: (row: (typeof rows)[number]) => string | null) => ({
      count: matching.length,
      items: matching.slice(0, BRIEFING_LIMIT).map((row) => item(row, dueOf(row))),
    });

    const followUps = rows
      .filter((r) => (r.status === 'applied' || r.status === 'follow_up') && r.follow_up_due_at && r.follow_up_due_at <= nowIso)
      .sort((a, b) => (a.follow_up_due_at as string).localeCompare(b.follow_up_due_at as string));
    const interviews = rows
      .filter((r) => r.interview_at && r.interview_at >= nowIso)
      .sort((a, b) => (a.interview_at as string).localeCompare(b.interview_at as string));
    const running = rows.filter((r) => r.generation_status === 'pending' || r.generation_status === 'running');
    const failed = rows.filter((r) => r.generation_status === 'failed');

    const seen = new Set<string>();
    const strong = inbox.filter((r) => {
      if (r.fit_label !== 'strong' || blocked.has(r.canonical_job_id) || seen.has(r.canonical_job_id)) return false;
      seen.add(r.canonical_job_id);
      return true;
    });
    const shown = strong.slice(0, BRIEFING_LIMIT);
    const jobs = new Map((await getCanonicalJobsByIds(shown.map((r) => r.canonical_job_id))).map((j) => [j.id, j]));

    return ok({
      followUpsDue: bucket(followUps, (r) => r.follow_up_due_at),
      upcomingInterviews: bucket(interviews, (r) => r.interview_at),
      generationsInProgress: bucket(running, () => null),
      generationsFailed: bucket(failed, () => null),
      newStrongMatches: {
        count: strong.length,
        items: shown.flatMap((r) => {
          const job = jobs.get(r.canonical_job_id);
          if (!job) return [];
          return [{
            jobId: r.canonical_job_id,
            title: wrapShort(job.title),
            company: wrapShort(job.company),
            reason: r.reason ? wrapLong(r.reason, 300) : null,
          }];
        }),
      },
    });
  },
});

export const accountTools: AnyToolDefinition[] = [getAccount, getCreditHistory, morningBriefing];
