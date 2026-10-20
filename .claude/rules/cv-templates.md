---
paths:
  - "src/components/cv-templates/**"
  - "src/lib/cv-templates/**"
---

# CV Templates (6 total)

| ID | Name | Color | Market |
|----|------|-------|--------|
| `premium-ats` | Premium ATS | #0F3057 navy | Default |
| `modern-professional` | Modern Professional | #2C7A7B teal | Tech |
| `executive` | Executive | #702459 burgundy | Senior |
| `german-ats` | German ATS | #1E3A5F slate blue | DE two-col |
| `german-classic` | German Classic | #374151 charcoal | DE single-col |
| `classic-green` | Classic Green | #2D6A4F forest green | All industries |

All templates: Arimo body + Gelasio headers (SIL OFL, metric twins of Arial and Georgia), self-hosted in `public/fonts/` and loaded by the canvas and by the PDF export alike.

## Export rules (the same components render the canvas and the PDF)

- The templates have no `'use client'` and no store imports. `CvTemplateSwitch` (`render.tsx`) is the server-safe switch; `index.tsx` is the canvas wrapper. The export renders with `mode="print"`, which drops the page box (`@page` owns size and margins, see `src/lib/cv-templates/print-spec.ts`) and every edit affordance.
- Never cut content to fit. The `.slice()` skill caps are gone. A user can hide an item, a skill group, a skill or a section (`hidden`, `hiddenItems`, `hiddenSections` in the CV JSON, `src/lib/cv-templates/hidden.ts`); the canvas and exports skip them.
- Body text is 10 pt or larger. Dates use a hyphen: `Mar 2022 - Present`, `03/2022 - heute`. Headings come from `sectionHeading()`: `Summary`, `Skills`, `Experience` or `Profil`, `Kenntnisse`, `Berufserfahrung`. Contact details stay in the body.
- Keep the text layer clean. Heading letter-spacing stays at 0.5 px or less (pdf.js splits wider spacing into `P R O F I L`). No `position`, `transform`, `opacity` or other stacking-context styles on content (they paint late and reorder the text layer). No all-caps bold labels inside a section (a simple parser reads them as section titles). Two-column templates keep the main column first in the DOM and place the sidebar with grid columns, never `order`.
- Colours and fonts in templates are inline styles. The export page has no Tailwind.
- Skills print as one wrapped line per group, `Label: a, b, c` with a bold label (`SkillLines` in `shared.tsx`), never one bullet per item. Spoken languages are their own section (`LanguageLine`), not part of the skills block. A skills list over 700 characters prints full width above a two-column template's grid (`skillsOverflowSidebar`).
- Pagination is CSS classes, set in `src/lib/services/export/print-css.ts`: headings `break-after: avoid`; an experience entry keeps its header with the first two bullets and the last two bullets together; never `break-inside: avoid` on a section, a skill block or anything that can be taller than a page. A sidebar section's heading repeats on the next page (`SideSection`).
- Paper follows the CV's market, not the template: `cvPaper()` (`src/lib/cv-templates/paper.ts`) gives Letter for a US or Canadian CV and A4 for everyone else. An explicit `paper` override wins. Pass it to `rootBox()`.
- Links show a clean address (`displayUrl()` in `src/lib/cv-templates/url.ts`: no scheme, no `www.`, no query) and open the full https URL (`fullUrl()`). Never a label alone. Letterheads carry at most two links, LinkedIn first (`pickLetterLinks`). Date of birth and nationality print on the DACH templates only.
- Continuation pages carry a footer, `Name · Page 2 of 3` or `Name · Seite 2 von 3`, drawn in `addContinuationFooters` (`pdf.ts`). Contact details stay in the body.
- A change here changes the PDF bytes. `RENDERER_VERSION` (`src/lib/services/export/renderer-version.ts`) is a hash of the templates, shared pieces, print CSS, fonts and helpers, so a template or CSS edit changes it by itself. Bump `RENDERER_REVISION` only for a change that is not in that hash (a heading table, a DOCX layout). Run `evals/ats-export/` (`README.md` there).
