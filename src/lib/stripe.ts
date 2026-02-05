/**
 * Stripe Client Configuration
 * Handles Stripe initialization and common operations
 */

import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set in environment variables');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }
  return _stripe;
}

/** @deprecated Use getStripe() instead */
export const stripe = typeof process !== 'undefined' && process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-01-28.clover', typescript: true })
  : (null as unknown as Stripe);

/**
 * Price IDs for subscription plans
 * Set these in your .env.local file
 */
export const STRIPE_PRICES = {
  PLUS: process.env.STRIPE_PRICE_ID_PLUS || '',
  PRO: process.env.STRIPE_PRICE_ID_PRO || '',
} as const;

/**
 * Plan configurations
 */
export const PLANS = {
  starter: {
    name: 'Starter',
    price: 0,
    credits: 10,
    features: ['3 applications/month', 'All CV templates', 'CV + Cover Letter + Email'],
  },
  plus: {
    name: 'Plus',
    price: 19.99,
    priceId: STRIPE_PRICES.PLUS,
    credits: 160,
    features: ['60 applications/month', 'Add-on credits', '1 month rollover', 'Priority support'],
  },
  pro: {
    name: 'Pro',
    price: 39.99,
    priceId: STRIPE_PRICES.PRO,
    credits: 300,
    features: ['120 applications/month', 'Add-on credits', '2 months rollover', 'Premium support'],
  },
} as const;

export type PlanTier = keyof typeof PLANS;
