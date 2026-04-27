-- Migration: reduce free plan credits from 10 to 4
-- Date: 2026-04-27
-- Purpose: Align free tier credit allocation with revised plan limits (4 credits = 2 complete applications)
-- Rollback: re-run this file with monthly_credits = 4 replaced by 10 in both the function and the UPDATE

-- 1. Update the trigger function so new free-plan signups start with 4 credits
CREATE OR REPLACE FUNCTION public.initialize_user_credits()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 4, 'free', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE LOG '[initialize_user_credits] Skipped for user %: % (%)',
      NEW.id, SQLERRM, SQLSTATE;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.initialize_user_credits() IS
  'Seeds user_credits on new signup. Free tier gets 4 monthly credits (reduced from 10 on 2026-04-27).';

-- 2. Backfill existing free-plan users still at the original 10-credit default.
-- The monthly_credits = 10 guard avoids capping users who received manual top-ups.
UPDATE public.user_credits
SET monthly_credits = 4
WHERE plan_tier = 'free'
  AND monthly_credits = 10;
