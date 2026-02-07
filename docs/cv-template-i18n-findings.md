# CV Template Internationalization (i18n) — Research & Findings

**Date:** February 7, 2026  
**Prepared by:** Cascade (AI Engineering Assistant)  
**For:** Expert engineer review & approval  
**Status:** APPROVED with corrections — implementation in progress

---

## User's Question

> Currently we have three English templates and one German template. The AI output is always in the detected language (section content, bullet points, etc.), but the section **headers** in the templates are hardcoded in either English or German. Can we make all templates language-agnostic so that if someone pastes a French job description, the AI outputs in French, and the templates render French section headers — without needing a separate template per language?

---

## 1. Current State — Complete Audit of All 4 Templates

### 1.1 Template Inventory

| # | Template File | Template ID | Language | Page Size | Photo |
|---|---------------|-------------|----------|-----------|-------|
| 1 | `USPremiumATSTemplate.tsx` | `premium-ats` | English only | US Letter | No |
| 2 | `USModernATSTemplate.tsx` | `modern-professional` | English only | US Letter | No |
| 3 | `USProfessionalTemplate.tsx` | `executive` | English only | US Letter | No |
| 4 | `GermanATSTemplate.tsx` | `german-ats` | German only | A4 | Yes |

### 1.2 Hardcoded Section Headers — Full Inventory

#### Template 1: USPremiumATSTemplate.tsx

| Line | Hardcoded Header | ATS Section |
|------|-----------------|-------------|
| 221 | `PROFESSIONAL SUMMARY` | Summary |
| 251 | `CORE COMPETENCIES` | Skills |
| 312 | `LANGUAGES` | Languages |
| 406 | `PROFESSIONAL EXPERIENCE` | Experience |
| 495 | `EDUCATION` | Education |
| 556 | `CERTIFICATIONS` | Certifications |
| 607 | `ADDITIONAL INFORMATION` | Additional |

**Other hardcoded English strings:**
- Line 432: `'Present'` (for current job end date)
- Line 510: `in` (degree field connector: "degree **in** field")
- Line 519: `GPA:` (grade prefix)
- Line 168: `LinkedIn` (link label)
- Line 178: `GitHub` (link label)
- Line 188: `Portfolio` (link label)
- Line 198: `Website` (link label)

#### Template 2: USModernATSTemplate.tsx

| Line | Hardcoded Header | ATS Section |
|------|-----------------|-------------|
| 112 | `CONTACT` | Contact |
| 186 | `KEY SKILLS` | Skills |
| 242 | `LANGUAGES` | Languages |
| 270 | `CERTIFICATIONS` | Certifications |
| 303 | `PROFESSIONAL SUMMARY` | Summary |
| 326 | `PROFESSIONAL EXPERIENCE` | Experience |
| 386 | `EDUCATION` | Education |
| 426 | `ADDITIONAL INFORMATION` | Additional |

**Other hardcoded English strings:**
- Line 147: `LinkedIn`, Line 153: `GitHub`, Line 159: `Portfolio`, Line 165: `Website`
- Line 336: `'Present'` (current job)
- Line 397: `GPA:` (grade prefix)

#### Template 3: USProfessionalTemplate.tsx

| Line | Hardcoded Header | ATS Section |
|------|-----------------|-------------|
| 173 | `EXECUTIVE SUMMARY` | Summary |
| 197 | `CORE COMPETENCIES` | Skills |
| 258 | `LANGUAGES` | Languages |
| 352 | `PROFESSIONAL EXPERIENCE` | Experience |
| 427 | `EDUCATION` | Education |
| 475 | `CERTIFICATIONS` | Certifications |
| 504 | `ADDITIONAL INFORMATION` | Additional |

**Other hardcoded English strings:**
- Line 128: `LinkedIn`, Line 134: `GitHub`, Line 140: `Portfolio`, Line 146: `Website`
- Line 369: `'Present'` (current job)
- Line 441: `in` (degree field connector)
- Line 445: `GPA:` (grade prefix)

#### Template 4: GermanATSTemplate.tsx

This template uses a **`GERMAN_HEADERS` constant** (lines 23-31) — a better pattern but locked to German:

```typescript
const GERMAN_HEADERS = {
  summary: 'Berufliches Profil',
  skills: 'Kernkompetenzen',
  experience: 'Berufserfahrung',
  education: 'Ausbildung',
  certifications: 'Zertifizierungen',
  languages: 'Sprachkenntnisse',
  additionalInfo: 'Weitere Informationen',
};
```

| Line | Hardcoded Header | Via |
|------|-----------------|-----|
| 121 | `PERSÖNLICHE DATEN` | Direct string |
| 338 | `Berufliches Profil` | `GERMAN_HEADERS.summary` |
| 361 | `Berufserfahrung` | `GERMAN_HEADERS.experience` |
| 421 | `Ausbildung` | `GERMAN_HEADERS.education` |
| 461 | `Weitere Informationen` | `GERMAN_HEADERS.additionalInfo` |
| 195 | `Kernkompetenzen` | `GERMAN_HEADERS.skills` |
| 251 | `Sprachkenntnisse` | `GERMAN_HEADERS.languages` |
| 279 | `Zertifizierungen` | `GERMAN_HEADERS.certifications` |

**Other hardcoded German strings:**
- Line 96: `Bewerbungsfoto` (photo alt text)
- Line 102: `Foto` (photo placeholder)
- Line 174: `Webseite` (instead of "Website")
- Line 308: `Ihr Name` (placeholder for "Your Name")
- Line 371: `'Heute'` (instead of "Present")
- Line 432: `Note:` (instead of "GPA:")
- Line 475: `'Ort'` and `'Datum'` (signature placeholders)
- Line 481: `Unterschrift` (signature label)

---

## 2. Current Language Detection System

### 2.1 Language Detector Utility (`src/lib/utils/language-detector.ts`)

```typescript
export type SupportedLanguage = 'en' | 'de';  // Only 2 languages

export function detectLanguage(text: string): SupportedLanguage {
  // Regex-based: counts German indicator words
  // Returns 'de' if >= 5 German words found, 'en' otherwise
}
```

**Problem:** This is a binary English/German detector. Any non-German EU language (French, Spanish, Dutch, Italian, etc.) will always return `'en'`.

### 2.2 Agent Language Detection (`src/lib/agents/unified-writer-agent.ts`, line 371)

```typescript
detectLanguage(text: string): 'en' | 'de' {
  // More comprehensive German regex with ~50 indicator words
  // Threshold: >= 10 German words → 'de', else → 'en'
}
```

**Problem:** Same binary limitation — only returns `'en'` or `'de'`.

### 2.3 How Language Flows Through the System

1. **Detection:** `detectLanguage(jobDescription)` → `'en'` or `'de'`
2. **Stored:** `context.detectedLanguage = 'en' | 'de'`
3. **Used in CV Generation Prompt (line 1319-1320):**
   ```
   ${isGerman ? 'Generate ALL content in GERMAN...' : 'Generate content in English.'}
   ```
4. **Used in Output Language:** `getOutputLanguage()` returns `context.detectedLanguage || 'en'`

**Critical insight:** The AI *can* already output in any language — the LLM is multilingual. But the system currently constrains it to only `'en'` or `'de'` via the binary detection and the hard "Generate content in English/German" instruction.

---

## 3. Current AI Output Structure — What the AI Returns

The AI generates a **structured JSON object** (CVData format). The JSON structure is **language-agnostic** — it has no section header fields. The section headers are entirely rendered by the template:

```json
{
  "personal": { "fullName": "...", "email": "...", ... },
  "summary": "...",
  "experience": [{ "company": "...", "position": "...", "bullets": [...] }],
  "education": [{ "degree": "...", "institution": "..." }],
  "skills": [{ "category": "Category Name", "items": ["..."] }],
  "languages": [{ "language": "...", "proficiency": "..." }],
  "certifications": [{ "name": "...", "issuer": "..." }]
}
```

**Key finding:** The AI does NOT return section header names. The templates hardcode them. This means:
- If AI generates a French CV, the content (summary, bullets, skills) will be in French
- But the section headers will still say "PROFESSIONAL EXPERIENCE" or "Berufserfahrung" depending on which template the user selected
- This creates a **language mismatch** between headers and content

---

## 4. ATS-Compliant Section Headers Across EU Languages

ATS systems (Workday, Greenhouse, Lever, SAP SuccessFactors, etc.) parse section headers to categorize content. Here are the **standard ATS-recognized headers** per language:

| Section | English (EN) | German (DE) | French (FR) | Spanish (ES) | Italian (IT) | Dutch (NL) | Portuguese (PT) |
|---------|-------------|-------------|-------------|-------------|-------------|------------|----------------|
| Summary | Professional Summary | Berufliches Profil | Profil Professionnel | Resumen Profesional | Profilo Professionale | Professioneel Profiel | Resumo Profissional |
| Skills | Core Competencies | Kernkompetenzen | Compétences Clés | Competencias Clave | Competenze Chiave | Kerncompetenties | Competências Principais |
| Experience | Professional Experience | Berufserfahrung | Expérience Professionnelle | Experiencia Profesional | Esperienza Professionale | Werkervaring | Experiência Profissional |
| Education | Education | Ausbildung | Formation | Formación | Formazione | Opleiding | Formação |
| Certifications | Certifications | Zertifizierungen | Certifications | Certificaciones | Certificazioni | Certificeringen | Certificações |
| Languages | Languages | Sprachkenntnisse | Langues | Idiomas | Lingue | Talen | Idiomas |
| Contact | Contact | Kontaktdaten | Contact | Contacto | Contatto | Contact | Contacto |
| Additional Info | Additional Information | Weitere Informationen | Informations Complémentaires | Información Adicional | Informazioni Aggiuntive | Aanvullende Informatie | Informações Adicionais |

**ATS Compatibility Note:** Major ATS systems used in Europe (SAP SuccessFactors, Personio, Workday) **do** recognize section headers in the local language. A French CV with "Expérience Professionnelle" will parse correctly in French-market ATS systems. The key is using the **standard/conventional** header for that language — not creative alternatives.

### Other Hardcoded Strings That Need Translation

| String | EN | DE | FR | ES |
|--------|----|----|----|----|
| Current job end | Present | Heute/Gegenwart | Présent | Presente |
| Grade prefix | GPA: | Note: | Mention: | Nota: |
| Degree connector | in | in | en | en |
| Photo placeholder | Photo | Foto | Photo | Foto |
| Signature | Signature | Unterschrift | Signature | Firma |

---

## 5. Proposed Solution — Architecture

### 5.1 Add `sectionHeaders` to the AI Output (Recommended Approach)

Instead of maintaining a translation table on the frontend, **let the AI generate the section headers** as part of its JSON output. The AI already knows the target language and understands ATS conventions per market.

#### Change to CVData Type (`types.ts`)

```typescript
export interface CVData {
  // NEW: AI-generated section headers in the detected language
  sectionHeaders?: {
    summary?: string;        // e.g., "Profil Professionnel"
    skills?: string;         // e.g., "Compétences Clés"
    experience?: string;     // e.g., "Expérience Professionnelle"
    education?: string;      // e.g., "Formation"
    certifications?: string; // e.g., "Certifications"
    languages?: string;      // e.g., "Langues"
    contact?: string;        // e.g., "Contact"
    additionalInfo?: string; // e.g., "Informations Complémentaires"
  };

  // NEW: Localized UI strings
  localizedStrings?: {
    present?: string;        // "Present" / "Heute" / "Présent"
    gradePrefix?: string;    // "GPA:" / "Note:" / "Mention:"
    degreeConnector?: string; // "in" / "en" / "in"
    photoPlaceholder?: string; // "Photo" / "Foto"
  };

  // ... existing fields unchanged
}
```

#### Change to AI Prompt (unified-writer-agent.ts)

Add to the JSON output schema:

```
"sectionHeaders": {
  "summary": "ATS-compliant section header for Summary in the output language",
  "skills": "ATS-compliant section header for Skills in the output language",
  "experience": "ATS-compliant section header for Experience in the output language",
  "education": "ATS-compliant section header for Education in the output language",
  "certifications": "ATS-compliant section header for Certifications in the output language",
  "languages": "ATS-compliant section header for Languages in the output language",
  "contact": "ATS-compliant section header for Contact in the output language",
  "additionalInfo": "ATS-compliant section header for Additional Info in the output language"
},
"localizedStrings": {
  "present": "'Present' in the output language (e.g., 'Heute', 'Présent')",
  "gradePrefix": "Grade label in the output language (e.g., 'GPA:', 'Note:')",
  "degreeConnector": "Connector word between degree and field (e.g., 'in', 'en')"
}
```

Add ATS instruction to the prompt:

```
SECTION HEADERS RULE:
Generate ATS-compliant section headers in the output language. Use the STANDARD, 
CONVENTIONAL section names that ATS systems in the target market recognize.
Do NOT use creative or unconventional headers.
```

#### Change to Templates

Replace all hardcoded headers with data-driven values with English fallbacks:

```tsx
// Before:
<h2>PROFESSIONAL SUMMARY</h2>

// After:
<h2>{data.sectionHeaders?.summary || 'PROFESSIONAL SUMMARY'}</h2>
```

```tsx
// Before:
{exp.current ? 'Present' : exp.endDate}

// After:
{exp.current ? (data.localizedStrings?.present || 'Present') : exp.endDate}
```

### 5.2 Why AI-Generated Headers > Frontend Translation Table

| Approach | Pros | Cons |
|----------|------|------|
| **AI generates headers** (recommended) | Zero maintenance, supports ANY language, AI knows ATS conventions per market, single source of truth | Slightly more tokens per request (~50 extra tokens) |
| Frontend translation table | No LLM dependency, faster | Must maintain translations for every new language, may get ATS naming wrong for niche markets, separate maintenance burden |

**Recommendation:** AI-generated headers. The token cost is negligible (~50 tokens out of 4000+), and it scales to any language without code changes.

---

## 6. Language Detection — Required Changes

### 6.1 Current Limitation

The `detectLanguage()` function is binary (EN/DE). For the i18n approach to work, we need to either:

**Option A:** Expand to multi-language detection (regex-based for major EU languages)  
**Option B:** Let the AI detect the language (already happens implicitly — the AI reads the JD and knows what language it is)

### 6.2 Recommended: Hybrid Approach

1. **Keep regex detection** for the common case (English/German) — it's fast and free
2. **Expand `SupportedLanguage` type** from `'en' | 'de'` to `string` (ISO 639-1 codes)
3. **Add regex patterns** for French, Spanish, Italian, Dutch, Portuguese (the major EU markets)
4. **Fallback:** If no language is confidently detected, default to `'en'`
5. **In the AI prompt**, change from binary "Generate in English/German" to:
   ```
   Generate ALL content in the SAME LANGUAGE as the job description.
   Detected language: ${detectedLanguage}
   ```

### 6.3 Changes to Language Detector

```typescript
// Current:
export type SupportedLanguage = 'en' | 'de';

// Proposed:
export type SupportedLanguage = 'en' | 'de' | 'fr' | 'es' | 'it' | 'nl' | 'pt';

export function detectLanguage(text: string): SupportedLanguage {
  // German check (existing, high confidence)
  // French check (new: le, la, les, des, une, avec, pour, dans, être, avoir, entreprise, expérience, ...)
  // Spanish check (new: el, la, los, las, del, con, para, por, empresa, experiencia, ...)
  // Italian check (new: il, la, le, gli, del, con, per, azienda, esperienza, ...)
  // Dutch check (new: de, het, een, van, voor, met, bedrijf, ervaring, ...)
  // Portuguese check (new: o, a, os, as, do, da, com, para, empresa, experiência, ...)
  // Default: 'en'
}
```

### 6.4 Changes to AI Prompt (unified-writer-agent.ts)

Current (line 1319-1320):
```typescript
${isGerman ? `Generate ALL content in GERMAN. Use German date format...` : 'Generate content in English.'}
```

Proposed:
```typescript
`Generate ALL content in the SAME LANGUAGE as the job description.
Detected language code: ${outputLang}
Use the standard date format and conventions for this language/region.
Section headers MUST be ATS-compliant in the output language.`
```

---

## 7. Template Changes — What the German Template Teaches Us

The German template (`GermanATSTemplate.tsx`) already partially implements the right pattern with its `GERMAN_HEADERS` constant. The difference is:

- **Current:** `GERMAN_HEADERS` is a hardcoded German translation object
- **Proposed:** Replace `GERMAN_HEADERS` with `data.sectionHeaders` (AI-generated, any language)

This means the German template's approach is **the correct architecture** — it just needs to source its headers from AI data instead of a hardcoded constant.

### 7.1 German Template — Special Considerations

The German template has unique features that should be preserved for the EU/photo market:
- **Photo support** (standard in DACH region, common across EU)
- **A4 page size** (EU standard)
- **Signature block** (German market standard)
- **Sidebar layout** (common in EU CVs)

**Recommendation:** Rename `GermanATSTemplate` to something like `EuropeanATSTemplate` or `EUPhotoATSTemplate` since it would now work for any EU language. The template's structural features (photo, A4, sidebar) are relevant across all EU markets, not just Germany.

---

## 8. Summary of All Required Changes

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/cv-templates/types.ts` | Add `sectionHeaders` and `localizedStrings` to `CVData` interface |
| `src/lib/utils/language-detector.ts` | Expand from binary EN/DE to multi-language detection |
| `src/lib/agents/unified-writer-agent.ts` | Update CV generation prompt: add `sectionHeaders` + `localizedStrings` to JSON schema, change language instruction from binary to dynamic |
| `src/lib/agents/types.ts` | Update `detectedLanguage` type from `'en' \| 'de'` to `SupportedLanguage` |
| `src/components/cv-templates/USPremiumATSTemplate.tsx` | Replace 7 hardcoded English headers + 4 hardcoded strings with `data.sectionHeaders?.X \|\| 'ENGLISH FALLBACK'` |
| `src/components/cv-templates/USModernATSTemplate.tsx` | Replace 8 hardcoded English headers + 4 hardcoded strings |
| `src/components/cv-templates/USProfessionalTemplate.tsx` | Replace 7 hardcoded English headers + 4 hardcoded strings |
| `src/components/cv-templates/GermanATSTemplate.tsx` | Replace `GERMAN_HEADERS` constant with `data.sectionHeaders` fallback chain, replace other hardcoded German strings |
| `src/app/api/regenerate/route.ts` | Update language detection usage if it uses the old binary type |

### Estimated Token Impact

- **Additional tokens per CV generation:** ~50-80 tokens (for the `sectionHeaders` and `localizedStrings` objects)
- **Percentage increase:** ~1-2% of total CV generation tokens
- **Cost impact:** Negligible

### Backward Compatibility

- All `sectionHeaders` fields are **optional** with English fallbacks
- Existing CVs without `sectionHeaders` will render exactly as they do today
- No breaking changes to the CVData interface
- The German template fallback chain: `data.sectionHeaders?.X || GERMAN_HEADERS.X` (preserves current behavior if AI doesn't provide headers)

---

## 9. Implementation Priority

| Priority | Task | Effort |
|----------|------|--------|
| 1 (High) | Add `sectionHeaders` + `localizedStrings` to CVData type | Small |
| 2 (High) | Update AI prompt to generate section headers in output language | Medium |
| 3 (High) | Update all 4 templates to use `data.sectionHeaders` with fallbacks | Medium |
| 4 (Medium) | Expand language detector to support major EU languages | Small |
| 5 (Medium) | Change AI prompt language instruction from binary to dynamic | Small |
| 6 (Low) | Rename German template to EU Photo Template | Small |
| 7 (Low) | Update template selector UI labels | Small |

**Total estimated effort:** 1-2 days of engineering work.

---

## 10. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| AI generates non-standard section headers | Low | Explicit ATS instruction in prompt + English fallbacks in templates |
| ATS systems don't recognize non-English headers | Low for EU markets | EU ATS systems (SAP SF, Personio) support local languages; for US market, English fallback is always used |
| Regression in English/German output quality | Low | Fallback chain ensures existing behavior is preserved if sectionHeaders is empty |
| Additional token cost | Very Low | ~50-80 extra tokens (~1-2% increase) |

---

---

## 11. Expert Review Corrections (February 7, 2026)

**Reviewer:** Expert Engineer (Claude Opus 4.6)  
**Verdict:** APPROVED with 3 corrections below. Everything not mentioned is approved as proposed.

### CORRECTION 1: Language Detection — Do NOT Build Regex for 5 Languages

**What was proposed (WRONG):** Adding regex patterns for FR, ES, IT, NL, PT to `language-detector.ts`.

**What to do instead:**
- Keep existing EN/DE regex detection exactly as-is
- Change the type from `'en' | 'de'` to `string` (ISO 639-1 codes)
- Do NOT add regex patterns for FR, ES, IT, NL, PT — the AI handles detection for non-EN/DE languages
- In `unified-writer-agent.ts` `detectLanguage()`, keep existing German detection logic
- Add fallback: if not German and AI detects non-English, let AI's detection take precedence

**Why:** Claude/Sonnet is vastly better at language detection than regex. Regex is just a fast-path for our two primary markets.

### CORRECTION 2: Do NOT Rename the German Template

**What was proposed (WRONG):** Rename `GermanATSTemplate` to `EuropeanATSTemplate`.

**What to do instead:** Keep filename and component name as `GermanATSTemplate`. This is a v2 concern. Still make the headers dynamic inside it (replace `GERMAN_HEADERS` with `data.sectionHeaders` + fallback chain).

### CORRECTION 3: AI Prompt Language Instruction — Use This Exact Text

**What was proposed (TOO LOOSE):** Generic "Generate ALL content in the SAME LANGUAGE as the job description."

**What to use instead (exact text for the prompt):**
```
LANGUAGE RULE:
- Detect the language of the job description
- Generate ALL content (summary, bullets, skills, section headers, localized strings) in that SAME language
- Section headers MUST use standard ATS-recognized names in the output language (not creative alternatives)
- If language is unclear or mixed, default to English
- For German: use formal conventions (dates as MM/YYYY, "Heute" for present)
- For English: use market-appropriate conventions based on location (US Letter vs A4 implied by market)
- Include sectionHeaders and localizedStrings objects in your JSON output
```

**Why:** Original was missing "default to English if unclear" safeguard and ATS-standard naming constraint.

---

## 12. Corrected Implementation Order & Progress Tracker

```
[x] Task 1 — CVData type update (types.ts) — DONE
[x] Task 2 — AI prompt update (unified-writer-agent.ts) — USE CORRECTION 3 — DONE
[x] Task 3a — USPremiumATSTemplate.tsx — replace 7 headers + 4 strings — DONE
[x] Task 3b — USModernATSTemplate.tsx — replace 8 headers + 4 strings — DONE
[x] Task 3c — USProfessionalTemplate.tsx — replace 7 headers + 4 strings — DONE
[x] Task 3d — GermanATSTemplate.tsx — replace GERMAN_HEADERS usage + other strings (keep German fallbacks) — DONE
[x] Task 4 — Agent types update (types.ts) — DONE
[x] Task 5 — Regenerate route update (route.ts) — No changes needed, types flow correctly
[x] Language detector type change (language-detector.ts) — USE CORRECTION 1 — DONE
```

**All tasks completed. TypeScript build passes with zero errors (`npx tsc --noEmit` clean).**

### What NOT To Do
1. ❌ Do NOT add regex language detection for FR, ES, IT, NL, PT
2. ❌ Do NOT rename GermanATSTemplate
3. ❌ Do NOT use the loose language prompt from Section 6 — use Correction 3
4. ❌ Do NOT make this a multi-day project
5. ❌ Do NOT add new templates or template selection logic

---

*This document has been reviewed and approved by expert engineer. Implementation is in progress.*
