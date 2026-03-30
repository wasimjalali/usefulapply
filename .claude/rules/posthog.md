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
- Server-side: use PostHog Node SDK for API route analytics

## LLM Cost Tracking

- Track LLM costs with `$ai_generation` events including model, tokens, and cost
- Include `input_tokens`, `output_tokens`, `model`, and `cost_usd` properties

## Privacy

- Never send PII in event properties (no passwords, no full email addresses)
- Error tracking should capture enough context to debug without exposing user data
- Use anonymous/hashed identifiers where possible
