# Core Logic & Agents - State Documentation

**Location:** `/src/lib/`, `/src/hooks/`  
**Purpose:** Documents agents, hooks, utilities, credit system, and core logic  
**Last Updated:** February 6, 2026 (useInView hook)

## New Hook: useInView (Feb 6, 2026)
- **`/src/hooks/useInView.ts`** (NEW): IntersectionObserver-based hook for detecting when elements enter the viewport. Returns `[ref, isInView]`. Options: `threshold` (0.1), `rootMargin` ('-60px'), `triggerOnce` (true). Used by `ScrollReveal` and `CountUp` marketing components for scroll-triggered animations.

---

## Agent Architecture

### Unified Writer Agent (`/src/lib/agents/unified-writer-agent.ts`)
Single intelligent agent handling all CV optimization and document generation.

**Methods:**
- `run()` — Full workflow: Phase 1 (analysis) + Phase 2 (generation)
- `runFitAnalysis()` — Phase 1 only + fit assessment (NEW: Feb 5, 2026)
- `runWithContext()` — Phase 2 only with pre-built context (NEW: Feb 5, 2026)
- `extractApplicantProfile()` — Parse CV to extract structured profile
- `parseJobDescription()` — Parse JD to extract requirements
- `detectLanguage()` — Detect EN/DE from JD text
- `computeSkillMatch()` — Compare applicant skills vs job requirements
- `generateFitAssessment()` — LLM-based fit assessment paragraph (NEW: Feb 5, 2026)
- `generateOptimizedCVData()` — Generate structured CV JSON
- `generateCoverLetter()` — Generate cover letter text
- `generateApplicationEmail()` — Generate email subject + body

**Convenience Functions (exported):**
- `runJobCopilot()` — Wraps `run()`
- `runFitAnalysis()` — Wraps `runFitAnalysis()` (NEW)
- `runWithContext()` — Wraps `runWithContext()` (NEW)

### Types (`/src/lib/agents/types.ts`)
- `MasterContext` — Single source of truth for entire workflow
  - `fitAnalysis` field added (Feb 5, 2026): `{ fitLevel, score, assessment, matchingSkills, missingSkills }`
- `AgentEvent` — SSE event types for streaming progress
- `AgentResult<T>` — Standard result wrapper

### Model Types (`/src/lib/models/types.ts`)
- `TaskType` — Union of all LLM task identifiers
  - `fit_assessment` added (Feb 5, 2026) — Pre-generation fit analysis task
- `MODEL_CONFIGS` — Maps TaskType to model/temperature/maxTokens
  - `fit_assessment` config: claude-haiku-4-5, temp 0.5, maxTokens 512

---

## Credit System

### Credit Costs (`/src/lib/supabase/credits.ts`)
```
FULL_APPLICATION: 1.5    // CV + Cover Letter + Email (after fit analysis)
FIT_ANALYSIS: 0.5        // Fit analysis before full generation
CV_OPTIMIZATION: 1       // CV only
COVER_LETTER_REGEN: 0.5  // Cover letter regeneration
EMAIL_REGEN: 0.5         // Email regeneration
```

### Credit Flow
- **Fit Analysis** (0.5 credits): User pastes JD → Phase 1 runs → fit assessment shown
- **Full Application** (1.5 credits): User clicks "Apply" → Phase 2 runs with cached context
- **Total for apply flow**: 0.5 + 1.5 = 2.0 credits
- **Total for skip flow**: 0.5 credits (saves 1.5 credits)
- **CL/Email Regen**: 0.5 credits each (down from 1.0)

### Credit Middleware (`/src/lib/middleware/creditCheck.ts`)
- `checkAndDeductCredits()` — Check balance + deduct in one call
- `checkCreditsOnly()` — Check without deducting (for UI)
- `getCreditCost()` — Get cost for an action
- `formatCreditErrorResponse()` — Format error for API response

---

## API Routes

### Agent V2 (`/src/app/api/agent-v2/route.ts`)
**Actions:**
- `fit_analysis` — Phase 1 only, 0.5 credits, returns contextId + fitAnalysis (NEW)
- `generate_with_context` — Phase 2 only, 1.5 credits, uses cached context (NEW)
- `full_optimization` — Both phases, 1.5 credits (legacy)

**Server-Side Context Cache:**
- In-memory Map keyed by contextId
- TTL: 30 minutes
- Auto-cleanup of expired entries
- Fallback: if cache miss on `generate_with_context`, runs full optimization

**SSE Event Types:**
- `workflow_start` — Steps list + model info
- `step_start` / `step_complete` / `step_error` — Step progress
- `progress` — Percent + message
- `fit_analysis_complete` — Fit result + contextId (NEW)
- `workflow_complete` — Final results
- `credits_deducted` — Credit usage info
- `error` — Error message

### Regenerate (`/src/app/api/regenerate/route.ts`)
- Cover letter regen: 0.5 credits (was 1.0)
- Email regen: 0.5 credits (was 1.0)

---

## Hooks

### useAgentV2 (`/src/hooks/useAgentV2.ts`)
- Handles SSE streaming for agent workflow
- Manages steps, progress, reflection, result state
- Triggers credit update events

---

## Change Log

| Date | Change | Files Modified | Reason |
|------|--------|----------------|--------|
| Feb 5, 2026 | Fit Analysis feature implementation | unified-writer-agent.ts, types.ts, models/types.ts, agents/index.ts | Pre-generation fit assessment with context reuse |
| Feb 5, 2026 | API route: fit_analysis + generate_with_context actions | api/agent-v2/route.ts | Server-side context cache, new action types |
| Feb 5, 2026 | Credit pricing update | supabase/credits.ts, middleware/creditCheck.ts | 1.5 full app, 0.5 fit analysis, 0.5 CL/email regen |
| Feb 5, 2026 | Regenerate route credit fix | api/regenerate/route.ts | Use CREDIT_COSTS constants instead of hardcoded values |
| Feb 6, 2026 | BUG-1: LLM-based semantic skill matching | unified-writer-agent.ts, models/types.ts | Replace string matching with LLM for cross-language/semantic matching (fixes 0% score on German JDs) |
| Feb 6, 2026 | BUG-2: Anti-hallucination guardrails | unified-writer-agent.ts | Zero fabrication policy, language level accuracy (B2≠verhandlungssicher), no number invention |
| Feb 6, 2026 | BUG-3: Language level rules | unified-writer-agent.ts | German CV language labels: Muttersprache > Verhandlungssicher (C1-C2) > Fließend (B2-C1) > Gute Kenntnisse (B1-B2) |
| Feb 6, 2026 | ENH-1: Structured fit assessment format | unified-writer-agent.ts | Markdown with bold headers + bullets instead of wall of text, 120 word limit, maxTokens 500 |
| Feb 6, 2026 | New task type: skill_matching | models/types.ts | Claude Haiku 4.5, temp 0.1, maxTokens 2048 for deterministic matching |
| Feb 6, 2026 | Universal prompts: remove user-specific examples | unified-writer-agent.ts | All prompts now use generic rules with XML tags per Anthropic best practices. No hardcoded tool/skill names. Works for all users/CVs/industries. |
| Feb 6, 2026 | Upgrade extractApplicantProfile prompt | unified-writer-agent.ts | XML <extraction_rules> tags, explicit no-fabrication instructions, preserve exact proficiency levels |
| Feb 6, 2026 | Upgrade parseJobDescription prompt | unified-writer-agent.ts | XML <parsing_rules> tags, multi-language skill extraction, preserve original JD language |
| Feb 6, 2026 | Upgrade generateFitAssessment system prompt | unified-writer-agent.ts | XML <assessment_guidelines> tags, 5 explicit principles (honesty, constructiveness, specificity, actionability, brevity) |
| Feb 6, 2026 | Complete rewrite of chat system prompt | api/chat/route.ts | XML tags for all sections (identity, current_user_state, response_rules), multi-language support, scope boundaries, brevity enforcement |
| Feb 6, 2026 | Tighten fit assessment brevity | unified-writer-agent.ts | 100-word hard limit (was 120), 10-word max per bullet, exactly 2+2 structure, maxTokens reduced 500→300, XML output_format + strict_rules tags |
| Feb 6, 2026 | Pricing page: correct credit costs | pricing/page.tsx | 4-col grid: Fit Analysis 0.5, Full App 1.5, CL Regen 0.5, Email Regen 0.5 |
| Feb 6, 2026 | Credit dropdown: add usage breakdown | CreditIndicator.tsx | Shows credit cost per action (Fit 0.5, Full App 1.5, CL 0.5, Email 0.5) in dropdown |
| Feb 6, 2026 | Application mode selector | ChatPanel.tsx, ChatInput.tsx | Mode selector moved inside input box as subtle pill buttons with icons (Search/Zap). Hides when user types. Hover tooltips explain each mode and credit cost. Backend correctly routes: analyze_first→fit_analysis, apply_directly→full_optimization. |
| Feb 7, 2026 | Sonnet 4.5 Fix #1: Strict skill matching in fit assessment | unified-writer-agent.ts | Added STRICT SKILL MATCHING RULE to computeSkillMatch — requires explicit name-match from source CVs, prevents inferring skills from adjacent experience (e.g., PPC → Sponsored Products) |
| Feb 7, 2026 | Sonnet 4.5 Fix #2: Fit score calibration | unified-writer-agent.ts | Added step-by-step FIT SCORE CALCULATION METHOD with hard caps to computeSkillMatch. Updated fitLevel thresholds in generateFitAssessment (strong≥80, good≥40, weak<40). Fixes 15-25pt score inflation. |
| Feb 7, 2026 | Sonnet 4.5 Fix #3: Complete gap detection | unified-writer-agent.ts | Added GAP DETECTION RULES to computeSkillMatch — list every tool individually, no category collapsing (fixes JD#4 showing 4 gaps when 12-15 exist) |
| Feb 7, 2026 | Sonnet 4.5 Fix #4: Quantified claims constraint | unified-writer-agent.ts | Added RULE 4b (QUANTIFIED CLAIMS RULE) to CV generation anti-hallucination rules — all numbers must be traceable to source documents (fixes "100+ founders" fabrication) |
| Feb 7, 2026 | Sonnet 4.5 Fix #5: Experience bullet accuracy | unified-writer-agent.ts | Added RULE 4c (EXPERIENCE BULLET ACCURACY) to CV generation — bullets must describe documented activities, no hypothetical capabilities (fixes "performance reporting frameworks" fabrication) |
| Feb 7, 2026 | Free tier credit increase: 10→40 | supabase/credits.ts | initializeUserCredits now grants 40 monthly credits (20 apps), fixed log transaction amount from 50→40 |
| Feb 7, 2026 | Stripe PLANS config update | lib/stripe.ts | Starter credits 10→40, features "3 applications/month" → "20 applications/month" |
| Feb 7, 2026 | i18n: CVData type — sectionHeaders + localizedStrings | lib/cv-templates/types.ts | Added optional `sectionHeaders` (8 fields) and `localizedStrings` (4 fields) to CVData interface for language-agnostic template rendering |
| Feb 7, 2026 | i18n: AI prompt — LANGUAGE RULE + sectionHeaders schema | lib/agents/unified-writer-agent.ts | Replaced binary isGerman language instruction with Correction 3 LANGUAGE RULE. Added sectionHeaders + localizedStrings to JSON output schema. Added SECTION HEADERS RULE for ATS compliance. |
| Feb 7, 2026 | i18n: Agent types — detectedLanguage to string | lib/agents/types.ts | Changed `detectedLanguage` and `userLanguageOverride` from `'en' \| 'de'` to `string` (ISO 639-1). Updated `getOutputLanguage()` and `detectLanguage()` return types. |
| Feb 7, 2026 | i18n: Language detector type change | lib/utils/language-detector.ts | Changed `SupportedLanguage` from `'en' \| 'de'` to `string`. Kept existing EN/DE regex detection — AI handles other languages. |
