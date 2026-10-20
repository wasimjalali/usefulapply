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
- A change here changes the PDF bytes: bump `RENDERER_VERSION` in `src/lib/services/export/types.ts`, and run `evals/ats-export/` (`README.md` there).
