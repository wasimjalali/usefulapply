-- =============================================================================
-- Fix: profiles.subscription_tier CHECK constraint — add 'starter' and 'plus'
--
-- Root cause: profiles table has CHECK (subscription_tier IN ('free', 'pro', 'enterprise'))
-- but the app uses 'starter' and 'plus'. The webhook syncProfileTier() call
-- fails silently because Postgres rejects the value.
-- =============================================================================

-- Step 1: Drop the old CHECK constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_subscription_tier_check;

-- Step 2: Add updated CHECK constraint with all valid tiers
ALTER TABLE profiles ADD CONSTRAINT profiles_subscription_tier_check
  CHECK (subscription_tier IN ('free', 'starter', 'plus', 'pro', 'enterprise'));

-- Step 3: Update existing 'free' tier users to 'starter' for consistency
-- (The app uses 'starter' as the free tier name)
UPDATE profiles
SET subscription_tier = 'starter'
WHERE subscription_tier = 'free';

-- Step 4: Fix any users who have an active subscription in user_credits
-- but profiles still shows 'starter'/'free'
UPDATE profiles p
SET
  subscription_tier = uc.plan_tier,
  subscription_status = COALESCE(uc.subscription_status, 'active'),
  updated_at = NOW()
FROM user_credits uc
WHERE p.id = uc.user_id
  AND uc.plan_tier != 'starter'
  AND p.subscription_tier IN ('free', 'starter');

-- Step 5: Verify
SELECT id, email, subscription_tier, subscription_status
FROM profiles
WHERE subscription_tier NOT IN ('starter');
