# Useful Apply Rebrand + Cloudflare Migration. Master Plan and Tracker

> **Status legend:** `[ ]` not started, `[x]` implemented by Grok, awaiting Claude verification, `[x]` verified, committed and pushed by Claude, `[!]` blocked (write the reason inline).
> **Who does what:** Grok CLI implements tasks in order. Claude Code verifies (tsc, lint, spot checks), fixes gaps, ticks the box, commits and pushes to the branch. **No PR and no merge to `main` until Wasim says so explicitly.** Production (karkoai.com on Vercel + Supabase) keeps running untouched until Phase 9.

**Goal:** Ship the same product under the name Useful Apply on usefulapply.com, running entirely on Cloudflare (Workers, D1, R2, Email Service, Cron Triggers, KV), and retire Vercel, Supabase and Resend.

**Architecture:** Next.js 16 App Router stays. It runs on Cloudflare Workers through `@opennextjs/cloudflare`. Postgres/Supabase is replaced by D1 (SQLite) behind a typed data-access layer (Drizzle ORM); Row Level Security is replaced by explicit per-query ownership checks in that layer. Supabase Auth is replaced by Better Auth on D1 (email + password, Google OAuth, email verification, password reset). Supabase Storage is replaced by R2. Resend is replaced by Cloudflare Email Service for transactional mail. Inngest cron functions become Workers Cron Triggers. The in-memory rate limiter becomes the Workers Rate Limiting binding.

**Tech stack:** Next.js 16, TypeScript, `@opennextjs/cloudflare`, wrangler, D1 + Drizzle ORM, Better Auth, R2, Cloudflare Email Service (`send_email` binding), Workers Cron Triggers, Workers Rate Limiting binding, KV/R2 for the OpenNext cache, Stripe, PostHog, Amazon Bedrock (unchanged).

**Decisions log (2026-08-17, Wasim):**
1. Brand name: **Useful Apply** (two words, capital U and A, in all prose, titles, emails and legal text; the domain and code identifiers stay `usefulapply`). Domain: **usefulapply.com** (registered 2026-08-17 at Cloudflare, NS `clay/tess.ns.cloudflare.com`). Also buy `usefullapply.com` (common misspelling) and `usefulapply.io` / `.ai` if still free, all redirecting to the .com.
2. Migration scope: **full**. Hosting, DB, auth, storage, email all move to Cloudflare.
3. Visual scope: **new name + logo only**. Navy/cream/gold, Georgia + Arial, all surface roles and components stay. No palette or typography changes.
4. Legal: brand is Useful Apply, the legal entity stays as it is today. Terms, Privacy and Imprint read "Useful Apply, operated by Karko AI Inc".
5. Email: everything moves to Cloudflare Email Service and Resend is removed. The founder welcome flow (Day 0 welcome, Day 3 check-in) is 1:1 onboarding mail, so it's transactional and allowed; it's rebuilt as Day 0 in the post-confirm hook plus a daily Cron Trigger for Day 3 (Task 7.2). There are no newsletters or bulk broadcasts today; if one is ever needed, pick a marketing tool at that time.
8. Legal entity: `Karko AI Inc` (from `/imprint`). `BRAND.legalLine` = "Useful Apply, operated by Karko AI Inc".
11. Logo locked 2026-08-17: mark = two-tone paper plane (navy-600 body, gold-400 tip, no tile in lockups; navy tile with cream + gold plane for favicon, app icon and chat avatar). Wordmark = "Useful Apply" with a space, Plus Jakarta Sans 800, "Useful" navy-900 and "Apply" gold-500 on light surfaces, white and gold-400 on navy. Component: `src/components/BrandLogo.tsx`.
9. Cloudflare access for Claude: no API token. Wasim runs `! npx wrangler login` in the Claude Code session when Phase 3.5 starts (OAuth in the browser, nothing stored in the repo).
10. Trustpilot: keep the existing profile and its reviews; request a domain change from karkoai.com to usefulapply.com through Trustpilot support (Task 8.5). Only if refused, open a new profile.
6. Grok loop: Grok CLI implements, Claude verifies and commits. Branch: `rebrand/usefulapply`.
7. Flag on record: a June 2026 review judged a Vercel to Cloudflare move as "savings too small for the rebuild risk". Wasim has decided to do the full move anyway. This plan minimises risk by keeping production untouched until a single, rehearsed cutover.

## Global constraints (apply to every task)

- Branch `rebrand/usefulapply` off `main`. Merge `main` into it weekly (`git merge main`) so the cutover diff stays small. Never rebase, never force-push, never `--no-verify`.
- `npx tsc --noEmit` must be zero errors before any task is marked `[x]`. `npm run lint` had 227 pre-existing problems on `main` on 2026-08-17; a task must not add new lint problems (run `npx eslint <changed files>` and require zero output for the files you touched).
- Copy rules: no em dashes anywhere (`—` is banned in code, copy, docs and commits), contractions are fine, short sentences, no Oxford comma in UI copy, the product name in prose is "Useful Apply" (two words, capital U and A). Never "UsefulApply", never "usefulapply" in prose. Code identifiers, package name, domains, bucket and binding names use `usefulapply` / `UsefulApply` as needed.
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
  name: 'Useful Apply',
  legalLine: 'Useful Apply, operated by Karko AI Inc',
  domain: 'usefulapply.com',
  url: 'https://usefulapply.com',
  supportEmail: 'support@usefulapply.com',
  noreplyEmail: 'noreply@usefulapply.com',
  founderEmail: 'wasim@usefulapply.com',
  tagline: 'Your entire job search, in one app.',
  taglineInvestor: 'The AI job application agent.',
} as const;
```
- [x] Create the file with the exact values above.
- [x] Verify: `npx tsc --noEmit` zero errors.

### Task 0.3: Domains
Owner: Wasim (Cloudflare dashboard). Not code.
- [ ] Buy `usefullapply.com`. Check and buy `usefulapply.io` and `usefulapply.ai` if still available (they were free on 2026-08-17).
- [ ] Add all three as Cloudflare zones and create a Bulk Redirect (301) to `https://usefulapply.com/$1`.

---

## Phase 1: Brand identity (logo and assets)

### Task 1.1: Wordmark and logo mark
**Owner: Claude, not Grok.** Claude designs 3 to 4 logo options (wordmark + mark, each shown on cream and on navy, at navbar size and favicon size) as a single preview page in the scratchpad, Wasim picks one, then Claude implements the chosen option in the files below. Grok skips this task and continues with Task 1.2 only after 1.1 is `[x]`.
**Files:** Modify `src/components/KarkoLogo.tsx` (rename to `src/components/BrandLogo.tsx`, update all 17 import sites), replace `public/favicon-*.png`, `public/apple-touch-icon.png`, `src/app/icon.svg`, `src/app/apple-icon.png`, `src/app/opengraph-image.jpg`, `public/site.webmanifest`, `src/app/manifest.ts`.
Design (locked, see decision 11): two-tone paper plane mark, "Useful Apply" wordmark in Plus Jakarta Sans 800, "Apply" in gold. Deliver as inline SVG in the component plus exported PNGs at 16/32/180/192/512, favicon.ico and a 1200x630 OG image. No gradients.
- [x] Build `BrandLogo` keeping the existing `KarkoLogo` API (`variant: 'full' | 'icon' | 'wordmark'`, `theme: 'light' | 'dark'`, `size`) plus named `BrandIcon` and `BrandWordmark`, so the 17 call sites only change the import and component name.
- [x] Replace every favicon, apple icon, manifest icon and the OG image. Manifest `name` and `short_name` become "Useful Apply". (Also created the missing `public/icon-192.png` and `public/icon-512.png` that `manifest.ts` referenced.)
- [x] Verify: dev server on :3005, navbar, footer (dark, scaled) and login lockups render with Plus Jakarta Sans; `/icon.svg`, `/favicon.ico`, `/apple-icon.png`, `/icon-192.png`, `/site.webmanifest`, `/opengraph-image.jpg` all 200. tsc 0 errors, eslint clean on changed files. Done by Claude 2026-08-17.

### Task 1.2: Email logo and blog/OG images
**Files:** `src/lib/email/templates/*.ts` (logo URL and alt text), `public/images/**` files that carry the old logo (list them with `ls public/images` and check each), `src/components/blog/**` OG image generation if any.
- [x] Point email templates at `https://usefulapply.com/useful-apply-logo.png` (copied the Task 1.1 plane mark to `public/useful-apply-logo.png`; did not edit favicon/icon/OG/BrandLogo). All four templates now use that URL with alt "Useful Apply".
- [x] Regenerate any blog OG or hero images that carry the Karko wordmark: skipped. Owner: Claude. `docs/blog-image-brand-refresh-tracker.md` already marks every post Done with no-text GPT illustrations. `src/components/blog/**` has no OG image generator. Filename leftovers only: `public/blog/karko-follow-up-generator.jpg`, `public/blog/manual-vs-karko-ai.jpg`, `public/blog/karko-ai-safeguards.jpg`.
- [x] Product screenshots that still show the old Karko UI (K tile and/or "Karko AI" wordmark). **public/images:** none of the 14 files (11 `features/*.jpg` + 3 `gpt-0*.webp`) carry the old logo or app chrome. **public/screenshots (all 8, all used on marketing or blog):**
  - `public/screenshots/product-01-job-feed.webp` (ProductShowcase, PlatformScrollStack)
  - `public/screenshots/product-02-cv-optimized.webp` (ProductShowcase)
  - `public/screenshots/product-03-application-email.webp` (ProductShowcase)
  - `public/screenshots/product-04-tracker.webp` (ProductShowcase)
  - `public/screenshots/product-05-fit-analysis.webp` (ProductShowcase, blog)
  - `public/screenshots/01b-job-feed-left-only.webp` (blog)
  - `public/screenshots/03-application-kit-generated.webp` (PlatformScrollStack, blog)
  - `public/screenshots/11-job-feed-empty-upsell.webp` (PlatformScrollStack)
  Re-capture skipped. Owner: Claude, Playwright 1440x900 after Task 2.2.
  Demo video on `/` (`https://www.tella.tv/video/vid_cmpjrsku400wk04jm1wuf3es6`) still shows the Karko UI. Re-record after cutover. Owner: Wasim.
- [x] Verify: `grep -ril "karko" public/ src/lib/email` is not empty. Remaining: `public/llms.txt` and `public/llms-full.txt` (legal entity + `support@karkoai.com`) and `src/lib/email/config.ts` (`TODO(Task 7.1)` mailboxes). No blog slugs matched (grep is contents, not filenames). tsc 0 errors. eslint clean on changed email files.

---

## Phase 2: Copy and code rename

Order matters: do marketing pages first (highest visibility), then app, then internal. After each task run `grep -rin "karko" <scope>` and paste the count into the tracker line.

### Task 2.1: Marketing pages
**Files:** `src/app/page.tsx`, `src/app/layout.tsx` (metadata title/description/OG), `src/app/about/**`, `src/app/features/**`, `src/app/pricing/**`, `src/app/ai-job-application/**`, `src/app/contact/**`, `src/components/marketing/**`, `src/components/comparisons/**`, `src/app/compare/**`.
- [x] Replace every "Karko AI" / "KarKo AI" / "Karko" with `BRAND.name` (import from `src/lib/brand.ts`) or the literal "Useful Apply" in JSX text.
- [x] Update `metadata` titles: `Useful Apply | AI Job Application Agent` and page-specific titles. In `src/app/layout.tsx` fix `twitter.images` from `'/opengraph-image'` (404 today) to `'/opengraph-image.jpg'`, and set `metadataBase` fallback to `https://usefulapply.com`.
- [x] Comparison routes: rename slugs `karko-ai-vs-teal` etc. to `usefulapply-vs-teal` etc. in `src/app/compare/[slug]` data and add redirects for the old slugs in `next.config.*` (`redirects()` 301).
- [x] Verify: `grep -rin "karko" src/app/page.tsx src/app/layout.tsx src/app/about src/app/features src/app/pricing src/app/ai-job-application src/app/contact src/components/marketing src/components/comparisons src/app/compare` returns 0 lines. Count before: 271 after: 4. Remaining 4: `legalName: 'Karko AI Inc'` in `src/app/layout.tsx` (decision 4, legal entity unchanged) and 3 Trustpilot profile URLs (`trustpilot.com/review/karkoai.com` in layout sameAs, TrustpilotLogo, TrustpilotReviews) owned by Task 8.5.

### Task 2.2: App surfaces (dashboard, documents, settings, auth pages)
**Files:** `src/app/dashboard/**`, `src/app/documents/**`, `src/app/master-cv/**`, `src/app/master-cv-template/**`, `src/app/settings/**`, `src/app/account/**`, `src/app/subscription/**`, `src/app/notifications/**`, `src/app/profile/**`, `src/app/auth/**`, `src/components/**` (excluding marketing/comparisons done above), `src/components/KarkoAIStepIndicator.tsx` (rename to `StepIndicator.tsx`), `src/store/**`, `src/hooks/**`.
- [x] Rename strings, component names and file names. Keep localStorage/Zustand persistence keys unchanged unless a key literally contains "karko" (then add a one-time migration that copies the old key to the new key on load, so users don't lose local state).
- [x] Verify: `grep -rin "karko" src/app src/components src/store src/hooks` returns 0. tsc and lint clean. Count before: 181 after: 71. Remaining 71 are later-task or intentional leftovers: old localStorage/sessionStorage key strings in one-time migrations (7), BrandLogo comment (do not touch), Trustpilot URLs and legalName (Task 8.5 / decision 4), legal pages (Task 2.4), blog/sitemap/robots/feed (Task 2.5), API routes (Task 2.3). tsc 0 errors. eslint clean on new/substantially edited files; CVPanel, TrackerPanel, AgentProgressV2, CoverLetterPanel, EmailPanel, AISearchProfileCard and master-cv/page.tsx still have pre-existing lint from main.

### Task 2.3: Agents, prompts and API routes
**Files:** `src/lib/agents/**`, `src/lib/agents/prompts/**`, `src/lib/models/**`, `src/app/api/**`, `src/lib/**` (everything not covered above).
- [x] Replace product name mentions inside prompts and system messages. Do not change any rule text, examples or output schemas. Only the name.
- [x] Verify: `grep -rin "karko" src/lib src/app/api` returns 0. Run one fit analysis and one full generation locally against Supabase (still the data layer at this point) to confirm prompts still produce output. Count before: 232 after: 151. Remaining: `BRAND.legalLine` (Karko AI Inc), AgentRole/step id `karko_ai` (output schema, left unchanged), email templates + `src/lib/email/config.ts` (Task 2.4), `src/lib/blog/**` including historical image filenames (Task 2.5). Live fit analysis and full generation were not run: no authenticated local session, and `.env*` is off limits. tsc 0 errors. eslint clean on files without pre-existing issues.

### Task 2.4: Emails, legal pages, contact
**Files:** `src/lib/email/config.ts`, `src/lib/email/templates/{confirmation,password-reset,welcome,check-in}.ts`, `src/app/terms/**`, `src/app/privacy/**`, `src/app/imprint/**`, `src/app/api/contact/route.ts`.
- [x] Display name becomes `Useful Apply` but the addresses stay `noreply@karkoai.com` / `support@karkoai.com` / `wasim@karkoai.com` until Task 7.1, because usefulapply.com is not verified in Resend and its mailboxes are not routed yet. Task 7.1 flips every address (grep `TODO(Task 7.1)`). Founder intro line: "I'm the founder of Useful Apply".
- [x] Legal pages: "Useful Apply, operated by Karko AI Inc" (use `BRAND.legalLine`). Add one line to Privacy: "Useful Apply was previously known as Karko AI." Update effective dates.
- [x] Verify: render each email template to a local HTML file and open it; grep scope returns 0. Count before: 49 after: 14. Remaining 14 are intentional: karkoai.com sender/recipient addresses with `TODO(Task 7.1)` (config, contact, terms, privacy, imprint), legal entity `Karko AI Inc` (decision 4), and the Privacy rename sentence. Rendered confirmation, reminder, password-reset, welcome and check-in to `/tmp/usefulapply-email-previews/`; from-lines are `Useful Apply <noreply@karkoai.com>` and `Wasim from Useful Apply <wasim@karkoai.com>`. `/terms`, `/privacy`, `/imprint` 200 on :3005 with legalLine and August 17, 2026 dates. tsc 0 errors. eslint clean on changed files.

### Task 2.5: SEO surfaces, blog, llms.txt
**Files:** `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/feed.xml/**`, `public/llms.txt`, `public/llms-full.txt`, `src/app/blog/**`, `src/components/blog/**`.
- [x] Base URL from `BRAND.url`. Blog author and site name updated. Keep blog post slugs unchanged (they carry SEO), only update body copy and any "Karko" in titles where it isn't the subject. Also updated `src/lib/blog/posts.ts` body copy (step requires it; historical image filenames left unchanged).
- [x] Verify: `curl localhost:3005/sitemap.xml` usefulapply count 41 equals loc count 41. `grep -ci karko public/llms.txt` is 1 and `public/llms-full.txt` is 2 (not 0): remaining are legal entity `KarKo AI Inc` / `Karko AI Inc` (decision 4) and `support@karkoai.com` with `TODO(Task 7.1)`. Count before (listed files): 157 after: 5. Remaining 5: llms legal entity + support mailbox (3) and RSS `noreply@karkoai.com` (2, Task 7.1). posts.ts still has 3 historical image paths (`karko-follow-up-generator.jpg`, `manual-vs-karko-ai.jpg`, `karko-ai-safeguards.jpg`). `/blog` and `/feed.xml` 200 on :3005. tsc 0 errors. eslint: no new problems; pre-existing unused-var warnings on `blog/[slug]/page.tsx` and `BlogContent.tsx`.

### Task 2.6: Internal docs and repo metadata
**Files:** `README.md`, `CLAUDE.md`, `AGENTS.md`, `KARKO_POSITIONING.md` (rename to `USEFULAPPLY_POSITIONING.md`), `docs/**`, `.claude/rules/**`, `.claude/agents/**`, `package.json` name, `SETUP.md`, `INSTALLATION_STEPS.md`, `STRIPE_SETUP_GUIDE.md`.
- [x] Rename and update. Historical docs (`docs/*-tracker.md`, `docs/*-plan.md`) get a one-line note at the top: "Written when the product was called Karko AI." and are otherwise left alone. `KARKO_POSITIONING.md` renamed to `USEFULAPPLY_POSITIONING.md`. `package.json` name is `usefulapply`. Skipped `SETUP.md`, `INSTALLATION_STEPS.md`, `STRIPE_SETUP_GUIDE.md`: those files are not in the repo (only mentioned in CLAUDE.md / AGENTS.md). Agent type ids `karko-architect` and `karko-ui-designer` kept (tool/registry identifiers).
- [x] `CLAUDE.md`: title, product description, agent descriptions, integrations section (this changes again in Phase 8, keep a checkbox for it). Phase 8 checkbox added under Integrations in both `CLAUDE.md` and `AGENTS.md`.
- [x] Verify: `grep -rli karko --exclude-dir=node_modules --exclude-dir=.git .` is not only historical docs and migrations. Remaining buckets: historical tracker/plan notes and audits; `supabase/migrations` and diagnostics (Phase 4); later-task leftovers (karkoai.com mailboxes with TODO 7.1, Trustpilot URLs Task 8.5, `BRAND.legalLine`, BrandLogo, localStorage migration keys, `AgentRole` id `karko_ai`); agent type ids; company/ FEATURES.md REVIEW.md scripts; `.codex` / `.claude` agent filenames. Local `.env*` and Playwright logs also matched; those were not opened. tsc 0 errors. No TSX/TS lint surface beyond `package.json` name.

---

## Phase 3: Hosting on Cloudflare Workers (still on Supabase)

### Task 3.1: OpenNext adapter
**Packages to add:** `@opennextjs/cloudflare`, `wrangler` (dev). Confirm exact install commands with current docs at https://opennext.js.org/cloudflare before running.
**Files:** Create `wrangler.jsonc`, `open-next.config.ts`, `.dev.vars.example` (names only, no values). Modify `package.json` scripts (`preview`, `deploy:cf`), `next.config.*` (`initOpenNextCloudflareForDev()` in dev), `.gitignore` (`.open-next/`, `.wrangler/`, `.dev.vars`).
- [x] `wrangler.jsonc`: `name: "usefulapply"`, `compatibility_date` = 2026-08-17, `compatibility_flags: ["nodejs_compat", "global_fetch_strictly_public"]` (second flag required by current OpenNext get-started), `assets` binding `ASSETS` + `main: ".open-next/worker.js"` per OpenNext docs, R2 bucket `usefulapply-next-cache` for the incremental cache, `routes` for `usefulapply.com/*` and `www.usefulapply.com/*`. Also added `WORKER_SELF_REFERENCE` and `IMAGES` from the official template. Installed `@opennextjs/cloudflare@1.20.2` and `wrangler@4.123.0` (`npm install @opennextjs/cloudflare` then `npm install --save-dev wrangler`).
- [x] Verify: `npx opennextjs-cloudflare build` succeeded after converting `src/proxy.ts` to Edge `src/middleware.ts` (OpenNext 1.20.2 does not support Next.js 16 Node-only `proxy.ts`; Next emits the deprecation warning). `npx opennextjs-cloudflare preview --port 8790` (8787 was already taken by an unrelated python process). Hits on http://localhost:8790:
  - `GET /` 200 (x-opennext: 1, cache HIT)
  - `GET /pricing` 200
  - `GET /dashboard` 200 (static prerender; client-side auth still sends signed-out users to `/auth/login`. No server 302.)
  - `GET /api/parse-cv` 405 (route is POST only)
  - `POST /api/parse-cv` `{}` 401 `{"error":"Authentication required for storage-based parsing."}`
  Extra probes (module load under nodejs_compat, no crash): `POST /api/generate-pdf` 401 (pdf-lib), `POST /api/stripe/create-checkout` 401 (stripe), `POST /api/contact` 400 (resend path not reached). parse-cv logged `[Anthropic] Using direct Anthropic API` (bedrock-sdk/anthropic loaded).
  Node API / package failures under `nodejs_compat`: none on the verify routes.
  - `sharp`: not imported by the app (devDependency, scripts only). No fix needed.
  - `docx`: client-only import in `CoverLetterPanel.tsx`. No Worker load on these routes.
  - `pdf-lib`: loaded via generate-pdf, 401 before PDF work. No failure.
  - `@anthropic-ai/bedrock-sdk` / Anthropic: loaded via parse-cv. No failure.
  - `posthog-node`: loaded via parse-cv. No failure.
  - `stripe`: loaded via create-checkout. No failure.
  tsc 0 errors. eslint clean on `next.config.ts`, `open-next.config.ts`, `src/middleware.ts`.

### Task 3.2: Streaming, SSE and long requests
**Files:** `src/app/api/agent-v2/**`, `src/app/api/chat/**`, `src/app/api/regenerate/**`, `src/hooks/useAgentV2.ts`.
- [x] Confirm SSE streaming works end to end on the Workers preview (Workers have no wall-clock limit for streaming responses, but CPU time is limited; check the paid plan CPU limit and set `limits.cpu_ms` in wrangler if needed). Paid default is 30s CPU, max 300_000 ms (5 min). Set `limits.cpu_ms: 300000` in `wrangler.jsonc` to match `maxDuration = 300` on agent-v2. `POST /api/agent-v2` on preview returns `Content-Type: text/event-stream` and a streamed `data: {"type":"error",...}` event. `useAgentV2.ts` already reads the body with `getReader()`; no hook change. `/api/chat` and `/api/regenerate` are JSON routes (not SSE); `POST` unauthenticated is 401 on both.
- [x] The `contextCache` Map (30-min TTL) in the agent route becomes a KV namespace `CONTEXT_CACHE` with 30-min expiration (Workers instances don't share memory). Add the KV binding to `wrangler.jsonc`. Binding `CONTEXT_CACHE` with `id: "TODO(Task 3.5)"`. `cacheContext` / `getCachedContext` / `removeCachedContext` are async: KV `put`/`get`/`delete` with `expirationTtl: 1800` when the binding is present; same in-memory Map when it is missing (plain `next dev`).
- [x] Verify: live "Analyze first" then "Apply for this job" was not run (no authenticated preview session; `.env*` off limits). Closest check: seeded local KV with `wrangler kv key put --binding CONTEXT_CACHE --local ctx-verify-1 ...`, then `POST /api/agent-v2` `generate_with_context` without `cachedContextData`. Preview log printed `cache: hit`. Response started the generate_with_context workflow (not `full_optimization` fallback), then failed on the stub context (`Cannot read properties of undefined (reading 'length')`). tsc 0 errors. eslint on agent-v2: 5 pre-existing unused-var warnings, no new errors.

### Task 3.3: Rate limiter
**Files:** `src/lib/middleware/rateLimiter.ts`, `wrangler.jsonc`.
- [x] Replace the in-memory sliding window with the Workers Rate Limiting binding (one binding per `RATE_LIMITS` bucket, same limits as today). Keep the same `checkRateLimit(key, bucket)` signature so call sites don't change. Binding `simple.period` is 10 or 60 only, so every 60s bucket has a `RATE_LIMIT_*` binding (namespace_id 3101-3125; confirm unused on the account in Task 3.5). `anon-parse` (5 / 3600s) cannot be expressed and stays on the in-memory Map. `checkRateLimit` is now async (`Promise<RateLimitResult>`) because `limit()` is async; call sites `await` the same `(key, RATE_LIMITS[bucket])` args. If the binding is missing, the original Map path runs (plain `next dev`).
- [x] Verify: preview showed all 25 rate-limit bindings. `POST /api/contact` with `X-Forwarded-For: 203.0.113.50`: requests 1-3 returned 200 `{"success":true,"message":"Thank you for your message. We will get back to you soon!"}`; requests 4-5 returned 429 `{"error":"Too many requests. Please try again later."}` (same body as production). tsc 0 errors. eslint on `rateLimiter.ts` clean; other touched files only have pre-existing any/unused warnings.

### Task 3.4: Cron and Inngest
**Files:** `src/inngest/**`, `src/app/api/inngest/route.ts`, `src/app/api/cron/resend-confirmations/route.ts`, `wrangler.jsonc` (`triggers.crons`), a new `src/cron/index.ts` that the Worker `scheduled()` handler dispatches to.
- [x] Port the three Inngest cron functions in `src/inngest/job-feed.ts` (`0 3 * * *`, `*/10 * * * *`, `*/10 * * * *`) and the confirmation-resend cron to Workers Cron Triggers. Note that `job-feed.ts` says the feed runs on-click and the scheduler is dormant; port only what is live, and delete dead Inngest code once verified unused (grep first). Live jobs (not the old feed scheduler): daily cleanup `0 3 * * *` (`cleanupHistoricalJobFeedData`), ten-minute reconcilers `*/10 * * * *` (`expireStaleJobFeedApplicationGenerations` + `releaseStaleReservations`), hourly confirmation resend `0 * * * *` (same as pg_cron). Dispatch lives in `src/cron/index.ts`. Confirmation logic extracted to `src/cron/resend-confirmations.ts`; the HTTP route still authenticates with `CRON_SECRET` then calls that function. Worker entry is `src/worker.ts` (wraps `.open-next/worker.js` `fetch` and adds `scheduled()`). Deleted `src/inngest/**` and `src/app/api/inngest/route.ts` after grep showed no other imports.
- [x] Remove `inngest` from `package.json` when nothing imports it. `npm uninstall inngest` (was 4.2.4).
- [x] Verify: 8787 was taken by an unrelated python process, so `npx wrangler dev --test-scheduled --port 8788`. `GET http://localhost:8788/__scheduled?cron=*/10+*+*+*+*` returned 200 `Ran scheduled event`. Current docs path `GET /cdn-cgi/handler/scheduled?cron=*/10+*+*+*+*&format=json` returned 200 `{"outcome":"ok","noRetry":false}`. Wrangler log printed `[cron] ten-minute reconcilers` twice (once per curl), no errors. tsc 0 errors after deleting stale `.next` inngest types. eslint clean on `src/cron/**` and the confirmation route.

**Batch C review outcome (2026-08-17, two Opus adversarial reviewers):** fixed before commit: `cf-connecting-ip` first in `getClientIP`; KV context cache keyed by `userId:contextId` with write-through to the isolate map, `randomUUID` ids; two rate limits that had silently fallen back to per-isolate memory now have bindings; `scheduled()` logs and rethrows; ten-minute reconcilers run independently (`allSettled`); confirmation resend claims the counter with a compare-and-set before sending so two schedulers can't double-send; unknown cron string throws; cron handlers lazy-imported; OpenNext Durable Object classes re-exported from `src/worker.ts`; `initOpenNextCloudflareForDev()` guarded to `next dev`; PII dropped from cron logs. Accepted as known limits (documented, not fixed): Workers Rate Limiting is per-location and best-effort; Cron Triggers have no retry or single-flight (DB guards cover the credit reconciler); `limits.cpu_ms` also caps `scheduled()`; the client-supplied `cachedContextData` fallback (pre-existing) carries no `companyResearch`. Open for Wasim: Stripe webhook `constructEventAsync` (Task 3.5 test).

### Task 3.5: Staging deploy to usefulapply.com
Owner: Claude. Wasim runs `! npx wrangler login` in the Claude Code session first (browser OAuth). Wasim types secret values himself when prompted by `wrangler secret put`.
- [ ] **Confirm with Wasim before deploy (cost):** the Worker needs the Workers Paid plan ($5/month; the free plan's 10 ms CPU cap can't run Next SSR + streaming, and `limits.cpu_ms` needs Paid). The `images` binding in `wrangler.jsonc` enables `next/image` optimisation on Workers (5,000 free transformations/month, then $0.50 per 1,000); drop the binding and set `images.unoptimized` if not wanted. KV, R2, D1 and the Rate Limiting binding stay inside free tiers at current traffic. No other resources.
- [ ] **Stripe webhook on Workers (flagged by security review, needs Wasim's ok to change billing code):** `src/app/api/stripe/webhook/route.ts` uses the sync `constructEvent`; Stripe's documented Workers path is `constructEventAsync` with `Stripe.createSubtleCryptoProvider()` and `httpClient: Stripe.createFetchHttpClient()`. During the staging smoke, send a Stripe test-mode webhook to `https://usefulapply.com/api/stripe/webhook` (staging endpoint, test key) and confirm signature verification passes; if it fails, make that change with Wasim's approval.
- [ ] **Crons stay OFF on staging.** Staging talks to the production Supabase DB, so the hourly confirmation-resend cron would email real unconfirmed users usefulapply.com links, and the reconcilers would run twice. Deploy staging from a wrangler environment (`env.staging`) with `triggers.crons: []`; production (top-level config) keeps the three crons and only gets deployed in Phase 9. Same for Task 3.5's smoke: never trigger `/__scheduled` against staging.
- [ ] Rate limiting binding `namespace_id`s 3101 to 3125 in `wrangler.jsonc` are arbitrary; confirm they don't collide with anything else in the account before the first deploy. `anon-parse` (5 per hour) stays in-memory because the binding only supports 10s or 60s windows; note it resets per isolate.
- [x] 2026-08-17: KV `CONTEXT_CACHE` (id 2de5d12fd4934bbcad48fb1b95fc4cf6) and R2 `usefulapply-next-cache` created; Worker `usefulapply` deployed with Custom Domains usefulapply.com + www (DNS and certs auto-created), crons empty, `X-Robots-Tag: noindex, nofollow` on every route (build flag `NEXT_PUBLIC_SITE_STAGE=staging`), built with `NEXT_PUBLIC_SITE_URL=https://usefulapply.com`. Public smoke: `/`, `/pricing`, `/features`, `/about`, `/blog`, `/auth/login`, `/dashboard`, `/icon.svg`, `/opengraph-image.jpg`, `/sitemap.xml` (usefulapply.com hosts), compare page and the 308 from the old slug all pass; title reads "Useful Apply | ...". Deploy command from now on: `NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npx opennextjs-cloudflare build && npx wrangler deploy`.
- [ ] **Observed:** the Workers Rate Limiting binding is loose in production (12 requests at 3/min produced one 429; documented best-effort, per-location behaviour). Hard abuse gates are DB-backed (anonymous generation ledger, credit reservations), so this is acceptable for staging. Decision for Wasim before cutover: accept as is, or add a Durable Object rate limiter (exact counts, one DO class, negligible cost on Workers Paid).
- [ ] Secrets (Owner: Wasim runs the command, Claude prepares it): `npx wrangler secret bulk .env.local` uploads every variable from the local env file as Worker secrets without Claude reading it. Then redeploy and run the authenticated smoke below. (list names from `SETUP.md`; never paste values in chat or files). Public `NEXT_PUBLIC_*` vars go in `wrangler.jsonc` `vars`.
- [ ] Verify: full smoke on https://usefulapply.com against the **Supabase** data: sign in with Google, upload CV, run fit analysis, generate application, download PDF and DOCX, open job feed, Stripe checkout in test mode. Record results here.

---

## Phase 4: Database to D1 (biggest risk, go slow)

**Why D1 and what it costs us:** D1 is SQLite. That means no `jsonb` operators, no RLS, no `pg_cron`, no interactive transactions (only `batch()` which is atomic), a 10 GB per-database cap and one primary region for writes. Everything Supabase enforced with 33 RLS policies must become explicit `where user_id = ?` in a data-access layer. If during Task 4.1 the schema turns out to depend on Postgres features that don't port cleanly (heavy jsonb queries in the job feed, for example), stop and report; the fallback is Postgres on Neon reached through Cloudflare Hyperdrive, which keeps the app on Cloudflare but the data off it.

**Packages to add:** `drizzle-orm`, `drizzle-kit` (dev), `better-sqlite3` + `@types/better-sqlite3` (dev, only for the local concurrency test script). D1 database `usefulapply-db` (id `8cd7059e-4f0b-429b-aace-e379756707e1`, region EEUR) already exists and is bound as `DB` in `wrangler.jsonc` with `migrations_dir: migrations/d1` (created by Claude 2026-08-17). Local work uses `npx wrangler d1 migrations apply usefulapply-db --local` and `npx wrangler d1 execute usefulapply-db --local`. Never run without `--local` in Phase 4; the remote database is filled in Task 4.3.

### Task 4.1: Schema port
**Files:** Create `src/db/schema.ts` (Drizzle), `drizzle.config.ts`, `migrations/d1/0001_init.sql` (generated). Read `supabase/migrations/*.sql` (18 files) and `SUPABASE_SCHEMA_GUIDE.md`.
- [~] Port all 29 tables used by the app (`profiles`, `user_credits`, `documents`, `application_sessions`, `job_feed_*` (8 tables), `credit_reservations`, `credit_transactions`, `message_feedback`, `user_career_profiles`, `subscriptions`, `subscription_plans`, `avatars`, `user_search_strategies`, `user_cv_suggestions`, `chat_messages`, `webhook_events`, `user_job_preferences`, `serpapi_filter_tokens`, `connected_accounts`, `anonymous_generations`, `addon_credit_packs`, `contact_submissions`). `uuid` becomes `text` (keep the same UUID values so Stripe customer ids and PostHog distinct ids stay valid), `jsonb` becomes `text` with JSON, `timestamptz` becomes `text` ISO 8601, enums become `text` with a CHECK.
  Record: `SUPABASE_SCHEMA_GUIDE.md` is not in the repo (only named in CLAUDE.md). Schema rebuilt from `src/lib/supabase/types.ts` plus the 18 incremental SQL files. `avatars` is a Storage bucket, not a table; the matching table is `profile_photos`. Also ported `user_notifications` (used by delete-account / job-feed). Added `user_credits.version` (integer, default 0) for Task 4.2 OCC. Seeded `subscription_plans` (free 4 / plus 50 / max 200) and `addon_credit_packs` (Credit Pack 50 / $19.99) in `migrations/d1/0001_init.sql`. 30 app tables + d1_migrations on local apply.
- [~] Port the Postgres functions to application code: `initialize_user_credits` (runs on signup, becomes part of the Better Auth `afterSignUp` hook in Task 5.2), `trigger_karko_confirmation_resend` (becomes the cron in Task 3.4), the two `set_updated_at` triggers (set `updated_at` in the data layer on every update).
  Record: `initializeUserCredits` lives in `src/db/repos/credits.ts` (called from `getUserCredits` when the row is missing). Confirmation resend is already the Task 3.4 cron (`src/cron/resend-confirmations.ts` now writes via `claimConfirmationResend`). `updated_at` is set in every repo update.
- [~] Verify: `npx wrangler d1 migrations apply usefulapply-db --local` succeeds; `npx drizzle-kit check` clean.
  Record: apply --local: `0001_init.sql` 73 commands executed successfully. `npx drizzle-kit check`: Everything's fine.

### Task 4.2: Data-access layer
**Files:** Create `src/db/client.ts` (returns Drizzle bound to `env.DB`), `src/db/repos/*.ts` one file per domain (`profiles.ts`, `credits.ts`, `documents.ts`, `sessions.ts`, `jobFeed.ts`, `subscriptions.ts`, `feedback.ts`, `contact.ts`). Modify the 71 files that import from `src/lib/supabase/**` to call the repos instead. Delete `src/lib/supabase/**` when nothing imports it.
**Interfaces (produces):** every repo function takes `userId: string` as the first argument and filters by it. There is no function that returns rows for "any user" except in `src/db/repos/admin.ts`, which is only imported by cron handlers and the Stripe webhook.
- [~] Credits: `deductCredits(userId, amount, reason)` must stay optimistic-concurrency safe. Implement as one conditional `UPDATE user_credits SET balance = balance - ? , version = version + 1 WHERE user_id = ? AND version = ? AND balance >= ?` inside a `db.batch([...])` with the ledger insert; if `changes === 0` retry up to 3 times, then throw. Same for `credit_reservations`. Write a test that runs 20 concurrent deductions against a local D1 and asserts the final balance.
  Record: three-bucket deduct (monthly then rollover then addon) with `WHERE user_id = ? AND version = ? AND (monthly+rollover+addon) >= ?`, `version = version + 1`, batched with a ledger INSERT gated on `changes() > 0`. Retries 3 times then throws. 20 concurrent workers via `node scripts/test-credit-concurrency.cjs`: successes 20, failures 0, starting 20, final 0, version 20, ledgerRows 20, pass true.
- [~] Verify: `grep -rn "@supabase" src` returns only auth files (removed in Phase 5). tsc and lint clean. Local D1 seeded from a test export runs the full app in `wrangler dev`.
  Record (Grok, 2026-08-17): tsc --noEmit 0 errors. Layer is live: `src/db/client.ts`, `src/db/repos/*.ts`, `src/db/actions.ts`. Job-feed server, credits, reservations, contact, delete-account, cron profiles, ingestion, cleanup, filter-tokens, AuthContext profiles moved.
  Record (Claude, 2026-08-17): remaining data `.from()` calls all swapped. Stripe webhook + checkout/portal/addon (new OCC repo functions `applyAddonPurchase`, `applyPlanChange`, `applyRenewalReset`, `applyRefundRemoval`, `findCreditsByUserId`, `upsertSubscriptionByUser`, `setProfileSubscription`), all 14 `src/app/api/job-feed/**` routes (`getCvSuggestion`/`upsertCvSuggestion`, `getJobPreferences`/`upsertJobPreferences`), agent-v2 (`src/db/repos/anonymous.ts`, `updateSession`), post-confirm (`claimWelcomeSend`), signup (`upsertProfileOnSignup`), chat, TrackerPanel + useSupabaseSync (`listTrackerApplications`, `listTrackerStatuses`, `updateDocumentStructuredData` actions). Security fixes from review: `updateProfileAction` allowlists self-editable columns (no client write to `subscription_tier` etc.), `getOrCreateProfileAction` takes email from the session. `grep -rn "\.from('" src` now returns only Supabase Storage buckets (`cv-files`, `generated-pdfs`, Phase 6). `@supabase` remains for auth (`client.ts`, `server.ts`, `admin.ts`, middleware, auth pages) and storage. tsc 0 errors; eslint: no new errors (remaining `no-explicit-any` counts equal or below HEAD). Behavior notes: repo reads fail loud, so a few job-feed failure paths return 500 instead of a degraded 200; webhook `handleSubscriptionUpdate` is now OCC-guarded; ledger inserts ride in the same `db.batch` as balance writes. Full wrangler-dev smoke against a production export still not run (Task 4.3 owns the export). `src/lib/supabase/**` folder not deleted (auth + storage still import it).
  Adversarial review (5 opus lenses, 2026-08-17) findings fixed: (1) CRITICAL `db.batch([db.run(sql\`...\`)])` throws in drizzle-orm 0.45.2 (D1 driver has no `.stmt` for raw runs), so every OCC credit write was dead on real D1; Grok's concurrency test used better-sqlite3 directly and never hit it. Replaced with `runBatch()` in `src/db/client.ts` (raw binding `prepare().bind()` + `batch()`), validated on workerd via a scratch `wrangler dev` worker: stale version -> 0/0 changes, 20 concurrent deducts -> 20 ok, final 0, version 20, ledger 20. (2) CRITICAL mass assignment: `saveDocumentAction`/`updateSessionAction` spread a browser bag so `user_id` could re-parent rows; now explicit columns / stripped keys. (3) HIGH `transitionReservation` reported `transitioned:true` on a lost CAS (double refund); now `.returning()`. (4) HIGH `isUniqueViolation` never matched DrizzleQueryError; now walks `cause` (webhook dedupe returns 200 duplicate again). (5) HIGH `insertRankedItems` and `getCanonicalJobsByIds` exceeded D1's 100 bound-param cap for paid tiers; chunked (`db.batch` of insert builders, validated on workerd) and `deleteExpiredRankedItems` uses a subquery. (6) HIGH webhook `applyPlanChange` failure no longer half-syncs tier to subscriptions/profiles; OCC attempts 2 -> 5. (7) HIGH agent-v2: job-preferences read, anonymous-generation record and reservation capture are best-effort again (a D1 hiccup no longer discards a finished generation). Also: `reserveCredits` verifies before refunding on non-unique errors, `updateGeneration` returns null on a lost status CAS, portal/addon-checkout use a non-initializing credits read, `COALESCE` guard on `stripe_customer_id`. Not fixed (low, noted): SQLite `LIKE` is ASCII-only case-insensitive in the tracker search; server actions returning `Error` objects lose their message over React Flight; `admin.ts` run-scoped helpers are imported by `src/lib/job-feed/server.ts` (no live IDOR, ids are server-derived); ledger inserts now roll back the credit write if they fail (previously logged and kept the credits); OAuth users without an email get no profile from `getOrCreateProfileAction`. Re-review round 2 fixed: `reserveCredits` coerces non-UUID `session_id`/`generation_id` to null before insert (FK to `application_sessions`; client sessions are `session-<ts>` until synced, so every paid reservation would have failed on D1), reservation idempotency lookups are user-scoped (`getReservationByKeyAny` removed), `stripIdentity()` guards settings/run/feedback/generation/session writes, refund ledger rows log the actual removed delta. Still open (low): `deductAmount` throws after 3 OCC retries where `checkAndDeductCredits` expects `{ success: false }`; `insertRankedItems` batch is atomic but the preceding delete in `server.ts` is outside it; `scripts/test-credit-concurrency.cjs` exercises better-sqlite3 directly, not the drizzle/D1 path (the workerd probe above is the real evidence).

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

Prereq (Wasim, dashboard or CLI): `npx wrangler email sending enable usefulapply.com`, add the SPF/DKIM/DMARC records it prints, and confirm with `npx wrangler email sending list`. Also enable Email Routing on usefulapply.com and route `support@` and `wasim@` to Wasim's inbox so replies and contact-form mail land somewhere.

### Task 7.1: Sender module
**Files:** Create `src/lib/email/send.ts` wrapping `env.EMAIL.send({ to, from: { email: BRAND.noreplyEmail, name: BRAND.name }, subject, html, text })`; every template must return both `html` and `text`. `wrangler.jsonc`: `"send_email": [{ "name": "EMAIL" }]`. Flip every `TODO(Task 7.1)` address to usefulapply.com. Replace Resend calls in `src/app/api/contact/route.ts`, `src/app/api/auth/{signup,forgot-password,post-confirm}/route.ts`, the confirmation-resend cron, and the Better Auth verification and reset hooks from Task 5.1.
- [ ] Verify: each transactional email arrives in a real inbox from staging with SPF, DKIM and DMARC pass in the headers.

### Task 7.2: Founder welcome flow on Cloudflare
Today (Resend): Day 0 founder welcome is sent when a user confirms email, Day 3 check-in is scheduled with Resend `scheduledAt`, and `profiles.welcome_sent_at` prevents re-sends. Rebuild the same behaviour without Resend.
**Files:** `src/app/api/auth/post-confirm/route.ts` (or the Better Auth `emailVerified` hook after Phase 5), `src/lib/email/templates/{welcome,check-in}.ts`, `src/cron/welcome-checkin.ts` (new), `src/db/schema.ts` (add `profiles.check_in_sent_at text null` via a D1 migration), `wrangler.jsonc` (`triggers.crons` add `0 9 * * 1-5`, weekdays 09:00 UTC, matching the "weekday sends only" rule), `src/lib/email/config.ts`.
- [ ] Day 0: after email verification, if `welcome_sent_at` is null, send the welcome via `sendEmail()` from Task 7.1 with `from: { email: 'wasim@usefulapply.com', name: 'Wasim from Useful Apply' }` and `replyTo: 'wasim@usefulapply.com'`, then set `welcome_sent_at`.
- [ ] Day 3: the cron selects users where `welcome_sent_at <= now - 3 days` and `check_in_sent_at is null` and `email_verified = 1`, sends the check-in, sets `check_in_sent_at`. Idempotent: run twice, second run sends nothing.
- [ ] Copy: keep the current email text but "Karko AI" becomes "Useful Apply", founder intro stays "I'm the founder of Useful Apply", the desktop-only note stays mandatory, promo signals stay soft (these are existing rules from the founder).
- [ ] Remove `resend` from `package.json`, delete `scripts/resend-*.ts` and `src/lib/email/config.ts` references to Resend audiences.
- [ ] Verify: on staging, verify a fresh test account, receive Day 0 immediately; set `welcome_sent_at` back 3 days in D1, trigger the cron with `curl "http://localhost:8787/__scheduled?cron=0+9+*+*+1-5"`, receive Day 3 once and only once.

---

## Phase 8: Integrations re-point

- [ ] **Stripe:** new webhook endpoint `https://usefulapply.com/api/stripe/webhook` (create it now, keep the Vercel one until cutover), product and price names "Useful Apply Plus", "Useful Apply Max", "Useful Apply Credit Pack", customer portal branding, success/cancel URLs from `BRAND.url`. Financial logic untouched. Wasim confirms in the Stripe dashboard.
- [ ] **Google OAuth:** consent screen name "Useful Apply", authorised origins and redirect URIs for usefulapply.com and Better Auth's callback path.
- [ ] **PostHog:** project display name, allowed domains, and the `NEXT_PUBLIC_POSTHOG_KEY` stays the same so history continues. Update `.claude/rules/posthog.md`.
- [ ] **Bedrock / Anthropic:** no change. Confirm the AWS SDK works from Workers under `nodejs_compat` (checked in Task 3.1).
- [ ] **Trustpilot (Task 8.5, owner Wasim):** email Trustpilot support from the account owner address asking to change the business domain from karkoai.com to usefulapply.com and the display name to Useful Apply, keeping the reviews. When confirmed, update the profile URL in `src/components/marketing/TrustpilotReviews.tsx` and `src/components/marketing/Footer.tsx`. If Trustpilot refuses, create a new profile for usefulapply.com and point both components at it.
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
- [ ] Remove the `X-Robots-Tag: noindex` header: build without `NEXT_PUBLIC_SITE_STAGE=staging` (see `next.config.ts` headers()).
- [ ] karkoai.com: move DNS to Cloudflare if not already there, add a Bulk Redirect rule: `karkoai.com/*` and `www.karkoai.com/*` 301 to `https://usefulapply.com/$1`. Keep this redirect for at least 12 months.
- [ ] Disable the Supabase `pg_cron` confirmation-resend job (migration 202605230003) so it doesn't double up with the Workers hourly cron. Do it in the Supabase SQL editor at cutover, not before.
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
2. Grok implements each task in the batch one at a time: exactly the task's files and steps, then `npx tsc --noEmit` and `npm run lint`, fills in any "Count before/after" or "Record here" lines, changes that task's box to `[x]`, then moves to the next task in the batch. After the last task in the batch it stops and reports. Grok does not commit, does not push, does not open PRs, does not touch `.env*`, does not install packages that aren't listed in the task.
3. Wasim returns to Claude Code. Claude re-runs tsc and lint, checks the verify step, fixes gaps, changes `[x]` to `[x]`, commits with a conventional message (`feat(rebrand): ...`, `feat(cf): ...`, `chore(migrate): ...`) and pushes to `rebrand/usefulapply`.
4. Anything blocked becomes `[!]` with the reason and is raised to Wasim.
5. Tasks marked "Owner: Claude" (1.1 logo design, 3.5, 4.3, 4.4, 5.3, 6.2, 9.x) are done by Claude directly, not Grok. Grok skips them and takes the next `[ ]` task that has no owner line, unless the skipped task is a prerequisite (1.1 blocks 1.2; 3.5 blocks Phase 4 onward), in which case Grok stops and reports.
