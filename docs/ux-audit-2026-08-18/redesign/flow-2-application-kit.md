# Flow 2: the Application Kit panels. Locked 19 August 2026.

Approved by Wasim on 19 Aug 2026 after one feedback round. Inherits the shell from `flow-1-first-run.md`. Read `../design-philosophy.md` first.

## Canvas and visuals

- **Locked canvas (5 artboards):** https://claude.ai/code/artifact/a8fda81e-f1bb-4a4b-91b2-a2921a501841
- **Rendered artboards (PNG, 1440x900):** `flow-2-artboards/png/` (K1 ATS view, K2 Templates, K3 Cover letter, K4 Emails, K5 Screening answers).
- Sources: `flow-2-artboards/gen3.mjs` (imports the shared tokens and spine partials from `flow-1-artboards/`). `node gen3.mjs` regenerates the `.dc.html` files; `node ../shoot.mjs <dir> <out>` renders PNGs.

## Shell decisions made here (apply to every flow, flow 1 updated to match)

- **Gold is the only button fill.** It marks the single primary action on a surface (one chip in the chat, one button on a card). "New application" and "Download all" are quiet outlined buttons. Navy is for non-button emphasis only (selected stepper dot, user avatar).
- **Chat header:** company and role in serif, status beneath ("Kit ready", "Started just now"). No history icon (the sidebar is the history) and no credit balance (it lives in the settings menu and appears inline on any chip that costs credits).

## The kit, surface by surface

All of it lives in the canvas column. Tab row: **CV / Cover letter / Emails**, plus **Answers** once the first screening answer exists. One outlined **Download all** at the far right of the tab row on every kit tab.

### K1 · CV and the ATS view
- Row under the tabs: **Original / Tailored** toggle, "Tailored for Pixellot.", and the **ATS 78% · see every change** chip in sage tint (`sage-50` bg, `sage-700` text, both states; a thin sage ring when active).
- Toolbar: Templates, Edit, Copy, Download PDF.
- Clicking the ATS chip opens **a view of its own in the canvas** (the CV is replaced, never squeezed): "← Back to CV" outlined button, title "What changed in your CV", the ATS chip at the right. Content: a score card (bar, one-line strategy, "Four changes, nothing added"), then one card per change with **Before** (struck through, muted) and **After** (sage highlight) side by side and a one-line reason, then a sage "Nothing added" line naming the gaps that stayed gaps. Back returns to the CV page.

### K2 · Templates
- Templates opens a **strip under the toolbar, all six visible**: thumbnail, name, and a short "best for" tag (Recommended, Tech & startups, DACH & NL...). Thumbnails draw instantly as placeholders and the real preview fills in behind; no blank cards. Selected = gold ring. Picking one re-renders the CV below.

### K3 · Cover letter
- Toolbar: Edit (inline), Copy, one **Download** menu (PDF / DOCX). Right side: "Updated just now · 214 words".
- **No Regenerate button. The chat is the regenerate button.** The user asks for the change in plain language; the assistant states the cost before doing it ("Rewriting it costs 0.5 credits (you have 2.5)", one gold chip "Rewrite it · 0.5 credits"), then a named stage and a one-line confirmation. The same pattern covers the emails and the CV.

### K4 · Emails
- One tab, both emails **stacked, full width of the canvas** (cards are fluid, `box-sizing: border-box`). Each card: title, **Copy email**, SUBJECT, BODY. The follow-up carries the **Send after 5 to 7 business days** chip. The old sending-tips block is one muted line above: "Attach the CV and cover letter as PDFs when you send."

### K5 · Screening answers (Wasim chose variant 3 of 3)
- Paste a question in the chat. The chat shows one stage ("Answering from your CV · STAR shape, 38% adoption result") and a one-liner ("Your answer's on the right. Copy it from there, or tell me to make it shorter or more formal.").
- The answer **streams into the canvas as a document** ("Screening answers · Pixellot", numbered Q&A, Copy per answer) and the **Answers tab opens itself** with a count. Toolbar: Copy all, Download. Long Q&A never clogs the conversation. Back to CV via the tab row.
- This is the one place the canvas is allowed to switch tab on its own (rule 4), because the user just asked for exactly that.

## Notes for the spec and build

1. **Download all** bundles the tailored CV (PDF), cover letter (PDF + DOCX), both emails (TXT) and, when present, the answers (PDF). Per-document downloads stay in each tab's toolbar.
2. **Edit** is the existing inline canvas editing (EditableCVCanvas) and the cover letter's inline editor. Unchanged behaviour, same place.
3. **Cost before commitment in chat.** Any request that triggers a paid regeneration gets a cost chip first; free edits (inline typing, template switch, copy, download) never do.
4. **ATS view data** comes from the existing ATS insights payload (score, strategy, improvements). Before/after pairs need the optimizer to return the original snippet alongside each change; if a change has no snippet, show the reason line only.
5. **Templates strip** uses the six existing templates (`.claude/rules/cv-templates.md`); thumbnails are static SVG placeholders per template, previews render lazily behind them.
6. **Answers document** persists per application and is included in the tracker row's kit.

## Out of scope for flow 2

Feed results and Edit feed (flow 3). Tracker table (flow 4). Settings pages (flow 5).
