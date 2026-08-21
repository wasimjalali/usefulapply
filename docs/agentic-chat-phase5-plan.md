# Agentic Chat Phase 5: CV Canvas Edits

Status: DRAFT for Wasim's approval, written 2026-08-21. Implements capability 16 of `docs/agentic-chat-plan.md` (the LOCKED spec). Depends on Phase 4. This is the highest-risk phase in the plan: it is the only one that writes into the CV itself, which is the document the user sends to employers.

## Kickoff prompt (paste into the new session)

> Read docs/agentic-chat-phase5-plan.md and docs/agentic-chat-plan.md, then implement Phase 5 on branch rebrand/usefulapply. Phases 3 and 4 are shipped. This phase writes into the CV, so the anti-hallucination rules are the hard constraint: mechanical edits rearrange existing content and never write prose, prose edits go to the Sonnet writer with the existing guards intact. Follow the verification protocol exactly, including the mandatory hallucination and undo tests. Commit and push before deploying, not after.

## The split that makes this safe

The locked spec divides edits by whether new words get written:

**Mechanical edits** reorder sections or bullets, delete an item, swap one or two words, or retitle a heading. No new prose, so there is no hallucination surface. gpt-oss executes these directly as structural operations on the CV object.

**Prose edits** rewrite the summary, rephrase bullets, or add any new sentence. gpt-oss does not write them. It calls the Sonnet writer pipeline as a tool, and every anti-hallucination rule applies unchanged: nothing enters the CV that is not in the Primary CV or Master CV. The per-edit Sonnet cost is cents and worth it.

**The classification is the whole risk.** If a prose edit is misread as mechanical, gpt-oss writes CV prose, which the architecture exists to prevent. When in doubt the tool must route to Sonnet, never to the mechanical path. Make that the explicit default in the tool description and in the prompt.

## What already exists

`src/components/CVPanel.tsx` has a working edit mode: `editedCVData` holds a `CVData`, and `onSave` writes it back as `optimizedCVData` on the session (preserving `analysis`, `sectionHeaders` and `localizedStrings` from the existing object, which the chat path must also do). The shape is defined in `src/lib/cv-templates/types.ts` and on `ApplicationSession.optimizedCVData` in `src/store/useSessionStore.ts`: `personal`, `summary`, `experience[].bullets`, `education`, `skills[].items`, `languages`, `certifications`, `projects`, `customSections`.

So the write target and its invariants are already settled. This phase adds a way to reach them from the chat, not a new storage model.

## Work items

### 1. `edit_cv_structure`, the mechanical path

A small, closed set of operations over the CV object. Suggested set, to be confirmed during implementation:

- `reorder_section`, `reorder_bullets`, `reorder_experience`
- `delete_bullet`, `delete_item`
- `rename_heading` (writes `sectionHeaders`, not content)
- `move_item` (for example, a certification higher up)

Rules:

- Operations address items by id or index taken from a CV read, never by a description the model paraphrased. Add a `get_cv_outline` read tool that returns the structure with stable ids and short labels, so the model has something concrete to point at. Every edit must be preceded by that read.
- **No operation may introduce a character of new prose.** `rename_heading` is the only one that writes text, and it writes a heading, so cap it hard and validate against the localized header set in `src/lib/cv-parser/section-splitter` rather than letting the model invent one.
- Validate the resulting object against the `CVData` shape before it is written. A malformed CV breaks the templates and the PDF export.
- Preserve `analysis`, `sectionHeaders` and `localizedStrings` on write, matching what `CVPanel`'s `onSave` already does.
- Mechanical edits are reversible and cost nothing, so they execute immediately and the reply states exactly what moved.

### 2. `rewrite_cv_section`, the prose path

- Credit-spending, so per the locked policy it proposes and a click executes. Decide the cost with Wasim before building; it is not in the current `CREDIT_COSTS` table and adding a row is a pricing decision, not an implementation detail.
- The handler routes to the existing Sonnet writer with the section as scope. It does not write anything itself and it does not bypass `src/lib/agents/prompts/cv-prompt.ts`.
- The anti-hallucination rules apply unchanged. An instruction cannot authorise a claim the source CVs do not support. If the user asks for something absent, the section is left alone and the reply says why.
- Scope the rewrite to one section per call. A whole-CV rewrite is what the existing generation flow is for.

### 3. Undo

Mechanical edits execute without a confirm, so undo is what makes that safe. Nothing else in the plan needs it, which is why it is called out here.

- Keep the pre-edit `optimizedCVData` and offer a single-step undo chip on the reply.
- One step is enough. Do not build an edit history; that is a bigger feature and nobody has asked for it.
- Verify undo restores the CV exactly, including `analysis`, `sectionHeaders` and `localizedStrings`.

### 4. Guards carried forward

- Every edit targets the application open in the conversation. Check the session is still current before applying, exactly as `applyExecutedEffects` does.
- Refuse edits when `ctx.userMessagePasted` is true. A pasted job ad must never be able to restructure the user's CV.
- The CV panel must reflect the change live, without a reload, through an executed effect.

## Open questions for Wasim, ask before building

1. What does a prose rewrite cost? It needs a new `CREDIT_COSTS` row.
2. Do mechanical edits apply to the tailored CV only, or also to the base CV? The tailored one is the safer default and is what the canvas shows.
3. Should edits be blocked once a kit has been downloaded, or is a later edit fine?

## Constraints

- Branch `rebrand/usefulapply`. Never commit to main. npm only. No new packages without asking.
- Use the `agent-expert` agent for everything in `src/lib/agents/**`, and the `karko-architect` agent for the operation set in item 1 before writing it.
- Do not weaken any anti-hallucination guard for any reason.
- Adding a credit cost is a pricing decision. Confirm it with Wasim first.
- Lint baseline is 67. `npx tsc --noEmit` must be zero.

## Verification protocol (the phase is not done without all of it)

1. `npx tsc --noEmit` zero errors; `npm run lint` still at 67.
2. Adversarial review, up to 5 parallel opus agents, at maximum depth. Required lenses: can a prose edit reach the mechanical path; can any edit introduce a claim absent from the source CVs; can a malformed object reach the templates or the PDF export; can an edit land on the wrong application; does undo restore exactly.
3. **Mandatory hallucination test before deploy.** Ask for a rewrite that requires a skill, a metric and an employer that are all absent from the CVs. Confirm none appear in the document and the reply explains why. This is the gate for the whole phase.
4. **Mandatory export test.** After each kind of edit, download the PDF and the DOCX and confirm the document renders correctly in all six templates. An edit that breaks the export is worse than no edit.
5. Deploy: `npm run deploy:cf`.
6. Claude-in-Chrome pass on usefulapply.com with Wasim's signed-in account. Exercise a reorder, a delete, a heading rename, an undo, and one prose rewrite end to end. Ledger check via the Cloudflare API MCP, D1 database id `8cd7059e-4f0b-429b-aace-e379756707e1`: confirm the prose path shows a Sonnet call and the mechanical path shows none.
7. Commit (conventional, one commit for the phase) and push. **Commit and push before deploying.**
