/**
 * Server-side context cache.
 *
 * Holds the MasterContext a fit analysis built so the generation that follows
 * can reuse it. TTL 30 minutes, keyed by owner and contextId. Prefers Workers
 * KV (shared across isolates) and falls back to an in-memory Map when the
 * CONTEXT_CACHE binding is missing (plain `next dev`).
 *
 * Shared by the agent-v2 route and the Queue runner so both read the same cache.
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { MasterContext } from '@/lib/agents';

type ContextCacheKv = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
};

declare global {
  interface CloudflareEnv {
    CONTEXT_CACHE?: ContextCacheKv;
  }
}

const memoryContextCache = new Map<string, { context: MasterContext; expiresAt: number }>();
const CONTEXT_CACHE_TTL_SECONDS = 30 * 60;
const CONTEXT_CACHE_TTL_MS = CONTEXT_CACHE_TTL_SECONDS * 1000;
const MAX_CACHE_SIZE = 100; // Prevent unbounded memory growth

async function getContextCacheKv(): Promise<ContextCacheKv | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.CONTEXT_CACHE;
  } catch {
    // Not running under OpenNext (plain Next server or a non-Cloudflare build). Use the in-memory cache.
    return undefined;
  }
}

// Cache keys are scoped to the owning user so a leaked or guessed contextId
// can never read another user's parsed CV. Anonymous callers are scoped by
// their server-derived IP hash.
function contextCacheKey(ownerId: string, contextId: string): string {
  return `${ownerId}:${contextId}`;
}

function setMemoryContext(key: string, context: MasterContext): void {
  const now = Date.now();
  for (const [k, value] of memoryContextCache.entries()) {
    if (value.expiresAt < now) memoryContextCache.delete(k);
  }
  if (memoryContextCache.size >= MAX_CACHE_SIZE) {
    const entriesToDelete = memoryContextCache.size - MAX_CACHE_SIZE + 1;
    let deleted = 0;
    for (const k of memoryContextCache.keys()) {
      if (deleted >= entriesToDelete) break;
      memoryContextCache.delete(k);
      deleted++;
    }
  }
  memoryContextCache.set(key, { context, expiresAt: now + CONTEXT_CACHE_TTL_MS });
}

function getMemoryContext(key: string): MasterContext | null {
  const entry = memoryContextCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryContextCache.delete(key);
    return null;
  }
  return entry.context;
}

export async function cacheContext(ownerId: string, contextId: string, context: MasterContext): Promise<void> {
  const key = contextCacheKey(ownerId, contextId);
  // Always write through to the isolate-local map: KV is eventually consistent
  // and the follow-up request usually lands on the same isolate within seconds.
  setMemoryContext(key, context);
  const kv = await getContextCacheKv();
  if (kv) {
    await kv.put(key, JSON.stringify(context), { expirationTtl: CONTEXT_CACHE_TTL_SECONDS });
  }
}

export async function getCachedContext(ownerId: string, contextId: string): Promise<MasterContext | null> {
  const key = contextCacheKey(ownerId, contextId);
  const local = getMemoryContext(key);
  if (local) {
    console.log('[API_AGENT_V2] context cache hit');
    return local;
  }
  const kv = await getContextCacheKv();
  if (kv) {
    const raw = await kv.get(key);
    if (!raw) return null;
    console.log('[API_AGENT_V2] context cache hit');
    return JSON.parse(raw) as MasterContext;
  }
  return null;
}

export async function removeCachedContext(ownerId: string, contextId: string): Promise<void> {
  const key = contextCacheKey(ownerId, contextId);
  memoryContextCache.delete(key);
  const kv = await getContextCacheKv();
  if (kv) {
    await kv.delete(key);
  }
}

export function normalizeCachedMatch(context: MasterContext): void {
  const rawMatch = context.match as unknown;
  if (!rawMatch || typeof rawMatch !== 'object' || Array.isArray(rawMatch)) return;
  const match = rawMatch as Record<string, unknown>;
  const strings = (value: unknown): string[] => Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    : [];
  const sourceText = [context.rawCV, context.masterCV].filter(Boolean).join('\n');
  const containsWholeTerm = (value: string): boolean => {
    const normalized = value.trim().normalize('NFKC').replace(/\s+/g, ' ');
    if (!normalized) return false;
    const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu')
      .test(sourceText.normalize('NFKC').replace(/\s+/g, ' '));
  };
  const requiredSkills = context.job?.requiredSkills ?? [];
  const rawDetails = Array.isArray(match.details) ? match.details : [];
  const details: NonNullable<NonNullable<MasterContext['match']>['details']> = [];
  for (const value of rawDetails) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const detail = value as Record<string, unknown>;
    const requirement = typeof detail.requirement === 'string' ? detail.requirement.trim() : '';
    const tier = detail.tier;
    if (!requirement || (tier !== 1 && tier !== 2 && tier !== 3 && tier !== 'implicit' && tier !== 'missing')) continue;
    const evidence = typeof detail.evidence === 'string' && containsWholeTerm(detail.evidence)
      ? detail.evidence
      : undefined;
    details.push({
      requirement,
      evidence,
      tier,
      claimable: (tier === 1 || tier === 2) && detail.claimable === true && Boolean(evidence),
      required: typeof detail.required === 'boolean'
        ? detail.required
        : requiredSkills.some((skill) => skill.trim().toLocaleLowerCase() === requirement.toLocaleLowerCase()),
    });
  }

  const matchedRequirements = strings(match.matchedRequirements);
  const claimableEvidence = strings(match.claimableEvidence).filter(containsWholeTerm);
  context.match = {
    score: typeof match.score === 'number' && Number.isFinite(match.score)
      ? Math.max(0, Math.min(100, Math.round(match.score)))
      : 0,
    matchedRequirements: matchedRequirements.length > 0
      ? matchedRequirements
      : [...new Set(details.filter((detail) => detail.tier !== 'missing').map((detail) => detail.requirement))],
    claimableEvidence: claimableEvidence.length > 0
      ? claimableEvidence
      : [...new Set(details.filter((detail) => detail.claimable && detail.evidence).map((detail) => detail.evidence!))],
    missingSkills: strings(match.missingSkills),
    details,
  };
}
