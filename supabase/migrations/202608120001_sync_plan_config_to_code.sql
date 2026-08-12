-- Migration: sync subscription_plans and addon_credit_packs with the code
-- Date: 2026-08-12
-- Purpose: The plan config rows were seeded 2026-02-25 and never updated after the
--   April repricing. They disagreed with the source of truth in src/lib/stripe.ts
--   (PLANS and ADDON_CREDIT_MAP):
--     free  credits_monthly      10    -> 4
--     plus  price_monthly        39.99 -> 19.99
--     plus  credits_monthly      100   -> 50
--     pack  credits              40    -> 50
--   Rollover caps were 0 on every tier while the live Stripe renewal path in
--   src/app/api/stripe/webhook/route.ts uses plus 50 / max 100. Aligned here.
--
--   rollover_months stays 0 on every tier: no code reads that column, and the
--   renewal path caps rollover without ever expiring it, so a non-zero value
--   would describe an expiry window that nothing enforces.
--
--   No live code path reads these tables today. Both src/lib/supabase/credits.ts
--   (getSubscriptionPlans, getSubscriptionPlan, getAddonCreditPacks) and
--   src/lib/supabase/credits.server.ts (upgradePlan, processMonthlyReset,
--   processAddonPurchase) query them, and all six are re-exported, but none has
--   a call site. The webhook hardcodes 4/50/200 and reads addon credits from
--   ADDON_CREDIT_MAP. So this corrects latent config rather than an active
--   mischarge.
--
-- Rollback: re-run with the previous values listed above.

begin;

update public.subscription_plans
set credits_monthly = 4,
    price_monthly = 0,
    rollover_months = 0,
    max_rollover_credits = 0,
    addon_enabled = false,
    updated_at = now()
where tier = 'free';

update public.subscription_plans
set credits_monthly = 50,
    price_monthly = 19.99,
    rollover_months = 0,
    max_rollover_credits = 50,
    addon_enabled = true,
    updated_at = now()
where tier = 'plus';

update public.subscription_plans
set credits_monthly = 200,
    price_monthly = 79.99,
    rollover_months = 0,
    max_rollover_credits = 100,
    addon_enabled = true,
    updated_at = now()
where tier = 'max';

-- Match on name because stripe_price_id is null on this row (price IDs live in
-- env, not the DB). Assert the row count so a renamed row or a duplicate from
-- the three historical pricing_pivot_v2 variants fails loud instead of
-- silently leaving the pack at 40 credits.
do $$
declare
  affected integer;
begin
  update public.addon_credit_packs
  set credits = 50,
      price = 19.99
  where name = 'Credit Pack'
    and active;

  get diagnostics affected = row_count;

  if affected <> 1 then
    raise exception
      'Expected exactly 1 active "Credit Pack" row, updated %. Aborting.', affected;
  end if;
end $$;

commit;
