# Batch 1: the shell and the guided line (flow 1)

**Status:** built by Grok 4.6, reviewed and fixed by Claude Code on 2026-08-19, awaiting merge into `rebrand/usefulapply`.
**Branch:** `build/flow-1-shell` off `rebrand/usefulapply`.
**Design of record:** `../flow-1-first-run.md`. PNGs: `../flow-1-artboards/png/` (L1, L1b, L2, L3, L3b, L4a, L4b, S1, S2, S3). Rules: `../../design-philosophy.md` section 5. Tokens: `.claude/rules/design-system.md`.

## What this batch delivers

1. **The app shell**: sidebar (248 px), conversation column (520 px), canvas (rest). No top header. Replaces the current dashboard layout (`src/app/dashboard/*`, the tabbed header with credit chip, Upgrade, avatar, panel toggle).
2. **The guided line** for first-timers and for signed-in users with no application: four steps in one column, one card and one button per step.
3. **The chat spine as the workspace** once a kit exists: each application is a conversation in the sidebar; the kit canvas shows CV / Cover letter / Emails tabs (the tab content itself is batch 2; here the CV tab shows the existing CV panel and the other two tabs show the existing panels as they are).
4. **Short-on-credits behaviour** on chips: the affordable action stays primary, the upgrade becomes a secondary chip with the reason inline.

## Read first

`../flow-1-first-run.md` in full. Then open every PNG. Then the code you will replace: `src/app/dashboard/page.tsx`, `src/app/dashboard/layout.tsx`, `src/components/ChatPanel.tsx`, `src/components/chat/*`, `src/components/StepIndicator.tsx`, `src/components/CVInputZone.tsx`, `src/components/FileUpload.tsx`, `src/components/AgentProgressV2.tsx`, `src/components/SignUpWallModal.tsx`, `src/components/InsufficientCreditsModal.tsx`, `src/store/useUIStore.ts`, `src/store/useSessionStore.ts`, `src/hooks/useAgentV2.ts` (read, don't change the SSE semantics).

## Tasks, in order

1. **Shell layout.** New `src/components/shell/` with `Sidebar.tsx`, `ConversationColumn.tsx`, `CanvasColumn.tsx`, composed in `src/app/dashboard/layout.tsx` (or page). Widths and tokens per the PNGs: sidebar 248 px on `cream-100`, conversation 520 px with a 1 px `cream-200` divider, canvas fills the rest. The canvas collapses from its own edge; the conversation cannot be hidden. Remove the header, credit chip, Upgrade button, avatar menu and panel toggle from the app. The wordmark in the sidebar is `BrandLogo`.
2. **Sidebar content.** "New application" outlined button. "Today's feed" card with the new-roles count (wire to the existing feed count; show the card even when 0 with "No new roles yet"). APPLICATIONS list: one row per session with company, role, status pill (Now / Kit ready / Drafted / Applied, six statuses arrive in batch 4). "Tracker table" link. Bottom: avatar, name, plan, gear. The gear opens the existing settings route for now (`/settings`); batch 4 replaces it with the modal.
3. **Guided line, steps 1 to 4b** as a single route state (`/dashboard` when no application exists, and `/` "Try it free" lands here). Stepper "Your CV · The job · Your fit · Your kit". Step 1 drop zone + "No file handy? Paste the text instead". Step 1b: three named stages and a progress bar while `parse-cv` runs, plus the "While I read, paste the job ad" card (parallel paste: if the job is pasted before parsing finishes, the fit check starts the moment it does). Step 2: paste box, "Your CV: <name>, <title> · Change", button "Check my fit · free". Step 3: three stages while the fit analysis streams. Step 3b: verdict heading, one-line reason, score ring, STRONG / GAPS columns, "Not this one? Try another job.", button "Generate the full kit · 1.5 credits" with the line "Takes a free account first, 4 credits included, no card."; direct generation without a fit check is a text link, not a second button. Step 4a: sign-up card inside the same stepper (Google first, then email + password; reuse the existing auth client calls, do not change Better Auth config). Step 4b: four named stages while the kit streams, then the workspace opens automatically with the new application selected and the completion message in the conversation.
4. **Anonymous first run.** One free fit check per browser without an account (reuse the existing anonymous session mechanism; if none exists, a signed cookie id is enough). A second job before sign-up lands on the 4a card with the same copy. The existing `SignUpWallModal` is retired by this.
5. **Conversation column.** Header: company and role (`font-serif`), status under it. No history icon, no balance. Assistant messages carry the U mark, user messages sit right. Decision chips inside the conversation with the cost on each: one gold primary, the rest outlined. Composer: Enter sends, Shift+Enter newline, placeholder "Ask for a change, or paste a screening question". Chips are focusable and pick with Enter.
6. **Canvas column.** Tabs CV / Cover letter / Emails (pill tabs). The canvas never blanks and never switches tab on its own. While something runs, a thin gold banner at the top of the canvas says what is happening and where the result will land. The CV tab shows the existing `CVPanel` content (Original / Tailored toggle, toolbar Templates / Edit / Copy / Download PDF) restyled to the PNG; the "ATS 78% · see every change" chip opens the existing ATS insights modal for now (batch 2 turns it into a canvas view).
7. **Short on credits (S3).** Where a chip costs more than the balance, keep the affordable chip primary and render the upgrade as a secondary chip "Upgrade to Plus to generate the kit · 50 credits a month" plus one muted line with the need and the reset date. Retire `InsufficientCreditsModal` from the chat path (grep its other uses before deleting).
8. **Returning user with no application** lands on the line (note 2), not an empty spine.
9. **Retire** the old dashboard header pieces and `StepIndicator` if nothing else imports them. List every deletion.
10. `npx tsc --noEmit`, `npm run lint`, then the report.

## Don't

- Don't change `src/lib/agents/**`, SSE event names, credit deduction, Stripe, D1 schema, Better Auth config.
- Don't build the kit tab contents, the feed, the tracker table, or the settings modal (batches 2 to 4). Wire their sidebar entries to the existing screens for now so nothing 404s.
- Don't add packages.

## Definition of done

At 1440x900 the screens match L1, L1b, L2, L3, L3b, L4a, L4b, S1 and S3 in layout, copy and colour. An anonymous visitor can upload a CV, paste a job, see the fit, sign up in the card and land in the workspace with the kit. A signed-in user with applications lands in the spine with them in the sidebar. tsc 0, lint clean, report filed.

## Kickoff prompt (paste into a fresh Grok 4.6 session in this repo)

```
You are the implementer for batch 1 of the Useful Apply UX redesign. Claude Code is the orchestrator; it will review, fix and commit your work. Read, in order: docs/ux-audit-2026-08-18/redesign/build/BUILD-PLAN.md, docs/ux-audit-2026-08-18/redesign/build/batch-1-shell.md, docs/ux-audit-2026-08-18/design-philosophy.md (section 5), docs/ux-audit-2026-08-18/redesign/flow-1-first-run.md, every PNG in docs/ux-audit-2026-08-18/redesign/flow-1-artboards/png/, and .claude/rules/design-system.md. Then do the batch's tasks in order on branch build/flow-1-shell off rebrand/usefulapply. Do not commit or push. Do not add packages. Do not touch src/lib/agents, credits, Stripe, D1 schema or Better Auth config. Finish with npx tsc --noEmit and npm run lint, then end with the exact report format from BUILD-PLAN.md.
```
