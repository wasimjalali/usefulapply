---
description: Stripe webhook and credit deduction rules
globs: ["src/app/api/stripe/**", "src/lib/supabase/credits.ts"]
---

# Stripe & Credits Rules

## Critical: User Identity
- `userId` always comes from the authenticated session (`supabase.auth.getUser()`)
- **Never** read `userId` from the request body — this is an IDOR vulnerability
- All 3 Stripe routes (`create-checkout`, `create-addon-checkout`, `create-portal`) require auth

## Credit Costs (source of truth: `src/lib/supabase/credits.ts` `CREDIT_COSTS`)
Do not hardcode credit amounts anywhere — always reference the constant. Current values:
- `FIT_ANALYSIS`: 0.5
- `FULL_APPLICATION`: 2.0
- `COVER_LETTER_REGEN`: 0.5
- `EMAIL_REGEN`: 0.5
- `FOLLOW_UP_REGEN`: 0.5

## Credit Deduction — Optimistic Concurrency
`deductCredits()` uses a conditional UPDATE to prevent race conditions (TOCTOU):
- Read current credit balance
- UPDATE with `.eq()` checks on the original values
- If 0 rows updated (concurrent modification detected) → retry once with fresh data
- This prevents negative credit balances from concurrent requests

## Webhook Event Order
Stripe fires `customer.subscription.created` BEFORE `checkout.session.completed`.
- `handleSubscriptionUpdate` may not find the user by `stripe_customer_id` yet (race condition)
- Fallback: use `subscription.metadata.userId` when customer ID lookup fails
- `handleCheckoutCompleted` is the authoritative writer for `plan_tier` and `monthly_credits`

## Subscription Tiers & Credits
| Tier | Monthly Credits | Stripe Price Env Var |
|------|----------------|----------------------|
| free | 10 | — |
| plus | 100 | `STRIPE_PRICE_ID_PLUS` |
| max | 200 | `STRIPE_PRICE_ID_MAX` |
| Add-on pack | +40 | `STRIPE_PRICE_ID_ADDON_PACK` |

## Promo Codes
Both checkout routes have `allow_promotion_codes: true` — do not remove this.

## Refund Handler
`charge.refunded` webhook handles both subscription refunds (proportional monthly/rollover credit removal) and add-on refunds. Full + partial refunds supported. All logged to `credit_transactions`.
