# Karko AI - Pre-Launch Audit Report

**Date:** February 28, 2026
**Audited by:** Claude Opus 4.6 (comprehensive 5-area audit)
**Scope:** Full codebase - security, bugs, dead code, UI/UX, performance, type safety
**Fix tracking updated:** March 1, 2026

---

## Fix Progress

| Severity | Total | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 7 | 7 | 0 |
| HIGH | 16 | 16 | 0 |
| MEDIUM | 25 | 25 | 0 |
| LOW | 20 | 10 fixed / 10 skipped | 0 |
| Dead Code | 45 items | 45 | 0 |

### Status Legend
- ✅ Fixed (committed in previous session)
- ✅* Fixed (uncommitted — current session)
- ⏳ In Progress
- ❌ Not yet fixed
- ⏭️ Skipped (low ROI / architectural)

---

## CRITICAL FINDINGS (7) — All Fixed ✅

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| C1 | No auth on Stripe routes (IDOR) | ✅ | `supabase.auth.getUser()` added; userId from session, not body |
| C2 | Race condition in credit deduction (TOCTOU) | ✅ | Optimistic concurrency check with retry in `deductCredits` |
| C3 | Global mutable Supabase client | ✅* | Removed global variable; client passed explicitly via params |
| C4 | XSS via innerHTML in PDF download | ✅ | Script tags and event handlers stripped before injection |
| C5 | SSE stream not closed on unmount | ✅ | `useEffect` cleanup aborts SSE stream on unmount |
| C6 | Chat route has no authentication | ✅ | `supabase.auth.getUser()` added to `/api/chat` |
| C7 | Anonymous generation double-free | ✅ | `recordAnonymousGeneration()` now called after `fit_analysis` too |

---

## HIGH FINDINGS (16) — All Fixed ✅

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| H1 | generate-pdf: no auth + anon key fallback | ✅ | Auth added; anon key fallback removed |
| H2 | parse-cv: no auth + public blob storage | ✅* | Auth check added; Anthropic parsing restricted to authenticated users; blob stored under user ID |
| H3 | No rate limiting on Stripe routes | ✅ | 5/min checkout, 3/min portal added |
| H4 | Information disclosure in error responses | ✅ | Generic error messages across all routes |
| H5 | EditableCVCanvas stale props | ✅ | State syncs when `cvData` prop changes |
| H6 | Clipboard API unhandled rejections | ✅ | `try/catch` added to all clipboard calls |
| H7 | Modal accessibility (3 modals) | ✅ | Escape key, `role="dialog"`, `aria-modal="true"` on all 3 |
| H8 | `useAppStore` defeats Zustand selectors | ✅* | `@deprecated` JSDoc added with migration guide; individual store exports added |
| H9 | Bearer token client recreated per call | ✅* | Module-level cached `getBearerTokenClient()` added |
| H10 | `anthropic` client can be null at runtime | ✅* | Explicit null check throws clear error before null dereference |
| H11 | `computeSkillMatch` `[object Object]` bug | ✅* | `toStr` handles arrays, objects, and primitives correctly |
| H12 | DB type system incomplete | ✅* | Added 5 missing table types: `anonymous_generations`, `contact_submissions`, `user_credits`, `credit_transactions`, `subscription_plans` |
| H13 | `follow_up_email`/`fit_assessment` missing from Session types | ✅* | `fitAssessment?: string \| null` added to `ApplicationSession` |
| H14 | `deleteUserAccount` misses tables | ✅ | `contact_submissions` table now included |
| H15 | PostHog init without env guard | ✅ | Client + server guarded against missing `NEXT_PUBLIC_POSTHOG_KEY` |
| H16 | Session operations no auth filter | ✅* | `userId` param added to `getSession`, `updateSession`, `deleteSession`; callers updated |

---

## MEDIUM FINDINGS (25) — 23 Fixed, 2 Remaining

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| M1 | Context cache unbounded growth | ✅* | `MAX_CACHE_SIZE = 100`; LRU eviction on write |
| M2 | Client-sent context data trusted without validation | ✅* | Structural check for `applicant`/`job`/`match` before use |
| M3 | Missing `action` validation in agent-v2 | ✅* | Unknown actions return `Invalid action` error |
| M4 | Webhook debug logging | ✅ | Debug ENV log removed from webhook route |
| M5 | CVPanel: Tailwind CDN v2.2.19 in print window | ✅* | Updated to Tailwind CDN v3.4.1 |
| M6 | ChatPanel: session message race condition | ✅* | Guard added: discards stale messages if session switched during async fetch |
| M7 | CoverLetterPanel: edited state not synced after regen | ✅* | Sync condition changed to `!isEditMode` (not `!editedCoverLetter`) |
| M8 | Dashboard body style side effects | ✅* | `classList.add/remove('overflow-hidden')` instead of inline `style.overflow` |
| M9 | AgentProgressV2: interval restarts on step change | ✅* | Extracted `runningStepId` outside `useEffect`; interval depends only on step ID, not full `steps` array |
| M10 | Credit indicator shows stale data | ✅* | `triggerCreditUpdate()` added after regeneration in `CoverLetterPanel` and `EmailPanel` |
| M11 | Applications page: client-side filtering on partial data | ✅* | Parallel status-count DB query on load; `statusCounts` state for accurate pill counts; optimistic updates on delete/status-change |
| M12 | Stale credit amounts in UI (1.5 should be 2.0) | ✅ | ChatInput updated 1.5 → 2 credits |
| M13 | `error.tsx`: PostHog used without init check | ✅* | `captureException` wrapped in `try/catch` |
| M14 | Follow-up email tokens not tracked | ✅* | Combined `email + followUp` tokens before emitting step_completed |
| M15 | Parallel Promise rejection masking | ✅* | Both `Promise.all()` calls changed to `Promise.allSettled()`; metrics non-critical |
| M16 | `callModelStream` missing systemBlocks/jsonMode | ✅* | `callAnthropicStream` now destructures `systemBlocks`, builds `systemParam` like `callAnthropic` |
| M17 | `addCredits` non-atomic pattern | ✅* | Optimistic concurrency: `.eq(field, currentValue)` on UPDATE; retry once on conflict |
| M18 | PostHog server: no shutdown() or env guard | ✅* | Env guard returns `noopPostHog` when key missing; no-op includes `shutdown()` |
| M19 | PostHog source map: non-null assertions | ✅* | `withPostHogConfig` conditional on env vars being set |
| M20 | Unused dependencies add bundle weight | ✅ | 13 packages removed (~15MB) |
| M21 | Contact route uses service role key | ✅* | Changed to `NEXT_PUBLIC_SUPABASE_ANON_KEY`; RLS policy allows anon inserts |
| M22 | Public blob storage for CVs | ✅* | Blob upload now restricted to authenticated users; stored under user ID path |
| M23 | Rate limiter cleanup window mismatch | ✅* | Cleanup uses fixed 2-min window covering all routes |
| M24 | Toast timeout not cleaned on unmount | ✅* | `timeoutRefs` Map tracks all timeouts; cleared on unmount |
| M25 | Score taken from LLM without server validation | ✅* | Sanity check: if LLM score deviates >40pts from actual ratio, blend 50/50 |

---

## LOW FINDINGS (20) — 10 Fixed, 10 Skipped (low ROI)

| # | Finding | Status | Fix |
|---|---------|--------|-----|
| L1 | Console.log debug statements in CVPanel | ✅ | Debug logs removed |
| L2 | `onAnalyze` prop declared but never used | ✅* | Prop removed from ChatPanel |
| L3 | JSON deep clone in `updateField` | ✅* | Replaced with typed spread clone — `{ ...letter, applicantAddress: {...}, companyAddress: {...} }` |
| L4 | Resize handle not keyboard accessible | ⏭️ | Low ROI |
| L5 | Missing `aria-label` on icon-only buttons | ✅* | Added `aria-label` to thumbsup, thumbsdown, copy buttons in ChatMessage |
| L6 | `useSupabaseSync` creates new client every render | ✅* | `createClient()` stored in `useRef` — created once per hook mount |
| L7 | Addon priceId placeholder | ⏭️ | Requires Stripe config |
| L8 | Mobile menu doesn't close on browser back/forward | ✅* | `useEffect` on `pathname` closes menu on route change |
| L9 | Settings loading skeleton missing | ⏭️ | UI polish |
| L10 | Sessions cast without validation | ✅* | `sessions as SessionSummary[]` replaced with explicit `.map()` to proper type |
| L11 | `FitAnalysisContextData` uses `any` for core fields | ⏭️ | Type refactor |
| L12 | Stale model comment "Sonnet 4.5" | ✅* | Updated to "Sonnet 4.6" in `models/types.ts` |
| L13 | 13+ unused TaskType configs | ✅* | Removed unused types from `MODEL_CONFIGS` |
| L14 | `companyResearch` type defined but never populated | ⏭️ | Dead code |
| L15 | `AgentResult.usage` field never populated | ⏭️ | Dead code |
| L16 | Language detection false positive risk | ⏭️ | Low risk |
| L17 | JSON extraction greedy regex fallback | ⏭️ | Low risk |
| L18 | `processAddonPurchase` redundant tier check | ⏭️ | Dead code |
| L19 | `loadApplicantDocuments` dead code path | ⏭️ | Dead code |
| L20 | PostHog error tracking uses 'server' as distinctId | ✅* | Changed to `'server_error'` across all 9 API routes |

---

## DEAD CODE & OBSOLETE FILES (45 items) — All Removed ✅

All 45 dead code items removed in the Feb 28, 2026 session:
- 10 dead source files deleted (~1,300 lines): `indexeddb.ts`, `validation.ts`, `text-analysis.ts`, `cv-print.css`, `Select/Input/Modal/Textarea/Tabs.tsx`, `ui/index.ts`
- 2 unused public assets deleted
- 13 npm packages removed (~15MB): Pinecone, Tavily, html2canvas, idb, pdfjs-dist, react-pdf, radix-dialog/tabs, file-saver, stripe-js, fontkit, mammoth

---

## Remaining Work (Prioritized)

### All Critical + High + Medium items are fixed ✅

### Skipped (Low ROI)
- **L4** — Resize handle keyboard accessibility ⏭️
- **L7** — Addon priceId placeholder ⏭️
- **L9** — Settings loading skeleton ⏭️
- **L11** — `FitAnalysisContextData` uses `any` ⏭️
- **L14/L15/L18/L19** — Dead code fields ⏭️
- **L16/L17** — Low-risk edge cases ⏭️

---

## Original Full Findings

*(Preserved for reference — see sections above for fix status)*

### C2. Race Condition in Credit Deduction (TOCTOU)
**File:** `src/lib/supabase/credits.ts`
**Fix:** Optimistic concurrency check — UPDATE includes `.eq()` on original values. Retries once on conflict. ✅

### C3. Global Mutable Server Supabase Client
**File:** `src/lib/supabase/credits.ts`
**Fix:** Removed `serverSupabaseClient` global variable. Client now passed explicitly as parameter through `getUserCredits`, `checkCreditBalance`, `deductCredits`, `logCreditTransaction`, `checkAndDeductCredits`. Routes removed `setServerSupabaseClient`/`clearServerSupabaseClient` calls and pass `supabase` directly. ✅*

### H2. Parse-CV Route: No Auth + Public Blob Storage
**File:** `src/app/api/parse-cv/route.ts`
**Fix:** Auth check added via `createClient()`. Anonymous users use free local parser; authenticated users get Anthropic AI parsing. Blob upload restricted to authenticated users, stored under `user.id` path. ✅*

### H16. Session Operations No Auth Filter
**File:** `src/lib/supabase/sessions.ts`
**Fix:** Added optional `userId` param to `getSession`, `updateSession`, `deleteSession`. All callers in `applications/page.tsx` and `useSupabaseSync.ts` updated to pass `user.id`. ✅*
