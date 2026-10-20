import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, runBatch } from '../client';
import { mcpGrantState, mcpTokenGeneration, oauthClient, oauthConsent, oauthRefreshToken, profiles, user } from '../schema';

/**
 * Connected apps: the OAuth clients a user has authorised for MCP, and the
 * checks the /mcp token verifier makes.
 *
 * Better Auth cannot revoke a JWT access token, so revoking a client runs one
 * D1 batch: delete its access and refresh tokens, its consent (the next
 * authorise asks again), the token bindings, and any authorization codes issued
 * but not yet exchanged, and write `revoked_at` (kept for the record; nothing
 * reads it).
 *
 * Every token is bound to a consent "generation" (the consent row's id, see
 * mcpTokenGeneration). /mcp refuses an access token when
 *   - its generation is not the current consent's id (revoked, or revoked and
 *     reconnected), or
 *   - there is no consent, or
 *   - it carries a scope the current consent does not include,
 * so a token dies within GRANT_CACHE_TTL_MS of a revoke and cannot come back
 * when the user reconnects, however late its exchange finished.
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
  /** Scopes of the user's current consent for this client, or null when there is none. */
  consentScopes: string[] | null;
  /** The current consent row's id (the generation tokens must be bound to), or null when there is none. */
  consentId: string | null;
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

/** `fresh` skips the cache, for re-checking a token the cached state would refuse. */
export async function getGrantState(userId: string, clientId: string, fresh = false): Promise<GrantState> {
  const key = cacheKey(userId, clientId);
  const hit = grantCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < GRANT_CACHE_TTL_MS) return hit.state;

  const db = await getDb();
  const rows = await db
    .select({ revokedAt: mcpGrantState.revoked_at, lastUsedAt: mcpGrantState.last_used_at })
    .from(mcpGrantState)
    .where(and(eq(mcpGrantState.user_id, userId), eq(mcpGrantState.client_id, clientId)))
    .limit(1);
  const owner = await db.select({ id: user.id }).from(user).where(eq(user.id, userId)).limit(1);
  const consent = await db
    .select({ id: oauthConsent.id, scopes: oauthConsent.scopes })
    .from(oauthConsent)
    .where(and(eq(oauthConsent.userId, userId), eq(oauthConsent.clientId, clientId)))
    .limit(1);
  const state: GrantState = {
    revokedAt: rows[0]?.revokedAt ?? null,
    lastUsedAt: rows[0]?.lastUsedAt ?? null,
    consentScopes: consent[0] ? parseScopes(consent[0].scopes) : null,
    consentId: consent[0]?.id ?? null,
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

/**
 * Why a token with this generation and these scopes may not use /mcp, or null
 * when it may. `generation` is what the token was bound to (null: unbound).
 */
export function grantProblem(
  state: GrantState,
  generation: string | null,
  tokenScopes: readonly string[],
): string | null {
  if (state.userMissing || state.consentId === null || state.consentScopes === null) return 'This app was disconnected';
  if (generation === null || generation !== state.consentId) return 'This app was disconnected';
  const consented = new Set(state.consentScopes);
  if (tokenScopes.some((scope) => !consented.has(scope))) {
    return 'The access token has more access than this app was approved for';
  }
  return null;
}

// Bindings never change once written, so a hit is cached; a miss is not (it may be about to be written).
const globalForBindings = globalThis as typeof globalThis & { __uaMcpBindingCache?: Map<string, { at: number; consentId: string }> };
const bindingCache: Map<string, { at: number; consentId: string }> = (globalForBindings.__uaMcpBindingCache ??= new Map());

/** The consent generation a token (`at:<jti>` or `rt:<hash>`) was issued under, or null if it was never bound. */
export async function getTokenGeneration(tokenKey: string, fresh = false): Promise<string | null> {
  const hit = bindingCache.get(tokenKey);
  if (!fresh && hit && Date.now() - hit.at < GRANT_CACHE_TTL_MS) return hit.consentId;
  const db = await getDb();
  const rows = await db
    .select({ consentId: mcpTokenGeneration.consent_id })
    .from(mcpTokenGeneration)
    .where(eq(mcpTokenGeneration.token_key, tokenKey))
    .limit(1);
  if (!rows[0]) return null;
  bindingCache.set(tokenKey, { at: Date.now(), consentId: rows[0].consentId });
  if (bindingCache.size > 10_000) {
    for (const [k, v] of bindingCache) {
      if (Date.now() - v.at >= GRANT_CACHE_TTL_MS) bindingCache.delete(k);
    }
  }
  return rows[0].consentId;
}

export interface TokenBinding {
  tokenKey: string;
  consentId: string;
  userId: string;
  clientId: string;
  /** Epoch ms after which the token cannot be used anyway, so the row can be purged. */
  expiresAt: number;
}

export async function bindTokens(bindings: TokenBinding[]): Promise<void> {
  if (bindings.length === 0) return;
  const db = await getDb();
  await db
    .insert(mcpTokenGeneration)
    .values(
      bindings.map((b) => ({
        token_key: b.tokenKey,
        consent_id: b.consentId,
        user_id: b.userId,
        client_id: b.clientId,
        expires_at: b.expiresAt,
      })),
    )
    // A replayed refresh response re-binds the same tokens to the same generation.
    .onConflictDoNothing();
}

/** Bring a binding's expiry forward (never later), e.g. for a refresh token that was just rotated out. */
export async function shortenTokenBinding(tokenKey: string, expiresAt: number): Promise<void> {
  await runBatch([
    sql`UPDATE mcp_token_generation SET expires_at = MIN(expires_at, ${expiresAt}) WHERE token_key = ${tokenKey}`,
  ]);
}

/** Daily cleanup: bindings of tokens that have expired. */
export async function purgeExpiredTokenBindings(now = Date.now()): Promise<number> {
  const [result] = await runBatch([sql`DELETE FROM mcp_token_generation WHERE expires_at < ${now}`]);
  return result?.meta.changes ?? 0;
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
    // Access tokens first, then refresh tokens (access tokens also cascade from them).
    sql`DELETE FROM oauth_access_token WHERE user_id = ${userId} AND client_id = ${clientId}`,
    sql`DELETE FROM oauth_refresh_token WHERE user_id = ${userId} AND client_id = ${clientId}`,
    sql`DELETE FROM oauth_consent WHERE user_id = ${userId} AND client_id = ${clientId}`,
    sql`DELETE FROM mcp_token_generation WHERE user_id = ${userId} AND client_id = ${clientId}`,
    // Authorization codes issued but not yet exchanged live in `verification` as JSON
    // (identifier is the hashed code; value holds the user and the original query).
    // json_valid in a CASE because other rows in that table are not JSON and SQLite
    // does not promise to short-circuit an AND.
    sql`DELETE FROM verification
        WHERE CASE WHEN json_valid(value) THEN json_extract(value, '$.userId') END = ${userId}
          AND CASE WHEN json_valid(value) THEN json_extract(value, '$.query.client_id') END = ${clientId}`,
    sql`INSERT INTO mcp_grant_state (user_id, client_id, revoked_at) VALUES (${userId}, ${clientId}, ${now})
        ON CONFLICT (user_id, client_id) DO UPDATE SET revoked_at = excluded.revoked_at`,
  ]);
  grantCache.set(cacheKey(userId, clientId), {
    at: now,
    state: { revokedAt: now, lastUsedAt: null, consentScopes: null, consentId: null },
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
  // One client failing must not leave the others connected: try them all, then report.
  const errors: unknown[] = [];
  for (const clientId of clientIds) {
    try {
      await revokeConnectedApp(userId, clientId);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, `Revoking ${errors.length} of ${clientIds.length} connected apps failed`);
  }
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
