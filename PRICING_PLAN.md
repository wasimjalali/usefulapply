# KarKo AI - Credit-Based Pricing Plan & Implementation Guide

## Overview

Credit-based pricing model for AI-powered job application generation. All tiers include the same features (web search, refinement, all templates) - only credit amounts differ.

**Key Principle**: Pay for what you use, not for features.

---

## Brand Color Palette (Reference)

```css
/* Primary - Deep Navy */
--color-navy-600: #1E3A5F;  /* Main primary */
--color-navy-100: #C5D1E3;  /* Light accent */

/* Background - Warm Cream */
--color-cream-50: #FEFDFB;   /* Cards, surfaces */
--color-cream-100: #FAF7F2;  /* Main background */

/* Accent - Soft Gold */
--color-gold-400: #D4A853;   /* Main accent, CTAs */
--color-gold-500: #C4932E;   /* Hover state */

/* Success - Sage Green */
--color-sage-500: #5B8A72;   /* Success states */

/* Text */
--color-charcoal: #2D3748;   /* Primary text */
--color-warm-gray: #6B7280;  /* Secondary text */
```

---

## Cost Analysis (Updated - GPT-4o Mini)

### Per Application Cost Breakdown
| Component | Cost |
|-----------|------|
| Full Application (CV + Cover Letter + Email) | ~$0.03 |
| Cover Letter Regeneration | ~$0.01 |
| Email Regeneration | ~$0.01 |

**Note:** Using GPT-4o Mini significantly reduced costs from the original estimates.

### Actual API Costs
| Tier | Applications | API Cost | Price | Profit Margin |
|------|--------------|----------|-------|---------------|
| Starter | 5 | ~$0.15 | Free | N/A |
| Plus | 80+ | ~$2.40 | $19.99 | **88%** |
| Pro | 150+ | ~$4.50 | $39.99 | **89%** |

---

## Pricing Tiers (Recalculated)

### 🆓 **Starter** (Free Forever)

| Attribute | Value |
|-----------|-------|
| **Price** | $0/month |
| **Credits** | 10 credits |
| **Applications** | 5 complete applications |
| **API Cost** | ~$0.15 |

#### Credit Allocation:
- Full application generation: **2 credits**
- CV optimization only: **1 credit**
- Cover letter regeneration: **1 credit**
- Email regeneration: **1 credit**

#### Features Included:
- ✅ All CV templates (US & EU formats)
- ✅ Web search & company research
- ✅ AI refinement (max 2 iterations)
- ✅ Personalized CV, cover letter & email
- ✅ PDF export
- ✅ Application history (last 30 days)

#### Ideal For:
- Job seekers testing the platform
- Light users (1-2 applications/week)
- Students exploring opportunities

---

### ⭐ **Plus** (Most Popular)

| Attribute | Value |
|-----------|-------|
| **Price** | $19.99/month |
| **Credits** | 160 credits |
| **Applications** | 80+ complete applications |
| **API Cost** | ~$2.40 (80 apps × $0.03) |
| **Profit Margin** | 88% ($17.59) |

#### Credit Allocation:
- Full application generation: **2 credits**
- CV optimization only: **1 credit**
- Cover letter regeneration: **1 credit**
- Email regeneration: **1 credit**

#### Features Included:
- ✅ Everything in Starter
- ✅ 160 credits/month
- ✅ **Add-on credits available**
- ✅ Priority email support
- ✅ Unused credits roll over (1 month, max 160)
- ✅ Application history (unlimited)

#### Usage Examples:
| Scenario | Credits Used | Applications |
|----------|-------------|--------------|
| 80 apps, no regeneration | 160 | 80 |
| 60 apps + 20 cover letter regens | 140 | 60 |
| 70 apps + 10 email regens | 150 | 70 |

#### Ideal For:
- Active job seekers
- Career changers
- Professionals applying to 15-20 jobs/week

---

### 🚀 **Pro** (Best Value)

| Attribute | Value |
|-----------|-------|
| **Price** | $39.99/month |
| **Credits** | 300 credits |
| **Applications** | 150+ complete applications |
| **API Cost** | ~$4.50 (150 apps × $0.03) |
| **Profit Margin** | 89% ($35.49) |

#### Credit Allocation:
- Full application generation: **2 credits**
- CV optimization only: **1 credit**
- Cover letter regeneration: **1 credit**
- Email regeneration: **1 credit**

#### Features Included:
- ✅ Everything in Plus
- ✅ 300 credits/month
- ✅ **Add-on credits available**
- ✅ Premium support (24h response)
- ✅ Unused credits roll over (2 months, max 600)
- ✅ Advanced analytics dashboard
- ✅ API access (coming soon)
- ✅ Team features (coming soon)

#### Usage Examples:
| Scenario | Credits Used | Applications |
|----------|-------------|--------------|
| 150 apps, no regeneration | 300 | 150 |
| 120 apps + 30 cover letter regens | 270 | 120 |
| 100 apps + 50 cover letter + 25 email regens | 275 | 100 |

#### Ideal For:
- Heavy users (recruiters, career coaches)
- Job seekers in intensive search mode
- Professionals applying to 30-40 jobs/week

---

## Add-On Credits (Plus & Pro Tiers)

### Credit Packs

| Pack | Credits | Applications | Price | Per Credit | Discount |
|------|---------|--------------|-------|------------|----------|
| Small | 50 credits | 25 apps | $4.99 | $0.10 | - |
| Medium | 120 credits | 60 apps | $9.99 | $0.08 | Best Value |
| Large | 250 credits | 125 apps | $17.99 | $0.07 | Most Popular |

### Add-On Rules:
- ✅ Available for **Plus** and **Pro** subscribers only
- ✅ No expiration date (never expire)
- ✅ Used after monthly credits are depleted
- ✅ Non-refundable
- ✅ Can purchase multiple packs

---

## Credit System Rules

### Credit Deduction Order:
1. **Monthly credits** (first)
2. **Rollover credits** (second)
3. **Add-on credits** (last - never expire)

### Credit Rollover Policy:

| Tier | Rollover Period | Max Rollover |
|------|-----------------|--------------|
| Starter | None | 0 credits |
| Plus | 1 month | 160 credits |
| Pro | 2 months | 600 credits |

### Monthly Reset Logic:
```
On subscription renewal date:
1. Calculate unused monthly credits
2. Move to rollover bucket (apply max limit)
3. Reset monthly credits to plan limit
4. Add-on credits remain unchanged
```

---

## Pricing Comparison Table

| Feature | Starter | Plus | Pro |
|---------|---------|------|-----|
| **Price** | Free | $19.99/mo | $39.99/mo |
| **Monthly Credits** | 10 | 160 | 300 |
| **Applications** | 5 | 80+ | 150+ |
| **All Templates** | ✅ | ✅ | ✅ |
| **Web Search** | ✅ | ✅ | ✅ |
| **AI Refinement** | ✅ | ✅ | ✅ |
| **PDF Export** | ✅ | ✅ | ✅ |
| **Add-on Credits** | ❌ | ✅ | ✅ |
| **Credit Rollover** | ❌ | 1 month | 2 months |
| **Support** | Community | Priority | Premium |
| **History** | 30 days | Unlimited | Unlimited |

---

## Landing Page Design Specification

### Page Structure

#### Option A: Pricing on Dedicated Page (Recommended)
```
/                    → Landing page (hero, features, testimonials, CTA)
/pricing             → Pricing page (tiers, comparison, FAQ)
/auth/login          → Login page
/auth/signup         → Signup page (with plan selection)
/settings            → Settings (includes subscription management)
```

#### Option B: Pricing on Landing Page
```
/                    → Landing page with pricing section
/auth/login          → Login page
/auth/signup         → Signup page
/settings            → Settings
```

**Recommendation**: Option A - Dedicated pricing page allows for better SEO, easier A/B testing, and cleaner user flow.

---

### Landing Page (`/`) Design

#### Section 1: Hero
```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                              [Login] [Get Started]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│     Generate Hyper-Personalized Job Applications            │
│              in Under 3 Minutes                             │
│                                                             │
│     AI-powered CV optimization, cover letters & emails      │
│     tailored to each job description                        │
│                                                             │
│     [Start Free - 5 Applications] [See Pricing →]           │
│                                                             │
│     ⭐⭐⭐⭐⭐ "Saved me 40 minutes per application"          │
│                                                             │
│              [Hero Image/Animation]                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: cream-100 (#FAF7F2)
- Headline: navy-600 (#1E3A5F)
- Subheadline: charcoal (#2D3748)
- Primary CTA: gold-400 (#D4A853) with white text
- Secondary CTA: navy-600 outline
```

#### Section 2: How It Works
```
┌─────────────────────────────────────────────────────────────┐
│                    How KarKo AI Works                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐  │
│  │    1    │    │    2    │    │    3    │    │    4    │  │
│  │ Upload  │ →  │  Paste  │ →  │   AI    │ →  │  Get    │  │
│  │  Your   │    │   Job   │    │ Analyzes│    │Complete │  │
│  │   CV    │    │  Desc   │    │ & Writes│    │ Package │  │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘  │
│                                                             │
│  Upload your     Paste any job   3 AI agents    Optimized   │
│  master CV       description     research &     CV, cover   │
│  once            from anywhere   personalize    letter &    │
│                                                 email       │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: white (#FFFFFF)
- Step numbers: gold-400 circle
- Icons: navy-600
- Text: charcoal
```

#### Section 3: Features
```
┌─────────────────────────────────────────────────────────────┐
│              Everything You Need to Land Your Dream Job     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ 🔍 Smart Research │  │ 📄 ATS-Optimized │                │
│  │ AI researches the │  │ Templates that   │                │
│  │ company & role    │  │ pass ATS systems │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ ✨ Personalized   │  │ ⚡ 40 Min → 3 Min │                │
│  │ Every document    │  │ Save hours on    │                │
│  │ tailored to job   │  │ each application │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: cream-50 (#FEFDFB)
- Cards: white with subtle shadow
- Icons: gold-400
- Headings: navy-600
```

#### Section 4: Testimonials
```
┌─────────────────────────────────────────────────────────────┐
│                 Trusted by Job Seekers Worldwide            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "Applied to 50 jobs in one weekend. Got 8 interviews│   │
│  │  in the first week!"                                │   │
│  │                                                     │   │
│  │  ⭐⭐⭐⭐⭐  Sarah M., Product Manager               │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "3x more interviews after using KarKo AI. The       │   │
│  │  personalization is incredible."                    │   │
│  │                                                     │   │
│  │  ⭐⭐⭐⭐⭐  James L., Software Engineer             │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: navy-600 (#1E3A5F)
- Text: white
- Stars: gold-400
- Cards: navy-700 with gold border
```

#### Section 5: CTA Banner
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│        Ready to Transform Your Job Search?                  │
│                                                             │
│        Start with 5 free applications today                 │
│                                                             │
│              [Get Started Free]  [View Pricing]             │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: gradient from gold-400 to gold-500
- Text: navy-600
- Button: navy-600 with white text
```

---

### Pricing Page (`/pricing`) Design

```
┌─────────────────────────────────────────────────────────────┐
│  [Logo]                              [Login] [Get Started]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│           Simple, Transparent Pricing                       │
│     All features included. Pay only for what you use.       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   STARTER   │  │    PLUS     │  │     PRO     │         │
│  │             │  │  ⭐ POPULAR │  │  🚀 BEST    │         │
│  │    Free     │  │   $19.99    │  │   $39.99    │         │
│  │   forever   │  │   /month    │  │   /month    │         │
│  │             │  │             │  │             │         │
│  │  50 credits │  │ 200 credits │  │ 400 credits │         │
│  │  ~5 apps    │  │  ~20 apps   │  │  ~40 apps   │         │
│  │             │  │             │  │             │         │
│  │ ✓ All       │  │ ✓ All       │  │ ✓ All       │         │
│  │   templates │  │   templates │  │   templates │         │
│  │ ✓ Web       │  │ ✓ Web       │  │ ✓ Web       │         │
│  │   search    │  │   search    │  │   search    │         │
│  │ ✓ AI        │  │ ✓ AI        │  │ ✓ AI        │         │
│  │   refinement│  │   refinement│  │   refinement│         │
│  │ ✓ PDF       │  │ ✓ PDF       │  │ ✓ PDF       │         │
│  │   export    │  │   export    │  │   export    │         │
│  │ ✗ Add-ons   │  │ ✓ Add-ons   │  │ ✓ Add-ons   │         │
│  │ ✗ Rollover  │  │ ✓ 1 month   │  │ ✓ 2 months  │         │
│  │             │  │   rollover  │  │   rollover  │         │
│  │             │  │             │  │             │         │
│  │ [Start Free]│  │ [Get Plus]  │  │ [Get Pro]   │         │
│  │             │  │             │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Need More Credits?                       │
│                                                             │
│     Plus & Pro subscribers can purchase add-on credits      │
│                                                             │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐               │
│  │ 100       │  │ 250       │  │ 500       │               │
│  │ credits   │  │ credits   │  │ credits   │               │
│  │ $7.99     │  │ $17.99    │  │ $29.99    │               │
│  │           │  │ 10% off   │  │ 25% off   │               │
│  └───────────┘  └───────────┘  └───────────┘               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    Frequently Asked Questions               │
│                                                             │
│  ▼ What happens if I run out of credits?                   │
│  ▼ Do unused credits expire?                               │
│  ▼ Can I change my plan anytime?                           │
│  ▼ What's included in each application?                    │
│  ▼ How does the AI personalization work?                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

Colors:
- Background: cream-100
- Cards: white with cream-200 border
- Popular badge: gold-400 background
- Best Value badge: sage-500 background
- CTA buttons: 
  - Starter: navy-600 outline
  - Plus: gold-400 solid (primary)
  - Pro: navy-600 solid
- Checkmarks: sage-500
- X marks: warm-gray
```

---

## Phase 1: Supabase Database Setup

### SQL to Run in Supabase SQL Editor

```sql
-- =====================================================
-- KARKO AI CREDIT SYSTEM - DATABASE SCHEMA
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Plan identification
  tier TEXT UNIQUE NOT NULL CHECK (tier IN ('starter', 'plus', 'pro')),
  name TEXT NOT NULL,
  description TEXT,
  
  -- Pricing
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2), -- For future annual plans
  
  -- Credits
  credits_monthly INTEGER NOT NULL,
  
  -- Rollover settings
  rollover_months INTEGER DEFAULT 0,
  max_rollover_credits INTEGER DEFAULT 0,
  
  -- Features
  addon_enabled BOOLEAN DEFAULT FALSE,
  
  -- Stripe integration
  stripe_product_id TEXT,
  stripe_price_id_monthly TEXT,
  stripe_price_id_yearly TEXT,
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default plans
INSERT INTO subscription_plans (tier, name, description, price_monthly, credits_monthly, rollover_months, max_rollover_credits, addon_enabled, display_order) VALUES
('starter', 'Starter', 'Perfect for trying out KarKo AI', 0.00, 50, 0, 0, FALSE, 1),
('plus', 'Plus', 'For active job seekers', 19.99, 200, 1, 400, TRUE, 2),
('pro', 'Pro', 'For power users and professionals', 39.99, 400, 2, 800, TRUE, 3)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_monthly = EXCLUDED.price_monthly,
  credits_monthly = EXCLUDED.credits_monthly,
  rollover_months = EXCLUDED.rollover_months,
  max_rollover_credits = EXCLUDED.max_rollover_credits,
  addon_enabled = EXCLUDED.addon_enabled,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- 2. User Credits Table
CREATE TABLE IF NOT EXISTS user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Credit balances
  monthly_credits INTEGER DEFAULT 0,
  rollover_credits INTEGER DEFAULT 0,
  addon_credits INTEGER DEFAULT 0,
  
  -- Plan reference
  plan_tier TEXT NOT NULL DEFAULT 'starter' REFERENCES subscription_plans(tier),
  
  -- Reset tracking
  last_reset_date TIMESTAMPTZ DEFAULT NOW(),
  next_reset_date TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '1 month'),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- Create computed column for total credits
CREATE OR REPLACE FUNCTION get_total_credits(user_credits)
RETURNS INTEGER AS $$
  SELECT $1.monthly_credits + $1.rollover_credits + $1.addon_credits;
$$ LANGUAGE SQL IMMUTABLE;

-- 3. Credit Transactions Table (Audit Trail)
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Transaction details
  amount INTEGER NOT NULL, -- Negative for deductions, positive for additions
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'application_generation',
    'cover_letter_regen',
    'email_regen',
    'monthly_reset',
    'rollover_applied',
    'addon_purchase',
    'plan_upgrade',
    'plan_downgrade',
    'admin_adjustment',
    'refund',
    'expired'
  )),
  
  -- Reference data
  session_id UUID REFERENCES application_sessions(id) ON DELETE SET NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  
  -- Balance snapshot (for audit)
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Add-on Credit Packs Table
CREATE TABLE IF NOT EXISTS addon_credit_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Pack details
  name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  
  -- Discount info
  discount_percent INTEGER DEFAULT 0,
  
  -- Stripe integration
  stripe_product_id TEXT,
  stripe_price_id TEXT,
  
  -- Status
  active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default add-on packs
INSERT INTO addon_credit_packs (name, credits, price, discount_percent, display_order) VALUES
('Small Pack', 100, 7.99, 0, 1),
('Medium Pack', 250, 17.99, 10, 2),
('Large Pack', 500, 29.99, 25, 3)
ON CONFLICT DO NOTHING;

-- 5. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_user_credits_plan_tier ON user_credits(plan_tier);
CREATE INDEX IF NOT EXISTS idx_user_credits_next_reset ON user_credits(next_reset_date);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_session ON credit_transactions(session_id);

-- 6. Row Level Security
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_credit_packs ENABLE ROW LEVEL SECURITY;

-- Policies for subscription_plans (public read)
CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (active = TRUE);

-- Policies for user_credits
CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert credits"
  ON user_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update credits"
  ON user_credits FOR UPDATE
  USING (auth.uid() = user_id);

-- Policies for credit_transactions
CREATE POLICY "Users can view own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions"
  ON credit_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policies for addon_credit_packs (public read)
CREATE POLICY "Anyone can view active packs"
  ON addon_credit_packs FOR SELECT
  USING (active = TRUE);

-- 7. Function to initialize credits for new user
CREATE OR REPLACE FUNCTION initialize_user_credits()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_credits (user_id, monthly_credits, plan_tier, next_reset_date)
  VALUES (NEW.id, 50, 'starter', NOW() + INTERVAL '1 month')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create credits on profile creation
DROP TRIGGER IF EXISTS on_profile_created_init_credits ON profiles;
CREATE TRIGGER on_profile_created_init_credits
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION initialize_user_credits();

-- 8. Function to deduct credits (with proper order)
CREATE OR REPLACE FUNCTION deduct_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_transaction_type TEXT,
  p_session_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  remaining_credits INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_credits user_credits%ROWTYPE;
  v_remaining INTEGER;
  v_new_monthly INTEGER;
  v_new_rollover INTEGER;
  v_new_addon INTEGER;
  v_total_before INTEGER;
BEGIN
  -- Get current credits with lock
  SELECT * INTO v_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'User credits not found'::TEXT;
    RETURN;
  END IF;
  
  v_total_before := v_credits.monthly_credits + v_credits.rollover_credits + v_credits.addon_credits;
  
  -- Check sufficient balance
  IF v_total_before < p_amount THEN
    RETURN QUERY SELECT FALSE, v_total_before, 'Insufficient credits'::TEXT;
    RETURN;
  END IF;
  
  -- Deduct in order: monthly → rollover → addon
  v_remaining := p_amount;
  v_new_monthly := v_credits.monthly_credits;
  v_new_rollover := v_credits.rollover_credits;
  v_new_addon := v_credits.addon_credits;
  
  -- Deduct from monthly first
  IF v_remaining > 0 AND v_new_monthly > 0 THEN
    IF v_new_monthly >= v_remaining THEN
      v_new_monthly := v_new_monthly - v_remaining;
      v_remaining := 0;
    ELSE
      v_remaining := v_remaining - v_new_monthly;
      v_new_monthly := 0;
    END IF;
  END IF;
  
  -- Then from rollover
  IF v_remaining > 0 AND v_new_rollover > 0 THEN
    IF v_new_rollover >= v_remaining THEN
      v_new_rollover := v_new_rollover - v_remaining;
      v_remaining := 0;
    ELSE
      v_remaining := v_remaining - v_new_rollover;
      v_new_rollover := 0;
    END IF;
  END IF;
  
  -- Finally from addon
  IF v_remaining > 0 AND v_new_addon > 0 THEN
    IF v_new_addon >= v_remaining THEN
      v_new_addon := v_new_addon - v_remaining;
      v_remaining := 0;
    ELSE
      v_remaining := v_remaining - v_new_addon;
      v_new_addon := 0;
    END IF;
  END IF;
  
  -- Update credits
  UPDATE user_credits
  SET 
    monthly_credits = v_new_monthly,
    rollover_credits = v_new_rollover,
    addon_credits = v_new_addon,
    updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- Log transaction
  INSERT INTO credit_transactions (
    user_id, amount, transaction_type, session_id, description,
    balance_before, balance_after
  ) VALUES (
    p_user_id, -p_amount, p_transaction_type, p_session_id, p_description,
    v_total_before, v_total_before - p_amount
  );
  
  RETURN QUERY SELECT TRUE, v_total_before - p_amount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Function to add credits
CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount INTEGER,
  p_credit_type TEXT, -- 'monthly', 'rollover', 'addon'
  p_transaction_type TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_credits user_credits%ROWTYPE;
  v_total_before INTEGER;
  v_total_after INTEGER;
BEGIN
  -- Get current credits with lock
  SELECT * INTO v_credits
  FROM user_credits
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'User credits not found'::TEXT;
    RETURN;
  END IF;
  
  v_total_before := v_credits.monthly_credits + v_credits.rollover_credits + v_credits.addon_credits;
  
  -- Update appropriate credit type
  IF p_credit_type = 'monthly' THEN
    UPDATE user_credits SET monthly_credits = monthly_credits + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_credit_type = 'rollover' THEN
    UPDATE user_credits SET rollover_credits = rollover_credits + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSIF p_credit_type = 'addon' THEN
    UPDATE user_credits SET addon_credits = addon_credits + p_amount, updated_at = NOW()
    WHERE user_id = p_user_id;
  ELSE
    RETURN QUERY SELECT FALSE, v_total_before, 'Invalid credit type'::TEXT;
    RETURN;
  END IF;
  
  v_total_after := v_total_before + p_amount;
  
  -- Log transaction
  INSERT INTO credit_transactions (
    user_id, amount, transaction_type, description,
    balance_before, balance_after
  ) VALUES (
    p_user_id, p_amount, p_transaction_type, p_description,
    v_total_before, v_total_after
  );
  
  RETURN QUERY SELECT TRUE, v_total_after, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- END OF CREDIT SYSTEM SCHEMA
-- =====================================================
```

---

## Phase 2: Backend Implementation

### File Structure
```
src/lib/
├── supabase/
│   ├── credits.ts          # Credit operations
│   └── index.ts            # Export credits functions
├── middleware/
│   └── creditCheck.ts      # API middleware
└── constants/
    └── credits.ts          # Credit cost constants
```

### Implementation files will be created in the next phases.

---

## Phase 3: API Integration

### Routes to Update
1. `/api/agent-v2` - Full application generation (10 credits)
2. `/api/regenerate` - Cover letter/email regeneration (1-2 credits)

### Credit Check Flow
```
1. User makes API request
2. Middleware checks authentication
3. Middleware checks credit balance
4. If insufficient → Return 402 with upgrade prompt
5. If sufficient → Deduct credits, proceed with request
6. On success → Log transaction
7. On failure → Refund credits (optional)
```

---

## Phase 4: Stripe Integration

### Products to Create in Stripe Dashboard
1. **Plus Subscription** - $19.99/month recurring
2. **Pro Subscription** - $39.99/month recurring
3. **Small Credit Pack** - $7.99 one-time
4. **Medium Credit Pack** - $17.99 one-time
5. **Large Credit Pack** - $29.99 one-time

### Webhooks to Handle
- `checkout.session.completed` - New subscription or add-on purchase
- `customer.subscription.updated` - Plan change
- `customer.subscription.deleted` - Cancellation
- `invoice.paid` - Monthly renewal (reset credits)
- `invoice.payment_failed` - Payment failure

---

## Phase 5: Frontend Components

### Components to Create
1. `PricingPage.tsx` - Full pricing page
2. `PricingCard.tsx` - Individual tier card
3. `CreditBalance.tsx` - Credit display widget
4. `CreditUsageBar.tsx` - Visual credit usage
5. `UpgradeModal.tsx` - Upgrade prompt
6. `AddOnPurchase.tsx` - Add-on credit purchase flow

---

## Implementation Checklist

### Phase 1: Database ✅
- [ ] Run SQL schema in Supabase
- [ ] Verify tables created
- [ ] Test RLS policies
- [ ] Verify trigger works for new users

### Phase 2: Backend
- [ ] Create `src/lib/supabase/credits.ts`
- [ ] Create `src/lib/constants/credits.ts`
- [ ] Create `src/lib/middleware/creditCheck.ts`
- [ ] Export functions from index

### Phase 3: API Integration
- [ ] Update `/api/agent-v2` with credit check
- [ ] Create `/api/regenerate` endpoint
- [ ] Add credit deduction on success
- [ ] Handle insufficient credits error

### Phase 4: Stripe
- [ ] Create Stripe products
- [ ] Set up webhook endpoint
- [ ] Handle subscription events
- [ ] Handle add-on purchases

### Phase 5: Frontend
- [ ] Create pricing page
- [ ] Add credit balance to header/settings
- [ ] Create upgrade modal
- [ ] Add low credit warnings

### Phase 6: Testing
- [ ] Test free tier flow
- [ ] Test upgrade flow
- [ ] Test credit deduction
- [ ] Test rollover logic
- [ ] Test add-on purchase

---

## FAQ for Users

**Q: What happens if I run out of credits?**
A: You can upgrade your plan or purchase add-on credits (Plus & Pro only). Free tier resets monthly.

**Q: Do unused credits expire?**
A: Plus: 1 month rollover (max 400). Pro: 2 months rollover (max 800). Add-on credits never expire.

**Q: Can I downgrade my plan?**
A: Yes, at the end of your billing cycle. Unused credits will be adjusted based on the new tier's limits.

**Q: How many applications can I really do?**
A: Plus (200 credits): ~20 full applications, or 15 apps + 10 regenerations.

**Q: What if I need more credits mid-month?**
A: Plus and Pro users can purchase add-on credit packs anytime.

**Q: Are all features available in all tiers?**
A: Yes! All tiers include web search, refinement, all templates. Only credit amounts differ.

---

## Marketing Copy

### Headlines
- "Generate 20+ Hyper-Personalized Job Applications for $19.99/month"
- "Save 40 Minutes Per Application with AI-Powered Job Tools"
- "Your Complete Job Application Package in Under 3 Minutes"

### Value Props
1. ⚡ **Save 40 minutes per application** - Complete packages in 2-3 minutes
2. 🎯 **Hyper-personalized content** - AI researches company & tailors every document
3. 📄 **Complete package** - Optimized CV + cover letter + email in one flow
4. 🔄 **Unlimited refinements** - Perfect your applications with AI feedback
5. 🌐 **Smart web search** - Automatic company research & insights

---

**Document Version**: 1.0
**Last Updated**: February 1, 2026
**Status**: Ready for Implementation
