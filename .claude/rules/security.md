---
paths:
  - "src/app/api/**/*.ts"
---

# API Route Security Pattern

Every API route must follow this checklist in order:

1. **Authenticate** via `getCurrentUser()` from `@/auth/server` (Better Auth session) — reject if no user
2. **Rate limit** via `rateLimiter.check()` — return 429 on excess
3. **Validate inputs** — check string lengths, required fields, enum values
4. **Return generic errors** — never expose `error.message`, stack traces, or internal details to clients

## Hard Rules

- `userId` always comes from the authenticated session — NEVER from the request body
- Never hardcode secrets or API keys in client-side code
- Never expose internal error messages — always return generic "Something went wrong" style messages
- Never skip authentication on any API route (except public health checks)
- Watch for: SQL injection, XSS, unprotected routes, Stripe webhook bypass
- Stripe webhooks must verify signature via `stripe.webhooks.constructEvent()` before processing
