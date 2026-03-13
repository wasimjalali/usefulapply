-- =====================================================
-- PRICING REDESIGN v5.2 — Supabase Migration
-- Date: February 7, 2026
-- Purpose: Update free tier to 40 credits (20 apps),
--          update plan pricing, update addon packs
-- =====================================================

-- =====================================================
-- 1. UPDATE subscription_plans TABLE
--    Starter: 50 → 40 credits, prices updated
-- =====================================================

UPDATE subscription_plans SET
  description = 'See your first AI application',
  price_monthly = 0.00,
  credits_monthly = 40,
  rollover_months = 0,
  max_rollover_credits = 0,
  addon_enabled = FALSE,
  updated_at = NOW()
WHERE tier = 'starter';

UPDATE subscription_plans SET
  description = 'For serious job seekers',
  price_monthly = 29.99,
  credits_monthly = 120,
  rollover_months = 1,
  max_rollover_credits = 120,
  addon_enabled = TRUE,
  updated_at = NOW()
WHERE tier = 'plus';

UPDATE subscription_plans SET
  description = 'For high-volume applicants',
  price_monthly = 49.99,
  credits_monthly = 240,
  rollover_months = 2,
  max_rollover_credits = 480,
  addon_enabled = TRUE,
  updated_at = NOW()
WHERE tier = 'pro';

-- If plans don't exist yet, insert them
INSERT INTO subscription_plans (tier, name, description, price_monthly, credits_monthly, rollover_months, max_rollover_credits, addon_enabled, display_order)
VALUES
  ('starter', 'Starter', 'See your first AI application', 0.00, 40, 0, 0, FALSE, 1),
  ('plus', 'Plus', 'For serious job seekers', 29.99, 120, 1, 120, TRUE, 2),
  ('pro', 'Pro', 'For high-volume applicants', 49.99, 240, 2, 480, TRUE, 3)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  credits_monthly = EXCLUDED.credits_monthly,
  rollover_months = EXCLUDED.rollover_months,
  max_rollover_credits = EXCLUDED.max_rollover_credits,
  addon_enabled = EXCLUDED.addon_enabled,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- =====================================================
-- 2. UPDATE existing starter users' monthly credits
--    Only update users who still have the old default
--    (users who haven't used any credits yet)
-- =====================================================

UPDATE user_credits SET
  monthly_credits = 40,
  updated_at = NOW()
WHERE plan_tier = 'starter'
  AND monthly_credits IN (6, 10, 50);
-- Covers all previous default values (6, 10, 50)

-- =====================================================
-- 3. UPDATE initialize_user_credits() function
--    New users get 40 credits instead of old value
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 40, 'starter', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. UPDATE addon_credit_packs with volume discounts
-- =====================================================

-- Clear old packs and insert new ones
-- Only 2 packs: both above free tier's 40 credits
DELETE FROM addon_credit_packs;

INSERT INTO addon_credit_packs (name, credits, price, discount_percent, display_order) VALUES
  ('Medium Pack', 60, 14.99, 0, 1),
  ('Large Pack', 120, 29.99, 0, 2);

-- =====================================================
-- VERIFICATION QUERIES (run these to confirm)
-- =====================================================

-- SELECT * FROM subscription_plans ORDER BY display_order;
-- SELECT tier, credits_monthly, price_monthly, rollover_months, max_rollover_credits FROM subscription_plans;
-- SELECT plan_tier, monthly_credits FROM user_credits WHERE plan_tier = 'starter' LIMIT 10;
-- SELECT * FROM addon_credit_packs ORDER BY display_order;
