# State Tracker — Hooks, Agents, Utilities, Core Logic

## Changelog

| Date | Change | Files | Details |
|------|--------|-------|---------|
| Feb 10, 2026 | Improved fit assessment prompt with section character limits | unified-writer-agent.ts | Added per-section character limits (verdict 150, strengths 250, gaps 250, recommendation 200 chars). Increased total word limit from 100 to 150. Bullet limit from 10 to 12 words. 2-3 bullets per section. Blank lines between sections enforced. |
| Feb 10, 2026 | Fixed primary email to be JD-relevant | unified-writer-agent.ts | Email prompt now includes matching skills list, top JD requirements, key responsibilities, and fit score. Added JOB-RELEVANCE PRIORITY rule in system prompt requiring every claim to tie to a JD requirement. |
