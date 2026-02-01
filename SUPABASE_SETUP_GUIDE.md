# Supabase Setup Guide for Job Copilot

This guide walks you through setting up advanced features in Supabase that require dashboard configuration.

---

## Table of Contents

1. [OAuth Authentication (Google & LinkedIn)](#1-oauth-authentication-google--linkedin)
2. [Two-Factor Authentication (2FA/MFA)](#2-two-factor-authentication-2famfa)
3. [Stripe Integration for Subscriptions](#3-stripe-integration-for-subscriptions)
4. [Storage Buckets Verification](#4-storage-buckets-verification)
5. [Code Changes After Setup](#5-code-changes-after-setup)

---

## 1. OAuth Authentication (Google & LinkedIn)

### 1.1 Google OAuth Setup

#### Step 1: Create Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. Select **Web application**
6. Add these authorized redirect URIs:
   ```
   https://YOUR_SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback
   ```
   Replace `YOUR_SUPABASE_PROJECT_ID` with your actual Supabase project ID (found in Project Settings → General)

7. Copy the **Client ID** and **Client Secret**

#### Step 2: Configure in Supabase

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **Google** and click to expand
5. Toggle **Enable Sign in with Google** to ON
6. Paste your **Client ID** and **Client Secret**
7. Click **Save**

---

### 1.2 LinkedIn OAuth Setup

#### Step 1: Create LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Click **Create App**
3. Fill in the required information:
   - App name: `Job Copilot`
   - LinkedIn Page: Create or select one
   - App logo: Upload your logo
4. After creation, go to the **Auth** tab
5. Add this redirect URL:
   ```
   https://YOUR_SUPABASE_PROJECT_ID.supabase.co/auth/v1/callback
   ```
6. Under **Products**, request access to:
   - **Sign In with LinkedIn using OpenID Connect**
7. Copy the **Client ID** and **Client Secret**

#### Step 2: Configure in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **LinkedIn (OIDC)** and click to expand
4. Toggle **Enable Sign in with LinkedIn** to ON
5. Paste your **Client ID** and **Client Secret**
6. Click **Save**

---

### 1.3 After OAuth Setup - Tell Me To:

Once you've completed the OAuth setup in both Google and Supabase dashboards, tell me:

> "OAuth is configured for Google and LinkedIn. Please verify the code is correctly handling the OAuth callback."

I will then verify:
- The `/auth/callback` route handles OAuth redirects
- Connected accounts are saved to the `connected_accounts` table
- The settings page correctly shows connection status

---

## 2. Two-Factor Authentication (2FA/MFA)

### 2.1 Enable MFA in Supabase

#### Step 1: Enable MFA in Dashboard

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Authentication** → **Policies**
4. Scroll to **Multi-Factor Authentication**
5. Toggle **Enable MFA** to ON
6. Choose the MFA methods to allow:
   - ✅ **TOTP** (Time-based One-Time Password) - Recommended
   - This works with apps like Google Authenticator, Authy, 1Password

#### Step 2: Configure MFA Settings

1. Set **MFA Enrollment**: Choose one of:
   - `optional` - Users can choose to enable MFA
   - `required` - All users must enable MFA (not recommended initially)
2. Click **Save**

---

### 2.2 After MFA Setup - Tell Me To:

Once MFA is enabled in Supabase, tell me:

> "MFA is enabled in Supabase. Please add 2FA enrollment and verification to the settings page."

I will then add:
- QR code generation for TOTP enrollment
- Verification code input
- MFA challenge during login
- Disable MFA option

---

## 3. Stripe Integration for Subscriptions

### 3.1 Create Stripe Account

1. Go to [Stripe Dashboard](https://dashboard.stripe.com/)
2. Create an account or sign in
3. Complete your business profile

### 3.2 Create Products and Prices

#### Step 1: Create Products

1. Go to **Products** → **Add Product**
2. Create these products:

**Pro Plan:**
- Name: `Pro Plan`
- Description: `Unlimited applications and premium features`
- Pricing: `$19/month` (recurring)
- Copy the **Price ID** (starts with `price_`)

**Enterprise Plan:**
- Name: `Enterprise Plan`
- Description: `Custom solutions for teams`
- Pricing: Custom (contact sales)

#### Step 2: Get API Keys

1. Go to **Developers** → **API Keys**
2. Copy:
   - **Publishable key** (starts with `pk_`)
   - **Secret key** (starts with `sk_`)

### 3.3 Set Up Webhooks

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Enter your webhook URL:
   ```
   https://your-app-domain.com/api/webhooks/stripe
   ```
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
5. Copy the **Webhook signing secret** (starts with `whsec_`)

### 3.4 Add Environment Variables

Add these to your `.env.local`:

```env
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRO_PRICE_ID=price_xxxxx
```

---

### 3.5 After Stripe Setup - Tell Me To:

Once you've completed Stripe setup, tell me:

> "Stripe is configured with products and webhooks. Please add the checkout flow and webhook handler."

I will then create:
- `/api/checkout` - Creates Stripe checkout session
- `/api/webhooks/stripe` - Handles subscription events
- Update subscription in database on payment
- Upgrade button functionality

---

## 4. Storage Buckets Verification

### 4.1 Required Buckets

Your app uses these storage buckets:

| Bucket | Purpose | Code Location | Status |
|--------|---------|---------------|--------|
| `avatars` | User profile photos | `src/lib/supabase/storage.ts` | ✅ Connected |
| `cv-files` | Uploaded CV/resume files | `src/lib/supabase/documents.ts` | ✅ Connected |
| `profile-photos` | EU CV template photos | Not yet integrated | ⚠️ Optional |
| `generated-pdfs` | Generated optimized PDFs | Uses Vercel Blob currently | ⚠️ Optional |

**Note:** The `generated-pdfs` bucket is defined in the schema but the app currently uses Vercel Blob (`@vercel/blob`) for PDF storage. This works fine for Vercel deployments. If you want to migrate to Supabase Storage, let me know.

### 4.2 Verify Buckets Exist

1. Go to Supabase Dashboard → **Storage**
2. Verify these buckets exist:
   - `avatars` (public: true)
   - `cv-files` (public: false)
   - `profile-photos` (public: false)
   - `generated-pdfs` (public: false)

### 4.3 Create Missing Buckets

If any bucket is missing, create it:

1. Click **New bucket**
2. Enter the bucket name
3. Set **Public bucket** based on table above
4. Click **Create bucket**

### 4.4 Verify RLS Policies

For each bucket, ensure RLS policies are set:

```sql
-- For cv-files bucket
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

Repeat similar policies for `profile-photos` and `generated-pdfs`.

---

## 5. Code Changes After Setup

### 5.1 Current Integration Status

| Feature | Frontend | Backend | Database |
|---------|----------|---------|----------|
| Profile | ✅ | ✅ | ✅ `profiles` |
| Documents | ✅ | ✅ | ✅ `documents` + `cv-files` |
| Sessions | ✅ | ✅ | ✅ `application_sessions` |
| Chat | ✅ | ✅ | ✅ `chat_messages` |
| Avatar Upload | ✅ | ✅ | ✅ `avatars` bucket |
| Password Change | ✅ | ✅ | ✅ Supabase Auth |
| OAuth Connect | ✅ | ⚠️ Needs callback | ✅ `connected_accounts` |
| Subscription Display | ✅ | ✅ | ✅ `subscriptions` |
| Subscription Upgrade | ⚠️ UI only | ❌ Needs Stripe | ✅ `subscriptions` |
| 2FA | ⚠️ UI only | ❌ Needs MFA | ✅ Supabase Auth |
| Notifications | ✅ | ✅ | ✅ `profiles` |

### 5.2 What I Need From You

After completing each setup section, tell me:

1. **For OAuth**: "OAuth is configured. Add callback handling."
2. **For 2FA**: "MFA is enabled. Add 2FA to settings."
3. **For Stripe**: "Stripe is configured. Add checkout and webhooks."

---

## Quick Checklist

- [ ] Google OAuth configured in Google Cloud Console
- [ ] Google OAuth enabled in Supabase
- [ ] LinkedIn app created with OIDC access
- [ ] LinkedIn OAuth enabled in Supabase
- [ ] MFA enabled in Supabase Authentication settings
- [ ] Stripe account created
- [ ] Stripe products (Pro, Enterprise) created
- [ ] Stripe webhook endpoint configured
- [ ] Environment variables added to `.env.local`
- [ ] All storage buckets created with RLS policies

---

## Troubleshooting

### OAuth Not Working
- Verify redirect URI matches exactly (including trailing slashes)
- Check that the provider is enabled in Supabase
- Ensure Client ID and Secret are correct

### MFA Not Working
- Verify MFA is enabled in Supabase dashboard
- Check that TOTP is selected as an allowed method
- Ensure user has enrolled in MFA before requiring it

### Stripe Webhooks Not Receiving
- Verify webhook URL is publicly accessible
- Check webhook signing secret is correct
- View webhook logs in Stripe dashboard for errors

---

*Last Updated: February 2026*
