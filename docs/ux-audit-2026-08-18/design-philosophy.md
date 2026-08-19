# Design philosophy for the UX redesign

**Written:** 19 August 2026, start of the redesign track.
**Read this before brainstorming or implementing any flow.** It states where the redesign takes its direction from, what we took from that inspiration, and the rules every flow must pass. The friction log says what is wrong. This file says what "right" looks like.

---

## 1. The inspiration

Wasim's benchmark is the **Cursor design team**. In his words, whatever Cursor ships UX-wise is eye level above the rest of the AI industry. The most recent reference point is **Grok Bot**, launched by SpaceXAI and Cursor on 11 August 2026. It is a personal AI agent, not a job-search product, but it shows how a very powerful agent product can still feel simple, and its layout is the model for how we want Useful Apply to feel.

Screenshots of Grok Bot will be added to this folder when Wasim shares them.

## 2. What people praise about Grok Bot (research, 19 Aug 2026)

Pulled from launch coverage, reviews and the official docs. The recurring compliments:

- **Zero setup cost.** "There's no workflow builder, no graph to draw, no prior Bot configuration." You name a bot, give it one primary job, and start talking. Setup cost is described as "close to zero" next to no-code builders.
- **Team chat, not a dashboard.** A left sidebar lists your bots, one conversation each. Reviewers say the app "feels more like a team chat than a giant AI dashboard, which makes it easier to stay focused." A "messenger-style interface regular people can actually operate on day one."
- **Plain language in, finished result out.** "You message it like a colleague. You give it a task, it signs into your tools, does the work, and comes back with a finished result." The bot "comes back only when something needs your approval."
- **Approvals show exactly what will happen.** The approval card shows the exact command before it runs. When a bot needs a login it hands control to the user ("take over control"), then the user returns control. The handoff is explicit and visible.
- **Familiar, clean, minimal.** "Clean, minimal interface that's easy to get around." "Not complex for new users or non-technical persons." Mode switches are "easy and clearly labeled."
- **First run teaches three concepts, then gets out of the way.** Welcome screen, "Get started", three ideas (Bots, a shared computer, routines), then "Meet a future teammate" with suggested bots or "Create your own". One primary job per bot.

### What users said in the first week (collected by Wasim, 11 to 14 Aug 2026)

- **Nothing to learn.** "There wasn't anything to learn. It was just like bringing on a coworker. No automations to set up, no product quirks, no intricate naming. You're just chatting with a friend." (Fiona, x.ai launch)
- **Concepts people already know.** Teammate, job, conversation, computer, file, message. "I opened a consumer app and felt the whole multi-agent idea arrive at once." (Nate) His mother installed it, named a bot, watched it open a computer; at a login she took the mouse, signed in, handed it back. "No agent framework, no terminal, no Mac mini."
- **Fast to first result.** Download to first bot in about four minutes (Medium test). Twelve working bots in about eight hours (Nate).
- **You only get pulled in for judgment.** Work lands in the real tool, "100% done not 90%" (Roman). Showed a workflow once and "fully trust it to run forever" (Bennett). "Stopped checking every 15 minutes" (Emma).
- **The interface is a messenger.** "Feels like iMessage" (Matt Shumer). "Best UI is none at all": text style, no model selector, no clutter. "Agents talk to each other like a Slack team."
- **Small details.** A/B/C choice chips instead of arrows and return. "It's the little details." (Matt Van Horn)
- **The verdicts.** "Best mainstream interface for agentic AI" (Mike P). "Like OpenClaw, but super easy, reliable, and less scary" (Lenny Rachitsky). "First product that really nails the virtual co-worker" (Martin Casado). "Dead simple on the surface, serious power underneath." "You just chat and it works, no decisions, no effort." "Functional over fancy; subtracts complexity." "First-use feeling like the first time using Cursor" (Parker Smith).

The criticisms are about trust, not layout: no dry run, no per-action audit trail, approval boundaries written in prose. That is a useful warning for us. A simple surface is not enough if the product asserts things it has not verified. Our friction log found exactly that class of bug (theme 1).

## 3. What Cursor's design lead says

Ryo Lu, Cursor's head of design (ex Notion, Stripe, Asana):

- "Pro-grade tools with beginner-friendly packaging." Power stays, the packaging does the work.
- "Simplicity is earned, not given." It comes from "wrestling with complexity and compressing it into a digestible form."
- "Design is making things true." The interface should reflect the real state of the system, nothing optimistic.
- "Discovery beats prescription." Let users find depth rather than forcing it on them up front.
- "Build bricks, not readymades." Composable, consistent components over one-off screens.
- Design in the live product, not in mocks. Iterate on the real thing.

## 4. Our thesis, in one line

**Make every flow a line, not a room.** At any moment there is exactly one obvious next thing, the price is stated before the click, the screen shows only what is true, and the powerful parts are one click away instead of hidden.

## 5. The rules every flow must pass

Use these as a checklist in every brainstorm and every review. A flow that fails one of them is not done.

1. **One primary action on screen.** Everything else is secondary, smaller, or out of sight until the primary action is done. Two equal CTAs is a failure (friction F16).
2. **Price before commitment.** Any action that costs credits says so on the control itself, and if the balance is short, the control becomes the upgrade path with the reason inline. Nothing clickable that will then say no (F2, F4).
3. **Only show what is true.** No optimistic state that is not reconciled: balances, statuses, "generating" messages, counts. If the system does not know yet, show that it is working, with named stages (F3, F5, F17).
4. **Work is visible while it runs.** Long operations stream real stages in the panel the user is looking at. The fit-analysis checklist is the house pattern; parsing and generation follow it. No blank canvas, no tab switching under the user (F15, F17).
5. **Talk like a colleague.** Plain language, short sentences, contractions, no filler, no em dashes. The user says what they want in one message and gets a finished result back. The chat is the spine, the panels are the result.
6. **Discovery over prescription.** The best work (ATS insights, the inferred search profile, query rationales, follow-up timing) sits one click from the main view with a clear label, not behind a pill or inside a 2,800 px panel with no exit (theme 4, F14).
7. **Nothing leaves the shell.** Settings, billing and auth stay inside the app frame with the header, balance and panel state intact (F26). Every page has a way back.
8. **Say it once.** One heading per surface. No subtitle restating the heading. No helper text unless it prevents a mistake (F27).
9. **Explicit handoffs.** When the product needs the user (paste a job ad, choose a template, confirm a cost), it asks once, clearly, in the place the user is already looking, and then continues.
10. **Bricks, not readymades.** Reuse the existing design tokens and components in `.claude/rules/design-system.md`. New patterns must be reusable across flows, not one-off.
11. **Words the user already has.** CV, job, application, fit, cover letter, email, tracker. No product jargon, no modes to learn, no model selector, no intricate naming. If a label needs explaining, it's the wrong label.
12. **When you ask, offer chips.** Where the product needs a decision, present the two or three real choices as tappable chips inside the conversation, with the cost on each, instead of a blank box or a row of equal buttons. The user picks, the product continues.

## 6. How the redesign is organised

The audit folders are split into flows and brainstormed one at a time, most impactful first. Each flow gets its own brainstorm, short design, Wasim's approval, implementation, ui-tester verification and PR, on its own branch off `rebrand/usefulapply`.

| # | Flow | Screenshot folders | Open friction items |
|---|---|---|---|
| 1 | First run: upload, fit, kit (the spine, includes the app shell) | 02, 03, 04, 05, 10, 11 | F2, F4, F15, F16, F17, "make it a line" |
| 2 | Application Kit panels (CV, cover letter, email, screening, ATS insights) | 11, 05 | theme 4, template picker, tab structure |
| 3 | Job Feed (setup, results, card actions, Edit feed) | 06, 12, 15, 16 | theme 4, F14 follow-through, card hierarchy |
| 4 | Tracker | 07, 13 | row identity, date format, status workflow |
| 5 | Settings and billing | 02, 08, 14 | F26, F27, one credit story |
| 6 | Auth pages | 00 | F22 |
| 7 | Marketing site | 00 | F28, header density, Tella re-record |

Flows 1 to 6 are the app. Flow 7 is a separate audience and can run as a parallel track.

Sequencing agreed 19 Aug 2026: design every flow first (one locked doc per flow under `redesign/`), then build. Flow 1 is locked: `redesign/flow-1-first-run.md`. Flow 2 is locked: `redesign/flow-2-application-kit.md` (gold is the only button fill; the chat is the regenerate button). Flow 3 is locked: `redesign/flow-3-job-feed.md` (the feed has its own conversation and canvas; one gold action per card; setup by chips; Edit feed as a canvas view). Flow 4 is locked: `redesign/flow-4-tracker.md` (table + tracker conversation; NEXT column; the date is asked inside the status change). Flow 5 is locked: `redesign/flow-5-settings-billing.md` (the gear opens a settings modal: General, Usage & Billing, Notifications). Flow 6 is locked: `redesign/flow-6-auth.md` (line header, one card, gold button, a way back). Its shell (guided line for the first run, chat spine with sidebar, settings modal from the gear at the bottom, no top header) is inherited by every later flow.

## 7. Sources

- [Grok Bot launch, TechTimes](https://www.techtimes.com/articles/324176/20260812/grok-bot-launches-any-app-no-api-all-bots-share-one-cloud-computer-every-login.htm)
- [SpaceXAI and Cursor launch Grok Bot, Startup Fortune](https://startupfortune.com/spacexai-and-cursor-launch-grok-bot-an-always-on-team-of-ai-agents/)
- [Grok Bot review: what actually ships in the early beta, eesel](https://www.eesel.ai/blog/grok-bot-review)
- [Grok Bot review, Build Fast with AI](https://www.buildfastwithai.com/blogs/grok-bot-review)
- [Grok Bot guide, QCode](https://qcode.cc/en/grok-bot-guide)
- [Grok Bot: Get started, SpaceXAI docs](https://docs.x.ai/grok-bot/get-started)
- [Grok Bot ships through Cursor tiers, Digital Applied](https://www.digitalapplied.com/blog/grok-bot-cursor-tier-gating-spacex-anysphere-deal-2026)
- [Cursor's Ryo Lu on soulful design](https://jdahl.substack.com/p/cursors-ryo-lu-on-soulful-design)
