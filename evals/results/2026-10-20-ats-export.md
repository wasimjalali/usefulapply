# CV and cover letter export: ATS and layout eval

**Date:** 2026-10-20. **Branch:** `feature/mcp-renderer-ats`. **Raw results:** `evals/results/2026-10-20-ats-export/raw/` (`results.json`, every rendered PDF and DOCX, and `baseline.tar.gz`, the 24 html2canvas PDFs; extract it to `raw/baseline/` or rerun `baseline.ts` before `run.ts` or `summarize.ts`). **Harness:** `evals/ats-export/`.

## Question

Can the export read cleanly to an ATS and look right to a recruiter in the US and in Germany, with one renderer behind both the web Download buttons and the agents? And how bad was the export it replaces?

## What ran

- **Renderer under test:** the six CV templates and both cover letter layouts, rendered on the server and printed by Browser Run (`quickAction("pdf")`, Chrome 128, `tagged: true`), metadata set with `pdf-lib`. DOCX built with `docx` 9.5.1. Real Browser Run through a remote binding, one eval Worker on port 8793.
- **Fixtures** (`evals/ats-export/fixtures/`), each through all 6 templates, PDF and DOCX (24 CV renders per format):
  - `us-one-page`: 3 roles, one page, English.
  - `de-two-page`: German, umlauts, a photo, long entries, MM/YYYY dates, two pages.
  - `over-cap`: 9 skill groups of 12 skills (108 skills), past every old cap.
  - `long-entry`: one role with 48 bullets, longer than a page.
  - Cover letters: US business letter, DIN 5008 Form B, the DIN letter again at 9 paragraphs (two pages), and a legacy body-only letter.
  - Names, employers and contacts are invented. The portrait is a synthetic silhouette.
- **PDF checks** (`lib/cv-checks.ts`): full text through `pdftotext` (reading order and raw stream order) and pdf.js, against the source data: every skill, bullet, title, employer and date range, every heading, umlauts, no mojibake, no en or em dash; title, employer and dates together per job; stream order (content under its own heading, two-column templates per page); page size, page count, margins from pdf.js text positions, smallest font (10 pt body minimum), tagging, metadata, language, embedded fonts with Unicode maps, file size under 2 MB, photo present only where the template prints one, no page-number footer.
- **DOCX checks** (`lib/docx-checks.ts`): XML structure (no tables, no text boxes, Heading 1 per section, Title for the name, anchored photo only on DACH templates, page size and margins, document properties), then a LibreOffice 26.8 headless conversion to PDF that is text-checked the same way.
- **Letter checks** (`lib/letter-checks.ts`): text positions from pdf.js and fold marks from pixels (see below).
- **ATS proxy:** the OpenResume PDF parser, pinned to commit `4f8255a2c763479837f69f1dccf2a3338730cd79`, fetched by `fetch-open-resume.sh` and not committed (it is AGPL-3.0). Its PDF reader is reimplemented against pdf.js 5 with the same text-item conversion; the only deviation is that the last item of each page is marked end-of-line, because OpenResume glues pages together otherwise. It handles single-column English only, so it gates the US fixture and is reported for the rest.
- **Baseline:** the export on `main` at `8bc7dda5` (html2canvas picture of the rendered template, sliced into pages by jsPDF), rebuilt from git history, bundled with esbuild and run in headless Chromium for the same 24 combinations (`baseline.ts`).
- **Also:** hidden items are absent from both formats; an A4 override on a US template and a Letter override on a German template reflow without clipping; cache key, signed links, client-input sanitizing, letter layout choice, file names, dates and headings (`service-checks.ts`); the markup renderer against `react-dom/server` (`markup-parity.ts`); a Playwright spec for the web buttons (`e2e/web-downloads.spec.ts`).

Command: `npx tsx --tsconfig evals/ats-export/tsconfig.json evals/ats-export/run.ts`, after `baseline.ts` and with `evals/ats-export/fetch-open-resume.sh` run once.

**Cost:** 31 renders in the final run, 224 ms of billed browser time at the median (0.97 s wall), so about 7 seconds of browser time for the whole run, well under a cent. LibreOffice 26.8 and Chromium were installed locally for the checks.

## Results

### Before and after

| | Before (html2canvas) | After |
|---|---|---|
| Text layer in the PDF | none: the page is a picture | real text, Unicode map, tagged |
| Tagged PDF | 0 of 24 | 24 of 24 |
| `pdftotext` finds the skills | 0 of 870 | 870 of 870 |
| `pdftotext` finds the bullets | 0 of 444 | 444 of 444 |
| Headings found | 0 | 120 of 120 |
| Title, employer and dates together | not readable | 24 of 24 CVs, for each of the three extractors |
| Mean file size | 1,044 KB | 68 KB |
| OpenResume on `us-one-page`, 6 templates | nothing parsed (no name, email, phone, job, bullet or skill) | name, email, phone, 3 of 3 jobs, 6 of 6 bullets, 10 of 10 skills, on all 6 templates |
| Skills on the page, `over-cap` | 25 of 108 on four templates, 45 of 108 on two (silent `.slice()` caps) | 108 of 108 on all six |
| Date ranges | `Mar 2022 – Present` (en dash) | `Mar 2022 - Present`, `03/2022 - heute` |
| Section headings | `PROFESSIONAL SUMMARY`, `CORE COMPETENCIES` | `Summary`, `Skills`, `Experience`, `Profil`, `Berufserfahrung`, `Kenntnisse` |
| Body size | 9 pt | 10 pt |
| Margins | 40 px gutter added on slice, none on content | `@page` on every page: US 0.5 in / 0.75 in, DACH 25 mm left, 20 mm right |
| Fonts | system Arial and Georgia, rasterised | Arimo and Gelasio embedded, no ligatures |

### After, by check

- **CV PDFs: 24 of 24 pass** every check above. **CV DOCX: 24 of 24 pass**, each also round-tripped through LibreOffice with every skill, bullet, contact field and heading present.
- **Cover letters: 4 of 4 PDFs pass (US, DIN, DIN two-page, legacy), 2 of 2 DOCX pass (US, DIN), each DOCX round-tripped through LibreOffice.**
  - US letter: Letter size, 25.4 mm margins, block format (no indented line), order date, recipient, salutation, closing.
  - DIN 5008 Form B, measured: return line at x 20.0 mm and baseline 48.2 mm in the 45 to 50 mm band at 7 pt; recipient at x 20.0 mm, first line top at 62.8 mm (Anschriftzone starts at 62.7), last line inside the 90 mm bottom of the field; date right edge at 190.0 mm (the right margin), starting at 141.9 mm, inside the information block that starts at 125 mm; subject bold, x 25.0 mm, baseline 102.4 mm (two blank lines under the field); one blank line (9.8 mm baseline to baseline) after the subject and after the salutation; body margins 25.0 mm left and 21.6 mm right; closing `Mit freundlichen Grüßen` with no comma; no `Betreff:`; fold marks at 105 mm and 210 mm and the hole mark at 148.5 mm found in the raster, none at the 130 mm control. The two-page version keeps its margins on page 2.
  - Legacy body-only letter: printed as written, no second header.
- **Other:** hidden items absent (PDF and DOCX), A4 and Letter overrides reflow, cache key, signed links (15 minutes, tampered, other-user, expired, no-secret), client-input sanitizing, layout choice, file names and dates all pass. `markup-parity`: 50 renders, 0 differences against `react-dom/server`.
- **Web (Playwright, local dev server, remote Browser Run):** the CV tab's Download PDF gives `Jordan_Ellis_CV.pdf` and passes every PDF check; Download Word gives `Jordan_Ellis_CV.docx` and passes the DOCX checks; the cover letter tab previews the layout in a modal and downloads a PDF and a DOCX that pass the letter checks; with the server returning 503 the browser export runs, the file downloads and the notice is shown; a signed link works without cookies and answers `Cache-Control: private, no-store`, `Referrer-Policy: no-referrer`, `nosniff`; a tampered signature, a changed expiry, the bare path and another user's application all give 404, an unauthenticated POST gives 401. Report and traces: `verify/feature-mcp-renderer-ats/e2e-report`.

### What the eval caught while it was being built

Each of these was a real defect in an earlier build of the renderer, found by a check, then fixed:

1. Letter-spaced uppercase headings extracted as `P R O F I L` in pdf.js (a failure in the German fixture on three templates). Heading letter-spacing is now 0.5 px or less.
2. `position: relative` on the Premium experience entries painted them after every other section, so the text layer read all jobs after Certifications. OpenResume found it first (no jobs parsed); the stream-order check now catches it and was shown to fail on the old PDF.
3. All-caps bold skill labels were read as section titles by OpenResume, which emptied Skills and Experience on four templates. Labels are bold mixed case with a colon.
4. The 10 pt body minimum (up from 9 pt) pushed the one-page fixture to two pages on three templates. Section spacing was tightened by 2 to 6 px and the fixture trimmed. **Existing CVs that filled a page at 9 pt can now spill a few lines onto a second page.**
5. `react-dom/server` cannot be imported in a Next route handler; replaced with a small markup renderer and the parity eval above.
6. Browser Run returned `internal error` 3 times in about 70 renders; the renderer retries.

### Known limits

- **pdftotext's reading order** for the two-column templates follows page geometry (left column first), not the content stream. The stream order (what pdf.js and most parsers read) is main column first, then sidebar, on every page. Reported as a warning, not a failure.
- **OpenResume on the German CV** does not pass and is not expected to: it parses English only and its name rule rejects `ü`. Reported in `results.json`.
- **Letter DOCX, DIN layout:** Word has no page-absolute placement without text boxes, so the address field is positioned with exact line heights. The text content passes the LibreOffice round trip; the millimetre positions are only measured on the PDF.
- **Fonts:** Arimo and Gelasio ship in the Latin and Latin Extended subsets. Cyrillic, Greek and CJK names fall back to Browser Run's installed families.
- **Not done here:** the real-ATS upload (Greenhouse or Personio test posting), which needs Wasim's accounts; the clean Opus visual judge and Wasim's own verdict on the parity images (`verify/feature-mcp-renderer-ats/parity/`, 24 images plus a summary, canvas on the left, PDF pages on the right, mean page-1 pixel difference 4.6 to 14.8 on a 0 to 255 scale, the largest from the photo placeholder that the canvas shows and the PDF omits).

## Conclusion

The server renderer replaces an image-only PDF with a tagged, fully extractable one, on every template, in both markets, and the same checks that pass 24 of 24 after fail the old export on every count that matters to a parser (no text at all). Nothing is dropped silently any more: the old skill caps are gone and anything a user leaves out is a visible, reversible hide.

## What changed because of it

- `src/lib/services/export/` (renderer, DOCX, letters, signed R2 links), `POST /api/exports`, `GET /api/exports/[...key]`; the canvas Download buttons use it and fall back to the browser export with a notice.
- Templates: print mode, standard ATS headings, hyphen date ranges, 10 pt body, self-hosted fonts, main-column-first DOM with grid placement, page-break rules, no skill caps, `hidden` flags.
- Cover letter layouts: US block letter and DIN 5008 Form B.
- Lessons 1 to 6 above are encoded as eval checks so they cannot return.
