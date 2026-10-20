import { z } from 'zod';
import { getUserCredits } from '@/db/repos/credits';
import { getDocuments } from '@/db/repos/documents';
import { getProfile } from '@/db/repos/profiles';
import { defineTool, ok, type AnyToolDefinition } from '@/lib/mcp/tools/framework';
import { creditsSnapshot, dailySpend } from '@/lib/mcp/tools/shared';

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

export const accountTools: AnyToolDefinition[] = [getAccount];
