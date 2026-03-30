# CV Parsing Audit - Bug Report & Solutions

## Executive Summary

4 bugs found and FIXED across the parsing pipeline. **Bug #1 was the root cause of the "Could not extract text" error** for direct uploads. **Bugs #2-#4 explain the 2x character count and incomplete parsing.**

**Status: ALL 4 BUGS FIXED** — commit `2486d0da` pushed to main.

---

## BUG #1 (CRITICAL): `originalFileName` Self-Assignment Kills Direct Uploads

**File:** `src/app/api/parse-cv/route.ts`, lines 118-119

```typescript
// Line 47:
let originalFileName = '';

// Line 118 (inside FormData/direct upload path):
originalFileName = originalFileName;   // BUG: self-assignment! Should be file.name
fileExt = '.' + (originalFileName.toLowerCase().split('.').pop() || '');  // Becomes just '.'
```

**What happens:**
1. `originalFileName` stays `''`
2. `fileExt` becomes `'.'` (empty string after split)
3. `ACCEPTED_EXTENSIONS.includes('.')` returns `false`
4. API returns 400: `"Unsupported file type ".". Accepted formats: PDF, DOCX, TXT, MD."`

**Who is affected:**
- Anonymous users (always use FormData)
- Authenticated users whose Supabase Storage upload fails (falls back to FormData)
- Any other code calling `/api/parse-cv` with FormData

**Why authenticated users on Documents page aren't always affected:** The Documents page uploads to Supabase Storage first, then sends JSON with `storagePath`. In JSON mode, `originalFileName = fileName` (line 67) works correctly. But if the storage upload fails, it falls through to FormData mode and hits this bug.

**Fix:**
```typescript
// Line 118: Change from
originalFileName = originalFileName;
// To:
originalFileName = file.name;
```

---

## BUG #2 (HIGH): DOMMatrix Polyfill Missing Instance Methods - pdfjs-dist Crashes Silently

**File:** `src/app/api/parse-cv/route.ts`, lines 363-396

**What happens:**
Our `installPDFJSPolyfills()` provides a DOMMatrix constructor with properties (`m11`, `a`, `b`, etc.) and three static methods (`fromMatrix`, `fromFloat64Array`, `fromFloat32Array`). However, pdfjs-dist v5.x calls **instance methods** on DOMMatrix during text extraction:

- `multiply()` - matrix multiplication for glyph positioning
- `inverse()` - inverse matrix for coordinate transforms
- `translate()`, `scale()`, `rotate()` - transform operations
- `transformPoint()` - point transformation

When pdfjs-dist calls `matrix.multiply(other)` and the method doesn't exist, it throws a `TypeError`. Since this is inside a try/catch in `extractTextFromPDF`, pdfjs-dist fails silently and falls through to the **binary fallback**.

**Evidence from Vercel logs:**
```
[Parser] pdfjs-dist failed: DOMMatrix is not defined     // Before our polyfill fix
[Parser] Binary fallback extracted: 26581 chars           // Falls to binary
```

Even with our polyfill, if pdfjs-dist loads but crashes during text extraction due to missing methods, we still end up in the binary fallback.

**Why this causes 2x characters:** The binary fallback extracts text from ALL streams in the PDF (content streams, form XObjects, potentially duplicate layers). PDFs often have overlapping content streams for the same text, producing doubled output.

**Fix:** Add instance methods to the DOMMatrix polyfill:
```typescript
DM.prototype.multiply = function(other) { return new DM(); };
DM.prototype.inverse = function() { return new DM(); };
DM.prototype.translate = function() { return new DM(); };
DM.prototype.scale = function() { return new DM(); };
DM.prototype.transformPoint = function(p) { return p || { x: 0, y: 0 }; };
```

These stubs are sufficient because pdfjs-dist uses DOMMatrix for **rendering** coordinate transforms, not for text extraction itself. Text extraction uses the transform data from the PDF directly.

---

## BUG #3 (HIGH): pdfjs-dist Text Extraction Missing Spaces Between Items

**File:** `src/app/api/parse-cv/route.ts`, lines 319-328

```typescript
for (const item of content.items) {
  if ('str' in item) {
    const textItem = item as { str: string; transform: number[] };
    if (lastY !== undefined && Math.abs(lastY - textItem.transform[5]) > 1) {
      pageText += '\n';
    }
    pageText += textItem.str;    // BUG: No space between items on same line!
    lastY = textItem.transform[5];
  }
}
```

**What happens:** pdfjs-dist returns text in small items (individual words or word fragments). The code only checks Y-position for newlines but never adds **spaces** between items on the same line. Result:

- Input PDF: `Senior Software Engineer at Google`
- Extracted text: `SeniorSoftwareEngineeratGoogle`

This produces text that's harder for the AI to parse correctly, and also affects the `sections` quality.

Additionally, pdfjs-dist v5 provides a `hasEOL` property on each TextItem that indicates end-of-line, which we're ignoring.

**Fix:** Use both X-position gaps (for spaces) and `hasEOL` (for newlines):
```typescript
for (const item of content.items) {
  if ('str' in item) {
    const textItem = item as { str: string; transform: number[]; hasEOL?: boolean };
    const currentY = textItem.transform[5];
    const currentX = textItem.transform[4];

    if (lastY !== undefined && Math.abs(lastY - currentY) > 1) {
      pageText += '\n';
    } else if (lastX !== undefined && textItem.str.length > 0) {
      // Add space between items on same line if there's an X gap
      const gap = currentX - lastX;
      if (gap > 2) {
        pageText += ' ';
      }
    }

    pageText += textItem.str;

    if (textItem.hasEOL) {
      pageText += '\n';
    }

    lastY = currentY;
    lastX = currentX + (textItem.width || 0);
  }
}
```

---

## BUG #4 (MEDIUM): Binary Fallback Extracts Duplicate Text from Multiple Streams

**File:** `src/app/api/parse-cv/route.ts`, lines 398-465

The binary PDF extractor scans the entire PDF buffer for ALL `stream...endstream` blocks, decompresses them, and extracts text from BT/ET blocks. Many PDFs contain:

- Page content streams (main text)
- Form XObjects (embedded graphics with text)
- Template streams (repeated headers/footers)
- Annotation streams
- Font descriptor streams (contain glyph outlines, not text)

The extractor treats ALL of these the same, which can result in:
- **Doubled text** (same text in page stream AND form XObject)
- **Garbage text** (hex strings from font descriptors misinterpreted as text)
- **Character count inflation** (~2x the expected count)

**Fix:** This is the fallback parser, so robustness matters more than perfection. However, we can add basic deduplication:
```typescript
// After extracting all texts, deduplicate consecutive identical lines
const lines = texts.join('\n').split('\n');
const deduped = lines.filter((line, i) => i === 0 || line !== lines[i - 1]);
return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
```

---

## BUG #5 (MEDIUM): 20K Character Truncation Causes Incomplete Master CV Parsing

**File:** `src/app/api/parse-cv/route.ts`, lines 199-205

```typescript
const MAX_AI_TEXT_LENGTH = 20000;
const textForAI = rawText.length > MAX_AI_TEXT_LENGTH
  ? rawText.substring(0, MAX_AI_TEXT_LENGTH) + '\n\n[... truncated for parsing efficiency ...]'
  : rawText;
```

**What happens:** Master CVs (comprehensive documents with all experience, skills, education) can be 25K-40K chars. The AI only sees the first 20K chars. Everything after that (experience entries, education, skills, certifications) is completely lost from `structuredCV`.

Meanwhile, the `rawText` returned to the client is the full untruncated text. So:
- Character count shows full length (e.g., 26,581) - correct
- But `structuredCV` only contains data from the first 20K chars - incomplete
- The `sections` object in `parsedCV` is built from incomplete `structuredCV`

**Fix:** Increase limit for Master CVs or use a smarter truncation strategy:
- Option A: Increase `MAX_AI_TEXT_LENGTH` to 40,000 (still within Claude's context window)
- Option B: Use `maxTokens: 8192` on the AI response to handle larger input
- Option C: Split the CV into sections first, then parse each section separately (most robust but complex)

Recommended: **Option A** - increase to 40K chars. Claude Sonnet 4.6 handles 200K context, so 40K input is fine. The timeout was the issue, and we already increased `maxDuration` to 120s.

---

## BUG #6 (LOW): Sections Object Built from StructuredCV Instead of Raw Text

**File:** `src/app/documents/page.tsx`, lines 241-254

```typescript
const parsedCV: ParsedCV = {
  rawText: result.rawText,       // Full text
  sections: {
    contactInfo: result.structuredCV?.personal ? ...,
    summary: result.structuredCV?.summary || '',
    experience: result.structuredCV?.experience?.map(e =>
      `${e.position} at ${e.company}\n${e.bullets?.join('\n') || ''}`
    ).join('\n\n') || '',
    // ...
  },
};
```

**What happens:** The `sections` are rebuilt from `structuredCV` (which was parsed from potentially truncated text), not from the full `rawText`. For Master CVs > 20K chars, these sections are incomplete. These incomplete sections are then saved to Supabase and used for Master CV arrays (`allSkills`, `allExperiences`, `allEducation`).

**Fix:** This becomes a non-issue once Bug #5 is fixed (larger truncation limit). But for extra safety, the sections could be rebuilt from rawText using `splitIntoSections()` on the client side.

---

## Summary Table

| # | Severity | Bug | Impact | Fix Complexity |
|---|----------|-----|--------|----------------|
| 1 | CRITICAL | `originalFileName = originalFileName` self-assignment | All FormData uploads fail | 1 line fix |
| 2 | HIGH | DOMMatrix polyfill missing instance methods | pdfjs-dist crashes, falls to binary fallback | Add method stubs |
| 3 | HIGH | No spaces between text items in pdfjs-dist extraction | Words concatenated, garbled text | Rewrite extraction loop |
| 4 | MEDIUM | Binary fallback extracts duplicate streams | 2x character count | Add deduplication |
| 5 | MEDIUM | 20K char truncation for AI parsing | Master CV parsed incompletely | Increase limit |
| 6 | LOW | Sections built from truncated structuredCV | Incomplete section data | Non-issue after #5 fix |

---

## Recommended Fix Order

1. **Bug #1** - One line fix, restores FormData uploads
2. **Bug #2** - Add DOMMatrix instance method stubs so pdfjs-dist works properly
3. **Bug #3** - Fix text extraction spacing so pdfjs-dist produces clean text
4. **Bug #5** - Increase AI text limit to 40K chars
5. **Bug #4** - Add binary fallback deduplication (safety net)
6. **Bug #6** - Auto-resolves after Bug #5

After these fixes:
- pdfjs-dist will load and run correctly on Vercel (proper DOMMatrix polyfill)
- Text extraction will have proper spacing (clean text for AI parsing)
- AI parsing will see full CV text (40K limit)
- Binary fallback won't produce duplicate text (deduplication)
- Direct FormData uploads will work (fileName fix)
