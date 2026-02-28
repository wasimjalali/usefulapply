# Karko AI - Pre-Launch Audit Report

**Date:** February 28, 2026
**Audited by:** Claude Opus 4.6 (comprehensive 5-area audit)
**Scope:** Full codebase - security, bugs, dead code, UI/UX, performance, type safety

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 7 | Must fix before launch |
| HIGH | 16 | Should fix before launch |
| MEDIUM | 25 | Fix soon after launch |
| LOW | 20 | Nice to have |
| Dead Code | 45 items | Clean up for production readiness |
| **Total** | **113** | |

---

## CRITICAL FINDINGS (7) - Must Fix Before Launch

### C1. No Authentication on Stripe Checkout / Portal / Addon Routes (IDOR)

**Files:**
- `src/app/api/stripe/create-checkout/route.ts`
- `src/app/api/stripe/create-addon-checkout/route.ts`
- `src/app/api/stripe/create-portal/route.ts`

**Description:** All three routes accept `userId` from the request body with zero authentication. No `supabase.auth.getUser()` call. An attacker can:
- Create checkout sessions for other users' accounts
- Open any user's Stripe billing portal (exposing partial payment details)
- Purchase credits on behalf of another user

**Impact:** Complete billing account takeover. Attacker can access any user's billing portal.

**Fix:** Add `supabase.auth.getUser()` and verify `user.id === userId` before proceeding.

---

### C2. Race Condition in Credit Deduction (TOCTOU)

**File:** `src/lib/supabase/credits.ts` (lines 295-393)

**Description:** `deductCredits` performs non-atomic read-then-write:
1. Reads current balance via `getUserCredits()`
2. Checks `totalBefore < amount`
3. Calculates new values in JavaScript
4. Updates via `supabase.update()`

Two concurrent requests can both read the same balance, both pass the check, both deduct, resulting in **negative credits**. On Vercel serverless with parallel requests, this is a real risk.

**Impact:** Users can spend credits they don't have. Financial integrity bug.

**Fix:** Use a Supabase RPC function with `SELECT ... FOR UPDATE` or atomic `UPDATE ... WHERE (total_credits) >= amount`.

---

### C3. Global Mutable Server Supabase Client (Cross-Request Contamination)

**File:** `src/lib/supabase/credits.ts` (lines 7-17)

**Description:** `serverSupabaseClient` is a module-level mutable variable. On Vercel, concurrent requests share the module instance. If Request A calls `setServerSupabaseClient(clientA)`, then Request B calls `setServerSupabaseClient(clientB)`, Request A's credit operations use `clientB`.

**Impact:** Credits deducted from wrong user. Credit checks using wrong auth context.

**Fix:** Remove global mutable pattern. Pass supabase client through function parameters, or use `AsyncLocalStorage`.

---

### C4. XSS via innerHTML in PDF Download

**File:** `src/components/CVPanel.tsx` (lines 205, 466-480)

**Description:** `handleDownloadPDF` takes `cvTemplateRef.current.innerHTML` and injects it raw into a new window via `document.write()`. CV content originates from AI-generated data. A prompt injection attack could embed malicious HTML/scripts. The `pdfTitle` is also injected unescaped.

**Impact:** Script execution in print window. Potential data exfiltration.

**Fix:** Sanitize with DOMPurify before injection, or use server-side PDF generation.

---

### C5. SSE Stream Not Closed on Component Unmount

**Files:**
- `src/components/chat/useAgentWorkflow.ts` (line 210, 377)
- `src/hooks/useAgentV2.ts` (lines 212-349)

**Description:** The `abortControllerRef` is never cleaned up on unmount. If the user navigates away mid-stream, the reader loop continues, calling state setters on unmounted components.

**Impact:** Memory leaks, React warnings, potential crashes.

**Fix:** Add `useEffect` cleanup that calls `abortControllerRef.current?.abort()`.

---

### C6. Chat Route Has No Authentication

**File:** `src/app/api/chat/route.ts`

**Description:** Zero authentication. Any unauthenticated user/bot can send chat messages that invoke Claude API. Only protection is rate limiting (20 req/min) which resets on cold start.

**Impact:** Attacker with multiple IPs can invoke unlimited Claude API calls at your expense.

**Fix:** Add `supabase.auth.getUser()`. If anonymous chat is intentional, add strict rate limit (3/min).

---

### C7. Anonymous Generation Double-Free (Fit Analysis + Generate)

**File:** `src/app/api/agent-v2/route.ts` (lines 267-278, 416-418, 504)

**Description:** The anonymous generation check runs once at request start. `recordAnonymousGeneration` is only called after `workflow_complete` in full generation paths. The `fit_analysis` path never records a generation. So an anonymous user gets:
1. Free fit analysis (no recording)
2. Free full generation via `generate_with_context` (passes check again)

**Impact:** Each anonymous user gets ~$0.36 in API costs (double expected).

**Fix:** Record anonymous generation after fit_analysis, OR check at the start of `generate_with_context`.

---

## HIGH FINDINGS (16) - Should Fix Before Launch

### H1. Generate-PDF Route: No Auth + Anon Key Fallback

**File:** `src/app/api/generate-pdf/route.ts`

No `supabase.auth.getUser()`. Anyone can POST CV data and store PDFs. Falls back to anon key if service role key not set. `userId` from request body is trusted, allowing files in arbitrary user directories.

### H2. Parse-CV Route: No Auth + Public Blob Storage

**File:** `src/app/api/parse-cv/route.ts`

No authentication. Triggers Anthropic API calls (~$0.01-0.05 per parse). If `BLOB_READ_WRITE_TOKEN` is set, uploaded CVs (with PII) are stored as publicly accessible Vercel Blobs.

### H3. No Rate Limiting on Stripe Routes

**Files:** `src/app/api/stripe/create-checkout/route.ts`, `create-addon-checkout/route.ts`, `create-portal/route.ts`

Combined with missing auth (C1), bots can spam unlimited Stripe checkout sessions.

### H4. Information Disclosure in Error Responses

**Files:** `parse-cv/route.ts`, `agent-v2/route.ts`, `create-checkout/route.ts`, `create-addon-checkout/route.ts`, `generate-pdf/route.ts`

Raw `error.message` exposed to clients. Can reveal DB structure, API details, stack traces.

**Fix:** Return generic error messages. Log details server-side only.

### H5. EditableCVCanvas Stale Props

**File:** `src/components/EditableCVCanvas.tsx` (lines 87-88)

`useState(cvData)` initializes once. External updates (switching views, regeneration) never reflected. `handleReset` uses stale closure value.

### H6. Clipboard API Unhandled Rejections

**Files:** `EmailPanel.tsx`, `CoverLetterPanel.tsx`, `ChatMessage.tsx`

All `navigator.clipboard.writeText()` calls lack try/catch. Can throw in non-secure contexts or when permissions denied.

### H7. Modal Accessibility (3 modals)

**Files:** `FeedbackModal.tsx`, `SignUpWallModal.tsx`, `InsufficientCreditsModal.tsx`

Missing: focus trapping, `role="dialog"`, `aria-modal="true"`, Escape key handler.

### H8. `useAppStore` Defeats Zustand Selectors

**File:** `src/store/useAppStore.ts`

Spreads all three stores into one object. Every component using it re-renders on ANY store change. Defeats Zustand's selective subscription optimization.

### H9. Bearer Token Client Recreated Per API Call

**File:** `src/lib/models/anthropic.ts` (lines 194-205)

New `BedrockBearerTokenClient` instantiated on every call. No connection reuse. `process.env.AWS_BEARER_TOKEN_BEDROCK!` read on every call; throws if unset.

### H10. `anthropic` Client Can Be Null at Runtime

**File:** `src/lib/models/anthropic.ts` (lines 36-48, 208)

When `HAS_BEARER_TOKEN` is true, `anthropic = null`. Type cast `as Anthropic` hides null pointer risk if code paths change.

### H11. `computeSkillMatch` Data Integrity

**File:** `src/lib/agents/context-builder.ts` (line 246)

`toStr` helper uses `String(s ?? '')` which produces `"[object Object]"` for nested objects from LLM JSON output.

### H12. DB Type System Incomplete

**File:** `src/lib/supabase/types.ts`

Missing table types for: `anonymous_generations`, `contact_submissions`, `credit_transactions`, `subscription_plans`, plus 2-3 more. Status types for `application_sessions.Insert/Update` still have old 6-value enum instead of new 5-value.

### H13. `follow_up_email` and `fit_assessment` Missing from Session Types

**File:** `src/store/useSessionStore.ts`

`ApplicationSession` interface lacks `followUpEmail` and `fitAssessment` fields. Data is stored via `updateCurrentSession` which accepts `Partial<ApplicationSession>` (bypasses type checking via spread).

### H14. deleteUserAccount Misses Tables

**File:** `src/app/settings/page.tsx`

Account deletion only deletes from `user_credits` and `profiles`. Misses: `application_sessions`, `contact_submissions`, `anonymous_generations`, `credit_transactions`. Orphaned data remains.

### H15. PostHog Init Without Env Guard

**File:** `src/providers/PostHogProvider.tsx`

If `NEXT_PUBLIC_POSTHOG_KEY` is undefined, PostHog initializes with undefined key. Silent failures on all analytics.

### H16. Session Operations No Auth Filter

**File:** `src/lib/supabase/sessions.ts`

`getSession`, `updateSession`, `deleteSession` take `sessionId` but don't filter by `user_id`. Relies entirely on RLS being correctly configured.

---

## MEDIUM FINDINGS (25)

### M1. Context Cache Unbounded Growth
`src/app/api/agent-v2/route.ts` - contextCache Map has no max size. Cleanup only runs on write.

### M2. Client-Sent Context Data Trusted Without Validation
`src/app/api/agent-v2/route.ts` - `cachedContextData` from client reconstructed without schema validation or signature.

### M3. Missing `action` Validation in agent-v2
Unknown actions fall through to full_optimization (charges 2.0 credits).

### M4. Webhook Debug Logging
`src/app/api/stripe/webhook/route.ts` (line 120) - Logs env var configuration on every webhook call.

### M5. CVPanel: Tailwind CDN v2.2.19 in Print Window
`src/components/CVPanel.tsx` (line 463) - Old Tailwind version, network-dependent PDF generation.

### M6. ChatPanel: Session Message Race Condition
Quick session switching can apply messages from wrong session.

### M7. CoverLetterPanel: Edited State Not Synced After Regeneration
`useEffect` condition `!editedCoverLetter` prevents sync to new cover letter after regeneration.

### M8. Dashboard Body Style Side Effects
Direct `document.body.style` manipulation can conflict across components.

### M9. AgentProgressV2: Interval Restarts on Step Change
Simulated action progress resets unexpectedly.

### M10. Credit Indicator Shows Stale Data
Event listener closure captures stale `fetchCredits`. No error UI for fetch failures.

### M11. Applications Page: Client-Side Filtering on Partial Data
Search and status counts only reflect loaded applications (25 per page), not full DB.

### M12. Stale Credit Amounts in UI
`src/components/chat/ChatInput.tsx` - Shows "1.5 credits" for Apply Directly (should be 2.0).

### M13. error.tsx: PostHog Used Without Init Check
`posthog.captureException()` called before PostHog may be initialized.

### M14. Follow-Up Email Tokens Not Tracked in Analytics
`unified-writer-agent.ts` - `followUpResult.tokens` never reported to PostHog. LLM costs underreported.

### M15. Parallel Promise Rejection Masking
`unified-writer-agent.ts` - `Promise.all()` swallows errors from non-first rejections.

### M16. `callModelStream` Missing systemBlocks/jsonMode
`src/lib/models/index.ts` - Streaming path can't use prompt caching or JSON mode.

### M17. `addCredits` Non-Atomic Pattern
`src/lib/supabase/credits.ts` - Same TOCTOU issue as `deductCredits` but for additions.

### M18. PostHog Server: No shutdown() or Env Guard
`src/lib/posthog-server.ts` - Non-null assertion on env var. No shutdown on process exit.

### M19. PostHog Source Map: Non-null Assertions on Optional Env Vars
`next.config.ts` - Build fails with confusing error if `POSTHOG_PERSONAL_API_KEY` not set.

### M20. Unused Dependencies Add Bundle Weight
`@pinecone-database/pinecone`, `@tavily/core`, `html2canvas` - ~5MB+ unnecessary.

### M21. Contact Route Uses Service Role Key
`src/app/api/contact/route.ts` - Full DB access for a simple public form insert.

### M22. Public Blob Storage for CVs
`src/app/api/parse-cv/route.ts` - CVs with PII stored with `access: 'public'`.

### M23. Rate Limiter Cleanup Window Mismatch
`src/lib/middleware/rateLimiter.ts` - Single `windowMs` used for cleanup across all routes.

### M24. Toast Timeout Not Cleaned on Unmount
`src/components/ui/Toast.tsx` - `setTimeout` never cancelled on component unmount.

### M25. Score Taken Directly from LLM Without Server Validation
`src/lib/agents/context-builder.ts` - Fit score clamped 0-100 but not validated against actual skill ratios.

---

## LOW FINDINGS (20)

| # | Finding | File |
|---|---------|------|
| L1 | Console.log debug statements in production | CVPanel.tsx (lines 103, 136-140, 147) |
| L2 | `onAnalyze` prop declared but never used | ChatPanel.tsx (line 32) |
| L3 | JSON deep clone in `updateField` | CoverLetterPanel.tsx (line 516) |
| L4 | Resize handle not keyboard accessible | dashboard/page.tsx (line 254) |
| L5 | Missing `aria-label` on icon-only buttons | Multiple components |
| L6 | `useSupabaseSync` creates new client every render | useSupabaseSync.ts (line 83) |
| L7 | Addon priceId placeholder | SubscriptionSection.tsx (line 11) |
| L8 | Mobile menu doesn't close on browser back/forward | Navbar.tsx |
| L9 | Settings loading skeleton missing | settings/page.tsx |
| L10 | Sessions cast without validation | ChatPanel.tsx (line 289) |
| L11 | `FitAnalysisContextData` uses `any` for core fields | useAgentWorkflow.ts (lines 29-36) |
| L12 | Stale model comment "Sonnet 4.5" | models/types.ts (lines 1-5) |
| L13 | 13+ unused TaskType configs | models/types.ts |
| L14 | `companyResearch` type defined but never populated | agents/types.ts (lines 76-87) |
| L15 | `AgentResult.usage` field never populated | agents/types.ts (lines 224-233) |
| L16 | Language detection false positive risk | context-builder.ts (lines 210-230) |
| L17 | JSON extraction greedy regex fallback | unified-writer-agent.ts (lines 471-476) |
| L18 | `processAddonPurchase` redundant tier check | credits.ts (line 695) |
| L19 | `loadApplicantDocuments` dead code path on server | unified-writer-agent.ts |
| L20 | PostHog error tracking uses 'server' as distinctId | Multiple API routes |

---

## DEAD CODE & OBSOLETE FILES (45 items)

### Dead Source Files (4 files, ~600 lines)

| File | Lines | Reason |
|------|-------|--------|
| `src/lib/storage/indexeddb.ts` | 167 | Zero imports. Only consumer of `idb` package |
| `src/lib/cv-templates/validation.ts` | ~200 | Never imported after refactoring |
| `src/lib/cv-templates/text-analysis.ts` | ~200 | Never imported after refactoring |
| `src/styles/cv-print.css` | 271 | Not imported by any file |

### Dead UI Components (6 files, ~400 lines)

| File | Reason |
|------|--------|
| `src/components/ui/Select.tsx` | Never imported |
| `src/components/ui/Input.tsx` | Never imported |
| `src/components/ui/Modal.tsx` | Never imported |
| `src/components/ui/Textarea.tsx` | Never imported |
| `src/components/ui/Tabs.tsx` | Never imported |
| `src/components/ui/index.ts` | Barrel file, never used |

### Unused npm Dependencies (12 packages)

| Package | Reason |
|---------|--------|
| `@pinecone-database/pinecone` | Legacy RAG system, zero imports |
| `@tavily/core` | Legacy company research, zero imports |
| `html2canvas` | Zero imports |
| `idb` | Only used by dead `indexeddb.ts` |
| `pdfjs-dist` | Zero imports |
| `react-pdf` | Zero imports |
| `@radix-ui/react-dialog` | Zero imports |
| `@radix-ui/react-tabs` | Zero imports |
| `file-saver` + `@types/file-saver` | Zero imports |
| `@stripe/stripe-js` | Zero imports (Stripe server-only) |
| `@pdf-lib/fontkit` | Zero imports |
| `mammoth` | Zero imports |

### Unused Public Assets (2-3 files)

| File | Reason |
|------|--------|
| `public/anthropic-logo.svg` | `anthropic-icon.jpg` used instead |
| `public/claude-sonnet-46.png` | Zero references |
| `public/llms.txt` | Zero references (may be intentional) |

### Dead Exported Functions (20+ functions)

| Function | File |
|----------|------|
| `optimizeCV()` | `src/lib/agents/index.ts` |
| `isPremiumTask()` | `src/lib/models/types.ts` |
| `estimateCost()`, `logModelUsage()`, `callModelStream()`, `parseModelJSON()` | `src/lib/models/index.ts` |
| `getTemplatesByRegion()` | `src/lib/cv-templates/types.ts` |
| `checkCreditsOnly()`, `getCreditCost()` | `src/lib/middleware/creditCheck.ts` |
| `saveApplicantDocuments()`, `clearApplicantDocuments()` | `src/lib/storage/applicantStore.ts` |
| `getDocuments()` | `src/lib/supabase/documents.ts` |
| `createFreeSubscription()`, `canCreateApplication()`, `connectOAuthProvider()` | `src/lib/supabase/accounts.ts` |
| `uploadGeneratedPDF()`, `getGeneratedPDFUrl()`, `listGeneratedPDFs()`, `deleteGeneratedPDF()` | `src/lib/supabase/storage.ts` |
| `getSubscriptionPlans()`, `getAddonCreditPacks()`, `upgradePlan()`, `processMonthlyReset()`, `getCreditTransactions()`, `processAddonPurchase()` | `src/lib/supabase/credits.ts` |
| `getFeaturedPosts()`, `getPostsByCategory()`, `getAllTags()` | `src/lib/blog/posts.ts` |
| `PlanTier` type, deprecated `stripe` constant | `src/lib/stripe.ts` |

### Dead Store State

| Item | File |
|------|------|
| `certifications` array + `addCertification()`, `removeCertification()`, `clearCertifications()` | `src/store/useCVStore.ts` |
| `PDFReference` type (never imported externally) | `src/store/index.ts` |

### Untracked Directory

| Item | Notes |
|------|-------|
| `chrome-extension/` | Contains `node_modules/` and `dist/`. Not part of main app. Add to `.gitignore` or move to separate repo |

### Stale TODO Comments

| File | Line | Comment |
|------|------|---------|
| `CVPanel.tsx` | 691 | `// TODO: Call AI to improve the section` |
| `pricing/page.tsx` | 94 | `// TODO: Replace priceId value with actual Stripe Price ID` |
| `SubscriptionSection.tsx` | 10 | `// TODO: Replace priceId value with actual Stripe Price ID` |

---

## Recommended Fix Priority

### Phase 1: Security Critical (before any public launch)
1. **C1** - Add auth to all 3 Stripe routes
2. **C2** - Atomic credit deduction via Supabase RPC
3. **C3** - Remove global mutable supabase client
4. **C6** - Add auth to chat route
5. **C7** - Fix anonymous generation double-free
6. **H1** - Add auth to generate-pdf route
7. **H2** - Add auth to parse-cv route + fix public blob
8. **H3** - Add rate limiting to Stripe routes
9. **H4** - Sanitize error responses

### Phase 2: Stability (first week)
10. **C4** - XSS fix in PDF download
11. **C5** - SSE stream cleanup on unmount
12. **H5** - EditableCVCanvas stale props
13. **H6** - Clipboard API error handling
14. **M12** - Fix stale credit amounts in UI
15. **M2** - Validate client-sent context data

### Phase 3: Quality (first month)
16. **H7** - Modal accessibility
17. **H8** - Deprecate useAppStore
18. **M1** - Cap context cache size
19. **M14** - Fix follow-up token tracking
20. Dead code cleanup (10 files, 12 packages)

---

## Estimated Impact

| Area | Items | Lines Removable | Packages Removable |
|------|-------|----------------|-------------------|
| Dead source files | 10 | ~1,000 | - |
| Unused dependencies | 12 | - | 12 packages (~15MB) |
| Dead exports | 20+ | ~300 | - |
| Dead store state | 4 | ~20 | - |
| Dead assets | 2-3 | - | - |
| **Total** | **~50** | **~1,320 lines** | **12 packages** |
