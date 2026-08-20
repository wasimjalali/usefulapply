## Adversarial review - Useful Apply group 2 cycle 2

**Tier:** T3
**Model:** grok-4.5
**Lenses:** data-integrity
**Safe to ship?** YES

### Critical
None.

### High
None.

### Low
- **src/lib/job-feed/helpers.ts:369** (adjacent, paid settings path) - `consent_accepted: Boolean(payload.consent_accepted)` treats any truthy value (including the string `"false"`) as consent. The free run path correctly uses `=== true` (`run/route.ts:43`). Paid PUT `/api/job-feed/settings` is the only consumer; not exploitable for free provisioning, but inconsistent with the hard-boolean rule.
- **src/app/api/job-feed/dev/run/route.ts:53-59** - Debug workflow omits `consentAccepted`, so it defaults to `false`. It cannot invent consent (good). A free row that is withdrawn or paused fails with unmapped `JOB_FEED_CONSENT_REQUIRED` → opaque 500. Secret-gated; error-style only.
- **src/db/repos/jobFeed.ts:84-96** - `grantConsent` updates by `user_id` with no row-count check before re-read. Missing row fails loud via `getSettings` null throw. Fine; noted for completeness.

### Checked - OK
| Check | Result |
|-------|--------|
| Cycle 1 High 1: consented + enabled=false re-enables on explicit consent | OK - `ensureFreeFeedConsent` at `server.ts:1184-1190` returns early only when both set; otherwise requires `consentAccepted` then `grantConsent` (sets `enabled: true`). Does not throw paused. |
| Cycle 1 High 2: existing/raced rows re-check consent | OK - `server.ts:148-149` existing → `ensureFreeFeedConsent`; `server.ts:184-186` raced → `ensureFreeFeedConsent`. |
| Cycle 1 High 3: enumeration matcher not HTTP 404 / free text | OK - `signup/route.ts:98-100`: only `body.code === 'USER_NOT_FOUND'` or `status === 'NOT_FOUND'` (string). Numeric 404 alone does not match. |
| Consent not invented on provision | OK - `server.ts:152-154` throws without assertion; timestamp stamped only after gate (`164`). Workflow gates at `1225-1227` before calling provision with `{ consentAccepted: true }`. |
| `consentAccepted` coercion strict | OK - `run/route.ts:43` uses `=== true`, not truthy. Empty/non-JSON body stays false. |
| `grantConsent` mass assignment | OK - `jobFeed.ts:88-92` sets only `consent_accepted_at`, `enabled`, `updated_at`. |
| `withdrawConsent` column scope | OK - `jobFeed.ts:70-74` clears `consent_accepted_at`, sets `enabled: false`, bumps `updated_at` only. |
| Withdraw response leak | OK - route returns `{ withdrawn: true }` only (`consent/withdraw/route.ts:43`); discards repo row. |
| userId from session only | OK - withdraw and run use `getCurrentUser` → `user.id`; no body userId. |
| Static scan (secrets/eval/innerHTML/service_role) | OK - clean on added lines. Debug secret is env-backed + `timingSafeEqual`. |
| Free overview after withdraw still runnable | OK - free branch in `getJobFeedOverviewState` never maps `!enabled` to `paused`; build/run path re-grants via `ensureFreeFeedConsent`. |

### Cycle 1 Highs - disproved (do not re-raise)
1. **Paused after consent:** `server.ts:1184-1190` - `if (settings.consent_accepted_at && settings.enabled) return settings;` then `if (!consentAccepted) throw ...;` else `grantConsent` which sets `enabled: true` (`jobFeed.ts:89-91`).
2. **Raced/withdrawn row:** `server.ts:148-149` and `184-186` both call `ensureFreeFeedConsent(...)`.
3. **Enumeration over-match:** `signup/route.ts:98-100` - `record.body?.code === 'USER_NOT_FOUND'` / `status === 'NOT_FOUND'` only.

### Merge blockers (if NO)
None from this lens.
