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
- Toolbar has "Copy Primary" and "Copy Follow-Up" buttons (copy full subject + body to clipboard)
- Each email section also has individual "Copy Subject" and "Copy Body" inline buttons
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
| Feb 11, 2026 | Email toolbar: replace mailto with copy buttons | EmailPanel.tsx | Removed broken mailto "Open in Email" buttons. Replaced with "Copy Primary" and "Copy Follow-Up" toolbar buttons that copy full email (subject + body) to clipboard with 2s "Copied!" feedback. Removed `openMailto` helper and `Mail` icon import. |
