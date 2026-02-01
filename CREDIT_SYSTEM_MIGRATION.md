# Credit System Migration Guide

## Overview

This document contains all the SQL and configuration changes needed to migrate from the legacy credit system to the new optimized credit system.

### New Credit Structure

| Action | Credits |
|--------|---------|
| Full Application (CV + Cover Letter + Email) | 2 credits |
| CV Optimization only | 1 credit |
| Cover Letter Regeneration | 1 credit |
| Email Regeneration | 1 credit |

### New Tier Allocations

| Tier | Monthly Credits | Applications/Month | Price |
|------|-----------------|-------------------|-------|
| Starter (Free) | 10 | 5 | Free |
| Plus | 160 | 80+ | $19.99/mo |
| Pro | 300 | 150+ | $39.99/mo |

### Add-on Credit Packs (Updated)

| Pack | Credits | Applications | Price | Per Credit |
|------|---------|--------------|-------|------------|
| Small | 50 | 25 | $4.99 | $0.10 |
| Medium | 120 | 60 | $9.99 | $0.08 |
| Large | 250 | 125 | $17.99 | $0.07 |

---

## Part 1: Supabase SQL Updates

Run these in **Supabase SQL Editor** in order.

### Step 1: Update subscription_plans table data

```sql
-- =====================================================
-- CREDIT SYSTEM MIGRATION - STEP 1
-- Update subscription plans with new credit allocations
-- =====================================================

-- First, update existing plans or insert if they don't exist
-- Delete old plans and insert fresh ones

DELETE FROM subscription_plans WHERE tier IN ('starter', 'plus', 'pro');

INSERT INTO subscription_plans (tier, name, monthly_credits, price_monthly, price_yearly, features, active)
VALUES 
  (
    'starter',
    'Starter',
    10,
    0,
    0,
    '{"applications": 5, "templates": "all", "web_search": true, "ai_refinement": true, "pdf_export": true, "addon_credits": false, "rollover": false, "support": "community", "history_days": 30}',
    true
  ),
  (
    'plus',
    'Plus',
    160,
    19.99,
    199.99,
    '{"applications": 80, "templates": "all", "web_search": true, "ai_refinement": true, "pdf_export": true, "addon_credits": true, "rollover": true, "rollover_months": 1, "max_rollover": 160, "support": "priority", "history_days": -1}',
    true
  ),
  (
    'pro',
    'Pro',
    300,
    39.99,
    399.99,
    '{"applications": 150, "templates": "all", "web_search": true, "ai_refinement": true, "pdf_export": true, "addon_credits": true, "rollover": true, "rollover_months": 2, "max_rollover": 600, "support": "premium", "history_days": -1}',
    true
  );
```

### Step 2: Update addon_credit_packs table data

```sql
-- =====================================================
-- CREDIT SYSTEM MIGRATION - STEP 2
-- Update add-on credit packs with new pricing
-- =====================================================

DELETE FROM addon_credit_packs;

INSERT INTO addon_credit_packs (name, credits, price, description, active)
VALUES 
  ('Small Pack', 50, 4.99, '25 additional applications', true),
  ('Medium Pack', 120, 9.99, '60 additional applications - Best Value', true),
  ('Large Pack', 250, 17.99, '125 additional applications - Most Popular', true);
```

### Step 3: Update initialize_user_credits function

```sql
-- =====================================================
-- CREDIT SYSTEM MIGRATION - STEP 3
-- Update the function that initializes credits for new users
-- =====================================================

CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 10, 'starter', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Step 4: Update existing users' credits (Optional - for existing users)

```sql
-- =====================================================
-- CREDIT SYSTEM MIGRATION - STEP 4 (OPTIONAL)
-- Update existing users to new credit amounts
-- Only run this if you want to migrate existing users
-- =====================================================

-- Update Starter users (free tier)
UPDATE user_credits 
SET monthly_credits = 10
WHERE plan_tier = 'starter';

-- Update Plus users
UPDATE user_credits 
SET monthly_credits = 160
WHERE plan_tier = 'plus';

-- Update Pro users
UPDATE user_credits 
SET monthly_credits = 300
WHERE plan_tier = 'pro';
```

---

## Part 2: Verification Queries

Run these to verify the migration was successful:

```sql
-- Check subscription plans
SELECT tier, name, monthly_credits, price_monthly, features->>'applications' as applications
FROM subscription_plans
WHERE active = true
ORDER BY price_monthly;

-- Check addon packs
SELECT name, credits, price, description
FROM addon_credit_packs
WHERE active = true
ORDER BY price;

-- Check user credits distribution
SELECT plan_tier, COUNT(*) as user_count, AVG(monthly_credits) as avg_credits
FROM user_credits
GROUP BY plan_tier;
```

---

## Part 3: Rollback (If Needed)

If you need to rollback to the old system:

```sql
-- Rollback subscription plans
DELETE FROM subscription_plans WHERE tier IN ('starter', 'plus', 'pro');

INSERT INTO subscription_plans (tier, name, monthly_credits, price_monthly, price_yearly, features, active)
VALUES 
  ('starter', 'Starter', 50, 0, 0, '{"applications": 5}', true),
  ('plus', 'Plus', 200, 19.99, 199.99, '{"applications": 20}', true),
  ('pro', 'Pro', 400, 39.99, 399.99, '{"applications": 40}', true);

-- Rollback addon packs
DELETE FROM addon_credit_packs;

INSERT INTO addon_credit_packs (name, credits, price, description, active)
VALUES 
  ('Small Pack', 100, 7.99, '~10 additional applications', true),
  ('Medium Pack', 250, 17.99, '~25 additional applications', true),
  ('Large Pack', 500, 29.99, '~50 additional applications', true);
```

---

## Summary

### What Changed:

| Item | Old Value | New Value |
|------|-----------|-----------|
| Credits per full app | 10 | 2 |
| Starter monthly credits | 50 | 10 |
| Plus monthly credits | 200 | 160 |
| Pro monthly credits | 400 | 300 |
| Starter applications | ~5 | 5 |
| Plus applications | ~20 | 80+ |
| Pro applications | ~40 | 150+ |

### Why This Works:

- **API Cost:** $0.03 per application
- **Plus tier cost:** 80 apps × $0.03 = $2.40 (88% margin on $19.99)
- **Pro tier cost:** 150 apps × $0.03 = $4.50 (89% margin on $39.99)

The new system provides 4x more value to users while maintaining healthy profit margins.
