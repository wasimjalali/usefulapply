# UsefulApply Rebrand + Cloudflare Migration. Master Plan and Tracker

> **Status legend:** `[ ]` not started, `[~]` implemented by Grok, awaiting Claude verification, `[x]` verified, committed and pushed by Claude, `[!]` blocked (write the reason inline).
> **Who does what:** Grok CLI implements tasks in order. Claude Code verifies (tsc, lint, spot checks), fixes gaps, ticks the box, commits and pushes to the branch. **No PR and no merge to `main` until Wasim says so explicitly.** Production (karkoai.com on Vercel + Supabase) keeps running untouched until Phase 9.

**Goal:** Ship the same product under the name UsefulApply on usefulapply.com, running entirely on Cloudflare (Workers, D1, R2, Email Service, Cron Triggers, KV), and retire Vercel, Supabase and Resend.

**Architecture:** Next.js 16 App Router stays. It runs on Cloudflare Workers through `@opennextjs/cloudflare`. Postgres/Supabase is replaced by D1 (SQLite) behind a typed data-access layer (Drizzle ORM); Row Level Security is replaced by explicit per-query ownership checks in that layer. Supabase Auth is replaced by Better Auth on D1 (email + password, Google OAuth, email verification, password reset). Supabase Storage is replaced by R2. Resend is replaced by Cloudflare Email Service for transactional mail. Inngest cron functions become Workers Cron Triggers. The in-memory rate limiter becomes the Workers Rate Limiting binding.

**Tech stack:** Next.js 16, TypeScript, `@opennextjs/cloudflare`, wrangler, D1 + Drizzle ORM, Better Auth, R2, Cloudflare Email Service (`send_email` binding), Workers Cron Triggers, Workers Rate Limiting binding, KV/R2 for the OpenNext cache, Stripe, PostHog, Amazon Bedrock (unchanged).

**Decisions log (2026-08-17, Wasim):**
1. Brand name: **UsefulApply**. Domain: **usefulapply.com** (registered 2026-08-17 at Cloudflare, NS `clay/tess.ns.cloudflare.com`). Also buy `usefullapply.com` (common misspelling) and `usefulapply.io` / `.ai` if still free, all redirecting to the .com.
2. Migration scope: **full**. Hosting, DB, auth, storage, email all move to Cloudflare.
3. Visual scope: **new name + logo only**. Navy/cream/gold, Georgia + Arial, all surface roles and components stay. No palette or typography changes.
4. Legal: brand is UsefulApply, the legal entity stays as it is today. Terms, Privacy and Imprint read "UsefulApply, operated by <current legal entity>".
5. Email: everything moves to Cloudflare Email Service and Resend is removed. The founder welcome flow (Day 0 welcome, Day 3 check-in) is 1:1 onboarding mail, so it's transactional and allowed; it's rebuilt as Day 0 in the post-confirm hook plus a daily Cron Trigger for Day 3 (Task 7.2). There are no newsletters or bulk broadcasts today; if one is ever needed, pick a marketing tool at that time.
8. Legal entity: `Karko AI Inc` (from `/imprint`). `BRAND.legalLine` = "UsefulApply, operated by Karko AI Inc".
9. Cloudflare access for Claude: no API token. Wasim runs `! npx wrangler login` in the Claude Code session when Phase 3.5 starts (OAuth in the browser, nothing stored in the repo).
10. Trustpilot: keep the existing profile and its reviews; request a domain change from karkoai.com to usefulapply.com through Trustpilot support (Task 8.5). Only if refused, open a new profile.
6. Grok loop: Grok CLI implements, Claude verifies and commits. Branch: `rebrand/usefulapply`.
7. Flag on record: a June 2026 review judged a Vercel to Cloudflare move as "savings too small for the rebuild risk". Wasim has decided to do the full move anyway. This plan minimises risk by keeping production untouched until a single, rehearsed cutover.

## Global constraints (apply to every task)

- Branch `rebrand/usefulapply` off `main`. Merge `main` into it weekly (`git merge main`) so the cutover diff stays small. Never rebase, never force-push, never `--no-verify`.
- `npx tsc --noEmit` must be zero errors and `npm run lint` clean before any task is marked `[~]`.
- Copy rules: no em dashes anywhere (`—` is banned in code, copy, docs and commits), contractions are fine, short sentences, no Oxford comma in UI copy, "UsefulApply" is one word with capital U and capital A everywhere. Never "Useful Apply", never "usefulapply" in prose.
- Design system stays exactly as documented in `.claude/rules/design-system.md`. No new colors, fonts, radii or shadows.
- Surgical edits. Touch only what the task names. No refactors "while here".
- `npm` only. Every new package must be listed in the task; anything else needs Wasim's ok.
- Never read, log or modify `.env*`. Secrets go through `wrangler secret put` and are listed by name only in this document.
- Do not touch the Supabase production project, the Vercel project, Stripe live webhooks or DNS for karkoai.com before Phase 9.
- Anti-hallucination rules in `src/lib/agents/prompts/**` are not changed by the rebrand. Only the product name inside prompts changes.

## Sequence and why

1. **Rebrand first (Phases 1 to 2).** Pure code and assets, testable locally, and it's needed before anything ships on the new domain.
2. **Hosting second (Phase 3).** Get the branch running on Workers at usefulapply.com while still talking to Supabase. That gives a live staging URL for everything after, and it isolates "Next on Workers" bugs from data-layer bugs.
3. **Data, auth, storage, email (Phases 4 to 7).** Each behind its own layer, each verified against staging with copied production data.
4. **Integrations re-point (Phase 8).** Stripe, PostHog, Google OAuth, Search Console, Trustpilot.
5. **Cutover (Phase 9).** One rehearsed run: freeze, final sync, DNS, redirects, watch.
6. **Decommission (Phase 10)** after 30 clean days.

Rough effort at Grok + Claude pace: Phases 1 to 2 about 3 days, Phase 3 about 2 days, Phase 4 about 6 to 8 days (biggest risk), Phase 5 about 3 days, Phase 6 about 1 day, Phase 7 about 1 day, Phase 8 about 1 day, Phase 9 half a day plus a watch week. Total 3 to 4 weeks of focused work.

---

## Phase 0: Foundation

### Task 0.1: Branch and tracker
**Files:** this file.
- [x] Create branch `rebrand/usefulapply` from current `main`.
- [x] Commit this plan as the first commit on the branch and push.

### Task 0.2: Brand constants
**Files:** Create `src/lib/brand.ts`. Modify every place that hardcodes "Karko AI" for the app name in TS/TSX later tasks reference this file instead of a string.
**Interfaces (produces):**
```ts
export const BRAND = {
  name: 'UsefulApply',
  legalLine: 'UsefulApply, operated by Karko AI Inc',
  domain: 'usefulapply.com',
  url: 'https://usefulapply.com',
  supportEmail: 'support@usefulapply.com',
  noreplyEmail: 'noreply@usefulapply.com',
  founderEmail: 'wasim@usefulapply.com',
  tagline: 'Your entire job search, in one app.',
  taglineInvestor: 'The AI job application agent.',
} as const;
```
- [ ] Create the file with the exact values above.
- [ ] Verify: `npx tsc --noEmit` zero errors.

### Task 0.3: Domains
Owner: Wasim (Cloudflare dashboard). Not code.
- [ ] Buy `usefullapply.com`. Check and buy `usefulapply.io` and `usefulapply.ai` if still available (they were free on 2026-08-17).
- [ ] Add all three as Cloudflare zones and create a Bulk Redirect (301) to `https://usefulapply.com/$1`.

---

## Phase 1: Brand identity (logo and assets)

### Task 1.1: Wordmark and logo mark
**Owner: Claude, not Grok.** Claude designs 3 to 4 logo options (wordmark + mark, each shown on cream and on navy, at navbar size and favicon size) as a single preview page in the scratchpad, Wasim picks one, then Claude implements the chosen option in the files below. Grok skips this task and continues with Task 1.2 only after 1.1 is `[x]`.
**Files:** Modify `src/components/KarkoLogo.tsx` (rename to `src/components/BrandLogo.tsx`, update all 17 import sites), replace `public/favicon-*.png`, `public/apple-touch-icon.png`, `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/opengraph-image.jpg`, `public/site.webmanifest`, `src/app/manifest.ts`.
Design brief: same navy (#0F3057 family from tokens) and gold accents as today; Georgia wordmark "UsefulApply" with "Useful" in navy and "Apply" in gold, or a single-color version for dark backgrounds; the mark is a simple geometric glyph that reads at 16px (favicon) and 512px (PWA). Deliver as inline SVG in the component plus exported PNGs at 16/32/192/512 and a 1200x630 OG image. No gradients that break at favicon size.
- [ ] Build `BrandLogo` with props `variant: 'full' | 'mark' | 'wordmark'` and `tone: 'navy' | 'cream'`.
- [ ] Replace every favicon, apple icon, manifest icon and the OG image. Manifest `name` and `short_name` become "UsefulApply".
- [ ] Verify: run `npm run dev`, open `/`, `/dashboard`, `/pricing`; logo renders in navbar, footer, auth pages; browser tab shows the new favicon; `curl -I localhost:3000/opengraph-image` returns 200. Screenshot the navbar and footer to the repo root for Claude to check.

### Task 1.2: Email logo and blog/OG images
**Files:** `src/lib/email/templates/*.ts` (logo URL and alt text), `public/images/**` files that carry the old logo (list them with `ls public/images` and check each), `src/components/blog/**` OG image generation if any.
- [ ] Point email templates at `https://usefulapply.com/<new-logo>.png` (upload the PNG to `public/`).
- [ ] Regenerate any blog OG or hero images that carry the Karko wordmark (see `docs/blog-image-brand-refresh-tracker.md` for the list of generated images).
- [ ] Verify: `grep -ril "karko" public/ src/lib/email` returns nothing except historical blog post slugs (slugs are handled in Task 2.5).

---

## Phase 2: Copy and code rename

Order matters: do marketing pages first (highest visibility), then app, then internal. After each task run `grep -rin "karko" <scope>` and paste the count into the tracker line.

### Task 2.1: Marketing pages
**Files:** `src/app/page.tsx`, `src/app/layout.tsx` (metadata title/description/OG), `src/app/about/**`, `src/app/features/**`, `src/app/pricing/**`, `src/app/ai-job-application/**`, `src/app/contact/**`, `src/components/marketing/**`, `src/components/comparisons/**`, `src/app/compare/**`.
- [ ] Replace every "Karko AI" / "KarKo AI" / "Karko" with `BRAND.name` (import from `src/lib/brand.ts`) or the literal "UsefulApply" in JSX text.
- [ ] Update `metadata` titles: `UsefulApply | AI Job Application Agent` and page-specific titles.
- [ ] Comparison routes: rename slugs `karko-ai-vs-teal` etc. to `usefulapply-vs-teal` etc. in `src/app/compare/[slug]` data and add redirects for the old slugs in `next.config.*` (`redirects()` 301).
- [ ] Verify: `grep -rin "karko" src/app/page.tsx src/app/layout.tsx src/app/about src/app/features src/app/pricing src/app/ai-job-application src/app/contact src/components/marketing src/components/comparisons src/app/compare` returns 0 lines. Count before: ____ after: 0.

### Task 2.2: App surfaces (dashboard, documents, settings, auth pages)
**Files:** `src/app/dashboard/**`, `src/app/documents/**`, `src/app/master-cv/**`, `src/app/master-cv-template/**`, `src/app/settings/**`, `src/app/account/**`, `src/app/subscription/**`, `src/app/notifications/**`, `src/app/profile/**`, `src/app/auth/**`, `src/components/**` (excluding marketing/comparisons done above), `src/components/KarkoAIStepIndicator.tsx` (rename to `StepIndicator.tsx`), `src/store/**`, `src/hooks/**`.
- [ ] Rename strings, component names and file names. Keep localStorage/Zustand persistence keys unchanged unless a key literally contains "karko" (then add a one-time migration that copies the old key to the new key on load, so users don't lose local state).
- [ ] Verify: `grep -rin "karko" src/app src/components src/store src/hooks` returns 0. tsc and lint clean.

### Task 2.3: Agents, prompts and API routes
**Files:** `src/lib/agents/**`, `src/lib/agents/prompts/**`, `src/lib/models/**`, `src/app/api/**`, `src/lib/**` (everything not covered above).
- [ ] Replace product name mentions inside prompts and system messages. Do not change any rule text, examples or output schemas. Only the name.
- [ ] Verify: `grep -rin "karko" src/lib src/app/api` returns 0. Run one fit analysis and one full generation locally against Supabase (still the data layer at this point) to confirm prompts still produce output.

### Task 2.4: Emails, legal pages, contact
**Files:** `src/lib/email/config.ts`, `src/lib/email/templates/{confirmation,password-reset,welcome,check-in}.ts`, `src/app/terms/**`, `src/app/privacy/**`, `src/app/imprint/**`, `src/app/api/contact/route.ts`.
- [ ] Sender becomes `UsefulApply <noreply@usefulapply.com>` (config only; the actual provider switch is Phase 7). Founder intro line: "I'm the founder of UsefulApply".
- [ ] Legal pages: "UsefulApply, operated by Karko AI Inc" (use `BRAND.legalLine`). Add one line to Privacy: "UsefulApply was previously known as Karko AI." Update effective dates.
- [ ] Verify: render each email template to a local HTML file and open it; grep scope returns 0.

### Task 2.5: SEO surfaces, blog, llms.txt
**Files:** `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/feed.xml/**`, `public/llms.txt`, `public/llms-full.txt`, `src/app/blog/**`, `src/components/blog/**`.
- [ ] Base URL from `BRAND.url`. Blog author and site name updated. Keep blog post slugs unchanged (they carry SEO), only update body copy and any "Karko" in titles where it isn't the subject.
- [ ] Verify: `curl localhost:3000/sitemap.xml | grep -c usefulapply` equals total URL count; `grep -ci karko public/llms*.txt` is 0.

### Task 2.6: Internal docs and repo metadata
**Files:** `README.md`, `CLAUDE.md`, `AGENTS.md`, `KARKO_POSITIONING.md` (rename to `USEFULAPPLY_POSITIONING.md`), `docs/**`, `.claude/rules/**`, `.claude/agents/**`, `package.json` name, `SETUP.md`, `INSTALLATION_STEPS.md`, `STRIPE_SETUP_GUIDE.md`.
- [ ] Rename and update. Historical docs (`docs/*-tracker.md`, `docs/*-plan.md`) get a one-line note at the top: "Written when the product was called Karko AI." and are otherwise left alone.
- [ ] `CLAUDE.md`: title, product description, agent descriptions, integrations section (this changes again in Phase 8, keep a checkbox for it).
- [ ] Verify: `grep -rli karko --exclude-dir=node_modules --exclude-dir=.git .` lists only historical docs and migration files (DB object names are handled in Phase 4).

---

## Phase 3: Hosting on Cloudflare Workers (still on Supabase)

### Task 3.1: OpenNext adapter
**Packages to add:** `@opennextjs/cloudflare`, `wrangler` (dev). Confirm exact install commands with current docs at https://opennext.js.org/cloudflare before running.
**Files:** Create `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars.example` (names only, no values). Modify `package.json` scripts (`preview`, `deploy:cf`), `next.config.*` (`initOpenNextCloudflareForDev()` in dev), `.gitignore` (`.open-next/`, `.wrangler/`, `.dev.vars`).
- [ ] `wrangler.jsonc`: `name: "usefulapply"`, `compatibility_date` = today, `compatibility_flags: ["nodejs_compat"]`, `assets` binding per OpenNext docs, R2 bucket `usefulapply-next-cache` for the incremental cache, `routes` for `usefulapply.com/*` and `www.usefulapply.com/*`.
- [ ] Verify: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare preview` serves `/`, `/pricing`, `/dashboard` (redirects to login), `/api/parse-cv` returns 401 without auth. Note any Node API that fails under `nodejs_compat` (candidates: `sharp` if it's imported anywhere, `docx`, `pdf-lib`, `@aws-sdk` Bedrock client). Record each failure here with the fix.

### Task 3.2: Streaming, SSE and long requests
**Files:** `src/app/api/agent-v2/**`, `src/app/api/chat/**`, `src/app/api/regenerate/**`, `src/hooks/useAgentV2.ts`.
- [ ] Confirm SSE streaming works end to end on the Workers preview (Workers have no wall-clock limit for streaming responses, but CPU time is limited; check the paid plan CPU limit and set `limits.cpu_ms` in wrangler if needed).
- [ ] The `contextCache` Map (30-min TTL) in the agent route becomes a KV namespace `CONTEXT_CACHE` with 30-min expiration (Workers instances don't share memory). Add the KV binding to `wrangler.jsonc`.
- [ ] Verify: run a full "Analyze first" then "Apply for this job" flow on preview; the second call must hit KV (log a `cache: hit` line via PostHog or console) rather than fall back to `full_optimization`.

### Task 3.3: Rate limiter
**Files:** `src/lib/middleware/rateLimiter.ts`, `wrangler.jsonc`.
- [ ] Replace the in-memory sliding window with the Workers Rate Limiting binding (one binding per `RATE_LIMITS` bucket, same limits as today). Keep the same `checkRateLimit(key, bucket)` signature so call sites don't change.
- [ ] Verify: hit `/api/contact` above the limit from the preview and get the same 429 body as production.

### Task 3.4: Cron and Inngest
**Files:** `src/inngest/**`, `src/app/api/inngest/route.ts`, `src/app/api/cron/resend-confirmations/route.ts`, `wrangler.jsonc` (`triggers.crons`), a new `src/cron/index.ts` that the Worker `scheduled()` handler dispatches to.
- [ ] Port the three Inngest cron functions in `src/inngest/job-feed.ts` (`0 3 * * *`, `*/10 * * * *`, `*/10 * * * *`) and the confirmation-resend cron to Workers Cron Triggers. Note that `job-feed.ts` says the feed runs on-click and the scheduler is dormant; port only what is live, and delete dead Inngest code once verified unused (grep first).
- [ ] Remove `inngest` from `package.json` when nothing imports it.
- [ ] Verify: `wrangler dev --test-scheduled` and `curl "http://localhost:8787/__scheduled?cron=*/10+*+*+*+*"` runs the handler without error.

### Task 3.5: Staging deploy to usefulapply.com
Owner: Claude. Wasim runs `! npx wrangler login` in the Claude Code session first (browser OAuth). Wasim types secret values himself when prompted by `wrangler secret put`.
- [ ] `wrangler secret put` for every server env currently in Vercel (list names from `SETUP.md`; never paste values in chat or files). Public `NEXT_PUBLIC_*` vars go in `wrangler.jsonc` `vars`.
- [ ] Deploy. Bind `usefulapply.com` and `www` to the Worker. `NEXT_PUBLIC_SITE_URL=https://usefulapply.com`.
- [ ] Add a `noindex` header on staging (`X-Robots-Tag: noindex`) until Phase 9 so Google doesn't index a duplicate. Track its removal in Task 9.4.
- [ ] Verify: full smoke on https://usefulapply.com against the **Supabase** data: sign in with Google, upload CV, run fit analysis, generate application, download PDF and DOCX, open job feed, Stripe checkout in test mode. Record results here.

---

## Phase 4: Database to D1 (biggest risk, go slow)

**Why D1 and what it costs us:** D1 is SQLite. That means no `jsonb` operators, no RLS, no `pg_cron`, no interactive transactions (only `batch()` which is atomic), a 10 GB per-database cap and one primary region for writes. Everything Supabase enforced with 33 RLS policies must become explicit `where user_id = ?` in a data-access layer. If during Task 4.1 the schema turns out to depend on Postgres features that don't port cleanly (heavy jsonb queries in the job feed, for example), stop and report; the fallback is Postgres on Neon reached through Cloudflare Hyperdrive, which keeps the app on Cloudflare but the data off it.

**Packages to add:** `drizzle-orm`, `drizzle-kit` (dev), `better-sqlite3` (dev, for local tests) or use `wrangler d1 execute --local`.

### Task 4.1: Schema port
**Files:** Create `src/db/schema.ts` (Drizzle), `drizzle.config.ts`, `migrations/d1/0001_init.sql` (generated). Read `supabase/migrations/*.sql` (18 files) and `SUPABASE_SCHEMA_GUIDE.md`.
- [ ] Port all 29 tables used by the app (`profiles`, `user_credits`, `documents`, `application_sessions`, `job_feed_*` (8 tables), `credit_reservations`, `credit_transactions`, `message_feedback`, `user_career_profiles`, `subscriptions`, `subscription_plans`, `avatars`, `user_search_strategies`, `user_cv_suggestions`, `chat_messages`, `webhook_events`, `user_job_preferences`, `serpapi_filter_tokens`, `connected_accounts`, `anonymous_generations`, `addon_credit_packs`, `contact_submissions`). `uuid` becomes `text` (keep the same UUID values so Stripe customer ids and PostHog distinct ids stay valid), `jsonb` becomes `text` with JSON, `timestamptz` becomes `text` ISO 8601, enums become `text` with a CHECK.
- [ ] Port the Postgres functions to application code: `initialize_user_credits` (runs on signup, becomes part of the Better Auth `afterSignUp` hook in Task 5.2), `trigger_karko_confirmation_resend` (becomes the cron in Task 3.4), the two `set_updated_at` triggers (set `updated_at` in the data layer on every update).
- [ ] Verify: `npx wrangler d1 migrations apply usefulapply-db --local` succeeds; `npx drizzle-kit check` clean.

### Task 4.2: Data-access layer
**Files:** Create `src/db/client.ts` (returns Drizzle bound to `env.DB`), `src/db/repos/*.ts` one file per domain (`profiles.ts`, `credits.ts`, `documents.ts`, `sessions.ts`, `jobFeed.ts`, `subscriptions.ts`, `feedback.ts`, `contact.ts`). Modify the 71 files that import from `src/lib/supabase/**` to call the repos instead. Delete `src/lib/supabase/**` when nothing imports it.
**Interfaces (produces):** every repo function takes `userId: string` as the first argument and filters by it. There is no function that returns rows for "any user" except in `src/db/repos/admin.ts`, which is only imported by cron handlers and the Stripe webhook.
- [ ] Credits: `deductCredits(userId, amount, reason)` must stay optimistic-concurrency safe. Implement as one conditional `UPDATE user_credits SET balance = balance - ? , version = version + 1 WHERE user_id = ? AND version = ? AND balance >= ?` inside a `db.batch([...])` with the ledger insert; if `changes === 0` retry up to 3 times, then throw. Same for `credit_reservations`. Write a test that runs 20 concurrent deductions against a local D1 and asserts the final balance.
- [ ] Verify: `grep -rn "@supabase" src` returns only auth files (removed in Phase 5). tsc and lint clean. Local D1 seeded from a test export runs the full app in `wrangler dev`.

### Task 4.3: Migration scripts
**Files:** Create `scripts/migrate/export-supabase.ts` (reads every table with the service role key from env, writes NDJSON per table into a gitignored `scripts/migrate/out/`), `scripts/migrate/import-d1.ts` (transforms and bulk inserts via `wrangler d1 execute --file` in 500-row chunks), `scripts/migrate/verify-counts.ts` (row counts and a checksum per table on both sides). Add `scripts/migrate/out/` to `.gitignore`.
- [ ] Verify: run export against production (read-only) and import into the **staging** D1; `verify-counts` matches on every table. Record counts here.

### Task 4.4: Staging on D1
- [ ] Switch usefulapply.com staging to the D1 binding (Supabase auth still active at this point, so users authenticate with Supabase and read/write D1 by their existing UUID).
- [ ] Verify: repeat the Task 3.5 smoke on D1 data. Credits deduct correctly, tracker shows history, job feed loads past runs.

---

## Phase 5: Auth to Better Auth

**Packages to add:** `better-auth`, its Drizzle adapter. Check current docs at https://www.better-auth.com before installing.

### Task 5.1: Better Auth setup
**Files:** Create `src/auth/server.ts` (Better Auth instance: Drizzle + D1, email + password, Google provider, email verification required, password reset, session cookie `usefulapply.session`), `src/auth/client.ts`, `src/app/api/auth/[...all]/route.ts`. Add tables to `src/db/schema.ts` (`user`, `session`, `account`, `verification`) via a new D1 migration. `wrangler.jsonc` secrets: `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
- [ ] Configure `user.id` generation to accept a supplied id so migrated users keep their Supabase UUID.
- [ ] Email delivery for verification and reset uses `src/lib/email/send.ts` from Task 7.1 (build a stub that logs until Phase 7 lands, and note it here).
- [ ] Verify: sign up, verify, sign in, sign out, reset password, Google sign in all work in `wrangler dev`.

### Task 5.2: Replace Supabase auth call sites
**Files:** `src/proxy.ts` (route guard), every `auth.getUser()` (31 sites), `auth.getSession()` (3), `exchangeCodeForSession` (3), `signInWithOAuth` (2), `setSession` (2), `verifyOtp`, `updateUser`, `signUp`, `signInWithPassword`, `onAuthStateChange`, `src/app/api/auth/{signup,forgot-password,post-confirm,recovery-status,delete-account}/**`, `src/app/auth/**` pages, `src/store/useSessionStore.ts`.
- [ ] Add a `getCurrentUser(request)` helper in `src/auth/server.ts` and use it in every API route so the "authenticate, then rate limit, then validate" pattern from `.claude/rules/security.md` stays intact.
- [ ] `initialize_user_credits` logic runs in Better Auth's `databaseHooks.user.create.after`.
- [ ] Delete `src/lib/supabase/**` and remove `@supabase/ssr`, `@supabase/supabase-js` from `package.json` when `grep -rn "@supabase" src` is empty.
- [ ] Verify: every API route returns 401 unauthenticated and 200 authenticated on `wrangler dev`; tsc, lint clean.

### Task 5.3: User migration
**Files:** `scripts/migrate/export-auth-users.ts` (SQL against `auth.users` and `auth.identities`: id, email, email_confirmed_at, encrypted_password, created_at, provider ids), `scripts/migrate/import-auth-users.ts`.
- [ ] Supabase stores bcrypt hashes. Configure Better Auth's password verifier to accept bcrypt for migrated rows (custom `password.verify` that detects the `$2` prefix) and rehash to the default algorithm on next successful login. If this turns out unsupported in the installed version, fall back to: import users without passwords and force a "set your password" email on first login. Record which path was taken.
- [ ] Google users: import `account` rows with `providerId: 'google'` and the Google `sub` so they sign straight in.
- [ ] Verify on staging: a copied real account (Wasim's own) signs in with password and with Google; credits and documents are attached.

---

## Phase 6: Storage to R2

### Task 6.1: R2 bucket and client
**Files:** Create `src/storage/r2.ts` (`putObject`, `getSignedUrl`, `deleteObject`), replace uses in `src/lib/supabase/storage.ts`, `src/lib/supabase/documents.ts`, `src/lib/supabase/accounts.ts`, `src/app/api/auth/delete-account/route.ts`. `wrangler.jsonc` R2 binding `FILES` bucket `usefulapply-files`.
- [ ] Keep the same key layout as Supabase (`<bucket>/<userId>/<filename>`) so migration is a copy, not a remap. Avatars served through a small `/api/files/[...key]` route that checks ownership (or public for avatars if they were public before, check the existing bucket policy first).
- [ ] Verify: upload CV, upload avatar, download document, delete account removes all objects.

### Task 6.2: Object migration
**Files:** `scripts/migrate/copy-storage.ts` (list Supabase buckets, stream each object to R2 with the same key, verify sizes).
- [ ] Verify: object counts and total bytes match per bucket; spot open 5 random files on staging.

---

## Phase 7: Email to Cloudflare Email Service

Prereq (Wasim, dashboard or CLI): `npx wrangler email sending enable usefulapply.com`, add the SPF/DKIM/DMARC records it prints, and confirm with `npx wrangler email sending list`.

### Task 7.1: Sender module
**Files:** Create `src/lib/email/send.ts` wrapping `env.EMAIL.send({ to, from: { email: BRAND.noreplyEmail, name: BRAND.name }, subject, html, text })`; every template must return both `html` and `text`. `wrangler.jsonc`: `"send_email": [{ "name": "EMAIL" }]`. Replace Resend calls in `src/app/api/contact/route.ts`, `src/app/api/auth/{signup,forgot-password,post-confirm}/route.ts`, the confirmation-resend cron, and the Better Auth verification and reset hooks from Task 5.1.
- [ ] Verify: each transactional email arrives in a real inbox from staging with SPF, DKIM and DMARC pass in the headers.

### Task 7.2: Founder welcome flow on Cloudflare
Today (Resend): Day 0 founder welcome is sent when a user confirms email, Day 3 check-in is scheduled with Resend `scheduledAt`, and `profiles.welcome_sent_at` prevents re-sends. Rebuild the same behaviour without Resend.
**Files:** `src/app/api/auth/post-confirm/route.ts` (or the Better Auth `emailVerified` hook after Phase 5), `src/lib/email/templates/{welcome,check-in}.ts`, `src/cron/welcome-checkin.ts` (new), `src/db/schema.ts` (add `profiles.check_in_sent_at text null` via a D1 migration), `wrangler.jsonc` (`triggers.crons` add `0 9 * * 1-5`, weekdays 09:00 UTC, matching the "weekday sends only" rule), `src/lib/email/config.ts`.
- [ ] Day 0: after email verification, if `welcome_sent_at` is null, send the welcome via `sendEmail()` from Task 7.1 with `from: { email: 'wasim@usefulapply.com', name: 'Wasim from UsefulApply' }` and `replyTo: 'wasim@usefulapply.com'`, then set `welcome_sent_at`.
- [ ] Day 3: the cron selects users where `welcome_sent_at <= now - 3 days` and `check_in_sent_at is null` and `email_verified = 1`, sends the check-in, sets `check_in_sent_at`. Idempotent: run twice, second run sends nothing.
- [ ] Copy: keep the current email text but "Karko AI" becomes "UsefulApply", founder intro stays "I'm the founder of UsefulApply", the desktop-only note stays mandatory, promo signals stay soft (these are existing rules from the founder).
- [ ] Remove `resend` from `package.json`, delete `scripts/resend-*.ts` and `src/lib/email/config.ts` references to Resend audiences.
- [ ] Verify: on staging, verify a fresh test account, receive Day 0 immediately; set `welcome_sent_at` back 3 days in D1, trigger the cron with `curl "http://localhost:8787/__scheduled?cron=0+9+*+*+1-5"`, receive Day 3 once and only once.

---

## Phase 8: Integrations re-point

- [ ] **Stripe:** new webhook endpoint `https://usefulapply.com/api/stripe/webhook` (create it now, keep the Vercel one until cutover), product and price names "UsefulApply Plus", "UsefulApply Max", "UsefulApply Credit Pack", customer portal branding, success/cancel URLs from `BRAND.url`. Financial logic untouched. Wasim confirms in the Stripe dashboard.
- [ ] **Google OAuth:** consent screen name "UsefulApply", authorised origins and redirect URIs for usefulapply.com and Better Auth's callback path.
- [ ] **PostHog:** project display name, allowed domains, and the `NEXT_PUBLIC_POSTHOG_KEY` stays the same so history continues. Update `.claude/rules/posthog.md`.
- [ ] **Bedrock / Anthropic:** no change. Confirm the AWS SDK works from Workers under `nodejs_compat` (checked in Task 3.1).
- [ ] **Trustpilot (Task 8.5, owner Wasim):** email Trustpilot support from the account owner address asking to change the business domain from karkoai.com to usefulapply.com and the display name to UsefulApply, keeping the reviews. When confirmed, update the profile URL in `src/components/marketing/TrustpilotReviews.tsx` and `src/components/marketing/Footer.tsx`. If Trustpilot refuses, create a new profile for usefulapply.com and point both components at it.
- [ ] **Google Search Console / Bing:** add usefulapply.com property now, submit sitemap after cutover, use the Change of Address tool from karkoai.com after redirects are live.
- [ ] `CLAUDE.md` integrations section and `SETUP.md` rewritten for the Cloudflare stack.

---

## Phase 9: Cutover (one rehearsed run, off-peak, Wasim present)

Rehearse Tasks 9.1 to 9.3 once against staging with a fresh export before doing it for real.

### Task 9.1: Freeze
- [ ] Put karkoai.com into read-only: enable a maintenance banner and return 503 from write API routes (deploy this as a tiny Vercel change from a `hotfix/maintenance` branch, merged with Wasim's ok; this is the one exception to "don't touch prod").
- [ ] Announce a 1-hour window to users by email the day before.

### Task 9.2: Final sync
- [ ] Re-run `export-supabase.ts`, `export-auth-users.ts`, `copy-storage.ts` (delta only, by `updated_at` since the rehearsal), import into the **production** D1 and R2 (create them in Task 9.0 below as fresh resources, not the staging ones), run `verify-counts.ts`. All counts match.

### Task 9.0 (do before 9.1): Production resources
- [ ] Create `usefulapply-db-prod` D1, `usefulapply-files-prod` R2, prod KV namespaces, prod secrets, a `wrangler.jsonc` `env.production` block. Deploy the branch to production env bound to usefulapply.com. Staging moves to `staging.usefulapply.com`.

### Task 9.3: Switch traffic
- [ ] Remove the `X-Robots-Tag: noindex` header (Task 3.5).
- [ ] karkoai.com: move DNS to Cloudflare if not already there, add a Bulk Redirect rule: `karkoai.com/*` and `www.karkoai.com/*` 301 to `https://usefulapply.com/$1`. Keep this redirect for at least 12 months.
- [ ] Stripe: switch the live webhook to the new endpoint, disable the Vercel endpoint. Replay any events that fired during the window from the Stripe dashboard.
- [ ] Verify: sign in as a real migrated user, generate one application, buy a credit pack in live mode with a real card and refund it, check PostHog receives events, check one transactional email.

### Task 9.4: Watch (7 days)
- [ ] Daily: PostHog errors, Cloudflare Workers logs, Stripe webhook failures, email bounces (`wrangler email` or dashboard). Log anything found here with the fix.
- [ ] Only after this, Wasim gives the go for the PR to `main`.

---

## Phase 10: Decommission (30 days after cutover)

- [ ] Pause the Supabase project (keep the final export in cold storage, encrypted). Delete after 90 days.
- [ ] Delete the Vercel project. Cancel Vercel Pro.
- [ ] Remove Resend domain and audience if Task 7.2 decided to leave Resend.
- [ ] Remove `scripts/migrate/**` and `scripts/resend-*.ts` from the repo.
- [ ] Update `.claude/rules/**`, memory notes, and this file's status to DONE.

---

## Open questions

None. All decisions are in the Decisions log. Real-world actions that only Wasim can do (buy domains, `wrangler login`, type secrets, Stripe and Google dashboards, Trustpilot support email) are marked "Owner: Wasim" on the task and are not questions.

## Grok loop protocol

1. Grok opens this file and takes a **batch of up to 4 consecutive `[ ]` tasks** in order (never skips ahead, never crosses into a new phase mid-batch unless the current phase has fewer than 4 tasks left). Batches: A = 0.2, 2.1, 2.2, 2.3. B = 2.4, 2.5, 2.6, 1.2 (1.2 only if 1.1 is already `[x]`). C = 3.1, 3.2, 3.3, 3.4. D = 4.1, 4.2. E = 5.1, 5.2. F = 6.1, 7.1, 7.2. G = 8.x code items. Anything Claude-owned is skipped.
2. Grok implements each task in the batch one at a time: exactly the task's files and steps, then `npx tsc --noEmit` and `npm run lint`, fills in any "Count before/after" or "Record here" lines, changes that task's box to `[~]`, then moves to the next task in the batch. After the last task in the batch it stops and reports. Grok does not commit, does not push, does not open PRs, does not touch `.env*`, does not install packages that aren't listed in the task.
3. Wasim returns to Claude Code. Claude re-runs tsc and lint, checks the verify step, fixes gaps, changes `[~]` to `[x]`, commits with a conventional message (`feat(rebrand): ...`, `feat(cf): ...`, `chore(migrate): ...`) and pushes to `rebrand/usefulapply`.
4. Anything blocked becomes `[!]` with the reason and is raised to Wasim.
5. Tasks marked "Owner: Claude" (1.1 logo design, 3.5, 4.3, 4.4, 5.3, 6.2, 9.x) are done by Claude directly, not Grok. Grok skips them and takes the next `[ ]` task that has no owner line, unless the skipped task is a prerequisite (1.1 blocks 1.2; 3.5 blocks Phase 4 onward), in which case Grok stops and reports.
