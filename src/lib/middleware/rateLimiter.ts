/**
 * In-memory sliding window rate limiter.
 * Zero dependencies, works on Vercel serverless.
 * Resets on cold start — still prevents active abuse during a warm instance.
 */

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

/**
 * Check if a request is allowed under the rate limit.
 *
 * @param key - Unique identifier (e.g., "agent-v2:{ip}" or "contact:{ip}")
 * @param config - Rate limit configuration
 * @returns Whether the request is allowed and remaining quota
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
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
 * Extract client IP from request headers (Vercel provides x-forwarded-for).
 */
export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// Pre-configured rate limits per route
export const RATE_LIMITS = {
  'agent-v2':           { limit: 5,  windowMs: 60_000 },
  'parse-cv':           { limit: 10, windowMs: 60_000 },
  'chat':               { limit: 20, windowMs: 60_000 },
  'contact':            { limit: 3,  windowMs: 60_000 },
  'generate-pdf':       { limit: 10, windowMs: 60_000 },
  'regenerate':         { limit: 10, windowMs: 60_000 },
  'signup':             { limit: 3,  windowMs: 60_000 },
  'post-confirm':       { limit: 5,  windowMs: 60_000 },
  'job-feed-settings':  { limit: 10, windowMs: 60_000 },
  'job-feed-overview':  { limit: 15, windowMs: 60_000 },
  'job-feed-saved':     { limit: 15, windowMs: 60_000 },
  'job-feed-feedback':  { limit: 20, windowMs: 60_000 },
  'job-feed-apply':     { limit: 10, windowMs: 60_000 },
  'job-feed-run':       { limit: 2,  windowMs: 60_000 },
  'job-feed-dev-run':   { limit: 3,  windowMs: 60_000 },
  'job-feed-inbox':     { limit: 30, windowMs: 60_000 },
  'credits-balance':    { limit: 30, windowMs: 60_000 },
} as const;

export type RateLimitRoute = keyof typeof RATE_LIMITS;
