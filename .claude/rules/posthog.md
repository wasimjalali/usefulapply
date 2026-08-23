---
paths:
  - "src/lib/posthog/**/*.ts"
  - "src/lib/posthog/**/*.tsx"
  - "src/components/**/*PostHog*"
---

# PostHog Integration Rules

## Usage

- PostHog is used for analytics, error tracking, and LLM cost tracking
- Client-side: use `posthog-js` for event capture and feature flags
- Server-side: use the PostHog Node SDK from route handlers via `getPostHogServer()` in `src/lib/posthog-server.ts`. Call `capture` / `captureException` then `await posthog.flush()` before the handler returns. There is no Vercel `waitUntil`.
- Hosting is Cloudflare Workers via `@opennextjs/cloudflare`, not Vercel. Worker and cron diagnostics live in Workers Logs (`wrangler.jsonc` `observability.enabled`). PostHog is product analytics and exception capture, not the Worker log sink.
- `NEXT_PUBLIC_POSTHOG_KEY` stays the same across the rebrand so existing event history continues.

## LLM Cost Tracking

- Track LLM costs with `$ai_generation` events including model, tokens, and cost
- Include `input_tokens`, `output_tokens`, `model`, and `cost_usd` properties

## Privacy

- Never send PII in event properties (no passwords, no full email addresses)
- Error tracking should capture enough context to debug without exposing user data
- Use anonymous/hashed identifiers where possible
