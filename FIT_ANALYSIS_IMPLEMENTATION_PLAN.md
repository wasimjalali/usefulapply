# Fit Analysis Feature - Implementation Plan

## Overview

Add a **pre-generation fit analysis step** to the agent workflow. When a user pastes a job description, instead of immediately generating the full application package, the AI first performs a quick fit assessment comparing the user's CV against the job requirements, then presents the result with action buttons to either proceed or skip.

---

## Current Flow (As-Is)

```
User pastes JD → ChatPanel detects JD → runAgentWorkflow() called immediately
  → API /api/agent-v2 (action: 'full_optimization')
    → unified-writer-agent.run()
      → Phase 1: extractApplicantProfile() + parseJobDescription() + computeSkillMatch()
      → Phase 2: generateOptimizedCVData() + generateCoverLetter() + generateApplicationEmail()
  → Credits deducted (2 credits) at start of full_optimization
  → Results streamed back → ChatPanel shows "Analysis Complete!" with View CV/CL/Email buttons
```

**Key observation:** Phase 1 (analysis + matching) already extracts the applicant profile, parses the JD, and computes a skill match score. This is exactly the data we need for fit analysis — we just need to **pause after Phase 1** and present results before continuing to Phase 2.

---

## Proposed Flow (To-Be)

```
User pastes JD → ChatPanel detects JD → runFitAnalysis() called (NEW)
  → API /api/agent-v2 (action: 'fit_analysis')  ← NEW action type
    → unified-writer-agent.runFitAnalysis()      ← NEW method
      → Phase 1 ONLY: extractApplicantProfile() + parseJobDescription() + computeSkillMatch()
      → NEW: generateFitAssessment() → LLM writes 1-2 paragraph assessment
      → Returns: { fitLevel, assessment, recommendation, context (for reuse) }
  → NO credits deducted yet (fit analysis is free)
  → ChatPanel shows fit assessment message with action buttons:
    - "Generate Full Application" → triggers full generation WITH cached context
    - "Skip This Job / Start New Application" → resets for new JD

User clicks "Generate Full Application":
  → runAgentWorkflow() called with cachedContext
  → API /api/agent-v2 (action: 'full_optimization_with_context')  ← NEW action type
    → unified-writer-agent.runWithContext()                        ← NEW method
      → SKIPS Phase 1 (reuses cached context from fit analysis)
      → Phase 2 ONLY: generateOptimizedCVData() + generateCoverLetter() + generateApplicationEmail()
  → Credits deducted (2 credits) only now
  → Normal completion flow

User clicks "Skip This Job":
  → Clears session, ready for new JD
  → No credits used
```

---

## Files to Modify

### 1. `src/lib/agents/types.ts`
- Add `fitAnalysis` field to `MasterContext`:
  ```ts
  fitAnalysis?: {
    fitLevel: 'strong' | 'good' | 'weak';
    score: number;           // 0-100 from computeSkillMatch
    assessment: string;      // 1-2 paragraph AI-written assessment
    recommendation: string;  // "Apply" or "Skip"
    matchingSkills: string[];
    missingSkills: string[];
  };
  ```

### 2. `src/lib/agents/unified-writer-agent.ts`
- **Add `runFitAnalysis()` method**: Runs only Phase 1 + a new `generateFitAssessment()` LLM call
- **Add `runWithContext()` method**: Accepts a pre-built `MasterContext` and runs only Phase 2 (document generation)
- **Add `generateFitAssessment()` method**: New LLM call that takes the parsed applicant profile, job requirements, and skill match, then writes a 1-2 paragraph assessment with a fit level (strong/good/weak) and recommendation

### 3. `src/app/api/agent-v2/route.ts`
- **Add `fit_analysis` action**: Calls `runFitAnalysis()`, streams Phase 1 steps + fit result, does NOT deduct credits
- **Add `full_optimization_with_context` action**: Accepts cached context from fit analysis, calls `runWithContext()`, deducts credits, streams Phase 2 steps only
- **Update `getWorkflowSteps()`**: Add step definitions for `fit_analysis` action
- **Update `getStepIndex()`**: Add `fit_assessment` step ID
- **Add new SSE event type**: `fit_analysis_complete` with fit data

### 4. `src/components/ChatPanel.tsx`
- **Modify `handleSend()`**: When JD detected, call `runFitAnalysis()` instead of `runAgentWorkflow()`
- **Add `runFitAnalysis()` function**: Calls `/api/agent-v2` with `action: 'fit_analysis'`, handles SSE stream
- **Handle `fit_analysis_complete` SSE event**: Display fit assessment message in chat with action buttons
- **Add new action handlers**:
  - `generate-full-application`: Calls `runAgentWorkflow()` with cached context
  - `skip-job`: Clears session for new application
- **Store cached context**: New state `fitAnalysisContext` to hold the Phase 1 results for reuse

### 5. `src/hooks/useAgentV2.ts` (if used elsewhere)
- Add `fitAnalysis` field to `AgentV2Result`
- Add `fit_analysis_complete` event handling

### 6. `src/components/chat/ChatMessage.tsx`
- May need a new visual treatment for fit analysis messages (e.g., colored badge for Strong/Good/Weak fit)

### 7. `src/components/AgentProgressV2.tsx`
- Add step display for `fit_assessment` step during fit analysis phase

---

## Detailed Implementation Steps

### Step 1: Backend - Types & Agent Methods

1. Add `fitAnalysis` to `MasterContext` in `types.ts`
2. Add `generateFitAssessment()` to `unified-writer-agent.ts`:
   - Input: `MasterContext` (with applicant, job, match already populated)
   - LLM prompt: "Given this applicant profile and job requirements, write a 1-2 paragraph fit assessment. Classify as Strong Fit (score >= 70), Good Fit (50-69), or Weak Fit (< 50). Give a clear recommendation."
   - Output: `{ fitLevel, assessment, recommendation }`
3. Add `runFitAnalysis()` to `unified-writer-agent.ts`:
   - Runs Phase 1 steps (extract applicant, parse JD, detect language, compute match)
   - Calls `generateFitAssessment()`
   - Returns the full `MasterContext` (for caching) + fit analysis result
4. Add `runWithContext()` to `unified-writer-agent.ts`:
   - Accepts pre-built `MasterContext`
   - Runs only Phase 2 (CV generation, cover letter, email)
   - Returns same `OrchestrationResult` as current `run()`

### Step 2: Backend - API Route

1. Add `fit_analysis` to `AgentRequest.action` union type
2. Add `full_optimization_with_context` to action union type
3. Handle `fit_analysis` action:
   - NO credit deduction
   - Call `runFitAnalysis()`
   - Stream Phase 1 progress steps
   - Send `fit_analysis_complete` SSE event with fit data + serialized context
4. Handle `full_optimization_with_context` action:
   - Accept `cachedContext` in request body
   - Deduct credits (2 credits)
   - Call `runWithContext()` with deserialized context
   - Stream Phase 2 progress steps
   - Send `workflow_complete` as normal

### Step 3: Frontend - ChatPanel

1. Add state: `fitAnalysisContext: MasterContext | null`
2. Modify JD detection flow:
   - Instead of `runAgentWorkflow(jd)`, call new `runFitAnalysis(jd)`
3. Add `runFitAnalysis()`:
   - POST to `/api/agent-v2` with `action: 'fit_analysis'`
   - Handle SSE stream (Phase 1 steps + fit result)
   - On `fit_analysis_complete`: store context, display assessment message with buttons
4. Add fit assessment chat message format:
   - Badge: 🟢 Strong Fit / 🟡 Good Fit / 🔴 Weak Fit
   - 1-2 paragraph assessment text
   - Action buttons: "Generate Full Application" + "Skip This Job"
5. Handle "Generate Full Application" action:
   - Call `runAgentWorkflow()` but pass `fitAnalysisContext` as cached context
   - POST to `/api/agent-v2` with `action: 'full_optimization_with_context'` + `cachedContext`
6. Handle "Skip This Job" action:
   - Clear `fitAnalysisContext`
   - Clear session
   - Ready for new JD

### Step 4: Frontend - UI Polish

1. Update `ChatMessage.tsx` for fit analysis visual treatment
2. Update `AgentProgressV2.tsx` for fit analysis step display
3. Ensure smooth transition from fit analysis → full generation (progress bar continues)

### Step 5: State Docs & Testing

1. Update `PAGES_STATE_DOCS.md` and `COMPONENTS_STATE_DOCS.md`
2. Test full flow: JD paste → fit analysis → generate → complete
3. Test skip flow: JD paste → fit analysis → skip → new JD
4. Test credit deduction: only on "Generate Full Application", not on fit analysis
5. Test context reuse: Phase 1 data should NOT be re-computed when generating

---

## Credit Impact

- **Fit Analysis**: FREE (no credits deducted) — encourages users to check fit before committing
- **Full Application Generation**: 2 credits (same as current) — only charged when user explicitly chooses to proceed
- This is a UX improvement: users don't waste credits on poor-fit jobs

---

## LLM Cost Impact

- **Additional LLM call**: `generateFitAssessment()` is a small call (~200 tokens output)
- **Savings when user skips**: If user decides not to apply, we save the 3 expensive Phase 2 calls (CV optimization ~3000 tokens, cover letter ~500 tokens, email ~200 tokens)
- **Net impact**: Slightly more cost for applications that proceed (one extra small call), significant savings for skipped jobs

---

## Context Serialization Consideration

The `MasterContext` object from Phase 1 needs to be passed from the fit analysis response back to the full generation request. Two approaches:

### Option A: Server-side session cache (Recommended)
- Store the `MasterContext` in a server-side Map keyed by `sessionId`
- Frontend only sends `sessionId` when requesting full generation
- Pros: No large payload in request body, secure
- Cons: Memory management needed (TTL-based cleanup)

### Option B: Client-side context passing
- Send full `MasterContext` back to client in fit analysis response
- Client sends it back in the full generation request
- Pros: Stateless server, simple
- Cons: Large request payload (~5-10KB), context visible to client

**Recommendation**: Option A (server-side cache) with a 30-minute TTL. Simpler for the frontend and more secure.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Context cache expires before user clicks "Generate" | 30-min TTL is generous; fallback to re-running Phase 1 if cache miss |
| User refreshes page between fit analysis and generation | Fallback to full flow (re-run Phase 1) |
| Fit assessment LLM call adds latency | Small call (~1-2 seconds), acceptable for the UX benefit |
| Breaking existing flow | New actions are additive; `full_optimization` still works unchanged |

---

## Open Questions for Discussion

1. **Should fit analysis cost any credits?** Current plan: free. Alternative: 0.5 credits.
2. **Should we show the skill match details (matching/missing skills) in the fit assessment UI?** Could be a collapsible section.
3. **Should the fit level thresholds be configurable?** Currently: Strong ≥ 70, Good 50-69, Weak < 50.
4. **Should we persist fit analysis results to Supabase?** Could be useful for analytics (how often users skip weak-fit jobs).
5. **Should the "Generate Full Application" button text change based on fit level?** E.g., "Generate Anyway" for weak fits vs "Generate Application" for strong fits.
