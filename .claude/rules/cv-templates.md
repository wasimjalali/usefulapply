---
description: CV template rules and standards
globs: ["src/components/cv-templates/**", "src/lib/cv-templates/**"]
---

# CV Template Rules

## Font Standard (all templates)
- **Body text:** `Arial, Helvetica Neue, Helvetica, sans-serif`
- **Headers (name, title, section headers):** `Georgia, Times New Roman, serif`
- System fonts only — no Google Fonts, no CDN dependencies, no external loading

## ATS Compliance Requirements
- Body text: 10-12pt (10-13px)
- Section headers: 14-16pt
- Name: 18-28pt
- Line spacing: 1.0 or 1.15
- Standard bullets: • or – only (no custom symbols)
- No tables, no text boxes, no columns for critical content
- Margins: 0.5" to 1" on all sides

## Template Registry (`src/lib/cv-templates/types.ts`)
| ID | Component | Color | Page Size | Layout |
|----|-----------|-------|-----------|--------|
| `premium-ats` | `USPremiumATSTemplate` | #0F3057 navy | Letter | Single-col |
| `modern-professional` | `USProfessionalTemplate` | #2C7A7B teal | Letter | Two-col |
| `executive` | `USModernATSTemplate` | #702459 burgundy | Letter | Single-col |
| `german-ats` | `GermanATSTemplate` | #1E3A5F slate blue | A4 | Two-col |
| `german-classic` | `GermanClassicTemplate` | #374151 charcoal | A4 | Single-col |
| `classic-green` | `ClassicGreenTemplate` | #2D6A4F forest green | Letter | Single-col |

## Adding a New Template
1. Create component in `src/components/cv-templates/`
2. Add template definition to `src/lib/cv-templates/types.ts`
3. Add import + switch case to `src/components/cv-templates/index.tsx`
4. Add icon, gradient, recommendation, style to `src/components/cv-templates/TemplateSelector.tsx`

## Download Filename Convention
- Original CV: `{ApplicantName}_CV.pdf`
- Optimized CV: `{ApplicantName}_{CompanyName}_CV.pdf`
- Cover Letter: `{ApplicantName}_{CompanyName}_Cover_Letter.pdf/.docx`
- Always English labels (CV, Cover_Letter) — filesystem artifacts use English regardless of document language
- Special chars sanitized to underscores
