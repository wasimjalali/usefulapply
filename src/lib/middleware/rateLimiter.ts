/**
 * Rate limiter. Uses the Workers Rate Limiting binding when present,
 * otherwise the original in-memory sliding window (plain `next dev`).
 */

import { getCloudflareContext } from '@opennextjs/cloudflare';

interface RateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  for (const [key, entry] of store.entries()) {
    // Keep timestamps for the longest window used by this key. Individual
    // route checks still apply the active config before allowing a request.
    entry.timestamps = entry.timestamps.filter(t => now - t < entry.windowMs);
    if (entry.timestamps.length === 0) {
      store.delete(key);
    }
  }
}

interface RateLimitConfig {
  /** Bucket name, used to pick the Workers Rate Limiting binding. Set on every RATE_LIMITS entry. */
  name?: string;
  /** Max requests allowed in the window */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs?: number;
}

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

// Workers Rate Limiting `simple.period` is 10 or 60 seconds only.
const BINDING_WINDOW_MS = 60_000;

const RATE_LIMIT_BINDING_NAMES = {
  'agent-v2': 'RATE_LIMIT_AGENT_V2',
  'parse-cv': 'RATE_LIMIT_PARSE_CV',
  'chat': 'RATE_LIMIT_CHAT',
  'contact': 'RATE_LIMIT_CONTACT',
  'generate-pdf': 'RATE_LIMIT_GENERATE_PDF',
  'regenerate': 'RATE_LIMIT_REGENERATE',
  'signup': 'RATE_LIMIT_SIGNUP',
  'signin': 'RATE_LIMIT_SIGNIN',
  'forgot-password': 'RATE_LIMIT_FORGOT_PASSWORD',
  'post-confirm': 'RATE_LIMIT_POST_CONFIRM',
  'job-feed-settings': 'RATE_LIMIT_JOB_FEED_SETTINGS',
  'job-feed-overview': 'RATE_LIMIT_JOB_FEED_OVERVIEW',
  'job-feed-saved': 'RATE_LIMIT_JOB_FEED_SAVED',
  'job-feed-feedback': 'RATE_LIMIT_JOB_FEED_FEEDBACK',
  'job-feed-apply': 'RATE_LIMIT_JOB_FEED_APPLY',
  'job-feed-run': 'RATE_LIMIT_JOB_FEED_RUN',
  'job-feed-dev-run': 'RATE_LIMIT_JOB_FEED_DEV_RUN',
  'job-feed-inbox': 'RATE_LIMIT_JOB_FEED_INBOX',
  'credits-balance': 'RATE_LIMIT_CREDITS_BALANCE',
  'delete-account': 'RATE_LIMIT_DELETE_ACCOUNT',
  'create-checkout': 'RATE_LIMIT_CREATE_CHECKOUT',
  'create-addon-checkout': 'RATE_LIMIT_CREATE_ADDON_CHECKOUT',
  'create-portal': 'RATE_LIMIT_CREATE_PORTAL',
  'job-feed-apply-gen': 'RATE_LIMIT_JOB_FEED_APPLY_GEN',
  'job-feed-apply-status': 'RATE_LIMIT_JOB_FEED_APPLY_STATUS',
  'career-profile-generate': 'RATE_LIMIT_CAREER_PROFILE_GENERATE',
  'anon-parse-minute': 'RATE_LIMIT_ANON_PARSE',
  'search-strategy-generate': 'RATE_LIMIT_SEARCH_STRATEGY_GENERATE',
  'files-upload': 'RATE_LIMIT_FILES_UPLOAD',
  'files-get': 'RATE_LIMIT_FILES_GET',
} as const;

type BoundRateLimitRoute = keyof typeof RATE_LIMIT_BINDING_NAMES;

declare global {
  interface CloudflareEnv {
    RATE_LIMIT_AGENT_V2?: RateLimitBinding;
    RATE_LIMIT_PARSE_CV?: RateLimitBinding;
    RATE_LIMIT_CHAT?: RateLimitBinding;
    RATE_LIMIT_CONTACT?: RateLimitBinding;
    RATE_LIMIT_GENERATE_PDF?: RateLimitBinding;
    RATE_LIMIT_REGENERATE?: RateLimitBinding;
    RATE_LIMIT_SIGNUP?: RateLimitBinding;
    RATE_LIMIT_SIGNIN?: RateLimitBinding;
    RATE_LIMIT_FORGOT_PASSWORD?: RateLimitBinding;
    RATE_LIMIT_POST_CONFIRM?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_SETTINGS?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_OVERVIEW?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_SAVED?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_FEEDBACK?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_APPLY?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_RUN?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_DEV_RUN?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_INBOX?: RateLimitBinding;
    RATE_LIMIT_CREDITS_BALANCE?: RateLimitBinding;
    RATE_LIMIT_DELETE_ACCOUNT?: RateLimitBinding;
    RATE_LIMIT_CREATE_CHECKOUT?: RateLimitBinding;
    RATE_LIMIT_CREATE_ADDON_CHECKOUT?: RateLimitBinding;
    RATE_LIMIT_CREATE_PORTAL?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_APPLY_GEN?: RateLimitBinding;
    RATE_LIMIT_JOB_FEED_APPLY_STATUS?: RateLimitBinding;
    RATE_LIMIT_CAREER_PROFILE_GENERATE?: RateLimitBinding;
    RATE_LIMIT_ANON_PARSE?: RateLimitBinding;
    RATE_LIMIT_SEARCH_STRATEGY_GENERATE?: RateLimitBinding;
    RATE_LIMIT_FILES_UPLOAD?: RateLimitBinding;
    RATE_LIMIT_FILES_GET?: RateLimitBinding;
  }
}

function bucketForConfig(config: RateLimitConfig): BoundRateLimitRoute | null {
  // Match by name, not object identity: bundlers can duplicate this module so the
  // RATE_LIMITS object a route imports is not the same instance as the one here.
  if (config.name && config.name in RATE_LIMIT_BINDING_NAMES) {
    return config.name as BoundRateLimitRoute;
  }
  return null;
}

async function getRateLimitBinding(bucket: BoundRateLimitRoute): Promise<RateLimitBinding | undefined> {
  let env: CloudflareEnv;
  try {
    ({ env } = await getCloudflareContext({ async: true }));
  } catch {
    // Not running under OpenNext (plain Next server or a non-Cloudflare build). Use the in-memory limiter.
    return undefined;
  }
  const bindingName = RATE_LIMIT_BINDING_NAMES[bucket];
  const binding = env[bindingName];
  if (!binding && !warnedMissingBinding.has(bucket)) {
    warnedMissingBinding.add(bucket);
    console.warn(`[rateLimiter] no ${bindingName} binding, using in-memory limiter for ${bucket}`);
  }
  return binding;
}
const warnedMissingBinding = new Set<string>();

function checkRateLimitMemory(key: string, config: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  cleanup();

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [], windowMs: config.windowMs };
    store.set(key, entry);
  } else {
    entry.windowMs = Math.max(entry.windowMs, config.windowMs);
  }

  // Remove timestamps outside the current window
  entry.timestamps = entry.timestamps.filter(t => now - t < config.windowMs);

  if (entry.timestamps.length >= config.limit) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = config.windowMs - (now - oldestInWindow);
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs,
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: config.limit - entry.timestamps.length,
  };
}

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key - Unique identifier (e.g., "agent-v2:{ip}" or "contact:{ip}")
 * @param config - Rate limit configuration (pass a `RATE_LIMITS` entry)
 * @returns Whether the request is allowed and remaining quota
 */
export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const bucket = bucketForConfig(config);
  if (bucket && config.windowMs === BINDING_WINDOW_MS) {
    const limiter = await getRateLimitBinding(bucket);
    if (limiter) {
      const { success } = await limiter.limit({ key });
      if (!success) {
        return { allowed: false, remaining: 0, retryAfterMs: config.windowMs };
      }
      return { allowed: true, remaining: Math.max(0, config.limit - 1) };
    }
  }

  return checkRateLimitMemory(key, config);
}

/**
 * Extract client IP from request headers.
 * On Cloudflare Workers only `cf-connecting-ip` is set by the edge and cannot be
 * spoofed by the client. `x-forwarded-for` is client-controlled (Cloudflare appends
 * to it), so it is only a fallback for local dev and tests.
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip')?.trim() ||
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Pre-configured rate limits per route
export const RATE_LIMITS = {
  'agent-v2':           { name: 'agent-v2', limit: 5,  windowMs: 60_000 },
  'parse-cv':           { name: 'parse-cv', limit: 10, windowMs: 60_000 },
  'chat':               { name: 'chat', limit: 20, windowMs: 60_000 },
  'contact':            { name: 'contact', limit: 3,  windowMs: 60_000 },
  'generate-pdf':       { name: 'generate-pdf', limit: 10, windowMs: 60_000 },
  'regenerate':         { name: 'regenerate', limit: 10, windowMs: 60_000 },
  'signup':             { name: 'signup', limit: 3,  windowMs: 60_000 },
  'signin':             { name: 'signin', limit: 5,  windowMs: 60_000 },
  'forgot-password':    { name: 'forgot-password', limit: 5,  windowMs: 60_000 },
  'post-confirm':       { name: 'post-confirm', limit: 5,  windowMs: 60_000 },
  'job-feed-settings':  { name: 'job-feed-settings', limit: 10, windowMs: 60_000 },
  'job-feed-overview':  { name: 'job-feed-overview', limit: 15, windowMs: 60_000 },
  'job-feed-saved':     { name: 'job-feed-saved', limit: 15, windowMs: 60_000 },
  'job-feed-feedback':  { name: 'job-feed-feedback', limit: 20, windowMs: 60_000 },
  'job-feed-apply':     { name: 'job-feed-apply', limit: 10, windowMs: 60_000 },
  'job-feed-run':       { name: 'job-feed-run', limit: 2,  windowMs: 60_000 },
  'job-feed-dev-run':   { name: 'job-feed-dev-run', limit: 3,  windowMs: 60_000 },
  'job-feed-inbox':     { name: 'job-feed-inbox', limit: 30, windowMs: 60_000 },
  'credits-balance':    { name: 'credits-balance', limit: 30, windowMs: 60_000 },
  'delete-account':     { name: 'delete-account', limit: 3,  windowMs: 60_000 },
  'create-checkout':         { name: 'create-checkout', limit: 5,  windowMs: 60_000 },
  'create-addon-checkout':   { name: 'create-addon-checkout', limit: 5,  windowMs: 60_000 },
  'create-portal':           { name: 'create-portal', limit: 3,  windowMs: 60_000 },
  'job-feed-apply-gen':      { name: 'job-feed-apply-gen', limit: 60, windowMs: 60_000 },
  'job-feed-apply-status':   { name: 'job-feed-apply-status', limit: 30, windowMs: 60_000 },
  'career-profile-generate': { name: 'career-profile-generate', limit: 6,  windowMs: 60_000 },
  'anon-parse':              { name: 'anon-parse', limit: 5,  windowMs: 3_600_000 }, // hourly cap is in-memory only (per isolate on Workers)
  'anon-parse-minute':       { name: 'anon-parse-minute', limit: 2,  windowMs: 60_000 },    // enforced by the Workers binding
  'search-strategy-generate': { name: 'search-strategy-generate', limit: 3,  windowMs: 60_000 },
  'files-upload':            { name: 'files-upload', limit: 10, windowMs: 60_000 },
  'files-get':               { name: 'files-get', limit: 60, windowMs: 60_000 },
} as const;

export type RateLimitRoute = keyof typeof RATE_LIMITS;
