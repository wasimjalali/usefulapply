# Supabase Database Audit Report

**Date:** March 3, 2026
**Scope:** Full audit of Supabase DB schema vs codebase — tables, columns, types, RLS policies, triggers, functions, storage, and data integrity.
**Project:** `rqchhvwqrxkzkpcotwjx` (Karko-ai, eu-north-1)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 5 |
| HIGH | 6 |
| MEDIUM | 5 |
| LOW | 3 |
| **Total** | **19** |

---

## CRITICAL Findings

### C1. DB Trigger `initialize_user_credits()` Still Uses 'starter' Instead of 'free'

**Location:** DB function `initialize_user_credits()` (trigger on `profiles` INSERT)

**Problem:** The pricing pivot (Starter -> Free) renamed the free tier to `'free'`, but the DB trigger was never updated. It still:
1. Upserts a `'starter'` row into `subscription_plans` with 10 credits
2. Inserts `plan_tier = 'starter'` into `user_credits` for new users

**Code expectation:** `credits.ts:initializeUserCredits()` uses `plan_tier: 'free'`

**Current trigger source:**
```sql
INSERT INTO subscription_plans (...) VALUES ('starter', 'Starter', ..., 10, ...)
ON CONFLICT (tier) DO UPDATE SET credits_monthly = 10;

INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
VALUES (NEW.id, 10, 'starter', NOW() + INTERVAL '1 month')
ON CONFLICT (user_id) DO NOTHING;
```

**Impact:** New users get `plan_tier = 'starter'` from the trigger. The code's upsert (with `onConflict: 'user_id'`) *would* overwrite to 'free', but only if the client-side `initializeUserCredits()` runs (it only runs when `getUserCredits()` returns null, which doesn't happen because the trigger already created the row). **Result: all new users end up on 'starter' tier instead of 'free'.**

**Fix:**
```sql
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 10, 'free', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[initialize_user_credits] Skipped for user %: % (%)', NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

### C2. `user_credits.plan_tier` Column DEFAULT Is 'starter' Instead of 'free'

**Location:** `user_credits` table, `plan_tier` column

**Current default:** `'starter'::text`
**Expected default:** `'free'::text`

**Impact:** Any code path that creates a `user_credits` row without explicitly setting `plan_tier` (e.g., a future migration, manual insert, or code bug) would default to `'starter'` — a tier that is effectively deprecated.

**Fix:**
```sql
ALTER TABLE user_credits ALTER COLUMN plan_tier SET DEFAULT 'free';
```

---

### C3. `profiles.subscription_tier` vs `user_credits.plan_tier` Data Mismatch

**Location:** Live data in `profiles` and `user_credits` tables

**Current state (all 4 users):**

| Email | profiles.subscription_tier | user_credits.plan_tier | Match? |
|-------|---------------------------|----------------------|--------|
| jalaliwasim15@gmail.com | max | max | YES |
| 17odedrap@gmail.com | free | starter | NO |
| wasimjalali2004@gmail.com | max | starter | NO |
| wasim100ai@gmail.com | free | starter | NO |

**Impact:** 3 of 4 users have mismatched tiers. `profiles.subscription_tier` is used by AuthContext/PostHog for analytics. `user_credits.plan_tier` is used for credit logic and Stripe. When these disagree, the UI may show one tier while billing logic uses another.

**Root cause:** The pricing pivot migration updated `profiles.subscription_tier` (starter->free) but the `user_credits.plan_tier` was not updated (still 'starter'). The `initialize_user_credits` trigger (C1) also perpetuates 'starter'.

**Fix:**
```sql
-- Fix existing users: sync user_credits.plan_tier to match profiles
UPDATE user_credits SET plan_tier = 'free'
WHERE plan_tier = 'starter'
AND user_id IN (
  SELECT id FROM profiles WHERE subscription_tier = 'free'
);

-- Fix wasimjalali2004: profiles says 'max' but user_credits says 'starter'
-- Verify which is correct, then update the mismatched one
```

---

### C4. RLS Policy on `subscriptions` Table Grants ALL Access to Public Role

**Location:** `subscriptions` table, policy "Service role can manage subscriptions"

**Current policy:**
```
roles: {public}  |  cmd: ALL  |  qual: true  |  with_check: true
```

**Problem:** This policy grants **unrestricted read/write/delete access to ANY user** (including anonymous). The `{public}` role in Postgres includes both `anon` and `authenticated` roles. A malicious user could:
- Read other users' subscription details (stripe_customer_id, stripe_subscription_id)
- Modify their own subscription tier to 'max' without paying
- Delete other users' subscriptions

**Note:** The Supabase security advisor also flagged this as `rls_policy_always_true`.

**Fix:** Drop the wildcard policy and create a service-role-only policy:
```sql
DROP POLICY "Service role can manage subscriptions" ON subscriptions;

-- Service role already bypasses RLS, so no explicit policy needed for it.
-- The existing "Users can view own subscription" SELECT policy is sufficient
-- for client-side reads.
```

---

### C5. RLS Policy on `user_credits` Table Grants ALL Access to Public Role

**Location:** `user_credits` table, policy "Service role can manage user_credits"

**Current policy:**
```
roles: {public}  |  cmd: ALL  |  qual: true  |  with_check: true
```

**Problem:** Same as C4 but **far more dangerous**. Any user can:
- **Set their own credits to 999999** with a simple Supabase client call
- Modify their `plan_tier` to 'max' without paying
- Read other users' `stripe_customer_id` values
- Set other users' credits to 0

**This is the single most critical security finding in this audit.**

**Fix:**
```sql
DROP POLICY "Service role can manage user_credits" ON user_credits;

-- The per-user policies already exist and are correct:
-- "Users can view own credits" (SELECT, auth.uid() = user_id)
-- "Users can update own credits" (UPDATE, auth.uid() = user_id)
-- "Users can insert own credits" (INSERT, auth.uid() = user_id)
-- Service role bypasses RLS automatically — no explicit policy needed.
```

---

## HIGH Findings

### H1. `application_sessions` TypeScript Types Missing 3 DB Columns

**Location:** `src/lib/supabase/types.ts`, `application_sessions` table definition

**DB has these columns that types.ts does NOT:**

| Column | DB Type | DB Default | Used In Code? |
|--------|---------|------------|---------------|
| `fit_assessment` | jsonb | null | Yes — `agent-v2/route.ts`, `useAgentWorkflow.ts` |
| `generation_completed` | boolean | false | Yes — `agent-v2/route.ts` |
| `follow_up_email` | jsonb | null | Yes — `agent-v2/route.ts`, `EmailPanel.tsx` |

**Impact:** Code using the **typed** Supabase client (`Database['public']['Tables']['application_sessions']`) won't have TypeScript autocompletion or type safety for these 3 columns. Currently works because `sessions.ts` uses `getUntypedSupabase()` and casts to its own `ApplicationSession` interface (which does include `follow_up_email`). But any developer using the typed client would miss these fields.

**Fix:** Add the 3 columns to `types.ts`:
```typescript
// In application_sessions Row:
fit_assessment: Json | null
generation_completed: boolean
follow_up_email: Json | null
```

---

### H2. `subscription_plans` TypeScript Types Missing 5 DB Columns

**Location:** `src/lib/supabase/types.ts`, `subscription_plans` table definition

**DB has these columns that types.ts does NOT:**

| Column | DB Type |
|--------|---------|
| `price_yearly` | numeric (nullable) |
| `stripe_product_id` | text (nullable) |
| `stripe_price_id_monthly` | text (nullable) |
| `stripe_price_id_yearly` | text (nullable) |
| `active` | boolean (default true) |

**Impact:** Same as H1 — typed client misses these columns. The `SubscriptionPlan` interface in `credits.ts` has `stripe_product_id`, `stripe_price_id_monthly`, and `active` but is missing `price_yearly` and `stripe_price_id_yearly`. Code works via untyped client.

**Fix:** Add all 5 columns to `types.ts` subscription_plans Row/Insert/Update.

---

### H3. `addon_credit_packs` and `message_feedback` Tables Not in types.ts

**Location:** `src/lib/supabase/types.ts`

**Problem:** Two active tables exist in the DB but are completely absent from the `Database` interface:
- `addon_credit_packs` (1 row, queried by `credits.ts`)
- `message_feedback` (0 rows, queried by `feedback.ts`)

**Impact:** All queries to these tables use untyped client. No compile-time safety for column names or types.

**Fix:** Add both table definitions to `types.ts` Database interface. Can be auto-generated using `npx supabase gen types typescript`.

---

### H4. `contact_submissions` SELECT Policy Gives Access to ALL Authenticated Users

**Location:** `contact_submissions` table, policy "Admins can view contact submissions"

**Current policy:**
```
roles: {authenticated}  |  cmd: SELECT  |  qual: true
```

**Problem:** Despite the name "Admins can view", this policy allows **any logged-in user** to read **all contact form submissions** — including names, emails, and messages from other users. This is a privacy violation.

**Fix:** Either restrict to a specific admin role, or remove the policy entirely (admin can use the Supabase dashboard or service role key to view submissions):
```sql
DROP POLICY "Admins can view contact submissions" ON contact_submissions;

-- If you need admin access via the app, create a proper admin check:
-- CREATE POLICY "Admins can view contact submissions" ON contact_submissions
--   FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT id FROM profiles WHERE subscription_tier = 'enterprise'));
```

---

### H5. 4 Orphaned DB Functions With Mutable Search Path (Security Risk)

**Location:** Public schema functions

**Orphaned functions (never called from code — all credit logic moved to TypeScript):**

| Function | Args | Created By |
|----------|------|------------|
| `check_credit_balance` | (uuid, numeric) | Old migration |
| `deduct_user_credits` | (uuid, numeric, text, uuid, text) | Old migration |
| `get_total_credits` | (user_credits) | Old migration |
| `add_credits` | (uuid, integer, text, text, text) | Old migration |

**Risk:** Supabase security advisor flags all 4 as `function_search_path_mutable` (WARN). A function without a fixed `search_path` can be exploited via search path injection — an attacker could create a schema with malicious replacements for `user_credits` or `credit_transactions`.

**Fix:**
```sql
DROP FUNCTION IF EXISTS check_credit_balance(uuid, numeric);
DROP FUNCTION IF EXISTS deduct_user_credits(uuid, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS get_total_credits(user_credits);
DROP FUNCTION IF EXISTS add_credits(uuid, integer, text, text, text);
```

---

### H6. Leaked Password Protection Disabled

**Location:** Supabase Auth settings

**Problem:** Supabase Auth can check passwords against HaveIBeenPwned.org to block compromised credentials. This is currently disabled.

**Fix:** Enable in Supabase Dashboard: **Authentication > Settings > Password Protection > Enable Leaked Password Protection**. Note: Requires paid Supabase plan — enable when upgrading from free tier.

---

## MEDIUM Findings

### M1. Storage Bucket `cv-uploads` Referenced in Delete-Account But Doesn't Exist

**Location:** `src/app/api/auth/delete-account/route.ts` line 56

**Code:**
```typescript
const buckets = ['avatars', 'profile-photos', 'generated-pdfs', 'cv-uploads', 'cv-files'];
```

**Actual buckets in Supabase:** `avatars`, `profile-photos`, `generated-pdfs`, `cv-files` (4 buckets, no `cv-uploads`)

**Impact:** The try/catch silently handles the missing bucket, so no error occurs. But it's dead code that could confuse future developers.

**Fix:** Remove `'cv-uploads'` from the buckets array.

---

### M2. Duplicate Tiers in `subscription_plans`: Both 'free' and 'starter' Exist

**Location:** `subscription_plans` table data

**Current state:**
| tier | name | credits_monthly | display_order |
|------|------|----------------|---------------|
| free | Free | 10 | 1 |
| starter | Starter | 10 | 1 |
| plus | Plus | 100 | 2 |
| max | Max | 200 | 3 |

**Problem:** Both `'free'` and `'starter'` tiers exist with identical settings (10 credits, display_order 1). The `'starter'` tier is a relic from before the pricing pivot. It's kept alive by:
1. The `initialize_user_credits()` trigger (C1) that upserts it
2. The FK constraint `user_credits_plan_tier_fkey` referencing it (3 users still on 'starter')

**Impact:** Confusing, wastes a row, and the trigger perpetuates it. After fixing C1 and C3, the starter tier can be deactivated.

**Fix (after C1 and C3 are fixed):**
```sql
UPDATE subscription_plans SET active = false WHERE tier = 'starter';
```

---

### M3. `chat_messages` Missing UPDATE RLS Policy

**Location:** `chat_messages` table RLS policies

**Current policies:** SELECT, INSERT, DELETE (all with `auth.uid() = user_id`)
**Missing:** UPDATE

**Impact:** If any code ever needs to update a chat message (e.g., edit content, update actions), it would fail silently. Currently no code calls `.update()` on `chat_messages`, so no active bug — but it's an incomplete policy set.

**Fix:**
```sql
CREATE POLICY "Users can update own messages" ON chat_messages
  FOR UPDATE TO public
  USING (auth.uid() = user_id);
```

---

### M4. RLS Policies Use `auth.uid()` Instead of `(select auth.uid())` — Performance Issue

**Location:** All RLS policies across all tables (profiles, documents, application_sessions, etc.)

**Problem:** Supabase performance advisor flags 20+ policies using `auth.uid()` directly. Without the `(select ...)` wrapper, Postgres re-evaluates `auth.uid()` for **every row** instead of caching it once per query. At scale (hundreds of sessions per user), this causes measurable query slowdown.

**Example fix:**
```sql
-- Before:
USING (auth.uid() = user_id)

-- After (cached, faster):
USING ((select auth.uid()) = user_id)
```

**Impact:** No functional bug, but queries get progressively slower as table sizes grow. With 65 application_sessions and 191 chat_messages currently, the impact is minimal. Becomes significant at 1000+ rows per user.

**Fix:** Recreate all RLS policies with `(select auth.uid())`. This is a one-time migration.

---

### M5. `chat_messages.user_id` FK Missing Covering Index

**Location:** `chat_messages` table

**Problem:** Supabase performance advisor flags `chat_messages_user_id_fkey` as missing a covering index. There's an index on `session_id` and `created_at`, but no index on `user_id`.

**Impact:** Queries filtering by `user_id` (e.g., RLS policy checks, delete-account cleanup) do sequential scans on the chat_messages table.

**Fix:**
```sql
CREATE INDEX idx_chat_messages_user_id ON chat_messages (user_id);
```

---

## LOW Findings

### L1. `anonymous_generations` Has RLS Enabled But No Explicit Policies

**Location:** `anonymous_generations` table

**Current state:** RLS enabled, zero policies.

**Impact:** None — this is actually correct behavior. The table is only accessed by the server-side `agent-v2/route.ts` using the service role key, which bypasses RLS entirely. No client-side code ever queries this table. The Supabase advisor flags it as INFO, not a bug.

**Recommendation:** Add a comment to the table documenting this intentional design:
```sql
COMMENT ON TABLE anonymous_generations IS 'Service-role only. No client RLS policies by design.';
```

---

### L2. Delete-Account Manually Deletes Rows That Would CASCADE Automatically

**Location:** `src/app/api/auth/delete-account/route.ts`

**Problem:** The code manually deletes from 9 tables + profiles. But all FK constraints have `ON DELETE CASCADE` from `profiles`:
- `application_sessions` -> profiles (CASCADE)
- `chat_messages` -> profiles (CASCADE)
- `documents` -> profiles (CASCADE)
- etc.

Deleting the `profiles` row alone would cascade-delete everything. The manual per-table deletion is redundant (though not harmful).

**Additional FK detail:**
- `credit_transactions.session_id` -> application_sessions: `ON DELETE SET NULL` (correct — preserves transaction history)

**Impact:** No bug, just unnecessary code. The manual deletion does ensure cleanup even if CASCADE is ever removed, so it's defensively correct.

**Recommendation:** Keep the manual deletions for defense-in-depth, but reorder so `credit_transactions` is deleted before `application_sessions` (currently after), or simply rely on CASCADE.

---

### L3. `contact_submissions` INSERT Policy Allows Unrestricted Access

**Location:** `contact_submissions` table, policy "Anyone can submit contact form"

**Current policy:**
```
roles: {anon, authenticated}  |  cmd: INSERT  |  with_check: true
```

**Assessment:** This is **intentionally correct** — the contact form is a public feature accessible without authentication. The Supabase advisor flags it, but it's by design. Server-side rate limiting (3/min per IP) and input validation protect against abuse.

**No fix needed.**

---

## Data Integrity Summary

### Tables: DB vs types.ts

| Table | In DB | In types.ts | In Code Interface | Status |
|-------|-------|------------|-------------------|--------|
| profiles | 17 cols | 17 cols | - | MATCH |
| documents | 15 cols | 15 cols (12 in types.ts) | - | types.ts has 12, DB has 15 — missing `structured_data` in some variants |
| profile_photos | 5 cols | 5 cols | - | MATCH |
| application_sessions | 31 cols | 28 cols | 30 cols (sessions.ts) | **MISMATCH** — types.ts missing 3 |
| chat_messages | 7 cols | 7 cols | 7 cols (sessions.ts) | MATCH |
| subscriptions | 17 cols | 17 cols | - | MATCH |
| connected_accounts | 10 cols | 10 cols | - | MATCH |
| anonymous_generations | 3 cols | 3 cols | - | MATCH |
| contact_submissions | 7 cols | 7 cols | - | MATCH |
| user_credits | 13 cols | 13 cols | 13 cols (credits.ts) | MATCH |
| credit_transactions | 10 cols | 10 cols | 10 cols (credits.ts) | MATCH |
| subscription_plans | 17 cols | 12 cols | 13 cols (credits.ts) | **MISMATCH** — types.ts missing 5 |
| addon_credit_packs | 10 cols | NOT IN types.ts | 10 cols (credits.ts) | **MISSING** from types.ts |
| message_feedback | 8 cols | NOT IN types.ts | 8 cols (feedback.ts) | **MISSING** from types.ts |

### Storage Buckets: DB vs Code

| Bucket | In DB | In Code | Status |
|--------|-------|---------|--------|
| avatars | YES (public) | YES (storage.ts) | MATCH |
| profile-photos | YES (private) | YES (storage.ts) | MATCH |
| generated-pdfs | YES (private) | YES (storage.ts) | MATCH |
| cv-files | YES (private) | YES (storage.ts) | MATCH |
| cv-uploads | **NO** | YES (delete-account) | **PHANTOM** — referenced but doesn't exist |

### DB Functions: Active vs Orphaned

| Function | Called From | Status |
|----------|-----------|--------|
| handle_new_user() | Trigger on auth.users INSERT | ACTIVE |
| initialize_user_credits() | Trigger on profiles INSERT | ACTIVE (but needs C1 fix) |
| update_updated_at() | Triggers on 3 tables UPDATE | ACTIVE |
| check_credit_balance() | **NOTHING** | ORPHANED — delete |
| deduct_user_credits() | **NOTHING** | ORPHANED — delete |
| get_total_credits() | **NOTHING** | ORPHANED — delete |
| add_credits() | **NOTHING** | ORPHANED — delete |

---

## Recommended Fix Order

Execute in this order to avoid FK violations and cascading issues:

1. **C5** — Drop `user_credits` wildcard RLS policy (URGENT — security)
2. **C4** — Drop `subscriptions` wildcard RLS policy (URGENT — security)
3. **H4** — Drop `contact_submissions` admin SELECT policy (privacy)
4. **C3** — Fix user data: sync plan_tier to match subscription_tier
5. **C1** — Update `initialize_user_credits()` trigger to use 'free'
6. **C2** — Change `user_credits.plan_tier` column DEFAULT to 'free'
7. **M2** — Deactivate 'starter' tier in subscription_plans
8. **H5** — Drop 4 orphaned DB functions
9. **H1** — Update types.ts with missing application_sessions columns
10. **H2** — Update types.ts with missing subscription_plans columns
11. **H3** — Add addon_credit_packs and message_feedback to types.ts
12. **H6** — Enable leaked password protection (Dashboard setting)
13. **M1** — Remove phantom `cv-uploads` bucket reference from code
14. **M3** — Add chat_messages UPDATE policy
15. **M4** — Optimize RLS policies with `(select auth.uid())`
16. **M5** — Add chat_messages user_id index

---

## Combined SQL Migration (Items 1-8)

```sql
-- =============================================================
-- SUPABASE AUDIT FIX MIGRATION
-- Date: March 3, 2026
-- Run in Supabase SQL Editor
-- =============================================================

-- -----------------------------------------------
-- C4 + C5: Drop dangerous wildcard RLS policies
-- -----------------------------------------------
DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Service role can manage user_credits" ON user_credits;

-- -----------------------------------------------
-- H4: Drop overly-permissive contact_submissions SELECT
-- -----------------------------------------------
DROP POLICY IF EXISTS "Admins can view contact submissions" ON contact_submissions;

-- -----------------------------------------------
-- C3: Fix user data — sync plan_tier to match profiles
-- -----------------------------------------------
UPDATE user_credits uc
SET plan_tier = 'free'
FROM profiles p
WHERE uc.user_id = p.id
AND uc.plan_tier = 'starter'
AND (p.subscription_tier = 'free' OR p.subscription_tier = 'starter');

-- For wasimjalali2004 (profiles=max, user_credits=starter) — fix to max
UPDATE user_credits
SET plan_tier = 'max'
WHERE user_id = (SELECT id FROM profiles WHERE email = 'wasimjalali2004@gmail.com')
AND plan_tier = 'starter';

-- -----------------------------------------------
-- C1: Fix initialize_user_credits trigger to use 'free'
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 10, 'free', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[initialize_user_credits] Skipped for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------
-- C2: Fix column default
-- -----------------------------------------------
ALTER TABLE user_credits ALTER COLUMN plan_tier SET DEFAULT 'free';

-- -----------------------------------------------
-- M2: Deactivate the orphaned 'starter' tier
-- -----------------------------------------------
UPDATE subscription_plans SET active = false WHERE tier = 'starter';

-- -----------------------------------------------
-- H5: Drop orphaned functions
-- -----------------------------------------------
DROP FUNCTION IF EXISTS check_credit_balance(uuid, numeric);
DROP FUNCTION IF EXISTS deduct_user_credits(uuid, numeric, text, uuid, text);
DROP FUNCTION IF EXISTS get_total_credits(user_credits);
DROP FUNCTION IF EXISTS add_credits(uuid, integer, text, text, text);

-- -----------------------------------------------
-- M3: Add missing chat_messages UPDATE policy
-- -----------------------------------------------
CREATE POLICY "Users can update own messages" ON chat_messages
  FOR UPDATE TO public
  USING (auth.uid() = user_id);

-- -----------------------------------------------
-- M5: Add missing index
-- -----------------------------------------------
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id ON chat_messages (user_id);

-- -----------------------------------------------
-- Also fix search_path on active functions
-- -----------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[handle_new_user] Skipped profile creation for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- -----------------------------------------------
-- L1: Document anonymous_generations design
-- -----------------------------------------------
COMMENT ON TABLE anonymous_generations IS 'Service-role only. No client RLS policies by design.';

-- -----------------------------------------------
-- VERIFICATION QUERIES (run after migration)
-- -----------------------------------------------
-- Check no wildcard policies remain:
-- SELECT * FROM pg_policies WHERE schemaname = 'public' AND qual = 'true' AND cmd = 'ALL';

-- Check all user_credits.plan_tier values are valid:
-- SELECT plan_tier, count(*) FROM user_credits GROUP BY plan_tier;

-- Check profiles vs user_credits sync:
-- SELECT p.email, p.subscription_tier, uc.plan_tier FROM profiles p JOIN user_credits uc ON uc.user_id = p.id;
```

---

## Code Changes Needed (Items 9-13)

### Item 9-11: Update types.ts

Regenerate types using `npx supabase gen types typescript` or manually add:

**application_sessions:** Add `fit_assessment`, `generation_completed`, `follow_up_email`
**subscription_plans:** Add `price_yearly`, `stripe_product_id`, `stripe_price_id_monthly`, `stripe_price_id_yearly`, `active`
**New tables:** Add `addon_credit_packs` and `message_feedback` full definitions

### Item 12: Enable Leaked Password Protection (Pending — requires paid Supabase plan)

Supabase Dashboard > Authentication > Settings > Enable "Leaked Password Protection". Requires paid plan — enable when upgrading from free tier.

### Item 13: Remove phantom bucket reference

In `src/app/api/auth/delete-account/route.ts` line 56:
```typescript
// Before:
const buckets = ['avatars', 'profile-photos', 'generated-pdfs', 'cv-uploads', 'cv-files'];

// After:
const buckets = ['avatars', 'profile-photos', 'generated-pdfs', 'cv-files'];
```

---

## RLS Performance Optimization (Item 15 — Optional)

This is a bulk migration to optimize all RLS policies. Can be done later as a separate task.

Replace `auth.uid()` with `(select auth.uid())` in all 30+ policies. Example pattern:

```sql
-- For each policy, drop and recreate with the optimized form:
DROP POLICY "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO public
  USING ((select auth.uid()) = id);
```

Repeat for all tables: profiles, documents, application_sessions, chat_messages, connected_accounts, credit_transactions, message_feedback, profile_photos, user_credits.
