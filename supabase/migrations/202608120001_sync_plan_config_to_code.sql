-- Migration: sync subscription_plans and addon_credit_packs with the code
-- Date: 2026-08-12
-- Purpose: The plan config rows were seeded 2026-02-25 and never updated after the
--   April repricing. They disagree with the source of truth in src/lib/stripe.ts
--   (PLANS) and src/lib/stripe.ts (ADDON_CREDIT_MAP):
--     free  credits_monthly      10    -> 4
--     plus  price_monthly        39.99 -> 19.99
--     plus  credits_monthly      100   -> 50
--     pack  credits              40    -> 50
--   Rollover caps were 0 on every tier while the live Stripe renewal path in
--   src/app/api/stripe/webhook/route.ts uses plus 50 / max 100. Aligned here.
--
--   No live code path reads these tables today (credits.server.ts is the only
--   consumer and is imported nowhere), so this corrects latent config rather
--   than an active mischarge.
--
-- Rollback: re-run with the previous values listed above.

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
    rollover_months = 1,
    max_rollover_credits = 50,
    addon_enabled = true,
    updated_at = now()
where tier = 'plus';

update public.subscription_plans
set credits_monthly = 200,
    price_monthly = 79.99,
    rollover_months = 1,
    max_rollover_credits = 100,
    addon_enabled = true,
    updated_at = now()
where tier = 'max';

update public.addon_credit_packs
set credits = 50,
    price = 19.99
where name = 'Credit Pack';
