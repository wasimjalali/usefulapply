-- =====================================================
-- Fit Analysis Feature - Credit System Update
-- Run this in your Supabase SQL editor
-- =====================================================

-- No schema changes needed for the credit system itself.
-- The user_credits table already supports decimal credit values.
-- The credit_transactions table already logs all transactions.
--
-- What changed in the code:
-- CREDIT_COSTS.FULL_APPLICATION: 2 → 1.5 (CV + Cover Letter + Email after fit analysis)
-- CREDIT_COSTS.FIT_ANALYSIS: NEW - 0.5 (pre-generation fit assessment)
-- CREDIT_COSTS.COVER_LETTER_REGEN: 1 → 0.5
-- CREDIT_COSTS.EMAIL_REGEN: 1 → 0.5
--
-- The transaction_type values logged will now include:
-- 'fit_analysis' - for fit analysis credit deductions
-- 'full_application' - for full generation credit deductions (unchanged)
-- 'cover_letter_regen' - for cover letter regeneration (unchanged, but 0.5 instead of 1)
-- 'email_regen' - for email regeneration (unchanged, but 0.5 instead of 1)

-- Verify your user_credits table supports decimal values:
-- If monthly_credits, rollover_credits, addon_credits are INTEGER, 
-- you need to change them to NUMERIC/DECIMAL to support 0.5 credits.

-- Check current column types:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'user_credits';

-- If they are INTEGER, run these ALTER statements:
ALTER TABLE user_credits ALTER COLUMN monthly_credits TYPE NUMERIC(10,2);
ALTER TABLE user_credits ALTER COLUMN rollover_credits TYPE NUMERIC(10,2);
ALTER TABLE user_credits ALTER COLUMN addon_credits TYPE NUMERIC(10,2);

-- Also update the credit_transactions amount column if it's INTEGER:
ALTER TABLE credit_transactions ALTER COLUMN amount TYPE NUMERIC(10,2);
ALTER TABLE credit_transactions ALTER COLUMN balance_before TYPE NUMERIC(10,2);
ALTER TABLE credit_transactions ALTER COLUMN balance_after TYPE NUMERIC(10,2);

-- =====================================================
-- OPTIONAL: Update subscription_plans credits_monthly if needed
-- (only if you want to adjust monthly credit allocations)
-- =====================================================
-- ALTER TABLE subscription_plans ALTER COLUMN credits_monthly TYPE NUMERIC(10,2);
