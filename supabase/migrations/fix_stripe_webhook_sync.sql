-- =============================================================================
-- Fix: Stripe webhook sync — repair users who subscribed but were not upgraded
-- Root cause: race condition where customer.subscription.created fired before
-- checkout.session.completed, causing the user lookup to fail silently.
-- The webhook code has been patched in the application. Run this migration to
-- manually repair any users whose plan was not upgraded despite a successful
-- Stripe checkout.
-- =============================================================================

-- Step 1: Diagnostic — see which users have a Stripe subscription ID but
-- are still on the starter plan (these are the broken rows).
SELECT
  user_id,
  plan_tier,
  monthly_credits,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status,
  updated_at
FROM user_credits
WHERE stripe_subscription_id IS NOT NULL
  AND plan_tier = 'starter';

-- =============================================================================
-- Step 2: Manual repair template.
-- Replace the placeholder values below with the actual Stripe customer ID
-- and subscription ID from the Stripe dashboard (image 1 in the bug report).
-- Run one UPDATE per affected user.
--
-- For PLUS plan (120 credits/month):
-- =============================================================================

-- UPDATE user_credits
-- SET
--   plan_tier            = 'plus',
--   monthly_credits      = 120,
--   subscription_status  = 'active',
--   updated_at           = NOW()
-- WHERE stripe_customer_id = 'cus_XXXXXXXXXXXXXXXXXX'  -- replace with real value
--   AND plan_tier = 'starter';

-- =============================================================================
-- For PRO plan (240 credits/month):
-- =============================================================================

-- UPDATE user_credits
-- SET
--   plan_tier            = 'pro',
--   monthly_credits      = 240,
--   subscription_status  = 'active',
--   updated_at           = NOW()
-- WHERE stripe_customer_id = 'cus_XXXXXXXXXXXXXXXXXX'  -- replace with real value
--   AND plan_tier = 'starter';

-- =============================================================================
-- Step 3: Verify the repair.
-- =============================================================================
SELECT
  user_id,
  plan_tier,
  monthly_credits,
  stripe_customer_id,
  stripe_subscription_id,
  subscription_status
FROM user_credits
WHERE stripe_subscription_id IS NOT NULL;

-- =============================================================================
-- IMPORTANT: After deploying the patched webhook code, also go to
-- Stripe Dashboard → Developers → Webhooks → select your endpoint →
-- "Send test webhook" or find the failed/missed events and click
-- "Resend" on the checkout.session.completed event for each affected
-- subscription. This will trigger the patched handler which will
-- correctly update plan_tier and monthly_credits.
-- =============================================================================
