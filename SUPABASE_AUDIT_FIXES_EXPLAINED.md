# What Was Fixed and Why — Simple Explanation

This document explains each problem found in the Supabase audit, what could have gone wrong, and what the fix does.

---

## CRITICAL Fixes (5)

### 1. Anyone Could Give Themselves Unlimited Credits

**The Problem:** The `user_credits` table (where credit balances are stored) had a security rule that said "allow everyone to do everything." This meant any user — even someone not logged in — could open the browser console, connect to Supabase directly, and run a query like: *"set my credits to 999999."* They could also read other users' Stripe customer IDs or set other users' credits to zero.

**What Could Have Gone Wrong:** Someone discovers this, gives themselves unlimited credits, and generates thousands of applications at your expense (each one costs ~$0.18 in Anthropic API calls). Or they steal Stripe customer IDs for fraud. This was the single most dangerous finding.

**The Fix:** Removed the wildcard "allow everyone" policy. Now only the server-side code (using the secret service role key) can modify credits. Users can only view and update their own credits through the app, not directly.

---

### 2. Anyone Could Modify Any Subscription Record

**The Problem:** The `subscriptions` table had the exact same issue — a rule that let any user read, write, or delete any subscription record. Someone could upgrade themselves to "Max" tier without paying, or downgrade other users.

**What Could Have Gone Wrong:** Free users bypass payment entirely by modifying their subscription row directly. Or a malicious user deletes everyone else's subscriptions as sabotage.

**The Fix:** Same approach — removed the wildcard policy. Server-side webhook code (which handles Stripe events) uses the service role key that bypasses these rules anyway, so nothing breaks. Users can only view their own subscription.

---

### 3. New Users Were Created With Wrong Tier Name

**The Problem:** When you renamed the free tier from "Starter" to "Free" (the pricing pivot), the database trigger that runs when a new user signs up was never updated. It still created every new user with `plan_tier = 'starter'` instead of `'free'`. The code expected `'free'`, so there was a mismatch.

**What Could Have Gone Wrong:** The app might show confusing UI because the tier name doesn't match what the code expects. Credit checks, plan upgrade logic, and Stripe webhook handling could all behave unexpectedly because they check for `'free'` but the database says `'starter'`.

**The Fix:** Updated the trigger to use `'free'`. Also changed the column's default value from `'starter'` to `'free'` so any future inserts automatically get the correct value.

---

### 4. Three Users Had Mismatched Tier Data

**The Problem:** Two different tables store the user's plan: `profiles.subscription_tier` and `user_credits.plan_tier`. For 3 out of 4 users, these didn't match. For example, one user showed `'free'` in profiles but `'starter'` in user_credits. Another showed `'max'` in profiles but `'starter'` in user_credits.

**What Could Have Gone Wrong:** The profile page shows one tier, but the billing system charges based on another. A user on Max plan (paying $79.99/month) might only get 10 credits (the free/starter amount) because the credit system reads from the wrong table. Or a free user gets Max credits.

**The Fix:** Ran a targeted data fix to sync all users. Free users now say `'free'` in both tables. Max users say `'max'` in both tables. All 4 users are now consistent.

---

### 5. Contact Form Submissions Were Readable by All Users

**The Problem:** A policy called "Admins can view contact submissions" was actually configured to let **any logged-in user** read **all** contact form submissions. So any user could see everyone else's name, email, and message.

**What Could Have Gone Wrong:** Privacy violation. If someone submitted a sensitive message through the contact form, any other logged-in user could read it. Not great for trust.

**The Fix:** Removed the policy entirely. You can always view submissions through the Supabase Dashboard (which uses admin access). If you need an admin view in the app later, we can add a proper admin-only policy.

---

## HIGH Fixes (6)

### 6. TypeScript Types Were Out of Sync With Database (3 findings)

**The Problem:** The TypeScript type definitions (`types.ts`) didn't include several columns and two entire tables that exist in the database:
- `application_sessions` was missing: `fit_assessment`, `generation_completed`, `follow_up_email`
- `subscription_plans` was missing: `stripe_product_id`, `stripe_price_id_monthly`, `active`
- Two tables completely absent: `addon_credit_packs`, `message_feedback`

**What Could Have Gone Wrong:** A developer using the typed Supabase client wouldn't see these columns in autocomplete, could spell a column name wrong without getting an error, or miss data in query results. The code worked around this by using an "untyped" client, but that's fragile and error-prone.

**The Fix:** Added all missing columns and both missing tables to `types.ts`. Now every table and column in the database has a matching TypeScript type. Developers get full autocomplete and compile-time safety.

**Note on yearly pricing columns:** The database has `price_yearly` and `stripe_price_id_yearly` columns. Since you don't currently offer yearly subscriptions, I kept these columns in the database (they're nullable and cost nothing — ready for when you introduce yearly/quarterly pricing) but didn't add them to TypeScript types since no code uses them. When you add yearly pricing, just add them to types.ts at that time.

---

### 7. Four Dead Database Functions Were a Security Risk

**The Problem:** The database contained 4 old functions (`check_credit_balance`, `deduct_user_credits`, `get_total_credits`, `add_credits`) from before the credit logic was moved to TypeScript. Nobody called them anymore, but they had a security vulnerability: their "search path" was not locked down, meaning an attacker could potentially trick them into reading from the wrong schema.

**What Could Have Gone Wrong:** These functions had direct write access to the `user_credits` and `credit_transactions` tables. An attacker who discovered them could potentially exploit the mutable search path to bypass credit checks.

**The Fix:** Deleted all 4 functions. Also fixed the `search_path` on the 3 functions that are still in use (`handle_new_user`, `initialize_user_credits`, `update_updated_at`) so they're locked to the `public` schema.

---

### 8. Leaked Password Protection Was Disabled

**The Problem:** Supabase has a built-in feature that checks new passwords against the HaveIBeenPwned database (billions of leaked passwords from data breaches). This was turned off.

**What Could Have Gone Wrong:** A user signs up with a password like "password123" that's been leaked in 10,000 breaches. An attacker tries common leaked passwords against your login and gets in.

**The Fix:** This is a Dashboard setting — go to **Supabase Dashboard > Authentication > Settings > Enable "Leaked Password Protection"**. Note: This feature requires a **paid Supabase plan**. Currently on the free tier — enable when upgrading.

---

## MEDIUM Fixes (5)

### 9. Ghost Storage Bucket in Account Deletion Code

**The Problem:** The account deletion code tried to clean up files from 5 storage buckets, but one of them (`cv-uploads`) doesn't actually exist. Only 4 buckets exist in the database.

**What Could Have Gone Wrong:** No actual bug — the code had a try/catch that silently handled the missing bucket. But it was dead code that could confuse developers and waste a network call during deletion.

**The Fix:** Removed `'cv-uploads'` from the bucket list. Now it only tries the 4 real buckets.

---

### 10. Duplicate "Starter" and "Free" Tiers in Plans Table

**The Problem:** The `subscription_plans` table had both a `'free'` and a `'starter'` row, both with identical settings (10 credits, $0). The `'starter'` tier was left over from before the pricing pivot rename.

**What Could Have Gone Wrong:** Queries for "all active plans" would return 4 tiers instead of 3, potentially showing a duplicate in the pricing page or confusing upgrade/downgrade logic.

**The Fix:** Deactivated the `'starter'` tier (`active = false`). It still exists in the database (because some FK references point to it), but it won't show up in any active plan queries.

---

### 11. Chat Messages Couldn't Be Updated

**The Problem:** The `chat_messages` table had security policies for SELECT (read), INSERT (create), and DELETE, but no UPDATE policy. If code ever needed to edit a message, the database would silently reject it.

**What Could Have Gone Wrong:** If you ever add message editing (e.g., updating an assistant message's content or actions), the update would fail with no clear error.

**The Fix:** Added the missing UPDATE policy: users can update their own messages.

---

### 12. Database Queries Were Slower Than Necessary

**The Problem:** All Row-Level Security (RLS) policies used `auth.uid()` directly. In Postgres, this means the function is called once for **every row** the database checks, instead of being cached once per query. With tables that have hundreds of rows (like your 191 chat messages), this creates unnecessary overhead.

**What Could Have Gone Wrong:** As your user base grows and tables have thousands of rows, every database query would get progressively slower because `auth.uid()` is recalculated on each row. Queries that should take 5ms might take 50ms.

**The Fix:** Rewrote all 30+ RLS policies to use `(select auth.uid())` instead of `auth.uid()`. The `select` wrapper tells Postgres to evaluate it once and cache the result. Same security, faster queries.

---

### 13. Missing Database Index on Chat Messages

**The Problem:** The `chat_messages` table had a foreign key on `user_id` but no index covering it. When the database enforces RLS policies or runs account deletion, it has to scan the entire table to find matching rows.

**What Could Have Gone Wrong:** As chat messages grow (you already have 191), RLS checks and deletion queries slow down because there's no index to speed up the `user_id` lookup.

**The Fix:** Added an index on `chat_messages.user_id` for faster lookups.

---

## LOW Fixes (3)

### 14. Anonymous Generations Table Had No Explicit Security Rules

**The Problem:** The `anonymous_generations` table (which tracks free anonymous users by IP hash) had RLS enabled but no policies defined.

**What Actually Happens:** This is intentional and correct. The table is only ever accessed by server-side code using the service role key, which bypasses RLS. No client-side code touches it.

**The Fix:** Added a comment on the table documenting this design decision so future developers understand it's intentional.

---

### 15. Account Deletion Was Doing Extra Work

**The Problem:** The delete-account code manually deleted rows from 9 tables before deleting the profile. But all foreign keys are set to `ON DELETE CASCADE`, meaning deleting the profile would automatically delete everything else.

**What Actually Happens:** No bug — the manual deletion is actually good defense-in-depth. If someone ever changes the FK cascade behavior, the manual deletion still works.

**The Fix:** No code change. Just documented in the audit that the cascade exists and the manual deletion is intentionally redundant.

---

### 16. Contact Form Insert Policy Is Open to Everyone

**The Problem:** The contact form submission INSERT policy allows any user (including anonymous) to insert.

**What Actually Happens:** This is intentional — it's a public contact form. Server-side rate limiting (3/min per IP) and input validation protect against spam.

**The Fix:** No change needed. This is working as designed.

---

## Summary of Changes

| Area | Before | After |
|------|--------|-------|
| **Wildcard RLS policies** | 2 tables wide open to any user | Locked down, server-role only |
| **Contact submissions privacy** | Any user could read all submissions | Admin/dashboard only |
| **New user tier** | Created as 'starter' (deprecated) | Created as 'free' (correct) |
| **User data consistency** | 3/4 users had mismatched tiers | All 4 users synced |
| **TypeScript types** | Missing 3 columns + 2 tables | Fully synced with DB |
| **Orphaned functions** | 4 unused functions with security risk | Deleted |
| **RLS query performance** | auth.uid() re-evaluated per row | Cached with (select auth.uid()) |
| **Security warnings** | 10 advisories | 3 remaining (all intentional) |
| **TypeScript errors** | 0 | 0 (verified) |

### One Dashboard Action Required

**Enable Leaked Password Protection:** Go to Supabase Dashboard > Authentication > Settings > Toggle on "Leaked Password Protection". This blocks users from signing up with passwords known to be compromised.
