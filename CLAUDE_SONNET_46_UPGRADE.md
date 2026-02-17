# Claude Sonnet 4.6 Upgrade Plan
**Date:** February 17, 2026 | **Status:** In Progress

---

## Research Summary

### Confirmed Model IDs (AWS Official Docs)

| Environment | Old (Sonnet 4.5) | New (Sonnet 4.6) |
|---|---|---|
| US Bedrock (primary) | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | `us.anthropic.claude-sonnet-4-6` |
| EU Bedrock | `eu.anthropic.claude-sonnet-4-5-20250929-v1:0` | `eu.anthropic.claude-sonnet-4-6` |
| Global Bedrock | `global.anthropic.claude-sonnet-4-5-20250929-v1:0` | `global.anthropic.claude-sonnet-4-6` |
| Direct Anthropic API | `claude-sonnet-4-5-20250929` | `claude-sonnet-4-6` |

> **Critical format change:** Sonnet 4.6 uses a shorter ID with NO date timestamp and NO `:0` version suffix.
> Sources: [AWS inference profiles docs](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html) (Feb 17, 2026)

### Fallback Model (Haiku 4.5 — unchanged)
- Bedrock: `us.anthropic.claude-haiku-4-5-20251001-v1:0` (keeping as-is)
- Direct: `claude-haiku-4-5` (keeping as-is)

### Pricing (Unchanged)
- Same as Sonnet 4.5: **$3/M input tokens, $15/M output tokens**

---

## Breaking Changes (Sonnet 4.5 → 4.6)

| Change | Impact on This Codebase | Action |
|---|---|---|
| **Prefilling assistant messages removed** (returns 400) | ✅ We do NOT use assistant prefilling | None required |
| **Tool parameter JSON escaping may differ** | ✅ We use standard `JSON.parse` everywhere | None required |
| **`output_config.effort` defaults to `high`** | ⚠️ Higher latency without explicit setting | Noted — acceptable for quality-focused app |

---

## Recommended Migration Changes (Per Anthropic Docs)

1. **Add anti-preamble instruction to system prompts** — Sonnet 4.6 is more concise but benefits from explicit instruction: `"Respond directly without preamble. Do not start with phrases like 'Here is...', 'Based on...', etc."`
2. **`output_config.effort` tuning** — Set `low` for extraction tasks, `medium` for writing tasks (optional, improves latency). Deferred — Bedrock Converse API compatibility needs verification.
3. **`output_format` → `output_config.format`** — We don't use `output_format`, so not applicable.

---

## What Sonnet 4.6 Improves Over 4.5

- **Coding:** Stronger, especially for long-horizon tasks — benefits CV optimization agent
- **Instruction following:** Better consistency — benefits structured JSON extraction  
- **Computer use:** Not used by our app
- **Context window:** 1M tokens in beta (we stay at standard)
- **Intelligence:** Near-Opus 4.6 performance at same price

---

## Files to Change

| File | Change Type | Status |
|---|---|---|
| `src/lib/models/anthropic.ts` | Model IDs (primary + fallback label) | ⬜ Pending |
| `src/lib/models/types.ts` | All 22 task configs model string | ⬜ Pending |
| `src/lib/models/index.ts` | Comments + pricing docstrings | ⬜ Pending |
| `src/app/api/parse-cv/route.ts` | Hardcoded direct API model ID (line 368) | ⬜ Pending |
| `src/app/api/agent-v2/route.ts` | PostHog `$ai_model` + workflow_start model labels | ⬜ Pending |
| `src/app/api/regenerate/route.ts` | PostHog `$ai_model` string | ⬜ Pending |
| System prompts (4 files in `prompts/`) | Add anti-preamble instruction | ⬜ Pending |
| `CLAUDE.md` | Update model reference | ⬜ Pending |

---

## Implementation Progress

- [x] Research completed — model IDs confirmed from AWS official docs
- [x] Migration guide reviewed — breaking changes assessed
- [x] Codebase audit — all 4.5 references located
- [x] `src/lib/models/anthropic.ts` updated — Sonnet 4.6 primary, Sonnet 4.5 as `USE_PREVIOUS_MODEL` fallback, Haiku 4.5 as `USE_FALLBACK_MODEL` cost fallback
- [x] `src/lib/models/types.ts` updated — all 22 task configs updated to `claude-sonnet-4-6`
- [x] `src/lib/models/index.ts` updated — comments and pricing docstrings
- [x] `src/app/api/parse-cv/route.ts` updated — full fallback chain: Haiku > Sonnet 4.5 > Sonnet 4.6
- [x] `src/app/api/agent-v2/route.ts` updated — PostHog `$ai_model` + 4 `workflow_start` model labels
- [x] `src/app/api/regenerate/route.ts` updated — PostHog `$ai_model` string
- [x] System prompts optimized — anti-preamble added to `cover-letter-prompt.ts` OUTPUT FORMAT section; all other prompts already had strong output constraints
- [x] `CLAUDE.md` updated — architecture overview and model config section

## Rollback Instructions

If issues arise with Sonnet 4.6, rollback options (no code change needed):

| Action | Result |
|---|---|
| Set `USE_PREVIOUS_MODEL=true` in Vercel env | Rolls back to Sonnet 4.5 for all routes |
| Set `USE_FALLBACK_MODEL=true` in Vercel env | Switches to Haiku 4.5 (cheaper, faster) |
| Both unset (default) | Uses Sonnet 4.6 (primary) |
