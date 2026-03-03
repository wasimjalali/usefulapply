---
description: Rules for src/lib/agents/** and src/lib/agents/prompts/**
globs: ["src/lib/agents/**", "src/lib/models/**"]
---

# Agent & Prompt Rules

## Anti-Hallucination — Core Principle
Every skill, metric, number, and claim in generated CV/cover letter output must be traceable to the Primary CV or Master CV. The JD is used for keyword matching and relevance targeting only — **never** as a source of facts about the applicant.

## CV Optimization Rules (`src/lib/agents/prompts/cv-prompt.ts`)
1. **Source Verification** — Every skill/tool/platform must exist in Primary CV or Master CV
2. **Metric Accuracy** — Only exact numbers from source CVs. No extrapolation. No JD numbers.
3. **Language Proficiency** — CEFR levels reproduced exactly. B2 stays B2.
4. **Skill Accuracy (highest priority)** — Overrides ATS optimization. Only explicitly listed skills allowed.
5. **Quantified Claims** — All numbers must trace to source CVs. JD numbers describe the EMPLOYER, not the applicant — never use them.
6. **Experience Bullets** — Bullets describe actual work. A bullet without metrics is ALWAYS better than a bullet with a fabricated metric.
7. **No CAR Method pressure** — Use "Action → Impact" format. Most bullets won't have numbers — that's correct.

## Cover Letter Rules (`src/lib/agents/prompts/cover-letter-prompt.ts`)
1. Same source-verification principle — if a number is not in the source documents, do not include it
2. JD contextual details (budgets, team sizes, reporting lines) may be referenced as employer context — not as applicant achievements
3. EN market: applicant contact info → Date → "Hiring Manager" + Company Name → Greeting. No company address. No bracketed placeholders.
4. DE market: full applicant address → Date → full company address → formal greeting (German Anschreiben convention)

## Email Rules (`src/lib/agents/prompts/email-prompts.ts`)
- Every claim must tie to a specific JD requirement (matching skills, top JD requirements, key responsibilities all injected)
- **Fit score is INTERNAL ONLY** — the LLM uses it to calibrate tone but NEVER writes it in the email output
- Follow-up email: 60-80 words max, highlights a DIFFERENT achievement/skill than the primary email
- Follow-up subject (EN): "Following Up: [Role] Application — [Name]"
- Follow-up subject (DE): "Nachfrage: [Stelle] Bewerbung — [Name]"
- No em-dashes in output. No "just checking in". No re-attachment references.

## Fit Assessment (`src/lib/agents/prompts/fit-assessment-prompt.ts`)
- Industry-aligned scoring: 85%+ strong, 70-84% good, 55-69% fair, <55% weak
- Tier-based matching hierarchy: explicit match > semantic match > experience-based match
- Nice-to-haves bonus: +2 per skill, max +10 points
- 70%+ means genuinely competitive (industry ATS standard), not "barely acceptable"

## Verified Metrics System
- `extractVerifiedMetrics()` runs in Phase 1 (parallel with other extractions)
- All numbers from source CVs are extracted and injected into Phase 2 CV generation as a binding constraint
- The LLM may only use numbers that appear in the `verifiedMetricsList` — no others

## Context Cache Pattern
- In-memory `contextCache` Map with 30-min TTL — does NOT survive dev hot-reloads or serverless cold starts
- Client always stores `fitAnalysisContextData` as fallback from `fit_analysis_complete` SSE event
- `generate_with_context` action sends `cachedContextData` in request body for cache-miss recovery
