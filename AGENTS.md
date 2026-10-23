# AGENTS.md: Useful Apply Behavioral Instructions

> For historical context, architecture docs, feature narratives, and the changelog, check git history.

---

## Useful Apply Agents (use proactively, do not ask permission)

Specialist agents are the **preferred** way to handle bug investigations, external research, code review, UI verification, and agent/prompt work. They protect the main context window and often find issues faster than direct exploration. Spawn them in parallel when the work is independent.

### Project-scope agents (this repo)
- **`debugger`** (global agent; read `.claude/rules/debugging-patterns.md` first) — Whenever a runtime bug, regression, stack trace, or "X is broken but I don't know why" appears. Also for intermittent SSE/streaming failures, wrong state on screen, credit/billing anomalies, and any failed request without an obvious cause. Read-only by default; proposes patches with file:line, refuses to paper over symptoms.
- **`agent-expert`** — When editing anything in `src/lib/agents/`, `src/lib/agents/prompts/`, `src/lib/models/`, `src/app/api/agent-v2/`, or the `useAgentV2` / `useAgentWorkflow` hooks. Also for anti-hallucination rule changes, SSE event semantics, context-builder work, CV pipeline, fit-assessment prompts. Powered by Opus.
- **`ui-tester`** — After any UI change to `/dashboard`, `/applications`, `/documents`, `/` (landing), or shared components (ChatPanel, CVPanel, CoverLetterPanel, EmailPanel, FeedConversation, FeedCanvas). Uses Playwright MCP. Run before calling a UI task done.
- **`karko-architect`** — For cross-cutting design decisions, refactors, and "where should this state live" questions. Use for anything that spans 3+ files or has non-obvious tradeoffs. Returns a plan with ordered steps; does not modify code itself. Powered by Opus.
- **`d1-dba`** — When writing or reviewing D1 migrations in `migrations/d1/`, touching schema, or when a query looks suspicious. Will not run migrations itself. (Legacy `supabase/migrations/` is frozen until decommission.)
- **`integration-tester`** — Before every commit touching components, hooks, API routes, or job-feed files. Runs tsc + lint + narrow spot-checks. Cheap and fast — uses Sonnet.
- **`job-feed-specialist`** — When editing anything under `src/lib/job-feed/**`, `src/app/api/job-feed/**`, or `src/components/job-feed/**`. Owns ingestion, prefilter, LLM ranker, batch reconcile, and settings flows.
- **`karko-ui-designer`** — For UI/UX audits, redesigns, and visual polish. Carries brand tokens (navy/cream/gold), typography (Georgia+Arial), surface roles, radius/shadow scales, and anti-AI-slop rules in its system prompt. Can audit AND implement. Does NOT touch backend, API routes, data fetching, or Zustand stores.

### Opus escalation (automatic — do not wait to be asked)
For tasks requiring deep reasoning or premium creative output, draft first as Sonnet then escalate to Opus via Agent tool (model: "opus") to critique and polish. Pattern: Sonnet drafts → Opus reviews and produces final → present Opus's version to user.

Escalate automatically for:
- **Website / marketing copywriting** — homepage, landing pages, CTAs, onboarding copy, pricing copy
- **Video scripts** — demo scripts, walkthrough scripts, any voiceover narrative
- **Debugging non-trivial bugs** — use the `debugger` agent (already Opus). Don't try to root-cause stack traces or multi-file regressions in the main thread.
- **Anti-hallucination / prompt changes** — use the `agent-expert` agent (already Opus) for anything in `src/lib/agents/**`.
- **High-stakes UI/UX decisions** — brand-level design critique after `karko-ui-designer` runs
- **Architecture decisions** — anything spanning 3+ files (use `karko-architect` which already uses Opus)

### When to parallelize
If two agent tasks are independent (different files, different questions), spawn them in a **single message with multiple Agent tool calls** — they run concurrently.

---

## Working Rules

### Product Priorities (read before any feature work)
- **Quality > speed > cost.** Useful Apply is a pre-revenue startup; perceived quality is the moat. Do not introduce soft-constraint heuristic rejections (seniority regex, location substring matching, skill keyword scoring, work-mode keyword inference) when a language model can read the description and make the same call — LLM cost is negligible at our scale. Use deterministic prefilters ONLY for hard 99%+ reliable constraints (explicit employment type, explicit salary floor, explicit sponsorship language). Prefer prompt caching + Batch APIs to reduce cost over degrading the feature.
- **Desktop + tablet (≥768px) is the target. Mobile is NOT a priority.** Useful Apply is a desktop-class productivity tool (CV canvas, side-by-side chat + preview, multi-panel application kit). When making UI changes, verify desktop first. Mobile may look rough or stack layouts — don't chase mobile-specific bugs unless they affect desktop too. Complex flows (CV edit, chat, generation) will eventually be gated to a "best on desktop" prompt on mobile; don't over-engineer responsive variants for them.

### Autonomy & Speed
- Work autonomously — do NOT ask permission for bug fixes, UI changes, refactors, or small features
- Read only the specific files you need, then act — use Grep/Glob/Read directly, not subagents, for known targets
- Confirm before running a migration against `--remote` (production D1)
- Auth (Better Auth), Stripe and credits, and D1 schema changes are the Sensitive review row (Sonnet + Codex + Opus, high).

### After Every Code Change
- `npx tsc --noEmit` must return zero errors (TypeScript errors break the build)
- `npm run lint` when modifying components, hooks, or API routes
- Do NOT run `npm run build` unless asked

### Git Workflow
Follow the global change loop: a branch per change, in its own worktree. Branch names: `feature/...` / `fix/...`.

After the PR is open:
1. Review per the global Reviews rule (Sonnet, plus Codex for features, plus Opus for sensitive; at most 3 rounds).
2. Wait for GitHub CI checks to go green. Do not merge on red or pending checks.
3. Merge the PR into `main`, then deploy with `npm run deploy:cf`. Nothing deploys on merge, so production only moves when that command runs.

### Deployment
- Cloudflare Workers via `@opennextjs/cloudflare`. Production ships by running `npm run deploy:cf` from `main`. There is no auto-deploy and no GitHub Actions workflow, so a merge alone changes nothing on usefulapply.com.

### Security Rules
- Never read, log or modify `.dev.vars` (local secrets) or `.dev.vars.*` other than `.dev.vars.example`.
- Watch for: SQL injection, XSS, unprotected API routes, Stripe webhook bypass, secrets leaking into client-side code

### Database / D1
- **Never modify production DB schema directly** — always write a SQL migration in `migrations/d1/`, applied with `npx wrangler d1 migrations apply usefulapply-db`
- Migration filenames: descriptive snake_case (e.g., `fix_starter_credits_10.sql`)
- Before writing a migration, check existing migrations to avoid conflicts

### Token Efficiency & Subagent Rules

**Subagent model selection (mandatory):**
| Task Type | Model | When |
|-----------|-------|------|
| Explore/search | `sonnet` (agent: `sonnet-worker`) | Simple searches and quick lookups |
| Code analysis, multi-file investigation, planning | `sonnet` | Default for most dev subagents |
| Copywriting, video scripts, marketing copy | `opus` | Always — Sonnet drafts first, Opus polishes |
| Debugging with stack trace / unexpected behavior | `opus` | Via `debugger` agent |
| Architecture decisions, 3+ file refactors | `opus` | Via `karko-architect` |
| UI/UX critique, brand-level design decisions | `opus` | Via `karko-ui-designer` for high-stakes calls |

Always pass the `model` parameter when spawning an Agent. Never let subagents default to the parent model for expensive tasks.

**Web search limits:**
- Maximum **3 WebFetch calls** per subagent task unless explicitly told to do more
- Maximum **5 WebFetch calls** across all subagents for a single user request
- Always prefer documentation sites (docs.anthropic.com, docs.vercel.com) over blog posts or articles
- Do NOT search multiple websites for the same answer — if the first source answers it, stop

---

## Architecture Overview

Useful Apply is a Next.js 16 app generating job application materials (CV, Cover Letter, Application Email, Follow-Up Email) via a unified AI agent. Model split: Claude Sonnet 5.5 on the Anthropic API handles kit writing, CV parsing, context extraction and fit analysis (`src/lib/models/anthropic.ts`); Claude Haiku 5.5 handles chat, screening answers, tracker chat, language detection, career-profile synthesis, search strategy and job-feed ranking (`callHaiku` in `src/lib/models/haiku.ts`, effort per site in `haiku-effort.ts`, 100k input budget guard). Both fail over to the same model on Claude in Amazon Bedrock on a provider failure only (`src/lib/models/providers.ts`). API version 2026-10-21 (`@anthropic-ai/sdk` 1.x). Prompt caching rules: `.claude/rules/prompt-caching.md`.

### Key Directories
- `src/lib/agents/` — Unified Writer Agent + context-builder
- `src/lib/agents/prompts/` — Prompt builders (cv-prompt, cover-letter-prompt, email-prompts, fit-assessment-prompt)
- `src/lib/models/` — Model configurations and task types
- `src/lib/cv-parser/` — `section-splitter` (language detection + localized headers). CV parsing itself is LLM-only via `src/app/api/parse-cv/route.ts` (Claude reads the document and emits a `StructuredCV`); there are no per-section regex parser modules.
- `src/app/api/` — API routes (agent-v2, regenerate, auth/*, stripe/*, job-feed/*, tracker/*, contact, chat, credits/balance, files/*, parse-cv)
- `src/hooks/` — React hooks (`useAgentV2` for SSE streaming)
- `src/store/` — Zustand stores (useSessionStore, useCVStore, useUIStore, useFeedStore, useTrackerStore, useSettingsStore; `useAppStore` is a deprecated facade over the first three)
- `src/components/` — React components (EmailPanel, ChatPanel, CVPanel, CoverLetterPanel, etc.)
- `src/lib/middleware/rateLimiter.ts` — In-memory sliding window rate limiter
- `src/lib/supabase/` — legacy-named D1/R2 wrappers (credits, sessions, accounts, admin); data access is in `src/db/repos/*`

### Agent Flow — Analyze First Mode
1. **Phase 1:** `runFitAnalysis()` → context cached server-side (30-min TTL in the `CONTEXT_CACHE` KV, with an in-memory Map fallback)
2. `fit_analysis_complete` SSE event → client stores full parsed context as fallback
3. User clicks "Apply for This Job" → triggers `generate_with_context` with `cachedContextData`
4. Server tries in-memory cache first; if miss, reconstructs MasterContext from client-sent data
5. Falls back to `full_optimization` only if neither server cache nor client data available

### Agent Flow — Apply Directly Mode
- Runs `runJobCopilot()` → full Phase 1 + Phase 2 in one pass (no fit assessment)

### Chat history and limits
- A saved application's chat runs on server-owned history: `/api/chat` reads `chat_messages` from D1 (never the client's copy) and stores the user's turn and the reply itself, under ids the client's sync also uses (`src/lib/chat-message-id.ts`), so no row is written twice. A local `session-` conversation still sends its last 10 turns.
- 50 model turns per application: the route answers at most 50 user messages. Every turn on a saved application is stored and spends the cap through the route's own write (`claimUserChatTurn`, each message claimed once), under the client's id or a server id when it sends none; screening and local conversations are held by a count. The client's sync can still store messages the model never answered.
- Before a turn whose projected input (the estimate plus a 15k reserve for tool rounds) passes 75k tokens, the route compacts everything but the last 4+ messages into one signed block (`src/lib/models/compaction.ts`, summary prompt in `src/lib/agents/prompts/chat-compaction-prompt.ts`), stored per application in `chat_compactions` (migration 0013). ChatPanel shows one "Earlier messages summarized" divider; the transcript stays complete.

### Job Feed: user-triggered, never scheduled
- No cron or scheduler starts feed runs, by design. The user (web app) or `run_job_feed` (MCP) starts at most one completed run per day (a failed run can be retried at once): the next one may start at least 20 hours after the last one started and on a new local day, or after 28 hours whatever the day (`src/lib/services/feed/cooldown.ts`).
- `enabled` (`automationEnabled` in the MCP tools) is an on/off switch for the feed, not a schedule. Don't add a scheduler (decided 2026-10-21).

### Credit Costs (source of truth: `src/lib/credit-costs.ts`; deductions in `src/db/repos/credits.ts`)
| Action | Credits |
|--------|---------|
| Fit Analysis | 0.5 |
| Full Application (direct) | 2.0 |
| Full Application (after a fit) | 1.5 |
| Cover Letter Regen | 0.5 |
| Email Regen | 0.5 |
| Follow-Up Regen | 0.5 |

### Subscription Tiers
- **Free** — 4 credits/month
- **Plus** — 50 credits/month ($19.99)
- **Max** — 200 credits/month ($79.99)
- **Add-on** — Credit Pack ($19.99/50 credits)

---

## Key Behavioral Constraints

### Anti-Hallucination (CV & Cover Letter)
Every skill, metric, and claim must trace to the Primary CV or Master CV. The JD is for keyword matching only — never a source of facts about the applicant. See `src/lib/agents/prompts/` for the full rule blocks. See `.claude/rules/agents-and-prompts.md` for a summary.

### API Route Pattern
Every API route must: (1) authenticate via the Better Auth session, (2) check rate limit, (3) validate input lengths, (4) return generic error messages (never `error.message`). See `.claude/rules/security.md`.

### Stripe / Credits Pattern
`userId` always comes from the authenticated session — never from the request body. Use optimistic concurrency for `deductCredits()`. See `.claude/rules/stripe-and-credits.md`.

### D1 Migrations
Before writing any migration, read `migrations/d1/` to check for conflicts. Apply with `npx wrangler d1 migrations apply usefulapply-db` (add `--remote` for production).

---

## Copy & Voice (UI-facing text)

Product UI copy follows the global Voice rules (no em dashes, contractions, short sentences, no filler). Product-specific:
- Periods at the end of standalone sentences in toasts and messages. No periods on button labels or short chips.
- No passive voice in action confirmations: "Application generated" becomes "Your application is ready."

---

## Design System

The full design system (surface roles, typography, radius/CTA/shadow scales, motion, iconography) lives in `.claude/rules/design-system.md`. It's path-scoped, so it loads automatically when you open any UI file (`src/components/**`, `src/app/**/*.tsx`, `src/**/*.css`). Follow it exactly on any visual work. The `karko-ui-designer` agent also carries it in its system prompt.

---

## Integrations Summary
- **PostHog** - analytics + error tracking + LLM cost tracking; see `.claude/rules/posthog.md`. Server capture is from route handlers (`getPostHogServer()` + `flush()`). Worker and cron logs are Workers Logs, not PostHog.
- **Cloudflare Email Service** - transactional email (signup confirmation, password reset, contact form, Day 0 welcome, Day 3 check-in). `from: 'Useful Apply <noreply@usefulapply.com>'` via the `EMAIL` `send_email` binding. No Resend.
- **Stripe** - subscriptions + add-on credit packs; webhooks verified via signature. Checkout success/cancel and portal return URLs come from `BRAND.url`.
- **Anthropic API** - Claude Sonnet 5.5 for kit writing, CV parsing, extraction and fit analysis (adaptive thinking, effort low, no sampling params; `src/lib/models/anthropic.ts`), and Claude Haiku 5.5 for chat, screening, tracker chat, language detection and the job feed (`src/lib/models/haiku.ts`). API version 2026-10-21.
- **Claude in Amazon Bedrock** - the same models (`anthropic.claude-sonnet-5-5`, `anthropic.claude-haiku-5-5`) on the mantle endpoint, billed to AWS credits. Failover only on a network error or a 5xx, never on a 4xx or a content problem; a chat tool loop that failed over stays on Bedrock for the rest of that request. Configured by `AWS_BEARER_TOKEN_BEDROCK` (or AWS access keys) and `BEDROCK_REGION`; off when unset. Visible as ledger provider `bedrock` and the PostHog event `llm_provider_failover` (`src/lib/models/providers.ts`).
- **Anthropic user profiles** - every model request for a signed-in user names that user's Anthropic user profile, so a safety enforcement action hits that one user, not the whole org. One `application` profile per user, `reference_id` = our user id and nothing else, created on the user's first model call and stored in `anthropic_user_profiles` (migration 0014). The id goes in the `anthropic-user-profile-id` header on the Anthropic API and as the `user_profile_id` body field on Bedrock (the Bedrock SDK moves it). A failed create never blocks the call: it goes out without the header, logged plus PostHog `anthropic_user_profile_failed`. Account deletion deletes the profile at Anthropic, then the row. Anonymous and system calls send none. Bedrock's AWS account must be linked to the Anthropic org in the Verification Portal (`portal.anthropic.com`, Linked accounts) for programs to apply there (`src/lib/models/user-profiles.ts`).
- **D1 + Drizzle** - SQLite database behind `src/db/repos/*`. Ownership is checked per query. No RLS.
- **R2** - file storage. Binding `FILES`, bucket `usefulapply-files`. Served through `/api/files`. Exports (rendered CV, letter, emails, answers) live under `exports/<userId>/<hash>`, served only by signed links through `/api/exports/...`, deleted after 30 days and on account deletion.
- **Browser Run** - binding `BROWSER`, `quickAction("pdf")` renders the CV and cover letter PDFs server-side from the same template components as the canvas (`src/lib/services/export/`). The browser export in `src/lib/utils/cv-pdf.ts` is only the fallback.
- **Better Auth** - email + password, Google OAuth, email verification, password reset. Session cookie `usefulapply.session`. Catch-all at `/api/auth/[...all]`.
- **Workers** - Next.js 16 on Cloudflare via `@opennextjs/cloudflare`. Cron Triggers, Rate Limiting bindings, KV context cache, Workers Logs.

---

## CV Templates
The 6 CV templates and their color/market tokens live in `.claude/rules/cv-templates.md`, path-scoped to `src/components/cv-templates/**` and `src/lib/cv-templates/**`. All templates use Arial body + Georgia headers (system fonts, ATS-compliant).

---

## Documentation
- `README.md` — Project overview (current Cloudflare stack)
- `SETUP.md` — Local dev and bindings setup
- `company/` — Source of truth + application answer bank for external applications. **Keep these two files updated whenever the product, stack or direction changes.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
