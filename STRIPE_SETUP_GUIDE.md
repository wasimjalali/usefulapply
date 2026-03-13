# Stripe Integration Setup Guide

## Required Environment Variables

Add these to your `.env.local` file:

```bash
# Stripe API Keys (get from https://dashboard.stripe.com/apikeys)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...

# Stripe Webhook Secret (get from https://dashboard.stripe.com/webhooks)
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price IDs (create products in Stripe Dashboard)
STRIPE_PRICE_ID_PLUS=price_...        # Plus plan ($29.99/month)
STRIPE_PRICE_ID_PRO=price_...         # Pro plan ($49.99/month)

# Add-on Credit Packs (one-time purchases)
STRIPE_PRICE_ID_ADDON_SMALL=price_...  # Small Pack (30 credits, $7.49)
STRIPE_PRICE_ID_ADDON_MEDIUM=price_... # Medium Pack (60 credits, $14.99)
STRIPE_PRICE_ID_ADDON_LARGE=price_...  # Large Pack (120 credits, $29.99)
```

## Setup Steps

### 1. Create Stripe Account
1. Go to https://stripe.com
2. Sign up for an account
3. Use test mode for development

### 2. Get API Keys
1. Go to https://dashboard.stripe.com/apikeys
2. Copy "Publishable key" → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
3. Copy "Secret key" → `STRIPE_SECRET_KEY`

### 3. Create Products
1. Go to https://dashboard.stripe.com/products

#### Subscription Products
2. Create "Karko AI Plus" product:
   - Name: Karko AI Plus
   - Price: $29.99/month recurring
   - Copy Price ID → `STRIPE_PRICE_ID_PLUS`
3. Create "Karko AI Pro" product:
   - Name: Karko AI Pro
   - Price: $49.99/month recurring
   - Copy Price ID → `STRIPE_PRICE_ID_PRO`

#### Add-on Credit Packs (One-time)
4. Create "Small Credit Pack" product:
   - Name: Small Credit Pack
   - Price: $7.49 (one-time)
   - Copy Price ID → `STRIPE_PRICE_ID_ADDON_SMALL`
5. Create "Medium Credit Pack" product:
   - Name: Medium Credit Pack
   - Price: $14.99 (one-time)
   - Copy Price ID → `STRIPE_PRICE_ID_ADDON_MEDIUM`
6. Create "Large Credit Pack" product:
   - Name: Large Credit Pack
   - Price: $29.99 (one-time)
   - Copy Price ID → `STRIPE_PRICE_ID_ADDON_LARGE`

### 4. Setup Webhook
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://your-domain.com/api/stripe/webhook`
4. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy "Signing secret" → `STRIPE_WEBHOOK_SECRET`

## Testing

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires authentication: `4000 0025 0000 3155`

Use any future expiry date and any CVC.

## Files Created

1. `/api/stripe/webhook/route.ts` - Webhook handler (handles both subscriptions and add-on purchases)
2. `/api/stripe/create-checkout/route.ts` - Subscription checkout session
3. `/api/stripe/create-addon-checkout/route.ts` - Add-on credit pack checkout session
4. `/api/stripe/create-portal/route.ts` - Customer portal for billing management
5. `/lib/stripe.ts` - Stripe client configuration (includes price mappings)

## Features Implemented

### Subscription Flow
- Users can subscribe to Plus ($29.99) or Pro ($49.99) plans
- Stripe Checkout creates recurring subscription
- Webhook updates user's `plan_tier` and subscription status in Supabase
- Monthly invoice payments reset credits automatically

### Add-on Credit Packs
- Available only for Plus/Pro subscribers
- Three pack sizes: Small (30 credits, $7.49), Medium (60 credits, $14.99), Large (120 credits, $29.99)
- One-time payment via Stripe Checkout
- Webhook adds credits to user's `addon_credits` balance
- Full transaction logging in `credit_transactions` table

### Frontend Integration
- Pricing page: Subscribe buttons trigger Stripe checkout for logged-in users
- Settings page: Manage billing, upgrade plans, buy add-on credits
- Credit indicators: Link to purchase add-ons
- All buttons show loading states and handle errors gracefully

## Database Schema

The subscription data is stored in Supabase `user_credits` table:
- `plan_tier`: 'starter' | 'plus' | 'pro'
- `stripe_customer_id`: Stripe customer ID
- `stripe_subscription_id`: Stripe subscription ID
- `subscription_status`: 'active' | 'canceled' | 'past_due'

## Security Notes

- Never commit `.env.local` to git
- Use test keys for development
- Use production keys only in production
- Verify webhook signatures
- Use HTTPS in production
