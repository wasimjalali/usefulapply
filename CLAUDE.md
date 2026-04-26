# CLAUDE.md — Karko AI Behavioral Instructions

> For historical context, architecture docs, feature narratives, and the changelog, check git history.

---

## Karko AI Agents (use proactively — do not ask permission)

Specialist agents are the **preferred** way to handle bug investigations, external research, code review, UI verification, and agent/prompt work. They protect the main context window and often find issues faster than direct exploration. Spawn them in parallel when the work is independent.

### Project-scope agents (this repo)
- **`agent-expert`** — When editing anything in `src/lib/agents/`, `src/lib/agents/prompts/`, `src/lib/models/`, `src/app/api/agent-v2/`, or the `useAgentV2` / `useAgentWorkflow` hooks. Also for anti-hallucination rule changes, SSE event debugging, context-builder work, CV pipeline, fit-assessment prompts.
- **`ui-tester`** — After any UI change to `/dashboard`, `/applications`, `/documents`, `/` (landing), or shared components (ChatPanel, CVPanel, CoverLetterPanel, EmailPanel, JobFeedPanel). Uses Playwright MCP. Run before calling a UI task done.
- **`karko-architect`** — For cross-cutting design decisions, refactors, and "where should this state live" questions. Use for anything that spans 3+ files or has non-obvious tradeoffs. Returns a plan with ordered steps; does not modify code itself.
- **`supabase-dba`** — When writing or reviewing migrations in `supabase/migrations/`, changing RLS policies, touching schema, or when a query looks suspicious. Will not run migrations itself.
- **`integration-tester`** — Before every commit touching components, hooks, API routes, or job-feed files. Runs tsc + lint + narrow spot-checks. Cheap and fast — uses Haiku 4.5.
- **`job-feed-specialist`** — When editing anything under `src/lib/job-feed/**`, `src/inngest/job-feed.ts`, `src/app/api/job-feed/**`, or `src/components/job-feed/**`. Owns ingestion, prefilter, LLM ranker, batch reconcile, and settings flows.
- **`karko-ui-designer`** — For UI/UX audits, redesigns, and visual polish. Carries brand tokens (navy/cream/gold), typography (Georgia+Arial), and anti-AI-slop rules in its system prompt. Can audit AND implement. Does NOT touch backend, API routes, data fetching, or Zustand stores.

### Global-scope agents (all projects — from `~/.claude/CLAUDE.md`)
- **`reviewer`** — BEFORE any git commit with non-trivial changes (>30 lines), when touching security-sensitive code (auth, API routes, DB, Stripe webhooks, credits), or when user says "review this / check this / any issues?".
- **`debugger`** — When user reports an error, stack trace, crash, or unexpected behavior. Paste the symptom + trace hypotheses and delegate — don't burn main-context tokens investigating non-trivial bugs yourself.
- **`researcher`** — For external doc lookups, API signatures, pricing/limits, version/release info. Prefer this over ad-hoc WebFetch (cheaper, faster, cross-references sources).

### When to parallelize
If two agent tasks are independent (different files, different questions), spawn them in a **single message with multiple Agent tool calls** — they run concurrently. Good recent example: two `debugger` agents investigating double-generation and new-chat-broken bugs at the same time, each returning a tight file:line report.

---

## Working Rules

### Product Priorities (read before any feature work)
- **Quality > speed > cost.** Karko is a pre-revenue startup; perceived quality is the moat. Do not introduce soft-constraint heuristic rejections (seniority regex, location substring matching, skill keyword scoring, work-mode keyword inference) when a language model can read the description and make the same call — LLM cost is negligible at our scale. Use deterministic prefilters ONLY for hard 99%+ reliable constraints (explicit employment type, explicit salary floor, explicit sponsorship language). Prefer prompt caching + Batch APIs to reduce cost over degrading the feature.
- **Desktop + tablet (≥768px) is the target. Mobile is NOT a priority.** Karko is a desktop-class productivity tool (CV canvas, side-by-side chat + preview, multi-panel application kit). When making UI changes, verify desktop first. Mobile may look rough or stack layouts — don't chase mobile-specific bugs unless they affect desktop too. Complex flows (CV edit, chat, generation) will eventually be gated to a "best on desktop" prompt on mobile; don't over-engineer responsive variants for them.

### Autonomy & Speed
- Work autonomously — do NOT ask permission for bug fixes, UI changes, refactors, or small features
- Read only the specific files you need, then act — use Grep/Glob/Read directly, not subagents, for known targets
- Only pause and confirm before:
  - **Deleting files** — Grep for all imports/references first; if dead code, delete without asking
  - **Adding new npm packages** — state what and why, confirm before installing
  - **Changing Supabase DB schema** — always write a migration in `supabase/migrations/`, confirm before running
  - **Modifying Stripe webhook/credit logic** — financial logic, confirm intent first
  - **Force-push or git history rewrites** — always confirm
  - **Touching Supabase auth or session handling** — security-sensitive

### After Every Code Change
- Run `npx tsc --noEmit` — **zero TypeScript errors required** before calling any task done
- Run `npm run lint` when modifying components, hooks, or API routes
- Do NOT run `npm run build` unless asked

### Git Workflow
- **Never commit or push unless explicitly asked**
- Conventional commits: `feat:` / `fix:` / `chore:` / `refactor:`
- Branch naming: `feature/short-description` or `fix/short-description`
- Never push directly to `main`; never use `--no-verify`

### Package Manager
- Use **`npm` only** — never bun, yarn, or pnpm

### Deployment
- Vercel — production auto-deploys on push to `main`
- TypeScript errors **will break the Vercel build** — always verify `tsc --noEmit` = 0

### Security Rules
- **Never read, log, or modify `.env.local`**
- Never hardcode secrets, API keys, or tokens in any source file
- **If you notice an exposed secret or security vulnerability — flag it immediately**
- Watch for: SQL injection, XSS, unprotected API routes, Stripe webhook bypass, exposed Supabase service role key in client-side code

### Database / Supabase
- **Never modify production DB directly** — always write a SQL migration in `supabase/migrations/`
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
| Code analysis, multi-file investigation, planning | `sonnet` | Default for most subagents |
| Complex architecture, large refactors | `opus` | Only when user explicitly requests Opus or task truly requires it |

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

Karko AI is a Next.js 14+ app generating job application materials (CV, Cover Letter, Application Email, Follow-Up Email) via a unified AI agent powered by Claude Sonnet 4.6 (Amazon Bedrock).

### Key Directories
- `src/lib/agents/` — Unified Writer Agent + context-builder
- `src/lib/agents/prompts/` — Prompt builders (cv-prompt, cover-letter-prompt, email-prompts, fit-assessment-prompt)
- `src/lib/models/` — Model configurations and task types
- `src/lib/cv-parser/` — Modular CV parsers (section-splitter, parse-experience, parse-education, parse-skills, parse-other)
- `src/app/api/` — API routes (agent-v2, regenerate, auth/*, stripe/*, contact, chat, generate-pdf, parse-cv)
- `src/hooks/` — React hooks (`useAgentV2` for SSE streaming)
- `src/store/` — Zustand stores (useSessionStore, useCVStore, useUIStore)
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
- **Free** — 10 credits/month
- **Plus** — 100 credits/month ($39.99)
- **Max** — 200 credits/month ($79.99)
- **Add-on** — Credit Pack ($19.99/40 credits)

---

## Key Behavioral Constraints

### Anti-Hallucination (CV & Cover Letter)
Every skill, metric, and claim must trace to the Primary CV or Master CV. The JD is for keyword matching only — never a source of facts about the applicant. See `src/lib/agents/prompts/` for the full rule blocks. See `.claude/rules/agents-and-prompts.md` for a summary.

### API Route Pattern
Every API route must: (1) authenticate via `supabase.auth.getUser()`, (2) check rate limit, (3) validate input lengths, (4) return generic error messages (never `error.message`). See `.claude/rules/security.md`.

### Stripe / Credits Pattern
`userId` always comes from the authenticated session — never from the request body. Use optimistic concurrency for `deductCredits()`. See `.claude/rules/stripe-and-credits.md`.

### Supabase Migrations
Before writing any migration, read `supabase/migrations/` to check for conflicts. Run in Supabase SQL Editor (no CLI used).

---

## Integrations Summary
- **PostHog** — analytics + error tracking + LLM cost tracking; see `.claude/rules/posthog.md`
- **Resend** — transactional email (signup confirmation, contact form); `from: 'KarKo AI <noreply@karkoai.com>'`
- **Stripe** — subscriptions + add-on credit packs; webhooks verified via signature
- **Amazon Bedrock** — Claude Sonnet 4.6 inference (production); direct Anthropic API (dev/testing)
- **Supabase** — Postgres DB + Auth + Storage; service role key server-side only

---

## CV Templates (6 total)
| ID | Name | Color | Market |
|----|------|-------|--------|
| `premium-ats` | Premium ATS | #0F3057 navy | Default |
| `modern-professional` | Modern Professional | #2C7A7B teal | Tech |
| `executive` | Executive | #702459 burgundy | Senior |
| `german-ats` | German ATS | #1E3A5F slate blue | DE two-col |
| `german-classic` | German Classic | #374151 charcoal | DE single-col |
| `classic-green` | Classic Green | #2D6A4F forest green | All industries |

All templates: Arial body + Georgia headers (system fonts, ATS-compliant).

---

## Documentation
- `README.md` — Project overview
- `SETUP.md` / `INSTALLATION_STEPS.md` — Setup instructions
- `SUPABASE_SCHEMA_GUIDE.md` / `SUPABASE_SETUP_GUIDE.md` — DB reference
- `STRIPE_SETUP_GUIDE.md` — Stripe integration
