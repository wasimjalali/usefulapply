---
paths:
  - "src/app/api/stripe/**/*.ts"
  - "src/lib/supabase/credits.ts"
  - "src/app/api/agent-v2/**/*.ts"
  - "src/app/api/regenerate/**/*.ts"
---

# Stripe & Credits Rules

## Authentication

- `userId` always comes from `supabase.auth.getUser()` — NEVER from the request body
- Never trust client-sent userId for credit operations

## Credit Deduction

- Use optimistic concurrency for `deductCredits()`: check balance, deduct, verify
- Credit costs are defined in `src/lib/supabase/credits.ts` — this is the single source of truth
- Never modify credit amounts without explicit human confirmation

## Stripe Webhooks

- Always verify webhook signature via `stripe.webhooks.constructEvent()`
- Use idempotency keys for webhook processing to prevent double-processing
- Never process a webhook event without signature verification

## Subscription Tiers (reference)

| Tier | Credits/month | Price |
|------|---------------|-------|
| Free | 4 | $0 |
| Plus | 50 | $19.99 |
| Max | 200 | $79.99 |
| Add-on Pack | 25 | $19.99 |
