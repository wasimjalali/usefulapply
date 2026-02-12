# CLAUDE.md — Karko AI Codebase Reference

> **This is the ONLY state documentation file.** Update this file whenever you make ANY changes to the codebase. Do not create separate state tracker markdown files.

## Architecture Overview

Karko AI is a Next.js 14+ application that generates optimized job application materials (CV, Cover Letter, Application Email, Follow-Up Email) using a unified AI agent architecture powered by Claude Sonnet 4.5.

### Key Directories
- `src/lib/agents/` — Unified Writer Agent (single agent handles all generation)
- `src/lib/models/` — Model configurations and task types
- `src/app/api/` — API routes (agent-v2, regenerate)
- `src/hooks/` — React hooks (useAgentV2 for SSE streaming)
- `src/store/` — Zustand stores (useSessionStore, useCVStore, useUIStore)
- `src/components/` — React components (EmailPanel, ChatPanel, etc.)

### Workflow
1. **Phase 1 (Fit Analysis):** Parse CV, analyze JD, skill matching, fit assessment (0.5 credits)
2. **Phase 2 (Generation):** Optimize CV, cover letter, application email, follow-up email (1.5 credits)

### Agent Flow (Analyze First Mode)
- Phase 1 runs `runFitAnalysis()` → context is cached server-side (`contextCache` Map, 30-min TTL)
- User sees fit assessment → clicks "Apply for This Job" or "Start New Application"
- "Apply" triggers `generate_with_context` action → reuses cached Phase 1 context (no duplicate API calls)
- "Skip" clears client state; server cache expires naturally
- If cache expires before user decides, fallback to `full_optimization` (re-runs everything)

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
- **Model:** `claude-sonnet-4-5`
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
- `src/lib/agents/unified-writer-agent.ts` — `generateFitAssessment()` prompt (lines ~848-905)
- `src/components/ChatPanel.tsx` — `fit_analysis_complete` handler (lines ~375-406)

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
- `src/lib/agents/unified-writer-agent.ts` — `generateApplicationEmail()` (lines ~1986-2130)

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
