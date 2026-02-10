---
description: Always update CLAUDE.md when making ANY code changes
---

# Rule: Update CLAUDE.md on ALL Changes

Whenever you make ANY changes to the codebase — UI/UX, logic, API routes, hooks, agents, utilities, types, credit system, database schema, or configuration — you MUST also update **CLAUDE.md** (project root) to reflect those changes.

**CLAUDE.md is the ONLY state documentation file.** Do NOT create separate state tracker markdown files.

## What to Document

Add a new row to the **Changelog** table at the bottom of CLAUDE.md:

- **Date** of the change
- **What changed** (brief description)
- **Which files** were affected
- **Details** (concise specifics)

For significant features or architectural changes, also add a dedicated section above the Changelog table with full details.

## Example Changelog Entries

```
| Feb 10, 2026 | Fit assessment: improved display formatting | ChatPanel.tsx | Matching/missing skills in separate paragraphs, max 10 skills shown |
| Feb 10, 2026 | Primary email: JD-relevance fix | unified-writer-agent.ts | Added matching skills and JD requirements to email prompt |
```

## Important

- Do NOT skip this step even for small changes
- Do NOT create PAGES_STATE_DOCS.md, COMPONENTS_STATE_DOCS.md, or STATE_TRACKER.md
- Keep descriptions concise but specific
