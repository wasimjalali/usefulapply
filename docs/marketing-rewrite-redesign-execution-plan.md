# Marketing Rewrite and Redesign Execution Plan

Date: 2026-04-27
Branch: `codex/marketing-rewrite-redesign`

Source documents:

- `docs/current-marketing-content-audit.md`
- `docs/marketing-copy-rewrite-brief-and-agent-prompt.md`
- `docs/marketing-copy-rewrite-plan.md`
- `docs/marketing-design-rewrite-plan.md`
- `docs/marketing-assets-spec.md`

## Goal

Rewrite and redesign the main Karko AI marketing experience so the product is framed as a complete job application platform, not only a CV, cover letter and email generator.

The new story:

1. Karko finds relevant jobs with Smart Job Feed.
2. Karko helps the user understand fit.
3. Karko writes a complete application package.
4. Karko helps users follow up.
5. Karko tracks the whole job search in one place.

The copy should be clear, concrete and value-first. It should show what users get, how much time they save, and why Karko gives both quality and speed. No long em dashes, no generic AI filler, no heavy SaaS jargon.

## Current Branch Status

Some rewrite and asset work already exists in the worktree:

- Homepage has a rewritten hero and a new two-pillar section using `/images/two-pillar-job-feed.webp` and `/images/two-pillar-application-kit.webp`.
- Homepage How It Works has started moving from 3 steps to 5 steps.
- Features page has a new Smart Job Feed feature card and Application Tracker card, but the plan table still has stale values.
- Pricing page has started adding Smart Job Feed bullets to Plus and Max, but the hero, FAQ, credit tiles and some plan language are still stale.
- `public/images/` contains GPT-generated brand images.
- `public/screenshots/` contains current dashboard screenshots from the new product.
- `docs/images/` and `docs/screenshots/` also contain the source PNG/WebP files.
- Old legacy screenshot files under `Images_screenshot/` are currently deleted in the worktree. I will not restore or delete anything without checking relevance.

This plan assumes the existing partial work is useful and should be continued, not thrown away.

## Assets To Use

### Prefer Real Product Screenshots

Use the new screenshots in `public/screenshots/` instead of the old legacy showcase images where the user needs to inspect the product:

- `/screenshots/01-smart-job-feed-populated.webp`
- `/screenshots/01b-job-feed-left-only.webp`
- `/screenshots/02-job-detail-modal.webp`
- `/screenshots/03-application-kit-generated.webp`
- `/screenshots/03a-application-kit-landing.webp`
- `/screenshots/03b-application-kit-generating.webp`
- `/screenshots/03c-cv-tailored-clean.webp`
- `/screenshots/04-fit-analysis-result.webp`
- `/screenshots/05-application-tracker.webp`
- `/screenshots/06-job-feed-onboarding.webp`
- `/screenshots/07-documents-page.webp`
- `/screenshots/10-dashboard-top-nav.webp`
- `/screenshots/11-job-feed-empty-upsell.webp`
- `/screenshots/12-profile-dropdown.webp`
- `/screenshots/13-cover-letter-panel.webp`
- `/screenshots/14-email-panel.webp`

### Use GPT Brand Images As Supporting Visuals

Use GPT-generated images where illustration helps explain the workflow or adds warmth:

- `/images/two-pillar-job-feed.webp`
- `/images/two-pillar-application-kit.webp`
- `/images/workflow-5-steps.webp`
- `/images/brand-laptop-dashboard.webp`
- `/images/brand-fit-analysis.webp`
- `/images/brand-checklist-tracker.webp`
- `/images/brand-cv-upload.webp`
- `/images/brand-email-seal.webp`
- `/images/brand-docs-tags.webp`
- `/images/brand-compass-card.webp`
- `/images/brand-growth-chart.webp`
- `/images/comparison-page-hero.webp`
- `/images/cta-background-navy.webp`
- `/images/empty-state-tracker.webp`

### Asset Rule

Use real screenshots for product proof and generated images for framing or empty states. Do not rely on generic stock-like visuals. Do not use dark, blurry or cropped images where users need to understand the product.

## Keep Unchanged Or Nearly Unchanged

These should remain intact:

- Homepage founder story copy and founder voice.
- Real review and Trustpilot review content.
- Time-savings calculator concept.
- Existing pricing model and credit math.
- Existing brand palette: cream, navy, gold, sage.

Small copy polish is allowed around the calculator, but the user explicitly wants the founder story and reviews preserved.

## Decisions I Will Use Unless You Object

1. Smart Job Feed monthly framing:
   - Plus: up to 15 jobs/day, about 300/month.
   - Max: up to 25 jobs/day, about 500/month.
   - This uses a weekday-style monthly framing and is more conservative than 30-day math.

2. Hours saved:
   - Free: about 2 hours/month.
   - Plus: about 18 hours/month.
   - Max: about 108 hours/month.

3. Max positioning:
   - Replace "Full automation for power applicants" with a clearer phrase like "For high-volume job searching" or "For the intense job search."
   - Avoid implying Karko auto-applies to jobs.

4. Free and anonymous wording:
   - Anonymous dashboard trial: one application without account.
   - Signed-up Free plan: 4 credits, about 2 applications/month.
   - Make both true and clearly separated.

5. Smart Job Feed access:
   - Free users see the Job Feed upgrade gate.
   - Plus and Max get Smart Job Feed.

6. Application Tracker:
   - Market it as a real feature and a first-class part of the workflow.

7. Dedicated Job Feed page:
   - Skip for this pass.
   - Link Smart Job Feed references to `/features#smart-job-feed` where possible.

## Copy Rewrite Plan

### Home Page

File: `src/app/page.tsx`

Finish and polish the current partial rewrite.

Tasks:

- Update metadata and structured data from "AI job application assistant" to "find jobs and write applications."
- Add Smart Job Feed and Application Tracker to structured-data feature list.
- Keep the new hero direction, but tighten copy if needed.
- Make sure hero stats are accurate and not misleading.
- Keep the two-pillar section, but polish spacing, copy and image treatment.
- Finish the 5-step workflow.
- Add a visual workflow image or product screenshots if it improves scanability.
- Update Product Showcase intro and content so Job Feed appears first.
- Preserve Trustpilot reviews.
- Preserve founder story copy.
- Rewrite homepage pricing cards to match pricing page language.
- Keep calculator concept, but improve section framing if useful.
- Rewrite final CTA around complete job search in one app.

### Product Showcase

File: `src/components/marketing/ProductShowcase.tsx`

Current issue:

- It still uses old `showcase-*.jpg` screenshots.
- It does not show the Smart Job Feed first.

Tasks:

- Replace legacy screenshots with new dashboard screenshots from `public/screenshots/`.
- Reorder showcase:
  1. Smart Job Feed
  2. Fit Analysis
  3. Application Kit generated package
  4. Tailored CV
  5. Cover Letter
  6. Application Email
  7. Application Tracker
- Use screenshots with clear alt text.
- Keep cards polished and readable on mobile.

### Features Page

File: `src/app/features/page.tsx`

Current issue:

- Smart Job Feed and Tracker are partly added.
- Plan table still says Free 10, Plus 100 and applications Free 5, Plus 50.
- Feature order can be improved.
- Some copy still overuses "agentic" and old positioning.

Tasks:

- Add section IDs, especially `id="smart-job-feed"` for footer and cross-page links.
- Correct plan table:
  - Credits/month: 4, 50, 200.
  - Applications/month: about 2, 25, 100.
  - Smart Job Feed: Free none, Plus up to 15/day, Max up to 25/day.
  - Application Tracker: all plans.
- Rewrite hero to "find jobs and apply smarter."
- Keep clear feature cards, but add screenshots or generated icons where design helps.
- Add Smart Job Feed FAQ.
- Add Application Tracker FAQ.
- Remove or soften unsupported-sounding claims if needed.

### Pricing Page

Files:

- `src/app/pricing/page.tsx`
- `src/app/pricing/layout.tsx`

Current issue:

- Pricing card bullets partly updated.
- Hero still says "full AI agent" and "automation."
- FAQ still omits follow-up email in first answer.
- FAQ uses "agentic" language.
- Credit tiles omit follow-up email in one place.
- Decorative blurred orbs remain in the time-savings section and CTA sections.

Tasks:

- Rewrite hero around free trial, daily hand-picked jobs and complete application packages.
- Rework Free, Plus and Max cards for value:
  - Free: test quality, 2 complete applications, tracker, fit score.
  - Plus: up to 15 hand-picked jobs/day, about 300/month, 25 applications, history, add-ons, priority support.
  - Max: up to 25 hand-picked jobs/day, about 500/month, 100 applications, screening answers, premium support.
- Remove all Chrome extension and Coming Soon references.
- Replace "full automation" language with accurate high-volume language.
- Fix FAQ:
  - Include follow-up email in each application package.
  - Explain Smart Job Feed.
  - Explain Job Feed plan access.
  - Explain add-ons and credit rollover.
- Fix "How Credits Work":
  - Full application includes CV, cover letter, application email and follow-up email.
  - Include follow-up regeneration or use "Email regen: application or follow-up."
- Update layout metadata.
- Improve visual hierarchy of pricing cards without introducing a new component unless needed.

### Navbar and Footer

Files:

- `src/components/marketing/Navbar.tsx`
- `src/components/marketing/Footer.tsx`

Tasks:

- Keep nav mostly unchanged.
- Consider changing CTA casing to "Try it free" for a more human tone.
- Update footer brand tagline to "Find jobs. Write applications. Track progress. All in one app."
- Add Smart Job Feed product link to `/features#smart-job-feed`.
- Keep legal/company links unchanged.

### Comparison Pages

Files:

- `src/lib/comparisons/data.ts`
- `src/components/comparisons/*` only if layout needs the new comparison image.

Current issue:

- Karko is still described as missing tracking in some comparisons.
- Smart Job Feed is absent.
- Chrome extension absence appears as a con.

Tasks:

- Update Karko overview descriptions to "platform" rather than only "assistant."
- Add Smart Job Feed to Karko key features/pros.
- Add Application Tracker to Karko key features/pros.
- Remove "No job tracking yet" and "No Chrome extension" from Karko cons.
- Update Teal and Enhancv comparisons specifically, because they currently use tracking as a competitor-only advantage.
- Add Smart Job Feed rows in summary tables where relevant.
- Keep competitor descriptions fair.
- Do not overclaim against competitors.
- Optionally use `/images/comparison-page-hero.webp` if layout changes are small and clean.

### Blog Listing and Product SEO Pages

Files:

- `src/app/blog/page.tsx`
- `src/app/ai-job-application/page.tsx`
- Targeted product SEO pages only where they contradict new positioning.

Tasks:

- Update blog listing CTA from "generate your application" to "find jobs and apply smarter."
- Update `/ai-job-application` overview to mention Smart Job Feed and tracking.
- Keep evergreen blog posts mostly intact unless they include stale Karko positioning.
- Do a grep pass for stale phrases.

### In-App Conversion Surfaces

Files:

- `src/components/InsufficientCreditsModal.tsx`
- `src/components/ui/LowCreditsModal.tsx`
- `src/components/ui/LowCreditsBanner.tsx`
- `src/components/ui/CreditIndicator.tsx`
- `src/components/SignUpWallModal.tsx`
- `src/components/settings/SubscriptionSection.tsx`
- `src/components/ChatPanel.tsx`
- `src/components/job-feed/JobFeedPanel.tsx`

Tasks:

- Remove Chrome extension from upgrade modals and settings plan table.
- Add Smart Job Feed value to Plus and Max upgrade surfaces.
- Fix SubscriptionSection hours saved and plan comparison.
- Add Application Tracker row where useful.
- Clarify anonymous trial vs Free plan.
- Add follow-up email regeneration to credit usage if present.
- Keep Job Feed wizard copy mostly intact because it is already practical and clear.

## Design Plan

### Design Direction

Use a warm editorial SaaS feel:

- Cream background for warmth.
- Navy for authority.
- Gold for action and emphasis.
- Real screenshots for product credibility.
- GPT images only for explanation and atmosphere.
- No purple/blue gradient SaaS feel.
- No decorative orb-heavy backgrounds.
- No nested cards.
- No landing-page fluff before the actual product promise.

### Home Page Design

- Keep the centered hero, but add subtle product proof or brand illustration without clutter.
- Use two-pillar cards with generated images to explain the new product model.
- Make the 5-step workflow compact and scannable.
- Use real Job Feed screenshot in the Product Showcase.
- Make final CTA a strong navy band, using `cta-background-navy.webp` subtly if it does not reduce readability.

### Features Page Design

- Keep feature cards scannable.
- Add product screenshots to the most important features:
  - Smart Job Feed
  - Fit Analysis
  - Application Kit
  - Tracker
- Use generated icons for supporting features.
- Avoid overloading the page with too many large screenshots.

### Pricing Page Design

- Keep three cards, but improve hierarchy.
- Make plan differences visible in the first 5 seconds:
  - Free: test quality.
  - Plus: daily hand-picked jobs plus 25 applications.
  - Max: highest-volume feed plus 100 applications.
- Make credit math secondary, not the headline.
- Remove Coming Soon visual chips.
- Use compact comparison or FAQ copy for details.

### Screenshots and Generated Images

- Replace old legacy product shots with current screenshots.
- Use Product Showcase for real UI.
- Use generated illustrations for:
  - two-pillar explanation
  - workflow accents
  - final CTA texture
  - empty state or feature icon accents

## Implementation Order After Confirmation

1. Finish copy fixes and stale claim cleanup:
   - Chrome Extension
   - Coming Soon
   - Free 10 / Plus 100
   - Job tracking roadmap
   - missing follow-up email
   - "agentic" overuse

2. Finish homepage:
   - metadata
   - structured data
   - hero polish
   - two-pillar polish
   - 5-step workflow
   - Product Showcase with new screenshots
   - pricing card copy
   - final CTA

3. Finish features page:
   - Smart Job Feed section ID
   - corrected table
   - FAQ
   - screenshot-enhanced feature design if not too heavy

4. Finish pricing page:
   - hero
   - cards
   - credit tiles
   - FAQ
   - final CTA
   - metadata

5. Finish shared marketing:
   - footer
   - nav CTA casing if appropriate

6. Update comparisons:
   - Karko platform framing
   - Smart Job Feed
   - Application Tracker
   - remove roadmap/tracking gaps

7. Update targeted blog/SEO and app conversion surfaces.

8. Verification:
   - grep stale phrases
   - run TypeScript check
   - run lint
   - run build if needed
   - visually inspect main marketing pages with local server and browser screenshots if available

## Verification Commands

Use the project scripts after implementation:

```bash
npm run build
```

Also run targeted grep checks:

```bash
rg -n "Chrome Extension|Coming Soon|Free gets 10|Plus gets 100|No job tracking|roadmap|agentic|full automation" src docs
```

If lint/typecheck scripts are available, run them too.

## Stop Point

This file is the plan. I should not make code changes for the rewrite/redesign until the user confirms this plan or gives edits.

