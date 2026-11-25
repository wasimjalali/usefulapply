# Useful Apply

**The AI job application agent.** Your entire job search in one app. Find roles, check the fit, generate the full application in 90 seconds, and track everything. Every word traces back to your real CV. Nothing invented.

> **Status:** the hosted product is offline. This is the full production codebase (Next.js on Cloudflare Workers, D1, R2, KV, Stripe, Claude), published as a portfolio project under the MIT license.

## Features

- **Daily job feed** - hand-picked roles matched to your CV, goals, and location. Free: top 5 a day, one search, no wizard. Plus and Max: up to 25 a day (Plus 2 searches, Max 4).
- **Fit Analysis** - match score, strengths, and gaps before you spend credits on the full application. A checkpoint, not a commitment.
- **Tailored CV** - rewritten for each role from your real CV, in an ATS-optimized template
- **Cover Letter** - grounded in your real experience, written for the specific role and company
- **Application Email + Follow-Up** - ready-to-send emails, with the follow-up pre-drafted for 7 to 10 days later
- **Screening Question Answers** - STAR structure for behavioral questions, direct answers for factual ones (Plus and Max)
- **Application Tracker** - every application saves automatically with company, role, match score, status, and date
- **6 CV Templates** - all single-column and ATS-safe by default, including German market templates
- **PDF & DOCX Export** - download generated CVs in PDF or DOCX format
- **Anti-Hallucination (the moat)** - every skill, metric, and claim traces back to your uploaded CV. The job description is for keyword alignment and tone, never a source of facts about you.

## AI Models

| Task | Model | Provider |
|------|-------|----------|
| Kit writing, CV parsing, fit analysis | Claude Sonnet 5.5 | Anthropic API, with Claude in Amazon Bedrock (same model) as failover |
| Chat, screening answers, tracker chat, language detection, career profile, search strategy, job-feed ranking | Claude Haiku 5.5 | Anthropic API, with Claude in Amazon Bedrock (same model) as failover |

The failover runs only on a provider failure (network, 5xx, overload), never on a 4xx or a content problem, and is visible in the LLM ledger (provider `bedrock`) and PostHog (`llm_provider_failover`).

The agent uses a **Unified Writer Agent** with two modes:
- **Analyze First** - runs fit analysis (0.5 credits), then generates the full application on demand (2.0 credits)
- **Apply Directly** - runs full Phase 1 + Phase 2 in one pass (2.0 credits)

## CV Templates

| ID | Name | Color | Best For |
|----|------|-------|----------|
| `premium-ats` | Premium ATS | #0F3057 navy | Most jobs (default) |
| `modern-professional` | Modern Professional | #2C7A7B teal | Tech and startups |
| `executive` | Executive | #702459 burgundy | Senior roles |
| `german-ats` | German ATS | #1E3A5F slate blue | German market (two-column) |
| `german-classic` | German Classic | #374151 charcoal | German market (single-column) |
| `classic-green` | Classic Green | #2D6A4F forest green | All industries |

All templates use Arial body + Georgia headers (ATS-compliant system fonts).

## Subscription Tiers

| Tier | Credits/Month | Price |
|------|--------------|-------|
| Free | 4 | Free |
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

- **Framework:** Next.js 16 (App Router, React 19) on Cloudflare Workers via `@opennextjs/cloudflare`
- **Language:** TypeScript 5
- **Styling:** Tailwind CSS v4
- **State:** Zustand v5
- **AI:** Claude Sonnet 5.5 and Claude Haiku 5.5 via the Anthropic API (API version 2026-10-21), with Claude in Amazon Bedrock as the same-model failover
- **Auth:** Better Auth (email + password, Google OAuth), session cookie `usefulapply.session`
- **Database:** Cloudflare D1 (SQLite) with Drizzle, repos in `src/db/repos/`, migrations in `migrations/d1/`
- **Storage:** Cloudflare R2 (`usefulapply-files`), served through `/api/files`
- **Caching:** Cloudflare KV (`CONTEXT_CACHE`) for the agent context cache
- **Email:** Cloudflare Email Service (`EMAIL` binding)
- **Payments:** Stripe (subscriptions + add-on credit packs)
- **Analytics:** PostHog (analytics + error tracking + LLM cost tracking)
- **PDF Parsing:** pdfjs-dist v5
- **PDF Export:** server-side through Cloudflare Browser Run, DOCX via `docx` (`src/lib/services/export/`)

## Project Structure

```
src/
├── app/                     # Next.js App Router pages
│   ├── api/                 # API routes
│   │   ├── agent-v2/        # Main AI generation endpoint (SSE streaming)
│   │   ├── parse-cv/        # CV parsing
│   │   ├── regenerate/      # Regenerate individual sections
│   │   ├── auth/            # Better Auth catch-all + signup/confirm routes
│   │   ├── chat/            # Chat endpoint
│   │   ├── files/           # R2 upload + serving
│   │   ├── job-feed/        # Daily job feed routes
│   │   ├── tracker/         # Application tracker routes
│   │   ├── credits/         # Credit balance
│   │   ├── stripe/          # Checkout, portal, webhook
│   │   └── contact/         # Contact form (Cloudflare Email Service)
│   ├── dashboard/           # Main app dashboard
│   ├── applications/        # Application tracker page
│   ├── master-cv/           # Master CV editor
│   ├── profile/             # Career profile
│   ├── settings/            # Settings and subscription
│   ├── pricing/             # Pricing page
│   ├── auth/                # Login, signup, reset pages
│   ├── admin-dashboard/     # Admin (Cloudflare Access protected)
│   └── ...                  # Landing, blog, compare, legal pages
├── components/              # React components
│   ├── CVPanel.tsx          # CV viewer/editor
│   ├── CoverLetterPanel.tsx
│   ├── EmailPanel.tsx
│   ├── ChatPanel.tsx        # AI chat interface
│   ├── job-feed/            # Job feed components
│   ├── tracker/             # Tracker components
│   ├── cv-templates/        # Template selector + renderers
│   └── ui/                  # Shared UI primitives
├── db/                      # Drizzle schema, client, and repos
│   ├── schema.ts
│   ├── client.ts
│   └── repos/               # Per-entity data access
├── lib/
│   ├── agents/              # Unified Writer Agent + context builder
│   │   └── prompts/         # Prompt builders (cv, cover letter, email, fit)
│   ├── models/              # Model layer (Anthropic API, Bedrock failover, Haiku budget guard)
│   ├── cv-parser/           # CV section splitting + parsing
│   ├── cv-templates/        # CVData types + parser
│   ├── job-feed/            # Ingestion, prefilter, LLM ranker, reconcile
│   ├── auth/                # Better Auth helpers
│   ├── email/               # Cloudflare Email Service helpers
│   ├── middleware/          # In-memory rate limiter
│   └── stripe.ts            # Stripe client + price IDs
├── hooks/                   # React hooks (useSupabaseSync: D1 sync)
├── store/                   # Zustand stores
│   ├── useSessionStore.ts
│   ├── useCVStore.ts
│   ├── useUIStore.ts
│   └── ...                  # feed, tracker, settings stores
├── cron/                    # Scheduled job handlers
├── storage/                 # R2 file handling
├── providers/               # Client-side providers
├── contexts/
└── worker.ts                # Cloudflare Worker entry (fetch + scheduled)
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Environment Variables

Copy `.dev.vars.example` to `.dev.vars` and fill in locally. Names only, the file stays in sync. Never commit `.dev.vars`. Bindings (D1, R2, EMAIL, KV, rate limits, Browser Run) are defined in `wrangler.jsonc`, which is the source of truth for local dev and preview.

Auth secrets (`BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) are set as Worker secrets in production, never in `wrangler.jsonc`.

### First-Time Local D1

```bash
npx wrangler d1 migrations apply usefulapply-db --local
```

This applies `migrations/d1/*.sql` to the local Miniflare D1 that dev and preview share.

### Installation

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Available Scripts

```bash
npm run dev         # Start the dev server with Cloudflare bindings
npm run preview     # Build with OpenNext, run the Worker locally
npm run deploy:cf   # Build with OpenNext, deploy to Cloudflare Workers
npm run lint        # Run ESLint
npm run typecheck   # Run TypeScript check (tsc --noEmit)
```

> **Important:** `typecheck` needs a big heap. Run `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`. TypeScript errors break the build, so always run it before considering a change complete.

## Deployment

Deployed to **Cloudflare Workers** via `@opennextjs/cloudflare`. Production deploys with `npm run deploy:cf`. Custom domains: `usefulapply.com`, `www.usefulapply.com`, and `admin.usefulapply.com` (Cloudflare Access protected, serves the admin dashboard).

## Database

Uses **Cloudflare D1** (SQLite) with Drizzle. All schema changes are written as SQL migration files in `migrations/d1/` and applied with `npx wrangler d1 migrations apply usefulapply-db`. Never modify the production DB directly.

## Security

- Auth via Better Auth sessions; API routes authenticate before processing
- `userId` always comes from the authenticated session, never from the request body
- Rate limiting on API routes (Cloudflare Rate Limiting bindings + in-memory sliding window)
- Cloudflare Access fronts the admin dashboard, with the Worker verifying the JWT in-app
- Secrets are Worker secrets, never in source files or `wrangler.jsonc`

## License

[MIT](LICENSE). Copyright (c) 2026 Wasim Jalali.