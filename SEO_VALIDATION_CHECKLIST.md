# SEO Validation Checklist — Post-Deploy Manual Steps

> After deploying the SEO fixes to production, follow these steps to validate and submit.
> Estimated time: 30-45 minutes

---

## Step 1: Verify Deployed Changes (5 min)

Open each URL in an incognito browser tab and right-click > View Page Source to check `<head>`:

### Homepage: `https://www.karkoai.com`
- [ ] `<title>` is `KarKo AI | AI-Powered Job Application Assistant`
- [ ] `<meta name="description">` is ≤155 chars, starts with "Apply to jobs 10x faster"
- [ ] `<link rel="canonical" href="https://www.karkoai.com">` present
- [ ] `<meta property="og:url" content="https://www.karkoai.com">` present
- [ ] `<meta property="og:site_name" content="KarKo AI">` present
- [ ] `<meta property="og:image" ...>` present (auto from opengraph-image.tsx)
- [ ] JSON-LD: has `SoftwareApplication` with price `39.99` (Plus) and `79.99` (Max)
- [ ] JSON-LD: has `Organization` schema
- [ ] JSON-LD: does NOT have `FAQPage` schema
- [ ] No `<link rel="alternate" hreflang="de" ...>` tags

### GEO Page: `https://www.karkoai.com/ai-job-application`
- [ ] `<title>` is `AI Job Application Guide | KarKo AI` (no double branding)
- [ ] `<meta name="description">` is ≤155 chars
- [ ] `<link rel="canonical" href="https://www.karkoai.com/ai-job-application">` present
- [ ] `<meta property="og:url">` matches canonical
- [ ] No `<link rel="alternate" hreflang="de" ...>` tags
- [ ] JSON-LD: `Article` has `image` property
- [ ] JSON-LD: `FAQPage` schema present (page-specific, not the old global one)
- [ ] "Try Karko AI Free" CTA links to `/dashboard` (not `https://www.karkoai.com`)

### About Page: `https://www.karkoai.com/about`
- [ ] `<meta property="og:url" content="https://www.karkoai.com/about">` (not homepage URL)
- [ ] `<meta property="og:title">` says "About KarKo AI" (not homepage title)

### Blog Post: `https://www.karkoai.com/blog/how-long-to-apply-for-job-2026`
- [ ] `<meta property="og:site_name" content="KarKo AI">` present
- [ ] JSON-LD: `BlogPosting` schema present

---

## Step 2: Google Rich Results Test (10 min)

Go to: https://search.google.com/test/rich-results

Test these URLs one by one (paste URL, click "Test URL"):

1. **`https://www.karkoai.com`**
   - [ ] No critical errors on Organization schema
   - [ ] SoftwareApplication shows warning about missing aggregateRating (expected — no real reviews yet)

2. **`https://www.karkoai.com/ai-job-application`**
   - [ ] BreadcrumbList validates
   - [ ] Article validates (may warn about missing image sizes — OK)
   - [ ] No errors on FAQPage structure

3. **`https://www.karkoai.com/blog/how-long-to-apply-for-job-2026`**
   - [ ] BlogPosting validates

---

## Step 3: Schema Markup Validator (5 min)

Go to: https://validator.schema.org/

Paste the same 3 URLs and verify:
- [ ] No errors (warnings are acceptable)
- [ ] No `billingIncrement` property warnings (was removed)
- [ ] No `sameAs` empty array warnings (was removed)

---

## Step 4: Sitemap Validation (2 min)

1. Open: `https://www.karkoai.com/sitemap.xml`
   - [ ] `/auth/login` is NOT in the sitemap
   - [ ] `/auth/signup` is NOT in the sitemap
   - [ ] All GEO pages, blog posts, and public pages ARE present
   - [ ] No URLs contain `/de/` paths

---

## Step 5: Google Search Console (10 min)

Go to: https://search.google.com/search-console

### URL Inspection
Paste each of these URLs into the URL Inspection bar and click "Request Indexing":

1. `https://www.karkoai.com`
2. `https://www.karkoai.com/about`
3. `https://www.karkoai.com/pricing`
4. `https://www.karkoai.com/ai-job-application`
5. `https://www.karkoai.com/ai-job-application/90-second-application-package`
6. `https://www.karkoai.com/ai-job-application/free-no-signup-test`
7. `https://www.karkoai.com/ai-job-application/ats-optimization`
8. `https://www.karkoai.com/ai-job-application/zero-fabrication`
9. `https://www.karkoai.com/ai-job-application/integrations-workday-greenhouse-lever`
10. `https://www.karkoai.com/ai-job-application/pricing-credits`
11. `https://www.karkoai.com/master-cv-template`
12. `https://www.karkoai.com/blog`
13. `https://www.karkoai.com/blog/how-long-to-apply-for-job-2026`

### Sitemaps
1. Go to Sitemaps section
2. [ ] Re-submit `https://www.karkoai.com/sitemap.xml`

### Removals (optional)
If the old German URLs show up in the index, request removal:
- `https://www.karkoai.com/de/bewerbung-ki`
- `https://www.karkoai.com/de/bewerbung-ki/90-sekunden-bewerbungspaket`
- etc.

(These URLs never existed as real pages, so they should not be indexed. But if Google somehow crawled them from the old hreflang, remove them.)

---

## Step 6: Social Share Preview Test (5 min)

Use a social preview tool to verify OG tags render correctly:
- https://www.opengraph.xyz/ — paste URLs to preview

Test at least:
- [ ] `https://www.karkoai.com` — should show "KarKo AI | AI-Powered Job Application Assistant" with OG image
- [ ] `https://www.karkoai.com/about` — should show "About KarKo AI" (not homepage title)
- [ ] `https://www.karkoai.com/ai-job-application` — should show "AI Job Application Guide | KarKo AI"

---

## Step 7: Fresh Ahrefs Crawl (5 min to start, results in hours)

1. Go to Ahrefs Site Audit
2. Start a new crawl of `https://www.karkoai.com`
3. After crawl completes, compare against the baseline:

| Issue | Pre-Fix | Expected Post-Fix |
|-------|---------|-------------------|
| 404 / 4XX pages | 8 | 0 |
| Schema validation errors | 20 | 0 |
| Titles too long | 8 | 0-1 (blog post is content decision) |
| Descriptions too long | 11 | 0 |
| Incomplete OG tags | 10 | 0 |
| OG URL mismatch | 7 | 0 |
| Hreflang to broken URLs | 8 | 0 |
| Missing x-default | 8 | 0 (no language cluster, not applicable) |
| Sitemap/robots conflict | 2 | 0 |
| Links to redirect | 1 | 0 |
| Slow pages | 2 | 2 (not addressed — needs Lighthouse profiling) |

---

## Step 8: IndexNow Submission (Optional, 2 min)

If Bing Webmaster Tools is set up, submit changed URLs via IndexNow:
- All URLs from Step 5 above

If not set up, skip — Google Search Console indexing requests (Step 5) are sufficient.

---

## Notes

- Allow 2-7 days for Google to re-crawl and update SERP display after requesting indexing.
- SoftwareApplication rich results will not appear until real `aggregateRating` or `review` data is added (e.g. from Trustpilot integration).
- FAQPage rich results will not appear for Karko AI regardless of schema quality — Google restricts FAQ rich results to government and health sites.
- If any new German locale pages are created in the future, re-add hreflang annotations pointing to real, live URLs only.
