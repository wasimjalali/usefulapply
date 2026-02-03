# User Tasks - Supabase & Backend Changes

**Generated:** 2026-02-03  
**Purpose:** Tasks that require user action in Supabase dashboard or backend configuration

---

## Task 6: Pricing & Credit System - Supabase Migration

### SQL Migration Script

Run this SQL in your Supabase SQL Editor to update the credit/application allocations:

```sql
-- =====================================================
-- KARKO AI - Credit System Migration
-- New Pricing Structure (February 2026)
-- =====================================================

-- Update subscription plans with new credit allocations
-- Old → New:
-- Starter: 50 credits → 6 credits
-- Plus: 200 credits → 120 credits  
-- Pro: 400 credits → 240 credits

-- Update Starter plan
UPDATE subscription_plans 
SET 
  credits_monthly = 6,
  updated_at = NOW()
WHERE tier = 'starter';

-- Update Plus plan
UPDATE subscription_plans 
SET 
  credits_monthly = 120,
  rollover_months = 1,
  max_rollover_credits = 120,
  updated_at = NOW()
WHERE tier = 'plus';

-- Update Pro plan
UPDATE subscription_plans 
SET 
  credits_monthly = 240,
  rollover_months = 2,
  max_rollover_credits = 480,
  updated_at = NOW()
WHERE tier = 'pro';

-- =====================================================
-- ADD-ON CREDIT PACKAGES
-- =====================================================

-- Update existing addon_credit_packs table
-- The table already exists, just update the values

-- Update add-on packs
-- Small Pack: 30 credits / $4.99
UPDATE addon_credit_packs 
SET 
  credits = 30,
  price = 4.99,
  updated_at = NOW()
WHERE name = 'Small Pack';

-- Medium Pack: 60 credits / $9.99
UPDATE addon_credit_packs 
SET 
  credits = 60,
  price = 9.99,
  discount_percent = 0,
  updated_at = NOW()
WHERE name = 'Medium Pack';

-- Large Pack: 120 credits / $19.99
UPDATE addon_credit_packs 
SET 
  credits = 120,
  price = 19.99,
  discount_percent = 0,
  updated_at = NOW()
WHERE name = 'Large Pack';

-- If packs don't exist, insert them
INSERT INTO addon_credit_packs (name, credits, price, discount_percent, display_order)
VALUES 
  ('Small Pack', 30, 4.99, 0, 1),
  ('Medium Pack', 60, 9.99, 0, 2),
  ('Large Pack', 120, 19.99, 0, 3)
ON CONFLICT DO NOTHING;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Verify subscription plans
SELECT tier, name, credits_monthly, rollover_months, max_rollover_credits 
FROM subscription_plans 
WHERE active = true
ORDER BY display_order;

-- Verify add-on packs
SELECT name, credits, price, discount_percent 
FROM addon_credit_packs 
WHERE active = true
ORDER BY display_order;

-- Verify user credits initialization
-- Check the trigger function
SELECT proname, prosrc 
FROM pg_proc 
WHERE proname = 'initialize_user_credits';

-- Update the trigger to give new users 6 credits instead of 50
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 6, 'starter', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Manual Steps Required

1. **Run the SQL migration** in Supabase SQL Editor
2. **Update Stripe products** if using Stripe for payments:
   - Update product descriptions to reflect new credit amounts
   - Create new price IDs for add-on packages if not already created
3. **Verify the migration** by running the verification queries at the bottom of the script
4. **Check existing users**: The migration only changes plan definitions, not existing user credit balances

---

## Task 6: Stripe Configuration (if applicable)

If you're using Stripe for payments, update the following:

### Stripe Products to Update

| Product | Old Description | New Description |
|---------|-----------------|-----------------|
| Starter | 50 credits | 6 credits |
| Plus | 200 credits | 120 credits |
| Pro | 400 credits | 240 credits |

### New Stripe Products to Create (Add-on Packages)

| Product Name | Price | Description |
|--------------|-------|-------------|
| Small Pack | $4.99 | 30 credits |
| Medium Pack | $9.99 | 60 credits |
| Large Pack | $19.99 | 120 credits |

After creating these in Stripe, update the `stripe_price_id` column in the `addon_credit_packs` table.

---

## Task 4: German Language Support - Photo Storage (Optional)

If you want to enable photo uploads for German CVs:

```sql
-- Note: The profile-photos bucket already exists in the schema
-- No need to create it again. It's configured for EU CV photos.
-- The table `profile_photos` already exists and is linked to this bucket.
```

---

## Verification Checklist

After completing the tasks, verify:
- [ ] Starter plan shows 6 credits monthly
- [ ] Plus plan shows 120 credits monthly with 1 month rollover
- [ ] Pro plan shows 240 credits monthly with 2 months rollover
- [ ] Add-on credit packs show correct prices (30/$4.99, 60/$9.99, 120/$19.99)
- [ ] New user signups receive 6 credits (check `initialize_user_credits` function)
- [ ] Existing users retain their current credits (no reset needed)
- [ ] Pricing page displays correct credit amounts

---

## Notes

- **Existing users**: Their current credit balance in `user_credits` table should NOT be affected by this migration
- **New users**: Will receive 6 credits upon signup (updated in `initialize_user_credits` function)
- **Billing cycle**: Credit allocations in `subscription_plans` apply to the next reset date for existing users
- **Rollback**: Keep a backup of current values before running migration
- **Table names**: The actual tables are `subscription_plans` and `addon_credit_packs` (not `subscription_tiers` or `credit_packages`)

---

## Contact

If you encounter any issues with these migrations, check:
1. Supabase dashboard → Database → Tables
2. Supabase dashboard → SQL Editor → Run verification queries
3. Application console logs for credit-related errors
