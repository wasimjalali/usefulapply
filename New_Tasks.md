Part one_ 
# Karko AI — Easy Problems Implementation Guide

**Date:** February 3, 2026  
**Priority:** HIGH — Complete all tasks before moving to hard problems  
**Time Estimate:** 2-3 hours for a senior developer

---

## Overview

This document contains straightforward fixes that do not require architectural changes. Each task has clear requirements and verification steps. Complete them in order.

---

## Task 1: Update Pricing Copy (Landing Page)

### Problem
The landing page still references the old pricing model: "Start with 5 free applications"

### Requirements
Change ALL instances to: **"Start with 3 free applications"**

### Files to Search
```bash
# Search all frontend files for "5 free" or "five free"
grep -rn "5 free\|five free\|5 Free\|Five Free" src/
grep -rn "5 free\|five free" app/
grep -rn "5 free\|five free" components/
```

### Specific Locations to Check
- Landing page hero section
- Pricing section/component
- CTA buttons and banners
- Footer (if applicable)
- Any modal or popup content
- Meta descriptions (SEO)

### Verification
- [ ] Landing page shows "3 free applications"
- [ ] No instances of "5 free" remain in codebase
- [ ] Pricing section reflects correct free tier

---

## Task 2: Update About Page Statistics

### Problem
The About page shows fake/placeholder statistics that are dishonest for a pre-launch product:
- "10,000+ applications created" ❌
- "4.9 user rating" ❌
- "40+ minutes saved per application" ✅ (Keep this)

### Requirements
Replace with honest, compelling alternatives:

| Current (Remove) | Replace With |
|------------------|--------------|
| 10,000+ applications created | Hyper-personalized applications |
| 4.9 user rating | More interviews, less effort |
| 40+ minutes saved | 40+ minutes saved (KEEP) |

### Alternative Copy Options
Pick the most compelling combination:

**Option A (Recommended):**
- "Hyper-personalized applications"
- "40+ minutes saved per application"
- "AI-powered precision matching"

**Option B:**
- "One CV, infinite possibilities"
- "40+ minutes saved per application"
- "Smart job matching"

### Files to Search
```bash
grep -rn "10,000\|10000\|4\.9\|4.9 user" src/
grep -rn "applications created" src/
```

### Verification
- [ ] No fake statistics remain
- [ ] "40+ minutes saved" is preserved
- [ ] New copy is compelling but honest

---

## Task 3: Remove "Join X+ Job Seekers" Claims

### Problem
Multiple places claim "Join 10,000+ job seekers" or "Join 1,000+ job seekers" — dishonest for pre-launch.

### Requirements
Replace ALL such claims with honest alternatives:

| Current (Remove) | Replace With |
|------------------|--------------|
| Join 10,000+ job seekers | Join thousands of job seekers |
| Join 1,000+ job seekers | Join ambitious job seekers |
| Used by X+ professionals | Trusted by professionals |

**Better Alternatives (Pre-Launch Friendly):**
- "Join the future of job applications"
- "Be among the first to experience AI-powered applications"
- "Start your smarter job search today"
- "Join ambitious professionals worldwide"

### Files to Search
```bash
grep -rn "join.*job seekers\|Join.*job seekers" src/ -i
grep -rn "10,000\|1,000\|1000\|10000" src/
grep -rn "used by.*professionals\|trusted by.*users" src/ -i
```

### Verification
- [ ] No specific user counts remain
- [ ] All social proof is honest/aspirational
- [ ] Copy still feels compelling

---

## Task 4: Create Legal Pages

### Requirements
Create three new pages:
1. **Privacy Policy** (`/privacy`)
2. **Terms of Service** (`/terms`)
3. **Imprint** (`/imprint`)

### Company Information for Imprint
```
Company Name: ISRAR Group LLC
Address: 30 N Gould St Ste N
         Sheridan, WY 82801
         USA

Email: contact@karko.ai (or appropriate generic email)
```

### Privacy Policy — Key Sections Required

```markdown
# Privacy Policy

Last Updated: February 3, 2026

## 1. Introduction
Karko AI ("we", "us", "our") operates an AI-powered job application platform. 
This policy explains how we collect, use, and protect your personal data.

## 2. Data We Collect

### 2.1 Account Information
- Email address
- Password (encrypted)
- Name

### 2.2 Application Data
- CV/Resume content
- Job descriptions you submit
- Generated cover letters and emails
- Application history

### 2.3 Technical Data
- IP address
- Browser type
- Device information
- Usage analytics

## 3. How We Use Your Data

### 3.1 Core Service
- Generate personalized CVs, cover letters, and emails
- Store your application history
- Improve AI matching accuracy

### 3.2 AI Processing
- Your CV and job descriptions are processed by AI models (Claude, GPT)
- We do NOT sell your data to third parties
- AI providers may process data per their terms (see Section 7)

### 3.3 Service Improvement
- Aggregate analytics (anonymized)
- Bug fixing and performance optimization

## 4. Data Storage and Security
- Data stored in Supabase (encrypted at rest)
- HTTPS encryption for all transfers
- Regular security audits

## 5. Your Rights
- Access your data
- Delete your account and all data
- Export your data
- Withdraw consent

## 6. Data Retention
- Active accounts: Data retained while account exists
- Deleted accounts: Data permanently removed within 30 days
- Backups: Purged within 90 days

## 7. Third-Party Services
- Supabase (database)
- Anthropic Claude API (AI processing)
- OpenAI API (AI processing)
- Stripe (payments, if applicable)

## 8. Cookies
- Essential cookies for authentication
- Analytics cookies (opt-out available)

## 9. Children's Privacy
Service not intended for users under 16.

## 10. Changes to This Policy
We will notify users of material changes via email.

## 11. Contact
Email: privacy@karko.ai
Address: ISRAR Group LLC, 30 N Gould St Ste N, Sheridan, WY 82801, USA
```

### Terms of Service — Key Sections Required

```markdown
# Terms of Service

Last Updated: February 3, 2026

## 1. Acceptance of Terms
By using Karko AI, you agree to these terms.

## 2. Service Description
Karko AI is an AI-powered platform that helps generate:
- Optimized CVs/Resumes
- Cover letters
- Application emails

## 3. User Responsibilities
- Provide accurate information
- Do not submit false credentials
- You own your original CV content
- You are responsible for reviewing AI-generated content

## 4. AI-Generated Content
- AI suggestions are aids, not guarantees
- Review all content before submitting to employers
- We are not responsible for hiring outcomes
- AI may occasionally produce errors — always verify

## 5. Intellectual Property
- You retain ownership of your CV content
- We retain rights to our AI models and platform
- You grant us license to process your data for the service

## 6. Prohibited Use
- Fraudulent applications
- Fake credentials or qualifications
- Automated scraping or abuse
- Sharing accounts

## 7. Account Termination
We may terminate accounts that violate these terms.

## 8. Limitation of Liability
- Service provided "as is"
- Not liable for hiring decisions
- Maximum liability limited to fees paid

## 9. Dispute Resolution
Governed by laws of Wyoming, USA.

## 10. Changes to Terms
30-day notice for material changes.

## 11. Contact
Email: legal@karko.ai
Address: ISRAR Group LLC, 30 N Gould St Ste N, Sheridan, WY 82801, USA
```

### Imprint Page

```markdown
# Imprint (Impressum)

## Company Information

**ISRAR Group LLC**

30 N Gould St Ste N  
Sheridan, WY 82801  
USA

## Contact

Email: contact@karko.ai

## Responsible for Content
ISRAR Group LLC

## Disclaimer
The content on this website is provided for informational purposes. 
We strive for accuracy but cannot guarantee error-free content.

## Copyright
© 2026 ISRAR Group LLC. All rights reserved.
```

### Implementation Steps
1. Create `/app/privacy/page.tsx` (or equivalent route)
2. Create `/app/terms/page.tsx`
3. Create `/app/imprint/page.tsx`
4. Add links to footer
5. Add links to signup/login flow (checkbox: "I agree to Terms and Privacy Policy")

### Verification
- [ ] `/privacy` page loads correctly
- [ ] `/terms` page loads correctly
- [ ] `/imprint` page loads correctly
- [ ] Footer links work
- [ ] Company address is correct

---

## Task 5: Fix SQL for Add-on Credit Packs

### Problem
The SQL update fails because `updated_at` column doesn't exist in `addon_credit_packs` table.

### Error
```
ERROR: 42703: column "updated_at" of relation "addon_credit_packs" does not exist
```

### Corrected SQL

```sql
-- First, check the actual table structure
-- Run this to see columns:
-- SELECT column_name FROM information_schema.columns WHERE table_name = 'addon_credit_packs';

-- Update add-on packs (without updated_at)
-- Small Pack: 30 credits / $4.99
UPDATE addon_credit_packs 
SET 
  credits = 30,
  price = 4.99
WHERE name = 'Small Pack';

-- Medium Pack: 60 credits / $9.99
UPDATE addon_credit_packs 
SET 
  credits = 60,
  price = 9.99,
  discount_percent = 0
WHERE name = 'Medium Pack';

-- Large Pack: 120 credits / $19.99
UPDATE addon_credit_packs 
SET 
  credits = 120,
  price = 19.99,
  discount_percent = 0
WHERE name = 'Large Pack';

-- If packs don't exist, insert them
INSERT INTO addon_credit_packs (name, credits, price, discount_percent, display_order)
VALUES 
  ('Small Pack', 30, 4.99, 0, 1),
  ('Medium Pack', 60, 9.99, 0, 2),
  ('Large Pack', 120, 19.99, 0, 3)
ON CONFLICT (name) DO UPDATE SET
  credits = EXCLUDED.credits,
  price = EXCLUDED.price,
  discount_percent = EXCLUDED.discount_percent,
  display_order = EXCLUDED.display_order;
```

### Alternative: Add the column if needed
```sql
-- If you want the updated_at column, add it first:
ALTER TABLE addon_credit_packs 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Then run the original UPDATE statements
```

### Verification
- [ ] SQL executes without error
- [ ] Credit packs show correct values in dashboard

---

## Task 6: Fix Profile Photo Upload (Documents Page)

### Problem
When uploading a photo in the Documents page, it's not being saved correctly to Supabase storage. The photo doesn't persist and doesn't appear in the German CV template.

### Investigation Steps

**Step 1: Check if bucket exists**
```sql
-- Run in Supabase SQL Editor
SELECT * FROM storage.buckets WHERE name LIKE '%photo%' OR name LIKE '%avatar%' OR name LIKE '%profile%';
```

**Step 2: Check files in SUPABASE_SCHEMA_GUIDE.md and SUPABASE_MIGRATION_PLAN.md**
Look for:
- Bucket names for user uploads
- RLS policies for storage
- Photo/avatar column in user profiles table

**Step 3: Check frontend upload code**
```bash
# Find photo upload component
grep -rn "photo\|avatar\|profile.*image" src/components/
grep -rn "storage.from\|upload" src/
```

### Common Issues and Fixes

**Issue A: Bucket doesn't exist**
```sql
-- Create bucket for profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true);

-- Set RLS policy
CREATE POLICY "Users can upload their own photo"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own photo"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own photo"
ON storage.objects FOR DELETE
USING (bucket_id = 'profile-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
```

**Issue B: Photo URL not saved to user profile**
```sql
-- Check if photo_url column exists
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'profiles' OR table_name = 'users';

-- Add if missing
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS photo_url TEXT;
```

**Issue C: Frontend not connecting to German template**
The German template (`Deutsch mit Foto`) must:
1. Fetch `photo_url` from user profile
2. Display image in template
3. Handle missing photo gracefully

### Files to Check
- `SUPABASE_SCHEMA_GUIDE.md`
- `SUPABASE_MIGRATION_PLAN.md`
- Components related to document upload
- German CV template component

### Verification
- [ ] Photo uploads successfully
- [ ] Photo persists after page refresh
- [ ] Photo appears in German CV template
- [ ] Photo URL saved to database

---

## Task 7: Fix Application History Persistence

### Problem
The "Recent Applications" panel (shown in KarKo AI chat sidebar) only saves to browser localStorage, not to Supabase. When opening in another browser, history is empty.

### Evidence from Screenshot
The Recent Applications panel shows multiple "1Q Health Group" entries dated 2/3/2026, but these likely exist only in browser storage.

### Investigation Steps

**Step 1: Check current implementation**
```bash
# Find where application history is stored
grep -rn "localStorage\|sessionStorage" src/
grep -rn "recent.*application\|application.*history" src/
```

**Step 2: Check Supabase tables**
```sql
-- Check if applications table exists
SELECT * FROM information_schema.tables 
WHERE table_name LIKE '%application%' OR table_name LIKE '%history%';

-- Check table structure
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'applications';
```

### Required Table Structure
```sql
-- If table doesn't exist, create it:
CREATE TABLE IF NOT EXISTS job_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  job_title TEXT,
  job_description TEXT,
  optimized_cv JSONB,
  cover_letter TEXT,
  email_content TEXT,
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own applications
CREATE POLICY "Users can view own applications"
ON job_applications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own applications"
ON job_applications FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own applications"
ON job_applications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own applications"
ON job_applications FOR DELETE
USING (auth.uid() = user_id);
```

### Frontend Changes Required
1. When application is created/saved, INSERT into `job_applications` table
2. On component mount, SELECT from `job_applications` WHERE `user_id = current_user`
3. Display in Recent Applications sidebar

### Check These Files
- `SUPABASE_SCHEMA_GUIDE.md` — Look for applications table
- Chat panel component — Find where history is rendered
- Application submission logic — Find where data is saved

### Verification
- [ ] Applications save to Supabase
- [ ] History loads from Supabase on mount
- [ ] History visible in different browser (same account)
- [ ] History cleared when account deleted

---

## Task 8: Connect Delete Account Button to Backend

### Problem
The Delete Account button in Settings (Danger Zone section) may be hardcoded/non-functional.

### Investigation
```bash
# Find delete account component
grep -rn "delete.*account\|Delete.*Account" src/
grep -rn "danger.*zone\|Danger.*Zone" src/
```

### Required Implementation

**Frontend:**
```typescript
const handleDeleteAccount = async () => {
  // 1. Confirm with user (are you sure?)
  const confirmed = window.confirm(
    "Are you sure you want to delete your account? This action cannot be undone."
  );
  if (!confirmed) return;

  // 2. Double confirm (type "DELETE" to confirm)
  const typedConfirm = window.prompt('Type "DELETE" to confirm account deletion:');
  if (typedConfirm !== "DELETE") return;

  // 3. Call Supabase to delete
  try {
    // Delete user data from all tables first
    await supabase.from('job_applications').delete().eq('user_id', user.id);
    await supabase.from('profiles').delete().eq('id', user.id);
    // Delete storage files
    await supabase.storage.from('profile-photos').remove([`${user.id}/*`]);
    
    // Finally delete auth user
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    // OR for client-side: await supabase.rpc('delete_user');
    
    if (error) throw error;
    
    // Sign out and redirect
    await supabase.auth.signOut();
    router.push('/');
  } catch (error) {
    console.error('Error deleting account:', error);
    alert('Failed to delete account. Please contact support.');
  }
};
```

**Backend (if using RPC for deletion):**
```sql
-- Create function for user self-deletion
CREATE OR REPLACE FUNCTION delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete from related tables first
  DELETE FROM job_applications WHERE user_id = auth.uid();
  DELETE FROM profiles WHERE id = auth.uid();
  
  -- Delete storage objects (profile photos, etc.)
  DELETE FROM storage.objects 
  WHERE bucket_id = 'profile-photos' 
  AND (storage.foldername(name))[1] = auth.uid()::text;
  
  -- Delete the auth user
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;
```

### Verification
- [ ] Delete button triggers confirmation dialog
- [ ] User data deleted from all tables
- [ ] Storage files deleted
- [ ] User signed out after deletion
- [ ] User cannot log back in

---

## Verification Report Template

After completing all tasks, create this report:

```markdown
# Karko AI Easy Problems — Completion Report

Date: [DATE]
Developer: [NAME]

## Task 1: Pricing Copy
- [x] Changed to "3 free applications"
- Files modified: [LIST]
- Tested: [YES/NO]

## Task 2: About Page Statistics
- [x] Removed fake statistics
- New copy: [WHAT YOU USED]
- Tested: [YES/NO]

## Task 3: Social Proof Claims
- [x] Removed specific user counts
- Files modified: [LIST]
- Tested: [YES/NO]

## Task 4: Legal Pages
- [x] Privacy Policy created at /privacy
- [x] Terms of Service created at /terms
- [x] Imprint created at /imprint
- [x] Footer links added
- Tested: [YES/NO]

## Task 5: SQL Fix
- [x] Credit packs SQL executed
- Verified in Supabase: [YES/NO]

## Task 6: Photo Upload
- [x] Bucket exists/created
- [x] Upload works
- [x] German template displays photo
- Tested: [YES/NO]

## Task 7: Application History
- [x] Saves to Supabase
- [x] Loads from Supabase
- [x] Works across browsers
- Tested: [YES/NO]

## Task 8: Delete Account
- [x] Connected to backend
- [x] Confirmation flow works
- [x] Data actually deleted
- Tested: [YES/NO]

## Notes
[Any issues encountered, workarounds, or follow-up needed]
```

---

## Priority Order

1. **Task 5** (SQL Fix) — Quick win, unblocks pricing
2. **Task 1-3** (Copy changes) — Quick wins, honest messaging
3. **Task 4** (Legal pages) — Important for compliance
4. **Task 7** (History persistence) — Core functionality
5. **Task 6** (Photo upload) — Feature completion
6. **Task 8** (Delete account) — Compliance requirement

---

## End of Easy Problems Guide

Part Two answer to these questions:
and share your expert reccomendation for and feedback about the suggestions that made here by keeping the codebase in mind check all the areas correctly. 
and do not implement anything in this part two until we confirm everything with the engineer. 

# Karko AI — Hard Problems Analysis & Discussion

**Date:** February 3, 2026  
**Status:** DISCUSSION REQUIRED — Do not implement until we agree on approach  
**Purpose:** Analyze root causes and propose solutions for complex issues

---

## Executive Summary

There are three interconnected hard problems:

1. **CV Template Rendering** — AI generates correct content, but templates don't display it
2. **Template Architecture** — Hardcoded sections prevent dynamic ordering and formatting
3. **Cover Letter Web Search** — What should we actually search for and include?

All three require architectural decisions before implementation.

---

## Hard Problem 1: CV Template Rendering Failure

### The Symptom

Looking at your screenshots:
- **Original CV** (Image 4): Renders completely with all sections visible
- **Optimized CV** (Image 5): Shows "Empathy Space nothing is showing. not redered." — critical sections missing
- **Changes Made** (Image 6): Shows 7 strategic changes were made by AI

### The Evidence

When you **copy the optimized CV as content**, you get the complete, correct output:

```
Wasim Jalali
E-Commerce Manager | Webshop-Spezialist | Digital Marketing
...
PROFIL
E-Commerce-Spezialist mit 3 Jahren Erfahrung...
...
FÄHIGKEITEN
E-Commerce & Shop-Systeme
• Amazon Seller Central & Vendor Central
• Listing-Erstellung und Optimierung
...
```

This proves:
- ✅ The AI is generating correct content
- ✅ The data exists somewhere
- ❌ The template is NOT reading/rendering that data

### Root Cause Analysis

Based on our previous conversations and the symptoms, the problem is:

**The templates expect data in a SPECIFIC STRUCTURE, but the optimized CV outputs FREEFORM TEXT.**

Here's what's likely happening:

```
ORIGINAL CV FLOW:
User uploads CV → Parser extracts → Structured JSON → Template renders ✅

{
  "name": "Wasim Jalali",
  "headline": "E-Commerce Specialist | ...",
  "professionalSummary": "Experienced E-Commerce...",
  "experience": [
    {
      "title": "Co-Founder",
      "company": "Kursfind AI",
      "date": "2025 – Present",
      "bullets": ["AI-powered platform..."]
    }
  ],
  "skills": [
    { "category": "E-Commerce & Marketing", "items": ["Amazon Seller/Vendor Central", ...] }
  ]
}

OPTIMIZED CV FLOW (BROKEN):
AI generates optimized text → ??? → Template gets incomplete data ❌

The optimized content is either:
A) Stored as raw text, not parsed into structure
B) Parsed incorrectly (partial mapping)
C) Section ordering changes break hardcoded template positions
```

### Questions I Need Answered

Before I can design the solution, I need to know:

**Q1: How is the optimized CV stored after AI generation?**
- As raw text string?
- As parsed JSON structure?
- As a "diff" or "patch" against original?

**Q2: What does the template component expect as input?**
- Does it read from `optimizedCV.professionalSummary`?
- Or does it try to parse raw text on render?
- Show me the template component's props/interface

**Q3: When you copy content, where is it copying FROM?**
- From the raw AI output?
- From a parsed structure?
- This tells us where the correct data lives

---

## Hard Problem 2: Template Architecture (Hardcoded Sections)

### The Problem

Your current templates have:
- Hardcoded section order (Experience, Education, Skills always in same position)
- Hardcoded section structure (Skills as flat list, not categorized)
- No support for section reordering
- No support for dynamic bullet points

But the AI needs to:
- Reorder sections based on job relevance
- Expand bullet points (3 → 6 bullets)
- Categorize skills ("E-Commerce & Shop-Systeme", "Webanalyse & Digitales Marketing")
- Add new sections when relevant

### The Fundamental Choice

We have TWO architectural approaches:

---

### Approach A: "Smart Parser" (Recommended)

**Philosophy:** Keep templates simple, make parser intelligent

```
AI Output (freeform text)
    ↓
SMART PARSER (new component)
    ↓
Structured JSON (canonical format)
    ↓
Template renders JSON
```

**How it works:**
1. Define a CANONICAL DATA STRUCTURE that templates understand
2. Build a robust parser that converts ANY text output into this structure
3. Templates remain "dumb" — they just render the structure

**Canonical Structure Example:**
```typescript
interface OptimizedCV {
  personalInfo: {
    name: string;
    headline: string;
    contact: { email: string; phone: string; address: string; };
    additionalInfo?: { birthdate?: string; nationality?: string; license?: string; };
  };
  
  // ORDERED array — render in this order
  sections: Array<{
    type: 'profile' | 'experience' | 'skills' | 'education' | 'certifications' | 'languages' | 'custom';
    title: string; // "PROFIL", "BERUFSERFAHRUNG", etc.
    content: ProfileContent | ExperienceContent[] | SkillsContent | EducationContent[] | etc.
  }>;
}

interface ExperienceContent {
  title: string;
  company: string;
  location?: string;
  dateRange: string;
  bullets: string[]; // Can be 1 bullet or 10 bullets
}

interface SkillsContent {
  categories: Array<{
    name: string; // "E-Commerce & Shop-Systeme"
    items: string[]; // ["Amazon Seller Central", "Listing-Optimierung", ...]
  }>;
}
```

**Parser Logic:**
```typescript
function parseOptimizedCV(rawText: string): OptimizedCV {
  const sections: Section[] = [];
  
  // Split by section headers (PROFIL, FÄHIGKEITEN, BERUFSERFAHRUNG, etc.)
  const sectionMatches = rawText.split(/\n(PROFIL|FÄHIGKEITEN|SKILLS|BERUFSERFAHRUNG|PROFESSIONAL EXPERIENCE|AUSBILDUNG|EDUCATION|ZERTIFIKATE|CERTIFICATIONS|SPRACHEN|LANGUAGES)\n/);
  
  // Parse each section based on its type
  for (const section of sectionMatches) {
    if (section.includes('•') && section.includes('\n')) {
      // Likely skills with categories
      sections.push(parseSkillsSection(section));
    } else if (section.match(/\d{4}.*–.*\d{4}|Present|Gegenwart/)) {
      // Likely experience or education
      sections.push(parseExperienceSection(section));
    }
    // ... etc
  }
  
  return { personalInfo, sections };
}
```

**Pros:**
- Templates stay simple
- Any AI output format works
- Easy to add new templates
- Section ordering is automatic (use array order)

**Cons:**
- Parser must handle edge cases
- Parser needs maintenance when AI output changes

---

### Approach B: "Structured AI Output"

**Philosophy:** Force AI to output exact JSON structure

```
AI generates JSON directly
    ↓
Template renders JSON
```

**How it works:**
1. Modify AI prompts to output JSON, not text
2. Use JSON schema/structured output
3. Templates render JSON directly

**Example AI Prompt:**
```
Output the optimized CV as JSON matching this exact schema:
{
  "sections": [
    { "type": "profile", "title": "PROFIL", "content": "..." },
    { "type": "skills", "title": "FÄHIGKEITEN", "categories": [...] }
  ]
}
```

**Pros:**
- No parser needed
- Guaranteed structure
- Consistent output

**Cons:**
- AI may struggle with complex JSON
- Harder to review changes (JSON vs readable text)
- Breaking change to existing flow
- Less flexibility for AI to be creative

---

### My Recommendation: Approach A (Smart Parser)

**Why?**

1. Your AI already outputs good, readable text
2. The "Changes Made" view works well with text
3. JSON output would make the UX worse (harder to read changes)
4. A parser is a ONE-TIME investment that handles all templates

**The key insight:** Your problem isn't that AI output is wrong — it's that you're not PARSING it correctly into the structure templates expect.

---

### Questions I Need Answered

**Q4: Can you show me the current template component code?**
- Specifically the data structure it expects
- How it renders each section

**Q5: Is there already a parser? If so, what does it do?**
- Show me the parsing logic
- What does it output?

**Q6: Do you agree with Approach A?**
- Or do you prefer structured AI output (Approach B)?

---

## Hard Problem 3: Skills Section Rendering

### The Problem

AI outputs skills like this (from your copied content):
```
FÄHIGKEITEN
E-Commerce & Shop-Systeme
• Amazon Seller Central & Vendor Central
• Listing-Erstellung und Optimierung
• PPC-Kampagnenmanagement und Keyword-Recherche
• Helium 10, Jungle Scout
...

Webanalyse & Digitales Marketing
• Google Analytics (Grundlagen)
• Google SEO Fundamentals
...
```

But your template shows skills as:
```
CORE COMPETENCIES
[Flat list of tags without categories]
```

### The Fix (Part of Approach A)

The parser needs a `parseSkillsSection` function:

```typescript
function parseSkillsSection(text: string): SkillsContent {
  const categories: SkillCategory[] = [];
  let currentCategory: SkillCategory | null = null;
  
  const lines = text.split('\n').filter(l => l.trim());
  
  for (const line of lines) {
    if (line.startsWith('•') || line.startsWith('-')) {
      // This is a skill item
      if (currentCategory) {
        currentCategory.items.push(line.replace(/^[•\-]\s*/, ''));
      }
    } else if (line.trim() && !line.match(/^(FÄHIGKEITEN|SKILLS)/i)) {
      // This is a category header
      currentCategory = { name: line.trim(), items: [] };
      categories.push(currentCategory);
    }
  }
  
  return { categories };
}
```

### Template Update Needed

The template needs to render categorized skills:

```tsx
// Before (flat list)
<div className="skills">
  {skills.map(skill => <Tag>{skill}</Tag>)}
</div>

// After (categorized)
<div className="skills">
  {skills.categories.map(category => (
    <div className="skill-category">
      <h4>{category.name}</h4>
      <div className="skill-items">
        {category.items.map(item => (
          <span className="skill-item">• {item}</span>
        ))}
      </div>
    </div>
  ))}
</div>
```

---

## Hard Problem 4: Cover Letter Web Search Strategy

### Current State

Web search is working — you're getting company addresses correctly. Good.

### The Question

> What should we search for beyond the address? Should we include anything else in the cover letter based on search?

### My Analysis: What Top Cover Letters Include

Based on 2025-2026 best practices, excellent cover letters include:

1. **Company-specific knowledge** (shows research)
   - Recent news/achievements
   - Company mission/values
   - Specific products or initiatives

2. **Role-specific alignment**
   - Why THIS company (not just any company)
   - How your experience maps to their needs

3. **Genuine connection**
   - Something specific that resonates with you
   - Not generic flattery

### What To Search For

| Search Query | Purpose | Include in Cover Letter? |
|-------------|---------|-------------------------|
| `[Company Name] address` | Postal address for header | YES — already doing |
| `[Company Name] news 2025 2026` | Recent achievements/launches | MAYBE — one sentence max |
| `[Company Name] mission values` | Company culture | MAYBE — if genuinely relevant |
| `[Company Name] [job title] team` | Team info | RARELY — hard to find useful info |

### My Recommendation: Minimal Search

**Search only for:**
1. ✅ Company address (already doing)
2. ✅ Company name verification (ensure it's correct)

**Do NOT search for:**
- News to shoehorn into cover letter
- Mission statements to copy
- Generic "values" to pretend you align with

**Why?**

1. **Hallucination risk** — AI might misinterpret search results
2. **Cringe factor** — "I was thrilled to read about your Q3 earnings..." sounds fake
3. **Time cost** — More searches = slower application
4. **Diminishing returns** — Address is useful; "company values" rarely improves letters

### What The Cover Letter SHOULD Do Instead

The cover letter should focus on:
1. **The job description** (already in context)
2. **The user's CV** (already in context)
3. **Matching skills to requirements**
4. **Specific examples from experience**

The JOB DESCRIPTION is your research. You don't need to search for more.

### Questions I Need Answered

**Q7: Are you seeing any cover letter quality issues currently?**
- Are letters too generic?
- Are they missing something specific?

**Q8: Do you want to add company research to letters?**
- If yes, what specifically would you want included?
- What's an example of a cover letter you think is missing something?

---

## Summary of Questions for You

Before I create the Hard Problems Implementation Guide, please answer:

### Template Architecture
1. How is the optimized CV stored after AI generation?
2. What does the template component expect as input?
3. When you copy content, where is it copying FROM?
4. Can you show me the current template component code?
5. Is there already a parser? If so, show me the code.
6. Do you agree with Approach A (Smart Parser)?

### Cover Letter
7. Are you seeing any cover letter quality issues currently?
8. Do you want to add company research beyond address?

---

## Next Steps

Once you answer these questions:

1. I'll create a detailed implementation guide for the template architecture
2. We'll have a clear plan for the Skills section
3. We'll finalize the cover letter search strategy

**Do not let your agent start on hard problems until we agree on the approach.**

---

## Appendix: Quick Reference for Agent

If your agent needs to investigate while you're answering questions, they should check:

```bash
# Find template components
grep -rn "template\|Template" src/components/
ls -la src/components/cv/
ls -la src/components/templates/

# Find parsing logic
grep -rn "parse.*cv\|parseCV\|parseCv" src/
grep -rn "optimized.*cv\|optimizedCV" src/

# Find where optimized content is stored
grep -rn "setOptimized\|optimizedData\|optimizedCV" src/

# Check the AI output handler
grep -rn "generateCV\|optimizeCV" src/

# Find skills rendering
grep -rn "skills\|Skills\|SKILLS" src/components/
```

---

## End of Hard Problems Analysis