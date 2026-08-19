# Flow 4: the Tracker. Locked 19 August 2026.

Approved by Wasim on 19 Aug 2026 (variant T1), with one addition he asked for: how the interview date gets set manually. Inherits the shell from `flow-1-first-run.md`.

## Canvas and visuals

- **Locked canvas (3 artboards):** https://claude.ai/code/artifact/4ae0741c-0fcd-48a5-90ad-1c98fabb54c1 (the full-width variant T2 is in the version history)
- **Rendered artboards (PNG, 1440x900):** `flow-4-artboards/png/` (T1 Tracker, T3 Status change, T4 Interview when).
- Sources: `flow-4-artboards/gen6.mjs` (imports tokens, spine and feed partials from `flow-1-artboards/` and `flow-3-artboards/`).

## The decision

**The tracker is a table in the canvas with its own conversation beside it.** "Tracker table" in the sidebar opens both. The conversation opens with the state of play and chips that do the work; the table shows every application with one status and one next step. Clicking a row opens that application's conversation.

## The table

- **Header:** serif "Tracker", one muted line ("8 applications · 3 follow-ups due this week"), a search field (company or role).
- **Count pills, one per status, always consistent with the rows:** All · Drafted · Applied · Follow-up sent · Interview · Offer · Rejected. No separate "N jobs" line (fixes the 18 vs 10 mismatch), no checkboxes, no bulk actions.
- **Columns (beside the conversation):** APPLICATION (company bold, role muted beneath), MATCH (sage ≥ 80, gold below), STATUS (inline pill with chevron), NEXT. The Saved date is dropped at this width; it shows on row hover and in the application's conversation. On a wider canvas (conversation collapsed) SAVED returns as a column.
- **NEXT column** says what to do, never just a date: "Send it →" (Drafted), "Follow up by 27 Aug" (Applied), "Follow up overdue" in gold (Applied past the window), "Waiting" (Follow-up sent), "Thu 21 Aug, 14:00" (Interview), "–" (Rejected).
- **Row click** opens the application's conversation with its kit in the canvas.
- **Dates** in the user's locale ("19 Aug 2026", not "8/19/2026").

## The tracker conversation

- Header: "Tracker · 8 applications".
- Opening message: the state of play in one line ("One interview (Avetta, Thursday 14:00), two follow-ups overdue (Ellucian, InRule) and Pixellot's kit is ready but not sent.") with chips: **Draft the Ellucian follow-up**, **Prep me for Avetta**, **Hide rejected**.
- Anything the table can do, the chat can do: "Zapier moved to interview, Tuesday 26th at 10" updates the row and NEXT, confirms in one line, offers a prep note (gold chip).
- Composer placeholder: "'Avetta moved to interview', 'what's due this week?'".

## Changing a status manually (T3, T4)

- Click the status pill: a popover lists the six statuses with the current one checked.
- **Picking Interview, Follow-up sent or Offer turns the same popover into a second step: when?** Quick chips (Tomorrow, the next two weekdays, Pick a date), a time field, **Save**. One muted line: "I'll remind you the day before. Skip the date and it just says Interview." Skipping is allowed.
- **The NEXT cell stays clickable** afterwards to edit the date or the follow-up window. Status pill = what, NEXT = when. The user never has to find a second control.
- Picking Applied sets NEXT to "Follow up by <date + 7 business days>" automatically; picking Follow-up sent sets "Waiting"; Rejected clears NEXT.

## Notes for the spec and build

1. Six statuses everywhere: tracker pills, sidebar pills, row pills, chat. Drafted is the default for new rows (B4). "Accepted" becomes **Offer**.
2. The count pills are computed from the same query as the rows.
3. Reminders: an interview date and a follow-up window each schedule one reminder (email, per the Notifications settings); the chat's "I'll remind you" is only said when that setting is on.
4. The tracker conversation is a real conversation; "Prep me for X" and "Draft the X follow-up" route to the existing generation flows with the cost chip first (follow-up regen is 0.5 credits).
5. "Hide rejected" is a view filter, persisted per user.
6. Search filters rows by company or role as you type.

## Out of scope for flow 4

Settings and billing (flow 5). Auth (flow 6).
