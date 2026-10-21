# CV PDF export review: 24 images (4 fixtures × 6 templates)

**Paper sizes:** the PDF pages of the four US templates measure 0.773 width-to-height, which is US Letter. The two DACH templates measure 0.707, which is A4. Each template uses the correct size for its own market.

| image | fidelity | quality | pagination | result | most important defect |
|---|---|---|---|---|---|
| us-one-page__premium-ats | 10 | 8 | 9 | PASS | none (skills listed one per line take about 140px of vertical space) |
| us-one-page__modern-professional | 10 | 7 | 8 | PASS | sidebar layout is an ATS parsing risk; bottom ~25% of the page is empty |
| us-one-page__executive | 10 | 8 | 9 | PASS | none |
| us-one-page__classic-green | 10 | 8 | 9 | PASS | none (bottom ~12% empty) |
| us-one-page__german-ats | 10 | 6 | 8 | PASS | "GitHub" wraps alone onto a second contact line; a template named "ATS" uses two columns |
| us-one-page__german-classic | 6 | 7 | 9 | PASS | editor shows a dashed "Photo" box that is missing from the PDF, so the header reflows |
| de-two-page__premium-ats | 9 | 7 | 7 | PASS | ~14% empty band at the bottom of p1 (job 2 moved whole); German CV on Letter |
| de-two-page__modern-professional | 8 | 5 | 4 | FAIL | "TOGAF 9 Zertifizierung" orphaned at the top of the p2 sidebar with no heading; p2 ~85% empty |
| de-two-page__executive | 9 | 7 | 7 | PASS | ~10% empty band at the bottom of p1; Letter paper |
| de-two-page__classic-green | 9 | 7 | 6 | PASS | ~18% empty band at the bottom of p1 |
| de-two-page__german-ats | 9 | 7 | 7 | PASS | ~13% empty band below job 2 on p1 |
| de-two-page__german-classic | 9 | 8 | 7 | PASS | ~13% empty band below job 1 on p1 |
| over-cap__premium-ats | 9 | 4 | 4 | FAIL | p3 holds only Education and Certifications (~10% of the page used) |
| over-cap__modern-professional | 8 | 2 | 2 | FAIL | p2 and p3 are sidebar-only skill lists, ~75% empty |
| over-cap__executive | 9 | 4 | 4 | FAIL | p3 holds only Education and Certifications |
| over-cap__classic-green | 9 | 4 | 4 | FAIL | p3 is a near-empty last page; p1 bottom ~20% empty |
| over-cap__german-ats | 8 | 2 | 2 | FAIL | p2 and p3 are sidebar-only, and their lists continue with no heading |
| over-cap__german-classic | 7 | 5 | 5 | PASS (marginal) | ~22% empty band at the bottom of p1 |
| long-entry__premium-ats | 5 | 3 | 2 | FAIL | p1 ~55% empty: Experience pushed to p2, then split anyway |
| long-entry__modern-professional | 4 | 2 | 1 | FAIL | p1 holds only the header and summary (~75% empty); 5 pages total |
| long-entry__executive | 5 | 3 | 2 | FAIL | p1 ~55% empty: Experience pushed to p2 |
| long-entry__classic-green | 5 | 3 | 2 | FAIL | p1 ~58% empty: Experience pushed to p2 |
| long-entry__german-ats | 4 | 2 | 1 | FAIL | p1 ~73% empty; bullet 48 alone at the top of p5 |
| long-entry__german-classic | 4 | 3 | 2 | FAIL | p1 ~55% empty; bullet 48 alone at the top of p4; photo box missing from PDF |

## Defects found

### Across many images
- **Editor never paginates (all `de-two-page`, `over-cap` and `long-entry` images).** The left panel is one continuous canvas with no page-break markers, so the user cannot see where pages 1 and 2 end. Every pagination defect below is therefore invisible before export.
- **Blocks taller than the space left are still kept together (all `long-entry` images).** The Experience heading and first entry are moved to the next page even though the entry is longer than a page and gets split anyway. The rule should be dropped when a block cannot fit on any page.
- **No name or page number on continuation pages.** This applies to every multi-page PDF. On the 4–5 page long-entry PDFs, pages 2+ start straight into bullet text.
- **Two headings both read "Languages:" (all `over-cap` images).** The skill category "Languages" and the spoken-languages block share the label. In premium-ats, executive and classic-green they even sit side by side in the first skills row (columns 1 and 3).
- **Skills are listed one item per line in every template.** 108 skills therefore fill about 1.5 pages and push Experience off page 1 in every over-cap PDF. Comma-separated lines per category would take about 10 lines.
- **Skill cap not enforced.** If the product has a skill cap (the fixture name suggests one), neither the editor nor the PDF applies it.

### us-one-page
- **premium-ats:** Skills block (y≈320–470) is three one-per-line columns. The Languages column holds two items and leaves about 100px of empty space under it.
- **modern-professional:** The sidebar wraps "Spanish: Professional / working" onto two lines. Both columns end at y≈800, leaving about 270px empty at the bottom.
- **executive:** Nothing significant. The shaded summary box is identical in the editor and the PDF.
- **classic-green:** Nothing significant.
- **german-ats:** A US CV on A4, which follows from the template. Header: "GitHub" wraps alone onto a second contact line (y≈196) in both views. Two-column sidebar body. Bottom ~25% empty. The side margins are wider than in the US templates.
- **german-classic:** The editor's header has a dashed "Photo" placeholder (top right, ~130×175px), and the PDF has none. In the editor the contacts wrap to two lines; in the PDF they fit on one, and all content sits about 95px higher than in the editor. Leaving the placeholder out of the PDF is right; showing it in the editor is the fidelity bug.

### de-two-page
- **premium-ats:** The photo, Geburtsdatum, Staatsangehörigkeit and signature block are dropped. That matches the editor, so it is not a fidelity bug, but it is wrong for DACH. The PDF is Letter, not A4, for a München CV. P1 ends after job 1 with about 115px empty.
- **modern-professional:** The p1 sidebar shows "Zertifikate" with only "Certified Scrum Professional". "TOGAF 9 Zertifizierung / The Open Group" is stranded at the top-left of p2 with no section heading. P2 also holds only Ausbildung and is about 85% empty.
- **executive:** P1 ends at y≈750 of 840. P2 is about half filled. Letter paper.
- **classic-green:** P1 ends at y≈690 of 840, about 150px empty. The "Teamleiter" entry (4 bullets) was moved whole instead of being split after 2 bullets.
- **german-ats:** P1 main column ends after job 2 at y≈750, but the sidebar rule runs on to y≈875. The whole "Softwareentwickler" entry and the Zertifikate section move to p2. Signature block (p2, y≈440): "Unterschrift" sits directly above its rule, so there is no room to sign. There is also an extra thin rule above the block.
- **german-classic:** P1 ends after job 1 at y≈785 of 918. The same signature-label layout issue appears at the bottom of p2. Otherwise this is the strongest DACH output: photo, personal data and the date line are all correctly placed.

### over-cap
- **premium-ats:** P1 ends after the Cloud/Databases/Testing row with about 90px empty, because the 160px DevOps/Security/Leadership row was kept together. Experience starts at mid-p2. P3 has only Education and Certifications at the top.
- **executive:** Same pattern as premium-ats. P3 is about 10% used.
- **classic-green:** P1 bottom about 20% empty (y≈505–630). P3 is near-empty.
- **modern-professional:** The main column (Experience and Education) is all on p1 and ends at y≈470. P2 and p3 contain only the sidebar, leaving about 75% of each page as empty white space. P2 starts with "Cloud Skill C10" and p3 with "Security Skill G5", neither with its category heading. "Domain Knowledge Skill I10/I11/I12" break so that the ID sits alone on a line (p3 sidebar).
- **german-ats:** Same as modern-professional. Headless fragments: "Cloud Skill C9" at the top of p2 and "Security Skill G6" at the top of p3. "Domain Knowledge Skill / I10" breaks the same way. The "GitHub" contact also wraps alone.
- **german-classic:** P1 ends at y≈690 of 918, about 22% empty, because the third 3-column row was kept together. Experience starts at mid-p2. The editor's photo placeholder is missing from the PDF.

### long-entry
- **premium-ats:** P1 ends after Skills at y≈220 of 505. Experience starts on p2. 4 pages for a CV with 2 jobs.
- **executive:** P1 empty below y≈230. Bullets 42–48 continue at the top of p4.
- **classic-green:** P1 empty below y≈210.
- **modern-professional:** P1 holds only the header and summary. The whole two-column body, sidebar included, starts on p2. 5 pages. P5 opens with bullets 47–48 before "Backend Engineer".
- **german-ats:** P1 holds only the header and summary (about 27% used). The sidebar sits only on p2, and the Experience column runs through pages 2–5. P5 opens with bullet 48 alone. The "GitHub" contact wraps alone.
- **german-classic:** P1 empty below y≈225. P4 opens with bullet 48 alone. The editor's photo placeholder is missing from the PDF.

## Overall verdict
On simple content the export is faithful: the four `us-one-page` US templates match the editor almost pixel for pixel, and the paper size suits each template's market. Pagination breaks as soon as content passes one page. A rule that keeps blocks together leaves page 1 55–75% empty for any entry longer than a page, which fails all six `long-entry` PDFs. The two sidebar templates (modern-professional, german-ats) are the worst under stress: sidebar-only pages that are about 75% empty, list fragments with no heading, and a stray certification on its own. Because the editor shows no page breaks and shows a photo slot that never exports, users cannot see any of this before they download. Fix splitting of oversized blocks, carry headings across page breaks for split sidebar sections, and add page-break previews before trusting this export for anything beyond one page.