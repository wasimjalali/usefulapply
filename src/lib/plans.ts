/**
 * The plans, once. The landing page and the settings modal both read this, so
 * a price or a credit count can't drift between what a visitor sees before
 * signing up and what they see after.
 */
export type PlanTier = 'free' | 'plus' | 'max';

export interface Plan {
  tier: PlanTier;
  name: string;
  price: string;
  per: string;
  credits: string;
  /** The three lines on the landing card. */
  features: [string, string, string];
  /** The single line the settings modal shows instead of the three. */
  settingsLine: string;
}

export const PLANS: Plan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    per: 'a month',
    credits: '4 credits a month',
    features: ['2 applications', 'Top-5 daily feed', 'Fit checks and the tracker'],
    settingsLine: 'Two applications, top-5 daily feed.',
  },
  {
    tier: 'plus',
    name: 'Plus',
    price: '$19.99',
    per: 'a month',
    credits: '50 credits a month',
    features: ['25 applications', '20 roles a day, Edit feed', 'Everything in Free'],
    settingsLine: '25 applications, 20 roles a day, Edit feed.',
  },
  {
    tier: 'max',
    name: 'Max',
    price: '$79.99',
    per: 'a month',
    credits: '200 credits a month',
    features: ['100 applications', 'Twice the feed search', 'Everything in Plus'],
    settingsLine: '100 applications, twice the feed search.',
  },
];

/** Stated once, on the landing and on /pricing. */
export const CREDIT_PRICES = 'Fit check 0.5 · full kit 2, 1.5 after a fit check · rewrite 0.5';
