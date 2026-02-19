# CLAUDE.md — Karko AI Codebase Reference

> **This is the ONLY state documentation file.** Update this file whenever you make ANY changes to the codebase. Do not create separate state tracker markdown files.

## Architecture Overview

Karko AI is a Next.js 14+ application that generates optimized job application materials (CV, Cover Letter, Application Email, Follow-Up Email) using a unified AI agent architecture powered by Claude Sonnet 4.6 (via Amazon Bedrock).

### Key Directories
- `src/lib/agents/` — Unified Writer Agent + context-builder + prompts/ (modular agent architecture)
- `src/lib/agents/prompts/` — Extracted prompt builders (cv-prompt, cover-letter-prompt, email-prompts, fit-assessment-prompt)
- `src/lib/models/` — Model configurations and task types
- `src/lib/cv-parser/` — Modular CV parsers (section-splitter, parse-experience, parse-education, parse-skills, parse-other)
- `src/lib/cv-templates/` — CV types + constants, validation.ts, text-analysis.ts
- `src/app/api/` — API routes (agent-v2, regenerate)
- `src/hooks/` — React hooks (useAgentV2 for SSE streaming)
- `src/store/` — Zustand stores (useSessionStore, useCVStore, useUIStore)
- `src/components/` — React components (EmailPanel, ChatPanel, etc.)

### Workflow
1. **Phase 1 (Fit Analysis):** Parse CV, analyze JD, skill matching, fit assessment (0.5 credits)
2. **Phase 2 (Generation):** Optimize CV, cover letter, application email, follow-up email (1.5 credits)

### Agent Flow (Analyze First Mode)
- Phase 1 runs `runFitAnalysis()` → context is cached server-side (`contextCache` Map, 30-min TTL)
- `fit_analysis_complete` SSE event sends full parsed context (applicant, job, match, verifiedMetrics, detectedLanguage) to client
- Client stores context in `fitAnalysisContextData` state (ChatPanel) as fallback
- User sees fit assessment → clicks "Apply for This Job" or "Start New Application"
- "Apply" triggers `generate_with_context` action with `cachedContextData` in request body
- Server tries in-memory cache first; if miss (dev hot-reload, serverless cold start), reconstructs MasterContext from client-sent data
- Only falls back to `full_optimization` if NEITHER server cache NOR client data is available
- "Skip" clears client state; server cache expires naturally

### Agent Flow (Apply Directly Mode)
- Runs `runJobCopilot()` → full Phase 1 + Phase 2 in one pass (no fit assessment generated)
- 7 LLM calls total, 1.5 credits

### Credit Costs
| Action | Credits |
|--------|---------|
| Fit Analysis (Analyze First) | 0.5 |
| Full Application (after fit analysis) | 1.5 |
| Full Application (Apply Directly) | 1.5 |
| Analyze First → Skip | 0.5 (only fit analysis charged) |
| Follow-Up Regen | 0 |

---

## Follow-Up Email Feature

**Added:** June 2025

### What It Does
After generating the primary application email, Karko AI automatically generates a follow-up email designed to be sent 5-7 business days later. The follow-up highlights a DIFFERENT achievement/skill than the primary email (the "New Value Hook" principle).

### Files Modified

| File | Change |
|------|--------|
| `src/lib/agents/types.ts` | Added `followUpEmail` to `MasterContext` |
| `src/lib/models/types.ts` | Added `write_follow_up_email` task type + model config |
| `src/lib/agents/unified-writer-agent.ts` | Added `generateFollowUpEmail()` method; updated `run()` and `runWithContext()` to call it after primary email |
| `src/app/api/agent-v2/route.ts` | Added `follow_up_email` step to workflow steps and step indexes; included `followUpEmail` in all `workflow_complete` results |
| `src/app/api/regenerate/route.ts` | Added `follow_up_email` type handler with 0-credit cost |
| `src/lib/supabase/credits.ts` | Added `FOLLOW_UP_REGEN: 0` to `CREDIT_COSTS` |
| `src/hooks/useAgentV2.ts` | Added `followUpEmail` to `AgentV2Result` interface |
| `src/store/useSessionStore.ts` | Added `followUpEmail` to `ApplicationSession` interface and `createNewSession` |
| `src/components/EmailPanel.tsx` | Added follow-up email UI: gold dashed divider, schedule badge, subject/body display, copy buttons, regenerate button, combined tips section |
| `src/components/ChatPanel.tsx` | Added `followUpEmail` storage from workflow results |

### Model Configuration
- **Task:** `write_follow_up_email`
- **Model:** `claude-sonnet-4-6`
- **Temperature:** 0.5
- **Max Tokens:** 512

### Credit Impact
- **Initial generation:** 0 additional credits (included in Phase 2)
- **Regeneration:** 0 credits (`FOLLOW_UP_REGEN`)

### UI Behavior
- Displayed within the Email tab, below the primary email
- Separated by a gold (#c9a84c) dashed divider
- Schedule badge shows recommended delay (5 days EN, 7 days DE)
- Separate copy and regenerate buttons for the follow-up
- "Copy All" includes both emails with a separator
- Tips section splits into PRIMARY EMAIL / FOLLOW-UP EMAIL sections when follow-up exists

### Follow-Up Email Rules
- **Subject:** "Following Up: [Role] Application — [Name]" (EN) / "Nachfrage: [Stelle] Bewerbung — [Name]" (DE)
- **Body:** 60-80 words max, 4 elements: opening reference, reaffirm interest, new value hook, soft CTA
- **Tone:** Confident, not desperate. No "just checking in" or "I know you're busy"
- **Anti-hallucination:** Only uses verified skills/achievements from source CVs
- **No em-dashes** in output
- **No re-attachment references** (they already have the documents)

---

## Fit Assessment Display & Prompt Rules

**Updated:** February 10, 2026

### Output Format (from LLM)
The fit assessment prompt produces structured markdown with these sections, each separated by a blank line:
1. **Verdict line** — max 150 characters
2. **Strengths** — 2-3 bullets, 12 words max each, max 250 chars total
3. **Gaps** — 2-3 bullets, 12 words max each, max 250 chars total
4. **Recommendation** — 1 sentence, max 200 characters
- Total word limit: 150 words

### Display (ChatPanel.tsx)
- Matching skills and missing skills are shown in **separate paragraphs** (not same paragraph)
- Max 10 skills shown per section; overflow shows `(+N more)`
- Each section has a count header: `Matching Skills (13):`

### Files
- `src/lib/agents/prompts/fit-assessment-prompt.ts` — `buildFitAssessmentPrompt()` and `buildFitAssessmentSystemPrompt()`
- `src/lib/agents/unified-writer-agent.ts` — `generateFitAssessment()` orchestrator (calls prompt builders)
- `src/components/ChatPanel.tsx` — `fit_analysis_complete` handler

---

## Primary Email — JD Relevance Rules

**Updated:** February 10, 2026

### Problem Solved
The primary email was focusing on the primary CV's general highlights (e.g., "built AI products") instead of highlighting skills relevant to the specific job description.

### How It Works Now
The email prompt receives:
- **Matching skills list** (top 8 from skill match analysis)
- **Top JD requirements** (top 5 required skills from parsed JD)
- **Key responsibilities** (top 3 from parsed JD)
- **Fit score** (internal context only — **NEVER included in email output**)

### Critical Rules
- **Fit score is INTERNAL ONLY** — the LLM uses it to calibrate tone/confidence but NEVER writes it in the email
- Same prohibition applies to follow-up email (which doesn't even receive the score)
- Every claim in the email must tie to a specific JD requirement
- The `JOB-RELEVANCE PRIORITY` rule in the system prompt enforces this

### Files
- `src/lib/agents/prompts/email-prompts.ts` — `buildApplicationEmailUserPrompt()` and `buildApplicationEmailSystemPrompt()`
- `src/lib/agents/unified-writer-agent.ts` — `generateApplicationEmail()` orchestrator

---

## Cover Letter Header — Language-Conditional Format

**Updated:** February 13, 2026

### EN Market (US/UK/Canada)
- Applicant contact info → Date → "Hiring Manager" + Company Name → Greeting
- NO company address. NO bracketed placeholders requiring user action.

### DE Market (Germany)
- Full applicant address → Date → Full company address → Formal greeting
- Company address included per German Anschreiben convention.

### Files
- `src/lib/agents/prompts/cover-letter-prompt.ts` — `buildCoverLetterSystemBlocks()` and `buildCoverLetterUserPrompt()`
- `src/lib/agents/unified-writer-agent.ts` — `generateCoverLetter()` orchestrator

---

## Anti-Hallucination Rules (CV & Cover Letter)

**Updated:** February 11, 2026

### Core Principle
Every skill, metric, number, and claim in generated CV/cover letter output must be traceable to the Primary CV or Master CV. The JD is used for keyword matching and relevance targeting only — never as a source of facts about the applicant.

### CV Optimization (`generateOptimizedCVData`)
Located in `unified-writer-agent.ts`, the `<anti_hallucination_rules>` block contains 7 rules:

| Rule | Purpose |
|------|---------|
| **Rule 1** — Source Verification | Every skill/tool/platform must exist in Primary CV or Master CV |
| **Rule 2** — Metric Accuracy | Only exact numbers from source CVs. No extrapolation. |
| **Rule 3** — Language Proficiency | CEFR levels reproduced exactly. B2 stays B2, never "verhandlungssicher" |
| **Rule 4** — Skill Accuracy (highest priority) | Overrides ATS optimization. Only explicitly listed skills allowed. |
| **Rule 4b** — Quantified Claims | All numbers must trace to source CVs. JD numbers are NOT allowed. |
| **Rule 4c** — Experience Bullet Accuracy | Bullets must describe actual work. Pre-bullet metric verification checklist. |
| **Rule 4d** — JD Numbers Forbidden | Numbers from JD describe the EMPLOYER, not the applicant. Never use them. |

### Cover Letter (`generateCoverLetter`)
5 rules in its own `<anti_hallucination_rules>` block. Rule 2 (Metric Accuracy) is cleanly stated: "If a number is not in the source documents, do not include it."

### Known Hallucination Patterns (fixed)
- **Fabricated metrics ("350+ product listings")**: The number "350" did not exist in the JD or in the user's CV — the LLM invented it entirely. **Root causes**: (1) `<quality_standard>` said "quantified achievements where possible" — the "where possible" pressured the LLM to invent numbers. (2) Bullet format rule said "include at least one metric/number when available" — same pressure. (3) An ALLOWED example ("350+ SKUs from JD — allowed") gave permission to use JD numbers in CVs (that rule was intended for cover letters only). **Fixed** by: qualifying "where possible" → "ONLY when those exact numbers exist in source CVs"; changing bullet rule to "ONLY if that exact number exists"; adding "a bullet without metrics is ALWAYS better than a bullet with a fabricated metric"; removing the JD-numbers ALLOWED example; adding Rule 4d (JD numbers forbidden in CVs).
- **Metric hallucination from competing pressures ("100+ product listings")**: Numbers fabricated because (1) "high-impact" bullet requirement created metric pressure, (2) CAR Method format demanded quantified Results, (3) no structural binding for metrics. **Fixed** with two layers: Layer 1 (prompt) removed metric-pressure language, added numberless bullet examples; Layer 2 (structural) added `extractVerifiedMetrics()` as a binding constraint mirroring the verified skills architecture.

### Verified Metrics System

**Added:** February 11, 2026

**Problem:** The CV generation agent fabricated quantified metrics (e.g., "100+ product listings") that did not exist in the user's source CVs. Prompt-level rules alone were insufficient because competing pressures (CAR Method format, "high-impact" bullet requirement) overrode them.

**Solution:** Two-layer fix:
1. **Prompt layer:** Removed metric-pressure language ("high-impact" → "strong, accurate"), replaced CAR Method with "Action → Impact", added explicit numberless bullet examples.
2. **Structural layer:** Added `extractVerifiedMetrics()` that extracts all numbers from the user's CVs during Phase 1, then injects them as a binding constraint in Phase 2 — identical architecture to the verified skills list.

**Files Modified:**
- `src/lib/agents/types.ts` — Added `verifiedMetrics?: string[]` to `MasterContext`
- `src/lib/models/types.ts` — Added `extract_metrics` task type
- `src/lib/agents/unified-writer-agent.ts` — Added `extractVerifiedMetrics()` method, called in parallel during both `run()` and `runFitAnalysis()`, injected as `verifiedMetricsList` in `generateOptimizedCVData()`

**LLM Call Impact:**
- +1 LLM call per workflow, BUT runs in parallel with existing calls (zero additional latency)
- "Analyze First" flow: 4 → 5 Phase 1 calls (parallel, so same wall-clock time)
- "Apply Directly" flow: 7 → 8 total calls (parallel extraction, so same wall-clock time)

---

## PostHog Analytics Integration

**Added:** February 13, 2026

### Overview
PostHog is integrated for product analytics, session replay, and LLM cost tracking. Uses reverse proxy (`/ingest`) to bypass ad blockers.

### Architecture
- **Client-side:** `posthog-js` via `PostHogProvider` (outermost wrapper in layout) + `PostHogPageView` for SPA pageview tracking
- **Server-side:** `posthog-node` singleton via `getPostHogServer()` for LLM analytics in API routes
- **User identification:** `posthog.identify()` on Supabase auth state change, `posthog.reset()` on sign out

### Environment Variables
- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` — `https://us.i.posthog.com`

### Files
| File | Purpose |
|------|---------|
| `src/providers/PostHogProvider.tsx` | Client-side PostHog init with reverse proxy, session replay, manual pageview |
| `src/providers/PostHogPageView.tsx` | SPA pageview tracking via `usePathname`/`useSearchParams` |
| `src/lib/posthog-server.ts` | Server-side singleton (`flushAt: 1`, `flushInterval: 0` for Vercel serverless) |
| `next.config.ts` | Reverse proxy rewrites (`/ingest/*` → PostHog) |
| `src/app/layout.tsx` | PostHogProvider wraps all other providers |
| `src/contexts/AuthContext.tsx` | `posthog.identify()` on login, `posthog.reset()` on logout |
| `src/components/ChatPanel.tsx` | Frontend events: `jd_pasted`, `fit_analysis_viewed`, `apply_clicked`, `application_generated`, `new_application_started` |
| `src/components/EmailPanel.tsx` | Frontend events: `document_copied`, `regeneration_requested` |
| `src/app/api/agent-v2/route.ts` | LLM analytics: `$ai_generation` events with token counts, cost estimates per step |
| `src/app/api/regenerate/route.ts` | LLM analytics for regeneration: `regen_cover_letter`, `regen_email`, `regen_follow_up_email` |

### Frontend Events Tracked
| Event | Location | Properties |
|-------|----------|------------|
| `jd_pasted` | ChatPanel | `jd_length`, `mode` |
| `fit_analysis_viewed` | ChatPanel | `fit_score`, `fit_level`, `matching_skills_count`, `missing_skills_count`, `job_title`, `company` |
| `apply_clicked` | ChatPanel | `mode` |
| `application_generated` | ChatPanel | `mode`, `job_title`, `company`, `match_score` |
| `new_application_started` | ChatPanel | — |
| `document_copied` | EmailPanel | `document_type` (`email`, `email_body`, `follow_up_email`) |
| `regeneration_requested` | EmailPanel | `section` (`email`, `follow_up_email`) |

### LLM Analytics (Server-Side)
Every agent step emits `$ai_generation` with: `$ai_provider`, `$ai_model`, `$ai_input_tokens`, `$ai_output_tokens`, `step`, `total_tokens`, `estimated_cost_usd`. Tracked at the route level via `trackLLMStep` helper (not inside the agent itself).

### Not Implemented (by design)
- **`@posthog/ai`** — skipped due to known Anthropic streaming bugs
- **Feature flags / A/B testing / surveys** — not needed yet
- **`cv_uploaded` event** — requires adding tracking to the document upload component (future)
- **`plan_selected` / `payment_completed`** — requires adding tracking to pricing/Stripe components (future)

---

## Deep Clean & Audit (Completed)

**Date:** June 2025

A comprehensive codebase audit was performed to eliminate technical debt. The following categories of dead code were identified and removed:

### Deleted Orphaned Source Files (14 files, 2,364 lines)
| File | Lines | Reason |
|------|-------|--------|
| `src/lib/types.examples.ts` | 153 | Demo/example file, never imported |
| `src/lib/cv-extractor.ts` | 102 | Legacy extractor, superseded by unified agent |
| `src/lib/utils/password-strength.ts` | 66 | Never imported, Supabase handles auth |
| `src/lib/utils/session-cleanup.ts` | 149 | Never imported anywhere |
| `src/lib/cv-templates/font-standards.ts` | 174 | Never imported, templates use Tailwind |
| `src/lib/config/design-tokens.ts` | 170 | Never imported, app uses Tailwind config |
| `src/lib/utils/file-validation.ts` | 112 | Never imported, inline validation used |
| `src/lib/utils/document-parser.ts` | 171 | Never imported, API called directly |
| `src/lib/utils/pdf-generator.ts` | 222 | Never imported, pdf-lib used directly |
| `src/utils/helpers.ts` | 136 | Never imported, generic utils |
| `src/components/PDFViewer.tsx` | 54 | Never imported |
| `src/lib/prompts.ts` | 643 | Legacy prompts from old multi-agent architecture |
| `src/types/agent.ts` | 174 | Duplicate of `src/lib/agents/types.ts`, zero imports |
| `src/lib/supabase/middleware.ts` | 38 | Never imported, no root middleware |

### Deleted Orphaned Public Assets (6 files)
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` — Next.js boilerplate, never referenced
- `public/Wasim.png` — Unused duplicate; `wasim-founder.jpg` is the one actually used

### Deleted Empty Directories (2)
- `Assets/`, `Blog-1/`

### Deleted Obsolete Documentation (13 files, 4,633 lines)
| File | Lines | Reason |
|------|-------|--------|
| `OBSOLETE_FILES_REPORT.md` | 222 | Meta-report, itself obsolete |
| `AGENT_FLOW_AUDIT.md` | 201 | One-time audit, findings in CLAUDE.md |
| `ALL_TASKS_TRACKER.md` | 425 | All tasks 101% complete |
| `ANALYZE_FIRST_FLOW_BUGS.md` | 80 | All bugs fixed |
| `ATS_COMPATIBILITY_AUDIT.md` | 675 | One-time audit, findings implemented |
| `CHANGELOG-follow-up-email.md` | 110 | Documented in CLAUDE.md |
| `FIT_ANALYSIS_IMPLEMENTATION_PLAN.md` | 227 | Feature fully shipped |
| `FIT_ASSESSMENT_AUDIT.md` | 231 | Findings implemented as anti-hallucination rules |
| `KARKO_AI_BUGFIX_GUIDE_v3.1.md` | 504 | All bugs resolved |
| `Karko_ai-implementation-guide-v2.md` | 380 | All fixes implemented, model migrated |
| `karko_ai_prompts_export.md` | 552 | Haiku→Sonnet migration complete |
| `karko_sonnet_migration_implementation.md` | 505 | Migration complete |
| `docs/cv-template-i18n-findings.md` | 521 | i18n findings implemented |

### Remaining Documentation (kept)
- `CLAUDE.md` — Canonical state doc (this file)
- `README.md` — Project overview
- `SETUP.md` — Setup instructions
- `INSTALLATION_STEPS.md` — Install checklist
- `SUPABASE_SCHEMA_GUIDE.md` — DB schema reference
- `SUPABASE_SETUP_GUIDE.md` — OAuth/MFA setup
- `STRIPE_SETUP_GUIDE.md` — Stripe integration

### Large File Refactoring (Completed Feb 14, 2026)

All 4 large files split into focused modules. Zero regressions (`npx tsc --noEmit` = 0 errors).

| File | Before | After | Reduction | New Modules |
|------|--------|-------|-----------|-------------|
| `unified-writer-agent.ts` | 2,600 | 908 | 65% | context-builder.ts, prompts/cv-prompt.ts, prompts/cover-letter-prompt.ts, prompts/email-prompts.ts, prompts/fit-assessment-prompt.ts |
| `parse-optimized-cv.ts` | 963 | 125 | 87% | section-splitter.ts, parse-experience.ts, parse-education.ts, parse-skills.ts, parse-other.ts |
| `cv-templates/types.ts` | 1,026 | 570 | 44% | validation.ts, text-analysis.ts |
| `ChatPanel.tsx` | 1,076 | 453 | 58% | chat/useAgentWorkflow.ts |
| **Total** | **5,665** | **2,056** | **64%** | **13 new modules** |

Full details in `REFACTORING_PROGRESS.md`.

---

## Contact Form & Resend Integration

**Added:** February 14, 2026

### Overview
Contact form on `/contact` page saves submissions to Supabase and sends email notifications via Resend API.

### Architecture
- **Frontend:** `src/app/contact/page.tsx` — Contact form with validation
- **Backend:** `src/app/api/contact/route.ts` — Handles form submission, saves to DB, sends email
- **Database:** `contact_submissions` table in Supabase
- **Email Service:** Resend API for email notifications

### Environment Variables
- `RESEND_API_KEY` — Resend API key for sending emails
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key for DB writes

### Database Table
Table: `contact_submissions`
- Stores: name, email, subject, message, submitted_at
- RLS enabled: Anyone can insert (public form), only authenticated users can view
- Indexes on `submitted_at` and `email` for performance

### Email Notifications
- **From:** `onboarding@resend.dev` (Resend default sender)
- **To:** `wasim@karkoai.com`
- **Subject:** `KarKo AI Contact: [subject]`
- **Content:** Professional HTML template with contact details
- **Error handling:** Form succeeds even if email fails (non-blocking)

### Files
| File | Purpose |
|------|---------|
| `src/app/contact/page.tsx` | Contact form UI with email display (wasim@karkoai.com) |
| `src/app/api/contact/route.ts` | API route with Supabase save + Resend email |
| `supabase/migrations/create_contact_submissions.sql` | SQL migration for table creation |
| `src/components/marketing/Footer.tsx` | Email link (wasim@karkoai.com) |

### Migration
Run the SQL migration in Supabase SQL Editor:
```bash
supabase/migrations/create_contact_submissions.sql
```

---

## Prompt Caching Audit — Claude Sonnet 4.6

**Date:** February 18, 2026

### Summary
Prompt caching is **correctly configured for the direct Anthropic API path** but **has no effect on the Amazon Bedrock path** (production). Sonnet 4.6 is confirmed supported for caching on the direct API but is **not yet listed** in the AWS Bedrock prompt caching supported models table as of Feb 2026.

### What IS Correctly Configured ✅
- **`cache_control: { type: 'ephemeral' }` syntax** — correct for Anthropic API
- **Minimum token threshold** — Sonnet 4.6 requires 1,024 tokens min. CV prompt (~3,000+ tokens) and cover letter prompt (~1,500+ tokens) both exceed this ✅
- **Cache breakpoint placement** — static system blocks first, `cache_control` at end of static block, dynamic user prompt after ✅
- **Cache metrics tracking (non-streaming)** — `cache_creation_input_tokens` and `cache_read_input_tokens` correctly read from response ✅
- **Cache metrics tracking (streaming)** — **Fixed Feb 18, 2026** — streaming path now also captures cache tokens from `message_start` event

### What Is NOT Working ⚠️
- **Bedrock path does NOT support Sonnet 4.6 caching** — AWS Bedrock prompt caching supported models table (as of Feb 2026) only lists up to Sonnet 4.5. `claude-sonnet-4-6` is not listed. The `cache_control` blocks are silently ignored on Bedrock — no error, no cache savings.
- **`BedrockBearerTokenClient` strips `cache_control`** — intentional, since Bedrock Converse API uses a different format. When Bedrock adds Sonnet 4.6 caching support, this client will need updating.
- **Fit assessment, email, follow-up email prompts** — use plain `systemPrompt` strings (no `systemBlocks`), so no caching even on direct API. These are candidates for future caching optimization.

### Which Calls Use Caching (Direct API only)
| Task | Caching | System Prompt Size |
|------|---------|-------------------|
| `optimize_cv` | ✅ `systemBlocks` with `cache_control` | ~3,000+ tokens |
| `write_cover_letter` | ✅ `systemBlocks` with `cache_control` | ~1,500+ tokens |
| `fit_assessment` | ❌ plain `systemPrompt` string | ~500 tokens |
| `write_email` | ❌ plain `systemPrompt` string | ~800 tokens |
| `write_follow_up_email` | ❌ plain `systemPrompt` string | ~600 tokens |
| All context-builder tasks | ❌ plain `systemPrompt` string | small |

### Pricing Impact (Direct API, when caching works)
- Cache write: 1.25× base input price (one-time per 5 min window)
- Cache read: 0.1× base input price (90% discount on cached tokens)
- For CV optimization: ~3,000 tokens cached → saves ~$0.008 per cache hit at Sonnet 4.6 pricing

### Action Required
- **Monitor AWS Bedrock release notes** for Sonnet 4.6 prompt caching support. When added, update `BedrockBearerTokenClient` to pass `cache_control` in the Bedrock format.
- No code changes needed for direct API path — caching is correctly implemented.

### Files
- `src/lib/models/anthropic.ts` — `callAnthropic()` (non-streaming) and `callAnthropicStream()` (streaming, fixed Feb 18)
- `src/lib/agents/prompts/cv-prompt.ts` — `buildCVOptimizationSystemBlocks()` with `cache_control`
- `src/lib/agents/prompts/cover-letter-prompt.ts` — `buildCoverLetterSystemBlocks()` with `cache_control`

---

## CV Template Font Standardization

**Date:** February 17, 2026

### Problem
CV templates used inconsistent fonts with misleading Google Fonts references that weren't loaded, causing visual inconsistency and potential ATS parsing issues. The user preferred the clean, premium look of the default (Premium ATS) and executive templates but wanted all templates to match.

### Solution Implemented
Standardized all CV templates to use system fonts only:
- **Body text:** `Arial, Helvetica Neue, Helvetica, sans-serif`
- **Headers (name, job title, section headers):** `Georgia, Times New Roman, serif`

### Templates Updated
| Template | Body (before → after) | Headers (before → after) | Notes |
|----------|----------------------|--------------------------|-------|
| **USPremiumATSTemplate** | Arial → Arial (no change) | Georgia → Georgia (no change) | Reference standard — already perfect |
| **USProfessionalTemplate** | Source Sans Pro → Arial | Merriweather+Georgia → Georgia | Cleaned up misleading Google Fonts stack |
| **USModernATSTemplate** | Roboto → Arial | Roboto → Georgia | Added Georgia to all headers (H1, currentTitle, all H2s) |
| **GermanATSTemplate** | Arial → Arial (no change) | Arial → Georgia | Added Georgia to all headers (H1, currentTitle, all H2s) |

### Why This Is ATS-Optimized
- **Arial and Georgia are system fonts** — available on every Windows/Mac without CDN dependencies
- **Maximum ATS compatibility** — both fonts are top-tier recommended in 2026 ATS guides
- **Clean visual hierarchy** — sans-serif body for scannability, serif headers for emphasis
- **Zero embedding issues** — no external font loading failures

### Files Modified
- `src/components/cv-templates/USModernATSTemplate.tsx`
- `src/components/cv-templates/GermanATSTemplate.tsx`
- `src/components/cv-templates/USProfessionalTemplate.tsx`

---

## FIT Assessment Optimization — Industry-Aligned Scoring

**Date:** February 18, 2026

### Problem Statement
The original FIT scoring system was overly conservative, with harsh penalties that didn't align with industry ATS standards. Key issues:
1. **Too conservative ranges** - 40-79% labeled as "good" (industry: 70%+ is genuinely competitive)
2. **Harsh caps** - max score capped at 50-55% even with transferable skills
3. **Under-weighted nice-to-haves** - only +5 for 2+ nice-to-haves (should be +2 per skill up to +10)
4. **Conflicting matching rules** - both "strict" and "semantic" rules created confusion
5. **Narrow adjustment range** - max ±10 points insufficient for real-world variation

### Research & Findings
Industry research (Recruiterflow, ZYTHR, x0pa, Weekday, JobQuest) confirmed:
- **85-100%**: Excellent/Strong match - highly competitive
- **70-84%**: Good match - genuinely competitive, industry standard for ATS advancement
- **55-69%**: Fair match - notable gaps but worth applying with preparation
- **<55%**: Weak match - significant gaps, upskilling recommended
- **Skills weighting**: 40% must-haves, 30% experience, 15% nice-to-haves, 10% transferable, 5% readiness
- **Nice-to-haves bonus**: +2 per skill (max +10) to reward competitive differentiation

### Changes Implemented

#### 1. Updated Score Calculation (`context-builder.ts`)
**New 5-step methodology:**
- **Step 1**: Must-have match rate with tiered scoring (MET=1.0, PARTIAL=0.6, MISSING=0.0)
- **Step 2**: Nice-to-have bonus (+2 per skill, max +10 points)
- **Step 3**: Experience & transferable skills adjustments (±10 points total)
- **Step 4**: Smart caps & floors (less harsh, allow transferable potential)
- **Step 5**: Industry-aligned labels (85%+ strong, 70-84% good, 55-69% fair, <55% weak)

**Improved matching hierarchy:**
- **Tier 1**: Explicit skill match (highest confidence) - exact skill name in CV
- **Tier 2**: Semantic match (medium confidence) - cross-language, broader/narrower equivalents
- **Tier 3**: Experience-based match (lower confidence) - clear repeated evidence only

#### 2. Updated Fit Level Thresholds
**Old thresholds:**
- Strong: 80%+
- Good: 40-79%
- Weak: <40%

**New thresholds (industry-aligned):**
- Strong: 85-100% (highly competitive, excellent match)
- Good: 70-84% (solid match, genuinely competitive)
- Fair: 55-69% (notable gaps but worth applying)
- Weak: <55% (significant gaps, upskilling recommended)

#### 3. Enhanced System Prompts
**Skill matching system prompt** - Now emphasizes:
- ATS calibration: 70%+ means genuinely competitive
- Tier-based hierarchy: explicit > semantic > experience-based
- Balance: neither overly harsh nor artificially generous
- Transferable skills: don't undervalue adjacent domain experience

**Fit assessment system prompt** - Now includes:
- Industry calibration principles (70% = competitive, not "barely acceptable")
- Balanced honesty (recognize transferable value, not just gaps)
- Must-have vs nice-to-have clarity
- Encouraging realism (mentor tone, honest but supportive)

#### 4. Type System Updates
- Added `'fair'` to `fitLevel` type in `types.ts`
- Updated `computeFitLevel()` function with new thresholds and documentation
- Added 🟠 orange emoji for fair fit level in UI (`useAgentWorkflow.ts`)

### Files Modified
| File | Changes |
|------|---------|
| `src/lib/agents/context-builder.ts` | New 5-step scoring methodology, tier-based matching hierarchy, improved system prompt |
| `src/lib/agents/prompts/fit-assessment-prompt.ts` | Updated thresholds (85/70/55), new weighting framework, industry-calibrated system prompt, `computeFitLevel()` with 4 levels |
| `src/lib/agents/types.ts` | Added `'fair'` to fitLevel type |
| `src/components/chat/useAgentWorkflow.ts` | Added fair fit level display logic with 🟠 emoji |

### Impact
- **More realistic scores**: 70%+ now correctly represents competitive candidates
- **Better nice-to-have recognition**: +2 per skill (max +10) vs. flat +5 bonus
- **Clearer matching logic**: Tier-based hierarchy eliminates confusion
- **Less harsh penalties**: Transferable skills properly valued, floors at 60% vs 50%
- **Industry alignment**: Matches ATS standards where 70%+ advances to human review

### Calibration Principle
A 70% score now means the candidate is **genuinely competitive** for the role, not "barely acceptable." The system is optimized for Claude Sonnet 4.6's reasoning capabilities with clear, hierarchical instructions and industry-backed methodology.

---

## Changelog

| Date | Change | Files | Details |
|------|--------|-------|---------|
| Feb 10, 2026 | Fit assessment: separate sections with char limits | unified-writer-agent.ts | Per-section character limits: verdict 150, strengths 250, gaps 250, recommendation 200 chars. 2-3 bullets, 12 words max. Blank lines between sections. |
| Feb 10, 2026 | Fit assessment: improved display formatting | ChatPanel.tsx | Matching/missing skills in separate paragraphs, max 10 skills shown, count headers, (+N more) overflow |
| Feb 10, 2026 | Primary email: JD-relevance fix | unified-writer-agent.ts | Added matching skills, top JD requirements, key responsibilities to email prompt. Added JOB-RELEVANCE PRIORITY rule. |
| Feb 10, 2026 | Email: fit score prohibition | unified-writer-agent.ts | Fit score marked as INTERNAL CONTEXT ONLY in prompt. Added to PROHIBITIONS list. Never included in email output. |
| Feb 10, 2026 | Agent flow audit | AGENT_FLOW_AUDIT.md | Confirmed context IS preserved between fit analysis and generation. No duplicate API calls. In-memory cache with 30-min TTL. |
| Feb 10, 2026 | State docs cleanup | Removed STATE_TRACKER.md, COMPONENTS_STATE_DOCS.md | CLAUDE.md is the ONLY state documentation file |
| Feb 11, 2026 | Hero copy rewrite | page.tsx | Title shortened to 9 words ("Get Your Complete Job Application Package in 90 Seconds"). Subtitle starts with user action, names all 4 deliverables. Trust badges expanded from 2 to 3 (added "No sign-up required" middle badge with Shield icon). |
| Feb 11, 2026 | CV anti-hallucination fix: JD numbers | unified-writer-agent.ts | Removed ALLOWED example that permitted JD numbers in CVs. Added RULE 4d: JD numbers forbidden. Added NOT ALLOWED examples for JD-sourced numbers. Added pre-bullet metric verification checklist. |
| Feb 11, 2026 | CV anti-hallucination fix: fabricated metrics | unified-writer-agent.ts | Root cause: quality_standard ("where possible") and bullet format ("when available") pressured LLM to invent numbers. Fixed: "ONLY when exact numbers exist in source CVs". Added: "a bullet without metrics is ALWAYS better than a bullet with a fabricated metric". |
| Feb 11, 2026 | Metric hallucination fix: Layer 1 prompt | unified-writer-agent.ts | Replaced "high-impact" with "strong, accurate" in bullet requirements. Added numberless bullet examples to Rule 4b. Replaced CAR Method with "Action → Impact" format. Added normalizing statement that most bullets won't have numbers. |
| Feb 11, 2026 | Metric hallucination fix: Layer 2 structural | unified-writer-agent.ts, types.ts, models/types.ts | Added verifiedMetrics extraction during Phase 1 (parallel with applicant/JD extraction). Injected as binding constraint in CV generation prompt. Mirrors verified skills architecture. |
| Feb 11, 2026 | EmailPanel: mailto → copy buttons | EmailPanel.tsx | Replaced Primary/Follow-Up mailto buttons with copy-to-clipboard buttons. Copy icon instead of Mail/Clock. Tooltips: "Copy full primary email" / "Copy full follow-up email". Copies subject + body. Removed openMailto function. |
| Feb 12, 2026 | Education field mapping fix | unified-writer-agent.ts | Root cause: AI prompt lacked clear field definitions for education entries, causing institution/degree swap and dates/status crammed into wrong fields. Fix: Added explicit EDUCATION FIELD MAPPING rules with examples for university, bootcamp, high school, and online certificate. Added COMMON MISTAKES TO AVOID section. Updated JSON schema with descriptive field comments. |
| Feb 12, 2026 | Agent steps: combine email + follow-up | unified-writer-agent.ts, route.ts, AgentProgressV2.tsx | Merged email and follow-up email into one visible step "Generating Email + Follow-Up". Removed separate follow_up_email step from workflow lists and index functions. Step stays active until both email and follow-up are generated. |
| Feb 12, 2026 | Changes tab: persist to Supabase | useSupabaseSync.ts | Root cause: optimizedCVData (containing analysis/key_changes/ats_compatibility) was never saved to Supabase. Fix: Embedded as _optimizedCVData inside generated_cv JSONB column on save. Restored on load. No schema change needed. Also fixes education data loss on refresh (Issue 4). |
| Feb 12, 2026 | CV panel: fix tab sticking after edit | CVPanel.tsx | Root cause: editedCVData persisted across Original/Optimized tab switches. Fix: Clear editedCVData when switching tabs. |
| Feb 12, 2026 | Fit assessment: reduce skills shown | ChatPanel.tsx | Reduced MAX_SKILLS_SHOWN from 10 to 6 for more concise fit assessment display. Total count still shown in header. |
| Feb 12, 2026 | Stripe: fix credit amounts | webhook/route.ts, stripe.ts | Fixed critical credit mismatches: Plus 160→120, Pro 300→240, Starter downgrade 10→40. All handlers (subscription update, payment succeeded, cancel) now match actual Stripe products. |
| Feb 12, 2026 | Stripe: add refund handler | webhook/route.ts | Added charge.refunded webhook handler. Handles subscription refunds (removes monthly/rollover credits proportionally) and add-on refunds (removes addon credits). Full + partial refunds supported. Logs to credit_transactions. |
| Feb 12, 2026 | Stripe: debug checkout 500 error | create-checkout/route.ts, create-addon-checkout/route.ts | Added detailed error logging with env var validation. Removed deprecated payment_method_types param. Error responses now include actual Stripe error message. |
| Feb 12, 2026 | Homepage pricing → Stripe checkout | page.tsx, HomePricingButtons.tsx | Created client component for Get Plus/Get Pro buttons on homepage. Logged-in users go directly to Stripe checkout; anonymous users go to signup with plan param. |
| Feb 12, 2026 | Stripe promo codes enabled | create-checkout/route.ts, create-addon-checkout/route.ts | Added allow_promotion_codes: true to both subscription and addon checkout sessions. Users can now enter promo codes (e.g., KARKOLAUNCH) during Stripe checkout. |
| Feb 12, 2026 | Subscription upgrade/downgrade UI | SubscriptionSection.tsx | Fixed maxCredits (160/300→120/240). Added upgrade/downgrade buttons in Compare Plans: Starter→Upgrade, Plus→Upgrade to Pro, Pro→Downgrade to Plus (via Stripe portal). Desktop cards now show Current Plan badge + action buttons. |
| Feb 12, 2026 | Bug fix: context cache miss in Analyze First flow | route.ts, ChatPanel.tsx | Root cause: in-memory Map cache doesn't survive dev hot-reloads or serverless cold starts. Fix: Client stores full parsed context from fit_analysis_complete, sends it back with generate_with_context request. Server reconstructs MasterContext from client data on cache miss. |
| Feb 12, 2026 | Bug fix: email hallucination (fabricated skills/companies) | unified-writer-agent.ts | Root cause: Email prompt only received 500 chars of CV (vs full CV for cover letter) + had 2-sentence anti-hallucination rules (vs cover letter's 5-rule system). Fix: Removed 500-char truncation, added full VERIFIED SKILL CONSTRAINT section, added VERIFIED METRICS constraint, strengthened system prompt with 5 matching rules including INDUSTRY & COMPANY ACCURACY. |
| Feb 12, 2026 | Follow-up email: anti-hallucination parity | unified-writer-agent.ts | Strengthened follow-up email from 3-line anti-hallucination section to full 5-rule system (SOURCE VERIFICATION, METRIC ACCURACY, COMPANY ACCURACY, SKILL CONSTRAINT, VERIFICATION CHECK). Rules scoped to follow-up's specific sources (key_achievement, company_context, primary_email). |
| Feb 13, 2026 | Cover letter: language-conditional header | unified-writer-agent.ts | EN market: removed company address and bracketed placeholders. DE market: kept full formal Anschreiben format with company address. |
| Feb 13, 2026 | PostHog analytics integration | PostHogProvider.tsx, PostHogPageView.tsx, posthog-server.ts, layout.tsx, next.config.ts, AuthContext.tsx, ChatPanel.tsx, EmailPanel.tsx, agent-v2/route.ts, regenerate/route.ts | Full PostHog integration: client-side provider with reverse proxy (/ingest), SPA pageview tracking, session replay, user identification via Supabase auth, frontend event tracking (jd_pasted, fit_analysis_viewed, apply_clicked, application_generated, new_application_started, document_copied, regeneration_requested), server-side LLM analytics ($ai_generation events with token counts and cost estimates per agent step), regeneration tracking. |
| Feb 14, 2026 | Large file refactoring (all 4) | 13 new modules created, 4 files refactored | Split unified-writer-agent.ts (2,600→908), parse-optimized-cv.ts (963→125), cv-templates/types.ts (1,026→570), ChatPanel.tsx (1,076→453). Total: 5,665→2,056 lines (64% reduction). Zero regressions. Pure code movement, no logic changes. |
| Feb 14, 2026 | Contact form + Resend integration | contact/page.tsx, api/contact/route.ts, create_contact_submissions.sql | Added contact form with Supabase storage and Resend email notifications. Updated email from hello@karkoai.com to wasim@karkoai.com across all pages (Footer, Contact, Imprint, Terms, Privacy). Created contact_submissions table with RLS policies. |
| Feb 17, 2026 | Cover letter: JD contextual detail rule | cover-letter-prompt.ts | Added `<jd_contextual_detail_rule>` to system prompt: instructs model to reference 2-3 specific operational details from the JD (budgets, team sizes, reporting lines, company metrics) to demonstrate the applicant read the posting. Includes anti-hallucination boundary (employer context ≠ applicant achievement). |
| Feb 17, 2026 | Regeneration: anti-hallucination parity fix | regenerate/route.ts, CoverLetterPanel.tsx | Root cause: regeneration route omitted masterCV, verifiedMetrics, match, and userLanguageOverride when building MasterContext, so cover letter regen had no Master CV to verify skills against and no missing-skills constraint list. Fix: Pass all four fields through in route.ts. Frontend now sends masterCV.rawText and match data (score, matchingSkills, missingSkills) from stores. |
| Feb 17, 2026 | Pricing cards redesign: value-focused 6-line cards | pricing/page.tsx, page.tsx, HomePricingButtons.tsx, TimeSavingsCalculator.tsx | Replaced 13-15 feature list pricing cards with 6-line value-focused cards (5 checkmark features + 1 hours-saved line with clock icon). Removed "EVERY PLAN, SAME POWER" badge bar. Added credit count pill badges below price (40/120/240 credits/month) with tier-colored styling. Added hours-saved emotional anchor line with tier-specific styling (cream/gold/navy). Redesigned Time Savings Calculator with warm cream/gold palette (cream-50 bg, white card, gold accents, navy highlight on hours-saved stat). Created shared TimeSavingsCalculator client component. Added Time Savings Calculator to homepage below pricing cards. Updated homepage pricing from simplified cards to full value-focused cards matching pricing page. Fixed cursor-pointer on HomePricingButtons (Plus/Pro). Kept add-on credit dropdown on Plus/Pro (pricing page only). |
| Feb 17, 2026 | CV Template Font Standardization | USModernATSTemplate.tsx, GermanATSTemplate.tsx, USProfessionalTemplate.tsx | Standardized all templates to system fonts: Arial body + Georgia headers. Removed misleading Google Fonts references. ATS-optimized font stack for maximum compatibility. |
| Feb 17, 2026 | Homepage sections redesign: merge + reorder | page.tsx | Merged "Built Different" (cold navy) + "Complete Package" (repetitive) into single "What You Get" section with warm cream/gold palette. Swapped CTA above Master CV for conversion momentum. Removed unused CountUp import. |
| Feb 17, 2026 | Homepage: expand 3 steps into full sections | page.tsx | Replaced compact 3-column step cards + separate "What You Get" section (repetitive) with 3 expanded step sections. Step 1: Upload Your CV (2-col with extraction details). Step 2: Paste Any Job Description (2-col reversed with AI analysis details). Step 3: Get Four Ready-to-Send Documents (4 deliverable cards + trust signals). Removed all em dashes from user-facing text. Simplified titles to plain language. |
| Feb 18, 2026 | FIT assessment optimization: industry-aligned scoring | context-builder.ts, fit-assessment-prompt.ts, types.ts, useAgentWorkflow.ts | **Root cause**: Overly conservative scoring (40-79% = "good"), harsh caps (max 50-55%), under-weighted nice-to-haves (+5 flat), conflicting matching rules. **Research**: Industry standards show 70%+ = genuinely competitive, 85%+ = strong. **Fix**: New 5-step scoring (base + nice-to-haves +2 each max +10 + experience ±10 + smart caps/floors + industry labels). Updated thresholds: 85%+ strong, 70-84% good, 55-69% fair, <55% weak. Tier-based matching hierarchy (explicit > semantic > experience-based). Enhanced system prompts for Claude Sonnet 4.6 with ATS calibration principles. Added 'fair' fit level with 🟠 emoji. Now matches industry ATS standards where 70%+ advances to human review. |
| Feb 18, 2026 | Agent processing UI: premium color palette | AgentProgressV2.tsx, KarkoAIStepIndicator.tsx, ChatPanel.tsx | **Root cause**: Navy blue processing states (navy-50/navy-200 backgrounds, navy-600 icons) felt cold, less premium compared to warm gold/cream completion states. **Fix**: Replaced with warm cream tones across all processing states - cream-100 background, cream-300 border, cream-200 icon backgrounds, gold-500 spinner icons. Processing labels now gold-600 for consistency. Creates cohesive warm color journey: cream (processing) → gold (complete). Applied to AgentProgressV2 (chat panel steps), KarkoAIStepIndicator (CV/Cover Letter/Email panels), and immediate loading indicators. Added auto-scroll when agent starts working for better visibility. |
| Feb 18, 2026 | Download filename improvements | CVPanel.tsx, CoverLetterPanel.tsx | **Root cause**: CV downloaded with generic "fullName - Resume" title; cover letter had no applicant name in filename. **Fix**: Smart filename logic — Original CV: `{ApplicantName}_CV.pdf`; Optimized CV: `{ApplicantName}_{CompanyName}_CV.pdf`; Cover Letter (PDF + DOCX): `{ApplicantName}_{CompanyName}_Cover_Letter.pdf/.docx`. Applicant name sourced from: letter address → signature → structuredCV.personal.fullName → 'Applicant'. Company name sourced from: letter company address → currentSession.company → 'Company'. **i18n decision**: Always English labels (CV, Cover_Letter) — filenames are filesystem artifacts, English is the global standard recruiters recognize regardless of document language. Special chars sanitized to underscores. |
| Feb 19, 2026 | Fix Stripe webhook sync — subscriptions not applying to user_credits | src/app/api/stripe/webhook/route.ts, src/app/settings/page.tsx, supabase/migrations/fix_stripe_webhook_sync.sql | **Root cause (Bug 1 — critical):** Stripe fires `customer.subscription.created` BEFORE `checkout.session.completed`. `handleSubscriptionUpdate` looked up user by `stripe_customer_id` which hadn't been saved yet → user not found → plan never updated. **Root cause (Bug 2 — critical):** `handleCheckoutCompleted` saved Stripe IDs but never wrote `plan_tier` or `monthly_credits` → user stayed on starter/0 credits even after successful payment. **Fix 1:** `handleCheckoutCompleted` now reads `session.metadata.planTier` and maps it to credits (plus=120, pro=240), then updates `plan_tier` + `monthly_credits` + Stripe IDs in one authoritative write. **Fix 2:** `handleSubscriptionUpdate` now falls back to `subscription.metadata.userId` when `stripe_customer_id` lookup fails (race condition), then persists the customer ID for future lookups. **Fix 3:** `handlePaymentSucceeded` and `handleChargeRefunded` fixed stale `40` → `10` for starter credits. **Fix 4:** `settings/page.tsx` now polls `getUserCredits` for up to 12s after checkout redirect (`?success=true`) so the upgraded plan reflects immediately in the UI without a manual page refresh. **Migration:** `fix_stripe_webhook_sync.sql` — diagnostic SELECT + commented UPDATE templates to manually repair any users stuck on starter after a successful Stripe checkout (instructs user to also resend missed webhook events via Stripe dashboard). |
| Feb 19, 2026 | Insufficient credits modal + settings subscription redesign | InsufficientCreditsModal.tsx (new), useAgentWorkflow.ts, ChatPanel.tsx, SubscriptionSection.tsx | **New**: `InsufficientCreditsModal` — shown when user has insufficient credits mid-workflow. Displays Plus and Pro cards in website pricing style (badges, icons, taglines, features, hours-saved line, CTA buttons). Triggers Stripe checkout directly. **Wire-up**: `useAgentWorkflow` now accepts `onInsufficientCredits` callback; detects `data.code === 'INSUFFICIENT_CREDITS'` SSE event in both `runFitAnalysisFlow` and `runAgentWorkflow` and fires callback instead of chat error message. `ChatPanel` wires callback → modal state. **Settings redesign**: `SubscriptionSection` Compare Plans section updated to match website pricing design — icons per plan, taglines, expanded 6-feature lists, hours-saved line, `Get Plus →` / `Get Pro →` CTAs, credit pill badges. |
| Feb 19, 2026 | Fix starter credits 40→10 for new users | supabase/migrations/fix_starter_credits_10.sql | **Root cause**: `initialize_user_credits()` DB trigger was hardcoded to 40 credits (from `pricing_redesign_v5_2.sql`). TypeScript fallback in `credits.ts:205` correctly uses 10 but the DB trigger always runs first, so new signups received 40. **Fix**: Updated `subscription_plans.credits_monthly = 10` for starter tier; recreated `initialize_user_credits()` trigger with 10 credits. |
| Feb 19, 2026 | Fix signup 500 "Database error saving new user" | supabase/migrations/fix_signup_triggers.sql | **Root cause**: `handle_new_user()` and `initialize_user_credits()` DB trigger functions had zero exception handling. Any error in the trigger chain (FK violation on `user_credits.plan_tier → subscription_plans.tier`, missing row, constraint issue) propagated to `auth.users` INSERT → Supabase returned 500. **Fix**: Added `EXCEPTION WHEN OTHERS THEN RAISE LOG` to both trigger functions; added `ON CONFLICT (id) DO NOTHING` to profile insert; added self-healing guard in `initialize_user_credits` to upsert 'starter' plan before inserting credits; re-attached both triggers. **Bonus fix**: Updated `credit_transactions` CHECK constraint to include `'full_application'`, `'fit_analysis'`, `'cv_optimization'`, `'follow_up_regen'` which the app uses but were missing from the original constraint. **Migration**: `supabase/migrations/fix_signup_triggers.sql` — run in Supabase SQL Editor. |
| Jun 2025 | Deep Clean & Audit | 35 files deleted, CLAUDE.md updated | Removed 14 orphaned source files (2,364 lines), 6 orphaned public assets, 2 empty directories, 13 obsolete .md docs (4,633 lines). Total: ~7,000 lines of dead code/docs removed. Zero regressions. |
