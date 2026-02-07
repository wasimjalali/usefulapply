# Karko AI — Sonnet 4.5 Migration: Step-by-Step Implementation Guide

**Date:** February 7, 2026
**Author:** Expert audit from Claude Opus 4.6 (Wasim's project advisor)
**Target:** Developer agent in Windsurf (Claude Opus 4.6 with thinking mode)
**Scope:** Complete migration from Claude Haiku 4.5 → Claude Sonnet 4.5 for all tasks
**Use thinking mode:** YES — enable thinking for this migration

---

## EXECUTIVE DECISION: Haiku 4.5 as Fallback

**Keep Haiku 4.5 as a configurable fallback, but default everything to Sonnet 4.5.**

Rationale:
- If Sonnet 4.5 has an outage or rate limit spike, having Haiku as a one-line fallback prevents downtime
- The cost is one extra constant — zero maintenance burden
- If we ever want to A/B test quality differences, the infrastructure is already there
- **Do NOT use Haiku for any tier (free/paid) by default — Sonnet 4.5 for everything**

Implementation: Add a `FALLBACK_MODEL_ID` constant alongside the primary. Add an environment variable `USE_FALLBACK_MODEL=false` that can be toggled in Vercel without redeploying.

---

## STEP 1: Model ID Changes

### File: `src/lib/models/anthropic.ts` (lines 17-18)

**FIND:**
```typescript
const BEDROCK_MODEL_ID = `us.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_MODEL_ID = 'claude-haiku-4-5';
```

**REPLACE WITH:**
```typescript
// Primary model: Claude Sonnet 4.5 — better writing quality, stronger instruction following
const BEDROCK_MODEL_ID = `us.anthropic.claude-sonnet-4-5-20250929-v1:0`;
const DIRECT_MODEL_ID = 'claude-sonnet-4-5-20250929';

// Fallback model: Claude Haiku 4.5 — faster, cheaper, toggle via env var
const BEDROCK_FALLBACK_MODEL_ID = `us.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_FALLBACK_MODEL_ID = 'claude-haiku-4-5';

// Toggle: Set USE_FALLBACK_MODEL=true in Vercel env vars to switch to Haiku
const USE_FALLBACK = process.env.USE_FALLBACK_MODEL === 'true';

// Export the active model IDs (used by the rest of the codebase)
export const ACTIVE_BEDROCK_MODEL_ID = USE_FALLBACK ? BEDROCK_FALLBACK_MODEL_ID : BEDROCK_MODEL_ID;
export const ACTIVE_DIRECT_MODEL_ID = USE_FALLBACK ? DIRECT_FALLBACK_MODEL_ID : DIRECT_MODEL_ID;
```

Then update all references to `BEDROCK_MODEL_ID` and `DIRECT_MODEL_ID` in this file to use the `ACTIVE_*` versions. Search the file for every usage.

### File: `src/app/api/parse-cv/route.ts` (line 368)

**FIND:**
```typescript
model: 'claude-haiku-4-5',
```

**REPLACE WITH:**
```typescript
model: process.env.USE_FALLBACK_MODEL === 'true' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5-20250929',
```

**ALSO in this file:** Add a system prompt and set temperature. Currently this call has NO system prompt and NO temperature (defaults to 1.0). Fix this:

**FIND the messages.create() call and update to:**
```typescript
const response = await anthropic.messages.create({
  model: process.env.USE_FALLBACK_MODEL === 'true' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  temperature: 0.3,
  system: 'You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.',
  messages: [{ role: 'user', content: prompt }],
});
```

### Verification
```bash
# After changes, run this to confirm NO Haiku references remain as defaults:
grep -rn "haiku" --include="*.ts" --include="*.tsx" --include="*.env*" src/
# Expected: Only the FALLBACK constants should contain "haiku"
```

---

## STEP 2: Pricing Update

### File: `src/lib/models/index.ts` (around line 77-78)

**FIND:**
```typescript
const inputCost = (inputTokens / 1_000_000) * 1.00;
const outputCost = (outputTokens / 1_000_000) * 5.00;
```

**REPLACE WITH:**
```typescript
// Sonnet 4.5 pricing: $3/M input, $15/M output
// Haiku 4.5 pricing: $1/M input, $5/M output
const isFallback = process.env.USE_FALLBACK_MODEL === 'true';
const inputCost = (inputTokens / 1_000_000) * (isFallback ? 1.00 : 3.00);
const outputCost = (outputTokens / 1_000_000) * (isFallback ? 5.00 : 15.00);
```

Also update any comments in this file that reference Haiku pricing.

---

## STEP 3: Temperature Adjustments

Sonnet 4.5 follows instructions more literally and has better baseline quality. This means:
- **Analytical tasks (low temp):** Keep as-is or lower slightly — Sonnet is already more precise
- **Creative tasks (high temp):** Increase slightly — Sonnet at the same temp as Haiku is more conservative

### File: `src/lib/models/types.ts`

Update the following MODEL_CONFIGS entries. Only the temperatures that CHANGE are listed:

| Task | Old Temp | New Temp | Reasoning |
|------|----------|----------|-----------|
| `optimize_cv` | 0.4 | **0.5** | Sonnet at 0.4 is too conservative for natural-sounding bullet points. Bump to 0.5 for better variety while staying accurate. |
| `write_cover_letter` | 0.5 | **0.6** | Cover letters need warmth and personality. Sonnet's literal following at 0.5 produces correct but flat output. 0.6 allows more natural tone. |
| `write_email` | 0.5 | **0.55** | Slight bump. Emails need warmth but are shorter, so less risk from higher temp. |
| `fit_assessment` | 0.5 | **0.4** | Assessment should be analytical. Sonnet's better reasoning at lower temp produces more precise evaluations. |
| `write_summary` | 0.7 | **0.65** | Professional summaries need variety but not randomness. Slight decrease. |
| `write_bullets` | 0.7 | **0.65** | Same reasoning as summary. |

**All other tasks: keep current temperatures.** The analytical/parsing tasks (0.1-0.3) are already in the right range for Sonnet.

### Fix maxTokens Overrides

Reconcile the two override locations:

**For `fit_assessment`:** Change the config from 512 to 300 (matching the actual override), OR better — change the config to 400 and remove the override. Sonnet 4.5 follows the "100 words" instruction more precisely, so 400 tokens is plenty of headroom without the hardcoded override.

**For `general_chat`:** The config says 2048 but the chat route overrides to 100. Change the config to 150 (giving slight headroom for Sonnet's potentially slightly longer responses) and remove the override from the chat route. Keep it in one place.

---

## STEP 4: Prompt Optimizations for Sonnet 4.5

These are the critical changes. Sonnet 4.5 follows instructions literally — if you don't ask for quality, it won't add quality on its own. Every creative prompt needs explicit quality expectations.

### 4A. CV Optimization System Prompt

**File:** `src/lib/agents/unified-writer-agent.ts` (around lines 886-1195)

**FIND the role definition at the top of the CV system prompt (approximately):**
```
Writer Agent for Job Copilot - Expert Resume Architect
```

**ADD immediately after the role definition (before the anti-hallucination rules):**
```

<quality_standard>
Generate a CV that reads naturally and professionally — as if written by a skilled human career coach, not an AI tool. Every bullet point should demonstrate impact with specific, quantified achievements where possible. Use strong action verbs and varied sentence structures. The CV should tell a coherent professional story that connects the candidate's experience to the target role. Go beyond basic keyword insertion — craft language that would impress a hiring manager reading their 50th application of the day.

This quality standard is critical because our users' careers depend on the output. A mediocre CV wastes the user's time and damages our product reputation.
</quality_standard>
```

**WHY:** Sonnet 4.5 needs explicit motivation. The line "This quality standard is critical because..." tells Sonnet WHY quality matters, which Anthropic's own documentation says improves output for 4.x models.

### 4B. Cover Letter System Prompt

**File:** `src/lib/agents/unified-writer-agent.ts` (around lines 1492-1687)

**FIND the cover letter system prompt opening and ADD this block right after the role definition and before the anti-hallucination rules:**
```

<writing_quality>
Write with exceptional quality. The cover letter must sound authentically human — warm, confident, and specific. Use natural sentence flow with varied rhythm. Avoid formulaic structures that signal AI generation. Every sentence should earn its place by either demonstrating value or building genuine connection with the reader.

The opening line must immediately hook the reader with a specific, impressive achievement or insight — never a generic statement. The voice should feel like a real person who is genuinely excited about this specific opportunity, not a template applied to any job.

Write as if this is the ONE application the candidate is sending today and they've spent 30 minutes crafting it by hand.
</writing_quality>
```

**ALSO ADD to the cover letter system prompt, near the punctuation/style rules:**
```

<tone_calibration>
WARMTH: Write with genuine warmth and personality. Be human, not robotic.
CONFIDENCE: Project quiet confidence — state achievements factually without begging or over-selling.
SPECIFICITY: Every claim must reference a specific achievement, number, or experience from the CV data.
NATURAL FLOW: Vary sentence length. Mix short punchy sentences with longer descriptive ones. Read it aloud in your head — if it sounds mechanical, rewrite it.
</tone_calibration>
```

### 4C. Email System Prompt

**File:** `src/lib/agents/unified-writer-agent.ts` (around lines 1869-1925)

**FIND the email style instruction:**
```
STYLE: Brief, direct, professional but warm
```

**REPLACE WITH:**
```
STYLE: Brief, direct, and genuinely warm. The email should feel like it was written by a real person in 2 minutes — not generated by AI. Use natural phrasing. One strong opening hook, one clear value statement, one professional close. The tone should make the recipient want to open the attached CV immediately.
```

### 4D. Fit Assessment System Prompt

**File:** `src/lib/agents/unified-writer-agent.ts` (around lines 715-795 area)

The fit assessment prompt is already well-structured for Sonnet 4.5. The strict word/bullet limits will actually be followed better by Sonnet. **No major changes needed.**

**One small addition — FIND the `<assessment_guidelines>` block and ADD at the end, before the closing tag:**
```
6. PRECISION: Use exactly the numbers and percentages from the computed skill match data. Do not round or approximate.
7. LANGUAGE: Write in a direct, coaching tone. Address the candidate as "you". Be honest but encouraging — like a mentor who respects the candidate enough to tell the truth.
```

### 4E. Skill Matching Prompt

**No changes needed.** This is an analytical task at temp 0.1. Sonnet 4.5's improved precision will produce better results with the existing prompt. The semantic matching rules are well-structured with XML tags, which Sonnet handles excellently.

### 4F. Applicant Profile Extraction

**No changes needed.** Analytical extraction at temp 0.3 with strict JSON output. Sonnet will follow the extraction rules more precisely than Haiku.

### 4G. Job Description Parsing

**No changes needed.** Same reasoning as 4F.

### 4H. Chat System Prompt

**FIND:**
```
1. BREVITY: Under 2 sentences. Short, direct answers only.
```

**REPLACE WITH:**
```
1. BREVITY: Under 2-3 sentences. Short, direct, and helpful. If a question requires slightly more detail to be genuinely useful, use up to 3 sentences. Never sacrifice helpfulness for arbitrary brevity.
```

**WHY:** Sonnet at maxTokens 100 with "under 2 sentences" will produce extremely terse responses — sometimes a single sentence fragment. Loosening slightly to "2-3 sentences" gives Sonnet permission to be helpful while staying concise.

**ALSO:** Increase the chat maxTokens from 100 to **200**. With Sonnet's improved quality, slightly longer chat responses will feel more helpful and polished. 100 tokens is too constraining.

---

## STEP 5: JSON Mode Compatibility

Sonnet 4.5 has better instruction following for JSON output, but keep the existing JSON mode injection and `parseAnthropicJSON` cleanup code. Here's why:

- Sonnet 4.5 will produce cleaner JSON more consistently than Haiku
- But edge cases still exist (long outputs, complex nested structures)
- The cleanup code is a safety net with zero performance cost
- **Do NOT remove `parseAnthropicJSON` cleanup logic** — keep it as insurance

**No code changes needed for JSON handling.**

---

## STEP 6: Prompt Caching

Good news: Sonnet 4.5's minimum cache threshold is **1,024 tokens** (vs Haiku's 2,048). Your current cached prompts (CV at ~3K tokens, cover letter at ~1.5K tokens) already exceed both thresholds. Prompt caching will work even better on Sonnet 4.5.

**No code changes needed for caching.**

Cache read pricing for Sonnet 4.5: $0.30/M tokens (10% of $3.00 base). This means your cached system prompts are very cost-efficient on repeated calls.

---

## STEP 7: Latency Consideration

Sonnet 4.5 is slower than Haiku 4.5. Your pipeline runs 5-7 sequential API calls. Expected impact:

- Haiku pipeline: ~8-15 seconds total
- Sonnet pipeline: ~15-30 seconds total (estimate)

### Quick Win: Parallelize Phase 1A and 1B

Phase 1A (Extract Applicant Profile) and Phase 1B (Parse Job Description) are **completely independent** — they don't depend on each other's output. They currently run sequentially.

**File:** `src/lib/agents/unified-writer-agent.ts` — in the `runFitAnalysis()` method

**FIND the sequential calls (approximately):**
```typescript
const applicant = await this.extractApplicantProfile(/* ... */);
const job = await this.parseJobDescription(/* ... */);
```

**REPLACE WITH:**
```typescript
// Run applicant extraction and JD parsing in parallel — they're independent
const [applicant, job] = await Promise.all([
  this.extractApplicantProfile(/* ... */),
  this.parseJobDescription(/* ... */),
]);
```

**This saves one full API call of latency** (~2-5 seconds with Sonnet), recovering some of the speed difference from Haiku.

**IMPORTANT:** Do NOT parallelize anything in Phase 2. CV → Cover Letter → Email must remain sequential because each depends on the previous output and the verified skill constraints.

---

## STEP 8: Dead Code Cleanup (Optional but Recommended)

The following task types in `MODEL_CONFIGS` appear unused by the unified agent. Confirm each one is truly dead, then remove to reduce confusion:

**Likely dead (confirm before removing):**
- `parse_job_description` (unified agent uses `parse_job`)
- `parse_cv` (unified agent uses `extract_applicant`)
- `extract_skills` (skill extraction is now part of `skill_matching`)
- `gap_analysis` (replaced by fit assessment flow)
- `evaluate_content` (no reference in unified agent)
- `validate_ats` (no reference in unified agent)
- `check_limits` (no reference in unified agent)
- `orchestrate` (no reference in unified agent)
- `extract_company_info` (company info extracted from JD in `parse_job`)
- `write_summary` (summary writing integrated into `optimize_cv`)
- `write_bullets` (bullet writing integrated into `optimize_cv`)
- `refine_cover_letter` (no refinement pass in current flow)
- `optimize_content` (no reference in unified agent)

**Verification command:**
```bash
# For each task name, check if it's referenced anywhere in the agent code
grep -rn "parse_job_description\|extract_skills\|gap_analysis\|evaluate_content\|validate_ats\|check_limits\|orchestrate\|extract_company_info\|write_summary\|write_bullets\|refine_cover_letter\|optimize_content" --include="*.ts" --include="*.tsx" src/lib/agents/ src/app/
```

If a task is only referenced in `types.ts` (the config) and nowhere else, it's dead code. Remove it.

**Also check the legacy prompts file:**
```bash
grep -rn "SYSTEM_PROMPTS\.\|ANALYSIS_PROMPTS\.\|GENERATION_PROMPTS\." --include="*.ts" --include="*.tsx" src/
```

If `src/lib/prompts.ts` exports are not imported anywhere except itself, the entire file is dead code.

---

## STEP 9: Cover Letter Blacklist Enforcement

The export notes that the cover letter blacklist (40+ banned phrases) is used for validation but **not enforced as a post-generation filter**. The prompts try to prevent these phrases, but there's no safety net.

**Recommendation:** Add a simple post-processing step after cover letter generation:

```typescript
// After generating cover letter, strip any blacklisted phrases that slipped through
import { COVER_LETTER_BLACKLIST } from '@/lib/config/cover-letter-blacklist';

function enforceCoverLetterBlacklist(coverLetter: string): string {
  let cleaned = coverLetter;
  for (const phrase of COVER_LETTER_BLACKLIST) {
    // Case-insensitive replacement
    const regex = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  // Clean up any resulting double spaces or empty lines
  cleaned = cleaned.replace(/  +/g, ' ').replace(/\n\n\n+/g, '\n\n').trim();
  return cleaned;
}
```

This is a safety net — with Sonnet 4.5's better instruction following, blacklisted phrases should appear less frequently, but having a hard filter guarantees zero occurrences.

**Priority:** Low. This is a polish item, not a migration blocker.

---

## STEP 10: Environment Variable for Vercel

Add this to your Vercel project's environment variables (Settings → Environment Variables):

| Variable | Value | Environment |
|----------|-------|-------------|
| `USE_FALLBACK_MODEL` | `false` | Production, Preview, Development |

This gives you a one-click fallback to Haiku without redeploying. If Sonnet has issues in production, flip this to `true` in Vercel dashboard → instant rollback.

---

## STEP 11: Verification Checklist

After implementing all changes, verify:

### Code Verification
```bash
# 1. No default Haiku references remain
grep -rn "haiku" --include="*.ts" --include="*.tsx" src/ | grep -v "FALLBACK\|fallback\|comment"

# 2. Sonnet model ID is correct everywhere
grep -rn "sonnet-4-5" --include="*.ts" --include="*.tsx" src/

# 3. Pricing is updated
grep -rn "1.00\|5.00" --include="*.ts" src/lib/models/

# 4. No duplicate temperature/top_p usage
grep -rn "top_p" --include="*.ts" src/
# Expected: ZERO results. If any exist, remove top_p.

# 5. Parallel execution in Phase 1
grep -rn "Promise.all" src/lib/agents/unified-writer-agent.ts
```

### Functional Testing

Run all 4 test JDs from the test document (KARKO_AI_TEST_JOB_DESCRIPTIONS.md):

**Test 1 — NovaBright (US market):**
- [ ] Cover letter sounds natural, not AI-generated
- [ ] US English tone
- [ ] Subject line ≤ 60 characters
- [ ] Email includes attachment reference
- [ ] No fabricated skills

**Test 2 — Greenleaf (UK remote):**
- [ ] UK English tone
- [ ] No relocation mention (fully remote)
- [ ] German language flagged as strength
- [ ] FlatFile experience highlighted

**Test 3 — Cortex Labs (Canada stretch role — CRITICAL):**
- [ ] Fit score is honest (50-65% range)
- [ ] Python, LangChain, LlamaIndex flagged as GAPS
- [ ] Does NOT fabricate Python proficiency
- [ ] Cover letter frames as "builder who learns fast"
- [ ] Anti-hallucination constraints are working correctly

**Test 4 — TechVista (German market):**
- [ ] Full German output
- [ ] Driver's license preserved
- [ ] Education formatted correctly
- [ ] Relocation readiness mentioned
- [ ] Formal Sie-form throughout

### Quality Comparison

For each test, note:
- Is the cover letter writing quality **noticeably better** than Haiku?
- Is the email tone **more natural**?
- Are CV bullet points **more varied and impactful**?
- Is the fit assessment **more precise** in its language?
- Any issues with JSON parsing or output format?
- Approximate response time (seconds from request to complete output)

**Export all outputs and share with Wasim in the Claude project for expert audit.**

---

## STEP 12: Post-Migration State Tracker Update

After successful deployment, update the project state tracker:

```
MODEL: Claude Sonnet 4.5 (claude-sonnet-4-5-20250929)
FALLBACK: Claude Haiku 4.5 (claude-haiku-4-5-20251001) — toggled via USE_FALLBACK_MODEL env var
VERSION: v3.4 (Sonnet migration)
PRICING: $3/M input, $15/M output (est. $0.25-0.35 per application)
STATUS: Production
```

---

## SUMMARY: Complete File Change List

| # | File | What Changes |
|---|------|-------------|
| 1 | `src/lib/models/anthropic.ts` | Model IDs → Sonnet 4.5 primary, Haiku fallback with env var toggle |
| 2 | `src/lib/models/types.ts` | Temperature adjustments for 6 tasks, reconcile maxTokens overrides |
| 3 | `src/lib/models/index.ts` | Pricing update: $3/$15 (with fallback-aware logic) |
| 4 | `src/app/api/parse-cv/route.ts` | Model ID, add system prompt, add temperature 0.3 |
| 5 | `src/lib/agents/unified-writer-agent.ts` | Prompt additions: quality standards for CV, cover letter, email, fit assessment, chat; parallelize Phase 1A/1B |
| 6 | `src/app/api/chat/route.ts` | Update maxTokens from 100 to 200, update brevity rule |
| 7 | Vercel Dashboard | Add `USE_FALLBACK_MODEL=false` env var |

**Optional:**
| 8 | `src/lib/models/types.ts` | Remove dead task configs (after confirming they're unused) |
| 9 | `src/lib/prompts.ts` | Remove if confirmed dead code |
| 10 | `src/lib/agents/unified-writer-agent.ts` | Add blacklist enforcement post-processing |

---

## IMPLEMENTATION ORDER

Execute in this exact sequence:

1. **Model IDs** (Step 1) — mechanical swap, can't break anything
2. **Pricing** (Step 2) — update cost tracking
3. **Temperatures** (Step 3) — adjust for Sonnet behavior
4. **Prompt optimizations** (Step 4) — the most important step
5. **Chat updates** (Step 4H) — quick fix
6. **Latency optimization** (Step 7) — parallelize Phase 1A/1B
7. **Environment variable** (Step 10) — add fallback toggle
8. **Deploy to staging** — test all 4 JDs
9. **Verify outputs** (Step 11) — full quality check
10. **Deploy to production** — if all tests pass
11. **Dead code cleanup** (Step 8) — after production is stable
12. **Blacklist enforcement** (Step 9) — polish item, after migration is confirmed working

---

*End of Implementation Guide. After deploying, export all 4 test JD outputs and share with Wasim for expert quality audit comparing Haiku vs Sonnet results.*
