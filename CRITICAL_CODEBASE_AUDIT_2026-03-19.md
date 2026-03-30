# Critical Codebase Audit

Date: 2026-03-19
Repo: `Karko_AI`
Scope: Critical backend and workflow paths only. I prioritized billing, credits, auth, document parsing/storage, and the main application/chat flows.

No application code was changed for this audit. This report is the only artifact created as part of this audit.

## Summary

| Severity | Count |
|---|---:|
| Critical | 2 |
| High | 5 |
| Medium | 6 |
| Total | 13 |

## What I Verified

- `npm run typecheck`: passed
- `npm run lint`: failed, but the output is dominated by lint hygiene noise and generated assets; I did not treat generic lint findings as production bugs
- `npm run build`: could not complete in this sandbox because `next/font` tried to fetch Google Fonts and network access is blocked here

## Findings

### C1. Analyze First charges 2.5 credits even though pricing says the full package should cost 2.0 credits total

**Where**

- `src/app/api/agent-v2/route.ts:372-390`
- `src/app/api/agent-v2/route.ts:564-582`
- `src/app/ai-job-application/pricing-credits/page.tsx:198-201`

**Exact problem**

The Analyze First path deducts `FIT_ANALYSIS` (`0.5`) during phase 1, then deducts `FULL_APPLICATION` (`2.0`) again during phase 2. That makes the total charge `2.5` credits for the same package.

The pricing page says:

- Analyze First or Apply Directly: `2` credits for one complete application
- Fit assessment only: `0.5` credits

The current implementation violates that contract.

**Impact**

- Users are overcharged by `0.5` credits every time they use Analyze First and then continue to generation
- Credit balances, pricing trust, and any analytics based on credit consumption become inaccurate

**What should be the fix**

- Change phase 2 to charge only the remaining delta after a paid fit analysis, not the full `2.0` again
- Two safe options:
  1. Add a dedicated action like `FULL_APPLICATION_AFTER_FIT = 1.5`
  2. Persist that fit-analysis credit consumption on the session/context and net it out server-side before the second deduction
- Add an automated test that asserts:
  - `full_optimization` costs `2.0`
  - `fit_analysis` only costs `0.5`
  - `fit_analysis` then `generate_with_context` totals `2.0`, not `2.5`

---

### C2. Upgrading from Plus to Max creates a second Stripe subscription instead of upgrading the existing one

**Where**

- `src/components/settings/SubscriptionSection.tsx:322-325`
- `src/app/api/stripe/create-checkout/route.ts:81-124`

**Exact problem**

Plus users are offered a `Get Max` button. That button hits `/api/stripe/create-checkout`, and that route always creates a brand-new Checkout Session in `mode: 'subscription'`.

There is no guard for:

- an existing active `stripe_subscription_id`
- an existing paid tier
- an upgrade flow that mutates the current subscription

**Inference from the code**

Because the route always calls `checkout.sessions.create({ mode: 'subscription' ... })` with no existing-subscription handling, a paid user upgrading through this path will create an additional subscription, not modify the current one.

**Impact**

- Users can be double-billed
- Webhook state can become inconsistent because multiple subscriptions can now map back to one app user
- Subsequent downgrades/cancellations become ambiguous

**What should be the fix**

- If the user already has an active paid subscription, do not open a new subscription checkout
- Instead:
  - update the existing Stripe subscription in backend code, or
  - send the user to a Stripe-managed upgrade path in the billing portal
- Only use Checkout for first-time paid subscription creation
- Add a test for `plus -> max` that asserts only one active Stripe subscription exists afterward

---

### H1. Stripe webhook processing is not idempotent for add-on purchases and refunds

**Where**

- `src/app/api/stripe/webhook/route.ts:213-257`
- `src/app/api/stripe/webhook/route.ts:523-655`

**Exact problem**

The webhook handler mutates balances directly for:

- add-on credit purchases
- refunds

but it never records or checks the Stripe event ID before applying those mutations.

Stripe webhooks are delivered at-least-once. Retries and manual replays are normal. Right now:

- replaying `checkout.session.completed` for an add-on purchase adds credits again
- replaying `charge.refunded` removes credits again

**Impact**

- Users can receive duplicate add-on credits
- Users can be double-penalized on refund replays
- Credit ledger integrity is not trustworthy

**What should be the fix**

- Introduce webhook idempotency keyed by Stripe `event.id`
- Persist processed event IDs in a dedicated table before mutating balances
- Add unique constraints or dedupe checks around business identifiers as a second layer:
  - add-on purchase: `session.id`
  - refund: `charge.id` plus refunded amount/state if partial refunds are supported

---

### H2. Subscription renewal bypasses the rollover logic the rest of the credit system already implements

**Where**

- `src/app/api/stripe/webhook/route.ts:489-520`
- Intended reset logic already exists in `src/lib/supabase/credits.ts:600-658`

**Exact problem**

On `invoice.payment_succeeded`, the webhook just resets `monthly_credits` to the base plan amount.

It does not:

- move unused monthly credits into `rollover_credits`
- apply `max_rollover_credits`
- update `last_reset_date`
- update `next_reset_date`

That means the renewal path ignores the logic already codified in `processMonthlyReset()`.

**Impact**

- Paid users lose rollover credits they should keep
- account state diverges depending on which reset path ran
- billing behavior no longer matches the product copy that says credits roll over while subscribed

**What should be the fix**

- Reuse one shared reset path for renewals
- Best option: call a single transactional reset routine from the webhook instead of re-implementing reset logic inline
- Add tests for:
  - Plus renewal with unused monthly credits
  - Max renewal at rollover cap
  - Renewal preserving add-on credits

---

### H3. Anonymous Analyze First users get locked out before they can run phase 2

**Where**

- `src/app/api/agent-v2/route.ts:281-293`
- `src/app/api/agent-v2/route.ts:432-437`

**Exact problem**

Anonymous users are globally blocked as soon as `hasAnonymousGeneration(ipHash)` returns true. But after a successful `fit_analysis`, the route immediately records the anonymous generation as used.

That means the next request to `generate_with_context` is rejected before the user can finish the same two-step flow.

**Impact**

- The no-signup Analyze First funnel is broken
- Anonymous users can analyze, but cannot continue to the full application package
- This is especially bad because the UI explicitly supports the two-step mode

**What should be the fix**

- Do not mark the anonymous allowance as consumed after phase 1
- Consume it only after phase 2 completes, or track a temporary in-progress allowance keyed by the returned `contextId`
- Add an end-to-end test for anonymous `fit_analysis -> generate_with_context`

---

### H4. Original uploaded PDFs are copied into public blob storage

**Where**

- `src/app/api/parse-cv/route.ts:166-175`
- `src/app/api/parse-cv/route.ts:277-285`

**Exact problem**

Authenticated PDF uploads are copied into Vercel Blob using:

- `access: 'public'`

The returned public URL is then included in the API response as `originalPdf.url`.

These files are resumes/CVs and often contain highly sensitive personal data.

**Impact**

- Sensitive personal information can be exposed via publicly accessible URLs
- This is a privacy and compliance risk, not just a storage choice

**What should be the fix**

- Do not store original resumes in public blob storage
- Use private storage with short-lived signed URLs if the file must be retrievable later
- If the original file is not actually needed after parsing, skip the blob copy entirely

---

### H5. The DOCX parser does not actually parse DOCX files

**Where**

- `src/app/api/parse-cv/route.ts:566-583`

**Exact problem**

DOCX files are ZIP containers. The current implementation does not unzip `word/document.xml`. It simply does:

- `buffer.toString('utf-8')`
- regex match for `<w:t>`

That only works accidentally when ZIP bytes happen to contain readable XML fragments. For real DOCX files, this path is unreliable by design.

**Impact**

- Supported DOCX uploads frequently parse as garbage or empty text
- Downstream AI/local parsing gets bad input and produces bad output or false failures

**What should be the fix**

- Properly unzip DOCX and extract `word/document.xml`
- Or use a proven DOCX text extraction library
- Add regression fixtures for:
  - a normal exported Word resume
  - a large DOCX with multiple sections
  - a DOCX containing tables/bullets

---

### M1. Chat message limits are enforced against client-provided history, so they are easy to bypass

**Where**

- `src/app/api/chat/route.ts:58-78`
- `src/app/api/chat/route.ts:82-99`

**Exact problem**

The server enforces the `MAX_CHAT_MESSAGES_PER_SESSION` cap by counting `context.chatHistory` from the request body. That history is client-supplied and can be omitted, truncated, or fabricated.

**Impact**

- The per-session cap is not real
- Authenticated users can exceed the intended chat cost guard simply by sending less history

**What should be the fix**

- Require a real `sessionId`
- Load and count the canonical stored messages server-side before accepting another chat turn
- Treat client history as context-only, not as an enforcement source of truth

---

### M2. The contact form can return success even if the submission was neither saved nor emailed

**Where**

- `src/app/api/contact/route.ts:73-96`
- `src/app/api/contact/route.ts:98-145`

**Exact problem**

If the Supabase insert fails, the route logs the error and continues. If the Resend email fails, the route logs the error and continues. It then still returns `success: true`.

So the system can acknowledge receipt even when nothing durable happened.

**Impact**

- Support inquiries and leads can be silently lost
- The user sees a success message and assumes follow-up will happen

**What should be the fix**

- Require at least one durable delivery path to succeed
- If both the DB write and the email notification fail, return `500`
- Consider logging a structured alert when one path fails so it is visible operationally

---

### M3. Uploaded CV files are orphaned in storage on replace, delete, and account deletion

**Where**

- Replace path: `src/lib/supabase/documents.ts:91-109`
- Delete path: `src/lib/supabase/documents.ts:132-143`
- Upload path: `src/lib/supabase/documents.ts:156-171`
- Account deletion cleanup: `src/app/api/auth/delete-account/route.ts:55-63`

**Exact problem**

Three separate cleanup gaps exist:

1. Re-uploading a document writes a new storage object under `cv-files/{userId}/{type}/{timestamp}.{ext}`, but the old `storage_path` is never deleted
2. Deleting a document removes only the database row, not the stored file
3. Account deletion lists only one level under `userId` and removes `${userId}/${f.name}`. That does not recursively remove nested `cv-files/{userId}/{type}/...` paths

**Impact**

- Deleted or replaced CVs remain in storage
- Storage costs grow over time
- Data-retention expectations are violated

**What should be the fix**

- On document replace, delete the previous `storage_path` before updating the row
- On document delete, remove the storage object referenced by that row
- On account delete, either:
  - delete by all `documents.storage_path` values first, or
  - recursively traverse and remove nested storage folders

---

### M4. Add-on purchase success polling stops too early, so credits often look unchanged right after payment

**Where**

- `src/app/settings/page.tsx:129-163`

**Exact problem**

After `addon_success=true`, the polling loop returns after the first successful `getUserCredits()` response because `isAddonSuccess` is included directly in the stop condition.

That means the UI usually stops polling before the Stripe webhook has had time to add the credits.

**Impact**

- Users can complete a successful purchase and still see the old balance until they manually refresh later
- This looks like a failed purchase even when billing succeeded

**What should be the fix**

- Keep polling until the balance actually changes, or until a bounded timeout is reached
- For add-on purchases, compare previous `addon_credits` against the newly fetched value

---

### M5. Unknown `planTier` values silently fall through to the Pro/Max Stripe price

**Where**

- `src/app/api/stripe/create-checkout/route.ts:47-78`

**Exact problem**

The route only special-cases `plus` and `max`. Anything else falls through to `STRIPE_PRICES.PRO`.

So a malformed or tampered request does not fail fast. It tries to create a paid checkout for the fallback price instead.

**Impact**

- Wrong plan can be charged
- Metadata can say one thing while Stripe billing uses another
- Client bugs become billing bugs instead of validation errors

**What should be the fix**

- Explicitly allow only `plus` and `max`
- Reject any other `planTier` with `400`
- Remove the fallback ternary behavior entirely

---

### M6. The signup route returns raw provider errors directly to the client

**Where**

- `src/app/api/auth/signup/route.ts:69-80`

**Exact problem**

The route returns `linkError.message` directly from Supabase Auth. That exposes provider-level details such as:

- account already exists
- redirect allowlist/config problems
- policy details that should stay server-side

**Impact**

- Enables account/email enumeration
- Leaks backend configuration detail into a public endpoint

**What should be the fix**

- Return generic user-safe messages
- Log the detailed provider error only on the server
- If resend/account-exists flows need special UI, map them to explicit internal error codes instead of raw provider text

## Recommended Fix Order

1. Fix `Analyze First` billing first: it is directly overcharging users
2. Fix paid-tier upgrade flow before more subscriptions are sold
3. Add Stripe webhook idempotency before touching any more credit logic
4. Restore renewal rollover behavior using one shared reset path
5. Lock down original CV storage and clean up the document lifecycle leaks
6. Fix DOCX parsing so a supported file type actually works reliably
7. Fix the medium-severity UX/reliability issues after billing/storage are stable

## Notes

- The duplicate-subscription upgrade finding is an inference from the current code path and Stripe Checkout semantics, not from a live Stripe account inspection
- I intentionally excluded generic lint noise and style issues from the bug count unless they pointed to a concrete runtime or product defect
