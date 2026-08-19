# Flow 5: settings and billing. Locked 19 August 2026.

Wasim rejected the first draft (popover menu + pages in the canvas) and set the layout himself from a Grok Bot screenshot: the gear opens a **settings modal** with a left nav and one pane at a time. This doc supersedes the settings-menu section of `flow-1-first-run.md`.

## Canvas and visuals

- **Locked canvas (4 artboards):** https://claude.ai/code/artifact/489f2cef-aabf-44a8-a1de-4486ed7ae1d8 (the first draft is in the version history)
- **Rendered artboards (PNG, 1440x900):** `flow-5-artboards/png/` (M1 General, M2 Usage & Billing, M3 Notifications, M4 Usage & Billing on Free).
- Sources: the modal is a shell component, `flow-1-artboards/final/settings.mjs` (`settingsModal({ tab, plan })`); `flow-5-artboards/gen7.mjs` composes the artboards. Flow 1's artboard 5b now shows the same modal.

## The decision

**The gear at the bottom of the sidebar opens a modal over whatever is on screen.** The workspace stays put behind a dimmed backdrop. Left nav with three items, one pane at a time, close with × or Esc. The four old top-level routes (Profile, Account, Subscription, Notifications) and the flow 1 popover menu are gone.

## The modal

- 980 × 660, radius 24, floating shadow, centered. Left nav 220 px on `cream-100` with three items (gear **General**, bars **Usage & Billing**, bell **Notifications**); the active item is a white pill with a gold icon. Pane: one serif heading, then sections with a small caption (ACCOUNT, PROFILE...) and grouped rows on a `cream-50` surface, `cream-200` hairlines between rows. No subtitles under the heading. The pane scrolls if needed.
- Row anatomy: label (and an optional muted second line) on the left, the control on the right: a value, a "Change" link, a select, a toggle, or an outlined button. Gold is used once per pane at most (the upgrade CTA).

### General
- ACCOUNT: avatar, name, email with a copy icon, **Sign out** (outlined).
- PROFILE: Name, Phone, Location (values, click to edit inline), Photo (Change).
- SIGN-IN AND SECURITY: Password (Change, "Last changed 3 months ago"), Two-factor authentication (toggle), Signed in with (Google · address).
- PREFERENCES: Timezone (select, auto-detect), Date format (select).
- ACCOUNT DATA: Delete account (one quiet row with a Delete link and a one-line warning).

### Usage & Billing
- USAGE: "41 of 50 credits left this month · Resets 1 September", a gold bar, one muted line with what the month's credits went on and the price of each action ("Fit check 0.5 · kit 2 (1.5 after a fit check) · rewrite 0.5"). This replaces the broken "Monthly: 182" field with the allowance and the balance in one sentence.
- BILLING: plan row (price, next invoice) with **Manage billing** (Stripe portal, external); Credit pack row with **Add 50 credits · $19.99**. On Free: one row, "No card on file".
- PLANS: Free / Plus / Max cards (price, credits a month, one line of what you get). The current plan is tagged; the upgrade target is tinted with the single gold CTA ("Upgrade to Plus" on Free, "Move to Max" on Plus). Free's line says "top-5 daily feed". One muted line: "Card via Stripe, cancel any time. Credits stay until the period ends."
- **Upgrade to Plus** (anywhere in the app) and **See Plus** (feed, short-on-credits chip) open this pane. No separate pricing modal in the app.

### Notifications
- EMAIL ME WHEN: Today's feed is ready · A follow-up is due · An interview is tomorrow · Credits are about to run out · Product news, once a month at most. One toggle per line.
- SEND TO: the account email, "Change in General".

## Notes for the spec and build

1. The modal is one component with three panes; deep links `?settings=usage` open it on a pane (used by the upgrade CTAs).
2. Keyboard: Esc closes, Tab cycles, focus returns to the gear.
3. Inline edits (name, phone, location) save on blur with a quiet "Saved" flash; no Save button.
4. Sign out is in General, not in the sidebar.
5. Mobile (not a priority): the modal becomes a full-screen sheet with the nav as top pills.
6. Stripe portal opens in a new tab; on return the Usage pane refetches.

## Supersedes

In `flow-1-first-run.md`, the "Settings menu (pops up from the gear, five items)" section is replaced by this modal. The flow 1 canvas and PNG (5b) were updated on 19 Aug.
