# Analyze First → Apply Flow: Bug Audit & Fixes

## Bug 1: Context Cache Miss — UI Shows Full Re-Parsing After Fit Analysis

**Status**: ✅ Fixed

**Symptom**: After running "Analyze First" (fit assessment), clicking "Apply for This Job" shows the agent progress starting from scratch — "Parsing CV & Requirements", "Skill Matching" — instead of skipping directly to "Optimizing CV", "Composing Cover Letter", "Generating Email".

**Root Cause**: The server-side context cache is an **in-memory `Map`** in `src/app/api/agent-v2/route.ts` (line 40). This cache is unreliable because:
1. **Dev mode**: Next.js hot module replacement clears module-level state between requests
2. **Production serverless (Vercel)**: Each request may hit a different instance — instances don't share memory
3. **Process restarts**: Any restart clears the Map

When the cache misses (line 253), the code falls back to `runJobCopilot` (full optimization) which emits all 5 steps including "Parsing CV & Requirements" — exactly what the user sees.

**Evidence from screenshots**: The progress UI shows 5 steps (analysis → matching → cv → cover letter → email) instead of the expected 3 steps (cv → cover letter → email) from `getWorkflowSteps('generate_with_context')`.

**Fix**: Pass the parsed context data from client → server as a fallback when in-memory cache misses:
1. In `fit_analysis_complete` SSE event, include full parsed context (applicant, match, verifiedMetrics, detectedLanguage)
2. Store in ChatPanel client state
3. Send back with `generate_with_context` request
4. Server reconstructs MasterContext from client data + raw CV/masterCV when cache misses
5. Keep in-memory cache as fast path; client data as reliable fallback

**Files Modified**:
- `src/app/api/agent-v2/route.ts` — Accept `cachedContextData` in request, reconstruct context on cache miss
- `src/components/ChatPanel.tsx` — Store full context from fit_analysis_complete, send back with apply

---

## Bug 2: Email Prompt Hallucination — Fabricates Skills/Experience Not in CV

**Status**: ✅ Fixed

**Symptom**: The primary application email fabricates experiences (e.g., "storefronts for Aliva") that don't exist in either the Primary CV or Master CV. The cover letter does NOT hallucinate — it follows anti-hallucination rules correctly.

**Root Cause**: Two critical differences between the email prompt and cover letter prompt:

### Problem A: CV Content Truncated to 500 Characters
- **Cover letter** gets: Full `rawCV` + full `masterCV` (thousands of chars)
- **Email** gets: `rawCV?.slice(0, 500)` + `masterCV.slice(0, 500)` (line 2176-2179)

With only 500 chars of CV content, the model has insufficient information about the applicant's actual experience and fills gaps with fabricated details.

### Problem B: Weak Anti-Hallucination Guardrails
- **Cover letter system prompt**: 5 detailed rules (SOURCE VERIFICATION, METRIC ACCURACY, INDUSTRY ACCURACY, LANGUAGE PROFICIENCY, VERIFICATION CHECK) + explicit VERIFIED SKILL CONSTRAINT section listing every missing skill + examples of correct behavior
- **Email system prompt**: Only 2 generic sentences ("Only reference skills... Do not invent numbers...")

### Problem C: Missing VERIFIED SKILL CONSTRAINT Section
- **Cover letter** has: Explicit block "SKILLS YOU MUST NOT CLAIM: [list]" with examples
- **Email** has: Brief inline mention `SKILL CONSTRAINT: The following skills are NOT in the applicant's background...`

**Fix**:
1. Remove 500-char truncation — give email full CV content (or at least 2000 chars)
2. Add the same explicit VERIFIED SKILL CONSTRAINT section as the cover letter
3. Strengthen anti-hallucination rules in email system prompt to match cover letter's 5-rule system
4. Pass `verifiedMetrics` to constrain the email to only verified numbers

**Files Modified**:
- `src/lib/agents/unified-writer-agent.ts` — Email prompt improvements

---

## Bug 3: Follow-up Email Anti-Hallucination

**Status**: ✅ Fixed

The follow-up email had a 3-line anti-hallucination section. While lower risk (only receives `key_achievement` and `company_context`, not raw CV), it was strengthened to match the 5-rule system used by the primary email and cover letter for consistency.

**Fix** (`unified-writer-agent.ts`):
- Added 5 explicit rules: SOURCE VERIFICATION, METRIC ACCURACY, COMPANY ACCURACY, SKILL CONSTRAINT, VERIFICATION CHECK
- Rules are scoped to the follow-up's specific sources (key_achievement, company_context, primary_email)

---

## Timeline
- [x] Root cause analysis complete
- [x] Bug 1 fix: Client-side context passthrough
- [x] Bug 2 fix: Email prompt anti-hallucination parity
- [ ] Testing verification
