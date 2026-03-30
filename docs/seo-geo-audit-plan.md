# Karko AI — SEO/GEO & Content Marketing Audit Plan

> Created: 2026-03-30 | Status: **In Progress** | Current Phase: **Phase 0**

---

## Progress Tracker

### Phase 0: Critical Fixes (Immediate)
- [x] 0.1 Fix `llms.txt` — wrong pricing, wrong AI model, missing GEO links
- [x] 0.2 Fix homepage double-branding title
- [x] 0.3 Add GEO pages to Navbar and Footer
- [x] 0.4 Google Search Console setup (manual — no code changes)

### Phase 1: High Priority Fixes (Week 1)
- [x] 1.1 Create custom 404 page (`src/app/not-found.tsx`)
- [x] 1.2 Add `<main>` landmark to all marketing pages (~11 files)
- [x] 1.3 Add JSON-LD schema to `/master-cv` page
- [x] 1.4 Fix legal pages to use `buildPageMetadata()`
- [x] 1.5 Replace raw `<img>` tags with `next/image`
- [x] 1.6 Fix blog post reading time
- [x] 1.7 Fix redirect chain (Vercel dashboard — manual)

### Phase 2: Content & Infrastructure (Weeks 1-2)
- [ ] 2.1 Write blog post: "Follow-Up Email After Job Application"
- [ ] 2.2 Write blog post: "How to Tailor Resume to Job Description"
- [ ] 2.3 Write blog post: "ATS Resume Format Guide 2026"
- [ ] 2.4 Write blog post: "AI Cover Letter Generator — How It Works"
- [ ] 2.5 Write blog post: "Best AI Job Application Tools 2026"
- [ ] 2.6 Create GEO page: `/ai-job-application/cover-letter-generator`
- [ ] 2.7 Create GEO page: `/ai-job-application/follow-up-email-generator`
- [ ] 2.8 Create GEO page: `/ai-job-application/application-tracker`
- [ ] 2.9 Create RSS feed (`src/app/feed.xml/route.ts`)
- [ ] 2.10 Create web app manifest (`src/app/manifest.ts`)

### Phase 3: Strategic Content (Month 1)
- [ ] 3.1 Create comparison page system (`src/app/compare/[slug]/page.tsx`)
- [ ] 3.2 Write comparison: Karko AI vs Teal
- [ ] 3.3 Write comparison: Karko AI vs Jobscan
- [ ] 3.4 Write comparison: Best AI Resume Builders 2026
- [ ] 3.5 Create dedicated features page (`src/app/features/page.tsx`)
- [ ] 3.6 Write blog posts 6-10
- [ ] 3.7 Keyword optimization for existing pages (homepage, pricing, about)
- [ ] 3.8 Add topic-specific CTAs to blog posts

### Phase 4: Ongoing (Month 2+)
- [ ] 4.1 Add `aggregateRating` to SoftwareApplication schema (when reviews exist)
- [ ] 4.2 Add customer testimonials to About page
- [ ] 4.3 Create `.well-known/ai-plugin.json`
- [ ] 4.4 Continue blog cadence (2-3 posts/week)

---

## Detailed Plan

### PHASE 0: CRITICAL FIXES

#### 0.1 Fix `llms.txt`
**File:** `public/llms.txt`

**Problems found:**
- Line 30: Says "Plus Plan: $29.99/month — 200 credits" → Actual: **$39.99/month — 100 credits**
- Line 31: Says "Pro Plan: $49.99/month — 500 credits" → Actual: **Max Plan: $79.99/month — 200 credits**
- Line 54: Says "Uses advanced AI models (Claude, GPT-4)" → Product **exclusively uses Claude Sonnet 4.6**
- Missing: All 7 GEO pages under `/ai-job-application`
- Missing: Key features (Application Tracker, 6 CV Templates, Fit Score, Follow-Up Emails, Add-on credit packs)

**Impact:** AI engines (ChatGPT, Perplexity, Claude) read this file. Wrong pricing = wrong answers to users asking about Karko AI.

#### 0.2 Fix Homepage Double-Branding Title
**File:** `src/app/page.tsx` (line 12)

Homepage exports `title: 'KarKo AI | AI-Powered Job Application Assistant'`. Root layout template is `%s | KarKo AI`. Rendered title: `KarKo AI | AI-Powered Job Application Assistant | KarKo AI`.

**Fix:** `title: { absolute: 'KarKo AI | AI-Powered Job Application Assistant' }`

#### 0.3 Add GEO Pages to Navigation
**Files:** `src/components/marketing/Navbar.tsx` (lines 25-32), `src/components/marketing/Footer.tsx`

The `/ai-job-application` content cluster (7 pages with FAQ schemas, articles, breadcrumbs) has ZERO links from main navigation. No internal link equity.

**Navbar fix:** Add `{ href: '/ai-job-application', label: 'AI Applications' }` to navLinks array.

**Footer fix:** Add "Resources" column with GEO hub links. Change grid from `md:grid-cols-4` to `md:grid-cols-5`.

#### 0.4 Google Search Console
No code changes. Manual setup: add property, verify via DNS, submit sitemap, request indexing.

---

### PHASE 1: HIGH PRIORITY FIXES

#### 1.1 Custom 404 Page
**New file:** `src/app/not-found.tsx`
- Match marketing page design (cream/navy/gold)
- Include Navbar + Footer
- Internal links: Home, Dashboard (Try It Free), Blog, AI Application Guide
- Follow `error.tsx` pattern for styling consistency

#### 1.2 Add `<main>` Landmark
**Files (~11):**
- `src/app/page.tsx`, `about/page.tsx`, `pricing/page.tsx`, `blog/page.tsx`, `blog/[slug]/page.tsx`
- `privacy/page.tsx`, `terms/page.tsx`, `imprint/page.tsx`
- `contact/page.tsx`, `master-cv/page.tsx`, `master-cv-template/page.tsx`

Wrap content between Navbar and Footer in `<main>` element. The `/ai-job-application/page.tsx` already uses `<main>`.

#### 1.3 JSON-LD for `/master-cv`
**File:** `src/app/master-cv/page.tsx`

Add BreadcrumbList + Article + HowTo schemas, following the pattern in `src/app/master-cv-template/page.tsx`.

#### 1.4 Legal Pages Metadata
**Files:** `src/app/privacy/page.tsx`, `terms/page.tsx`, `imprint/page.tsx`

Replace inline metadata with `buildPageMetadata()` from `@/lib/seo/metadata` for consistent OG, Twitter, locale.

#### 1.5 Replace Raw `<img>` Tags
- `src/app/page.tsx` line 675 (Anthropic icon)
- `src/app/pricing/page.tsx` line 190 (Anthropic icon)
Change to `<Image>` from `next/image`.

#### 1.6 Fix Blog Reading Time
**File:** `src/lib/blog/posts.ts` (line 129)
Change `readingTime: 5` to `readingTime: 8` (~1,800 words at 250 wpm).

#### 1.7 Fix Redirect Chain (Vercel Dashboard)
Set `www.karkoai.com` as primary domain so `http://karkoai.com` → `https://www.karkoai.com` in one hop.

---

### PHASE 2: CONTENT STRATEGY

#### Keyword Gap Analysis

**Current state:** 20 keywords in meta tags, good coverage of "AI job application" and "ATS optimization". Major gaps in blog content (only 1 post).

**Recommended keyword strategy for a 2-week-old site:**

**Target now (low competition, high intent):**
- "follow up email after job application" — unique feature, low competition
- "tailor resume to job description" — high intent
- "ATS resume format 2026" — specific, current
- "AI cover letter generator" — product-aligned
- "best AI job application tools" — comparison intent
- "AI job application email generator" — unique feature
- "zero fabrication AI resume" — differentiator

**Don't compete yet:**
- "resume builder" — dominated by Zety, Resume.io, Novoresume
- "cover letter generator" — extremely competitive
- "AI resume" — competitive, dominated by Teal, Rezi

#### Blog Posts (Priority Order)

| # | Slug | Target Keyword | Category |
|---|------|---------------|----------|
| 1 | `follow-up-email-after-job-application` | "follow up email after job application" | Career Tips |
| 2 | `how-to-tailor-resume-to-job-description` | "tailor resume to job description" | CV Writing |
| 3 | `ats-resume-format-guide-2026` | "ATS resume format 2026" | CV Writing |
| 4 | `ai-cover-letter-generator-how-it-works` | "AI cover letter generator" | Cover Letters |
| 5 | `best-ai-job-application-tools-2026` | "best AI job application tools 2026" | AI & Technology |

#### New GEO Sub-Pages

| Page | Target Keyword |
|------|---------------|
| `/ai-job-application/cover-letter-generator` | "AI cover letter generator" |
| `/ai-job-application/follow-up-email-generator` | "follow up email after application" |
| `/ai-job-application/application-tracker` | "job application tracker" |

---

### PHASE 3: STRATEGIC CONTENT

#### Comparison Pages
- `/compare/karko-ai-vs-teal`
- `/compare/karko-ai-vs-jobscan`
- `/compare/best-ai-resume-builders-2026`

#### Features Page
- `/features` — deep explanation of each feature, cross-links to GEO pages

#### Keyword Optimization for Existing Pages
- Homepage: Add "AI resume builder" naturally, add "free" to meta description
- Pricing FAQ: Add competitor comparison question
- Blog CTAs: Topic-specific instead of generic

#### Copywriting Improvements
- Homepage: More benefit-focused ("Never Rewrite Your CV Again" vs "Upload Your CV Once")
- Add urgency to CTAs ("10 free credits, no card required")
- Per-post blog CTAs

---

### PHASE 4: ONGOING

- `aggregateRating` in SoftwareApplication schema (needs 5+ Trustpilot reviews)
- Customer testimonials on About page
- `.well-known/ai-plugin.json` for AI integration discovery
- Blog cadence: 2-3 posts/week
- Blog posts 11-20: "AI job application email generator", "German CV vs American resume", "how to beat ATS", "is it ethical to use AI for applications", "career change resume tips", etc.

---

## Competitor Landscape

| Competitor | Strengths | Karko Differentiator |
|-----------|-----------|---------------------|
| Teal | Resume builder + job tracker, strong SEO | 4-doc package (CV + cover letter + email + follow-up), 90-second speed |
| Jobscan | ATS keyword scanner, high domain authority | Full document generation vs. just scanning |
| Kickresume | Templates + AI writing | Anti-hallucination (zero fabrication), Claude Sonnet 4.6 |
| Rezi | AI resume builder | Complete application package, not just resume |
| Enhancv | Visual templates | ATS-first design, EU market (German templates) |
| Resume.io | Simple builder, high volume | AI-powered tailoring per job description |

---

## Files Reference

| Purpose | File Path |
|---------|-----------|
| LLMs.txt | `public/llms.txt` |
| Homepage | `src/app/page.tsx` |
| Navbar | `src/components/marketing/Navbar.tsx` |
| Footer | `src/components/marketing/Footer.tsx` |
| Blog posts data | `src/lib/blog/posts.ts` |
| Blog types | `src/lib/blog/types.ts` |
| SEO metadata utility | `src/lib/seo/metadata.ts` |
| Sitemap | `src/app/sitemap.ts` |
| Robots | `src/app/robots.ts` |
| Root layout | `src/app/layout.tsx` |
| GEO hub | `src/app/ai-job-application/page.tsx` |
| Master CV | `src/app/master-cv/page.tsx` |
| Master CV Template | `src/app/master-cv-template/page.tsx` |
| OG image | `src/app/opengraph-image.tsx` |
| Existing SEO docs | `SEO_GEO_STATUS.md`, `SEO_VALIDATION_CHECKLIST.md` |

---

## Session Log

| Session | Date | Phases Completed | Notes |
|---------|------|-----------------|-------|
| 1 | 2026-03-30 | Research + Plan created | Full audit completed, plan approved |
| 2 | 2026-03-30 | Phase 0 + Phase 1 complete | All critical and high-priority fixes implemented |
| | | | |
| | | | |
