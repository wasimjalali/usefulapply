# Karko AI

**AI-Powered Job Application Assistant** — Optimizes your CV, generates cover letters, application emails, and follow-up emails tailored to each job posting.

## Features

- **AI-Optimized CV** — Tailors your CV to each job description using ATS-friendly formatting
- **Cover Letter Generation** — Role-specific cover letters grounded in your actual experience
- **Application & Follow-Up Emails** — Professional emails ready to send
- **ATS Score Panel** — Instant fit score between your CV and the job description
- **Application Tracker** — Track your job applications and their statuses in-dashboard
- **Documents Panel** — Manage your primary CV and master CV
- **6 CV Templates** — Including German market templates (see below)
- **PDF & DOCX Export** — Download generated CVs in PDF or DOCX format
- **Anti-Hallucination** — Every skill and claim traces back to your CV; the JD is for keyword matching only

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
- **Email:** Resend
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
│   │   ├── contact/         # Contact form (Resend)
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

Create a `.env.local` file in the project root:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Amazon Bedrock (production)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
# OR use bearer token auth:
AWS_BEARER_TOKEN_BEDROCK=

# Anthropic API (dev / fallback)
ANTHROPIC_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID_PLUS=
STRIPE_PRICE_ID_MAX=
STRIPE_PRICE_ID_ADDON_CREDIT_PACK=

# Resend (email)
RESEND_API_KEY=

# PostHog (analytics)
NEXT_PUBLIC_POSTHOG_KEY=

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

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
