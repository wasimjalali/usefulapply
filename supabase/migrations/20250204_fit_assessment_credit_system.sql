-- =====================================================
-- SQL MIGRATION: Fit Assessment & Split Credit System
-- Run this in Supabase SQL Editor
-- =====================================================

-- =====================================================
-- PART 1: Modify user_credits table for decimal support
-- =====================================================

-- Change credit columns from INTEGER to NUMERIC to support 0.5 increments
ALTER TABLE user_credits 
ALTER COLUMN monthly_credits TYPE NUMERIC(10,2),
ALTER COLUMN rollover_credits TYPE NUMERIC(10,2),
ALTER COLUMN addon_credits TYPE NUMERIC(10,2);

-- =====================================================
-- PART 2: Modify credit_transactions table
-- =====================================================

-- Change amount columns to support decimals
ALTER TABLE credit_transactions 
ALTER COLUMN amount TYPE NUMERIC(10,2),
ALTER COLUMN balance_before TYPE NUMERIC(10,2),
ALTER COLUMN balance_after TYPE NUMERIC(10,2);

-- Drop and recreate the transaction_type check constraint with new types
ALTER TABLE credit_transactions 
DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;

ALTER TABLE credit_transactions 
ADD CONSTRAINT credit_transactions_transaction_type_check 
CHECK (transaction_type IN (
    'fit_analysis',          -- NEW: 0.5 credit fit assessment
    'full_generation',       -- NEW: 1.5 credit full application generation
    'application_generation', -- DEPRECATED: kept for backwards compatibility
    'cover_letter_regen',
    'email_regen',
    'monthly_reset',
    'rollover_applied',
    'addon_purchase',
    'plan_upgrade',
    'plan_downgrade',
    'admin_adjustment',
    'refund',
    'expired'
));

-- Add new column to store context/strategy for fit analysis
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS fit_assessment JSONB DEFAULT NULL;
-- Structure: { 
--   chat_message: string,      -- The analysis shown to user
--   writer_strategy: string,   -- Hidden strategy for writer agent
--   fit_score: string,         -- 'strong' | 'good' | 'weak'
--   analyzed_at: string        -- ISO timestamp
-- }

-- Add column to track if full generation was done
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS generation_completed BOOLEAN DEFAULT FALSE;

-- =====================================================
-- PART 3: Create RPC function for decimal credit deduction
-- =====================================================

CREATE OR REPLACE FUNCTION deduct_user_credits(
    p_user_id UUID,
    p_amount NUMERIC(10,2),
    p_transaction_type TEXT,
    p_session_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    remaining_credits NUMERIC(10,2),
    error_message TEXT
) AS $$
DECLARE
    v_credits RECORD;
    v_remaining NUMERIC(10,2);
    v_new_monthly NUMERIC(10,2);
    v_new_rollover NUMERIC(10,2);
    v_new_addon NUMERIC(10,2);
    v_total_before NUMERIC(10,2);
BEGIN
    -- Get current credits with lock
    SELECT 
        monthly_credits,
        rollover_credits,
        addon_credits
    INTO v_credits
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(10,2), 'User credits not found'::TEXT;
        RETURN;
    END IF;
    
    v_total_before := v_credits.monthly_credits + v_credits.rollover_credits + v_credits.addon_credits;
    
    -- Check sufficient balance
    IF v_total_before < p_amount THEN
        RETURN QUERY SELECT FALSE, v_total_before, ('Insufficient credits. Required: ' || p_amount || ', Available: ' || v_total_before)::TEXT;
        RETURN;
    END IF;
    
    -- Deduct in order: monthly → rollover → addon
    v_remaining := p_amount;
    v_new_monthly := v_credits.monthly_credits;
    v_new_rollover := v_credits.rollover_credits;
    v_new_addon := v_credits.addon_credits;
    
    -- Deduct from monthly first
    IF v_remaining > 0 AND v_new_monthly > 0 THEN
        IF v_new_monthly >= v_remaining THEN
            v_new_monthly := v_new_monthly - v_remaining;
            v_remaining := 0;
        ELSE
            v_remaining := v_remaining - v_new_monthly;
            v_new_monthly := 0;
        END IF;
    END IF;
    
    -- Then from rollover
    IF v_remaining > 0 AND v_new_rollover > 0 THEN
        IF v_new_rollover >= v_remaining THEN
            v_new_rollover := v_new_rollover - v_remaining;
            v_remaining := 0;
        ELSE
            v_remaining := v_remaining - v_new_rollover;
            v_new_rollover := 0;
        END IF;
    END IF;
    
    -- Finally from addon
    IF v_remaining > 0 AND v_new_addon > 0 THEN
        IF v_new_addon >= v_remaining THEN
            v_new_addon := v_new_addon - v_remaining;
            v_remaining := 0;
        ELSE
            v_remaining := v_remaining - v_new_addon;
            v_new_addon := 0;
        END IF;
    END IF;
    
    -- Update credits
    UPDATE user_credits
    SET 
        monthly_credits = v_new_monthly,
        rollover_credits = v_new_rollover,
        addon_credits = v_new_addon,
        updated_at = NOW()
    WHERE user_id = p_user_id;
    
    -- Log transaction
    INSERT INTO credit_transactions (
        user_id, 
        amount, 
        transaction_type, 
        session_id, 
        description,
        balance_before, 
        balance_after
    ) VALUES (
        p_user_id, 
        -p_amount, 
        p_transaction_type, 
        p_session_id, 
        p_description,
        v_total_before, 
        v_total_before - p_amount
    );
    
    RETURN QUERY SELECT TRUE, (v_total_before - p_amount)::NUMERIC(10,2), NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 4: Create function to check credit balance
-- =====================================================

CREATE OR REPLACE FUNCTION check_credit_balance(
    p_user_id UUID,
    p_amount NUMERIC(10,2)
)
RETURNS TABLE (
    has_enough BOOLEAN,
    available NUMERIC(10,2),
    required NUMERIC(10,2)
) AS $$
DECLARE
    v_credits RECORD;
    v_total NUMERIC(10,2);
BEGIN
    SELECT 
        monthly_credits,
        rollover_credits,
        addon_credits
    INTO v_credits
    FROM user_credits
    WHERE user_id = p_user_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, 0::NUMERIC(10,2), p_amount;
        RETURN;
    END IF;
    
    v_total := v_credits.monthly_credits + v_credits.rollover_credits + v_credits.addon_credits;
    
    RETURN QUERY SELECT (v_total >= p_amount), v_total, p_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- PART 5: Update existing function to use numeric types
-- =====================================================

-- Drop the old integer-based function
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER, TEXT, UUID, TEXT);

-- =====================================================
-- VERIFICATION: Check the changes
-- =====================================================

-- Verify column types
SELECT 
    column_name, 
    data_type, 
    numeric_precision,
    numeric_scale
FROM information_schema.columns
WHERE table_name IN ('user_credits', 'credit_transactions')
AND column_name IN ('monthly_credits', 'rollover_credits', 'addon_credits', 'amount', 'balance_before', 'balance_after')
ORDER BY table_name, column_name;
