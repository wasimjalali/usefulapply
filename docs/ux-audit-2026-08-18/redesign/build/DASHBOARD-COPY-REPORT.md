# Dashboard copy pass report (2026-08-21)

Pre-screenshot copy pass per Wasim. Implemented by the orchestrating session after the delegated model failed three runs. tsc 0 errors, lint 67 errors / 58 warnings (caps 72/60).

## 1. Renames (Title Case + common naming)

| Where | Before | After |
|---|---|---|
| Sidebar rail (shell/Sidebar.tsx:171) | New application | New Application |
| Sidebar rail (:200, aria :191) | Today's feed | Job Board |
| Sidebar rail (:219) | Tracker table | Application Tracker |
| Feed panel header (FeedConversation.tsx:644) | Today's feed | Job Board |
| Tracker panel header (TrackerConversation.tsx:223) | Tracker | Application Tracker |
| Tracker empty-state button (TrackerCanvas.tsx:226) | New application | New Application |
| Feed chips (FeedConversation.tsx:876, :983) | Build today's feed | Build today's board |
| Feed built notice (FeedConversation.tsx:333) | Today's feed is already built. | Today's board is already built. |
| Handoff source line (feed-handoff.ts:79) | From today's feed | From the job board |
| Suggested prompt (suggested-prompts.ts:25) | Anything strong in today's feed? | Anything strong on the job board today? |
| Suggested prompt (:26) | Show me today's job feed | Show me the job board |
| Chat system prompt sidebar description (api/chat/route.ts:554) | old names | new names |

Rail order kept: New Application, Search, Job Board, Application Tracker (primary action, utility, then destinations in funnel order). Code identifiers, routes, store fields and analytics names untouched.

## 2. Adaptive greeting

New `src/components/chat/ChatGreeting.tsx`: time-of-day greeting from the browser clock (5-12 morning, 12-17 afternoon, else evening) + first name from the Better Auth session; renders after mount only (no SSR mismatch). Exports `withGreeting()` for conversation openers.

- **ChatPanel** empty state: centered block, greeting heading + "What should we work on?" + the suggested-prompt chips centered beneath. Chip behavior unchanged (straight to chat, never job-ad detection).
- **FeedConversation**: the first message of the day is prefixed with the greeting (display-level, in the messages memo, all feed states covered).
- **TrackerConversation**: the opening state-of-play message is prefixed with the greeting.

## 3. Chat button audit

| Surface | Buttons | Verdict |
|---|---|---|
| New application (JD present) | Analyze this job description · 0.5 credits / How well do I fit this role? | Clear; the credit price on the button is the spend consent, keep |
| Chat empty state | 2-3 suggested prompts (state-aware ladder) | Clear, question-shaped, keep |
| Feed awaiting | Build my feed / Turn it back on / Stop searching for me / See Plus / Upload my CV | All under 4 words, keep |
| Feed daily | Build today's board (renamed) | Keep |
| Tracker opener | State-aware chips from buildOpening | Short, keep |

No verbose offenders found; no label changes made beyond the renames above.

## Notes
- `api/chat/route.ts` change is a one-line rename inside the system prompt's sidebar description (navigation vocabulary only, no behavioral prompt change).
- Landing round-3 fixes rode along in the same session: volume band back to cream-200 with navy text (was implemented navy-700, deviating from the approved mockup), wordmark icon enlarged to 1.02em with baseline drop so it reads at nav size, footer "Apply" now gold in the dark lockup.
