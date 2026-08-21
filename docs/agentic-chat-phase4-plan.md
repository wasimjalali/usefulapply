# Agentic Chat Phase 4: Kit Actions

Status: DRAFT for Wasim's approval, written 2026-08-21. Implements capabilities 13 to 15 of `docs/agentic-chat-plan.md` (the LOCKED spec). Depends on Phase 3 shipping first. Every capability here spends credits, so every one is confirm-gated.

## Kickoff prompt (paste into the new session)

> Read docs/agentic-chat-phase4-plan.md and docs/agentic-chat-plan.md, then implement Phase 4 on branch rebrand/usefulapply. Phase 3 is already shipped. Follow the plan's constraints and verification protocol exactly: tsc clean, lint at the 67-error baseline, adversarial review at high depth (this phase spends credits), deploy with npm run deploy:cf, full Claude-in-Chrome pass on usefulapply.com with my signed-in account, then commit and push. Commit before deploying, not after.

## The rule that governs this whole phase

From the locked spec: *credit-spending or destructive means the model proposes, the UI renders a confirm chip, and a second request with the confirmation executes. Never spend credits on a bare model decision.*

No tool handler in this phase may call a generation endpoint. Handlers return proposals. The click calls the same client paths the buttons already use, so credits are spent by code that already spends them correctly.

## Work items

### 1. Start an application from a pasted ad (capability 13)

Batch 2 already built most of this. `propose_application` (in `chat-tools/intent.ts`) is a no-op tool the model calls when a message is a pasted ad; the client raises the existing credit-aware decision card offering fit analysis (0.5) or the full kit (2.0), and the user's click starts the run.

So capability 13 is **mostly already delivered**. What remains:

- The card currently only appears for the conversation the ad was pasted into. Decide whether "start an application for the Klarna role I saved" (from the feed, not a paste) should also raise it. If yes, that is Phase 3's `propose_feed_application`, not a new tool. Do not build a second path.
- Re-read `MIN_JOB_AD_CHARS` and `isObviousJobAd` in `ChatPanel.tsx` before touching anything here. They were tuned in batch 2 against a real false-positive bug and a real dead-end bug.
- **Do not add a credit-spending `start_application` tool.** The locked spec names this explicitly as out of scope.

### 2. Regenerate with instructions (capability 14)

"Make the cover letter shorter and mention the Munich project."

**This is the one real gap in the phase, so verify it first.** `/api/regenerate` accepts `{ type, context }` and nothing else. There is no instruction field, so the instruction has nowhere to go today.

The prompt layer is closer than the route is. `src/lib/agents/prompts/cover-letter-prompt.ts` already carries a `<user_instructions_rule>` block that honours first-person requests found alongside the job description text, and it already tells the writer to weave them in rather than quote them. The email prompts do not have an equivalent.

The work:

- Add an optional `instruction` to the regenerate route's body. Validate its length hard (a couple of hundred characters is plenty) and treat it as **user-authored, not ad-authored**: it comes from the composer. It still gets flattened before entering a prompt.
- Thread it into the prompt builders as its own labelled block. Do **not** concatenate it into the job description field: that field is attacker-authored and the anti-hallucination rules read it as the job's text, not the applicant's wishes.
- Extend the email and follow-up prompts with the same instruction rule the cover letter has, so the three behave alike.
- **The anti-hallucination rules do not bend for an instruction.** "Mention the Munich project" is honoured only if a Munich project exists in the Primary CV or Master CV. If it does not, the writer omits it and the reply says so. Add this explicitly to the instruction block and to `.claude/rules/agents-and-prompts.md`. This is the highest-risk sentence in the phase.
- The chat side already has the machinery: `detectRegenTarget` in `src/lib/regenerate-client.ts` reads a rewrite request out of the composer, `REGEN_META` carries the cost per target, and `startRegenPrompt` shows the cost chip before the click. Extend that path to carry the instruction through to the click rather than building a tool.
- Writing stays on Sonnet. gpt-oss routes; it never writes CV or letter prose.

### 3. Follow-up drafting (capability 15)

"Write the follow-up for Bosch" after an interview has passed.

- `follow_up_email` is already a regenerate type with its own cost, and `/api/tracker/follow-up` exists. Reuse them.
- The tool proposes; the chip spends. Gate the proposal on `userNamed` against the application, and refuse when `ctx.userMessagePasted` is true, exactly as the tracker writes do.
- The model may **read** the tracker to notice a follow-up is due (Phase 1 tools already do this) and offer to draft one. Offering is free. Drafting is not.
- Land the draft in the Email panel's follow-up tab, the same place the button puts it, so there is one source of truth per application.

### 4. One shared confirm path

By the end of this phase there are several proposals that each spend a different amount. They must all render through the same credit-aware decision card that batch 2 hardened, so that:

- The cost is always stated before the click.
- An insufficient balance shows the upgrade path instead of an error.
- A stale card cannot fire: `handleSend` clears pending proposals when a new message is sent, and effects check the session is still current before applying. Any new proposal must inherit both guards.

## Constraints

- Branch `rebrand/usefulapply`. Never commit to main. npm only. No new packages without asking.
- Touching credit or Stripe logic needs Wasim's explicit sign-off first. Reusing an existing credit-spending route does not, but changing how it reserves or deducts does.
- Use the `agent-expert` agent for anything under `src/lib/agents/**`, including every prompt change in item 2.
- Do not weaken any anti-hallucination guard. If an instruction and a guard conflict, the guard wins.
- Lint baseline is 67. `npx tsc --noEmit` must be zero.

## Verification protocol (the phase is not done without all of it)

1. `npx tsc --noEmit` zero errors; `npm run lint` still at 67.
2. Adversarial review, up to 5 parallel opus agents, at high depth. Required lenses: can any path spend credits without a click; can an instruction smuggle a fabricated claim into a document; can a stale proposal fire against the wrong application; does a failed generation still refund or never reserve.
3. **A hallucination test is mandatory before deploy.** Ask for a rewrite mentioning something that is definitely not in the CV, and confirm the document omits it and the reply says why. Repeat for the cover letter, the application email and the follow-up.
4. Deploy: `npm run deploy:cf`.
5. Claude-in-Chrome pass on usefulapply.com with Wasim's signed-in account. Exercise every proposal: confirm the cost is shown, confirm nothing is charged until the click, confirm the balance moves by exactly the stated amount, and confirm the document lands in the right panel. Ledger check via the Cloudflare API MCP, D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`.
6. Commit (conventional, one commit for the phase) and push. **Commit and push before deploying.**
