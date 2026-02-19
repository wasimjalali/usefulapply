-- =============================================================================
-- Fix: subscriptions table — update CHECK constraint to include 'starter'/'plus'
-- and add RLS policy for service_role writes.
--
-- Root cause: The subscriptions table was created with
--   tier IN ('free', 'pro', 'enterprise')
-- but the app uses 'starter' and 'plus' tiers. The webhook never wrote to
-- this table, so it was always empty. The frontend getSubscription() reads
-- from it and gets 406 errors.
-- =============================================================================

-- Step 1: Drop the old CHECK constraint on tier
ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_tier_check;

-- Step 2: Add updated CHECK constraint with all valid tiers
ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_tier_check
  CHECK (tier IN ('free', 'starter', 'plus', 'pro', 'enterprise'));

-- Step 3: Ensure RLS policy allows service_role to manage subscriptions
-- (The policy may already exist, so use IF NOT EXISTS pattern)
DO $$
BEGIN
  -- Drop and recreate to ensure it covers all operations
  DROP POLICY IF EXISTS "Service role can manage subscriptions" ON subscriptions;
  CREATE POLICY "Service role can manage subscriptions"
    ON subscriptions FOR ALL
    USING (true)
    WITH CHECK (true);
END $$;

-- Step 4: Ensure the unique index exists for upsert operations
-- Only one active subscription per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_user_active
  ON subscriptions(user_id) WHERE status = 'active';

-- Step 5: Verify
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'subscriptions'::regclass AND contype = 'c';
