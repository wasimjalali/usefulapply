I reviewed all 42 images visually and also measured them in code. The measurements covered panel sizes, editor-vs-PDF pixel diffs, ink extents per page, and zoomed crops at page breaks.

**Baseline facts:**
- **Page size follows the CV's data, not the template.** US-data fixtures are Letter (816×1056); DE and FR fixtures are A4 (794×1123).
- **Single-page fixtures match closely.** Editor and PDF differ by about 1% of pixels in US templates and 2.5–3.3% in DACH templates. That is anti-aliasing plus a 1–2 px offset, not content changes.
- **The multi-page editor is one continuous sheet** with no page-break markers.

| image | fidelity | quality | pagination | result | most important defect |
|---|---|---|---|---|---|
| us-one-page__premium-ats | 10 | 9 | 10 | PASS | none |
| us-one-page__modern-professional | 10 | 7 | 9 | PASS | Skills sit in a narrow sidebar (ATS reading-order risk); bottom ~23% of the page is empty |
| us-one-page__executive | 10 | 9 | 10 | PASS | none |
| us-one-page__classic-green | 10 | 9 | 10 | PASS | none |
| us-one-page__german-ats | 9 | 7 | 9 | PASS | Two-column layout in a template sold as "ATS"; bottom ~22% empty |
| us-one-page__german-classic | 9 | 9 | 10 | PASS | none |
| us-personal__premium-ats | 10 | 8 | 10 | PASS | LinkedIn sits alone on contact line 2 while line 3 holds three links |
| us-personal__modern-professional | 10 | 7 | 9 | PASS | Same lone-LinkedIn line, plus the sidebar issue |
| us-personal__executive | 10 | 8 | 10 | PASS | Lone LinkedIn on contact line 2 |
| us-personal__classic-green | 10 | 8 | 10 | PASS | Lone LinkedIn on contact line 2 |
| us-personal__german-ats | 9 | 7 | 9 | PASS | 4-line contact block with lone LinkedIn; DOB in German date format on an English Letter CV |
| us-personal__german-classic | 9 | 8 | 10 | PASS | Lone LinkedIn on contact line 2 |
| hostile__premium-ats | 10 | 8 | 10 | PASS | none (all markup shows as literal text) |
| hostile__modern-professional | 10 | 7 | 9 | PASS | none for escaping; sidebar layout as above |
| hostile__executive | 10 | 8 | 10 | PASS | none |
| hostile__classic-green | 10 | 8 | 10 | PASS | none |
| hostile__german-ats | 9 | 7 | 9 | PASS | none for escaping |
| hostile__german-classic | 9 | 8 | 10 | PASS | none |
| fr-one-page__premium-ats | 10 | 4 | 10 | FAIL | English headings + "Present" + "Diplôme d'ingénieur **in** Informatique" |
| fr-one-page__modern-professional | 10 | 4 | 9 | FAIL | English headings + "Present" |
| fr-one-page__executive | 10 | 4 | 10 | FAIL | English headings + "Present" + "…ingénieur in Informatique" |
| fr-one-page__classic-green | 10 | 4 | 10 | FAIL | English headings + "Present" + "…ingénieur in Informatique" |
| fr-one-page__german-ats | 9 | 4 | 9 | FAIL | English headings + "Present" |
| fr-one-page__german-classic | 9 | 5 | 10 | FAIL | English headings + "Present" |
| de-two-page__premium-ats | 10 | 8 | 7 | PASS | Page 1 ends with ~182 px (16%) empty because the whole 3-bullet entry moved to page 2 |
| de-two-page__modern-professional | 10 | 5 | 2 | FAIL | Page 2 holds only the "Abitur" entry (2 lines) |
| de-two-page__executive | 10 | 8 | 7 | PASS | Page 1 ends with ~144 px empty (whole entry pushed) |
| de-two-page__classic-green | 10 | 8 | 9 | PASS | none (clean break at the Ausbildung section) |
| de-two-page__german-ats | 7 | 7 | 5 | PASS | Page 2 sidebar is empty: left ~37% blank with a dangling rule; Profil wraps differently than in the editor |
| de-two-page__german-classic | 7 | 9 | 8 | PASS | Profil paragraph wraps differently in the PDF than in the editor |
| over-cap__premium-ats | 10 | 5 | 7 | PASS | Page 1 shows only 1 of 3 jobs under a wall of 108 skills |
| over-cap__modern-professional | 10 | 5 | 6 | PASS | Page 2 sidebar empty with a dangling rule |
| over-cap__executive | 10 | 5 | 7 | PASS | Page 1 shows only 1 of 3 jobs |
| over-cap__classic-green | 10 | 5 | 7 | PASS | Page 1 shows only 1 of 3 jobs |
| over-cap__german-ats | 9 | 4 | 3 | FAIL | Page 1 has no experience at all: the whole two-column block moved to page 2, leaving ~191 px (18%) blank |
| over-cap__german-classic | 9 | 5 | 7 | PASS | Page 1 shows only 1 of 3 jobs |
| long-entry__premium-ats | 10 | 6 | 8 | PASS | Pages 2–3 open with bare bullets and no "(cont.)" job header |
| long-entry__modern-professional | 10 | 5 | 5 | PASS | 4 pages instead of 3; sidebar empty on pages 2–4 |
| long-entry__executive | 10 | 5 | 2 | FAIL | Page 4 holds only the LANGUAGES heading and one line |
| long-entry__classic-green | 10 | 6 | 8 | PASS | No continuation header on pages 2–3 |
| long-entry__german-ats | 9 | 5 | 5 | PASS | 4 pages; sidebar empty on pages 2–4 |
| long-entry__german-classic | 9 | 6 | 8 | PASS | No continuation header on pages 2–3 |

## Concrete defects

**Pagination**
1. **de-two-page__modern-professional:** page 2, top. The only content is the "Abitur / Staatliches Gymnasium Rosenheim | Note: 1,9" entry plus a 50 px stub of the sidebar rule; the rest of the page is blank. The "Ausbildung" section is split one entry to each page. In the editor the whole CV is 1175 px tall, only 52 px more than one A4 page, so nothing warns the user.
2. **long-entry__executive:** page 4. It contains only "LANGUAGES / English: Native, Spanish: Professional working". Page 3 ends at Certifications with ~100 px still free.
3. **over-cap__german-ats:**
   - Page 1 ends right after the Skills block at y≈865; the bottom ~191 px is empty.
   - Languages, Certifications, all of Experience and Education are moved to page 2. A recruiter's first page has no work history.
4. **Empty sidebar on continuation pages.** The left ~35–37% of the page is blank, and the vertical divider rule still runs down beside the main column:
   - de-two-page__german-ats: page 2, rule from y≈75 to 450.
   - over-cap__modern-professional: page 2.
   - long-entry__modern-professional: pages 2–4.
   - long-entry__german-ats: pages 2–4.

   This is why both long-entry two-column renders need 4 pages where the single-column templates need 3.
5. **de-two-page__german-ats:** page 2. The signature block ("München, 20.10.2026 / Ort, Datum / Unterschrift") is squeezed into the narrow main column.
6. **de-two-page__german-ats:** page 1. The sidebar rule runs to y≈1054, about 150 px below the last main-column line.
7. **Whole entries pushed to the next page, leaving large gaps:**
   - de-two-page__premium-ats: page 1 bottom, 182 px.
   - de-two-page__executive: page 1 bottom, 144 px.
   - de-two-page__german-classic: page 1 bottom, 112 px.
   - over-cap__classic-green: 124 px; over-cap__premium-ats: 102 px.

   In each case the 3-bullet "Softwareentwickler" entry (DE) or the 2nd and 3rd jobs (over-cap) were moved whole instead of splitting between bullets.
8. **All long-entry images:** continuation pages start with naked bullets (e.g. "Delivered platform initiative 14:…") and never repeat "Principal Engineer — Atlas Infrastructure Group (cont.)". Page breaks never cut a line, which I checked at full resolution.
9. **All multi-page PDFs:** page 1 has no footer, while pages 2+ show "Name · Page N of M" ("Seite N von M" for DE). Numbering is inconsistent.

**Fidelity**
10. **de-two-page__german-ats and de-two-page__german-classic:** Profil paragraph, PDF page 1 at y≈330–400.
    - The editor breaks line 1 after "…Logistikbranche."
    - The PDF pulls "Verantwortlich" up onto line 1, so every following line breaks differently ("…Führung von 22" vs "…Führung von 22 Mitarbeitenden").
    - The diff bands there are 12–14% even at the best alignment. Other DACH bands show a steady 1 px horizontal and 1–2 px vertical offset, with header name y=79 in the editor vs 77 in the PDF.
11. **All multi-page fixtures:** the editor shows no page-break guides, so the user cannot predict defects 1–3 or 7.

**Market fit and localization**
12. **All six fr-one-page images:**
    - Section headings stay English: SUMMARY, SKILLS, EXPERIENCE, EDUCATION, CERTIFICATIONS, LANGUAGES. EXPERIENCE also lacks the French accent ("EXPÉRIENCE").
    - Dates read "03/2021 - Present" instead of "Aujourd'hui".
    - Premium-ats, executive and classic-green render "Diplôme d'ingénieur **in** Informatique" in the Education entry.

    German localization clearly exists (PROFIL, KENNTNISSE, heute, Seite 2 von 2), so French is simply missing.
13. **us-personal__german-ats / german-classic:** DOB shows as "07.04.1989" on an English-language Letter CV. This is allowed for DACH templates, but the US reader will likely misread the date format.
14. **us-personal (all US templates):** DOB and nationality are correctly suppressed.
15. **de-two-page (all US templates):** photo, DOB, nationality and signature are correctly dropped, and the page stays A4.

**Professional quality and layout**
16. **Contact header wrapping looks broken:**
    - us-personal, all six templates: line 2 holds only "linkedin.com/…", and line 3 holds three items.
    - fr-one-page, all six templates: "Lyon, France" drops to line 2 although line 1 has ~300 px free.
17. **modern-professional and german-ats, one-page fixtures:**
    - Skills, Languages and Certifications sit in a ~180 px sidebar, so "Certified Kubernetes / Administrator / CNCF" spans three lines.
    - About 20–25% of the page bottom is blank.
    - A two-column body is an ATS reading-order risk, especially for a template branded "ATS".
18. **over-cap, all templates:** all 108 skills (A1–I12, about 30 lines) render in full in both editor and PDF. I saw no cap or truncation, and on a real CV this wall of skills pushes the experience section mostly onto page 2.
19. **All templates:** date ranges use a hyphen ("Mar 2022 - Present", "04/2019 - heute") instead of an en dash.
20. **hostile, all six templates:** `</title><script>`, `<b>`, `<i>`, `&`, `"Quotes"`, `<img src=…>` and `<iframe>` all render as literal text, with no double escaping and no image loaded. This passed everywhere.

## Overall verdict
Editor-to-PDF fidelity is excellent in the US templates and slightly weaker in the DACH templates, where the DE profile paragraph wraps differently. Escaping and personal-data suppression are correct everywhere. The real problems are the pagination engine and localization. It cannot split a two-column block, and it moves whole entries to the next page; that causes a near-empty page 2 in de-two-page__modern-professional, a fourth page holding one line in long-entry__executive, and a page 1 without work history in over-cap__german-ats. Continuation pages of two-column templates waste over a third of the page width on an empty sidebar. The French CV comes out half in English in every template, which no French recruiter would accept. 9 of 42 fail.