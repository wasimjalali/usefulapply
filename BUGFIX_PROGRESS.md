# Bug Fix Progress Tracker — Feb 12, 2026

## Issues

### Issue 1: Agent Steps UI — Apply-after-analyze duplicates steps
- **Problem**: When user does "analyze first" then clicks "apply", does the UI show duplicate parsing/matching steps?
- **Status**: ✅ VERIFIED CORRECT
- **Root cause**: N/A — The architecture IS correct:
  - `fit_analysis` action → steps: analysis, matching, fit_assessment
  - `generate_with_context` action → steps: cv_generation, cover_letter, email, follow_up_email (no parsing/matching!)
  - `runWithContext()` in unified-writer-agent.ts skips Phase 1 entirely
  - ChatPanel.tsx line 461: `action: contextId ? 'generate_with_context' : 'full_optimization'`
  - Context is cached server-side with 30-min TTL
- **Fix**: No fix needed. Image 1 shows `full_optimization` (direct apply mode), not apply-after-analyze.

### Issue 2: Follow-up email missing from agent steps
- **Problem**: "Generating Email" is the last visible step, but follow-up email generation continues silently.
- **Status**: ✅ FIXED
- **Root cause**: `STEP_CONFIG` had no `follow_up_email` entry → step hidden by `if (!config) return null`.
- **Fix**: Combined email + follow-up into ONE step in agent, route, and frontend:
  - `unified-writer-agent.ts`: Merged step emissions in `run()` and `runWithContext()`
  - `route.ts`: Removed `follow_up_email` from `getWorkflowSteps` and step index functions
  - `AgentProgressV2.tsx`: Updated label to "Generating Email + Follow-Up"

### Issue 3: Changes tab not persisted to Supabase
- **Problem**: Changes tab disappears on refresh. Not in recent applications.
- **Status**: ✅ FIXED
- **Root cause**: `optimizedCVData` (containing `analysis`) never saved to Supabase.
- **Fix**: Embedded `optimizedCVData` as `_optimizedCVData` inside the `generated_cv` JSONB column:
  - Save: `useSupabaseSync.ts` now embeds `_optimizedCVData` in `generated_cv` on both create and update
  - Load: Restores `optimizedCVData` from `row.generated_cv?._optimizedCVData` when loading sessions
  - No Supabase schema change needed (JSONB column accepts any structure)

### Issue 4: Education still mixed on optimized CV after refresh
- **Problem**: After refresh, optimized CV shows mixed education fields.
- **Status**: ✅ FIXED BY ISSUE 3
- **Root cause**: `optimizedCVData` lost on refresh → falls back to text parsing which misidentifies fields.
- **Fix**: Now `optimizedCVData` persists to Supabase → structured data (with correct education fields) survives refresh.

### Issue 5: CV panel Original/Optimized tabs stick after edit
- **Problem**: After editing, switching tabs shows same content until page refresh.
- **Status**: ✅ FIXED
- **Root cause**: `editedCVData` persisted across tab switches.
- **Fix**: Added `setEditedCVData(null)` to both Original and Optimized tab click handlers in `CVPanel.tsx`.

### Issue 6: Fit assessment matching skills count
- **Problem**: Shows 10 matching skills → too long.
- **Status**: ✅ FIXED
- **Root cause**: `MAX_SKILLS_SHOWN = 10` in ChatPanel.tsx.
- **Fix**: Reduced to 6. Shows 6 skills + "(+N more)" for the rest.
