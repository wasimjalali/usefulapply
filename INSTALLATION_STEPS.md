# Installation Steps for New Features

## 1. Install Stripe Package

```bash
npm install stripe @stripe/stripe-js
```

## 2. Environment Variables

Add to your `.env.local` file:

```bash
# Stripe Configuration
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
STRIPE_PRICE_ID_PLUS=price_your_plus_price_id
STRIPE_PRICE_ID_PRO=price_your_pro_price_id

# App URL (for Stripe redirects)
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 3. Stripe Setup

Follow the detailed instructions in `STRIPE_SETUP_GUIDE.md`:
1. Create Stripe account
2. Get API keys
3. Create products and prices
4. Setup webhook endpoint

## 4. Database Schema

The Stripe integration uses the existing `user_credits` table. Ensure these columns exist:
- `stripe_customer_id` (text, nullable)
- `stripe_subscription_id` (text, nullable)
- `subscription_status` (text, nullable)

## 5. Test the Integration

1. Start development server: `npm run dev`
2. Go to Settings → Subscription
3. Click "Upgrade Now"
4. Use test card: `4242 4242 4242 4242`
5. Complete checkout
6. Verify webhook receives events (check console logs)

## Files Created

### Phase 5: Component Splits
- `/src/components/chat/ChatMessage.tsx`
- `/src/components/chat/ChatInput.tsx`
- `/src/components/chat/ChatHistory.tsx`
- `/src/components/chat/FeedbackModal.tsx`
- `/src/components/settings/ProfileSection.tsx`
- `/src/components/settings/AccountSection.tsx`
- `/src/components/settings/SubscriptionSection.tsx`
- `/src/components/settings/NotificationsSection.tsx`

### Phase 6 & 7: UI Components & Utilities
- `/src/components/ui/Input.tsx`
- `/src/components/ui/Select.tsx`
- `/src/components/ui/Modal.tsx`
- `/src/components/ui/Toast.tsx`
- `/src/lib/config/typo-corrections.ts`
- `/src/lib/config/cover-letter-blacklist.ts`
- `/src/lib/utils/document-parser.ts`
- `/src/lib/utils/pdf-generator.ts`
- `/src/types/agent.ts`
- `/src/styles/cv-print.css`

### Phase 8: Stripe Integration
- `/src/lib/stripe.ts`
- `/src/app/api/stripe/webhook/route.ts`
- `/src/app/api/stripe/create-checkout/route.ts`
- `/src/app/api/stripe/create-portal/route.ts`

## Backup Files

Original files are backed up with `.backup` extension:
- `ChatPanel.tsx.backup`
- `settings/page.tsx.backup`

## Next Steps

1. Install Stripe package
2. Configure environment variables
3. Setup Stripe products and webhook
4. Test subscription flow
5. Deploy webhook endpoint to production
6. Update production environment variables

## Notes

- All TypeScript errors related to missing `stripe` package will resolve after installation
- Webhook endpoint must be publicly accessible for Stripe to send events
- Use Stripe test mode for development
- The integration is ready to use once environment variables are configured
