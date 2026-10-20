---
paths:
  - "src/components/cv-templates/**"
  - "src/lib/cv-templates/**"
---

# CV Templates (6 total, all single-column)

| ID | Name | Color | Market |
|----|------|-------|--------|
| `premium-ats` | Premium ATS | #0F3057 navy | Default |
| `modern-professional` | Modern Professional | #2C7A7B teal | Tech |
| `executive` | Executive | #702459 burgundy | Senior |
| `german-ats` | German ATS | #1E3A5F slate blue | DE single-col, photo top right |
| `german-classic` | German Classic | #374151 charcoal | DE single-col |
| `classic-green` | Classic Green | #2D6A4F forest green | All industries |

Every template is a single column that a parser reads top to bottom (`atsReadingOrder: 'single-column'` in the template metadata, exposed by the MCP `list_cv_templates` tool). A new template must be one too: the ATS eval fails any reading order that is not the template's own in pdftotext, pdf.js, Tika, PyMuPDF and pdfminer.six. A layout with a sidebar is not allowed.

All templates: Arimo body + Gelasio headers (SIL OFL, metric twins of Arial and Georgia), self-hosted in `public/fonts/` and loaded by the canvas and by the PDF export alike.

## Export rules (the same components render the canvas and the PDF)

- The templates have no `'use client'` and no store imports. `CvTemplateSwitch` (`render.tsx`) is the server-safe switch; `index.tsx` is the canvas wrapper. The export renders with `mode="print"`, which drops the page box (`@page` owns size and margins, see `src/lib/cv-templates/print-spec.ts`) and every edit affordance.
- Never cut content to fit. The `.slice()` skill caps are gone. A user can hide an item, a skill group, a skill or a section (`hidden`, `hiddenItems`, `hiddenSections` in the CV JSON, `src/lib/cv-templates/hidden.ts`); the canvas and exports skip them.
- Body text is 10 pt or larger. Dates use a hyphen: `Mar 2022 - Present`, `03/2022 - heute`. Headings come from `sectionHeading()`: `Summary`, `Skills`, `Experience` or `Profil`, `Kenntnisse`, `Berufserfahrung`. Contact details stay in the body.
- Keep the text layer clean. Heading letter-spacing stays at 0.5 px or less (pdf.js splits wider spacing into `P R O F I L`). No `position`, `transform`, `opacity` or other stacking-context styles on content (they paint late and reorder the text layer). No all-caps bold labels inside a section (a simple parser reads them as section titles).
- Colours and fonts in templates are inline styles. The export page has no Tailwind.
- Skills print as one wrapped line per group, `Label: a, b, c` with a bold label (`SkillLines` in `shared.tsx`), never one bullet per item. Spoken languages are their own section (`LanguageLine`), not part of the skills block.
- Pagination is CSS classes, set in `src/lib/services/export/print-css.ts`: headings `break-after: avoid`; an experience entry keeps its header with its first bullet and its last bullet with the one before it (three or more bullets can split between them, two stay whole); never `break-inside: avoid` on a section, a skill block or anything that can be taller than a page. Vertical lists are block stacks (`cv-stack`, `stackGap` in `shared.tsx`), not flex columns: a flex column pushed a heading and its first entry to the next page as one piece.
- Spacing and line height are written as `calc(Npx * var(--cv-d, 1))` and `calc(1.4 * var(--cv-ld, 1))`, so the export's fit pass can tighten a CV that leaves a nearly empty last page (up to about 6%, two extra renders, kept only if it saves a page; `src/lib/services/export/fit.ts`). Use the same form for any new spacing.
- Paper follows the CV's market, not the template: `cvPaper()` (`src/lib/cv-templates/paper.ts`) gives Letter for a US or Canadian CV and A4 for everyone else. An explicit `paper` override wins. Pass it to `rootBox()`.
- Links show a clean address (`displayUrl()` in `src/lib/cv-templates/url.ts`: no scheme, no `www.`, no query) and open the full https URL (`fullUrl()`). Never a label alone. Letterheads carry at most two links, LinkedIn first (`pickLetterLinks`). Date of birth and nationality print on the DACH templates only.
- Every page of a multi-page export carries a footer, `Name · Page 1 of 3`, `Name · Seite 1 von 3`, `Page 1 sur 3` and so on (`exportText()` in `export-text.ts`, drawn in `addContinuationFooters`, `pdf.ts`). A one-page CV has none. Contact details stay in the body.
- Seven languages have their own headings, open-ended label, degree connector, field labels, date format and document words: en, de, fr, es, pt, it, nl (`locale.ts`, `export-text.ts`). A new wording goes in those tables, never in a template. A date of birth follows the CV's language and market (`birthdate.ts`).
- The `@page` right margin carries 0.2257 mm extra on A4 (`A4_PRINT_WIDTH_EXCESS_MM`): Browser Run's Chrome makes the A4 page 0.64 pt wider than the canvas sheet, which moved line breaks.
- A change here changes the PDF bytes. `RENDERER_VERSION` (`src/lib/services/export/renderer-version.ts`) is a hash of every file in the template, cv-template and export folders plus the font bytes, computed at build time by `next.config.ts`, so any edit that can change an export changes the cache key by itself. Bump `RENDERER_REVISION` only for a change outside those folders. Run `evals/ats-export/` (`README.md` there).
