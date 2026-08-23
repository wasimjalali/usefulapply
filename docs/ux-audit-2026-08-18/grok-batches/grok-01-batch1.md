# Batch 1 of 3: P0 and P1 bugs (B1 to B10)

Fix these ten defects, in this order. Full repro, evidence and confirmed cause for each are in `docs/ux-audit-2026-08-18/bugs.md`. Read that entry before touching a bug. Anchors below are starting points, not the full list of files.

Verify each fix against its repro where you can, not just by reading the code. Report in the exact format from the kickoff prompt.

---

## B1. Monthly credit reset never runs (P0, billing, approach is decided, do not deviate)

Decision from Wasim and the reviewer. Implement exactly this:

1. **Sweep function.** In `src/db/repos/credits.ts`, next to `processMonthlyReset` (line ~450), add and export `processOverdueMonthlyResets(options: { limit: number })`. It selects `user_id` from `user_credits` where `plan_tier = 'free'` AND `next_reset_date < now` (ISO string compare, `nowIso()` is already in that file), ordered by `next_reset_date` ascending, limited to `options.limit`. For each row call the existing `processMonthlyReset(userId)`. Return `{ attempted, succeeded, failed, errors: string[] }`. Do not swallow errors, collect them. **Scope is free tier only.** Paid tiers are reset by the Stripe `invoice.payment_succeeded` webhook (`applyRenewalReset` in the same file, wired in `src/app/api/stripe/webhook/route.ts:414`), so the sweep must not touch `plus` or `max` rows.
2. **Re-export** it from `src/lib/supabase/credits.server.ts` next to `processMonthlyReset`.
3. **Cron wiring.** In `src/cron/index.ts`, the `CRON_DAILY_CLEANUP` (`0 3 * * *`) case currently only runs `cleanupHistoricalJobFeedData`. Make it also run the sweep, following the same pattern the ten-minute case uses: lazy import, `Promise.allSettled` over both, log the sweep result with `console.log('[cron] monthly credit reset sweep', result)`, throw if any settled rejected, and also throw if `result.attempted > 0 && result.succeeded === 0` (a run where every attempt failed is a failed run). Limit 200 per run.
4. **wrangler.jsonc.** In `triggers.crons` uncomment only `"0 3 * * *"`. Leave the other three commented. Update the comment block above it to say the daily trigger is live for the credit reset sweep and job-feed cleanup, and the other three stay off until Phase 9. Keep the comment factual and short.
5. **No backfill from you.** Do not run any UPDATE against D1. The reviewer runs the backfill with Wasim. Your job is the code path.

Verify: `npx tsc --noEmit`, plus a read-only D1 count so the reviewer can compare later:
`npx wrangler d1 execute usefulapply-db --remote --json --command "SELECT plan_tier, COUNT(*) AS n FROM user_credits WHERE next_reset_date < strftime('%Y-%m-%dT%H:%M:%fZ','now') GROUP BY plan_tier"`
Paste the result. If you can run the scheduled handler locally (`npx wrangler dev --test-scheduled` after `npx opennextjs-cloudflare build`, then `curl "http://localhost:8787/__scheduled?cron=0+3+*+*+*"`) do it **against local D1 only**, never `--remote`, and report what happened. If that is not practical, say "code-level only, needs reviewer".

## B2. Header credit balance is stale until reload (P1)

Anchor: `src/components/ui/CreditIndicator.tsx` (fetches `/api/credits/balance`, listens for `CREDIT_UPDATE_EVENT`), `src/hooks/useAgentV2.ts` (`workflow_complete` at ~line 320, `step_complete` ~291), `src/components/ChatPanel.tsx`. Find where credits are actually deducted server-side for fit analysis, full generation and the feed-card actions, and make sure the client dispatches `CREDIT_UPDATE_EVENT` (or whatever the existing refresh mechanism is) when each of those completes, including the feed-card Check Fit and Generate Kit paths and the direct Generate Kit path. Prefer reusing the existing event over adding a new mechanism. If the SSE completion payload already carries a balance, use it. Verify by reading which paths dispatch and which did not; list them.

## B3. "Generating your full application..." survives a refused generation (P1)

Anchor: `src/components/ChatPanel.tsx:529` (optimistic message). When the server refuses (insufficient credits, paywall shown) the optimistic message must be removed or replaced with a short neutral line, and it must not be persisted so it does not survive reload. Trace how the paywall/insufficient-credits path returns to the chat and where messages get persisted. Verify by reading the failure path end to end and describe it.

## B4. Generating a kit records the tracker row as "Applied" (P1)

Find where the tracker/application row is created when a kit is generated (grep `'applied'` in `src/db/repos/`, `src/lib/`, `src/app/api/`; look at `src/lib/supabase/types.ts:718` for the status union and `src/components/TrackerPanel.tsx`). Default the row to a pre-send status. Check what statuses the tracker UI, filters and counts already understand. If a "drafted" (or equivalent) status already exists in the union, use it. If it does not, adding a new string value to a TypeScript union and to the UI filter is fine, but **no D1 schema change**: check `src/db/schema.ts` to confirm the status column has no CHECK constraint or enum. If it does have one, stop and mark B4 deferred with the reason. Also make sure the user can still move the row to Applied manually. Verify the tracker still renders every existing status.

## B5. Pricing and plan table say Smart Job Feed is not on Free (P1, copy only)

Confirmed intended: Free includes an automatic top-5 daily feed. Fix the copy in `src/components/settings/SubscriptionSection.tsx:243` (`free: false` should become a short truthful string like `'5/day'`), `src/app/pricing/page.tsx` (~line 249, the Free plan feature list needs a feed line), and check `src/lib/stripe.ts:85,100` plan descriptions and `src/app/ai-job-application/pricing-credits/page.tsx` for the same lie. Do not change any gate or logic. Verify by grepping "Smart Job Feed" across `src` and confirming every Free-tier mention is now truthful.

## B6. Subscription page prints balance where the allowance belongs (P1)

`src/app/subscription/page.tsx` and/or `src/components/settings/SubscriptionSection.tsx`. "Monthly:" must show the plan allowance (Free 4, Plus 50, Max 200), not `monthly_credits` (which is the remaining balance). Source the allowance from the plan config the app already uses (look at how `credits_monthly` / plan tables are exposed, `src/lib/stripe.ts`, `src/db/repos/subscriptions.ts`). Do not hardcode numbers in the component if a plan source is already available to it. Verify: state what the page will show for each tier.

## B7. Marketing header ignores the session (P1)

`src/components/marketing/Navbar.tsx`. Signed-in users should see a route back to the app (for example "Dashboard" replacing "Log in" and "Try It Free"). Find how other client components learn about the session (grep for the auth context / `useSession` / the `usefulapply.session` cookie usage) and reuse that. Keep the anonymous state exactly as it is. Verify signed-out rendering is unchanged (tsc plus reading), and describe how the signed-in state is derived so the reviewer can test it in the browser.

## B8. /login and /signup return 404 (P1)

Add permanent redirects `/login` to `/auth/login` and `/signup` to `/auth/signup`. `next.config.*` already has a `redirects()` block at ~line 32; add there. Check `src/middleware.ts` does not intercept these paths first. Verify with `npm run dev` and `curl -I http://localhost:3000/login` (expect 308 to /auth/login), or explain why you could not.

## B9. Job feed dedupe misses near-identical listings (P1)

Anchor: `src/lib/job-feed/helpers.ts`, `src/lib/job-feed/ingestion.ts`, `src/lib/job-feed/server.ts` (grep `dedup`). Normalise the company string before comparing: lowercase, trim, strip punctuation, strip legal suffixes (LLC, L.L.C., Inc, Inc., Ltd, Limited, GmbH, Corp, Corporation, Co, Company, PLC, AG, SA, BV, and the leading "The"). Dedupe on normalised company + normalised title + salary range (when both have salary), and treat different locations of the same normalised company+title+salary as duplicates. Keep it a small pure function with a unit-style check you actually run (a quick `npx tsx` script in the scratchpad is fine, paste the output). Do not touch ranking or the LLM prompt.

## B10. Direct Generate Kit spends 2 credits on a poor match with no warning (P1)

This is the feed-card direct "Generate Kit" path (see `src/components/job-feed/feed-card-actions.ts` and where the card triggers generation). Repo rule: quality over cost, and the LLM already produces a fit score in the fit-first path. Minimal guard rail: after generation completes on the direct path, if the resulting fit/ATS score is below a threshold (use the same threshold the fit-first path uses for a "poor match" verdict, find it in `src/lib/agents/prompts/fit-assessment-prompt.ts` or the fit result types), show a clear inline warning in the result and in the completion toast/message. Do not add a blocking pre-check that costs an extra credit and do not change credit costs. If the direct path has no score available at all, say so and propose the smallest change that would surface one, then stop and mark B10 partial. Verify by describing the exact UI text and where it appears. No em dashes.

---

When done, produce the report exactly in the kickoff format, all ten bugs, then the Checks block and Open questions.
