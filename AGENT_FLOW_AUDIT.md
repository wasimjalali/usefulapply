# Karko AI — Unified Agent Flow Audit

**Date:** February 10, 2026  
**Auditor:** Cascade AI  
**Scope:** End-to-end flow for "Analyze First" and "Apply Directly" modes, context preservation, and API call efficiency.

---

## 1. Architecture Overview

### Two User Modes (set in ChatPanel via `applicationMode`)

| Mode | Description | Entry Point |
|------|-------------|-------------|
| **Analyze First** | Fit analysis → user decision → generate package | `runFitAnalysisFlow()` → `runAgentWorkflow(jd, contextId)` |
| **Apply Directly** | Full optimization in one pass | `runAgentWorkflow(jd)` (no contextId) |

### Three API Actions

| Action | API Route Handler | Agent Function | LLM Calls | Credits |
|--------|-------------------|----------------|-----------|---------|
| `fit_analysis` | Phase 1 only | `unifiedWriterAgent.runFitAnalysis()` | 3 (extractApplicant, parseJD, computeSkillMatch) + 1 (fitAssessment) = **4 LLM calls** | 0.5 |
| `generate_with_context` | Phase 2 only (reuses cached context) | `unifiedWriterAgent.runWithContext()` | 4 (optimizeCV, coverLetter, email, followUpEmail) = **4 LLM calls** | 1.5 |
| `full_optimization` | Both Phase 1 + Phase 2 | `unifiedWriterAgent.run()` | **8 LLM calls** total | 1.5 (no separate fit analysis charge) |

---

## 2. "Analyze First" Flow — Detailed Trace

### Phase 1: Fit Analysis

```
User pastes JD → ChatPanel detects JD → runFitAnalysisFlow(jd)
  ↓
POST /api/agent-v2  { action: 'fit_analysis', jobDescription, currentCV, masterCV }
  ↓
API Route:
  1. Deducts 0.5 credits (FIT_ANALYSIS)
  2. Calls runFitAnalysis(input, emit)
     → extractApplicantProfile(rawCV, masterCV)    [LLM call #1]
     → parseJobDescription(jobDescription)          [LLM call #2]  (parallel with #1)
     → computeSkillMatch(applicant, job, masterCV)  [LLM call #3]
     → generateFitAssessment(context)               [LLM call #4]
  3. Returns full MasterContext with: applicant, job, match, fitAnalysis, detectedLanguage
  4. ⭐ CACHES the MasterContext server-side:
     - contextId = "ctx-{timestamp}-{random}"
     - Stored in: contextCache Map (in-memory)
     - TTL: 30 minutes
  5. Streams SSE event: { type: 'fit_analysis_complete', contextId, fitAnalysis, job, match }
  ↓
ChatPanel receives:
  - Stores contextId in state: setFitAnalysisContextId(contextId)
  - Stores JD in state: setFitAnalysisJD(jobDescription)
  - Displays fit assessment message with "Apply for This Job" / "Start New Application" buttons
```

### User Decision Point

**Option A: "Apply for This Job"**
```
handleAction('generate-full-application')
  → runAgentWorkflow(fitAnalysisJD, fitAnalysisContextId)
  ↓
POST /api/agent-v2 {
  action: 'generate_with_context',  ← contextId present, so action = 'generate_with_context'
  contextId: "ctx-...",
  jobDescription,
  currentCV, masterCV
}
  ↓
API Route:
  1. Looks up contextId in contextCache → ✅ FOUND (within 30 min TTL)
  2. Deducts 1.5 credits (FULL_APPLICATION)
  3. Calls runWithContext(cachedContext, emit)  ← REUSES Phase 1 context
     → generateOptimizedCVData(context)   [LLM call #5]
     → generateCoverLetter(context)       [LLM call #6]
     → generateApplicationEmail(context)  [LLM call #7]
     → generateFollowUpEmail(context)     [LLM call #8]
  4. Removes context from cache after use
  5. Streams: { type: 'workflow_complete', results: { ... } }
```

**Option B: "Start New Application" / "Skip"**
```
handleAction('skip-job')
  → setFitAnalysisContextId(null)
  → setFitAnalysisJD('')
  → clearCurrentSession()
  → Context is abandoned (will expire from cache in 30 min)
```

---

## 3. "Apply Directly" Flow — Detailed Trace

```
User pastes JD → ChatPanel detects JD → runAgentWorkflow(jd)  ← no contextId
  ↓
POST /api/agent-v2 {
  action: 'full_optimization',  ← no contextId, so action = 'full_optimization'
  jobDescription, currentCV, masterCV
}
  ↓
API Route:
  1. Deducts 1.5 credits (FULL_APPLICATION) — NO separate fit analysis charge
  2. Calls runJobCopilot(input, emit)  ← full Phase 1 + Phase 2
     Phase 1:
     → extractApplicantProfile    [LLM #1]
     → parseJobDescription        [LLM #2]  (parallel with #1)
     → computeSkillMatch          [LLM #3]
     Phase 2:
     → generateOptimizedCVData    [LLM #4]
     → generateCoverLetter        [LLM #5]
     → generateApplicationEmail   [LLM #6]
     → generateFollowUpEmail      [LLM #7]
  3. NO fit assessment generated (skipped in this mode)
  4. NO context cached
  5. Streams: { type: 'workflow_complete', results: { ... } }
```

---

## 4. Audit Findings

### ✅ GOOD: Context IS Preserved and Reused

The system **correctly** implements context preservation:

1. **Server-side cache** (`contextCache` Map in `route.ts` lines 40-64) stores the full `MasterContext` after fit analysis
2. **30-minute TTL** — reasonable window for user decision
3. **`generate_with_context` action** skips Phase 1 entirely — only runs Phase 2 (document generation)
4. **Context is cleaned up** after use (`removeCachedContext(contextId)` at line 360)

**Total LLM calls for "Analyze First" path: 4 (Phase 1) + 4 (Phase 2) = 8 calls**  
**Total LLM calls for "Apply Directly" path: 7 calls** (no fit assessment)

### ✅ GOOD: No Double API Calls

When user clicks "Apply for This Job", the system does NOT re-parse the CV, re-parse the JD, or re-compute skill matching. It reuses all of that from the cached context.

### ✅ GOOD: Graceful Fallback

If the context cache expires (>30 min) or is missing, the API falls back to `full_optimization` (re-runs everything). This costs 1.5 credits and the user is not stuck.

### ✅ GOOD: Credit Splitting

| Flow | Fit Analysis | Generation | Total |
|------|-------------|------------|-------|
| Analyze First → Apply | 0.5 | 1.5 | **2.0 credits** |
| Analyze First → Skip | 0.5 | 0 | **0.5 credits** |
| Apply Directly | 0 | 1.5 | **1.5 credits** |

This is fair — user pays 0.5 extra for the fit analysis, but saves 1.5 if they decide to skip.

---

## 5. Potential Issues & Risks

### ⚠️ RISK: In-Memory Cache is Not Persistent

**Problem:** `contextCache` is a plain `Map` in the API route module. In serverless environments (Vercel), the server process can be recycled between the fit analysis request and the "Apply" request. If the process restarts, the cache is lost.

**Impact:** User clicks "Apply for This Job" but the context is gone → falls back to `full_optimization` → **user pays 1.5 credits instead of benefiting from the already-paid 0.5 credit fit analysis.**

**Severity:** Medium. On Vercel with standard plans, functions can stay warm for 5-15 minutes between requests. Since user typically decides within 1-2 minutes, this usually works. But it's not guaranteed.

**Expert Solutions:**
1. **Short-term (recommended):** Keep current approach — it works for the typical use case and the fallback is graceful. Add a user-facing message when fallback occurs: "Your analysis has expired. Running a fresh optimization."
2. **Medium-term:** Use Vercel KV (Redis) or Upstash Redis to store the cached context. This survives process restarts. Cost: ~$0/month for small usage.
3. **Long-term:** Store the MasterContext in Supabase (as a temporary row with TTL) and retrieve it by contextId. Most reliable but adds DB latency.

### ⚠️ RISK: "Apply Directly" Skips Fit Assessment

**Problem:** When user selects "Apply Directly", no `fitAssessment` is generated. The `run()` method (full optimization) does NOT call `generateFitAssessment()`. This means:
- No fit score shown
- No strengths/gaps summary  
- User goes straight to document generation

**Impact:** Low — this is by design. User chose to skip analysis. But if they later want to see the fit score, they'd have to start over.

**Not a bug — just a design choice to note.**

### ⚠️ RISK: Context Cache Has No Size Limit

**Problem:** The `contextCache` Map grows unbounded if many users run fit analyses without clicking Apply or Skip. The cleanup only runs when a new context is cached (`cacheContext()` line 46-48).

**Impact:** Very low — TTL is 30 min and the cleanup runs on every cache write. Would only matter at extremely high concurrency.

---

## 6. Summary

| Question | Answer |
|----------|--------|
| Does fit analysis context get reused? | **✅ YES** — cached server-side with 30-min TTL |
| Are there double API calls? | **✅ NO** — Phase 2 reuses Phase 1 context |
| Is context cleared on "Skip"? | **✅ YES** — client clears contextId; server cache expires after 30 min |
| Is the flow optimal? | **✅ YES** — the architecture is correct and efficient |
| Any critical issues? | **⚠️ One medium risk:** in-memory cache may not survive serverless cold starts |

**Verdict: The flow is correctly implemented. No code changes needed.** The only area to monitor is the serverless cache reliability, and the recommended mitigation is Redis/KV if issues arise in production.
