# Supabase Database Schema Guide for Job Copilot

This guide provides a complete step-by-step setup for Supabase database tables, storage buckets, and Row Level Security (RLS) policies for the Job Copilot application.

---

## Overview

### Data Storage Requirements

Based on the application analysis, we need to store:

1. **User Authentication** - User accounts and profiles
2. **Documents** - CVs, Master CVs, Profile Photos
3. **Application Sessions** - Job applications with all generated content
4. **Chat History** - Messages within each application session
5. **Subscriptions** - User subscription plans and billing

---

## Part 1: Database Tables

### Table 1: `profiles` (User Profiles)

Extends Supabase Auth with additional user data.

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  phone TEXT,
  location TEXT,
  avatar_url TEXT,
  
  -- Subscription info (denormalized for quick access)
  subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'trialing')),
  
  -- Notification preferences
  notify_tips BOOLEAN DEFAULT true,
  notify_updates BOOLEAN DEFAULT true,
  notify_weekly BOOLEAN DEFAULT true,
  notify_marketing BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Social / portfolio links
  linkedin_url TEXT,
  github_url TEXT,
  portfolio_url TEXT,
  website_url TEXT
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

### Table 2: `documents` (CVs and Master CVs)

Stores parsed CV data and references to uploaded files.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Document type
  type TEXT NOT NULL CHECK (type IN ('primary_cv', 'master_cv')),
  
  -- File info
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'docx')),
  file_size INTEGER,
  storage_path TEXT, -- Path in Supabase Storage
  
  -- Parsed content
  raw_text TEXT,
  sections JSONB DEFAULT '{}',
  -- sections structure: { contactInfo, summary, experience, education, skills, other }
  
  -- For Master CV only
  all_skills TEXT[] DEFAULT '{}',
  all_experiences TEXT[] DEFAULT '{}',
  all_education TEXT[] DEFAULT '{}',
  
  -- Structured CV data (new schema)
  structured_data JSONB, -- Full StructuredCV object
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_type ON documents(type);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  USING (auth.uid() = user_id);
```

---

### Table 3: `profile_photos` (User Profile Photos for EU CVs)

```sql
CREATE TABLE profile_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL, -- Path in Supabase Storage
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one photo per user
CREATE UNIQUE INDEX idx_profile_photos_user_id ON profile_photos(user_id);

-- Enable RLS
ALTER TABLE profile_photos ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own photo"
  ON profile_photos FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own photo"
  ON profile_photos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own photo"
  ON profile_photos FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own photo"
  ON profile_photos FOR DELETE
  USING (auth.uid() = user_id);
```

---

### Table 4: `application_sessions` (Job Applications)

Main table for job application sessions with all generated content.

```sql
CREATE TABLE application_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Job info
  job_title TEXT,
  company TEXT,
  job_description TEXT NOT NULL,
  
  -- Analysis results
  match_score INTEGER CHECK (match_score >= 0 AND match_score <= 100),
  matching_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  suggestions TEXT[] DEFAULT '{}',
  
  -- Parsed job requirements (JSONB)
  requirements JSONB,
  -- Structure: { title, company, hardSkills, softSkills, experienceLevel, keywords, responsibilities, niceToHave, expectedSalary, startDate, location, workType }
  
  -- Gap analysis (JSONB)
  gaps JSONB,
  -- Structure: { matchingSkills, missingSkills, matchingExperience, missingExperience, matchScore, suggestions }
  
  -- Generated content (JSONB)
  generated_cv JSONB,
  -- Structure: { content, optimizedTagline, changes, optimizedFor }
  
  cover_letter JSONB,
  -- Structure: { applicantAddress, date, companyAddress, salutation, body, closing, signatureName }
  
  email JSONB,
  -- Structure: { subject, body, attachmentNote }
  
  -- Company research (JSONB)
  company_research JSONB,
  -- Structure: { name, description, culture, values, techStack, recentNews, address, contactPerson }
  
  -- CV edits tracking
  cv_edits JSONB DEFAULT '[]',
  -- Structure: [{ id, section, field, originalValue, newValue, reason }]
  
  -- PDF reference
  optimized_pdf_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sessions_user_id ON application_sessions(user_id);
CREATE INDEX idx_sessions_company ON application_sessions(company);
CREATE INDEX idx_sessions_created_at ON application_sessions(created_at DESC);

-- Enable RLS
ALTER TABLE application_sessions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own sessions"
  ON application_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON application_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON application_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON application_sessions FOR DELETE
  USING (auth.uid() = user_id);
```

---

### Table 5: `chat_messages` (Chat History)

Stores chat messages for each application session.

```sql
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES application_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- Action buttons attached to message
  actions JSONB DEFAULT '[]',
  -- Structure: [{ label, action, icon }]
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_messages_session_id ON chat_messages(session_id);
CREATE INDEX idx_messages_created_at ON chat_messages(created_at);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own messages"
  ON chat_messages FOR DELETE
  USING (auth.uid() = user_id);
```

---

### Table 6: `subscriptions` (Subscription & Billing)

Stores subscription details and billing history for paid plans.

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Subscription details
  tier TEXT NOT NULL CHECK (tier IN ('free', 'pro', 'enterprise')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'incomplete')),
  
  -- Stripe integration (or other payment provider)
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  
  -- Billing cycle
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  
  -- Trial info
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  
  -- Usage limits (for metered billing)
  applications_used INTEGER DEFAULT 0,
  applications_limit INTEGER DEFAULT 5, -- Free tier limit
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active subscription per user
CREATE UNIQUE INDEX idx_subscriptions_user_id ON subscriptions(user_id) WHERE status = 'active';

-- Indexes
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  USING (auth.role() = 'service_role');
```

---

### Table 7: `connected_accounts` (OAuth Connections)

Stores connected OAuth accounts (Google, LinkedIn).

```sql
CREATE TABLE connected_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  provider TEXT NOT NULL CHECK (provider IN ('google', 'linkedin', 'github')),
  provider_user_id TEXT NOT NULL,
  provider_email TEXT,
  access_token TEXT, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, provider)
);

-- Enable RLS
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own connected accounts"
  ON connected_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own connected accounts"
  ON connected_accounts FOR ALL
  USING (auth.uid() = user_id);
```

---

### Table 8: `message_feedback` (AI Response Feedback)

Stores user feedback (thumbs up/down) on AI-generated responses.

```sql
CREATE TABLE message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES application_sessions(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL, -- The chat message ID
  
  -- Feedback type
  feedback_type TEXT NOT NULL CHECK (feedback_type IN ('positive', 'negative')),
  
  -- Optional additional context
  feedback_text TEXT, -- Optional user comment
  message_content TEXT, -- Store the message content for analysis
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_feedback_user_id ON message_feedback(user_id);
CREATE INDEX idx_feedback_session_id ON message_feedback(session_id);
CREATE INDEX idx_feedback_type ON message_feedback(feedback_type);

-- Enable RLS
ALTER TABLE message_feedback ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own feedback"
  ON message_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON message_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own feedback"
  ON message_feedback FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own feedback"
  ON message_feedback FOR DELETE
  USING (auth.uid() = user_id);
```

---

### Table 9: `subscription_plans` (Pricing Tiers)

Stores the available subscription plans and their credit allocations.

```sql
CREATE TABLE subscription_plans (
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

-- RLS
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (active = TRUE);
```

---

### Table 10: `user_credits` (User Credit Balances)

Tracks each user's credit balance and plan information.

```sql
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Credit balances
  monthly_credits NUMERIC(10,2) DEFAULT 0,
  rollover_credits NUMERIC(10,2) DEFAULT 0,
  addon_credits NUMERIC(10,2) DEFAULT 0,
  
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

-- Indexes
CREATE INDEX idx_user_credits_user_id ON user_credits(user_id);
CREATE INDEX idx_user_credits_plan_tier ON user_credits(plan_tier);
CREATE INDEX idx_user_credits_next_reset ON user_credits(next_reset_date);

-- RLS
ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own credits"
  ON user_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert credits"
  ON user_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update credits"
  ON user_credits FOR UPDATE
  USING (auth.uid() = user_id);
```

---

### Table 11: `credit_transactions` (Credit Audit Trail)

Logs all credit additions and deductions for auditing.

```sql
CREATE TABLE credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Transaction details
  amount NUMERIC(10,2) NOT NULL, -- Negative for deductions, positive for additions
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
  balance_before NUMERIC(10,2) NOT NULL,
  balance_after NUMERIC(10,2) NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX idx_credit_transactions_created_at ON credit_transactions(created_at);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX idx_credit_transactions_session ON credit_transactions(session_id);

-- RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert transactions"
  ON credit_transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
```

---

### Table 12: `addon_credit_packs` (Purchasable Credit Packs)

Defines the add-on credit packs available for purchase.

```sql
CREATE TABLE addon_credit_packs (
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

-- RLS
ALTER TABLE addon_credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packs"
  ON addon_credit_packs FOR SELECT
  USING (active = TRUE);
```

---

### Auto-Initialize Credits for New Users

This trigger automatically creates a credit record when a new user profile is created.

```sql
-- Function to initialize credits for new user
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
```

---

### Credit Deduction Function

Database function to safely deduct credits with proper ordering.

```sql
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
```

---

## Part 2: Storage Buckets

### Bucket 1: `cv-files`

For storing original CV and Master CV files (PDF/DOCX).

```sql
-- Create bucket (run in Supabase Dashboard > Storage)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cv-files', 'cv-files', false);

-- RLS Policies for cv-files bucket
CREATE POLICY "Users can upload own CV files"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'cv-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own CV files"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'cv-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own CV files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'cv-files' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

**File path structure:** `{user_id}/{document_type}/{filename}`
- Example: `abc123-uuid/primary_cv/john_doe_cv.pdf`
- Example: `abc123-uuid/master_cv/master_cv_complete.docx`

---

### Bucket 2: `profile-photos`

For storing user profile photos (for EU CV templates).

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', false);

-- RLS Policies
CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own photos"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update own photos"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'profile-photos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

**File path structure:** `{user_id}/profile.{ext}`
- Example: `abc123-uuid/profile.jpg`

---

### Bucket 3: `generated-pdfs`

For storing generated/optimized PDF files.

```sql
-- Create bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-pdfs', 'generated-pdfs', false);

-- RLS Policies
CREATE POLICY "Users can upload own PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'generated-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own PDFs"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'generated-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own PDFs"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'generated-pdfs' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
```

**File path structure:** `{user_id}/{session_id}/optimized_cv.pdf`

---

## Part 3: Helper Functions

### Function: Update timestamp trigger

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON application_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

---

## Part 4: Summary

### Tables (12 total)

| # | Table | Cols | Purpose |
|---|-------|------|---------|
| 1 | `profiles` | 18 | User profiles, subscription info, social links |
| 2 | `documents` | 15 | CVs and Master CVs storage |
| 3 | `profile_photos` | 5 | Profile photos for EU CVs |
| 4 | `application_sessions` | 30 | Job applications with all generated content |
| 5 | `chat_messages` | 7 | Chat history per session |
| 6 | `subscriptions` | 17 | Subscription & Stripe billing |
| 7 | `connected_accounts` | 10 | OAuth connections (Google, LinkedIn, GitHub) |
| 8 | `message_feedback` | 8 | AI response feedback (thumbs up/down) |
| 9 | `subscription_plans` | 17 | Pricing tier definitions |
| 10 | `user_credits` | 10 | User credit balances & reset tracking |
| 11 | `credit_transactions` | 10 | Credit audit trail |
| 12 | `addon_credit_packs` | 10 | Purchasable credit packs |

### Storage Buckets (3 total)

| Bucket | Purpose | Path Structure |
|--------|---------|----------------|
| `cv-files` | Original CV/Master CV files | `{user_id}/{type}/{filename}` |
| `profile-photos` | User profile photos | `{user_id}/profile.{ext}` |
| `generated-pdfs` | Generated optimized PDFs | `{user_id}/{session_id}/optimized_cv.pdf` |

### RLS Policies

All tables and buckets have Row Level Security enabled with policies that:
- Users can only access their own data
- Users can create, read, update, and delete their own records
- No public access to any data

---

## Part 5: Setup Checklist

### Step 1: Create Tables
1. [ ] Create `profiles` table with trigger
2. [ ] Create `documents` table
3. [ ] Create `profile_photos` table
4. [ ] Create `application_sessions` table
5. [ ] Create `chat_messages` table

### Step 2: Create Storage Buckets
1. [ ] Create `cv-files` bucket
2. [ ] Create `profile-photos` bucket
3. [ ] Create `generated-pdfs` bucket

### Step 3: Enable RLS & Create Policies
1. [ ] Enable RLS on all tables
2. [ ] Create SELECT/INSERT/UPDATE/DELETE policies for each table
3. [ ] Create storage policies for each bucket

### Step 4: Create Helper Functions
1. [ ] Create `update_updated_at()` function
2. [ ] Create triggers for updated_at columns
3. [ ] Create `handle_new_user()` function for profile creation

### Step 5: Configure Auth
1. [ ] Enable Email/Password authentication
2. [ ] (Optional) Enable OAuth providers (Google, GitHub)
3. [ ] Configure email templates for verification/reset

---

## Environment Variables Needed

After setup, add these to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Next Steps After Database Setup

1. Install Supabase client: `npm install @supabase/supabase-js`
2. Create Supabase client utility in `/src/lib/supabase.ts`
3. Create auth context/provider for user state
4. Update store to sync with Supabase instead of localStorage
5. Add login/signup pages
6. Migrate existing localStorage data to Supabase on first login

---

## Part 6: Required Schema Updates (NEW TABLES/COLUMNS TO CREATE)

> **⚠️ IMPORTANT:** Run the following SQL statements in your Supabase SQL Editor to add missing columns and features required for full data persistence.

### 6.1 Add Missing Columns to `application_sessions` Table

The existing `application_sessions` table needs additional columns for complete job application tracking:

```sql
-- =====================================================
-- ADD MISSING COLUMNS TO application_sessions TABLE
-- Run this in Supabase SQL Editor
-- =====================================================

-- Add job URL field
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS job_url TEXT;

-- Add company research fields (for storing web search results)
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS company_address TEXT;

ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS company_contact_person TEXT;

-- Add optimized CV text (raw text for easy copying)
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS optimized_cv_text TEXT;

-- Add separate email fields (instead of just JSONB)
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS email_subject TEXT;

ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS email_body TEXT;

-- Add template selection tracking
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS selected_template TEXT DEFAULT 'premium-ats';

-- Add application status tracking
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' 
CHECK (status IN ('draft', 'completed', 'sent', 'interview', 'rejected', 'accepted'));

-- Add cover letter language tracking
ALTER TABLE application_sessions 
ADD COLUMN IF NOT EXISTS cover_letter_language TEXT DEFAULT 'de';

-- Create index on status for filtering
CREATE INDEX IF NOT EXISTS idx_sessions_status ON application_sessions(status);
```

### 6.2 Verify Columns Were Added

After running the above SQL, verify with:

```sql
-- Check all columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'application_sessions'
ORDER BY ordinal_position;
```

### 6.3 Updated `application_sessions` Table Schema (Complete)

After running the migrations, your `application_sessions` table should have this complete schema:

```sql
-- COMPLETE application_sessions TABLE SCHEMA (for reference)
-- This is NOT to run - just shows the expected final state

CREATE TABLE application_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Job info
  job_title TEXT,
  company TEXT,
  job_description TEXT NOT NULL,
  job_url TEXT,                              -- NEW
  
  -- Company research results
  company_address TEXT,                       -- NEW
  company_contact_person TEXT,                -- NEW
  company_research JSONB,
  
  -- Analysis results
  match_score INTEGER CHECK (match_score >= 0 AND match_score <= 100),
  matching_skills TEXT[] DEFAULT '{}',
  missing_skills TEXT[] DEFAULT '{}',
  suggestions TEXT[] DEFAULT '{}',
  requirements JSONB,
  gaps JSONB,
  
  -- Generated CV content
  generated_cv JSONB,
  optimized_cv_text TEXT,                     -- NEW: Raw text for copying
  optimized_pdf_path TEXT,
  
  -- Cover letter
  cover_letter JSONB,
  cover_letter_language TEXT DEFAULT 'de',    -- NEW
  
  -- Email
  email JSONB,
  email_subject TEXT,                         -- NEW
  email_body TEXT,                            -- NEW
  
  -- Template & Status
  selected_template TEXT DEFAULT 'premium-ats', -- NEW
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed', 'sent', 'interview', 'rejected', 'accepted')), -- NEW
  
  -- CV edits tracking
  cv_edits JSONB DEFAULT '[]',
  
  -- Fit assessment (from fit analysis step)
  fit_assessment JSONB,                      -- LIVE: { fitLevel, score, assessment, recommendation, ... }
  generation_completed BOOLEAN DEFAULT false, -- LIVE: Tracks if full generation finished
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Part 7: TypeScript Types Update

After running the SQL migrations, update `src/lib/supabase/types.ts` to include the new fields:

```typescript
// Add to application_sessions Row type:
application_sessions: {
  Row: {
    // ... existing fields ...
    job_url: string | null                    // NEW
    company_address: string | null            // NEW
    company_contact_person: string | null     // NEW
    optimized_cv_text: string | null          // NEW
    email_subject: string | null              // NEW
    email_body: string | null                 // NEW
    selected_template: string                 // NEW
    status: 'draft' | 'completed' | 'sent' | 'interview' | 'rejected' | 'accepted'  // NEW
    cover_letter_language: string             // NEW
  }
  // Update Insert and Update types similarly
}

---

## Part 8: Live Schema Verification (Feb 8, 2026)

> Complete schema exported from live Supabase (`information_schema.columns` across
> all schemas: `auth`, `public`, `storage`, `realtime`, `vault`). ~4500 lines verified.

### All 13 Public Tables — Verified 

| # | Table | Cols | Status |
|---|-------|------|--------|
| 1 | `addon_credit_packs` | 10 |  Matches guide |
| 2 | `application_sessions` | 30 |  Matches guide (includes `fit_assessment`, `generation_completed`) |
| 3 | `chat_messages` | 7 |  Matches guide |
| 4 | `connected_accounts` | 10 |  Matches guide |
| 5 | `contact_submissions` | 7 |  **NEW** (Feb 14, 2026) |
| 6 | `credit_transactions` | 10 |  Guide updated: `amount`/`balance_*` → `NUMERIC(10,2)` |
| 7 | `documents` | 15 |  Matches guide |
| 8 | `message_feedback` | 8 |  Matches guide |
| 9 | `profile_photos` | 5 |  Matches guide |
| 10 | `profiles` | 18 |  Guide updated: added 4 URL columns |
| 11 | `subscription_plans` | 17 |  Matches guide (`price_*` are `NUMERIC(10,2)`) |
| 12 | `subscriptions` | 17 |  Matches guide |
| 13 | `user_credits` | 10 |  Guide updated: credit cols → `NUMERIC(10,2)` |

### `profiles` — 18 Columns (4 new URL columns added to guide)

```
id, email, full_name, phone, location, avatar_url,
subscription_tier (default 'free'), subscription_status (default 'active'),
notify_tips, notify_updates, notify_weekly, notify_marketing,
created_at, updated_at,
linkedin_url, github_url, portfolio_url, website_url  ← NEW in guide
```

### `application_sessions` — 30 Columns Verified 

```
id, user_id, job_title, company, job_description, match_score,
matching_skills, missing_skills, suggestions, requirements, gaps,
generated_cv, cover_letter, email, company_research, cv_edits,
optimized_pdf_path, created_at, updated_at, job_url, company_address,
company_contact_person, optimized_cv_text, email_subject, email_body,
selected_template, status, cover_letter_language, fit_assessment,
generation_completed
```

### `chat_messages` — 7 Columns Verified 

```
id (uuid PK), session_id (uuid NOT NULL → FK to application_sessions),
user_id (uuid NOT NULL), role (text NOT NULL), content (text NOT NULL),
actions (jsonb DEFAULT '[]'), created_at (timestamptz)
```

> **Session isolation is correct at the DB level.** Each chat message has a
> `session_id` NOT NULL foreign key. The session mixing bug was purely
> client-side (localStorage corruption), not a database issue.

### `contact_submissions` — 7 Columns (NEW Feb 14, 2026)

```
id (uuid PK), name (text NOT NULL), email (text NOT NULL),
subject (text NOT NULL), message (text NOT NULL),
submitted_at (timestamptz NOT NULL), created_at (timestamptz)
```

**Purpose:** Stores contact form submissions from the website `/contact` page.

**RLS Policies:**
- Anyone (anon/authenticated) can INSERT (public form)
- Only authenticated users can SELECT (admin view only)

**Indexes:**
- `idx_contact_submissions_submitted_at` on `submitted_at DESC`
- `idx_contact_submissions_email` on `email`

**Migration:** `supabase/migrations/create_contact_submissions.sql`

### Type Corrections Applied to Guide

| Table | Column(s) | Old (guide) | New (live DB) |
|-------|-----------|-------------|---------------|
| `credit_transactions` | `amount`, `balance_before`, `balance_after` | INTEGER | NUMERIC(10,2) |
| `user_credits` | `monthly_credits`, `rollover_credits`, `addon_credits` | INTEGER | NUMERIC(10,2) |
| `subscription_plans` | `price_monthly`, `price_yearly` | DECIMAL(10,2) | NUMERIC(10,2) |

### Other Schemas Present (Supabase-managed, no action needed)

- **`auth`** — 18 tables (users, sessions, identities, mfa_*, oauth_*, etc.)
- **`storage`** — 8 tables (buckets, objects, prefixes, migrations, s3_*, vector_indexes)
- **`realtime`** — 3 tables (messages, schema_migrations, subscription)
- **`vault`** — 1 table (secrets)

### Storage Buckets (Already Created) 
- [x] `cv-files` - Original CV/Master CV files
- [x] `profile-photos` - User profile photos
- [x] `generated-pdfs` - Generated optimized PDFs
