# Handoff: UX redesign, 19 August 2026 (updated after flow 7)

**For:** the next Claude Code session on this repo (branch `rebrand/usefulapply`).
**Read first:** `../design-philosophy.md`, then this file, then the flow doc you're working on.

---

## Where things stand

Flows 1 to 7 are **designed, approved by Wasim and locked**. Each has a doc of record, a Claude Design canvas, rendered PNGs and generator sources, all committed on `rebrand/usefulapply`:

| Flow | Doc | Canvas | Locked |
|---|---|---|---|
| 1 First run (guided line → chat spine, the app shell) | `flow-1-first-run.md` | https://claude.ai/code/artifact/8244abc5-adb3-4363-a4ed-59e66f7901da | 19 Aug |
| 2 Application Kit panels | `flow-2-application-kit.md` | https://claude.ai/code/artifact/a8fda81e-f1bb-4a4b-91b2-a2921a501841 | 19 Aug |
| 3 Job Feed | `flow-3-job-feed.md` | https://claude.ai/code/artifact/e2777c6a-cb17-4118-9449-a9d6348b3d73 | 19 Aug |
| 4 Tracker | `flow-4-tracker.md` | https://claude.ai/code/artifact/4ae0741c-0fcd-48a5-90ad-1c98fabb54c1 | 19 Aug |
| 5 Settings and billing (modal) | `flow-5-settings-billing.md` | https://claude.ai/code/artifact/489f2cef-aabf-44a8-a1de-4486ed7ae1d8 | 19 Aug |
| 6 Auth pages | `flow-6-auth.md` | https://claude.ai/code/artifact/65f6197c-8e8f-4f0e-a3f5-71bb80cd00f0 | 19 Aug |
| 7 Marketing site (landing, header) | `flow-7-marketing.md` | https://claude.ai/code/artifact/90ffec97-9dbc-4520-875d-69f1684a6fe9 | 19 Aug |

The direction-exploration canvas for flow 1 (A/B/C shells) is at https://claude.ai/code/artifact/5553a469-bf6f-4d8e-b991-d2dd738345fb. Variant rounds for flows 3, 4 and 5 live in each artifact's version history.

Nothing has been built. No application code changed in this track. Last commit on the track: see `git log --oneline -- docs/ux-audit-2026-08-18/redesign`.

## Your mission, in order

1. **The build phase.** Per flow, starting with flow 1: write the spec from the flow doc (the "Notes for the spec and build" sections are the starting point), write the implementation plan (superpowers `writing-plans`), implement on a branch off `rebrand/usefulapply`, verify with the `ui-tester` agent against the PNGs, `/code-review`, PR, merge. Flow 1 is the shell every other flow depends on, so it goes first and biggest. Flow 7 (marketing) is last: its product shots are real screenshots of the built screens, and the Tella demo is re-recorded after it.

## Decisions that shape everything (don't relitigate)

- **Guided line for the first run, chat spine as the workspace.** Anonymous allowed for CV + job + one free fit check; account at the kit step.
- **No top header in the app.** Sidebar: wordmark, New application (outlined), Today's feed, one entry per application with status, Tracker table, profile + gear at the bottom.
- **The gear opens a settings modal** (General / Usage & Billing / Notifications). Wasim chose this layout from a Grok Bot screenshot over my popover + pages. When he hands a reference, adapt it.
- **Gold is the only button fill**, one primary action per surface. Outlined buttons for everything else. Navy only for non-button emphasis.
- **Prices on anything that costs credits**, on the control itself. When the balance is short, the upgrade becomes a chip with the reason inline.
- **Chat header has no history icon and no balance.**
- **Canvas never blanks, never switches tab on its own** (one exception: screening answers auto-open, because the user asked for exactly that).
- **Every flow that has its own surface has its own conversation** (feed, tracker) with the assistant announcing and chips that do the work.
- **Best work is one click away in the canvas with Back**, not in a modal or a drawer: ATS "what changed", job detail, Edit feed.
- **Marketing site:** one landing, hero on the current aurora background, one CTA into the guided line, three moments from the new screens, the in-app plan cards; from the final band down unchanged; /pricing layout unchanged; /features removed.
- **Words the user has; say it once; no em dashes; contractions; no filler.**

## Environment facts

- Staging is https://usefulapply.com (the deployed Worker). Deploy with `npm run deploy:cf`. D1 is `usefulapply-db`; `npx wrangler d1 execute usefulapply-db --remote --command "..."`.
- Test accounts and the test CV are listed in `../HANDOFF.md` (the audit handoff). Wasim has to sign in for you; plan verification so you ask once per account.
- The Claude Design canvases are published from this machine's session scratchpad via the `/design` skill helper. To regenerate any canvas from the repo sources: `cd docs/ux-audit-2026-08-18/redesign/flow-N-artboards && node genN.mjs` (writes `.dc.html` files), then seed with the skill's `seed-canvas.mjs` and publish with the artifact URL above as `url` to keep the link. To re-render PNGs: `node ../shoot.mjs <dir> <out>` (uses `playwright-core` from the npx cache; see the path at the top of `shoot.mjs`); add `full` for tall artboards (flow 7).
- The one unconfirmed item from the bug track: the first live gpt-oss-120b ranking run (19 Aug 04:44 UTC) failed on JSON extraction, the fix was deployed 09:35 UTC and hasn't been exercised by a live run yet. Check `job_feed_runs.metadata.ranking_status` on the next run.

## Repo rules you must follow

As in `../HANDOFF.md`: branch off, never commit to `main`, conventional commits, `npx tsc --noEmit` clean before any code task is done, `npm` only, no em dashes in any user-facing string, confirm before schema/Stripe/auth changes, ask Wasim to run `/code-review`. Doc-only changes on this track were committed straight to `rebrand/usefulapply` (that's the working branch, not `main`); the build phase uses feature branches and PRs.

## Wasim's working style on this track (observed)

- Wants to **see** options, not read them: variants on a canvas, then he picks. Text alone doesn't land.
- Picks the recommendation most of the time, but adds one or two concrete tweaks each round (Details link on the card, interview date inside the status popover, Log in only on the line header). Listen for those.
- Sometimes hands a reference screenshot and wants that layout adapted (flow 5). Don't argue for the earlier draft.
- Expects every locked flow saved visually in the repo, not only as markdown.
- Prefers design-all-first, then build. Keeps sessions moving: "lock in and go ahead".
