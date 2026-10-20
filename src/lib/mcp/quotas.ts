import { getCloudflareContext } from '@opennextjs/cloudflare';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { ToolError } from '@/lib/mcp/tools/errors';

/**
 * Per-user limits on the tools that cost us something even though they cost
 * the user no credits: a CV parse (a model call), screening answers (a model
 * call) and exports (browser time). Each has a per-minute rate limit (a
 * Workers rate limiting binding, in-memory when there is none) and a daily
 * quota.
 *
 * The daily count lives in KV with a one-day expiry, like the export render
 * budget. It is a guard against a runaway client, not a ledger, so a
 * read-then-write race that lets a few extra calls through is fine.
 */

export const MCP_QUOTAS = {
  save_cv: { bucket: 'mcp-save-cv', perDay: 20, label: 'CV uploads' },
  draft_screening_answers: { bucket: 'mcp-screening', perDay: 30, label: 'screening answer requests' },
  export_documents: { bucket: 'mcp-export', perDay: 60, label: 'exported files' },
} as const;

export type QuotaTool = keyof typeof MCP_QUOTAS;

type QuotaKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

const memory = new Map<string, { count: number; expiresAt: number }>();

async function quotaKv(): Promise<QuotaKv | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.CONTEXT_CACHE as QuotaKv | undefined;
  } catch {
    return undefined;
  }
}

function dayKey(tool: QuotaTool, userId: string): string {
  return `mcp-quota:${tool}:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

/** Count `units` against today's quota, or refuse. A refusal counts nothing. */
export async function consumeDailyQuota(tool: QuotaTool, userId: string, units = 1): Promise<void> {
  const { perDay, label } = MCP_QUOTAS[tool];
  const key = dayKey(tool, userId);
  const kv = await quotaKv();
  let used: number;
  if (kv) {
    used = Number((await kv.get(key)) ?? 0);
  } else {
    const entry = memory.get(key);
    used = entry && entry.expiresAt > Date.now() ? entry.count : 0;
  }
  if (used + units > perDay) {
    throw new ToolError(
      'daily_quota',
      `The daily limit of ${perDay} ${label} is reached for this account. It resets at 00:00 UTC.`,
    );
  }
  if (kv) await kv.put(key, String(used + units), { expirationTtl: 90_000 });
  else memory.set(key, { count: used + units, expiresAt: Date.now() + 90_000_000 });
}

/** Undo a count when the call failed before doing the costly work. */
export async function refundDailyQuota(tool: QuotaTool, userId: string, units = 1): Promise<void> {
  const key = dayKey(tool, userId);
  const kv = await quotaKv();
  if (kv) {
    const used = Number((await kv.get(key)) ?? 0);
    await kv.put(key, String(Math.max(0, used - units)), { expirationTtl: 90_000 });
  } else {
    const entry = memory.get(key);
    if (entry) entry.count = Math.max(0, entry.count - units);
  }
}

/** The per-minute limit for a quota'd tool, keyed on the user (shared egress IPs make IP keys useless for hosted clients). */
export async function checkToolRateLimit(tool: QuotaTool, userId: string): Promise<void> {
  const config = RATE_LIMITS[MCP_QUOTAS[tool].bucket];
  const result = await checkRateLimit(`${config.name}:${userId}`, config);
  if (!result.allowed) {
    throw new ToolError('rate_limited', `Too many ${MCP_QUOTAS[tool].label} in a short time. Try again in a minute.`);
  }
}
