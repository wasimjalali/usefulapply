import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, runBatch } from '../client';
import { mcpGrantState, oauthClient, oauthConsent, oauthRefreshToken, profiles, user } from '../schema';

/**
 * Connected apps: the OAuth clients a user has authorised for MCP, and the
 * revocation record the /mcp token check reads.
 *
 * Better Auth cannot revoke a JWT access token, so revoking a client does
 * three things in one D1 batch: revoke its refresh tokens (no new access
 * tokens), delete its consent (the next authorise asks again) and write
 * `revoked_at`. The /mcp check refuses any access token issued at or before
 * `revoked_at`, so access tokens die within GRANT_CACHE_TTL_MS.
 */

/** Longest a revocation can go unseen by another isolate. The brief allows 60 s. */
export const GRANT_CACHE_TTL_MS = 30_000;
/** `last_used_at` is rewritten at most this often per (user, client). */
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60_000;

export const DEFAULT_DAILY_AGENT_CREDIT_LIMIT = 10;
export const MAX_DAILY_AGENT_CREDIT_LIMIT = 1000;

export interface GrantState {
  revokedAt: number | null;
  lastUsedAt: number | null;
  /** The account is gone (deleted). Its tokens stay signed and unexpired for up to 10 minutes, so this refuses them. */
  userMissing?: boolean;
}

interface CacheEntry {
  at: number;
  state: GrantState;
}

// On globalThis because the settings server action and the /mcp route are bundled separately, so a module-level Map
// would be two Maps and a revoke would not clear the entry the token check reads.
const globalForGrants = globalThis as typeof globalThis & { __uaMcpGrantCache?: Map<string, CacheEntry> };
const grantCache: Map<string, CacheEntry> = (globalForGrants.__uaMcpGrantCache ??= new Map());

function cacheKey(userId: string, clientId: string): string {
  return `${userId}\u0000${clientId}`;
}

export async function getGrantState(userId: string, clientId: string): Promise<GrantState> {
  const key = cacheKey(userId, clientId);
  const hit = grantCache.get(key);
  if (hit && Date.now() - hit.at < GRANT_CACHE_TTL_MS) return hit.state;

  const db = await getDb();
  const rows = await db
    .select({ revokedAt: mcpGrantState.revoked_at, lastUsedAt: mcpGrantState.last_used_at })
    .from(mcpGrantState)
    .where(and(eq(mcpGrantState.user_id, userId), eq(mcpGrantState.client_id, clientId)))
    .limit(1);
  const owner = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  const state: GrantState = {
    revokedAt: rows[0]?.revokedAt ?? null,
    lastUsedAt: rows[0]?.lastUsedAt ?? null,
    userMissing: owner.length === 0,
  };
  grantCache.set(key, { at: Date.now(), state });
  if (grantCache.size > 5_000) {
    for (const [k, v] of grantCache) {
      if (Date.now() - v.at >= GRANT_CACHE_TTL_MS) grantCache.delete(k);
    }
  }
  return state;
}

/** True when an access token minted at `issuedAtSeconds` predates this client's revocation. */
export function isTokenRevoked(state: GrantState, issuedAtSeconds: number | undefined): boolean {
  if (state.userMissing) return true;
  if (state.revokedAt === null) return false;
  // A token with no usable iat cannot be shown to postdate the revocation.
  if (typeof issuedAtSeconds !== 'number') return true;
  return issuedAtSeconds * 1000 <= state.revokedAt;
}

/** Record a use for "last used" in Connected apps, without writing on every call. */
export async function touchGrantLastUsed(userId: string, clientId: string, state: GrantState): Promise<void> {
  const now = Date.now();
  if (state.lastUsedAt !== null && now - state.lastUsedAt < LAST_USED_WRITE_INTERVAL_MS) return;
  const db = await getDb();
  await db
    .insert(mcpGrantState)
    .values({ user_id: userId, client_id: clientId, last_used_at: now })
    .onConflictDoUpdate({
      target: [mcpGrantState.user_id, mcpGrantState.client_id],
      set: { last_used_at: now },
    });
  grantCache.set(cacheKey(userId, clientId), { at: now, state: { ...state, lastUsedAt: now } });
}

export interface ConnectedApp {
  clientId: string;
  name: string;
  scopes: string[];
  connectedAt: number | null;
  lastUsedAt: number | null;
}

function parseScopes(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [];
  } catch {
    return raw.split(/\s+/).filter(Boolean);
  }
}

/** Clients this user has consented to, with the scopes they hold and when they were last used. */
export async function listConnectedApps(userId: string): Promise<ConnectedApp[]> {
  const db = await getDb();
  const consents = await db
    .select({
      clientId: oauthConsent.clientId,
      scopes: oauthConsent.scopes,
      createdAt: oauthConsent.createdAt,
      name: oauthClient.name,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, userId))
    .orderBy(desc(oauthConsent.createdAt));
  if (consents.length === 0) return [];

  const states = await db
    .select({ clientId: mcpGrantState.client_id, lastUsedAt: mcpGrantState.last_used_at })
    .from(mcpGrantState)
    .where(
      and(
        eq(mcpGrantState.user_id, userId),
        inArray(mcpGrantState.client_id, consents.map((c) => c.clientId)),
      ),
    );
  const lastUsed = new Map(states.map((s) => [s.clientId, s.lastUsedAt]));

  return consents.map((c) => ({
    clientId: c.clientId,
    name: c.name?.trim() || 'Unnamed app',
    scopes: parseScopes(c.scopes).filter((s) => s !== 'offline_access'),
    connectedAt: c.createdAt ? c.createdAt.getTime() : null,
    lastUsedAt: lastUsed.get(c.clientId) ?? null,
  }));
}

/**
 * Revoke one client for one user. Scoped by `userId` in every statement, so a
 * client id belonging to someone else's grant matches nothing. Returns false
 * when the user has no grant for the client.
 */
export async function revokeConnectedApp(userId: string, clientId: string): Promise<boolean> {
  const db = await getDb();
  const owned = await db
    .select({ id: oauthConsent.id })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
    .limit(1);
  const holdsRefresh = owned.length
    ? []
    : await db
        .select({ id: oauthRefreshToken.id })
        .from(oauthRefreshToken)
        .where(and(eq(oauthRefreshToken.userId, userId), eq(oauthRefreshToken.clientId, clientId)))
        .limit(1);
  if (owned.length === 0 && holdsRefresh.length === 0) return false;

  const now = Date.now();
  await runBatch([
    sql`UPDATE oauth_refresh_token SET revoked = ${now} WHERE user_id = ${userId} AND client_id = ${clientId} AND revoked IS NULL`,
    sql`DELETE FROM oauth_access_token WHERE user_id = ${userId} AND client_id = ${clientId}`,
    sql`DELETE FROM oauth_consent WHERE user_id = ${userId} AND client_id = ${clientId}`,
    sql`INSERT INTO mcp_grant_state (user_id, client_id, revoked_at) VALUES (${userId}, ${clientId}, ${now})
        ON CONFLICT (user_id, client_id) DO UPDATE SET revoked_at = excluded.revoked_at`,
  ]);
  grantCache.set(cacheKey(userId, clientId), {
    at: now,
    state: { revokedAt: now, lastUsedAt: null },
  });
  return true;
}

export async function getDailyAgentCreditLimit(userId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ limit: profiles.mcp_daily_credit_limit })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  return rows[0]?.limit ?? DEFAULT_DAILY_AGENT_CREDIT_LIMIT;
}

/** Whole or half credits only, 0 to MAX. 0 turns agent spending off. */
export function isValidDailyAgentCreditLimit(value: unknown): value is number {
  return (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
    && value <= MAX_DAILY_AGENT_CREDIT_LIMIT
    && Number.isInteger(value * 2)
  );
}

export async function setDailyAgentCreditLimit(userId: string, limit: number): Promise<void> {
  if (!isValidDailyAgentCreditLimit(limit)) throw new Error('Invalid daily agent credit limit');
  const db = await getDb();
  await db
    .update(profiles)
    .set({ mcp_daily_credit_limit: limit, updated_at: new Date().toISOString() })
    .where(eq(profiles.id, userId));
}

/** Revoke every connected app of a user (password reset, account takeover response). */
export async function revokeAllConnectedApps(userId: string): Promise<number> {
  const db = await getDb();
  const consents = await db
    .selectDistinct({ clientId: oauthConsent.clientId })
    .from(oauthConsent)
    .where(eq(oauthConsent.userId, userId));
  const refresh = await db
    .selectDistinct({ clientId: oauthRefreshToken.clientId })
    .from(oauthRefreshToken)
    .where(and(eq(oauthRefreshToken.userId, userId), isNull(oauthRefreshToken.revoked)));
  const clientIds = [...new Set([...consents, ...refresh].map((row) => row.clientId))];
  for (const clientId of clientIds) await revokeConnectedApp(userId, clientId);
  return clientIds.length;
}

/** A client nobody consented to within this long is registration noise. */
export const UNCONSENTED_CLIENT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Daily cleanup: dynamic registration is open, so delete clients older than 24 h
 * that have no consent row. Tokens, resource links and anything else that
 * references the client go with it (foreign keys cascade).
 */
export async function purgeUnconsentedClients(now = Date.now()): Promise<number> {
  const cutoff = now - UNCONSENTED_CLIENT_MAX_AGE_MS;
  const [result] = await runBatch([
    sql`DELETE FROM oauth_client
        WHERE COALESCE(created_at, 0) < ${cutoff}
          AND NOT EXISTS (SELECT 1 FROM oauth_consent c WHERE c.client_id = oauth_client.client_id)`,
  ]);
  return result?.meta.changes ?? 0;
}
