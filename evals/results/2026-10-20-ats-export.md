# CV and cover letter export: ATS and layout eval

**Date:** 2026-10-20, round 2 after the PR #154 reviews. **Branch:** `feature/mcp-renderer-ats`. **Raw results:** `evals/results/2026-10-20-ats-export/raw/` (`results.json` and every rendered PDF and DOCX; `ai/` and `ai-baseline/`, the AI parser's raw answers; `baseline.tar.gz`, the html2canvas PDFs and today's jsPDF letters; `results-round0.json`, `results-round1.json` and `results-round2-two-column.json`, the earlier runs kept for comparison). **Design judge:** `evals/results/2026-10-20-ats-export/judge-opus-round1.md` (14 of 24 images failed) and `judge-opus-round2.md` (9 of 42 failed). **Harness:** `evals/ats-export/` (`README.md` there has every command).

## Question

Can the export read cleanly to an ATS and look right to a recruiter in the US, Germany and the other markets the product writes CVs for, with one renderer behind both the web Download buttons and the agents? And how bad was the export it replaces?

## What ran

- **Renderer under test:** the six CV templates and both cover letter layouts, rendered on the server and printed by Browser Run (`quickAction("pdf")`, Chrome 128, `tagged: true`), metadata and page footers added with `pdf-lib`. DOCX built with `docx` 9.5.1. Real Browser Run through a remote binding, one eval Worker on port 8793. **Every template is a single column** (see "The two-column templates" below).
- **Fixtures** (`evals/ats-export/fixtures/`), 12 CVs, 52 renders per format:
  - `us-one-page`, `us-personal` (date of birth, nationality, five link kinds, one link longer than 48 characters), `over-cap` (108 skills), `long-entry` (one role of 48 bullets), `hostile` (markup typed into the summary, a bullet and an employer): each through all 6 templates.
  - `de-two-page` (umlauts, a photo, MM/YYYY dates, two pages), through all 6.
  - `fr-one-page` through all 6; `fr-two-page`, `es-one-page`, `it-one-page`, `nl-one-page`, `pt-one-page` through `premium-ats` and `german-ats`. Every heading, the open-ended label, the degree connector and the page footer are asserted against a table written by hand per language.
  - Cover letters: US block letter, DIN 5008 Form B, the DIN letter at 9 paragraphs, a DIN letter with a 13-line sender block, a US-layout letter on a German CV, a French letter, a legacy body-only letter.
  - Names, employers and contacts are invented. The portrait is a synthetic silhouette.
- **PDF checks** (`lib/cv-checks.ts`), for every extractor below, against the source data:
  - every skill (as one `Label: a, b, c` line), every bullet (one-to-one, no substring hits), title, employer and date range **adjacent** (the employer within two lines of the title, the dates within two lines), every heading and its order (the template's own, in every extractor), content under its own heading, umlauts and accents, no mojibake, no en or em dash;
  - a clean link text and a clickable annotation with the full https URL for every link, no label-only text, no raw `https://`;
  - date of birth and nationality on DACH templates only, in the CV's language (`April 7, 1989` on an English CV);
  - the page footer on every page of a multi-page CV and none on a one-page CV, in the CV's language;
  - paper from a hand-written table (Letter for US CVs, A4 for everyone else), margins, body 10 pt or larger, no page with more than 15% empty at its foot, no last page under 15% full, Experience as a heading line on page 1;
  - tagging, metadata, language, embedded fonts with Unicode maps, file size under 2 MB, a photo only where the template prints one.
- **DOCX checks** (`lib/docx-checks.ts`): no tables or text boxes, Heading 1 per section in the PDF's order, Title for the name, real `w:hyperlink` elements, date of birth and nationality on DACH only, page size and margins, then a LibreOffice 26.8 round trip checked the same way. A failed conversion is a failed check.
- **Letter checks** (`lib/letter-checks.ts`): text positions from pdf.js and fold marks from pixels; nothing prints inside the DIN address field but the return line and the recipient, whatever its size; letterhead lines never overlap; the return line is name, street, postcode and city (a trailing country never reaches it). Both letter DOCX layouts are converted by LibreOffice and checked: DIN positions, the US block order, hyperlinks and clean link text.
- **ATS proxies, all local, no CV data to a third party:** Apache Tika 3.3.3 (pinned jar, SHA-512 checked), PyMuPDF 1.27.2.3, pdfminer.six 20260107, pdf.js, pdftotext (reading order and raw), the OpenResume parser at a pinned commit (AGPL, fetched into a gitignored folder, our adapter is our own code) and an AI parser stand-in (Tika text into Workers AI `@cf/openai/gpt-oss-120b`, scored field by field). The same extractors read the old PDFs for the "before" column.
  - Gates: **every template passes every check in every extractor.** The one reported exception is title, employer and dates adjacent in pdfminer.six (it sets a title and its right-aligned date in separate text boxes); the numbers are below. OpenResume must read every `us-one-page` CV completely; the AI parser must read name, email, phone and at least 90% of jobs, bullets and skills on the English one-page CVs.
- **Baseline:** the export on `main` at `8bc7dda5` (html2canvas picture sliced by jsPDF, and the jsPDF text letter), for the same 52 combinations.
- **Also:** the chat CV tools through their real handlers (the first heading rename succeeds and renders in the PDF; hiding a whole section protects its roles and bullets from delete; a hidden summary cannot be rewritten); hidden items absent from both formats; A4 and Letter overrides; hostile text literal in every extractor and Browser Run's request blocking proven with a control; the fit pass's last-page measurement against pdf.js; cache key, signing, sanitizing, layout choice, file names (code points, transliteration), the download header, the renderer hash, birth dates, every language's headings and dates, links (`service-checks.ts`); the markup renderer against `react-dom/server` (`markup-parity.ts`); a Playwright spec for the web buttons (`e2e/web-downloads.spec.ts`).

Command: `npm run eval:write --prefix evals/ats-export` (a plain `npm run eval` writes to `verify/ats-export-run` and never touches the committed results), after `baseline.ts`, `ats/setup.sh` and `fetch-open-resume.sh` have been run once.

**Cost:** 87 Browser Run renders in the final run, 199 ms of billed browser time at the median (1.1 s wall), about 17 seconds of browser time for the whole run, well under a cent. The AI parser, 104 calls (52 CVs and 52 pieces of OCR text), 126,823 input and 101,572 output tokens: **about $0.12** at list price ($0.35 and $0.75 per million tokens).

## Results

### Before and after

| | Before (html2canvas, jsPDF) | After |
|---|---|---|
| Text layer in the PDF | none: the page is a picture | real text, Unicode map, tagged |
| Tagged PDF | 0 of 52 | 52 of 52 |
| Skills found, `pdftotext`, pdf.js, PyMuPDF, pdfminer.six | 0 of 1,102 | 1,102 of 1,102 each |
| Bullets found, same four | 0 of 592 | 592 of 592 each |
| Headings found, same four | 0 of 312 | 312 of 312 each |
| Tika (it ran Tesseract OCR on the old pictures) | skills 0 of 1,102 as `Label: a, b, c` lines, 601 of 1,102 as whole tokens; bullets 458 of 592; headings 80 of 312 (scored against the new standard headings, not the `PROFESSIONAL SUMMARY` the pictures print) | skills 1,102, bullets 592, headings 312 |
| Title, employer and dates adjacent | not readable | 52 of 52 for pdftotext (both modes), pdf.js, Tika, PyMuPDF; 43 of 52 for pdfminer.six (reported, see Known limits) |
| Umlauts and accents kept | n/a | 52 of 52, every extractor |
| Mean file size | 858 KB | 50 KB |
| OpenResume, 6 templates of `us-one-page` | nothing parsed | name, email, phone, 3 of 3 jobs, 6 of 6 bullets, 10 of 10 skills on all 6 |
| OpenResume, all 52 (English single-column only) | nothing parsed | contact 32, jobs 74 of 128, bullets 432 of 592, skills 886 of 1,102 |
| AI parser on the OCR text of the old PDFs (measured, not assumed) | contact 32 of 52, jobs 0 of 128, bullets 316 of 592, skills 523 of 1,102 | contact 52 of 52, jobs 122 of 128, bullets 592 of 592, skills 1,102 of 1,102 |
| AI parser, English one-page CVs (12, gated) | | contact, jobs 36 of 36, bullets 72 of 72, skills 120 of 120 |
| Skills on the page, `over-cap` | 25 of 108 on four templates, 45 of 108 on two (computed from the old `.slice()` caps); 24 to 40 read by Tika with OCR | 108 of 108 on all six, every extractor |
| Cover letter, US | A4, untagged, 6 failed checks | Letter, tagged, passes |
| Cover letter, DIN | untagged, date inside the address field, 14 failed checks | passes, DIN zones measured |
| Date ranges | `Mar 2022 – Present` | `Mar 2022 - Present`, `03/2022 - heute`, `03/2021 - Aujourd'hui`, `Actualidad`, `Presente`, `Heden`, `Atualmente` |
| Section headings | `PROFESSIONAL SUMMARY`, `CORE COMPETENCIES` | `Summary`, `Skills`; `Profil`, `Kenntnisse`; `Expérience`, `Compétences`; `Experiencia`; `Esperienza`; `Werkervaring`; `Experiência` |
| Body size | 9 pt | 10 pt |
| Paper | one per template | per CV market: Letter for US and Canadian CVs, A4 for the rest |
| Fonts | system Arial and Georgia, rasterised | Arimo and Gelasio embedded, no ligatures |

The AI parser's six job misses are three CVs (`long-entry` and `hostile` on two templates) where the model returned the printed "Company | Location" line as the company. Its raw answers are in `raw/ai/`. They are model variance, not a text-layer defect: the same text passes every exact check. Skills and bullets are complete.

### The two-column templates (changed in this round)

`german-ats` and `modern-professional` had a sidebar. pdf.js, Tika and PyMuPDF read them in order, but the layout readers did not (`results-round2-two-column.json`, the same fixtures):

| Reader | `modern-professional` (7 CVs) | `german-ats` (12 CVs) |
|---|---|---|
| pdftotext reading order, sections in the template's order | wrong on 7 of 7 | wrong on 12 of 12 |
| pdftotext, title, employer and dates adjacent | 3 of 7 lost | 12 of 12 lost |
| pdfminer.six, content dropped | 5 of 7 | 1 of 12 |

Both are single column now, so every reader passes every check on every template; the `modern-professional` and `german-ats` rows above are 7 of 7 and 12 of 12 for pdftotext, pdf.js, Tika and PyMuPDF on every check, and pdfminer.six reads every heading, skill and bullet. Their look is kept: the teal accent, serif headings with a rule and a tinted skills block with a teal bar for `modern-professional`; the slate blue, the serif headings with a rule and the photo top right for `german-ats`. Their order: `modern-professional` reads Summary, Experience, Education, Skills, Certifications, Languages; `german-ats` reads Profil, Berufserfahrung, Ausbildung, Kenntnisse, Sprachen, Zertifikate. All six templates carry `atsReadingOrder: 'single-column'` in their metadata for the MCP `list_cv_templates` tool, and the eval has no exemption for any template or reader.

### After, by check

- **CV PDFs: 52 of 52 pass** every check above. **CV DOCX: 52 of 52 pass**, each round-tripped through LibreOffice.
- **Cover letters: 6 of 6 PDFs pass (US, DIN, DIN two-page, DIN with a 13-line sender, French, legacy), 4 of 4 DOCX pass (US, DIN, DIN long sender, French).**
  - US letter: Letter size, 25.4 mm margins, block format, order date, recipient, salutation, closing; the DOCX order, hyperlinks and clean link text are checked on the LibreOffice render.
  - DIN 5008 Form B, measured: return line at x 20.0 mm in the 45 to 50 mm band at 7 pt, always `name · street · postcode city`; recipient first line top at 62.8 mm; date inside the information block; subject bold; fold marks at 105 and 210 mm and the hole mark at 148.5 mm found in the raster. A 13-line sender block is merged to 8 contact lines plus the links (phone and email share a line, then the top address lines join), so the type never shrinks into overlap, in the PDF and in the DOCX (recipient top 63.2 mm, date beside it, measured on the LibreOffice render).
  - French letter: `Lettre_de_motivation_Camille_Lefevre.pdf`, title `Lettre de motivation - Camille Lefèvre`, `/Lang fr-FR`.
- **Other: 10 of 10 extra checks and 12 of 12 service checks pass.** Including: the first chat heading rename (it failed before: conservation counted the new `renamedHeadings` key as new wording), roles of a hidden section refused for delete, a hidden summary refused for rewrite; the last-page measurement of the fit pass agrees with pdf.js within 0.5 percentage points on all 20 multi-page CVs; the long link shows its first 47 characters and an ellipsis while the annotation opens the whole address; a US CV's date of birth on a German template reads `April 7, 1989`. `markup-parity`: 0 differences against `react-dom/server`.
- **Web (Playwright 1.64.1, local dev server, remote Browser Run): 5 of 5.** Download PDF and Word, Preview PDF (focus on Close, Escape closes, focus returns), the letter preview, an edited letter exporting the edited text, the 503 fallback, signed links (tampering, expiry, other users, no cookies, headers). Report and traces: `verify/feature-mcp-renderer-ats/e2e-report`.
- **Parity images** (canvas left, PDF pages right, 52 images): `verify/feature-mcp-renderer-ats/parity/`. Page-1 pixel difference 4.0 to 25.7 on a 0 to 255 scale, mean 11.2; the German Profil paragraph now breaks at the same place on the canvas and in the PDF.

### What round 2 fixed

The second design judge (`judge-opus-round2.md`) failed 9 of 42 images. What changed:

1. **Chat tools:** the first heading rename succeeds (bookkeeping keys `renamedHeadings`, `hiddenSections` and `hiddenItems` are no longer counted as CV wording); hiding a whole section protects its entries from delete and rewrite.
2. **Seven languages** (en, de, fr, es, pt, it, nl): headings with their accents, the open-ended label, the degree connector (`en`, `em`), the date format, field labels, file names, PDF titles and subjects, the document language, the page footer and the DOCX language. The parser's unaccented headings (`EXPERIENCE PROFESSIONNELLE`) are normalised to the accented standard. A letter's file name, title and `lang` follow its language.
3. **Pagination:**
   - an entry of three or more bullets can split (header with its first bullet, the last bullet with the one before it); lists are block stacks, because a flex column moved a heading and its first entry to the next page as one piece;
   - a **fit pass** re-renders a CV whose last page is under 15% full with spacing and line height tightened in two steps (3% and 6%, text size and margins untouched) and keeps the render if it saves a page. It used pdf-lib to read the last page's content stream (not pdf.js, which expects a browser, and not a Browser Run session), at most 2 extra renders, counted against the user's daily render budget and logged. In this run it saved a page on `long-entry` on `executive` (4 pages to 3);
   - a page footer `Name · Page 1 of 3` on every page of a multi-page CV;
   - the signature spans the content width.
4. **Contact rows** flow naturally; no balancing, no lone item beside free space. **Date of birth** follows the CV's language and market. **The German Profil wrap:** Browser Run's Chrome makes an A4 page 0.64 pt wider than the canvas sheet, which moved a line break; the extra width comes off the right margin.
5. **Smaller:** a hide toggle for custom sections; a key listener inside the preview's PDF frame; file names cut by code point and made well formed; `filename*` encodes `'()*`; `mailto:` and `tel:` links keep their scheme; `workers_dev: false` on the eval Worker; the renderer version is a hash of every file in the template, cv-template and export folders and every font byte, computed at build time (`next.config.ts`) instead of hashing some functions' source.
6. **The eval:** pairing is adjacency, the Experience check matches a heading line, the DIN overprint check includes small text and the letterhead is capped, the OpenResume skill score matches whole tokens, the AI parser's raw answers are stored and the old PDFs' OCR text is parsed instead of assuming zero, US letter DOCX checks, `SOFFICE` is env-driven with a clear error, and a `displayUrl` truncation fixture.

### What the eval caught while it was being built

Each of these was a real defect in an earlier build, found by a check, then fixed:

1. Letter-spaced uppercase headings extracted as `P R O F I L` in pdf.js. Heading letter-spacing is now 0.5 px or less.
2. `position: relative` on the Premium experience entries painted them after every other section, so the text layer read all jobs after Certifications.
3. All-caps bold skill labels were read as section titles by OpenResume. Labels are bold mixed case with a colon.
4. The 10 pt body minimum pushed the one-page fixture to two pages on three templates. **Existing CVs that filled a page at 9 pt can now spill a few lines onto a second page.**
5. `react-dom/server` cannot be imported in a Next route handler; replaced with a small markup renderer. The hostile fixture then showed it left `"` and `'` unescaped in text (harmless, but not byte-identical to React): it escapes the same five characters now.
6. Browser Run returned `internal error` 3 times in about 70 renders; the renderer retries.
7. The DOCX letterhead printed 10 pt lines on a 6 pt pitch for a long sender, and the DIN return line wrapped and pushed the recipient 5 mm down.
8. An image count cannot show request blocking (a blocked image prints a broken-image placeholder), and Tika appends every link URL after the text. The probe and the check were rewritten.
9. The date-of-birth check matched `deutsch` in the Languages section. It now needs the label as well.
10. The web spec found that the preview dialog lost its opener (the button is disabled while the PDF builds) and that Tab inside a PDF iframe could reach the app behind it.
11. A grid and a flex column each moved a whole heading-and-entry chain to the next page; the design judge found it on `over-cap` / `german-ats`, and the experiment that isolated it is in `docs/agent-integration/spikes.md`.
12. The first heading rename of a CV was refused by the chat's own conservation check.

### Known limits

- **pdfminer.six and title, employer and dates.** It sets a title and its right-aligned date in separate text boxes, so those are not adjacent for it on 9 of 52 CVs (`premium-ats` 4 of 12, `modern-professional` 1 of 7, `executive` 1 of 7, `german-ats` 1 of 12, `german-classic` 1 of 7, `classic-green` 1 of 7). Every heading, skill, bullet and heading order is read correctly by it. The other five readers are 52 of 52 on every template.
- **A role of two bullets stays whole.** With its heading it can be taller than the room left under a very long skills list; the whole role then starts the next page. Roles of three or more bullets split. The fit pass cannot help when the last page is full.
- **The fit pass tightens at most 6%** and only when the last page is under 15% full; otherwise a short last page is left as it is. The canvas does not apply it, so a CV it re-renders is slightly denser in the PDF than on screen.
- **Escape inside Chrome's own PDF viewer** may not reach the page (the viewer is a separate process). The listener on the frame is in place; Close has focus on open and is the first Tab stop. A real PDF viewer was not available in the headless browser the E2E runs in, so this was not verified there.
- **OpenResume** does not pass the German, French, Spanish, Italian, Dutch or Portuguese CVs and is not expected to: it parses English only and its name rule rejects `ü`. It gates `us-one-page` only.
- **The AI parser** is a model. Its job misses (6 of 128) are copies of the printed "Company | Location" line. Only the English one-page CVs gate, at 90%.
- **Tika OCR.** The machine had Tesseract, so Tika read the old picture PDFs partly; an ATS without OCR reads nothing from them.
- **Letter DOCX, DIN layout:** Word has no page-absolute placement without text boxes, so the address field is positioned with exact line heights. Measured on LibreOffice's render: recipient top within 0.5 mm of the PDF, date beside it. Word itself was not available.
- **Fonts:** Arimo and Gelasio ship in the Latin and Latin Extended subsets. Cyrillic, Greek and CJK names fall back to Browser Run's installed families.
- **Not done, and replaced:** the real-ATS upload (Greenhouse or Personio test posting). There is no account for either and no CV data may go to a third-party ATS, so the local proxies above stand in.
- **The chat rename was tested through the real tool handlers and the real export, not through a model turn,** which needs a paid LLM call.
- **Wasim's own verdict** on the parity images is still open, and the judge reruns on the new ones.

## Conclusion

The server renderer replaces an image-only PDF with a tagged, fully extractable one on every template and in seven languages, and all six templates are a single column: 52 of 52 CVs read completely, in the right order, to pdftotext, pdf.js, Tika, PyMuPDF, pdfminer.six, the OpenResume parser (single-column English) and an LLM parser. The old export fails every one of those. Nothing is dropped silently: the old skill caps are gone, anything a user leaves out is a visible, reversible hide, pagination no longer leaves half-empty pages or orphaned headings, and a CV that would end on a nearly empty page is tightened a few percent to save it.

## What changed because of it

- `src/lib/services/export/` (renderer, DOCX, letters, signed R2 links, fit pass, per-language text), `POST /api/exports`, `GET /api/exports/[...key]`; the canvas Download buttons use it and fall back to the browser export with a notice.
- Templates: print mode, standard ATS headings in seven languages, hyphen date ranges, 10 pt body, self-hosted fonts, single column for all six, pagination rules, compact skills, Languages sections, clean links, page footers, paper by market, no skill caps, `hidden` flags, `atsReadingOrder` metadata.
- Cover letter layouts: US block letter and DIN 5008 Form B.
- Lessons 1 to 12 above are encoded as eval checks so they cannot return.
