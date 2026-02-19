-- =============================================================================
-- Fix: user_credits table — add missing columns that the webhook needs
--
-- Root cause: The user_credits table was created without stripe_customer_id,
-- stripe_subscription_id, and subscription_status columns. The webhook handler
-- tries to write to these columns on every event → Postgres error 42703
-- "column does not exist" → entire UPDATE fails → plan/credits never update.
-- =============================================================================

-- Step 1: Add the missing columns
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- Step 2: Add indexes for webhook lookups (webhook looks up user by stripe_customer_id)
CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_customer ON user_credits(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_stripe_subscription ON user_credits(stripe_subscription_id);

-- Step 3: Add RLS policy for service_role to manage user_credits
-- The webhook uses the service_role key, so it needs full access
DO $$
BEGIN
  DROP POLICY IF EXISTS "Service role can manage user_credits" ON user_credits;
  CREATE POLICY "Service role can manage user_credits"
    ON user_credits FOR ALL
    USING (true)
    WITH CHECK (true);
END $$;

-- Step 4: Verify the columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'user_credits'
ORDER BY ordinal_position;
