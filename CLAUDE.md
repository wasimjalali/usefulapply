# CLAUDE.md: Useful Apply Behavioral Instructions

> For historical context, architecture docs, feature narratives, and the changelog, check git history.

---

## Useful Apply Agents (use proactively, do not ask permission)

Specialist agents are the **preferred** way to handle bug investigations, external research, code review, UI verification, and agent/prompt work. They protect the main context window and often find issues faster than direct exploration. Spawn them in parallel when the work is independent.

### Project-scope agents (this repo)
- **`debugger`** — Whenever a runtime bug, regression, stack trace, or "X is broken but I don't know why" appears. Also for intermittent SSE/streaming failures, wrong state on screen, credit/billing anomalies, and any failed request without an obvious cause. Read-only by default; proposes patches with file:line, refuses to paper over symptoms. Powered by Opus.
- **`agent-expert`** — When editing anything in `src/lib/agents/`, `src/lib/agents/prompts/`, `src/lib/models/`, `src/app/api/agent-v2/`, or the `useAgentV2` / `useAgentWorkflow` hooks. Also for anti-hallucination rule changes, SSE event semantics, context-builder work, CV pipeline, fit-assessment prompts. Powered by Opus.
- **`ui-tester`** — After any UI change to `/dashboard`, `/applications`, `/documents`, `/` (landing), or shared components (ChatPanel, CVPanel, CoverLetterPanel, EmailPanel, FeedConversation, FeedCanvas). Uses Playwright MCP. Run before calling a UI task done.
- **`karko-architect`** — For cross-cutting design decisions, refactors, and "where should this state live" questions. Use for anything that spans 3+ files or has non-obvious tradeoffs. Returns a plan with ordered steps; does not modify code itself. Powered by Opus.
- **`supabase-dba`** — When writing or reviewing D1 migrations in `migrations/d1/`, touching schema, or when a query looks suspicious. Will not run migrations itself. (Legacy `supabase/migrations/` is frozen until decommission.)
- **`integration-tester`** — Before every commit touching components, hooks, API routes, or job-feed files. Runs tsc + lint + narrow spot-checks. Cheap and fast — uses Haiku.
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

### Delegation policy: ox alpha via opencode (Wasim, 2026-08-21)
**In every session in this repo, Fable is the orchestrator and verifier. The work itself is delegated to `opencode-go/ox-alpha-free` via the opencode CLI.** ox alpha is free until ~2026-08-28 and stronger than Opus; prefer it over Opus/Sonnet subagents for implementation, research, drafting and adversarial review while the free week lasts. Re-evaluate after.

- **Fable does:** planning, task briefs, critical analysis of returned work, merging, verification (tsc, lint, diff review, browser checks), `/design` canvas work and anything requiring session context or user interaction.
- **ox alpha does:** implementation, web research, copy drafts, adversarial review passes and other self-contained work.
- **How to call it** (no manual copy-paste; run via Bash in background mode):
  ```bash
  opencode run -m opencode-go/ox-alpha-free "$(cat brief.md)" > result.md
  ```
  Write the brief to a file first. For implementation, run inside the repo so it can edit files, then review its diff before accepting. For research/drafts, run in the scratchpad and collect the output file.

---

## Working Rules

### Product Priorities (read before any feature work)
- **Quality > speed > cost.** Useful Apply is a pre-revenue startup; perceived quality is the moat. Do not introduce soft-constraint heuristic rejections (seniority regex, location substring matching, skill keyword scoring, work-mode keyword inference) when a language model can read the description and make the same call — LLM cost is negligible at our scale. Use deterministic prefilters ONLY for hard 99%+ reliable constraints (explicit employment type, explicit salary floor, explicit sponsorship language). Prefer prompt caching + Batch APIs to reduce cost over degrading the feature.
- **Desktop + tablet (≥768px) is the target. Mobile is NOT a priority.** Useful Apply is a desktop-class productivity tool (CV canvas, side-by-side chat + preview, multi-panel application kit). When making UI changes, verify desktop first. Mobile may look rough or stack layouts — don't chase mobile-specific bugs unless they affect desktop too. Complex flows (CV edit, chat, generation) will eventually be gated to a "best on desktop" prompt on mobile; don't over-engineer responsive variants for them.

### Autonomy & Speed
- Work autonomously — do NOT ask permission for bug fixes, UI changes, refactors, or small features
- Read only the specific files you need, then act — use Grep/Glob/Read directly, not subagents, for known targets
- Only pause and confirm before:
  - **Deleting files** — Grep for all imports/references first; if dead code, delete without asking
  - **Adding new npm packages** — state what and why, confirm before installing
  - **Changing D1 schema** — always write a migration in `migrations/d1/`, confirm before running
  - **Modifying Stripe webhook/credit logic** — financial logic, confirm intent first
  - **Force-push or git history rewrites** — always confirm
  - **Touching Better Auth or session handling** — security-sensitive

### Code-Change Discipline
- **Surgical changes.** Touch only what the task requires. No drive-by refactors, no reformatting adjacent code, no "while I'm here" cleanups. Match existing style even if you disagree.
- **Simplicity first.** Minimum code that solves the problem. No abstractions for single-use code. No speculative features. If a senior engineer would call it overcomplicated, simplify.
- **Fail loud.** "Completed" is wrong if anything was skipped. "Tests pass" is wrong if any were skipped. Surface uncertainty; never hide it. Don't catch-and-swallow errors to make a flow appear to work.

### After Every Code Change
- Run `npx tsc --noEmit` — **zero TypeScript errors required** before calling any task done
- Run `npm run lint` when modifying components, hooks, or API routes
- Do NOT run `npm run build` unless asked

### Git Workflow
- **Never commit or push unless explicitly asked**
- Conventional commits: `feat:` / `fix:` / `chore:` / `refactor:`
- Branch naming: `feature/short-description` or `fix/short-description`
- Never push directly to `main`; never use `--no-verify`

**Standard workflow for every new feature, fix, or change:**
1. Develop on the local `main` branch. Keep it current first with `git checkout main && git pull`.
2. When the change is ready to push, create a new branch off your working changes (`git checkout -b feature/short-description`, which carries the uncommitted edits over) and push to that branch. Never push to `main`.
3. Open a PR to merge the branch into `main` (`gh pr create`).
4. Review the PR before merging: run `coderabbit` or the `pr-review-toolkit`, and address what it surfaces.
5. Wait for GitHub CI checks to go green. Do not merge on red or pending checks.
6. Merge the PR into `main`. Vercel auto-deploys `main` to production, so `main` must always stay green.

### Package Manager
- Use **`npm` only** — never bun, yarn, or pnpm

### Deployment
- Vercel — production auto-deploys on push to `main`
- TypeScript errors **will break the Vercel build** — always verify `tsc --noEmit` = 0

### Security Rules
- **Never read, log, or modify `.env.local`**
- Never hardcode secrets, API keys, or tokens in any source file
- **If you notice an exposed secret or security vulnerability — flag it immediately**
- Watch for: SQL injection, XSS, unprotected API routes, Stripe webhook bypass, secrets leaking into client-side code

### Database / D1
- **Never modify production DB schema directly** — always write a SQL migration in `migrations/d1/`, applied with `npx wrangler d1 migrations apply usefulapply-db`
- Migration filenames: descriptive snake_case (e.g., `fix_starter_credits_10.sql`)
- Before writing a migration, check existing migrations to avoid conflicts

### Deleting Code
- Grep for all imports/references before deleting any file or function
- Zero references → delete without asking
- Uncertain or many files affected → state findings, then proceed

### Token Efficiency & Subagent Rules

**DO NOT audit, investigate, or explore the codebase on every task.** Only read files directly relevant to the specific change. Never do broad codebase audits unless explicitly asked.

**Direct tools first, subagents last:**
- Use Grep, Glob, Read directly for known files, symbols, or patterns
- Only spawn subagents when the task genuinely requires multi-file exploration across unknown locations
- A single Grep is always better than an Explore agent for finding a function or string

**Subagent model selection (mandatory):**
| Task Type | Model | When |
|-----------|-------|------|
| File search, quick lookup, verification | `haiku` | Explore agents for simple searches |
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

**What NOT to do on every task:**
- Do NOT read CLAUDE.md, MEMORY.md, or rules files — they are already in context
- Do NOT audit the full codebase structure before making a change
- Do NOT spawn Explore agents to "understand the codebase" when you can just read the 1-2 files involved
- Do NOT re-read files you've already read in this conversation

---

## Architecture Overview

Useful Apply is a Next.js 14+ app generating job application materials (CV, Cover Letter, Application Email, Follow-Up Email) via a unified AI agent. Model split: Claude Sonnet 4.6 (Amazon Bedrock) handles kit writing, CV parsing, context extraction and fit analysis; `@cf/openai/gpt-oss-120b` on Workers AI (`src/lib/models/workers-ai.ts`) handles chat, tracker chat, career-profile synthesis, search strategy and job-feed ranking.

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
- `src/lib/supabase/` — Supabase client, credits, sessions, accounts, admin

### Agent Flow — Analyze First Mode
1. **Phase 1:** `runFitAnalysis()` → context cached server-side (30-min TTL in `contextCache` Map)
2. `fit_analysis_complete` SSE event → client stores full parsed context as fallback
3. User clicks "Apply for This Job" → triggers `generate_with_context` with `cachedContextData`
4. Server tries in-memory cache first; if miss, reconstructs MasterContext from client-sent data
5. Falls back to `full_optimization` only if neither server cache nor client data available

### Agent Flow — Apply Directly Mode
- Runs `runJobCopilot()` → full Phase 1 + Phase 2 in one pass (no fit assessment)

### Credit Costs (source of truth: `src/lib/supabase/credits.ts`)
| Action | Credits |
|--------|---------|
| Fit Analysis | 0.5 |
| Full Application (after fit or direct) | 2.0 |
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

All user-facing strings — chat messages, button labels, empty states, tooltips, toasts, onboarding copy, agent responses, error messages — must follow these rules:

### No em dashes
- **Never use `—` (em dash, U+2014).** It is the most recognizable AI writing tell.
- Replace with: a comma, a colon, a period and new sentence, parentheses, or just a plain hyphen `-` where a dash is truly needed.
- Bad: `Your CV is ready — check the Application Kit.`
- Good: `Your CV is ready. Check the Application Kit.`

### Human punctuation patterns
- Use contractions where natural: "you're", "it's", "we'll", "don't" — not stiff formal language.
- Short sentences over long compound ones. One idea per sentence.
- No Oxford-comma abuse in UI copy (it reads clinical). Use "X, Y and Z" not "X, Y, and Z".
- Periods at the end of standalone sentences in toasts/messages. No periods on button labels or short chips.

### Tone
- Warm and direct. Like a knowledgeable colleague, not a corporate chatbot.
- No hollow filler: "Great!", "Sure!", "Absolutely!" — cut them.
- No passive voice in action confirmations: "Application generated" → "Your application is ready."

These rules apply to: agent completion messages, chat assistant replies, error/empty states, modal copy, tooltip text, onboarding steps, and any hardcoded string a user reads.

---

## Design System

The full design system (surface roles, typography, radius/CTA/shadow scales, motion, iconography) lives in `.claude/rules/design-system.md`. It's path-scoped, so it loads automatically when you open any UI file (`src/components/**`, `src/app/**/*.tsx`, `src/**/*.css`). Follow it exactly on any visual work. The `karko-ui-designer` agent also carries it in its system prompt.

---

## Integrations Summary
- **PostHog** - analytics + error tracking + LLM cost tracking; see `.claude/rules/posthog.md`. Server capture is from route handlers (`getPostHogServer()` + `flush()`). Worker and cron logs are Workers Logs, not PostHog.
- **Cloudflare Email Service** - transactional email (signup confirmation, password reset, contact form, Day 0 welcome, Day 3 check-in). `from: 'Useful Apply <noreply@usefulapply.com>'` via the `EMAIL` `send_email` binding. No Resend.
- **Stripe** - subscriptions + add-on credit packs; webhooks verified via signature. Checkout success/cancel and portal return URLs come from `BRAND.url`.
- **Amazon Bedrock** - Claude Sonnet 4.6 inference for kit writing, CV parsing, extraction and fit analysis (production); direct Anthropic API (dev/testing). AWS SDK path runs on Workers under `nodejs_compat`.
- **Workers AI** - `@cf/openai/gpt-oss-120b` via the `AI` binding for chat, tracker chat, career-profile synthesis, search strategy and job-feed ranking (`src/lib/models/workers-ai.ts`, `src/lib/job-feed/workers-ai-ranking.ts`).
- **D1 + Drizzle** - SQLite database behind `src/db/repos/*`. Ownership is checked per query. No RLS.
- **R2** - file storage. Binding `FILES`, bucket `usefulapply-files`. Served through `/api/files`.
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
