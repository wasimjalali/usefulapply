# CLAUDE.md — Karko AI Codebase Reference

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
