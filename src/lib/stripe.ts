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
  MAX: process.env.STRIPE_PRICE_ID_MAX || '',
} as const;

/**
 * Price IDs for add-on credit packs
 * Set these in your .env.local file
 */
export const STRIPE_ADDON_PRICES = {
  CREDIT_PACK: process.env.STRIPE_PRICE_ID_ADDON_CREDIT_PACK || process.env.STRIPE_PRICE_ID_ADDON_PACK || '',
  /** @deprecated Use CREDIT_PACK instead */
  MEDIUM: process.env.STRIPE_PRICE_ID_ADDON_MEDIUM || '',
  /** @deprecated Use CREDIT_PACK instead */
  LARGE: process.env.STRIPE_PRICE_ID_ADDON_LARGE || '',
} as const;

/**
 * Map addon price IDs to credit amounts
 */
export const ADDON_CREDIT_MAP: Record<string, number> = {
  [STRIPE_ADDON_PRICES.CREDIT_PACK]: 40,
  // Legacy mappings for existing purchases
  [STRIPE_ADDON_PRICES.MEDIUM]: 60,
  [STRIPE_ADDON_PRICES.LARGE]: 120,
};

/**
 * Plan configurations
 */
export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    credits: 4,
    features: ['2 applications/month', 'All CV templates', 'CV + Cover Letter + Email'],
  },
  plus: {
    name: 'Plus',
    price: 19.99,
    priceId: STRIPE_PRICES.PLUS,
    credits: 50,
    features: ['25 applications/month', 'Add-on credits', 'Priority email support'],
  },
  max: {
    name: 'Max',
    price: 79.99,
    priceId: STRIPE_PRICES.MAX,
    credits: 200,
    features: ['100 applications/month', 'Add-on credits', 'Chrome Extension (Coming Soon)', 'Premium support'],
  },
} as const;

export type PlanTier = keyof typeof PLANS;
