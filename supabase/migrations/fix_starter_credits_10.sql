-- =====================================================
-- FIX STARTER CREDITS: 40 → 10
-- Date: February 19, 2026
-- Root cause: initialize_user_credits() DB trigger was
--   hardcoded to 40 credits. TypeScript fallback already
--   uses 10 but the trigger runs first, so new users
--   were getting 40 instead of 10.
-- =====================================================

-- =====================================================
-- 1. UPDATE subscription_plans: starter credits 40 → 10
-- =====================================================

UPDATE subscription_plans
SET credits_monthly = 10, updated_at = NOW()
WHERE tier = 'starter';

-- =====================================================
-- 2. RECREATE initialize_user_credits() with 10 credits
-- =====================================================

CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscription_plans (
    tier, name, description, price_monthly, credits_monthly,
    rollover_months, max_rollover_credits, addon_enabled, display_order
  )
  VALUES (
    'starter', 'Starter', 'See your first AI application',
    0.00, 10, 0, 0, FALSE, 1
  )
  ON CONFLICT (tier) DO UPDATE SET credits_monthly = 10;

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
    RAISE LOG '[initialize_user_credits] Skipped credits init for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Confirm subscription_plans updated:
-- SELECT tier, credits_monthly FROM subscription_plans WHERE tier = 'starter';
-- Expected: credits_monthly = 10

-- Confirm trigger function updated:
-- SELECT prosrc FROM pg_proc WHERE proname = 'initialize_user_credits';
-- Expected: contains "10" not "40"
