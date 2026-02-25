-- ============================================================
-- Pricing Pivot v2: Free → Plus → Max
-- Migration: Rename tiers, update credits, consolidate add-ons
-- ============================================================
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- IMPORTANT: Back up your database before running this migration.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Update profiles table CHECK constraint to include 'max'
-- ============================================================

-- Drop the existing CHECK constraint on subscription_tier
-- (The constraint name may vary; this handles the common pattern)
DO $$
BEGIN
  -- Try to drop by common constraint names
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS check_subscription_tier;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

-- Add updated CHECK constraint that includes 'max'
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'starter', 'plus', 'max', 'pro', 'enterprise'));

-- ============================================================
-- 2. Migrate existing users: starter → free, pro → max
-- ============================================================

-- Profiles table
UPDATE public.profiles
SET subscription_tier = 'free', updated_at = now()
WHERE subscription_tier = 'starter';

UPDATE public.profiles
SET subscription_tier = 'max', updated_at = now()
WHERE subscription_tier = 'pro';

-- User credits table
UPDATE public.user_credits
SET plan_tier = 'free', updated_at = now()
WHERE plan_tier = 'starter';

UPDATE public.user_credits
SET plan_tier = 'max', updated_at = now()
WHERE plan_tier = 'pro';

-- Subscriptions table (if it has a tier column)
UPDATE public.subscriptions
SET tier = 'free', updated_at = now()
WHERE tier = 'starter';

UPDATE public.subscriptions
SET tier = 'max', updated_at = now()
WHERE tier = 'pro';

-- ============================================================
-- 3. Update subscription_plans table with new pricing
-- ============================================================

-- Deactivate old plans
UPDATE public.subscription_plans
SET active = false, updated_at = now()
WHERE tier IN ('starter', 'pro');

-- Upsert Free plan (was Starter)
INSERT INTO public.subscription_plans (tier, name, description, price_monthly, credits_monthly, rollover_months, max_rollover_credits, addon_enabled, active, display_order)
VALUES ('free', 'Free', 'Try the full AI agent', 0, 10, 0, 0, false, true, 1)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  credits_monthly = EXCLUDED.credits_monthly,
  rollover_months = EXCLUDED.rollover_months,
  max_rollover_credits = EXCLUDED.max_rollover_credits,
  addon_enabled = EXCLUDED.addon_enabled,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- Update Plus plan with new pricing
UPDATE public.subscription_plans
SET
  name = 'Plus',
  description = 'For serious job seekers',
  price_monthly = 39.99,
  credits_monthly = 100,
  rollover_months = 0,
  max_rollover_credits = 0,
  addon_enabled = true,
  active = true,
  display_order = 2,
  updated_at = now()
WHERE tier = 'plus';

-- Upsert Max plan (was Pro)
INSERT INTO public.subscription_plans (tier, name, description, price_monthly, credits_monthly, rollover_months, max_rollover_credits, addon_enabled, active, display_order)
VALUES ('max', 'Max', 'Full automation for power applicants', 79.99, 200, 0, 0, true, true, 3)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  credits_monthly = EXCLUDED.credits_monthly,
  rollover_months = EXCLUDED.rollover_months,
  max_rollover_credits = EXCLUDED.max_rollover_credits,
  addon_enabled = EXCLUDED.addon_enabled,
  active = EXCLUDED.active,
  display_order = EXCLUDED.display_order,
  updated_at = now();

-- ============================================================
-- 4. Consolidate add-on credit packs
-- ============================================================

-- Deactivate old add-on packs
UPDATE public.addon_credit_packs
SET active = false, updated_at = now()
WHERE active = true;

-- Insert new single Credit Pack ($19.99 for 40 credits / 20 applications)
INSERT INTO public.addon_credit_packs (name, credits, price, discount_percent, active, display_order)
VALUES ('Credit Pack', 40, 19.99, 0, true, 1)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. Update the initialize_user_credits trigger function
--    to use 'free' instead of 'starter'
-- ============================================================

CREATE OR REPLACE FUNCTION public.initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, next_reset_date)
  VALUES (
    NEW.id,
    10,
    0,
    0,
    'free',
    (now() + interval '1 month')
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Update monthly credit reset function if it exists
-- ============================================================

-- Update the monthly reset to use new credit amounts
CREATE OR REPLACE FUNCTION public.reset_monthly_credits()
RETURNS void AS $$
BEGIN
  -- Reset monthly credits based on plan tier
  UPDATE public.user_credits
  SET
    -- Move unused monthly to rollover (capped by plan limits)
    rollover_credits = LEAST(
      rollover_credits + monthly_credits,
      CASE plan_tier
        WHEN 'free' THEN 0
        WHEN 'starter' THEN 0
        WHEN 'plus' THEN 0
        WHEN 'max' THEN 0
        WHEN 'pro' THEN 0
        ELSE 0
      END
    ),
    -- Reset monthly credits to plan amount
    monthly_credits = CASE plan_tier
      WHEN 'free' THEN 10
      WHEN 'starter' THEN 10
      WHEN 'plus' THEN 100
      WHEN 'max' THEN 200
      WHEN 'pro' THEN 200
      ELSE 10
    END,
    last_reset_date = now(),
    next_reset_date = now() + interval '1 month',
    updated_at = now()
  WHERE subscription_status = 'active' OR plan_tier IN ('free', 'starter');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;

-- ============================================================
-- VERIFICATION QUERIES (run these after migration)
-- ============================================================
-- Check subscription_plans:
-- SELECT tier, name, price_monthly, credits_monthly, active FROM subscription_plans ORDER BY display_order;
--
-- Check no users on old tiers:
-- SELECT plan_tier, COUNT(*) FROM user_credits GROUP BY plan_tier;
-- SELECT subscription_tier, COUNT(*) FROM profiles GROUP BY subscription_tier;
--
-- Check add-on packs:
-- SELECT name, credits, price, active FROM addon_credit_packs ORDER BY display_order;
