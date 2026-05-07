# CV Upload Pipeline - Bug Tracker

> Combined findings from Opus 4.7 and GPT 5.5 audits (2026-05-07)

## P1 - Critical

| # | Bug | File | Found By | Status |
|---|-----|------|----------|--------|
| 1 | DOCX parser reads ZIP bytes as UTF-8 text | `route.ts:323-340` | Both | FIXED |
| 2 | Anonymous uploads: UI accepts 10 MB, API rejects at 4.5 MB | `route.ts:133-136` | GPT 5.5 | FIXED |
| 3 | LaTeX `.tex` files rejected before AI parsing | `route.ts:18-19` | GPT 5.5 | FIXED |

## P2 - High

| # | Bug | File | Found By | Status |
|---|-----|------|----------|--------|
| 4 | AI response `parseAIResponse` lacks Array.isArray guards | `route.ts:657-705` | GPT 5.5 | FIXED |
| 5 | Anonymous CV wiped on signup (localStorage cleared) | `AuthContext.tsx:143-154` | Both | FIXED |
| 6 | PDF language/header detection runs on synthetic English text | `route.ts:277-284` | Opus 4.7 | FIXED |

## P3 - Low

| # | Bug | File | Found By | Status |
|---|-----|------|----------|--------|
| 7 | `check_anon_parse_limit` RPC missing from DB | `route.ts:156-177` | Opus 4.7 | FIXED |

---

## Fix Plan

### Bug 1: DOCX parser broken
**Root cause:** `extractTextFromDOCX` does `buffer.toString('utf-8')` on a ZIP file.
**Fix:** Route DOCX through `parseDocumentAsCV({ docFormat: 'docx' })` - Bedrock Converse API natively reads DOCX. Same path as PDF. Delete the broken `extractTextFromDOCX` function.

### Bug 2: Anonymous 10 MB vs 4.5 MB mismatch
**Root cause:** Anonymous users can't use storage-first mode (requires auth), so they hit Vercel's 4.5 MB body limit. UI advertises 10 MB.
**Fix:** Cap the FileUpload `maxSize` at 4.5 MB for anonymous users, OR lower the universal description to "max 4.5 MB" in the upload zone. The honest fix: show different limits based on auth state.

### Bug 3: LaTeX .tex rejected
**Root cause:** `ACCEPTED_EXTENSIONS` only has `.pdf`, `.docx`, `.txt`, `.md`.
**Fix:** Add `.tex` to accepted extensions. LaTeX source is plain text - handle same as `.txt`.

### Bug 4: AI response fragile
**Root cause:** `parseAIResponse` calls `.map()` on AI fields assuming arrays.
**Fix:** Add `Array.isArray()` guards with fallback to empty arrays.

### Bug 5: Anonymous CV lost on signup
**Root cause:** `clearPersistedStores()` fires when `prevUserIdRef.current !== newUser.id`. For anon users, prevId is null, so it always clears.
**Fix:** Before clearing, save anon CV data to a temp variable. After auth completes, re-hydrate and save to Supabase.

### Bug 6: PDF language detection on synthetic text
**Root cause:** For PDFs, `rawText = reconstructRawText(structuredCV)` uses English headers. Then `detectCVLanguage(rawText)` always returns 'en'.
**Fix:** Detect language from the AI-returned content (AI already preserves original language cues in summary/bullets), or add a language field to the AI prompt's JSON schema.

### Bug 7: Missing RPC
**Root cause:** The function was referenced but never deployed.
**Fix:** Implement in-memory rate limiting using existing `rateLimiter.ts` keyed by IP for anonymous parses (simpler, no migration needed).
