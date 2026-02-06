---
description: Always update state documentation markdown files when making ANY code changes
---

# Rule: Update State Documentation on ALL Changes

Whenever you make ANY changes to the codebase — UI/UX, logic, API routes, hooks, agents, utilities, types, credit system, database schema, or configuration — you MUST also update the corresponding state documentation markdown files to reflect those changes.

## State Doc Files

1. **`/src/app/PAGES_STATE_DOCS.md`** — Documents all pages and API routes. Update when:
   - Any page file under `/src/app/` is modified (including API routes under `/src/app/api/`)
   - Page layout, styling, behavior, or logic changes
   - API route request/response contracts change
   - New pages or API routes are added or removed

2. **`/src/components/COMPONENTS_STATE_DOCS.md`** — Documents all components. Update when:
   - Any component under `/src/components/` is modified
   - Component props, styling, behavior, or logic changes
   - New components are added or removed
   - Design system patterns change (headers, buttons, toggles, etc.)

3. **`/src/STATE_TRACKER.md`** — Documents hooks, stores, agents, utilities, and core logic. Update when:
   - Any hook under `/src/hooks/` is modified
   - Any agent under `/src/lib/agents/` is modified (types, workflow, prompts)
   - Any utility under `/src/lib/` is modified
   - Store logic changes (Zustand stores, contexts)
   - Credit system or pricing logic changes
   - Type definitions change

## What to Document

- **Date** of the change
- **What changed** (brief description)
- **Which files** were affected
- **Why** (reason for the change)
- **Breaking changes** if any (API contract changes, type changes, etc.)
- **Design patterns** used (for UI changes: colors, spacing, border styles, etc.)
- Add a new row to the changelog table at the bottom of each doc

## Example Changelog Entries

```
| Feb 5, 2026 | Enhanced Documents page brand consistency | documents/page.tsx | Navy/gold icon containers, cream borders, consistent shadows |
| Feb 5, 2026 | Added fit_analysis action to agent API | api/agent-v2/route.ts | New pre-generation fit assessment endpoint |
| Feb 5, 2026 | Updated credit pricing | lib/credits.ts, api/agent-v2/route.ts | 0.5 credits for fit analysis, 0.5 for CL/email regen |
```

## Important

- Do NOT skip this step even for small changes
- This applies to ALL code changes: UI, logic, API, types, agents, utilities, config
- Keep descriptions concise but specific
- If a change spans multiple areas, update ALL relevant state doc files
- For database/Supabase schema changes, document in STATE_TRACKER.md
