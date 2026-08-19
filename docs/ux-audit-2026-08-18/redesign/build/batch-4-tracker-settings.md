# Batch 4: the Tracker and the Settings modal (flows 4 and 5)

**Status:** not started. Starts after batch 3 is merged.
**Branch:** `build/flow-4-5-tracker-settings` off `rebrand/usefulapply`.
**Design of record:** `../flow-4-tracker.md` (PNGs `../flow-4-artboards/png/`: T1 Tracker, T3 Status change, T4 Interview when) and `../flow-5-settings-billing.md` (PNGs `../flow-5-artboards/png/`: M1 General, M2 Usage & Billing, M3 Notifications, M4 Usage & Billing on Free). Rules: `../../design-philosophy.md` section 5.

Do part A (tracker) first, then part B (settings). They share nothing except the sidebar.

## Part A: the tracker (flow 4)

Read `../flow-4-tracker.md` in full, the three T PNGs, then `src/components/TrackerPanel.tsx`, the application/session repos under `src/db/repos/*` (read; status values), the shell and chat components.

1. **Tracker as a canvas table with its own conversation.** "Tracker table" in the sidebar opens both. Header serif "Tracker", one muted line ("8 applications · 3 follow-ups due this week"), a search field (company or role, filters as you type).
2. **Six statuses everywhere:** Drafted (default for new rows), Applied, Follow-up sent, Interview, Offer (replaces "Accepted"), Rejected. Count pills All · Drafted · Applied · Follow-up sent · Interview · Offer · Rejected, computed from the same query as the rows. No checkboxes, no bulk actions, no separate "N jobs" line. If the stored status vocabulary differs, map it in code; if a schema change is needed, stop and report under "Needs a decision".
3. **Columns:** APPLICATION (company bold, role muted under), MATCH (sage ≥ 80, gold below), STATUS (inline pill with chevron), NEXT. SAVED date only on row hover at this width; as a column when the conversation is collapsed. Dates in the user's locale ("19 Aug 2026").
4. **NEXT says what to do:** "Send it →" (Drafted), "Follow up by <date>" (Applied; date + 7 business days), "Follow up overdue" in gold, "Waiting" (Follow-up sent), "<Thu 21 Aug, 14:00>" (Interview), "–" (Rejected). NEXT stays clickable to edit the date or window.
5. **Status popover (T3, T4):** click the pill, six statuses with the current checked; picking Interview, Follow-up sent or Offer turns the popover into a second step: quick chips (Tomorrow, next two weekdays, Pick a date), a time field, Save, muted line "I'll remind you the day before. Skip the date and it just says Interview." Skipping allowed. Applied sets NEXT automatically; Follow-up sent sets Waiting; Rejected clears NEXT.
6. **Row click** opens the application's conversation with its kit in the canvas.
7. **Tracker conversation:** header "Tracker · <n> applications"; opening message is the state of play in one line with chips (Draft the <company> follow-up, Prep me for <company>, Hide rejected). Plain-language status changes ("Zapier moved to interview, Tuesday 26th at 10") update the row and NEXT and confirm in one line. "Draft the X follow-up" routes to the existing follow-up regeneration with the cost chip first (0.5 credits). "Hide rejected" is a persisted per-user view filter. Composer placeholder "'Avetta moved to interview', 'what's due this week?'".
8. **Reminders:** an interview date and a follow-up window each schedule one reminder email when the matching Notifications toggle is on; the chat says "I'll remind you" only then. Use the existing email sending path; if no scheduler exists for a dated send, report it under "Needs a decision" and ship without the scheduling.
9. Retire `TrackerPanel` after grep.

## Part B: the settings modal (flow 5)

Read `../flow-5-settings-billing.md` in full, the four M PNGs, then `src/components/settings/*`, `src/app/settings/*`, `src/app/profile`, `src/app/account`, `src/app/subscription`, `src/app/notifications` (these routes go away), the Stripe portal and checkout client calls (read only; reuse them).

10. **One modal component** opened by the sidebar gear over whatever is on screen: 980×660, radius 24, `shadow-lg`, centered, dimmed backdrop. Left nav 220 px on `cream-100`: General, Usage & Billing, Notifications; active item a white pill with a gold icon. One serif heading per pane, captioned sections with grouped rows on `cream-50`, `cream-200` hairlines. No subtitles. Esc closes, Tab cycles, focus returns to the gear. Deep link `?settings=usage` opens on a pane.
11. **General:** ACCOUNT (avatar, name, email with copy, outlined Sign out), PROFILE (name, phone, location inline-edit on blur with a quiet "Saved" flash; photo Change), SIGN-IN AND SECURITY (Password Change + last changed, Two-factor toggle only if the auth layer supports it, else omit the row and report it; Signed in with), PREFERENCES (timezone select with auto-detect, date format select), ACCOUNT DATA (Delete account row, one-line warning, existing delete flow).
12. **Usage & Billing:** USAGE ("41 of 50 credits left this month · Resets 1 September", gold bar, one muted line with the month's spend and the price list "Fit check 0.5 · kit 2 (1.5 after a fit check) · rewrite 0.5"). BILLING: plan row (price, next invoice) with Manage billing (Stripe portal, new tab; refetch on return), Credit pack row "Add 50 credits · $19.99"; on Free one row "No card on file". PLANS: Free / Plus / Max cards, current tagged, upgrade target tinted with the single gold CTA ("Upgrade to Plus" on Free, "Move to Max" on Plus), Free's line "top-5 daily feed", muted line "Card via Stripe, cancel any time. Credits stay until the period ends." Reuse the existing checkout calls; don't touch webhook or credit logic.
13. **Notifications:** EMAIL ME WHEN: Today's feed is ready · A follow-up is due · An interview is tomorrow · Credits are about to run out · Product news, once a month at most (one toggle each; persist in the existing notification preferences; if a field is missing, report it). SEND TO: the account email, "Change in General".
14. **Retire** `/settings`, `/profile`, `/account`, `/subscription`, `/notifications` routes: 301 each to `/dashboard?settings=<pane>`. Sign out moves into General (remove it from the sidebar if batch 1 put it there). Every "Upgrade to Plus" and "See Plus" in the app (batches 1 and 3 used the old route) now opens `?settings=usage`.
15. Grep, list deletions, `npx tsc --noEmit`, `npm run lint`, report.

## Don't

- Don't change credit deduction, Stripe webhook handling, D1 schema or Better Auth config. Read them, reuse their client calls.
- Don't add packages.

## Definition of done

At 1440x900 T1, T3, T4, M1, M2, M3 and M4 match. Status changes from the popover and from the chat both update the row and NEXT. The gear opens the modal over the workspace; the old routes redirect. tsc 0, lint clean, report filed.

## Kickoff prompt (paste into a fresh Grok 4.6 session in this repo)

```
You are the implementer for batch 4 of the Useful Apply UX redesign. Claude Code is the orchestrator; it will review, fix and commit your work. Batches 1 to 3 are merged on rebrand/usefulapply; build on them. Read, in order: docs/ux-audit-2026-08-18/redesign/build/BUILD-PLAN.md, docs/ux-audit-2026-08-18/redesign/build/batch-4-tracker-settings.md, docs/ux-audit-2026-08-18/design-philosophy.md (section 5), docs/ux-audit-2026-08-18/redesign/flow-4-tracker.md and flow-5-settings-billing.md, every PNG in flow-4-artboards/png/ and flow-5-artboards/png/, and .claude/rules/design-system.md. Then do part A, then part B, tasks in order, on branch build/flow-4-5-tracker-settings off rebrand/usefulapply. Do not commit or push. Do not add packages. Do not change credit deduction, Stripe webhooks, D1 schema or Better Auth config; reuse the existing client calls. Finish with npx tsc --noEmit and npm run lint, then end with the exact report format from BUILD-PLAN.md.
```
