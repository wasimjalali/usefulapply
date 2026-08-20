# Agentic Chat Plan

Status: proposal, awaiting Wasim's feedback. Nothing here is implemented.

The chat becomes the control surface of the product. gpt-oss-120b (now serving chat) supports function calling, so the assistant can execute real actions in the dashboard instead of only talking about them. The rule for scope: anything a user can do by clicking, they should be able to do by asking, minus payments and auth.

## Architecture

- **Tool registry.** One typed list of tools (name, JSON schema, handler) in `src/lib/agents/chat-tools/`. The chat route passes tool definitions to `callWorkersAI`; when the model returns a `tool_calls` block, the route executes the handler server-side and feeds the result back for the final reply. Max 3 tool rounds per message.
- **Ownership.** Every handler re-derives `userId` from the session and queries through the existing repos (`src/db/repos/*`), which already check ownership per query. Tool arguments never carry a user id.
- **Confirmation policy.** Three classes:
  - *Read* (query anything): execute immediately.
  - *Write, reversible* (status change, dates, feed settings, save/dismiss job): execute immediately, reply states exactly what changed, UI offers undo where the store supports it.
  - *Credit-spending or destructive* (run fit analysis, regenerate, start application, delete): the model proposes, the UI renders a confirm chip, a second request with the confirmation token executes. Never spend credits on a bare model decision.
- **Injection defense.** Job-ad text and company names are attacker-authored. Keep the tracker-chat pattern: flatten and delimit untrusted text in prompts, and gate row-touching writes on the user having named the target themselves (`userNamed`).
- **Attribution.** Every tool round logs to `llm_generations` with `feature: 'chat'`, `operation: 'tool_call:<name>'`, so the admin AI-costs page shows agentic usage separately.
- **UI.** Chat replies gain an `executed` array (what happened) alongside the existing `actions` quick buttons. Zustand stores refresh from the tool results, so the dashboard updates live without reload.

## Capabilities

### Phase 1 — read and navigate (no risk)
1. **Status of everything**: "where am I with Siemens?", "what interviews do I have this week?", "which follow-ups are due?" Reads tracker rows, interview and follow-up dates.
2. **Explain the fit result**: "why did I score 68% for this job?" Reads the stored fit assessment.
3. **Credit awareness**: "how many credits do I have, what does a full kit cost?" Reads balance and the price table.
4. **Document inventory**: "which CV am I using, what did I upload?" Lists primary CV, master CV, certifications.
5. **Feed digest**: "anything strong in today's feed?" Reads latest run's ranked items.
6. **Navigate**: "take me to the tracker / documents / billing." Returns a navigation action the client executes.

### Phase 2 — tracker writes (unify with existing tracker chat)
7. **Status changes**: "mark Bosch as interviewing", "Siemens rejected me." Already live in tracker chat; moves into the unified tool registry so the main chat can do it too.
8. **Dates and reminders**: "interview is Tuesday 14:00", "remind me to follow up Friday." Writes `interview_at` / `follow_up_due_at`; the existing cron sends the reminder email.
9. **Archive or delete an application**: confirm-gated.

### Phase 3 — job feed control
10. **Feed settings by instruction**: "only remote roles", "add Berlin and Amsterdam", "drop the sales roles." Updates settings with an echo-back of the final settings so wrong parses are visible immediately.
11. **Run the feed**: "refresh my feed." Triggers the existing on-click run path with its rate limits.
12. **Act on suggestions**: "save the second one", "dismiss the Amazon job", "apply to the Delivery Hero role" (apply is credit-spending, confirm-gated).

### Phase 4 — kit actions (credit-spending, all confirm-gated)
13. **Start an application from a pasted ad**: creates the workspace, offers fit analysis (0.5) or direct apply (2.0).
14. **Regenerate with instructions**: "make the cover letter shorter and mention the Munich project." Routes the instruction to the existing regen endpoints; the writing itself stays on Sonnet.
15. **Follow-up drafting**: "write the follow-up for Bosch" after an interview passes.

### Phase 5 — CV canvas edits (bridge to the Sonnet writer)
16. **Targeted section edits**: "move the AWS cert higher", "tighten the summary to three lines." The tool translates the instruction into the CV-edit pipeline; anti-hallucination rules apply unchanged (nothing enters the CV that is not in the source CVs).

## Out of scope, deliberately
- Payments, subscription changes, Stripe portal actions. Chat links to billing, never transacts.
- Auth: email, password, account deletion.
- Bulk destructive operations ("delete all my applications").
- Autonomous credit spending without a confirm.

## Suggested order
Phase 1 and 2 together (a week-scale chunk: registry + read tools + tracker unification), then 3, then 4, then 5. Each phase ships behind its own commit with adversarial review, since every phase touches user data through API routes.
