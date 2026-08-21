# Next session brief, drafted 2026-08-21

Three work items, in the order they should be done. Item 1 first because it changes
pixels that item 3 has to photograph.

**Reconciliation (orchestrator, 2026-08-21 20:15, read this first):**
- Item 1 is HALF done: the marketing side (Navbar, Footer, landing) already renders the new
  Page-U logo via `src/components/marketing/BrandLogo.tsx` and is deployed. Remaining scope
  is the app side: `src/components/BrandLogo.tsx` and its ~12 app consumers, the favicon and
  webmanifest set, and the email template logo. No new files needed from Wasim: the mark is
  inline SVG in the marketing component (paths PAGE_PATH/FOLD_PATH/U_PATH); favicons can be
  rendered from it.
- "o x alpha" = the opencode CLI model `opencode-go/ox-alpha-free`. See the delegation policy
  in CLAUDE.md ("Delegation policy: ox alpha via opencode"): brief file + `opencode run` in
  background, report written inside the repo.
- Item 3 is FURTHER along than described: five captures (hero-workspace, step1, step2, step3,
  step5) are already converted to 2880px WebP q85, committed under `public/images/moments/`,
  wired into `src/app/page.tsx` and DEPLOYED. Only `step4-chat-edit` remains, exactly as
  described below. The "where the captures go" question at the bottom is answered: WebP in
  `public/images/moments/`, raw PNGs stay untracked in `landing-captures/` (gitignored).
- Item 2 (credit-price talk in chat) is untouched and accurate. It touches
  `src/lib/agents/chat-tools/**`, which is agent-expert territory per CLAUDE.md.

---

## 1. Roll the new logo across the app and the landing pages (do this first)

**Problem.** The dashboard still renders the old mark. The new logo exists but was never
propagated, so the product and the marketing site disagree with each other and with the
brand refresh. Old assets are still in the tree, which is how the wrong one keeps getting
picked up.

**Scope.** There are two logo components and roughly fourteen consumers:

- `src/components/BrandLogo.tsx` (app shell)
- `src/components/marketing/BrandLogo.tsx` (marketing site)
- `public/useful-apply-logo.png`
- Favicon and icon set in `public/`: `favicon-16x16.png`, `favicon-32x32.png`,
  `favicon-192x192.png`, `favicon-512x512.png`, `icon-192.png`, `icon-512.png`,
  `apple-touch-icon.png`, `site.webmanifest`
- Consumers: `src/app/page.tsx`, `src/app/not-found.tsx`, `src/app/dashboard/page.tsx`,
  `src/app/admin-dashboard/_components/admin-shell.tsx`, `src/components/ChatPanel.tsx`,
  `src/components/chat/ChatMessage.tsx`, `src/components/auth/AuthShell.tsx`,
  `src/components/shell/Sidebar.tsx`, `src/components/shell/GuidedLine.tsx`,
  `src/components/tracker/TrackerConversation.tsx`,
  `src/components/marketing/Navbar.tsx`, `src/components/marketing/Footer.tsx`,
  `src/components/job-feed/FeedConversation.tsx`, `src/lib/email/config.ts`

**Do.**
1. Get the new logo files from Wasim (SVG preferred, plus the raster/favicon set).
2. Update both `BrandLogo` components so every consumer inherits the change from one place.
3. Regenerate favicons and the webmanifest icons. Check the email template logo in
   `src/lib/email/config.ts` separately, it does not go through `BrandLogo`.
4. Delete the old assets once grep shows zero references. Leaving them is what caused this.
5. Verify: dashboard sidebar, landing nav, landing footer, auth screens, 404, admin shell,
   browser tab icon, and one sent email.

**Open question for Wasim.** He mentioned handing this to "o x alpha". I could not resolve
that to a known agent or tool in this repo. Confirm what he meant before delegating, or
just run it with `karko-ui-designer`.

**Known bug to fix while in here.** The sidebar logo exposes `seful Apply` as its text node,
the `U` is drawn as a glyph and is missing from the accessible name. Screen readers read it
wrong. Fix the `aria-label` / text content when the component is rewritten.

---

## 2. Stop quoting credit prices in chat

**Wasim's call, and it is right.** Pricing was deliberately simplified to talk in
applications and rewrites, not credits. But the chat agent still narrates a per-action price
on every gated request. It reads like a meter running. Users can see their usage whenever
they want, so restating it inline on each turn is noise, not transparency. It is a real
inconsistency between the pricing story and the product surface.

Observed live on 2026-08-21:

> "The summary rewrite costs 0.5 credits. Click the button to confirm, then you'll see a
> tighter one-line version."
> `[ Rewrite it (0.5 credits) ]`

> "Rewriting the follow-up email costs 0.5 credits (you have 172.5). I'll write a fresh
> draft following your note."
> `[ Rewrite it · 0.5 credits ]`

**Where it comes from.** Three sources, all in `src/lib/agents/chat-tools/`:

1. **`note` strings that instruct the model to say the price.** Three of them, same sentence:
   - `cv-tools.ts:484` - "A button is shown to the user. **Say what it costs** and tell them
     to confirm it there."
   - `kit-tools.ts:101` - same instruction, plus the already-drafted variant at `kit-tools.ts:99`
     ("say that plainly **along with the cost**")
   - `feed-tools.ts:795` - same instruction again
2. **Button labels with the price baked in.**
   - `cv-tools.ts:488` - `` `Rewrite it (${cost} credits)` ``
   - `kit-tools.ts:110-111` - `` `Rewrite the ${shortCompany} follow-up (${cost} credits)` ``
   - `feed-tools.ts:800-801` - `` `Generate the kit for ${shortCompany} (${cost} credits)` ``
     and `` `Check my fit for ${shortCompany} (${cost} credits)` ``
3. **`credits_required` and `credits_available` in the tool payload.** Handed to the model,
   so it verbalizes them even when the `note` does not ask. `credits_available` is where
   "(you have 172.5)" comes from.
   - `credits_required`: `cv-tools.ts:465,480`, `kit-tools.ts:79,95`, `feed-tools.ts:776,791`
   - `credits_available`: `cv-tools.ts:466,481`, `kit-tools.ts:80,96`, `feed-tools.ts:777,792`

**Do.**
- Rewrite the three `note` strings (`cv-tools.ts:484`, `kit-tools.ts:99,101`,
  `feed-tools.ts:795`) so they tell the model to describe *what will happen*, never what it
  costs. Keep the "nothing is written and nothing is spent yet" reassurance, keep the
  anti-hallucination lines in `cv-tools.ts:484` about not promising unsupported content.
- Strip the price from the button labels: `Rewrite it`, `Rewrite the TeamSnap follow-up`,
  `Generate the kit for Pixellot`, `Check my fit for Pixellot`.
- Drop `credits_available` from the affordable-path payload entirely. Keep
  `credits_required` only if a downstream consumer needs it, otherwise drop it too, and
  confirm nothing in the UI reads it.
- Add one explicit rule to the chat system prompt: never quote credit prices or balances
  unless the user asks about credits, billing or what something costs.

**Keep the gate itself.** Wasim's objection is to the *price talk*, not to the confirm step.
A button before a paid rewrite is still correct, it just should not wear a price tag.

**Do not change the insufficient-balance path.** When the user genuinely cannot afford the
action (`affordable: false`, `cv-tools.ts:459-473`, `kit-tools.ts:73-88`, and the matching
block in `feed-tools.ts` around `:779`), stating the shortfall and pointing at billing is the
honest thing to do. That copy stays.

**Also check.** `read-tools.ts:119` exposes balance and per-action costs as a tool. That one
is fine, it only fires when the user asks. Verify it still works after the prompt rule lands,
the rule must not make the agent refuse a direct question about credits.

**Regression risk.** This is the same subsystem as the recent claim-guard over-refusal watch
in the phase 5 doc. Run the `agent-expert` agent on the prompt/`note` edits and re-test:
a CV section rewrite, a follow-up rewrite, a feed kit generation, a direct "how many credits
do I have" question, and a request while the balance is too low.

---

## 3. Second pass on the landing-page captures

Seven retina captures were taken on 2026-08-21 and live in `landing-captures/`
(untracked, repo root). All are 2880x1800. They are usable but not final.

| File | Status |
|---|---|
| `new-application.png` | Good |
| `step1-job-board.png` | Good |
| `step2-fit-result.png` | Good |
| `step3-kit-tabs.png` | Good |
| `hero-workspace.png` | Good |
| `step5-tracker.png` | Good |
| `step4-chat-edit.png` | **Wrong moment, must be redone** |

**Why `step4-chat-edit.png` is wrong.** It was meant to show a live CV edit landing in the
preview. Instead the agent gated the request behind the credit confirm button, so the frame
shows the gate, not the edit, and the CV never changed. Once item 2 ships, redo this shot:
send the chat message, confirm the rewrite (this costs 0.5 credits, get Wasim's go-ahead
first), and capture the moment the preview updates.

**Method for the next pass.** Open every image and judge it before shipping any of it. Do not
trust that a capture fired correctly. For each file: read it back, confirm it is the intended
screen *and* the intended moment, and re-shoot if not. Two of the seven were silently broken
on the first attempt and only caught by looking.

**Capture recipe that works.** The viewport-2880-plus-`zoom: 2` trick does **not** work on
this app. Media queries still evaluate at 2880px, so the app picks its wide-screen layout and
paints it into a 1440px area, collapsing the canvas panel to a sliver. Use this instead:

```js
// Second context at true 2x, session cookies copied over from the live one.
const cookies = await page.context().cookies();
const nctx = await page.context().browser().newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});
await nctx.addCookies(cookies);
const np = await nctx.newPage();
await np.goto('https://usefulapply.com/dashboard');
// ...drive np, then:
await np.screenshot({ path: '...', type: 'png', scale: 'device' });
```

`globalThis` does not persist between `browser_run_code_unsafe` calls. Re-find the context
each call with `page.context().browser().contexts().find(c => c !== page.context())`.
Close the extra context when finished.

**Framing notes.** A "New messages" jump-to-bottom pill overlays conversation text whenever
the transcript is scrolled up, it had to be hidden for two frames. Consider whether that pill
should dodge the text instead. The conversation/canvas splitter position is per-view and does
not carry between the kit view, Job Board and Tracker.

**Privacy.** Every CV frame uses the Alex Morgan demo persona
(`alex.morgan@email.com`, `(415) 555-0182`). No real contact details in any shipped capture.
One discarded hero frame showed a live credit balance, item 2 removes that class of leak
from chat anyway. Re-check this on the next pass.

---

## Where the captures go

`landing-captures/` is untracked. Decide before the next pass whether these live in the repo
(`public/screenshots/` already exists) or stay out of git and get uploaded to the landing page
another way.
