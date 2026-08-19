# Flow 1: the first run (upload, fit, kit). Locked 19 August 2026.

Approved by Wasim on 19 Aug 2026 with no changes. This is the design of record for flow 1 and for the app shell every later flow inherits. Read `../design-philosophy.md` first.

## Canvases

- Direction exploration (A chat spine, B same room, C guided line): https://claude.ai/code/artifact/5553a469-bf6f-4d8e-b991-d2dd738345fb
- **Locked flow (10 artboards):** https://claude.ai/code/artifact/8244abc5-adb3-4363-a4ed-59e66f7901da
- Artboard sources: `flow-1-artboards/` (`lib.mjs` shared tokens and partials, `gen.mjs` directions, `final/gen2.mjs` the locked flow). `node gen2.mjs` regenerates the `.dc.html` files; re-seed with the Claude Design `/design` helper.

## The decision

**First run is a guided line. After the first kit, the chat spine is the workspace.**

- A first-timer (no account needed) walks four steps in one column: **Your CV, The job, Your fit, Your kit.** One card and one button per step. The price is on the button. Nothing else is on screen.
- The first fit check is free and anonymous. The account is asked for at step 4, the kit, because by then the user has seen the product judge their fit.
- When the kit lands, the workspace opens with that application already in the sidebar. From then on the user lives in the chat spine.

## The guided line, step by step

| Step | Screen | What the user sees | Primary action |
|---|---|---|---|
| 1 | Your CV | Drop zone, "PDF or Word, up to 10 MB", paste-text link. Header: wordmark and a quiet "Log in" text link, nothing else. | Choose a file |
| 1b | Reading your CV | Three named stages (Opening the file, Picking out your experience and skills, Building your base CV) with a progress bar and a time estimate. A second card underneath: "While I read, paste the job ad." | Paste the job |
| 2 | The job | Paste box with the ad. "Your CV: Alex Morgan, Product Manager · Change" beneath. | Check my fit · free |
| 3 | Checking fit | Three stages (Reading the job ad, Matching your skills, Scoring the fit), progress, "About 10 seconds left". | none, it's working |
| 3b | Your fit | Verdict in the heading ("Good fit for Pixellot"), one-line reason, a 76% ring, STRONG and GAPS side by side. "Not this one? Try another job." | Generate the full kit · 1.5 credits, with "Takes a free account first, 4 credits included, no card." |
| 4a | Sign up | Inside the same card and stepper: Continue with Google, or email + password. | Create account and generate the kit |
| 4b | Building the kit | Four stages (Tailoring your CV, Writing the cover letter, Drafting the application email, Drafting the follow-up email), progress. "When this finishes your workspace opens with everything in it." | none |

While anonymous, the only header control is a "Log in" text link (for returning users who land here). There is no "Sign up" button on steps 1 to 3b: the account is asked for once, at 4a, after the user has seen their fit. Decided with Wasim 19 Aug.

Rules the line obeys: one primary action per step, price before commitment, named stages while working, no blank canvas, no choice presented before the user understands it (direct generation is a text link, not a second button).

## The chat spine (workspace)

Three columns, no top header.

**Sidebar (248 px).** Wordmark. "New application" (navy). "Today's feed" card with the new-roles count. APPLICATIONS: one entry per application, company, role and a status pill (Now, Kit ready, Drafted, Applied). "Tracker table" link. Bottom: profile (avatar, name, plan) with a **settings gear** to its right.

**Settings menu** (pops up from the gear, five items, nothing more):
1. Plan block: plan name, "2.5 of 4 credits", bar, **Upgrade to Plus** button
2. Profile & account (name, photo, email, password, 2FA, delete account, merged)
3. Plan & billing (subscription, credit packs, invoices, Stripe portal, merged)
4. Notifications
5. Sign out

The Upgrade button, the credit chip and the avatar leave the top of the app. The credit balance is also stated in the conversation header ("Kit ready · 2.5 credits left") and inline on any chip that costs credits.

**Conversation (520 px).** Header: company and role in serif, status and balance beneath. Messages from the assistant carry the U mark; the user's messages sit right. Decisions arrive as **chips** inside the conversation with the cost on each: one primary gold chip, the rest secondary. Composer at the bottom.

**Canvas (rest).** Tabs CV / Cover letter / Emails. On the CV: Original / Tailored toggle, "ATS 78% · see every change" chip (the ATS insights modal, surfaced), toolbar Templates / Edit / Copy / Download PDF. Documents are white on the cream canvas. The canvas never blanks and never switches tab on its own; while something runs, a thin gold banner says what's happening and where the result will land.

**Short on credits.** The affordable action stays primary ("Check fit first · 0.5 credits"). The upgrade becomes a secondary chip with the reason inline ("Upgrade to Plus to generate the kit · 50 credits a month"), and one muted line states the need and the reset date. Nothing clickable that will then say no.

## Notes for the spec and build (expert additions, not yet drawn)

1. **4b → 5 transition.** Automatic: when the kit lands, the workspace opens and the completion message in the chat does the explaining. No extra click.
2. **Returning user without a kit.** Anyone signed in who has no application yet also gets the line, not an empty spine. The line is the empty state.
3. **Tracker table.** Opens in the canvas column (the sidebar stays). Row identity is company + role + date in the user's locale.
4. **Today's feed.** Opens in the canvas column with the conversation column collapsed to a rail, so the feed gets the width it needs. Picking a job from a card starts a new application conversation with the job already pasted.
5. **Panel toggle.** The old header toggle disappears. The canvas can be collapsed from its own edge; the conversation cannot be hidden.
6. **Step 1b parallel paste.** If the user pastes the job while the CV is still parsing, the fit check starts the moment parsing finishes. No second click.
7. **Anonymous limits.** One free fit check per browser. A second job before sign-up lands on the sign-up card with the same copy as 4a.
8. **Keyboard.** Enter sends in the composer, Shift+Enter for a newline. Chips are focusable and pick with Enter.
9. **Voice.** All strings in these artboards follow the copy rules: contractions, no em dashes, no filler, cost stated as "· 0.5 credits".

## Out of scope for flow 1

Cover letter, email and screening panels (flow 2). Feed results and Edit feed (flow 3). Tracker table design (flow 4). The merged settings pages themselves (flow 5). Marketing (flow 7).
