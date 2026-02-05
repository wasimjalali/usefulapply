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
STRIPE_PRICE_ID_PLUS=price_...  # Plus plan ($19.99/month)
STRIPE_PRICE_ID_PRO=price_...   # Pro plan ($39.99/month)
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
2. Create "Karko AI Plus" product:
   - Name: Karko AI Plus
   - Price: $19.99/month recurring
   - Copy Price ID → `STRIPE_PRICE_ID_PLUS`
3. Create "Karko AI Pro" product:
   - Name: Karko AI Pro
   - Price: $39.99/month recurring
   - Copy Price ID → `STRIPE_PRICE_ID_PRO`

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

1. `/api/stripe/webhook/route.ts` - Webhook handler
2. `/api/stripe/create-checkout/route.ts` - Checkout session
3. `/api/stripe/create-portal/route.ts` - Customer portal
4. `/lib/stripe.ts` - Stripe client configuration

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
