---
description: PostHog analytics rules
globs: ["src/providers/PostHog*", "src/lib/posthog-server.ts", "src/app/api/**"]
---

# PostHog Rules

## Client-Side Init Pattern
PostHog must be initialized at **module scope** (not inside `useEffect`):
```typescript
// CORRECT — module scope with guard
if (typeof window !== 'undefined') {
  posthog.init(key, { ... });
}

// WRONG — causes race condition with session recording
useEffect(() => { posthog.init(...); }, []);
```
The `useEffect` pattern causes: PHProvider receives uninitialised client → session recording script loads → crashes with "Called on script loaded before session recording is available".

## LLM Analytics — Required Properties for `$ai_generation`
Every agent step must emit ALL 12 properties (enables all 9 PostHog LLM dashboard insights):

| Property | Value |
|----------|-------|
| `$ai_provider` | `'anthropic'` |
| `$ai_model` | `'claude-sonnet-4-6'` |
| `$ai_input_tokens` | from step tokens |
| `$ai_output_tokens` | from step tokens |
| `$ai_input_cost_usd` | input tokens × $3/1M |
| `$ai_output_cost_usd` | output tokens × $15/1M |
| `$ai_total_cost_usd` | input_cost + output_cost |
| `$ai_is_error` | `false` on success, `true` on error |
| `$ai_http_status` | `200` on success, `500` on error |
| `$ai_trace_id` | `trace_{uuid}` — unique per request, shared across all steps |
| `$ai_latency` | seconds from step_started to step_completed |
| `$ai_error` | error message (only on errors) |

## Helpers Pattern (in API routes)
Use `trackLLMStep` and `trackLLMError` helpers defined at the top of each route — do not inline `$ai_generation` calls.

## Trace IDs
Each API request generates one `trace_{uuid}` shared across all steps — enables Traces view grouping.
`stepStartTimes` Map tracks `step_started` timestamp per step name for latency calculation.

## Error Tracking
Both routes emit `$ai_generation` with `$ai_is_error: true` on:
- Individual step errors (`step_error` events from agent)
- Top-level workflow/regeneration catch blocks

## Privacy
- `$ai_input` / `$ai_output_choices` — do NOT send prompts or responses to PostHog
- User identity: `posthog.identify(userId, { email, plan })` on auth state change; `posthog.reset()` on sign out

## Environment Guard
Always guard PostHog init against missing env var:
```typescript
if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  // return no-op client, don't throw
}
```

## Reverse Proxy
Client events route through `/ingest/*` → PostHog (configured in `next.config.ts`) to bypass ad blockers.
