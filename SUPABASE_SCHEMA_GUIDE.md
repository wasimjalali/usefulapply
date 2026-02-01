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
  updated_at TIMESTAMPTZ DEFAULT NOW()
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

CREATE POLICY "Users can delete own feedback"
  ON message_feedback FOR DELETE
  USING (auth.uid() = user_id);
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

### Tables (7 total)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `profiles` | User profiles | id, email, full_name, phone, location, subscription_tier |
| `documents` | CVs and Master CVs | user_id, type, raw_text, structured_data |
| `profile_photos` | Profile photos for EU CVs | user_id, storage_path |
| `application_sessions` | Job applications | user_id, job_description, generated_cv, cover_letter |
| `chat_messages` | Chat history | session_id, role, content |
| `subscriptions` | Subscription & billing | user_id, tier, status, stripe_customer_id |
| `connected_accounts` | OAuth connections | user_id, provider, provider_user_id |

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
