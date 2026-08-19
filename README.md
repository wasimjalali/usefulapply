# Useful Apply

**The AI job application agent.** Your entire job search in one app. Find roles, check the fit, generate the full application in 90 seconds, and track everything. Every word traces back to your real CV. Nothing invented.

> Useful Apply replaces the seven tools job seekers stitch together: job board, resume builder, ATS checker, cover letter AI, email drafter, screening helper, and tracker. One app, one loop.

## Locked Taglines

| Audience | Tagline |
|---|---|
| **Job seekers** (homepage, ads, social, swag) | **Your entire job search, in one app.** |
| **Investors and press** (decks, about page, bios) | **The AI job application agent.** |

Both are locked. Source of truth: [`USEFULAPPLY_POSITIONING.md`](./USEFULAPPLY_POSITIONING.md) §1.5. Do not swap without a founder decision. Content framing rules (short-form vs long-form video, platform-specific end-cards) are in §9.5 of the same document.

## Features

- **Smart Job Feed** — Up to 25 hand-picked roles per day, matched to your CV, goals, and location (Plus and Max)
- **Fit Analysis** — Match score, strengths, and gaps before you spend credits on the full application. A checkpoint, not a commitment.
- **Tailored CV** — Rewritten for each role from your real CV, in an ATS-optimized template
- **Cover Letter** — Grounded in your real experience, written for the specific role and company
- **Application Email + Follow-Up** — Ready-to-send emails, with the follow-up pre-drafted for 7 to 10 days later
- **Screening Question Answers** — STAR structure for behavioral questions, direct answers for factual ones (Plus and Max)
- **Application Tracker** — Every application saves automatically with company, role, match score, status, and date
- **6 CV Templates** — All single-column and ATS-safe by default, including German market templates (see below)
- **PDF & DOCX Export** — Download generated CVs in PDF or DOCX format
- **Anti-Hallucination (the moat)** — Every skill, metric, and claim traces back to your uploaded CV. The job description is for keyword alignment and tone, never a source of facts about you.

## AI Models

| Environment | Model | Provider |
|-------------|-------|----------|
| Production | Claude Sonnet 4.6 | Amazon Bedrock |
| Development / Testing | Claude Sonnet 4.6 | Anthropic API (direct) |

The agent uses a **Unified Writer Agent** with two modes:
- **Analyze First** — Runs fit analysis (0.5 credits), then generates full application on demand (2.0 credits)
- **Apply Directly** — Runs full Phase 1 + Phase 2 in one pass (2.0 credits)

## CV Templates

| ID | Name | Color | Best For |
|----|------|-------|----------|
| `premium-ats` | Premium ATS | #0F3057 navy | Most jobs (default) |
| `modern-professional` | Modern Professional | #2C7A7B teal | Tech & startups |
| `executive` | Executive | #702459 burgundy | Senior roles |
| `german-ats` | German ATS | #1E3A5F slate blue | German market (two-column) |
| `german-classic` | German Classic | #374151 charcoal | German market (single-column) |
| `classic-green` | Classic Green | #2D6A4F forest green | All industries |

All templates use Arial body + Georgia headers (ATS-compliant system fonts).

## Subscription Tiers

| Tier | Credits/Month | Price |
|------|--------------|-------|
| Free | 4 | — |
| Plus | 50 | $19.99/mo |
| Max | 200 | $79.99/mo |
| Add-on Credit Pack | +50 | $19.99 |

### Credit Costs

| Action | Credits |
|--------|---------|
| Fit Analysis | 0.5 |
| Full Application (after fit or direct) | 2.0 |
| Cover Letter Regeneration | 0.5 |
| Email Regeneration | 0.5 |
| Follow-Up Regeneration | 0.5 |

## Tech Stack

- **Framework:** Next.js 16 with App Router (React 19)
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **State:** Zustand v5
- **AI:** Claude Sonnet 4.6 via Amazon Bedrock (`@anthropic-ai/bedrock-sdk`) + direct Anthropic API fallback
- **Auth & DB:** Supabase (Postgres + Auth + Storage)
- **Payments:** Stripe (subscriptions + add-on credit packs)
- **Email:** Cloudflare Email Service
- **Analytics:** PostHog (analytics + error tracking + LLM cost tracking)
- **PDF Parsing:** pdfjs-dist v5 (with binary fallback + AI document understanding)
- **PDF Export:** jsPDF + html2canvas
- **DOCX Export:** docx
- **Deployment:** Vercel

## Project Structure

```
src/
├── app/                     # Next.js App Router pages
│   ├── api/                 # API routes
│   │   ├── agent-v2/        # Main AI generation endpoint (SSE streaming)
│   │   ├── parse-cv/        # CV parsing (PDF/DOCX/TXT)
│   │   ├── regenerate/      # Regenerate individual sections
│   │   ├── generate-pdf/    # Server-side PDF generation
│   │   ├── chat/            # Chat endpoint
│   │   ├── contact/         # Contact form (Cloudflare Email Service)
│   │   └── stripe/          # Checkout, portal, webhook
│   ├── dashboard/           # Main app dashboard
│   ├── applications/        # Application tracker page
│   ├── documents/           # Document management
│   ├── settings/            # User settings & subscription
│   ├── pricing/             # Pricing page
│   └── auth/                # Auth pages (login, signup, etc.)
├── components/              # React components
│   ├── CVPanel.tsx          # CV viewer/editor
│   ├── CoverLetterPanel.tsx
│   ├── EmailPanel.tsx
│   ├── ATSScorePanel.tsx
│   ├── TrackerPanel.tsx     # Application tracker (in-dashboard)
│   ├── DocumentsPanel.tsx
│   ├── ChatPanel.tsx        # AI chat interface
│   └── cv-templates/        # Template selector + renderers
├── lib/
│   ├── agents/              # Unified Writer Agent + context builder
│   │   └── prompts/         # Prompt builders (cv, cover letter, email, fit)
│   ├── models/              # Model config (Bedrock + direct Anthropic)
│   ├── cv-parser/           # Modular CV parsers
│   ├── cv-templates/        # CVData types + parser
│   ├── supabase/            # Supabase client, credits, sessions, admin
│   ├── middleware/          # Rate limiter (sliding window, in-memory)
│   └── stripe.ts            # Stripe client + price IDs
├── hooks/                   # React hooks
│   ├── useAgentV2.ts        # SSE streaming for agent workflow
│   └── useSupabaseSync.ts   # Session sync to Supabase
├── store/                   # Zustand stores
│   ├── useSessionStore.ts   # Session state (persisted to localStorage)
│   ├── useCVStore.ts        # CV editing state
│   └── useUIStore.ts        # UI state
└── contexts/
    └── AuthContext.tsx      # Supabase auth context
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in locally. Names only below. Never commit `.dev.vars`. OpenNext uses `NEXTJS_ENV` to pick which Next.js `.env` file to load.

```bash
# OpenNext
NEXTJS_ENV

# Public
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_POSTHOG_KEY
NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG

# Supabase (legacy, still listed until cutover)
SUPABASE_SERVICE_ROLE_KEY

# Stripe
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_PLUS
STRIPE_PRICE_ID_MAX
STRIPE_PRICE_ID_ADDON_CREDIT_PACK
STRIPE_PRICE_ID_ADDON_PACK
STRIPE_PRICE_ID_ADDON_MEDIUM
STRIPE_PRICE_ID_ADDON_LARGE

# AI
AI_PROVIDER
ANTHROPIC_API_KEY
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SESSION_TOKEN
AWS_BEARER_TOKEN_BEDROCK
AWS_BEDROCK_ENDPOINT_URL
AWS_REGION
DIGITALOCEAN_AGENT_ENDPOINT
DIGITALOCEAN_ACCESS_KEY
USE_FALLBACK_MODEL
USE_PREVIOUS_MODEL

# Job feed
SERPAPI_API_KEY
# Ranking runs on Workers AI through the AI binding in wrangler.jsonc, no key needed.
# Models: JOB_FEED_RANKING_MODEL and JOB_FEED_RANKING_FALLBACK_MODEL (wrangler vars).

# Email: Cloudflare Email Service uses the EMAIL binding in wrangler.jsonc, no key needed.

# Cron
CRON_SECRET

# PostHog (build-time)
POSTHOG_PERSONAL_API_KEY
POSTHOG_PROJECT_ID
```

See `SETUP.md` for the Cloudflare local loop.

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available Scripts

```bash
npm run dev        # Start development server
npm run build      # Build for production
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # Run TypeScript check (tsc --noEmit)
```

> **Important:** TypeScript errors will break the Vercel build. Always run `npm run typecheck` before considering a change complete.

## Deployment

Deployed on **Vercel** — production auto-deploys on push to `main`. The `maxDuration` on the agent and CV parse routes is set to 120–300 seconds to handle long AI inference tasks.

## Database

Uses **Supabase** (Postgres). All schema changes must be written as SQL migration files in `supabase/migrations/` before running in the Supabase SQL Editor. Never modify the production DB directly.

## Security

- All API routes authenticate via `supabase.auth.getUser()` before processing
- `userId` always comes from the authenticated session — never from the request body
- Supabase service role key is server-side only
- Rate limiting on all AI endpoints (in-memory sliding window)

## License

Private — All rights reserved.
