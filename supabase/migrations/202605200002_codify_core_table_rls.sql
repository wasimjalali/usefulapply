-- Codify current RLS posture for core user-data tables.
--
-- Context: profiles, application_sessions, documents, user_credits,
-- credit_transactions, subscriptions, and connected_accounts exist in
-- production but no prior migration declared them or their RLS policies.
-- This migration captures the live state (as reported by pg_policies on
-- 2026-05-20) so the repo becomes the source of truth.
--
-- The migration is idempotent and a no-op against the current live DB:
-- ALTER ... ENABLE ROW LEVEL SECURITY is a no-op when already enabled,
-- and every policy is DROPped then recreated by exact name. Running this
-- on a fresh clone reproduces the live posture.
--
-- KNOWN FOLLOW-UPS (intentionally not fixed in this migration — see fix #4):
--   1. user_credits has INSERT + UPDATE policies scoped to the row owner.
--      Combined with the browser anon-key being usable by any authenticated
--      user, this means a malicious user can run
--      `supabase.from('user_credits').update({...})` from devtools and
--      bypass server-side credit accounting (RLS allows the write because
--      it is their own row; there is no value-level constraint).
--   2. credit_transactions has the same INSERT exposure — users can
--      fabricate ledger rows for themselves.
--   Both are closed in the coupled credits-hardening migration that lands
--   alongside the credits.server.ts refactor.

-- ============================================================================
-- profiles
-- ============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING ((SELECT auth.uid()) = id);

-- ============================================================================
-- application_sessions
-- ============================================================================

ALTER TABLE public.application_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON public.application_sessions;
CREATE POLICY "Users can view own sessions"
  ON public.application_sessions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own sessions" ON public.application_sessions;
CREATE POLICY "Users can insert own sessions"
  ON public.application_sessions
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own sessions" ON public.application_sessions;
CREATE POLICY "Users can update own sessions"
  ON public.application_sessions
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.application_sessions;
CREATE POLICY "Users can delete own sessions"
  ON public.application_sessions
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- documents
-- ============================================================================

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own documents" ON public.documents;
CREATE POLICY "Users can view own documents"
  ON public.documents
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own documents" ON public.documents;
CREATE POLICY "Users can insert own documents"
  ON public.documents
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own documents" ON public.documents;
CREATE POLICY "Users can update own documents"
  ON public.documents
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own documents" ON public.documents;
CREATE POLICY "Users can delete own documents"
  ON public.documents
  FOR DELETE
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- user_credits  (SEE KNOWN FOLLOW-UP #1 ABOVE)
-- ============================================================================

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own credits" ON public.user_credits;
CREATE POLICY "Users can view own credits"
  ON public.user_credits
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Policies below are captured for parity with live state. They will be
-- DROPPED in the credits-hardening migration that lands with the
-- credits.server.ts refactor. Do not rely on them.

DROP POLICY IF EXISTS "Users can insert own credits" ON public.user_credits;
CREATE POLICY "Users can insert own credits"
  ON public.user_credits
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own credits" ON public.user_credits;
CREATE POLICY "Users can update own credits"
  ON public.user_credits
  FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- credit_transactions  (SEE KNOWN FOLLOW-UP #2 ABOVE)
-- ============================================================================

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own transactions" ON public.credit_transactions;
CREATE POLICY "Users can view own transactions"
  ON public.credit_transactions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- Will be DROPPED in the credits-hardening migration. See follow-up #2.
DROP POLICY IF EXISTS "Users can insert own transactions" ON public.credit_transactions;
CREATE POLICY "Users can insert own transactions"
  ON public.credit_transactions
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- subscriptions
-- ============================================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Read-only for users. Writes happen via service role from Stripe webhook
-- handlers (src/app/api/stripe/webhook/route.ts).
DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
CREATE POLICY "Users can view own subscription"
  ON public.subscriptions
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);

-- ============================================================================
-- connected_accounts
-- ============================================================================

ALTER TABLE public.connected_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can manage own connected accounts"
  ON public.connected_accounts
  FOR ALL
  USING ((SELECT auth.uid()) = user_id);

-- The SELECT-only policy below is redundant given the FOR ALL above, but is
-- captured for parity with the live database. Safe to remove in a future
-- cleanup; documented here for traceability.
DROP POLICY IF EXISTS "Users can view own connected accounts" ON public.connected_accounts;
CREATE POLICY "Users can view own connected accounts"
  ON public.connected_accounts
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id);
