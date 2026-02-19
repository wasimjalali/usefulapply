-- =====================================================
-- FIX SIGNUP TRIGGERS — "Database error saving new user"
-- Date: February 19, 2026
-- Root cause: handle_new_user() and initialize_user_credits()
--   trigger functions have NO exception handling. Any error
--   in the trigger chain (FK violation, missing plan row, etc.)
--   propagates to auth.users INSERT → Supabase 500 error.
-- Fix: Add EXCEPTION WHEN OTHERS THEN + ON CONFLICT guards.
-- Also: Fix credit_transactions CHECK constraint missing
--   'full_application', 'fit_analysis', 'cv_optimization'.
-- =====================================================

-- =====================================================
-- 1. ENSURE subscription_plans has 'starter' tier
--    (user_credits.plan_tier FK references this)
-- =====================================================

INSERT INTO subscription_plans (
  tier, name, description, price_monthly, credits_monthly,
  rollover_months, max_rollover_credits, addon_enabled, display_order
)
VALUES (
  'starter', 'Starter', 'See your first AI application',
  0.00, 40, 0, 0, FALSE, 1
)
ON CONFLICT (tier) DO NOTHING;

-- =====================================================
-- 2. RECREATE handle_new_user() WITH exception handling
--    This is the trigger that runs on auth.users INSERT.
--    Without EXCEPTION WHEN OTHERS, any downstream error
--    blocks signup entirely.
-- =====================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
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
    -- Log error but NEVER block auth signup
    RAISE LOG '[handle_new_user] Skipped profile creation for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 3. RECREATE initialize_user_credits() WITH exception handling
--    This trigger fires after profiles INSERT.
--    If subscription_plans or user_credits has any issue,
--    it previously threw and cascaded back up to auth.users.
-- =====================================================

CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard: ensure starter plan row exists before FK insert
  INSERT INTO subscription_plans (
    tier, name, description, price_monthly, credits_monthly,
    rollover_months, max_rollover_credits, addon_enabled, display_order
  )
  VALUES (
    'starter', 'Starter', 'See your first AI application',
    0.00, 10, 0, 0, FALSE, 1
  )
  ON CONFLICT (tier) DO UPDATE SET credits_monthly = 10;

  -- Initialize user credits
  INSERT INTO user_credits (
    user_id, monthly_credits, plan_tier, next_reset_date
  )
  VALUES (
    NEW.id, 10, 'starter', NOW() + INTERVAL '1 month'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but NEVER block profile creation
    RAISE LOG '[initialize_user_credits] Skipped credits init for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- 4. RE-ATTACH TRIGGERS (idempotent)
--    Ensures triggers exist and point to updated functions
-- =====================================================

-- Trigger on auth.users → creates profile
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger on profiles → initializes credits
DROP TRIGGER IF EXISTS on_profile_created_init_credits ON public.profiles;
CREATE TRIGGER on_profile_created_init_credits
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.initialize_user_credits();

-- =====================================================
-- 5. FIX credit_transactions CHECK CONSTRAINT
--    Original constraint is missing transaction types now
--    used by the app: 'full_application', 'fit_analysis',
--    'cv_optimization'. Deductions fail silently or throw
--    because of the CHECK violation.
-- =====================================================

ALTER TABLE credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type IN (
    -- Legacy (keep for historical records)
    'application_generation',
    'full_generation',
    -- Current app actions (action.toLowerCase())
    'full_application',
    'fit_analysis',
    'cv_optimization',
    'cover_letter_regen',
    'email_regen',
    'follow_up_regen',
    -- System operations
    'monthly_reset',
    'rollover_applied',
    'addon_purchase',
    'plan_upgrade',
    'plan_downgrade',
    'admin_adjustment',
    'refund',
    'expired'
  ));

-- =====================================================
-- VERIFICATION — Run these after applying to confirm fix
-- =====================================================

-- Check triggers exist:
-- SELECT trigger_name, event_object_schema, event_object_table, action_timing
-- FROM information_schema.triggers
-- WHERE trigger_name IN ('on_auth_user_created', 'on_profile_created_init_credits');

-- Check starter plan exists:
-- SELECT tier, credits_monthly FROM subscription_plans WHERE tier = 'starter';

-- Check constraint updated:
-- SELECT conname, consrc FROM pg_constraint
-- WHERE conrelid = 'credit_transactions'::regclass
-- AND contype = 'c';
