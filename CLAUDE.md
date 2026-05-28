# CLAUDE.md — Karko AI Behavioral Instructions

> For historical context, architecture docs, feature narratives, and the changelog, check git history.

---

## Karko AI Agents (use proactively — do not ask permission)

Specialist agents are the **preferred** way to handle bug investigations, external research, code review, UI verification, and agent/prompt work. They protect the main context window and often find issues faster than direct exploration. Spawn them in parallel when the work is independent.

### Project-scope agents (this repo)
- **`debugger`** — Whenever a runtime bug, regression, stack trace, or "X is broken but I don't know why" appears. Also for intermittent SSE/streaming failures, wrong state on screen, credit/billing anomalies, and any failed request without an obvious cause. Read-only by default; proposes patches with file:line, refuses to paper over symptoms. Powered by Opus 4.7.
- **`agent-expert`** — When editing anything in `src/lib/agents/`, `src/lib/agents/prompts/`, `src/lib/models/`, `src/app/api/agent-v2/`, or the `useAgentV2` / `useAgentWorkflow` hooks. Also for anti-hallucination rule changes, SSE event semantics, context-builder work, CV pipeline, fit-assessment prompts. Powered by Opus 4.7.
- **`ui-tester`** — After any UI change to `/dashboard`, `/applications`, `/documents`, `/` (landing), or shared components (ChatPanel, CVPanel, CoverLetterPanel, EmailPanel, JobFeedPanel). Uses Playwright MCP. Run before calling a UI task done.
- **`karko-architect`** — For cross-cutting design decisions, refactors, and "where should this state live" questions. Use for anything that spans 3+ files or has non-obvious tradeoffs. Returns a plan with ordered steps; does not modify code itself. Powered by Opus 4.7.
- **`supabase-dba`** — When writing or reviewing migrations in `supabase/migrations/`, changing RLS policies, touching schema, or when a query looks suspicious. Will not run migrations itself.
- **`integration-tester`** — Before every commit touching components, hooks, API routes, or job-feed files. Runs tsc + lint + narrow spot-checks. Cheap and fast — uses Haiku 4.5.
- **`job-feed-specialist`** — When editing anything under `src/lib/job-feed/**`, `src/inngest/job-feed.ts`, `src/app/api/job-feed/**`, or `src/components/job-feed/**`. Owns ingestion, prefilter, LLM ranker, batch reconcile, and settings flows.
- **`karko-ui-designer`** — For UI/UX audits, redesigns, and visual polish. Carries brand tokens (navy/cream/gold), typography (Georgia+Arial), surface roles, radius/shadow scales, and anti-AI-slop rules in its system prompt. Can audit AND implement. Does NOT touch backend, API routes, data fetching, or Zustand stores.

### Opus 4.7 escalation (automatic — do not wait to be asked)
For tasks requiring deep reasoning or premium creative output, draft first as Sonnet 4.6 then escalate to Opus 4.7 via Agent tool (model: "opus") to critique and polish. Pattern: Sonnet drafts → Opus 4.7 reviews and produces final → present Opus 4.7's version to user.

Escalate automatically for:
- **Website / marketing copywriting** — homepage, landing pages, CTAs, onboarding copy, pricing copy
- **Video scripts** — demo scripts, walkthrough scripts, any voiceover narrative
- **Debugging non-trivial bugs** — use the `debugger` agent (already Opus 4.7). Don't try to root-cause stack traces or multi-file regressions in the main thread.
- **Anti-hallucination / prompt changes** — use the `agent-expert` agent (already Opus 4.7) for anything in `src/lib/agents/**`.
- **High-stakes UI/UX decisions** — brand-level design critique after `karko-ui-designer` runs
- **Architecture decisions** — anything spanning 3+ files (use `karko-architect` which already uses Opus 4.7)

### When to parallelize
If two agent tasks are independent (different files, different questions), spawn them in a **single message with multiple Agent tool calls** — they run concurrently.

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

Karko AI is a Next.js 14+ app generating job application materials (CV, Cover Letter, Application Email, Follow-Up Email) via a unified AI agent powered by Claude Sonnet 4.6 (Amazon Bedrock).

### Key Directories
- `src/lib/agents/` — Unified Writer Agent + context-builder
- `src/lib/agents/prompts/` — Prompt builders (cv-prompt, cover-letter-prompt, email-prompts, fit-assessment-prompt)
- `src/lib/models/` — Model configurations and task types
- `src/lib/cv-parser/` — `section-splitter` (language detection + localized headers). CV parsing itself is LLM-only via `src/app/api/parse-cv/route.ts` (Claude reads the document and emits a `StructuredCV`); there are no per-section regex parser modules.
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
- **Free** — 4 credits/month
- **Plus** — 50 credits/month ($19.99)
- **Max** — 200 credits/month ($79.99)
- **Add-on** — Credit Pack ($19.99/50 credits)

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

## Design System (authoritative — this overrides any older spec)

The product has three visual layers. Every panel, card, and document must pick a role and stick to it.

### Surface roles
| Layer | Token | Hex | Use for |
|-------|-------|-----|---------|
| **Canvas** | `cream-100` | `#FAF7F2` | Page canvas only: dashboard shell, every panel shell, modal backdrop fallback |
| **Surface** | `cream-50` | `#FEFDFB` | Everything cards live in: cards, grids, pills, inputs, state messages, wizard body, tab tracks, tracker rows, job cards, empty-state tiles |
| **Document** | `white` | `#FFFFFF` | Only printable/sendable documents: CV page, cover letter body, email body, modal inner scroll area when it holds a document |

Rules:
- **No gradients on canvas or surface layers.** No `bg-gradient-to-b from-cream-100 to-cream-50` shells, no custom `bg-[radial-gradient(...)]` canvases. Gradients are reserved for CTAs (gold/navy buttons), nothing else.
- **No translucent whites over cream.** `bg-white/85`, `bg-white/90`, `bg-white/95` on a cream canvas create subtle tint shifts the eye can feel but not name. Use solid `bg-cream-50` or solid `bg-white` — decide which role the surface is playing.
- **Borders on surfaces:** `border-cream-200`. Darker cream borders (`cream-300`, `cream-400`) are for dingy; do not reach for them on new work.
- **Avoid `cream-300` and `cream-400` on large fills.** They read as aged paper / dingy. Keep them for dividers and scrollbar thumbs only.

### Typography
- **Headings that anchor the user's eye** → `font-serif` (Georgia via Tailwind `font-serif`, semi-bold): page title `h1`, panel/section `h2`, modal title, wizard title. These are "where am I" moments.
- **Everything smaller** → default sans (Inter, set in `globals.css` as `--font-sans`): `h3`, body, labels, buttons, chips, form fields. These are scanning-text, not anchoring-text.
- **Do not apply `font-serif` to chat messages, job cards, tracker rows, form labels, or button text.** It looks Victorian.
- **`font-semibold` not `font-bold`** on serif headings — bold Georgia reads as AI-slop.

### Radius scale (3 + 1)
Pick one role per element. Everything else is deprecated.
| Role | Class | Use for |
|------|-------|---------|
| **Pill** | `rounded-full` | Chips, status pills, icon buttons, avatar rings |
| **Control** | `rounded-lg` | Inputs, dropdowns, small buttons, tooltips |
| **Card** | `rounded-2xl` | Cards, panels, grids, wizards, preview tiles |
| **Modal** *(reserved)* | `rounded-[24px]` | Full-screen / centered modals only |

Do NOT use: `rounded-md`, `rounded-xl`, `rounded-3xl`, `rounded-[14px]`, `rounded-[16px]`, `rounded-[18px]`, `rounded-[20px]`, `rounded-[22px]`, `rounded-[28px]`, `rounded-[30px]`, `rounded-[32px]`. Collapse all of those to the nearest role above.

### CTA treatments (one each — no gradients)
| CTA | Class | Use |
|-----|-------|-----|
| **Primary (Gold)** | `bg-gold-400 hover:bg-gold-500 text-navy-900` | Main action per surface ("Apply with Karko", "Start my daily feed", "Upgrade to Plus") |
| **Primary (Navy)** | `bg-navy-600 hover:bg-navy-700 text-white` | Secondary primary ("Sign up", "Save changes", sidebar highlights) |

Do NOT use: `bg-gradient-to-r from-gold-400 to-gold-500`, `bg-gradient-to-r from-navy-600 to-navy-700`, `bg-gold-500` / `bg-navy-700` as default base. Gradients on CTAs read as AI-slop; flat brand colors read as confident.

### Shadow scale (3 values)
| Depth | Class | Use |
|-------|-------|-----|
| **Resting** | `shadow-sm` | Cards, pills, tab tracks — everything that sits on the canvas |
| **Elevated** | `shadow-md` | Hover state on cards, dropdowns, popovers |
| **Floating** | `shadow-lg` | Modals, full-preview overlays, toasts |

Do NOT invent bespoke drop-shadow strings like `shadow-[0_24px_60px_-20px_rgba(30,58,95,0.35)]`. If `shadow-lg` isn't dramatic enough for a modal, use `shadow-xl` (last resort). Never `shadow-2xl`.

### Motion
- `transition-colors duration-200` default.
- Elevation lift (`-translate-y-0.5 hover:shadow-md`) reserved for elevated CTAs only — not on every card.

### Iconography
- Lucide-react only. Sizes: `w-3.5` (chrome), `w-4` (inline text), `w-5` (headers), `w-6` (modal close, empty-state tiles).

**When in doubt, read this section before touching any visual code.**

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
