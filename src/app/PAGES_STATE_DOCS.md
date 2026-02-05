# Application Pages - Current State Documentation

**Location:** `/src/app/`  
**Purpose:** Next.js pages for marketing, dashboard, and user-facing features  
**Last Updated:** February 5, 2026

---

## Overview

The application has 11 main pages: landing page, dashboard, documents management, settings, master CV guide, and 6 marketing pages (about, contact, pricing, privacy, terms, imprint).

---

## Page Inventory

| Page | Path | Type | Lines | Purpose | Status |
|------|------|------|-------|---------|--------|
| Landing | `/page.tsx` | Marketing | 322 | Homepage with hero, features, CTA | ✅ Active |
| Dashboard | `/dashboard/page.tsx` | App | 209 | Main application interface | ✅ Active |
| Documents | `/documents/page.tsx` | App | 718 | CV/Master CV upload & management | ✅ Active |
| Settings | `/settings/page.tsx` | App | 994 | User profile, account, subscription | ✅ Active |
| Master CV | `/master-cv/page.tsx` | Marketing | 530 | Master CV creation guide | ✅ Active |
| About | `/about/page.tsx` | Marketing | 129 | Company story and values | ✅ Active |
| Pricing | `/pricing/page.tsx` | Marketing | 391 | Pricing tiers and FAQ | ✅ Active |
| Contact | `/contact/page.tsx` | Marketing | 214 | Contact form | ⚠️ Non-functional |
| Privacy | `/privacy/page.tsx` | Legal | 151 | Privacy policy | ✅ Active |
| Terms | `/terms/page.tsx` | Legal | ~150 | Terms of service | ✅ Active |
| Imprint | `/imprint/page.tsx` | Legal | ~80 | Legal imprint | ✅ Active |

---

## Detailed Page Analysis

### 1. Landing Page (`/page.tsx`) - 322 lines

**Purpose:** Marketing homepage with hero section, features, and CTAs

**Current State:**
- ✅ Hero section with value proposition
- ✅ Problem/solution comparison
- ✅ "How It Works" 3-step process
- ✅ Features grid (6 features)
- ✅ Social proof section
- ✅ Pricing preview
- ✅ Final CTA
- ✅ Navbar and Footer components

**Key Sections:**
1. **Hero** (lines 12-41): "Job Applications That Actually Get You Interviews"
   - CTA: "Start Free — 3 Applications" ✅ Correct
   - Secondary CTA: "See How It Works"
   
2. **Problem/Solution** (lines 44-95): Before/After comparison
   - Without KarKo: 40+ minutes per application
   - With KarKo: Under 3 minutes

3. **How It Works** (lines 98-146): 3-step process
   - Upload CV → Paste Job → Get Package

4. **Features** (lines 149-201): 6 feature cards
   - Smart Company Research
   - ATS-Optimized
   - Instant Personalization
   - Save 40+ Minutes
   - Complete Package
   - Refine with AI

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Copy correctly shows "3 free applications"

**Recommendations:**
- Consider A/B testing different hero copy
- Add testimonials section if available

---

### 2. Dashboard Page (`/dashboard/page.tsx`) - 209 lines

**Purpose:** Main application interface with CV/Cover Letter/Email panels and chat

**Current State:**
- ✅ Authentication required (redirects to login)
- ✅ Resizable chat panel (360-650px)
- ✅ Tab navigation (CV, Cover Letter, Email)
- ✅ Credit indicator in header
- ✅ Links to Documents and Settings
- ✅ Profile avatar display
- ✅ Supabase sync via `useSupabaseSync` hook
- ✅ Storage cleaner component

**Layout:**
- Left panel: Results (CV/Cover Letter/Email tabs)
- Right panel: Chat (resizable)
- Top bar: Tabs, Credit Indicator, Documents link, Settings/Profile

**Key Features:**
- **Resizable Chat** (lines 30-76): Drag to resize between 360-650px
- **Tab State Management** (lines 20-22): Uses Zustand store
- **Auth Protection** (lines 44-94): Redirects if not authenticated
- **Profile Avatar** (lines 163-174): Shows avatar or User icon

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured with proper hooks order

**Recommendations:**
- Consider adding keyboard shortcuts for tab switching
- Add loading skeleton for initial render

---

### 3. Documents Page (`/documents/page.tsx`) - 718 lines

**Purpose:** Upload and manage CV, Master CV, certifications, and profile photo

**Current State:**
- ✅ Authentication required
- ✅ Primary CV upload with parsing
- ✅ Master CV upload
- ✅ Profile photo upload (for EU CVs)
- ✅ Certifications upload (multiple files)
- ✅ Supabase integration for storage
- ✅ Local store sync
- ✅ Delete functionality for all document types

**Key Features:**
1. **CV Upload** (lines 190-234): 
   - Parses via `/api/parse-cv`
   - Stores both legacy ParsedCV and StructuredCV
   - Uploads to Supabase Storage
   - Saves metadata to database

2. **Master CV Upload** (lines 236-280):
   - Similar flow to primary CV
   - Stores additional fields (allSkills, allExperiences, allEducation)

3. **Profile Photo** (lines 282-330):
   - Image upload for EU CV templates
   - Stored in Supabase Storage `profile-photos` bucket
   - Preview display

4. **Certifications** (lines 332-380):
   - Multiple file upload
   - Stored locally (not in Supabase yet)

**Data Flow:**
```
File Upload → Parse API → Store Locally → Upload to Supabase → Save Metadata
```

**Leftover Code Issues:**
- ⚠️ Lines 135-188: `parseDocument()` function - Large inline function, could be extracted
- ⚠️ Certifications only stored locally, not synced to Supabase
- ⚠️ No error handling for failed Supabase uploads

**Recommendations:**
- Extract `parseDocument()` to `/src/lib/utils/document-parser.ts`
- Implement Supabase sync for certifications
- Add retry logic for failed uploads
- Add upload progress indicators

---

### 4. Settings Page (`/settings/page.tsx`) - 994 lines

**Purpose:** User profile, account management, subscription, and notifications

**Current State:**
- ✅ Authentication required
- ✅ 4 sections: Profile, Account, Subscription, Notifications
- ✅ Profile editing (name, email, phone, location, photo)
- ✅ Avatar upload to Supabase Storage
- ✅ Password change functionality
- ✅ OAuth account connections (Google)
- ✅ Subscription display with credit balance
- ✅ Notification preferences
- ✅ Account deletion

**Sections:**

**4.1 Profile Section:**
- Edit full name, phone, location
- Upload/delete avatar
- Email display (read-only)

**4.2 Account Section:**
- Change password modal
- Connected accounts (Google OAuth)
- Delete account with confirmation

**4.3 Subscription Section:**
- Current plan display (Starter/Plus/Pro)
- Credit balance breakdown (monthly, rollover, addon)
- Upgrade buttons (non-functional - no Stripe integration yet)

**4.4 Notifications Section:**
- Toggle preferences: Tips, Updates, Weekly digest, Marketing
- Saved to profile in Supabase

**Key Functions:**
- `handleSave()` (lines 139-180): Save profile changes
- `handlePhotoUpload()` (lines 182-210): Upload avatar
- `handleDeletePhoto()` (lines 212-230): Delete avatar
- `handlePasswordChange()` (lines 232-270): Change password
- `handleConnectOAuth()` (lines 272-290): Connect OAuth provider
- `handleDisconnect()` (lines 292-310): Disconnect OAuth
- `handleDeleteAccount()` (lines 312-350): Delete account

**Leftover Code Issues:**
- ⚠️ Lines 400-500: Subscription upgrade buttons are UI-only, no Stripe integration
- ⚠️ Lines 600-700: OAuth connection UI exists but callback may not be fully implemented
- ⚠️ Large file (994 lines) - could be split into components

**Recommendations:**
- Split into smaller components: ProfileSection, AccountSection, SubscriptionSection, NotificationsSection
- Implement Stripe checkout for upgrade buttons
- Add loading states for all async operations
- Add success/error toasts for better UX

---

### 5. Master CV Page (`/master-cv/page.tsx`) - 530 lines

**Purpose:** Educational page with Master CV creation prompt for ChatGPT/Claude

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Copy-to-clipboard functionality
- ✅ Comprehensive Master CV prompt (3000+ words)
- ✅ Structured sections guide
- ✅ Professional mindset identification
- ✅ Quantified achievements focus

**Key Features:**
1. **Master CV Prompt** (lines 10-400): Complete prompt for AI assistants
   - 10 sections to cover
   - Emphasis on metrics and numbers
   - Professional mindset identification
   - 5-10 pages output format

2. **Copy Button** (lines 450-480): One-click copy to clipboard
   - Shows checkmark on success
   - Resets after 2 seconds

3. **Why Master CV Section** (lines 500-530): Benefits explanation

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured educational content

**Recommendations:**
- Consider adding example Master CV
- Add video tutorial
- Track copy button usage for analytics

---

### 6. About Page (`/about/page.tsx`) - 129 lines

**Purpose:** Company story, values, and mission

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Company story section
- ✅ Values grid (4 values)
- ✅ Stats section (updated with honest metrics)
- ✅ CTA section

**Stats Section (lines 87-104):**
- ✅ "Hyper-Personalized Applications" (not fake number)
- ✅ "40+ min Saved Per Application" (honest metric)
- ✅ "AI-Powered Precision Matching" (not fake number)

**Values:**
1. People First
2. Quality Over Quantity
3. Honest and Transparent
4. Constantly Improving

**Leftover Code Issues:**
- ✅ No fake statistics (previously had "10,000+ applications" - now removed)
- ✅ Honest, compelling copy

**Recommendations:**
- Add team section if desired
- Add customer testimonials when available

---

### 7. Pricing Page (`/pricing/page.tsx`) - 391 lines

**Purpose:** Display pricing tiers, features, and FAQ

**Current State:**
- ✅ 3 pricing tiers (Starter, Plus, Pro)
- ✅ Credit-based pricing model
- ✅ Add-on credit packs
- ✅ Feature comparison table
- ✅ FAQ section (6 questions)
- ✅ Expandable FAQ items

**Pricing Tiers:**

| Tier | Price | Credits | Applications | Rollover |
|------|-------|---------|--------------|----------|
| Starter | Free | 6 | 3 | None |
| Plus | $19.99/mo | 120 | 60 | 1 month |
| Pro | $39.99/mo | 240 | 120 | 2 months |

**Add-on Packs:**
- Small: 30 credits / 15 apps - $4.99
- Medium: 60 credits / 30 apps - $9.99 (Best Value)
- Large: 120 credits / 60 apps - $19.99 (Most Popular)

**Leftover Code Issues:**
- ⚠️ Lines 200-250: CTA buttons link to `/auth/signup` but don't specify tier
- ⚠️ No Stripe integration for paid plans

**Recommendations:**
- Add tier parameter to signup links: `/auth/signup?tier=plus`
- Implement Stripe checkout flow
- Add annual pricing option
- Add "Most Popular" badge to Plus tier

---

### 8. Contact Page (`/contact/page.tsx`) - 214 lines ⚠️

**Purpose:** Contact form for user inquiries

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Email contact info: hello@karko.ai
- ✅ Live chat placeholder (coming soon)
- ⚠️ **Contact form is non-functional** (simulated submission)

**Form Fields:**
- Name
- Email
- Subject
- Message

**Leftover Code Issues:**
- 🔴 **Lines 19-28: Form submission is fake** - Just simulates with setTimeout
- 🔴 **No actual email sending** - Form doesn't send emails
- ⚠️ No form validation beyond HTML5 required

**Recommendations:**
- Implement actual email sending (SendGrid, Resend, or similar)
- Add form validation (email format, message length)
- Add CAPTCHA to prevent spam
- Store submissions in Supabase for tracking

---

### 9. Privacy Page (`/privacy/page.tsx`) - 151 lines

**Purpose:** Privacy policy and data handling information

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Comprehensive privacy policy
- ✅ GDPR-compliant sections
- ✅ Clear data usage explanation

**Sections:**
1. Introduction
2. Data We Collect (Account, Application, Technical)
3. How We Use Your Data (Core Service, AI Processing, Improvement)
4. Data Storage and Security
5. Your Rights (Access, Delete, Export, Withdraw)
6. Data Retention
7. Third-Party Services (AI providers)
8. Contact Information

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Legally compliant content

**Recommendations:**
- Review with legal counsel
- Update as features change
- Add cookie policy if using cookies

---

### 10. Terms Page (`/terms/page.tsx`) - ~150 lines

**Purpose:** Terms of service

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Standard terms of service
- ✅ Usage restrictions
- ✅ Liability limitations

**Leftover Code Issues:**
- ✅ Standard legal content

**Recommendations:**
- Review with legal counsel
- Update as features change

---

### 11. Imprint Page (`/imprint/page.tsx`) - ~80 lines

**Purpose:** Legal imprint (required in EU)

**Current State:**
- ✅ Marketing page with Navbar/Footer
- ✅ Company information
- ✅ Contact details
- ✅ Legal representatives

**Leftover Code Issues:**
- ✅ Standard legal content

**Recommendations:**
- Ensure information is current
- Required for EU compliance

---

## Common Patterns Across Pages

### Authentication Flow
All app pages (dashboard, documents, settings) use:
```typescript
const { user, isLoading } = useAuth();

useEffect(() => {
  if (!isLoading && !user) {
    router.push('/auth/login');
  }
}, [isLoading, user, router]);
```

### Loading States
```typescript
if (isLoading) {
  return <Loader2 className="w-8 h-8 animate-spin text-navy-600" />;
}
```

### Design System
- Background: `bg-cream-100`
- Primary color: Navy (`navy-600`)
- Accent: Gold (`gold-400`, `gold-500`)
- Secondary: Sage (`sage-500`)
- Text: Charcoal (dark), Warm Gray (secondary)

---

## Cleanup Tasks

### High Priority
1. **Implement contact form email sending** (contact page lines 19-28)
2. **Add Stripe integration for pricing page** (pricing page CTAs)
3. **Split settings page into components** (994 lines is too large)

### Medium Priority
4. **Extract parseDocument() from documents page** to utility
5. **Implement Supabase sync for certifications** (documents page)
6. **Add tier parameter to pricing CTAs** (e.g., `/auth/signup?tier=plus`)
7. **Implement OAuth callback handling** (settings page)

### Low Priority
8. Add upload progress indicators (documents page)
9. Add retry logic for failed uploads (documents page)
10. Add keyboard shortcuts (dashboard page)
11. Add loading skeletons (dashboard page)
12. Add testimonials section (landing page)

---

## Change Log

| Date | Change | Files Modified | Reason |
|------|--------|----------------|--------|
| Feb 3, 2026 | Updated stats on about page | about/page.tsx | Removed fake statistics |
| - | - | - | - |

---

## Testing Checklist

### Landing Page
- [ ] Hero CTA redirects to signup
- [ ] "See How It Works" scrolls to section
- [ ] All feature cards display correctly
- [ ] Responsive on mobile

### Dashboard
- [ ] Auth redirect works
- [ ] Tab switching works
- [ ] Chat panel resizing works
- [ ] Credit indicator displays correctly
- [ ] Profile avatar displays

### Documents
- [ ] CV upload and parsing works
- [ ] Master CV upload works
- [ ] Profile photo upload works
- [ ] Certifications upload works
- [ ] Delete functionality works
- [ ] Supabase sync works

### Settings
- [ ] Profile editing saves correctly
- [ ] Avatar upload works
- [ ] Password change works
- [ ] OAuth connection works
- [ ] Notification preferences save
- [ ] Account deletion works

### Pricing
- [ ] All tiers display correctly
- [ ] FAQ expand/collapse works
- [ ] CTA buttons work

### Contact
- [ ] Form validation works
- [ ] Email sending works (when implemented)
- [ ] Success message displays

---

## Notes for AI Agents

When working with pages:
1. **Always check authentication** on app pages
2. **Use consistent design system** colors and spacing
3. **Handle loading states** properly
4. **Show error messages** clearly
5. **Redirect after auth actions** (login → dashboard)
6. **Keep marketing pages simple** and fast
7. **Split large files** into components when > 500 lines
8. **Test responsive design** on mobile
