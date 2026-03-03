# CLAUDE.md — Karko AI Behavioral Instructions

> For historical context, architecture docs, feature narratives, and the changelog, check git history.

---

## Working Rules

### Autonomy & Speed
- Work autonomously — do NOT ask permission for bug fixes, UI changes, refactors, or small features
- Read relevant files first, then act — never ask "should I read the file first?"
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
