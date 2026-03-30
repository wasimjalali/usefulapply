
# SEO & GEO Technical Status — Karko AI

> Last updated: 2026-03-30
> Baseline audit: Ahrefs crawl (March 2026)

---

## 1. Architecture Overview

### Metadata System
- **Framework:** Next.js 14+ App Router
- **metadataBase:** `https://www.karkoai.com` (set in `src/app/layout.tsx`)
- **Title template:** `%s | KarKo AI` (root layout) — child pages supply only the page-specific part
- **OG image:** File-based via `src/app/opengraph-image.tsx` (auto-injected on all routes)
- **Canonical URLs:** Relative paths resolved against metadataBase (e.g. `canonical: '/about'`)

### Structured Data (JSON-LD)
| Schema Type | Location | Scope |
|-------------|----------|-------|
| Organization | `src/app/layout.tsx` `<head>` | All pages (site-wide) |
| SoftwareApplication | `src/app/page.tsx` (homepage) | Homepage only |
| FAQPage | GEO sub-pages only | Per-page, matches visible FAQ content |
| BreadcrumbList | GEO sub-pages + master-cv-template | Per-page |
| Article | GEO sub-pages + master-cv-template | Per-page |
| HowTo | 90-second + master-cv-template pages | Per-page |
| ItemList | `/ai-job-application` hub | Hub page only |
| BlogPosting | `src/app/blog/[slug]/page.tsx` | Per blog post |

### Sitemap & Robots
- **Sitemap:** `src/app/sitemap.ts` — auto-generated, includes all public indexable pages + blog posts
- **Robots:** `src/app/robots.ts` — allows `/` for all bots, disallows `/api/`, `/dashboard/`, `/documents/`, `/settings/`, `/auth/`
- **Robots also allows** GEO crawlers (GPTBot, ChatGPT-User, Google-Extended, ClaudeBot, PerplexityBot, etc.)

### Internationalization
- **No multi-language routing** — site is English-only
- **No `/de/` routes exist** — all German hreflang annotations were removed (they were pointing to 404s)
- **No i18n framework** configured

### Internal Linking
- **Navbar:** Home, Master CV, Pricing, Blog, About, Contact + Login, Dashboard CTA
- **Footer:** Pricing, Master CV, Dashboard, Login, About, Blog, Contact, Privacy, Terms, Imprint
- **GEO hub:** `/ai-job-application` links to all 6 sub-pages + `/master-cv-template` (hub-and-spoke model)
- **Blog:** Related posts section at bottom of each post

---

## 2. Page Inventory

### Public Indexable Pages (in sitemap)
| URL | Title (after template) | Has OG | Has JSON-LD |
|-----|----------------------|--------|-------------|
| `/` | KarKo AI \| AI-Powered Job Application Assistant | Yes (root) | SoftwareApplication + Organization |
| `/about` | About KarKo AI \| KarKo AI | Yes | Organization (inherited) |
| `/pricing` | Pricing \| Plans & Credits \| KarKo AI | Yes | Organization (inherited) |
| `/master-cv` | Master CV — Build Your Career Profile \| KarKo AI | Yes | Organization (inherited) |
| `/master-cv-template` | Master CV Template \| KarKo AI | Yes | FAQ + Breadcrumb + HowTo + Article |
| `/blog` | Blog: Career Tips & AI Job Search \| KarKo AI | Yes | Organization (inherited) |
| `/blog/[slug]` | {post.title} \| KarKo AI | Yes | BlogPosting |
| `/contact` | Contact Us \| KarKo AI | Yes | Organization (inherited) |
| `/ai-job-application` | AI Job Application Guide \| KarKo AI | Yes | FAQ + Breadcrumb + ItemList + Article |
| `/ai-job-application/90-second-application-package` | 90-Second AI Application Package \| KarKo AI | Yes | FAQ + Breadcrumb + HowTo + Article |
| `/ai-job-application/free-no-signup-test` | Try AI Job Applications Free \| KarKo AI | Yes | FAQ + Breadcrumb + Article |
| `/ai-job-application/ats-optimization` | ATS-Optimized AI Job Applications \| KarKo AI | Yes | FAQ + Breadcrumb + Article |
| `/ai-job-application/zero-fabrication` | Zero-Fabrication AI Applications \| KarKo AI | Yes | FAQ + Breadcrumb + Article |
| `/ai-job-application/integrations-workday-greenhouse-lever` | Workday, Greenhouse & Lever Compatibility \| KarKo AI | Yes | FAQ + Breadcrumb + Article |
| `/ai-job-application/pricing-credits` | AI Application Pricing & Credits \| KarKo AI | Yes | FAQ + Breadcrumb + Article |
| `/privacy` | Privacy Policy \| KarKo AI | Yes | Organization (inherited) |
| `/terms` | Terms of Service \| KarKo AI | Yes | Organization (inherited) |
| `/imprint` | Imprint (Impressum) \| KarKo AI | Yes | Organization (inherited) |

### Non-Indexable Pages (blocked by robots.txt, not in sitemap)
- `/dashboard` — App main page (no H1)
- `/documents` — CV upload page
- `/applications` — Application tracker
- `/settings` — Account settings
- `/auth/login` — Login (no H1)
- `/auth/signup` — Signup (no H1)
- `/auth/forgot-password` — Password reset
- `/auth/reset-password` — New password form
- `/auth/callback` — OAuth callback
- `/auth/auth-code-error` — Auth error page

---

## 3. Changes Made (2026-03-30 Audit Fix)

### Issue: 8x 404 pages from hreflang
**Root cause:** 8 GEO pages declared `alternates.languages.de` pointing to `/de/bewerbung-ki/...` URLs that did not exist.
**Fix:** Removed all `languages.de` hreflang entries from all 8 pages. No `/de/` routes exist.
**Files:** All 7 `src/app/ai-job-application/*/page.tsx` + `src/app/master-cv-template/page.tsx`

### Issue: 20x structured data validation errors
**Root cause:** Root layout injected SoftwareApplication (missing required aggregateRating), FAQPage (duplicated on all pages, Google restricts to health/gov), and Organization (with empty `sameAs: []`) on every page.
**Fix:**
- Removed SoftwareApplication from root layout, moved to homepage with corrected pricing (Plus $39.99, Max $79.99) and removed invalid `billingIncrement`
- Removed FAQPage from root layout entirely (GEO pages have their own per-page FAQ schemas)
- Cleaned Organization schema (removed `sameAs: []`)
  **Files:** `src/app/layout.tsx`, `src/app/page.tsx`

### Issue: 8x double-branded titles (70-93 chars)
**Root cause:** GEO pages included `| Karko AI` in title strings + root template added `| KarKo AI`.
**Fix:** Removed manual brand suffix from all GEO page titles. Root template handles branding.
**Files:** All 8 GEO pages

### Issue: 11x meta descriptions too long
**Root cause:** Descriptions written without length awareness.
**Fix:** Trimmed to ≤155 chars on all affected pages while preserving key information.
**Files:** `layout.tsx`, `page.tsx`, about, pricing, master-cv, blog, 5 GEO pages, master-cv-template

### Issue: 10x incomplete OG tags + 7x OG URL mismatch
**Root cause:** Next.js shallow-merges OG — pages without their own OG inherited root layout's homepage OG. Pages with partial OG lost fields.
**Fix:** Added explicit `openGraph` blocks (with `url`, `siteName`, `type`) to all pages that needed them.
**Files:** about, pricing, contact, imprint, terms, privacy, master-cv, blog, blog/[slug], all 8 GEO pages

### Issue: Sitemap/robots conflict
**Root cause:** `/auth/login` and `/auth/signup` in sitemap but `robots.ts` blocks `/auth/`.
**Fix:** Removed auth pages from sitemap.
**Files:** `src/app/sitemap.ts`

### Issue: Internal link to redirect
**Root cause:** CTA on `/ai-job-application` used `href="https://www.karkoai.com"` (absolute self-link).
**Fix:** Changed to `href="/dashboard"` using Next.js `<Link>`.
**Files:** `src/app/ai-job-application/page.tsx`

### Issue: Article schema improvements (GEO pages)
**Fix:** Added `image` property (Google recommended), added `logo` to publisher, fixed org name casing to `KarKo AI`, updated `dateModified`.
**Files:** All 8 GEO pages

### Pre-existing bug fixed
**File:** `src/app/about/page.tsx` — stray `/` at start of file causing TS parse error.

---

## 4. Known Limitations & Future Work

### SoftwareApplication Rich Results
Google **requires** `aggregateRating` or `review` for SoftwareApplication rich results. Neither is present because no real review data exists yet. When Trustpilot or other review data is available, add it to the SoftwareApplication schema in `src/app/page.tsx`. The schema is valid but won't trigger Google rich results until rating data is added.

### FAQPage Rich Results
Google restricts FAQ rich results to "well-known, authoritative websites that are government-focused or health-focused" (as of late 2025 policy change). The GEO page FAQ schemas are still valid structured data and may help with GEO/AI search understanding, but won't produce Google SERP FAQ dropdowns for Karko AI.

### Blog Post Titles
The blog post `how-long-to-apply-for-job-2026` has a title of 93 chars after template (`How Long Does It Really Take to Apply for a Job in 2026? (The Math Will Shock You) | KarKo AI`). This is content-driven and was kept as-is. For future blog posts, consider keeping titles under ~48 chars (60 total with template suffix).

### Performance (2 Slow Pages)
The Ahrefs audit flagged 2 slow pages. No specific URLs were provided. Requires Lighthouse profiling on production to identify and fix. Not a code-level SEO issue.

### Missing H1 on Non-Indexable Pages
`/dashboard`, `/auth/login`, and `/auth/signup` have no H1 tags. These are blocked by robots.txt and not indexed, so this has no SEO impact.

### Internal Linking on Legal Pages
`/terms`, `/privacy`, `/imprint` have no in-body internal links (only shared Navbar/Footer). This is normal for legal pages and not worth adding artificial links.

---

## 5. Audit Baseline (Pre-Fix → Post-Fix Expected)

| Issue Cluster | Pre-Fix Count | Expected Post-Fix | Root Fix |
|--------------|---------------|-------------------|----------|
| 404 / 4XX pages | 8 | 0 | Removed broken hreflang targets |
| Redirect chains | 1 | 0 | Replaced absolute CTA with relative link |
| Schema validation errors | 20 | 0 (rich results still limited) | Moved/removed global schemas, fixed per-page |
| Titles too long | 8 | 0 (blog post is content decision) | Fixed double branding |
| Descriptions too long | 11 | 0 | Trimmed all to ≤155 chars |
| Incomplete OG tags | 10 | 0 | Added explicit OG to all pages |
| OG URL mismatch | 7 | 0 | Each page now sets correct OG url |
| Hreflang to broken URLs | 8 | 0 | Removed all broken hreflang |
| Missing x-default | 8 | N/A (no language cluster) | Not applicable — English-only site |
| Sitemap/robots conflict | 2 | 0 | Removed auth URLs from sitemap |
| Links to redirect | 1 | 0 | Fixed CTA to use relative path |

---

## 6. Key Files Reference

| Purpose | File Path |
|---------|-----------|
| Root metadata + Organization schema | `src/app/layout.tsx` |
| Homepage + SoftwareApplication schema | `src/app/page.tsx` |
| Sitemap generation | `src/app/sitemap.ts` |
| Robots rules | `src/app/robots.ts` |
| OG image generation | `src/app/opengraph-image.tsx` |
| GEO hub page | `src/app/ai-job-application/page.tsx` |
| Blog post template | `src/app/blog/[slug]/page.tsx` |
| Blog data | `src/lib/blog/posts.ts` |
