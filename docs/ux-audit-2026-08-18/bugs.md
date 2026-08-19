# Bug list, 18 August 2026

Defects found during the end-to-end UX audit on staging (usefulapply.com). These are things that are **wrong**, as distinct from things that are merely awkward. Friction and design issues live in `friction-log.md`.

Each entry has a repro, the evidence, and where the cause is if I confirmed it in code or in the database.

Severity: **P0** costs money or blocks the core job. **P1** actively misleads the user. **P2** visible defect with a workaround. **P3** cosmetic.

---

## P0

### B1. Monthly credit reset never runs. 29 of 38 users are overdue, including paying Max subscribers.

**Repro:** query `user_credits` on the staging D1.

```
total 38 | overdue 29 | current 9 | most recent reset 2026-08-13
overdue by tier: free 27 (min balance 0), max 2 (min balance 178)
oldest next_reset_date: 2026-03-01
```

Both audit accounts:

| account | tier | monthly_credits | last_reset_date | next_reset_date |
|---|---|---|---|---|
| wasim100ai@gmail.com | free | 0.5 | 2026-03-03 | 2026-04-03 |
| wasimjalali2004@gmail.com | max | 178 | 2026-03-01 | 2026-04-01 |

**Cause, confirmed in code:**
1. `processMonthlyReset()` in `src/db/repos/credits.ts:450` is exported and re-exported from `src/lib/supabase/credits.server.ts:9`, but **no route, job or scheduler calls it**. Grep across `src` returns only the definition and the re-export.
2. `wrangler.jsonc:321-328` has every cron trigger commented out, so `crons` is an empty array.

The 9 "current" users are simply accounts young enough that the `next_reset_date` written at signup (`credits.ts:146`, now + 1 month) has not passed yet. They will join the overdue set when it does.

**Impact:** two Max subscribers at $79.99/month have received no credits since March. Twenty-seven free users are stranded, which is why the free account in this audit could not complete a single application. This is the root cause of the "free tier cannot activate" finding in the friction log.

**Fix:** re-enable a daily cron and call `processMonthlyReset` for every user whose `next_reset_date` has passed, or do it lazily on credit read. Then backfill the 29 overdue accounts.

---

## P1

### B2. Credit balance in the header is stale until a page reload

**Repro:** note the header balance, run any credit-spending action, look at the header when it completes.

Measured on the Max account in one session:
- Started at 184, header showed 184
- Full generation (2.0) → header still 184, DB 182
- Check Fit from feed card (0.5) + Generate from fit (1.5) → header still 182, DB 180
- Direct Generate Kit (2.0) → header still 182, **DB 178**

The header was wrong by 4 credits and only corrected on reload. Reproduced identically on the free account (header "1 credits" while the DB and the paywall modal both said 0.5).

**Evidence:** `04-free-fit-analysis/04-fit-result-76pct.jpg`, `16-feed-card-actions/07-generate-direct-complete-42pct-ats-no-warning.jpg`

**Fix:** return the new balance in the SSE completion payload, or refetch the balance when a generation completes.

### B3. Chat says "Generating your full application..." after generation was refused, and never retracts it

**Repro:** on an account with insufficient credits, click Generate Kit. The paywall appears. Dismiss it.

The chat panel keeps the optimistic message "🚀 Generating your full application..." with no error state. It **survives a full page reload** and was still showing minutes later, while the Cover Letter panel simultaneously read "No cover letter yet".

**Evidence:** `05-free-application-kit/01-cover-letter-empty-state-popover-overlap.jpg`

### B4. Generating a kit records the job in the tracker as "Applied"

**Repro:** generate an application kit for any job, open Tracker.

The row appears immediately with status **Applied**, before the user has sent anything anywhere.

**Evidence:** `13-max-tracker/01-tracker-18-all-vs-10-jobs.jpg` (Pixellot, Aug 18, 2026, Applied)

**Fix:** default new rows to a pre-send status such as "Drafted".

### B5. Pricing and the in-app plan table say the Smart Job Feed is not available on Free. It is.

**Repro:** run the job feed on a free account.

It searches live and delivers a ranked top 5 with an "Upgrade to Plus" nudge. Pricing shows a dash for Free and the in-app comparison table shows ✕.

**Confirmed intended:** the free tier is meant to include a limited feed, so this is a copy defect, not a missing gate. `src/lib/job-feed/helpers.ts:156` states it outright: "Free users never go through settings setup. Their feed is automatic."

**Evidence:** `00-anonymous/02-pricing-scroll-01.jpg` vs `06-free-job-feed/04-feed-results-top.jpg`

**Fix:** update the pricing page row and the subscription comparison table to say Free includes a top-5 daily feed.

### B6. The subscription page prints the current balance where the plan allowance belongs

**Repro:** open /subscription.

Max shows "182 credits remaining" and directly beneath it "Monthly: **182**". It should read 200. Free showed "0.5 credits remaining / Monthly: 0.5" where it should read 4.

**Evidence:** `14-max-billing/01-subscription-max-monthly-label-BUG.jpg`, `08-free-billing-limits/02-subscription-free-0.5-credits.jpg`

### B7. Marketing site shows "Log in" and "Try It Free" to signed-in users

**Repro:** sign in, then visit usefulapply.com.

The header never reflects the session. A paying user has no route back to the app except typing /dashboard.

**Evidence:** `00-anonymous/01-landing-scroll-01.jpg`

### B8. /login returns 404

**Repro:** navigate to usefulapply.com/login.

The real route is `/auth/login`. The guessable URL hits the 404 page. Same for `/signup`.

**Evidence:** `99-misc/BUG-login-url-404.jpg`

### B9. Job feed dedupe misses near-identical listings

**Repro:** run the Max feed.

The 20-job feed had "Product Manager - B2B SaaS" at Avetta in positions 1, 2 and 5, with identical descriptions and the same 87.5K-180K salary, differing only in company string ("Avetta" vs "Avetta, LLC") and location. The completion modal reported **DUPLICATES: 1**.

**Evidence:** `12-max-job-feed/09-feed-results-duplicate-avetta-BUG.jpg`, `10-feed-results-third-avetta-duplicate.jpg`

**Fix:** normalise the company string (strip legal suffixes) and dedupe on company + title + salary.

### B10. Direct Generate Kit spends 2 credits on a poor match with no warning

**Repro:** on the job feed, press Generate Kit on a card without checking fit first.

A Product Marketing Manager role generated a full kit scoring **42% ATS** against a Product Manager CV. No warning before or after. The fit-first path would have flagged it; the direct path has no guard rail.

**Evidence:** `16-feed-card-actions/07-generate-direct-complete-42pct-ats-no-warning.jpg`

---

## P2

### B11. English CV renders with German section headings

**Repro:** upload an English CV, view the base or "Original" CV.

Headings render as **BERUFLICHES PROFIL, KERNKOMPETENZEN, SPRACHKENNTNISSE, BERUFSERFAHRUNG**, and the current-role date reads "January 2022 - Heute". The Optimized view renders correctly in English, so only the base render is affected.

**Intermittent.** Re-uploading the identical PDF to the same account later produced correct English headings, so language detection in the section splitter is non-deterministic rather than always wrong. Worth reproducing a few times before assuming a fix has worked.

**Evidence:** `09-max-account/02-dashboard-base-cv-german-headers-BUG.jpg`, `11-max-application-kit/12-original-cv-german-headers-BUG.jpg`

### B12. Template picker shows blank white cards for about eight seconds

**Repro:** open Templates on a generated CV.

Two full-height empty rectangles labelled "Premium ATS" and "Modern Professional". Previews paint roughly eight seconds later. The header says "6 Templates" but only two are reachable, with no scroll affordance or arrows.

**Evidence:** `11-max-application-kit/09-template-picker-blank-previews-BUG.jpg`, `10-template-picker-loaded-8s-later.jpg`

### B13. "Edit feed" has no exit once scrolled

**Repro:** Job Feed → Edit feed → scroll down.

The panel replaces the feed and its toolbar. Its only close control is a small × at the very top of a 2,798 px panel. Clicking the Job Feed tab does nothing because it is already active. The only ways out are scrolling back up or reloading.

**Evidence:** `12-max-job-feed/06-edit-feed-no-exit-BUG.jpg`

### B14. Job feed notification popover covers and swallows clicks on the Cover Letter and Email tabs

**Repro:** with a fresh feed available, open the Application Kit and click the Cover Letter or Email tab.

The "5 new roles for you today" popover renders over the tab strip and absorbs the click. Reproduced first try.

**Evidence:** `05-free-application-kit/01-cover-letter-empty-state-popover-overlap.jpg`

### B15. Job feed elapsed timer shows a carried-over value

**Repro:** run the feed on an account that has run it before.

Four seconds after clicking "Find jobs now" the panel read **"3m 0s elapsed"** with all four stage rows already ticked green while the header still said the feed was being built. A later run on a different account showed a correct timer, so this is stale state rather than a broken clock.

**Evidence:** `06-free-job-feed/02-building-feed-progress.jpg`

### B16. "Set up your daily feed" renders above a full feed of existing results

**Repro:** clear a paid account's `job_feed_settings` row, open the Job Feed tab.

The `setup_required` state shows "Set up your daily feed / Add your roles and timezone so Useful Apply knows what to look for" directly above 20 job cards from a previous run, under the heading "Choose roles · United States".

**Evidence:** `15-feed-first-run-setup/01-paid-setup-required-over-existing-feed-BUG.jpg`

### B17. Completing feed setup lands on a stale feed instead of running one

**Repro:** complete the first-run setup wizard on an account with an existing run today.

After "Build my feed" and the "Building your AI feed" card, the user lands on the previous feed labelled "Delivered 9:25 pm", timestamped before they set anything up.

**Evidence:** `15-feed-first-run-setup/06-paid-lands-on-stale-existing-feed.jpg`

### B18. Tracker header count contradicts the row count

**Repro:** open Tracker on the Max account.

The tab reads "18 ALL" while the line directly beneath reads "10 jobs".

**Evidence:** `13-max-tracker/01-tracker-18-all-vs-10-jobs.jpg`

### B19. Duplicate tracker rows

**Repro:** open Tracker on the free account.

"Agentic AI Software Engineer" appears twice, same company, same date, same 52% score.

**Evidence:** `07-free-tracker/01-tracker-list.jpg`

### B20. Auth pages carry the wrong browser title

**Repro:** open /auth/signup or /auth/forgot-password.

Both show **"Sign In | Useful Apply | Useful Apply"**. Wrong page name and the brand is duplicated.

### B21. /features renders blank at several scroll positions

**Repro:** scroll the features page.

Multiple viewports render as empty cream where feature cards should be. Content is mid-fade or never revealed.

**Evidence:** `00-anonymous/06-features-scroll-06.jpg` and after

### B22. Landing page product shots still show Karko AI

**Repro:** open usefulapply.com.

The hero screenshot and the three feature-section screenshots show the old "Karko AI" logo and a `karkoai.com/dashboard` URL bar. This is the first image every visitor sees.

**Evidence:** `00-anonymous/01-landing-scroll-01.jpg`, `-04`, `-05`

### B23. Feed card company name does not match the job description

**Repro:** open a feed job's details.

Card reads "Youth Sports Business Report Co."; the description reads "TeamSnap is seeking a Product Marketing Manager". Aggregator data quality, but the user sees the wrong employer.

**Evidence:** `12-max-job-feed/11-job-detail-modal.jpg`

### B30. Removing the CV leaves live Check Fit and Generate Kit buttons on every feed card

**Repro:** on a free account with a feed already built, remove the CV from the Documents page, open the Job Feed tab.

The banner correctly changes to "Upload your CV and Useful Apply builds your daily feed automatically. No setup needed." Below it, all five job cards still render **Check Fit** and **Generate Kit** as live primary buttons for actions that cannot run without a CV.

**Evidence:** `06-free-job-feed/06-no-cv-required-state-with-live-buttons-BUG.jpg`

**Partial credit:** pressing one does degrade gracefully. No credit is charged and a clear toast says "Upload your CV to continue". But see B31.

### B31. A blocked feed action still marks the job "Application started"

**Repro:** with no CV, press Check Fit on a feed card.

The action correctly refuses, but the card flips to **"Application started"**, its Check Fit and Generate Kit buttons are replaced by "Continue in Useful Apply", and a session and generation id are written into the URL. Nothing was started.

**Evidence:** `06-free-job-feed/07-check-fit-without-cv-graceful-but-marks-started.jpg`

---

## P3

### B24. "1 credits"
Singular and plural not handled in the header credit chip.

### B25. Generated screening answers contain em dashes
The generated STAR answer joins clauses with an em dash. The project's own copy rules ban it as the loudest AI tell, and this text goes straight into an ATS field a recruiter reads. The rule should apply to model output, not only to UI strings.
**Evidence:** `11-max-application-kit/08-screening-answer-generated.jpg`

### B26. Recent Applications shows company only
Two entries both read "Pixellot, 8/18/2026" with no role title, so they are indistinguishable. Dates use US format on a product whose own feed settings report the user's timezone as Berlin.
**Evidence:** `09-max-account/03-recent-applications-panel.jpg`

### B27. "Enterprise Saas" and "Consumer Saas" in the AI search profile
Should be SaaS.
**Evidence:** `12-max-job-feed/02-edit-feed-ai-search-profile.jpg`

### B28. Sticky header overlaps section headings on jump-scroll
The floating nav sits on top of section titles on the landing page.

### B29. Right panel truncates the job title after a feed-card action
Starting a Check Fit from a card titled "Product Manager - B2B SaaS" set the panel header to just "Product Manager".
**Evidence:** `16-feed-card-actions/02-check-fit-result-88pct.jpg`

---

## Data changes made during this audit

For the record, so nothing is a mystery later:

- Deleted and restored `job_feed_settings` for the Max account (`2b229497-...`) to capture the paid first-run setup wizard. Restored to the exact original values (Europe/Berlin, market `us`, hybrid/onsite/flexible, senior, authorized, original timestamps) and verified. Restore script: `scratchpad/restore_job_feed_settings.sql`.
- Consumed 6 credits on the Max account across four generations (184 → 178).
- The free account spent 0.5 credits on one fit analysis and now sits at 0.
- One feed run on each account.

Nothing else was written.

---

## Status after the fix session (19 August 2026, branch fix/audit-bugs)

Verified live on staging unless noted. Grok 4.6 implemented, Claude reviewed and verified.

| Bug | Status | Note |
|---|---|---|
| B1 | fixed | Free-tier reset sweep on the daily 0 3 * * * cron (trigger enabled). Paid tiers reset via the Stripe webhook. First sweep runs 03:00 UTC on 19 Aug; check user_credits after. The two overdue Max rows are Wasim's own comped accounts, deliberately untouched |
| B2 | fixed | Header 178 to 176 live, matched D1 |
| B3 | fixed, code-verified | Needs a free-account check |
| B4 | fixed | Migration 0004 adds a Drafted status (default for new rows, existing rows stay Applied). Applied to staging D1 19 Aug; child rows preserved, second-level generation events restored from the pre-migration dump after review caught them |
| B5, B6, B7, B8, B10 | fixed | Verified live |
| B9 | fixed | Dedupe at feed assembly on company + title + description opening. Row identity untouched. Confirm on the next feed run |
| B11 | fixed | 3 of 3 uploads detected en |
| B12, B13, B15, B18 | fixed | Verified live |
| B14, B16, B17 | fixed, code-verified | B14 needs a fresh run while on another tab, B16/B17 need a paid account without settings |
| B19 | partial | Session reuse reverted after review (wrong layer). Sources addressed by B9 and B31. Unique index is a follow-up |
| B20, B21, B24, B27, B28 | fixed | Verified live. /features title also fixed |
| B22 | fixed | Screenshots recaptured on Useful Apply. Hero demo video (Tella) still shows Karko AI, re-record later |
| B23 | fixed, code-verified | Needs a run with an employer mismatch to confirm visually |
| B25, B26, B29 | fixed, code-verified | |
| B30, B31 | fixed, code-verified | Need a free-account check |

Follow-ups: demo video re-record (Tella hero still shows Karko AI). Not doing: a tracker unique index on (user, title, company), it would block legitimate re-applications; the duplicate sources were B9 and B31. Ranking now runs on Workers AI only: JOB_FEED_RANKING_MODEL (gpt-oss-120b) then JOB_FEED_RANKING_FALLBACK_MODEL (deepseek-v4-flash-0731) then deterministic; Azure removed.
