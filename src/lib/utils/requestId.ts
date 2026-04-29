// Stable per-request id the client sends as x-request-id. API routes use
// it as an idempotency-key suffix so transient retries of the same
// workflow dedupe instead of double-charging credits.
export function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
