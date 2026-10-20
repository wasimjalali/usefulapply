I reviewed all **52 images**. Paper size is correct everywhere: every page of US data is Letter (ratio about 0.773, DACH templates included) and every page of FR/ES/IT/NL/PT/DE data is A4 (about 0.707). PDF fidelity is near-pixel-exact in every image; the PDF content sits about 1px higher than the editor's, which doesn't matter. All the defects are in pagination and typography.

| image | fidelity | quality | pagination | verdict | most important defect |
|---|---|---|---|---|---|
| us-one-page__premium-ats | 10 | 9 | 10 | PASS | none |
| us-one-page__modern-professional | 10 | 9 | 10 | PASS | none |
| us-one-page__executive | 10 | 9 | 10 | PASS | none |
| us-one-page__classic-green | 10 | 9 | 10 | PASS | none |
| us-one-page__german-ats | 10 | 9 | 10 | PASS | none |
| us-one-page__german-classic | 10 | 9 | 10 | PASS | none |
| us-personal__premium-ats | 10 | 7 | 10 | PASS | Portfolio URL cut to "…/work/selected-ca…" in PDF |
| us-personal__modern-professional | 10 | 7 | 10 | PASS | Portfolio URL cut with ellipsis |
| us-personal__executive | 10 | 7 | 10 | PASS | Portfolio URL cut with ellipsis |
| us-personal__classic-green | 10 | 7 | 10 | PASS | Portfolio URL cut with ellipsis |
| us-personal__german-ats | 10 | 7 | 10 | PASS | Portfolio URL cut with ellipsis (date of birth and nationality shown, which DACH allows) |
| us-personal__german-classic | 10 | 7 | 10 | PASS | Portfolio URL cut with ellipsis (date of birth and nationality shown, which DACH allows) |
| hostile__premium-ats | 10 | 9 | 10 | PASS | none (markup shows as literal text) |
| hostile__modern-professional | 10 | 9 | 10 | PASS | none |
| hostile__executive | 10 | 9 | 10 | PASS | none |
| hostile__classic-green | 10 | 9 | 10 | PASS | none |
| hostile__german-ats | 10 | 9 | 10 | PASS | none |
| hostile__german-classic | 10 | 9 | 10 | PASS | none |
| fr-one-page__premium-ats | 10 | 8 | 10 | PASS | Straight apostrophe in "Aujourd'hui"; no space before colons |
| fr-one-page__modern-professional | 10 | 8 | 10 | PASS | Same French typography issues |
| fr-one-page__executive | 10 | 8 | 10 | PASS | Same French typography issues |
| fr-one-page__classic-green | 10 | 8 | 10 | PASS | Same French typography issues |
| fr-one-page__german-ats | 10 | 8 | 10 | PASS | Same French typography issues |
| fr-one-page__german-classic | 10 | 8 | 10 | PASS | Same French typography issues |
| es-one-page__premium-ats | 10 | 8 | 10 | PASS | "Grado en Ingeniería en Informática" (doubled "en") |
| es-one-page__german-ats | 10 | 9 | 10 | PASS | none |
| it-one-page__premium-ats | 10 | 9 | 10 | PASS | none |
| it-one-page__german-ats | 10 | 9 | 10 | PASS | none |
| nl-one-page__premium-ats | 10 | 9 | 10 | PASS | none |
| nl-one-page__german-ats | 10 | 9 | 10 | PASS | none |
| pt-one-page__premium-ats | 10 | 9 | 10 | PASS | none |
| pt-one-page__german-ats | 10 | 9 | 10 | PASS | none |
| fr-two-page__premium-ats | 10 | 8 | 9 | PASS | Page 2 about 65% empty; same French typography issues |
| fr-two-page__german-ats | 10 | 8 | 9 | PASS | Page 2 about 65% empty; same French typography issues |
| de-two-page__german-ats | 10 | 9 | 9 | PASS | none of note (page 2 about half empty) |
| de-two-page__german-classic | 10 | 9 | 9 | PASS | Two certificates sit side by side on one line |
| de-two-page__premium-ats | 10 | 8 | 8 | PASS | Page 1's last bullet sits about 20px above the footer |
| de-two-page__modern-professional | 10 | 8 | 9 | PASS | none of note |
| **de-two-page__executive** | 10 | 6 | **5** | **FAIL** | "Softwareentwickler" entry split: 1 bullet on p1, 2 on p2 |
| de-two-page__classic-green | 10 | 8 | 9 | PASS | none of note |
| over-cap__premium-ats | 10 | 7 | 9 | PASS | 108 skills read as keyword stuffing (a data problem); breaks are clean |
| over-cap__modern-professional | 10 | 7 | 8 | PASS | Skills box split across pages; page-2 piece has no top padding or heading |
| over-cap__executive | 10 | 7 | 9 | PASS | none of note |
| over-cap__classic-green | 10 | 7 | 9 | PASS | none of note |
| over-cap__german-ats | 10 | 7 | 9 | PASS | Skills list continues on p2 without a heading |
| over-cap__german-classic | 10 | 7 | 9 | PASS | none of note |
| long-entry__premium-ats | 10 | 7 | 7 | PASS | Pages 2–3 open mid-entry with no "(cont.)" label |
| long-entry__modern-professional | 10 | 7 | 7 | PASS | Same: no continuation label |
| long-entry__executive | 10 | 7 | 7 | PASS | Same: no continuation label |
| long-entry__classic-green | 10 | 7 | 7 | PASS | Same: no continuation label |
| long-entry__german-ats | 10 | 7 | 7 | PASS | Same: no continuation label |
| long-entry__german-classic | 10 | 7 | 7 | PASS | Same: no continuation label |

### Every concrete defect

1. **de-two-page__executive, bottom of PDF page 1 and top of page 2:** the "Softwareentwickler / Alpen Systemhaus GmbH" entry is split after its first bullet ("Entwicklung von Java-Anwendungen…"). Page 2 then opens with two bullets that have no title, company or heading. The other five templates keep this 3-bullet entry together, so the keep-together rule is missing or broken in executive only.
2. **The editor has no page preview (all multi-page images):** the left panel is one continuous sheet with no page-break markers and no footer. A user can't see defect 1, or any other split, before exporting.
3. **All 6 us-personal images, header, third contact line:** the portfolio URL is printed as `portfolio.jordan-ellis.example/work/selected-ca…`. On paper the link can't be used, and text extraction gives an ATS a truncated URL. Long URLs should wrap, not be cut with an ellipsis.
4. **All 6 long-entry images, tops of PDF pages 2 and 3:** the 48-bullet "Principal Engineer" entry continues with no repeated title or "(cont.)" label, so a recruiter reading page 2 or 3 alone can't tell which job the bullets belong to. All 48 bullets are present and in order, and no bullet is split mid-line. I checked the boundaries: 13→14 and 36→37 in premium-ats; 12/13 and 34/35 in executive; 14/15 and 37/38 in classic-green; 16/17 and 39/40 in modern-professional; 15/16 and 37/38 in german-ats; 13/14 and 36/37 in german-classic.
5. **de-two-page__premium-ats, bottom of PDF page 1:** the last bullet ("Schulung von Anwenderinnen…") ends about 20px above the "Seite 1 von 2" footer. The other templates leave 35–65px.
6. **over-cap__modern-professional, top of PDF page 2:** the tinted skills box continues with "DevOps:" pressed against the box's top edge (no padding) and no section heading.
7. **over-cap__german-ats, top of PDF page 2:** the skills list continues at "Testing:" with no "Skills" heading.
8. **All fr-one-page and fr-two-page images, date column and labels:**
   - "Aujourd'hui" uses a straight apostrophe, while the content uses a curly one ("d’ingénieur", "d’expérience").
   - Labels like "Langages:", "Français:" and "Anglais:" have no space before the colon, which French typography expects ("Langages :"). The bullets in the same CV do have it ("livraison 1 : …"), so the inconsistency is visible.
9. **es-one-page__premium-ats, Formación:** the template's degree/field connector produces "Grado en Ingeniería **en** Informática". It reads awkwardly; the real degree title is "Grado en Ingeniería Informática". The german-ats version avoids this with a comma.
10. **de-two-page__german-classic, executive and classic-green, Zertifikate:** the two certificates sit side by side on one line, which is mildly at odds with the single-column ATS approach. german-ats and modern-professional stack them.
11. **US templates given German data (de-two-page__premium-ats, modern-professional, executive and classic-green):** the photo, date of birth, nationality and the place/date/signature block are all dropped. This is consistent with the US-template rule, but a German user who picks one of these templates gets no warning that their DACH data won't appear.

### Overall verdict

The export is very faithful: in all 52 images the PDF matches the editor in content, order, typography, colour and spacing. Letter/A4 and the photo and personal-data rules are correct in every case, and hostile markup always renders as literal text. The one failure is a pagination bug in **executive only**: a 3-bullet entry is split 1/2 across pages, while the other five templates keep it together. Other recurring weaknesses:
- no "(cont.)" label when an entry runs over a page;
- a long portfolio URL printed with an ellipsis instead of wrapping;
- no page-break preview in the editor, which hides problems like the executive split until export;
- minor French typography slips.

Fix the executive keep-together rule and the URL truncation, and the set is ready for both the US and DACH markets.