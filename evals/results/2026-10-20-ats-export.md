# CV and cover letter export: ATS and layout eval

**Date:** 2026-10-20, round 1 after the PR #154 review. **Branch:** `feature/mcp-renderer-ats`. **Raw results:** `evals/results/2026-10-20-ats-export/raw/` (`results.json`, every rendered PDF and DOCX, `baseline.tar.gz` with the html2canvas PDFs and today's jsPDF letters, and `results-round0.json`, the first-round results kept for comparison). **Design judge:** `evals/results/2026-10-20-ats-export/judge-opus-round1.md` (a clean Opus judge on the first 24 parity images, 14 of 24 failed on pagination; the fixes below answer it). **Harness:** `evals/ats-export/` (`README.md` there has every command).

## Question

Can the export read cleanly to an ATS and look right to a recruiter in the US and in Germany, with one renderer behind both the web Download buttons and the agents? And how bad was the export it replaces?

## What ran

- **Renderer under test:** the six CV templates and both cover letter layouts, rendered on the server and printed by Browser Run (`quickAction("pdf")`, Chrome 128, `tagged: true`), metadata and continuation footers added with `pdf-lib`. DOCX built with `docx` 9.5.1. Real Browser Run through a remote binding, one eval Worker on port 8793.
- **Fixtures** (`evals/ats-export/fixtures/`), each through all 6 templates, PDF and DOCX (42 CV renders per format):
  - `us-one-page`: 3 roles, one page, English.
  - `us-personal`: the same CV with a date of birth, a nationality, a `www.` link with a tracking query and a trailing-slash portfolio link.
  - `de-two-page`: German, umlauts, a photo, long entries, MM/YYYY dates, two pages.
  - `fr-one-page`: French (no German dates, headings or footer, A4).
  - `over-cap`: 9 skill groups of 12 skills (108 skills), past every old cap.
  - `long-entry`: one role with 48 bullets, longer than a page.
  - `hostile`: `</title><script>`, `<img src=https://...>` and `<iframe>` typed into the summary, a bullet and an employer name.
  - Cover letters: US block letter, DIN 5008 Form B, the DIN letter at 9 paragraphs (two pages), a DIN letter with a 13-line sender block, a US-layout letter on a German CV, and a legacy body-only letter.
  - A 60-certification German CV for the sidebar templates (heading repeat).
  - Names, employers and contacts are invented. The portrait is a synthetic silhouette.
- **PDF checks** (`lib/cv-checks.ts`): full text through every extractor below against the source data: every skill (as one `Label: a, b, c` line for stream readers, as a whole token otherwise), every bullet (matched one-to-one, so a short bullet cannot hit inside a long one), title, employer and date range together per job, every heading and its order, umlauts, no mojibake, no en or em dash; clean link text and a clickable annotation with the full https URL for every link, no label-only link text, no raw `https://` in the visible text; date of birth and nationality present on DACH templates and absent on US ones; the continuation footer on pages 2 and up and nothing on page 1; page size against a hand-written paper per fixture (Letter for US CVs, A4 for German and French ones); margins from pdf.js text positions with the footer excluded; no page with more than 15% empty at its foot; Experience starts on page 1; smallest body text 10 pt; tagging, metadata, language, embedded fonts with Unicode maps, file size under 2 MB, photo only where the template prints one.
- **DOCX checks** (`lib/docx-checks.ts`): no tables or text boxes, Heading 1 per section and in the PDF's order, Title for the name, anchored photo only on DACH templates, real `w:hyperlink` elements for every link, date of birth and nationality only on DACH, page size and margins, document properties, then a LibreOffice 26.8 round trip to PDF that is checked the same way. A failed conversion is a failed check.
- **Letter checks** (`lib/letter-checks.ts`): text positions from pdf.js and fold marks from pixels; nothing prints inside the DIN address field but the return line and the recipient; the sender's two clean links are printed and clickable and a third is not. The letter DOCX is converted by LibreOffice and its DIN positions are measured too.
- **ATS proxies, all local, no CV data to a third party:**
  - Apache Tika 3.3.3 (pinned jar, SHA-512 checked by `ats/setup.sh`), PyMuPDF 1.27.2.3 `get_text()`, pdfminer.six 20260107, pdf.js and pdftotext (reading order and raw).
  - The OpenResume parser at commit `4f8255a2c763479837f69f1dccf2a3338730cd79`. It is AGPL-3.0, so its source is not in this repository: `fetch-open-resume.sh` downloads it into a gitignored folder and `lib/openresume.ts`, our own code, calls it unmodified. It handles single-column English only.
  - An AI parser stand-in: the Tika text goes to Workers AI `@cf/openai/gpt-oss-120b` (reasoning effort low, temperature 0) which returns the fields an ATS would store, scored exactly against the source. 42 calls, 41,588 input and 45,755 output tokens, **about $0.05** at list price ($0.35 and $0.75 per million tokens, Cloudflare's pricing page).
  - Gates: the stream readers (raw, pdf.js, Tika, PyMuPDF) must be perfect on every template. pdftotext in reading order and pdfminer.six must be perfect on single-column templates and are reported on the two two-column templates, where a geometric reader merges the sidebar into the main column. OpenResume must read every `us-one-page` CV completely. The AI parser must read name, email and phone and at least 90% of jobs, bullets and skills on the English one-page CVs.
- **Baseline:** the export on `main` at `8bc7dda5` (html2canvas picture of the rendered template sliced into pages by jsPDF, and the jsPDF text letter), rebuilt from git history, bundled with esbuild and run in headless Chromium for the same 42 CVs and both letters (`baseline.ts`).
- **Also:** hidden items absent from both formats; an A4 override on a US template and a Letter override on a German one reflow without clipping; hostile text literal in every extractor and Browser Run's request blocking proven with a control; a US-layout letter on a German CV gets an English file name, title, language and Letter paper; a French CV gets nothing German; a sidebar section that runs past a page repeats its heading; cache key, signed links, client-input sanitizing, letter layout choice, file names, dates and headings, hidden state, renamed headings (`service-checks.ts`); the markup renderer against `react-dom/server` (`markup-parity.ts`); a Playwright spec for the web buttons (`e2e/web-downloads.spec.ts`).

Command: `npm run eval:write --prefix evals/ats-export` (a plain `npm run eval` writes to `verify/ats-export-run` and never touches the committed results), after `baseline.ts`, `ats/setup.sh` and `fetch-open-resume.sh` have been run once.

**Cost:** 76 Browser Run renders in the final run, 188 ms of billed browser time at the median (0.89 s wall), about 14 seconds of browser time for the whole run, well under a cent. The AI parser about $0.05. LibreOffice 26.8, Chromium, Tika and the Python extractors ran locally.

## Results

### Before and after

| | Before (html2canvas, jsPDF) | After |
|---|---|---|
| Text layer in the PDF | none: the page is a picture | real text, Unicode map, tagged |
| Tagged PDF | 0 of 42 | 42 of 42 |
| Skills found, `pdftotext`, pdf.js, PyMuPDF, pdfminer.six | 0 of 1,032 | 1,032 of 1,032 each |
| Bullets found, same four | 0 of 528 | 528 of 528 each (pdfminer.six 520: sidebar merged into a bullet on two-column templates, reported) |
| Headings found, same four | 0 of 252 | 252 of 252 each |
| Tika (with Tesseract OCR on the old pictures) | skills 0, bullets 442 of 528, headings 85 of 252 | skills 1,032, bullets 528, headings 252 of 252 |
| Title, employer and dates together | not readable | 42 of 42 CVs for pdf.js, raw, Tika, PyMuPDF, pdfminer.six; 41 of 42 for pdftotext reading order (a French two-column CV, reported) |
| Umlauts and accents kept | n/a | 42 of 42 CVs, every extractor |
| Mean file size | 892 KB | 53 KB |
| OpenResume, 6 templates of `us-one-page` | nothing parsed | name, email, phone, 3 of 3 jobs, 6 of 6 bullets, 10 of 10 skills on all 6 |
| OpenResume, all 42 (it reads single-column English only) | nothing parsed | contact 30 of 42, jobs 70 of 108, bullets 371 of 528, skills 930 of 1,032 |
| AI parser, English one-page CVs (12) | nothing to read | name, email, phone 12 of 12, jobs 36 of 36, bullets 72 of 72, skills 120 of 120 |
| AI parser, all 42 | nothing to read | contact 42 of 42, jobs 97 of 108, bullets 528 of 528, skills 1,023 of 1,032 |
| Skills on the page, `over-cap` | 25 of 108 on four templates, 45 of 108 on two. Computed from the old `.slice()` caps; read by Tika with OCR from the old PDFs: 24 to 40 | 108 of 108 on all six, every extractor |
| Cover letter, US | A4 (wrong paper), untagged, 6 failed checks | Letter, tagged, passes |
| Cover letter, DIN | untagged, date printed inside the address field, 14 failed checks | passes, DIN zones measured |
| Date ranges | `Mar 2022 – Present` (en dash) | `Mar 2022 - Present`, `03/2022 - heute` |
| Section headings | `PROFESSIONAL SUMMARY`, `CORE COMPETENCIES` | `Summary`, `Skills`, `Experience`, `Profil`, `Berufserfahrung`, `Kenntnisse` |
| Body size | 9 pt | 10 pt |
| Paper | one per template | per CV market: Letter for US and Canadian CVs, A4 for the rest |
| Fonts | system Arial and Georgia, rasterised | Arimo and Gelasio embedded, no ligatures |

The AI parser misses are jobs and skills where the model changed or dropped a value (the raw parse is not stored, so each miss was not triaged). The same text passes every exact check, so these are model variance, not a text-layer defect.

### After, by check

- **CV PDFs: 42 of 42 pass** every check above, **CV DOCX: 42 of 42 pass**, each also round-tripped through LibreOffice.
- **Cover letters: 5 of 5 PDFs pass (US, DIN, DIN two-page, DIN with a 13-line sender, legacy), 3 of 3 DOCX pass (US, DIN, DIN with the long sender), each DOCX round-tripped through LibreOffice.**
  - US letter: Letter size, 25.4 mm margins, block format, order date, recipient, salutation, closing.
  - DIN 5008 Form B, measured: return line at x 20.0 mm in the 45 to 50 mm band at 7 pt; recipient at x 20.0 mm, first line top at 62.8 mm; date right edge at the right margin, inside the information block; subject bold; one blank line after the subject and after the salutation; closing without a comma; fold marks at 105 mm and 210 mm and the hole mark at 148.5 mm found in the raster. A 13-line sender block shrinks its letterhead to the 30 mm above the field and nothing prints over the address field, in the PDF and in the DOCX (recipient top 63.2 mm, date beside it, measured on the LibreOffice render).
  - The return line is the name, the street and the postcode with city, even when the letterhead has more lines.
  - Legacy body-only letter: printed as written, no second header.
- **Other: 6 of 6 extra checks and 8 of 8 service checks pass.** Hidden items absent (PDF and DOCX); A4 and Letter overrides reflow; hostile text is literal in the text layer of all six templates for pdftotext, pdf.js, Tika, PyMuPDF and pdfminer.six, with no image fetched; Browser Run's request blocking stops a remote image (the control render, without the pattern, loads it); a US-layout letter on a German CV is `Juergen_Mueller-Schaefer_Cover_Letter.pdf`, English title, English `/Lang`; the French CV has no `heute`, `Berufserfahrung` or `Seite`; a certifications list of 60 repeats its heading on every continuation page of both sidebar templates and loses nothing. `markup-parity`: 86 renders, 0 differences against `react-dom/server`.
- **Web (Playwright 1.64.1, local dev server, remote Browser Run): 5 of 5.** Download PDF gives `Jordan_Ellis_CV.pdf` and passes every PDF check; Preview PDF opens the server PDF in a dialog (focus on Close, Escape closes it, focus returns to the button); Download Word passes the DOCX checks; the cover letter tab previews the layout the same way and downloads a PDF and a DOCX; an edited letter body exports the edited text, not the stale structured copy; with the server returning 503 the browser export runs, the file downloads and the notice is shown; a signed link works without cookies and answers `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `nosniff`; a tampered signature, a changed expiry, the bare path and another user's application all give 404, an unauthenticated POST gives 401. Report and traces: `verify/feature-mcp-renderer-ats/e2e-report`.
- **Parity images** (canvas left, PDF pages right, 42 images): `verify/feature-mcp-renderer-ats/parity/`. Page-1 pixel difference 4.0 to 25.2 on a 0 to 255 scale, mean 10.8. The largest are the long fixtures, where the canvas is one long sheet and the PDF paginates.

### What the review fixed

The design judge (`judge-opus-round1.md`) failed 14 of 24 images, almost all on pagination. What changed:

1. **Pagination:** no `break-inside: avoid` on anything that can be taller than a page; an experience entry keeps its header with the first two bullets and the last two bullets together; headings `break-after: avoid`. The eval now fails a page with more than 15% empty at its foot and an Experience section that starts on page 2.
2. **Compact skills:** one wrapped `Label: a, b, c` line per group in every template, canvas, PDF and DOCX. 108 skills take about 10 lines instead of 1.5 pages.
3. **Languages** are their own section. **Continuation pages** carry `Name · Page 2 of 3` / `Name · Seite 2 von 3`. **Paper follows the CV's market**, not the template (a German CV on Premium ATS is A4).
4. **Sidebar sections** repeat their heading on the next page, as a real `thead` (Chrome repeats nothing else). The repeated heading is the same text on every page: print CSS cannot turn a later copy into "(continued)".
5. **German signature block** with the labels under the lines; **contact rows** balance their wrap; the canvas shows no empty photo box (Add photo moved to the toolbar) and has a **Preview PDF** action.
6. **Links** show a clean address (`linkedin.com/in/name`), open the full https URL, and are real hyperlinks in the DOCX; letterheads carry at most two, LinkedIn first. Date of birth and nationality print on DACH templates only, PDF and DOCX.
7. **Review fixes in the app:** an edited letter exports its edited body; hiding survives renaming and cannot be folded away; a hidden entry is marked in the chat outline and refused for edits; a chat rename is shown as written; French CVs no longer get German dates; the preview dialog is accessible; cache-miss renders have their own tighter limit; the signing secret is checked before rendering; the cache key covers the applicant and company, and the renderer version is a hash of the sources.
8. **The eval itself:** exact token matching, DOCX section order against the PDF, a failed LibreOffice conversion is a failure, DOCX letter positions measured through LibreOffice, a hostile-text fixture, a cover-letter baseline, the over-cap before counts labelled as computed from the old constants and cross-checked by OCR, no machine-specific paths, complete dependencies, and a plain rerun no longer overwrites the committed results.

### What the eval caught while it was being built

Each of these was a real defect in an earlier build of the renderer, found by a check, then fixed:

1. Letter-spaced uppercase headings extracted as `P R O F I L` in pdf.js. Heading letter-spacing is now 0.5 px or less.
2. `position: relative` on the Premium experience entries painted them after every other section, so the text layer read all jobs after Certifications.
3. All-caps bold skill labels were read as section titles by OpenResume. Labels are bold mixed case with a colon.
4. The 10 pt body minimum pushed the one-page fixture to two pages on three templates. **Existing CVs that filled a page at 9 pt can now spill a few lines onto a second page.**
5. `react-dom/server` cannot be imported in a Next route handler; replaced with a small markup renderer. The hostile fixture then showed it left `"` and `'` unescaped in text (harmless, but not byte-identical to React): it escapes the same five characters now.
6. Browser Run returned `internal error` 3 times in about 70 renders; the renderer retries.
7. The DOCX letterhead printed 10 pt lines on a 6 pt pitch for a long sender, and the DIN return line wrapped onto two lines and pushed the recipient 5 mm down. Both fixed; the long-sender fixture and the LibreOffice position check keep them fixed.
8. Pinned the wrong thing twice in the eval itself: an image count cannot show request blocking (a blocked image prints a broken-image placeholder), and Tika appends every link URL after the text. The probe and the check were rewritten.
9. The date of birth check matched `deutsch` in the Languages section. It now needs the label as well.
10. The web spec found that the preview dialog lost its opener (the button is disabled while the PDF builds) and that Tab inside a PDF iframe could reach the app behind it. The opener is passed in and the rest of the page is inert while the dialog is open.

### Known limits

- **Two-column templates and geometric readers.** pdftotext in reading order and pdfminer.six merge the sidebar's lines into the main column when they share a row (14 warnings, 6 pdfminer findings in `results.json`). The stream readers (pdf.js, Tika, PyMuPDF) read main column first, then sidebar, on every page. Single-column templates read clean everywhere.
- **No "(continued)" text** on a repeated sidebar heading (see above). A sidebar can only run past a page with a very long certification list; skills over 700 characters print full width above both columns.
- **Sidebar templates, pages 2 and up:** the main column keeps its narrow width next to an empty sidebar column.
- **OpenResume** does not pass the German or French CV and is not expected to: it parses English only and its name rule rejects `ü`. Reported in `results.json`.
- **AI parser** is a model: run to run it can differ by a date or a skill (97 of 108 jobs, 1,023 of 1,032 skills over all 42), and its raw output is not stored. Only the English one-page CVs gate, at 90%.
- **Tika OCR.** The machine had Tesseract, so Tika read the old picture PDFs partially; an ATS without OCR reads nothing from them.
- **Letter DOCX, DIN layout:** Word has no page-absolute placement without text boxes, so the address field is positioned with exact line heights. Measured on LibreOffice's render: recipient top within 0.5 mm of the PDF, date beside it. Word itself was not available.
- **Fonts:** Arimo and Gelasio ship in the Latin and Latin Extended subsets. Cyrillic, Greek and CJK names fall back to Browser Run's installed families.
- **Not done, and replaced:** the real-ATS upload (Greenhouse or Personio test posting). There is no account for either and no CV data may go to a third-party ATS, so the local proxies above stand in. They are open source or ours, they run on this machine, and the AI stand-in sees only invented fixtures.
- **Wasim's own verdict** on the parity images is still open, and the judge reruns on the new ones.

## Conclusion

The server renderer replaces an image-only PDF with a tagged, fully extractable one on every template and in both markets, and 42 of 42 CVs read completely and in the right order to every stream reader, Tika, PyMuPDF, pdf.js, the OpenResume parser (single-column English) and an LLM parser. The old export fails every one of those. Nothing is dropped silently: the old skill caps are gone, anything a user leaves out is a visible, reversible hide, and pagination no longer leaves half-empty pages or orphaned headings.

## What changed because of it

- `src/lib/services/export/` (renderer, DOCX, letters, signed R2 links), `POST /api/exports`, `GET /api/exports/[...key]`; the canvas Download buttons use it and fall back to the browser export with a notice.
- Templates: print mode, standard ATS headings, hyphen date ranges, 10 pt body, self-hosted fonts, main-column-first DOM with grid placement, pagination rules, compact skills, Languages sections, clean links, continuation footers, paper by market, no skill caps, `hidden` flags.
- Cover letter layouts: US block letter and DIN 5008 Form B.
- Lessons 1 to 10 above are encoded as eval checks so they cannot return.
