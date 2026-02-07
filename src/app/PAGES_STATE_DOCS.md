# Application Pages - Current State Documentation

**Location:** `/src/app/`  
**Purpose:** Next.js pages for marketing, dashboard, and user-facing features  
**Last Updated:** February 7, 2026 (Pricing Page Redesign v5.2)

## Scroll Animations & UX Improvements (Feb 6, 2026)
- **page.tsx** (homepage): Added ScrollReveal animations to all sections (hero staggered entrance, floating background blobs, staggered card reveals, card-hover-lift effects). Imports `ScrollReveal`, `StaggerChildren`, `CountUp`.
- **about/page.tsx**: Added ScrollReveal to all sections (hero, story, values, stats with CountUp, founder, CTA). Floating CTA decorative blob.
- **pricing/page.tsx**: Added ScrollReveal to all sections (hero, features banner, pricing cards, credits grid, addons, FAQ, time savings, CTA). Card hover lift effects.
- **contact/page.tsx**: Added ScrollReveal to all sections (hero, contact options slide in from left/right, form, CTA). Floating CTA blob.
- **globals.css**: Added marketing animation keyframes (float, floatSlow, pulse-soft, shimmer, scrollLogos) and utility classes (animate-float, animate-float-slow, animate-float-delayed, animate-pulse-soft, card-hover-lift, faq-answer).

## SEO & Brand Update (Feb 6, 2026)
- **layout.tsx**: Full SEO metadata (metadataBase, OpenGraph, Twitter cards, 10 keywords, canonical URLs, robots directives, googleBot config). JSON-LD `SoftwareApplication` schema. Plus Jakarta Sans font added (`--font-plus-jakarta`). KarkoLogo brand favicon (`icon.svg`).
- **robots.ts** (NEW): Crawler directives — allows public pages, blocks private routes. Allows AI crawlers (GPTBot, ClaudeBot, etc.).
- **sitemap.ts** (NEW): 9 public pages with priorities.
- **page.tsx** (homepage): Added per-page metadata with title + description + canonical.
- **about/page.tsx**: Added per-page metadata. Fixed broken founder image (was HEIF, converted to JPEG `wasim-founder.jpg`).
- **pricing/layout.tsx** (NEW): Metadata wrapper for client-side pricing page.
- **contact/layout.tsx** (NEW): Metadata wrapper for client-side contact page.

---

## Overview

The application has 11 main pages: landing page, dashboard, documents management, settings, master CV guide, and 6 marketing pages (about, contact, pricing, privacy, terms, imprint).

---

## Page Inventory

| Page | Path | Type | Lines | Purpose | Status |
|------|------|------|-------|---------|--------|
| Landing | `/page.tsx` | Marketing | ~520 | Homepage with hero, features, Master CV section, CTA | ✅ Redesigned |
| Dashboard | `/dashboard/page.tsx` | App | 209 | Main application interface | ✅ Active |
| Documents | `/documents/page.tsx` | App | 718 | CV/Master CV upload & management | ✅ Active |
| Settings | `/settings/page.tsx` | App | 994 | User profile, account, subscription | ✅ Active |
| Master CV | `/master-cv/page.tsx` | Marketing | ~550 | Master CV creation guide | ✅ Redesigned |
| About | `/about/page.tsx` | Marketing | ~260 | Founder story, values, photo | ✅ Redesigned |
| Pricing | `/pricing/page.tsx` | Marketing | ~470 | Pricing tiers, ROI calculator, FAQ | ✅ Redesigned |
| Contact | `/contact/page.tsx` | Marketing | ~232 | Contact form | ✅ Redesigned (form still simulated) |
| Privacy | `/privacy/page.tsx` | Legal | 151 | Privacy policy | ✅ Active |
| Terms | `/terms/page.tsx` | Legal | ~150 | Terms of service | ✅ Active |
| Imprint | `/imprint/page.tsx` | Legal | ~80 | Legal imprint | ✅ Active |

---

## Detailed Page Analysis

### 1. Landing Page (`/page.tsx`) - ~520 lines ✅ REDESIGNED

**Purpose:** Marketing homepage with hero section, features, and CTAs

**Current State (Post-Redesign):**
- ✅ Hero with "Save 45+ minutes per application" badge (removed fake 4.9/5 rating)
- ✅ Problem/solution comparison
- ✅ "How It Works" 3-step process (Step 1: Upload Master CV, Step 2: mentions fit analysis)
- ✅ Features grid (8 features including Fit Analysis, AI Company Analysis, AI Self-Refinement)
- ✅ Social proof section
- ✅ Pricing preview ($29.99 Plus, $49.99 Pro)
- ✅ **NEW: "What is a Master CV?" section** near bottom with link to /master-cv
- ✅ Final CTA
- ✅ Navbar and Footer components

**Key Changes (Feb 5, 2026):**
1. **Removed** 4.9/5 rating (pre-launch) → replaced with time savings badge
2. **Reframed** "company research" → "AI company analysis from job description" (no web search)
3. **Added** Fit Analysis feature (strong/good/weak fit before generation)
4. **Reframed** "AI Refinement Chat" → "AI Self-Refinement" (auto-iteration)
5. **Changed** "Upload Your CV" → "Upload Your Master CV"
6. **Added** "What is a Master CV?" section near bottom

**Features Grid (8 features):**
- AI Company Analysis (from job description)
- ATS-Optimized Documents
- Fit Analysis (strong/good/weak)
- Hyper-Personalization
- Save 45+ Minutes
- Complete Application Package
- AI Self-Refinement Iterations
- US & EU Templates

---

### 2. Dashboard Page (`/dashboard/page.tsx`) - 209 lines ✅ UI ENHANCED

**Purpose:** Main application interface with CV/Cover Letter/Email panels and chat

**Current State (Post-Redesign):**
- ✅ Authentication required (redirects to login)
- ✅ Resizable chat panel (360-650px) with gold resize handle
- ✅ **Premium tab bar**: White header with shadow, gold active tab indicator, gold-tinted icons
- ✅ **Profile avatar**: Navy gradient with gold ring accent
- ✅ Responsive Documents link (hidden text on small screens)
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

### 5. Master CV Page (`/master-cv/page.tsx`) - ~550 lines ✅ REDESIGNED

**Purpose:** Educational page with Master CV creation prompt for ChatGPT/Claude

**Current State (Post-Redesign):**
- ✅ Gradient hero text with trust badge
- ✅ Redesigned comparison table (Regular CV vs Master CV) with detail descriptions
- ✅ "RECOMMENDED" badge on Master CV card
- ✅ Gold uppercase section labels (Understanding, Benefits, Simple Process, The Prompt, Contents)
- ✅ 3-step process with connecting line
- ✅ Gradient copy button in prompt section
- ✅ Navy gradient CTA matching other pages
- ✅ Consistent py-20 spacing

**Key Features:**
1. **Master CV Prompt** (lines 10-240): Complete prompt for AI assistants
2. **Comparison Table**: Regular CV (✗) vs Master CV (✓) with detail descriptions
3. **Benefits Grid**: 6 cards (Better AI Personalization, Save Hours, Never Miss Achievement, etc.)
4. **Copy Button**: Gradient styled, shows checkmark on success
5. **What's Included**: 12-item checklist of Master CV contents

---

### 6. About Page (`/about/page.tsx`) - ~260 lines ✅ REDESIGNED

**Purpose:** Founder story, company values, and mission

**Current State (Post-Redesign):**
- ✅ Personal founder story: "From Job Seeker to Founder"
- ✅ Timeline: Problem (50+ jobs) → First Attempt (chatbot) → KarKo AI
- ✅ Values grid (4 values: People First, Quality Over Quantity, Honest & Transparent, Constantly Improving)
- ✅ Stats section with honest metrics
- ✅ **NEW: "Meet the Founder" section** with Wasim Jalali photo and quote
- ✅ Navy gradient CTA section

**Key Changes (Feb 5, 2026):**
1. **Rewrote story** with Wasim's personal journey (applying to 50-60 jobs → chatbot → KarKo AI)
2. **Added founder section** with photo (`/Wasim.png`), name, title (Founder & CEO)
3. **Quote**: "From a job seeker, to job seekers"
4. **Reframed** "Agentic, Not Assistive" to remove web research reference

**Founder Photo:** `/public/Wasim.png` (copied from Assets/Wasim.png)

---

### 7. Pricing Page (`/pricing/page.tsx`) - ~750 lines ✅ REDESIGNED v5.2

**Purpose:** Display pricing tiers, features, interactive time savings calculator, and FAQ

**Current State (Post-Redesign v5.2 — Feb 7, 2026):**
- ✅ 3 pricing tiers (Starter, Plus, Pro) with updated free tier (40 credits / 20 apps)
- ✅ Shortened hero subtitle: "Every plan includes the full AI workflow. You just choose your volume."
- ✅ Reordered "Included in Every Plan" bar: ATS Optimized → Fit Analysis → Company Analysis → US & EU Templates → AI Refinement → Agentic AI
- ✅ Restructured feature lists with 3 visual groups (core, differentiators, infrastructure) separated by dividers
- ✅ Outcome-focused feature copy ("Complete application in under 90 seconds", "Skill gap analysis", etc.)
- ✅ "No watermark on any document" added to all tiers
- ✅ Collapsible add-on section inside Plus/Pro cards (removed standalone add-on section)
- ✅ Add-on volume discounts: 30/$7.49, 60/$12.99, 120/$24.99
- ✅ Interactive Time Savings slider (moved up, directly below pricing cards)
- ✅ Animated counters for apps/hours saved with tier selector
- ✅ FAQ section (6 questions)
- ✅ Bottom CTA: "Start with 20 free applications"
- ✅ Stripe checkout integration for Plus/Pro

**Pricing Tiers (Updated Feb 7, 2026):**

| Tier | Price | Credits | Applications | Rollover | Time Saved |
|------|-------|---------|--------------|----------|------------|
| Starter | Free | 40 | 20 | None | ~15 hrs |
| Plus | $29.99/mo | 120 | 60 | 1 month | ~45 hrs |
| Pro | $49.99/mo | 240 | 120 | 2 months | ~90 hrs |

**Add-on Packs (Updated Feb 7, 2026 — volume discounts):**
- Small: 30 credits / 15 apps - $7.49 ($0.25/credit)
- Medium: 60 credits / 30 apps - $12.99 ($0.22/credit)
- Large: 120 credits / 60 apps - $24.99 ($0.21/credit)

**Page Structure (New Order):**
1. Hero (shortened subtitle)
2. "Included in Every Plan" bar (reordered)
3. Pricing cards (grouped features, collapsible add-ons in Plus/Pro)
4. Interactive Time Savings calculator (moved up)
5. How Credits Work
6. FAQ
7. Bottom CTA
8. Footer

**Removed:** Standalone "Need More Credits?" add-on section

---

### 8. Contact Page (`/contact/page.tsx`) - ~232 lines ✅ REDESIGNED

**Purpose:** Contact form for user inquiries

**Current State (Post-Redesign):**
- ✅ Gradient hero text matching design system
- ✅ Larger contact option cards with hover effects
- ✅ Email contact info: hello@karko.ai
- ✅ Live chat placeholder (coming soon, italic)
- ✅ Gradient submit button
- ✅ Navy gradient FAQ/CTA section at bottom linking to /pricing
- ⚠️ **Contact form is still non-functional** (simulated submission)

**Form Fields:**
- Name
- Email
- Subject
- Message

**Leftover Code Issues:**
- 🔴 **Form submission is fake** - Just simulates with setTimeout
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
| Feb 5, 2026 | Complete marketing pages redesign | page.tsx, pricing/page.tsx, about/page.tsx, master-cv/page.tsx, contact/page.tsx | Feature reframing, new pricing, founder story, design system consistency |
| Feb 5, 2026 | Enhanced Navbar and Footer | Navbar.tsx, Footer.tsx | Backdrop blur, gradient CTA, gold section headers, Master CV link, Image component |
| Feb 5, 2026 | Application UI/UX premium redesign | dashboard/page.tsx, ChatPanel.tsx, CVPanel.tsx, CoverLetterPanel.tsx, EmailPanel.tsx, ChatMessage.tsx, AgentProgressV2.tsx, settings/page.tsx | Premium headers, pill toggles, gold accents, consistent design system |
| Feb 5, 2026 | Documents page brand consistency | documents/page.tsx | Navy/gold icon containers, cream borders, profile photo section rebranded from purple to navy/gold |
| Feb 5, 2026 | Hero section text update | page.tsx | Changed "Complete Application" to "Complete Job Application" for clarity |
| Feb 5, 2026 | Settings sub-pages premium styling | ProfileSection.tsx, SubscriptionSection.tsx | Gold focus rings on inputs, rounded-2xl cards, gold progress bar, gold-bordered active plan cards |
| Feb 5, 2026 | Fix double icons in AI response | ChatPanel.tsx | Removed emoji icons from action labels; Lucide icons already rendered by ChatMessage |
| Feb 5, 2026 | CV template selector redesign | TemplateSelector.tsx | Brand-consistent navy gradients, gold selected state, premium recommendation tags |
| Feb 5, 2026 | Fit Analysis API actions | api/agent-v2/route.ts | Added fit_analysis (0.5 credits) and generate_with_context (1.5 credits) actions with server-side context cache |
| Feb 5, 2026 | Credit pricing update | api/agent-v2/route.ts, api/regenerate/route.ts | FULL_APPLICATION 1.5, FIT_ANALYSIS 0.5, CL/email regen 0.5 each |
| Feb 6, 2026 | LLM-based semantic skill matching | unified-writer-agent.ts, models/types.ts | Fixes 0% score on cross-language JDs (German skills vs English CV). New skill_matching task type. |
| Feb 6, 2026 | Anti-hallucination guardrails + language level rules | unified-writer-agent.ts | Zero fabrication policy across CV/CL/email prompts. B2≠verhandlungssicher rule. |
| Feb 6, 2026 | Structured fit assessment format | unified-writer-agent.ts | Markdown with bold headers + bullets, 120 word limit, maxTokens 500 |
| Feb 6, 2026 | Complete chat system prompt rewrite | api/chat/route.ts | XML tags for all sections (identity, current_user_state, response_rules), multi-language support, scope boundaries, brevity enforcement |
| Feb 7, 2026 | Pricing page redesign v5.2 | pricing/page.tsx | Free tier 40 credits/20 apps, shortened subtitle, reordered feature bar, grouped outcome-focused features, interactive time savings slider, collapsible add-ons in cards, removed standalone add-on section, "No watermark" feature added |
| Feb 7, 2026 | Homepage CTA & pricing preview update | page.tsx | "3 applications included" → "20 applications included", "3 free applications to start" → "20 free applications to start" |
| Feb 7, 2026 | About page CTA update | about/page.tsx | "3 free applications" → "20 free applications" |

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
