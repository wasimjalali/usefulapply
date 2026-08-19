# Batch 2: the Application Kit canvas (flow 2)

**Status:** built 19 August 2026 on `build/flow-2-kit` (Claude Code as implementer and reviewer, adversarial review run, tsc 0). Awaiting merge into `rebrand/usefulapply`. Divergences from the flow doc are listed at the end of `../flow-2-application-kit.md`.
**Branch:** `build/flow-2-kit` off `rebrand/usefulapply`.
**Design of record:** `../flow-2-application-kit.md`. PNGs: `../flow-2-artboards/png/` (K1 ATS view, K2 Templates, K3 Cover letter, K4 Emails, K5 Screening answers). Shell from batch 1. Rules: `../../design-philosophy.md` section 5. Templates: `.claude/rules/cv-templates.md`.

## What this batch delivers

The kit tabs inside the canvas column built in batch 1: CV with the ATS "what changed" view and the templates strip, Cover letter, Emails, and the Answers document that streams from the chat. Regeneration moves into the chat with a cost chip first. One outlined **Download all**.

## Read first

`../flow-2-application-kit.md` in full, every K PNG, then `src/components/CVPanel.tsx`, `src/components/EditableCVCanvas.tsx`, `src/components/ATSScorePanel.tsx`, `src/components/CoverLetterPanel.tsx`, `src/components/EmailPanel.tsx`, `src/components/cv-templates/*`, `src/lib/cv-templates/*`, the chat components from batch 1 (`src/components/shell/*`, `src/components/chat/*`), `src/app/api/regenerate/route.ts` (read only), `src/store/useCVStore.ts`.

## Tasks, in order

1. **Tab row.** CV / Cover letter / Emails pill tabs, plus **Answers** (with a count) once the first screening answer exists. Outlined **Download all** at the far right on every kit tab: tailored CV (PDF), cover letter (PDF + DOCX), both emails (TXT), answers (PDF) when present. Per-document downloads stay in each tab's toolbar.
2. **K1 CV tab.** Row under the tabs: Original / Tailored toggle, "Tailored for <company>.", ATS chip "ATS 78% · see every change" in sage tint (`sage-50` bg, `sage-700` text; thin sage ring when active). Toolbar: Templates, Edit (existing inline editing, unchanged), Copy, Download PDF. Document is white on the cream canvas.
3. **ATS view** as a canvas view (the CV is replaced, never squeezed): "← Back to CV" outlined, title "What changed in your CV", ATS chip right. Score card (bar, one-line strategy, "Four changes, nothing added" from the real count), one card per change with Before (struck, muted) and After (sage highlight) side by side plus a one-line reason, then a sage "Nothing added" line naming gaps that stayed gaps. Data from the existing ATS insights payload; where a change has no original snippet, show the reason line only (do not invent the before). Retire the ATS modal after grep.
4. **K2 Templates strip** under the toolbar: all six templates visible, thumbnail (static SVG placeholder per template, real preview fills in lazily behind), name, short "best for" tag. Selected = gold ring. Picking one re-renders the CV below. Template switch is free, no cost chip.
5. **K3 Cover letter.** Toolbar: Edit (inline, existing), Copy, one Download menu (PDF / DOCX). Right: "Updated just now · <n> words". **Remove the Regenerate button.** Regeneration happens in the chat: the assistant states the cost ("Rewriting it costs 0.5 credits (you have 2.5)") with one gold chip "Rewrite it · 0.5 credits", then a named stage and a one-line confirmation. Same pattern for the emails and the CV. The chip calls the existing regenerate route; do not change credit costs.
6. **K4 Emails.** One tab, both emails stacked full width (fluid cards, `box-sizing: border-box`). Each: title, Copy email, SUBJECT, BODY. Follow-up carries the "Send after 5 to 7 business days" chip. One muted line above both: "Attach the CV and cover letter as PDFs when you send." Remove the old sending-tips block and the per-email regenerate buttons.
7. **K5 Screening answers.** A pasted question in the composer routes to the existing screening-answer generation. Chat shows one stage ("Answering from your CV") and one line ("Your answer's on the right. Copy it from there, or tell me to make it shorter or more formal."). The answer streams into the canvas as a document "Screening answers · <company>", numbered Q&A, Copy per answer, toolbar Copy all / Download. The Answers tab opens itself with a count (the one allowed auto-switch). Answers persist per application (use the existing session storage for generated documents; no schema change: if a new column is needed, stop and report it under "Needs a decision").
8. **Canvas rule.** Nothing else switches tabs or blanks the canvas. While a regeneration runs, the thin gold banner from batch 1 names the stage and the target tab.
9. Retire dead code after grep; list deletions. `npx tsc --noEmit`, `npm run lint`, report.

## Don't

- Don't change prompts in `src/lib/agents/**`, credit costs, SSE event names, D1 schema.
- Don't touch the feed, tracker or settings.
- Don't add packages (DOCX and PDF generation must use what the repo already has; if it doesn't exist for a format, report it).

## Definition of done

At 1440x900 the five K screens match in layout, copy and colour. Regenerate buttons are gone from every panel and the chat does the job with a cost chip first. Download all works. tsc 0, lint clean, report filed.

## Kickoff prompt (paste into a fresh Grok 4.6 session in this repo)

```
You are the implementer for batch 2 of the Useful Apply UX redesign. Claude Code is the orchestrator; it will review, fix and commit your work. Batch 1 (the shell) is merged on rebrand/usefulapply; build on it. Read, in order: docs/ux-audit-2026-08-18/redesign/build/BUILD-PLAN.md, docs/ux-audit-2026-08-18/redesign/build/batch-2-kit.md, docs/ux-audit-2026-08-18/design-philosophy.md (section 5), docs/ux-audit-2026-08-18/redesign/flow-2-application-kit.md, every PNG in docs/ux-audit-2026-08-18/redesign/flow-2-artboards/png/, .claude/rules/design-system.md and .claude/rules/cv-templates.md. Then do the batch's tasks in order on branch build/flow-2-kit off rebrand/usefulapply. Do not commit or push. Do not add packages. Do not touch src/lib/agents, credit costs, Stripe, D1 schema or Better Auth config. Finish with npx tsc --noEmit and npm run lint, then end with the exact report format from BUILD-PLAN.md.
```
