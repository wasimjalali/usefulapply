# CLAUDE.md — KarKo AI Project Reference

> **IMPORTANT:** This file is the single source of truth for the entire project. It MUST be updated after every iteration, feature addition, bug fix, or architectural change. Any AI assistant working on this codebase should read this file first and update it when changes are made.

---

## Product Overview

- **Brand Name:** KarKo AI
- **Tagline:** "One Click. Complete Job Application. Under 90 Seconds."
- **Domain:** https://www.karkoai.com
- **Founder:** Wasim Jalali (Founder & CEO)
- **Product Type:** AI-powered job application assistant (B2C SaaS)
- **Target Users:** Job seekers worldwide who want to apply smarter and faster
- **Core Value Proposition:** What takes job seekers 45-60 minutes manually (tailoring a CV, writing a cover letter, drafting a professional email), KarKo AI delivers in under 90 seconds.

### Core Features

1. **Smart CV Optimization** — Tailors the user's CV to match specific job requirements with ATS-friendly formatting
2. **Cover Letter Generation** — Creates personalized cover letters with company research integration
3. **Application Email Drafting** — Professional application emails ready to send
4. **Fit Analysis** — Pre-generation assessment showing match score, matching skills, and skill gaps before committing credits
5. **Multi-Agent AI System** — Unified writer agent handling analysis, writing, and evaluation
6. **Company Research** — Tavily-powered web search for company culture, values, and recent news
7. **4 CV Templates** — US Modern ATS, US Premium ATS, US Professional, and German ATS templates
8. **Multi-Language Support** — Auto-detects job description language (EN, DE, etc.) and generates all documents in that language
9. **Editable CV Canvas** — Users can directly edit their optimized CV in-browser
10. **Chat Assistant** — AI chat for guidance, questions, and regeneration requests
11. **Session Management** — Each job application is a session with its own chat history, documents, and results
12. **Credit System** — Freemium model with credit-based usage tracking
13. **PDF/DOCX Export** — Download optimized documents in multiple formats

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Framework** | Next.js (App Router) | 16.1.6 |
| **Language** | TypeScript | 5.x |
| **UI** | React | 19.2.3 |
| **Styling** | Tailwind CSS | v4 |
| **State Management** | Zustand (with persistence) | 5.0.10 |
| **AI Models** | Anthropic Claude Sonnet 4.5 (primary), Claude Haiku 4.5 (fallback) | SDK 0.71.2 |
| **AI Provider** | Anthropic API + AWS Bedrock | — |
| **Search/Research** | Tavily API | 0.7.1 |
| **Auth & Database** | Supabase (Auth, PostgreSQL, Storage) | 2.93.3 |
| **Payments** | Stripe (subscriptions + add-on packs) | 20.3.1 |
| **Document Parsing** | pdf-parse, mammoth (DOCX), pdfjs-dist | — |
| **Document Generation** | pdf-lib, jsPDF, docx, html2canvas | — |
| **Icons** | Lucide React | 0.563.0 |
| **UI Components** | Radix UI (Dialog, Tabs) | — |
| **Fonts** | Geist, Geist Mono, Plus Jakarta Sans | — |
| **Local Storage** | IndexedDB (idb) for client-side caching | 8.0.3 |
| **Blob Storage** | Vercel Blob | 2.0.1 |
| **Deployment** | Vercel (assumed, Next.js standard) | — |

### Environment Variables Required

```
# AI
ANTHROPIC_API_KEY          # Primary AI provider
TAVILY_API_KEY             # Company research
USE_FALLBACK_MODEL=true    # Toggle: true=Haiku 4.5, false=Sonnet 4.5

# Auth & DB
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Payments
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID_PLUS
STRIPE_PRICE_ID_PRO
STRIPE_PRICE_ID_ADDON_MEDIUM
STRIPE_PRICE_ID_ADDON_LARGE
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY

# App
NEXT_PUBLIC_SITE_URL=https://www.karkoai.com
```

---

## Project Structure

```
job-copilot/
├── CLAUDE.md                          # THIS FILE — master project reference
├── README.md                          # Basic readme
├── package.json                       # Dependencies & scripts
├── next.config.ts                     # Next.js config (pdf-parse external, canvas alias)
├── tsconfig.json                      # TypeScript config
├── eslint.config.mjs                  # ESLint config
├── postcss.config.mjs                 # PostCSS (Tailwind)
├── .env.local                         # Environment variables (gitignored)
├── public/                            # Static assets
│   ├── karko-ai.png                   # OG image
│   ├── blog/                          # Blog post images
│   │   ├── job-application-time-clock.png
│   │   ├── 100-applications-75-hours.png
│   │   ├── manual-vs-karko-ai.png
│   │   └── time-comparison-chart.png
│   └── ...
├── supabase/                          # Supabase config
│
└── src/
    ├── app/                           # Next.js App Router (pages + API)
    │   ├── layout.tsx                 # Root layout (AuthProvider, ToastProvider, fonts, SEO)
    │   ├── page.tsx                   # Landing page (marketing, ~511 lines)
    │   ├── globals.css                # Global styles + Tailwind
    │   ├── favicon.ico / icon.svg     # Favicons
    │   ├── robots.ts / sitemap.ts     # SEO
    │   │
    │   ├── dashboard/                 # Main app dashboard (authenticated)
    │   │   └── page.tsx               # 3-panel layout: CV/CL/Email tabs + Chat panel
    │   │
    │   ├── auth/                      # Auth pages
    │   │   ├── login/                 # Login page
    │   │   ├── signup/                # Signup page
    │   │   ├── callback/              # OAuth callback handler
    │   │   ├── forgot-password/       # Password reset
    │   │   └── auth-code-error/       # Error handling
    │   │
    │   ├── documents/                 # Document management page
    │   ├── master-cv/                 # Master CV upload/management
    │   ├── pricing/                   # Pricing page
    │   ├── settings/                  # User settings
    │   ├── blog/                      # Blog system
    │   │   ├── page.tsx               # Blog listing page (auto-lists all posts)
    │   │   └── [slug]/page.tsx        # Dynamic blog post page (SEO metadata, JSON-LD)
    │   │
    │   ├── about/                     # About page
    │   ├── contact/                   # Contact page
    │   ├── imprint/                   # Legal imprint
    │   ├── privacy/                   # Privacy policy
    │   ├── terms/                     # Terms of service
    │   │
    │   └── api/                       # API Routes
    │       ├── agent-v2/route.ts      # Main AI agent endpoint (fit_analysis, generate_with_context, full_optimization)
    │       ├── chat/route.ts          # Chat assistant endpoint
    │       ├── regenerate/route.ts    # Cover letter / email regeneration
    │       ├── parse-cv/route.ts      # CV parsing endpoint
    │       ├── generate-pdf/route.ts  # PDF generation
    │       ├── contact/route.ts       # Contact form
    │       └── stripe/                # Stripe endpoints
    │           ├── create-checkout/   # Subscription checkout
    │           ├── create-addon-checkout/ # Add-on credit pack checkout
    │           ├── create-portal/     # Customer billing portal
    │           └── webhook/           # Stripe webhook handler
    │
    ├── components/                    # React Components
    │   ├── ChatPanel.tsx              # Chat interface (input, messages, mode selector)
    │   ├── CVPanel.tsx                # CV display panel (template rendering, tabs)
    │   ├── EditableCVCanvas.tsx       # In-browser CV editor
    │   ├── CoverLetterPanel.tsx       # Cover letter display + regeneration
    │   ├── EmailPanel.tsx             # Email display + regeneration
    │   ├── AgentProgressV2.tsx        # AI progress indicator (SSE steps)
    │   ├── CreditBalance.tsx          # Credit balance display
    │   ├── FileUpload.tsx             # CV file upload (drag & drop)
    │   ├── KarkoAIStepIndicator.tsx   # Step progress indicator
    │   ├── KarkoLogo.tsx              # Brand logo component
    │   ├── MarkdownText.tsx           # Markdown renderer
    │   ├── PDFViewer.tsx              # PDF preview
    │   ├── QualityScoreCard.tsx       # Quality score display
    │   │
    │   ├── chat/                      # Chat sub-components
    │   │   ├── ChatInput.tsx          # Chat input with mode selector
    │   │   ├── ChatMessage.tsx        # Individual message rendering
    │   │   ├── SessionHistory.tsx     # Session list sidebar
    │   │   └── FitAnalysisCard.tsx    # Fit assessment display card
    │   │
    │   ├── cv-templates/              # CV Template Components
    │   │   ├── index.tsx              # Template registry
    │   │   ├── TemplateSelector.tsx   # Template picker UI
    │   │   ├── USModernATSTemplate.tsx
    │   │   ├── USPremiumATSTemplate.tsx
    │   │   ├── USProfessionalTemplate.tsx
    │   │   └── GermanATSTemplate.tsx
    │   │
    │   ├── blog/                      # Blog components
    │   │   └── BlogContent.tsx        # Markdown-to-HTML renderer for blog posts
    │   │
    │   ├── marketing/                 # Landing page components
    │   │   ├── Navbar.tsx             # Marketing navbar (includes Blog link)
    │   │   ├── Footer.tsx             # Marketing footer (includes Blog link)
    │   │   ├── ScrollReveal.tsx       # Scroll animation wrapper
    │   │   └── CountUp.tsx            # Animated counter
    │   │
    │   ├── settings/                  # Settings components
    │   │   ├── ProfileSection.tsx
    │   │   ├── NotificationSection.tsx
    │   │   ├── BillingSection.tsx
    │   │   └── DangerSection.tsx
    │   │
    │   └── ui/                        # UI Primitives
    │       ├── Button.tsx
    │       ├── Card.tsx
    │       ├── CreditIndicator.tsx    # Credit balance dropdown with usage breakdown
    │       ├── Input.tsx
    │       ├── Modal.tsx
    │       ├── Select.tsx
    │       ├── Tabs.tsx
    │       ├── Textarea.tsx
    │       ├── Toast.tsx
    │       └── index.ts
    │
    ├── contexts/
    │   └── AuthContext.tsx             # Auth provider (Supabase Auth, Google OAuth, profile management)
    │
    ├── hooks/
    │   ├── useAgentV2.ts              # SSE streaming for AI agent workflow
    │   ├── useSupabaseSync.ts         # Syncs sessions/documents between Supabase and Zustand
    │   └── useInView.ts              # IntersectionObserver hook for scroll animations
    │
    ├── store/                         # Zustand State Management
    │   ├── index.ts                   # Store exports
    │   ├── useAppStore.ts             # UI state (activeTab, isAgentWorking, etc.)
    │   ├── useSessionStore.ts         # Session state (currentSession, sessions[], chatMessages)
    │   ├── useCVStore.ts              # CV document state (primaryCV, masterCV, photo)
    │   └── useUIStore.ts              # Additional UI state
    │
    ├── lib/                           # Core Business Logic
    │   ├── agents/                    # AI Agent System
    │   │   ├── unified-writer-agent.ts # THE agent — handles all AI tasks (~103KB)
    │   │   ├── types.ts               # MasterContext, AgentEvent, AgentResult types
    │   │   └── index.ts               # Exports: runJobCopilot, runFitAnalysis, runWithContext
    │   │
    │   ├── models/                    # AI Model Configuration
    │   │   ├── types.ts               # TaskType, ModelConfig, MODEL_CONFIGS (all task→model mappings)
    │   │   ├── anthropic.ts           # Anthropic API client (prompt caching, Bedrock support)
    │   │   └── index.ts              # Model routing
    │   │
    │   ├── supabase/                  # Database Layer
    │   │   ├── client.ts              # Supabase client singleton
    │   │   ├── server.ts              # Server-side Supabase client
    │   │   ├── middleware.ts           # Auth middleware
    │   │   ├── types.ts               # Database types (profiles, documents, sessions, etc.)
    │   │   ├── credits.ts             # Credit system (getUserCredits, deductCredits, CREDIT_COSTS)
    │   │   ├── sessions.ts            # Session CRUD operations
    │   │   ├── documents.ts           # Document storage operations
    │   │   ├── accounts.ts            # Account management
    │   │   ├── feedback.ts            # User feedback
    │   │   ├── storage.ts             # File storage (Supabase Storage)
    │   │   └── index.ts              # Exports
    │   │
    │   ├── blog/                      # Blog Content System
    │   │   ├── types.ts               # BlogPost type, BlogCategory, CATEGORY_COLORS
    │   │   ├── posts.ts               # Blog posts data store + query functions
    │   │   └── index.ts               # Exports
    │   │
    │   ├── config/                    # Configuration
    │   │   ├── design-tokens.ts       # Design system tokens
    │   │   ├── cover-letter-blacklist.ts # Phrases to avoid in cover letters
    │   │   └── typo-corrections.ts    # Common typo corrections
    │   │
    │   ├── cv-templates/              # CV Template Types & Validation
    │   │   ├── types.ts               # CVData, CVTemplate, region-specific validation rules (~1027 lines)
    │   │   ├── index.ts               # Template configuration
    │   │   └── templates.ts           # Template definitions
    │   │
    │   ├── cv-parser/                 # CV text extraction
    │   ├── middleware/
    │   │   └── creditCheck.ts         # Credit checking middleware for API routes
    │   │
    │   ├── storage/                   # Client-side Storage
    │   │   ├── indexeddb.ts           # IndexedDB wrapper
    │   │   └── applicantStore.ts      # Applicant data caching
    │   │
    │   ├── utils/                     # Utilities
    │   │   ├── cv-transformers.ts     # CV data transformation
    │   │   ├── document-parser.ts     # PDF/DOCX parsing
    │   │   ├── file-validation.ts     # File type/size validation
    │   │   ├── language-detector.ts   # Language detection (EN/DE + AI for others)
    │   │   ├── password-strength.ts   # Password validation
    │   │   ├── pdf-generator.ts       # PDF generation
    │   │   ├── session-cleanup.ts     # Session cleanup utilities
    │   │   └── creditEvents.ts        # Credit update event bus
    │   │
    │   ├── types.ts                   # Shared types (JobRequirements, GapAnalysis, etc.)
    │   ├── types.examples.ts          # Type examples for documentation
    │   ├── prompts.ts                 # Legacy prompts (21KB)
    │   ├── stripe.ts                  # Stripe config (PLANS, prices, addon maps)
    │   └── cv-extractor.ts            # CV text extraction utility
    │
    ├── types/
    │   └── index.ts                   # Global type declarations
    │
    ├── styles/
    │   └── ...                        # Additional styles
    │
    └── utils/
        └── ...                        # Additional utilities
```

**Total:** ~140 items in `src/`, 4 CV templates, 12+ API routes, 3 Zustand stores

---

## AI Architecture

### Unified Writer Agent (`src/lib/agents/unified-writer-agent.ts`)

Single intelligent agent (~103KB) handling the complete workflow:

**Phase 1 — Analysis (Fit Analysis):**
1. `extractApplicantProfile()` — Parse CV into structured profile
2. `parseJobDescription()` — Extract requirements from job description
3. `detectLanguage()` — Auto-detect language from JD
4. `computeSkillMatch()` — LLM-based semantic skill matching (cross-language)
5. `generateFitAssessment()` — Produce fit score, assessment, matching/missing skills

**Phase 2 — Generation (Full Application):**
6. `generateOptimizedCVData()` — Structured JSON CV output (directly renderable by templates)
7. `generateCoverLetter()` — Personalized cover letter with company research
8. `generateApplicationEmail()` — Professional email with subject + body

**Key Design Decisions:**
- All prompts use XML tags per Anthropic best practices
- Zero fabrication policy — anti-hallucination guardrails in all generation prompts
- Strict skill matching — requires explicit name-match, no inference from adjacent skills
- Language-agnostic — AI generates `sectionHeaders` and `localizedStrings` per JD language
- Evaluator-Optimizer reflection loop for quality refinement

### Model Configuration

| Task | Model | Temperature | Max Tokens |
|------|-------|-------------|------------|
| CV Optimization | Claude Sonnet 4.5 | 0.5 | 8192 |
| Cover Letter | Claude Sonnet 4.5 | 0.6 | 2048 |
| Email | Claude Sonnet 4.5 | 0.55 | 1024 |
| Fit Assessment | Claude Sonnet 4.5 | 0.4 | 400 |
| Skill Matching | Claude Sonnet 4.5 | 0.1 | 2048 |
| General Chat | Claude Sonnet 4.5 | 0.7 | 150 |
| All other tasks | Claude Sonnet 4.5 | 0.2-0.65 | varies |

Toggle `USE_FALLBACK_MODEL=true` in `.env` to switch all tasks to Claude Haiku 4.5.

### API Routes

- **`POST /api/agent-v2`** — Main AI endpoint. Actions: `fit_analysis`, `generate_with_context`, `full_optimization`. Uses SSE for real-time progress streaming.
- **`POST /api/chat`** — Chat assistant with conversation history and session-aware context.
- **`POST /api/regenerate`** — Regenerate cover letter or email individually.
- **`POST /api/parse-cv`** — Parse uploaded CV (PDF/DOCX) to text.
- **`POST /api/generate-pdf`** — Generate downloadable PDF from CV data.

**Server-Side Context Cache:** In-memory Map with 30-minute TTL. After fit analysis, context is cached by `contextId` so Phase 2 reuses it without re-running Phase 1.

---

## Credit System & Pricing

### Credit Costs

| Action | Credits | Description |
|--------|---------|-------------|
| Fit Analysis | 0.5 | Phase 1 only — analysis + fit score |
| Full Application | 1.5 | Phase 2 — CV + Cover Letter + Email |
| CV Optimization | 1.0 | CV only (legacy) |
| CL Regeneration | 0.5 | Regenerate cover letter |
| Email Regeneration | 0.5 | Regenerate email |

**Typical flow:** Fit Analysis (0.5) → Full Application (1.5) = **2.0 credits total**

### Pricing Plans

| Plan | Price | Monthly Credits | Applications | Add-ons | Rollover |
|------|-------|----------------|--------------|---------|----------|
| **Starter (Free)** | $0 | 40 | ~20 | No | No |
| **Plus** | $29.99/mo | 120 | ~60 | Yes (60 or 120 packs) | 1 month |
| **Pro** | $49.99/mo | 300 | ~120 | Yes (60 or 120 packs) | 2 months |

Credit deduction order: monthly → rollover → addon.

---

## Authentication & Data Flow

### Auth Flow (Supabase Auth)
- **Email/Password** signup + login
- **Google OAuth** (redirects to `/auth/callback`)
- **Password reset** via email
- `AuthContext` wraps entire app, provides `user`, `profile`, `session`

### Data Sync Architecture
- **Supabase = source of truth** for sessions, documents, credits, profiles
- **Zustand stores** = client-side state with localStorage persistence (`currentSession` only)
- **`useSupabaseSync` hook** syncs bidirectionally on mount and on changes (debounced)
- **Session isolation:** `chat_messages.session_id` NOT NULL FK at DB level
- **Sign-out cleanup:** Removes `session-store` and `cv-store` from localStorage

### Database Tables (Supabase PostgreSQL)
1. `profiles` — User profiles (name, email, URLs, notification prefs)
2. `documents` — Uploaded CVs (primary_cv, master_cv) with raw text + structured data
3. `application_sessions` — Job application sessions (JD, results, scores)
4. `chat_messages` — Chat history per session
5. `user_credits` — Credit balances (monthly, rollover, addon)
6. `credit_transactions` — Transaction audit log
7. `subscription_plans` — Plan definitions
8. `addon_credit_packs` — Add-on pack definitions
9. `feedback` — User feedback
10. `profile_photos` — Photo storage metadata

---

## CV Template System

### Templates Available
1. **US Modern ATS** (`USModernATSTemplate.tsx`) — Clean, single-column, ATS-optimized
2. **US Premium ATS** (`USPremiumATSTemplate.tsx`) — Premium design, still ATS-friendly
3. **US Professional** (`USProfessionalTemplate.tsx`) — Traditional professional layout
4. **German ATS** (`GermanATSTemplate.tsx`) — German CV standards (photo, signature, CEFR)

### Region-Specific Standards
- **US/Canada:** No photo, no DOB, no marital status. Letter size. Descriptive language proficiency.
- **Germany:** Photo recommended (53%), full address, signature required, CEFR language levels, A4 size.
- **EU:** Photo varies by country, CEFR recommended, A4 size.

### Validation System (`src/lib/cv-templates/types.ts`)
Comprehensive character/word count validation for every CV section:
- Tagline, summary, skills, experience bullets, education, certifications, languages
- Page character budgets by experience level (entry/mid/senior)
- ATS compatibility checking (no tables, no text boxes, single column, standard fonts)
- Metric detection in bullet points (%, $, counts)
- Keyword match calculation between CV and JD

---

## Current User Flow (as of Feb 9, 2026)

### Anonymous Free Trial (Product-Led Growth)

Anonymous users get **one complete free cycle** (fit analysis + full generation) without signing up:

```
Landing Page → "Try It Free, No Sign Up" → /dashboard (NO AUTH)
    ↓
Upload CV + Paste Job Description
    ↓
Fit Analysis runs FREE (no credits deducted for anonymous)
    ↓
Full Application generates FREE (CV + Cover Letter + Email)
    ↓
User can VIEW all results — CV, Cover Letter, Email tabs
    ↓
🔒 SIGN-UP WALL triggers on:
   • Download CV/CL as PDF/DOCX
   • Copy All / Open in Email (email panel)
   • Paste a second job description
   • Click "Start New Application" or "New Chat"
```

**Tracking:** `localStorage.karko_anonymous_generation_used = 'true'` is set after first `workflow_complete` event. The `SignUpWallModal` component (`src/components/SignUpWallModal.tsx`) handles all gates.

**API:** `agent-v2` route allows unauthenticated requests — credit deduction is skipped for anonymous users (`isAnonymous` flag). Authenticated users still go through normal credit checks.

### Authenticated Flow

1. **Landing Page** (`/`) → Marketing page with features, how-it-works, pricing
2. **Sign Up** (`/auth/signup`) → Name + email + password (simplified, no confirm password) or Google OAuth
3. **Dashboard** (`/dashboard`) → Full access with credit system
   - Upload CV (PDF/DOCX)
   - Paste job description in chat
   - Choose mode: "Analyze First" (fit analysis) or "Apply Directly" (full generation)
   - View results in tabs: CV | Cover Letter | Email
   - Edit CV inline, regenerate CL/email, download as PDF/DOCX
4. **Documents** (`/documents`) → Manage uploaded CVs (authenticated only)
5. **Settings** (`/settings`) → Profile, billing, notifications, danger zone (authenticated only)

---

## Development Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

---

## Code Style & Conventions

- **TypeScript strict mode** — All code is typed
- **Functional components** — No class components
- **Zustand for state** — Split into domain-specific stores (app, session, CV, UI)
- **Server components by default** — `'use client'` only when needed
- **Tailwind for styling** — Custom design tokens in `design-tokens.ts` and `globals.css`
- **Color palette:** Navy, gold, cream, warm-gray (premium, trustworthy feel)
- **XML tags in AI prompts** — Per Anthropic best practices
- **SSE for streaming** — Agent progress streamed via Server-Sent Events
- **Debounced syncing** — Supabase syncs debounced (1-2s) to prevent thrashing
- **Anti-hallucination guardrails** — All AI prompts enforce zero fabrication policy

---

## Known Architectural Patterns

- **Context Cache Pattern:** After fit analysis, `MasterContext` is cached server-side (30min TTL) so Phase 2 can reuse it without re-running analysis.
- **Partialize Pattern:** Zustand `partialize` only persists `currentSession` to localStorage — full session list always loaded from Supabase.
- **Optimistic Updates:** Profile updates are optimistic (instant UI update, revert on error).
- **Credit Middleware:** API routes use `creditCheck.ts` middleware to verify + deduct before processing.
- **Progressive Enhancement:** Marketing pages are server-rendered; dashboard is client-side.

---

## Blog System

### Architecture
- **File-based content** — Blog posts are defined as TypeScript objects in `src/lib/blog/posts.ts`
- **No CMS required** — Just add a new object to the `blogPosts` array
- **Auto-indexed** — Sitemap, listing page, and SEO metadata are generated automatically
- **Markdown content** — Blog post content uses Markdown, rendered by `BlogContent.tsx`

### Published Blog Posts
1. **"How Long Does It Really Take to Apply for a Job in 2026?"** — `/blog/how-long-to-apply-for-job-2026` (Feb 10, 2026, featured, category: Job Search)
   - 4 custom images in `public/blog/`: `job-application-time-clock.png`, `100-applications-75-hours.png`, `manual-vs-karko-ai.png`, `time-comparison-chart.png`

### Adding a New Blog Post
1. Open `src/lib/blog/posts.ts`
2. Add a new `BlogPost` object to the `blogPosts` array with: slug, title, description, content (markdown), author, publishedAt, readingTime, category, tags
3. Place any blog images in `public/blog/` and reference them as `/blog/image-name.png` in the markdown content
4. Set `featured: true` to pin it at the top of the listing page
5. That's it — the sitemap, listing page, individual page, and JSON-LD are all automatic

### SEO Features (per blog post)
- Dynamic `<title>` and `<meta description>` via `generateMetadata()`
- Open Graph article tags (publishedTime, authors, tags)
- Twitter Card metadata
- BlogPosting JSON-LD schema (author, publisher, wordCount, timeRequired)
- Canonical URLs
- All auto-included in `/sitemap.xml`
- Discoverable by AI crawlers via `/llms.txt` and `/robots.txt`

### Categories
`Career Tips` | `AI & Technology` | `Job Search` | `CV Writing` | `Cover Letters` | `Interview Prep` | `Product Updates`

---

## SEO & Discoverability

### Dynamic SEO Files
- **`/sitemap.xml`** — Generated by `src/app/sitemap.ts`, auto-includes all blog posts
- **`/robots.txt`** — Generated by `src/app/robots.ts`, allows 10+ AI crawler user agents
- **`/llms.txt`** — Static file in `public/llms.txt` for LLM/AI chatbot discovery

### Structured Data (JSON-LD)
- **SoftwareApplication** — Root layout (features, pricing, screenshots)
- **Organization** — Root layout (founder, contact, logo)
- **FAQPage** — Root layout (5 common questions for rich snippets)
- **BlogPosting** — Each blog post page (author, publisher, wordCount)

### AI Crawler Support
Explicitly allowed in robots.ts: GPTBot, ChatGPT-User, Google-Extended, anthropic-ai, ClaudeBot, PerplexityBot, cohere-ai, Meta-ExternalAgent, Bingbot

---

## Maintenance Rules

1. **Update this file** after every feature addition, bug fix, or architectural change.
2. **Keep the project structure** section current — add/remove files as they change.
3. **Update the model table** if task configurations change.
4. **Update credit costs** if pricing changes.
5. **Update the user flow** section if auth gates or navigation changes.
6. When making changes, verify they don't break the credit system, session isolation, or auth flow.
7. **Blog posts** — Just add to `src/lib/blog/posts.ts`. Everything else is automatic.

---

*Last Updated: February 10, 2026*
