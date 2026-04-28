# Karko AI Homepage and Pricing UI, UX, Asset, and Copy Audit

Date: April 27, 2026

Scope: homepage, pricing page, pricing cards, CTAs, hero sections, product screenshots, time savings calculator, trust sections, founder story, reviews, credibility, backgrounds, animation, section rhythm, responsive risks, and screenshot naming.

This audit does not include implementation changes.

## 1. Executive Summary

Karko AI now has a stronger product than the homepage and pricing page communicate. The product is no longer a simple AI document generator, but the pages still behave like a feature-heavy SaaS landing page trying to prove everything at once. The best story is clear: Karko finds jobs for the user, checks fit, creates a complete application kit quickly, and keeps everything tracked. That story is present, but it is diluted by repeated cards, too many sections, outdated screenshots, credit-first pricing language, decorative motion, and trust signals that feel under-leveraged.

The homepage succeeds in naming the new positioning early: "Find your next job and apply in 90 seconds" plus daily hand-picked roles is directionally right. The problem is that the first viewport has no real product image, no visible job feed proof, and no crisp "what happens after I click" explanation beyond abstract stats. A premium job seeker tool should show the workflow immediately. Right now the page makes the user scroll through illustrations, logo marquee, cards, cards again, screenshots, reviews, trust, founder, pricing, calculator, final CTA, and Master CV. It feels busy and somewhat template-like even though many components are individually polished.

The pricing page is clearer than the homepage, but it still relies too much on credits. Users do not buy credits. They buy daily job discovery, faster applications, less admin, and confidence before applying. The plan cards mention job feed caps, but the hierarchy still centers credit quantities and "Need more credits?" expanders before the value difference between plans is fully understood. Plus and Max should be framed as job search operating modes, not storage bins of credits.

The biggest issue is the screenshot system. Several ProductShowcase screenshots are mismatched against their labels, filenames, or nearby copy. The most serious mismatch is `01-smart-job-feed-populated.webp`, which actually shows the CV tab and application package ready state, not the Smart Job Feed. `03c-cv-tailored-clean.webp` actually shows the Job Feed with generation progress, not a tailored CV. `03-application-kit-generated.webp` shows a tailored CV screen, not the Application Kit overview. The homepage currently teaches the product with incorrect visual evidence.

The visual direction is close to premium but not yet there. The palette is calm and trustworthy, but the large rounded cards, shimmer headline, animated gradient border, CTA glow, cloud background, dot grids, gold gradients, and repeated hover lifts make the page feel over-decorated. Premium SaaS for anxious job seekers should feel quieter, more direct, and more grounded in the product.

Top recommendation: rebuild the homepage narrative around one strong first-screen product proof, one concise workflow section, one curated screenshot sequence with correct labels, a simplified trust/founder block, and a pricing section that explains outcomes instead of credits first. For pricing, remove the expandable add-on controls from the card body, add a plan comparison row for daily jobs and complete applications, and lead each plan with the user scenario it serves.

## 2. Homepage Section-by-Section Audit

### Navbar

What works:

- Clear navigation structure.
- Sticky floating header feels modern.
- Primary CTA is always available.

What is weak:

- "Try It Free" and hero "Start free, no credit card" are similar but not identical. The page lacks one consistent primary CTA phrase.
- Navigation includes "Features," "How It Works," "Pricing," "Blog," "About," and "Contact." For a conversion-focused premium homepage, this is a little broad. "Contact" in the top nav is low priority.
- The floating rounded nav uses the same large radius language as many cards, which adds to the soft, pill-heavy look.

Recommendation:

- Use one CTA label everywhere: "Start free" or "Start with 2 free applications."
- Consider replacing "Contact" with "Reviews" or removing it from desktop nav.
- Keep nav, but reduce radius slightly and tighten horizontal spacing for a more grown-up SaaS feel.

### Hero

Current message:

- Headline: "Find your next job and apply in 90 seconds"
- Subcopy: "Karko finds hand-picked roles for you every morning, then writes a tailored CV, cover letter and emails for each one. All in one place."

What works:

- New positioning is visible immediately.
- The job feed plus application kit idea is present.
- The promise is simple enough for job seekers to understand.
- Stats under the CTA help communicate daily jobs, application speed, and document count.

What is weak:

- The hero has no product screenshot. For a job search workspace, this is a missed opportunity. The claim "find jobs and apply" needs immediate visual proof.
- "Apply in 90 seconds" can sound like Karko submits the application, not that it creates the application materials. That ambiguity matters.
- The hero focuses on speed more than confidence. Job seekers care about fast, but they also worry about quality, fit, and not looking generic.
- The shimmer headline effect makes the page feel a little less premium.
- The cloud background is soft but not product-relevant. It makes the opening feel decorative rather than useful.

Recommended direction:

- Add a real product visual above the fold: a combined Job Feed plus Application Kit screenshot, or a composed split workflow showing "jobs found today" and "application package ready."
- Rewrite headline to make the workspace obvious.

Suggested copy:

```text
Your job search, organized in one AI workspace
```

Alternative:

```text
Get matched jobs and complete applications in one place
```

Suggested subcopy:

```text
Karko finds relevant jobs each day, checks your fit, writes the tailored CV, cover letter, application email, and follow-up, then tracks every application.
```

Suggested primary CTA:

```text
Start with 2 free applications
```

Suggested secondary CTA:

```text
See the workflow
```

### Trust Bar

Current section:

- "Optimized for the tools recruiters use"
- Animated marquee with Workday, Greenhouse, Lever, SAP SuccessFactors, iCIMS, Taleo, BambooHR, SmartRecruiters.

What works:

- Addresses ATS and recruiting software anxiety.

What is weak:

- It can imply official integrations or platform partnerships. "Optimized for the tools recruiters use" is safer than "integrated," but the animated logo-style text still feels like a pseudo-logo strip.
- The marquee adds motion early, but not much conversion value.
- It is visually generic.

Recommendation:

- Replace with a static proof strip focused on user outcomes.

Suggested copy:

```text
ATS-safe documents. Honest fit checks. Every application saved in your tracker.
```

If keeping recruiter tools, make it plain text:

```text
Built for applications submitted through Workday, Greenhouse, Lever, SAP SuccessFactors, and similar ATS portals.
```

### Two Pillars

Current section:

- Two cards: "Jobs picked for you, every morning" and "A full application in 90 seconds."
- Uses generated illustration assets.

What works:

- Correctly simplifies the product into Job Feed and Application Kit.
- Copy is strong and concrete.

What is weak:

- The illustrations feel too abstract and slightly stock-like. They are pretty, but not as convincing as real product.
- "Two problems. One app." is clear but bland.
- The two cards are another pair of rounded white cards after an already soft hero, which starts the page on a card-heavy rhythm.

Recommendation:

- Replace generated illustrations with cropped real UI states or small product panels.
- Use this section as a bridge from hero to workflow, not as another decorative card block.

Suggested heading:

```text
The two parts of a focused job search
```

Suggested labels:

```text
1. Jobs worth your time
2. Applications ready to send
```

### How It Works

What works:

- Five steps map well to the actual product.
- The sequence includes upload CV, job feed, fit analysis, application kit, tracker.

What is weak:

- Five small cards create scanning friction.
- The section repeats the Two Pillars and ProductShowcase story.
- Step 03 says "before spending credits," which introduces pricing mechanics too early.
- On mobile, five cards could become a long stack before the user sees product proof.

Recommendation:

- Keep the five-step story, but make it more editorial and compact.
- Use a horizontal timeline on desktop and a tight vertical timeline on mobile.
- Remove credit language from homepage workflow.

Suggested copy:

```text
Upload your CV once.
Set the jobs you want.
Review your best matches.
Generate the full application kit.
Track every application.
```

### Product Showcase

What works:

- The section is conceptually important. Users need to see the product.
- It covers the correct feature set: job feed, details, fit analysis, application kit, CV, cover letter, email, tracker.

What is weak:

- This section is far too long. Eight stacked screenshot cards create a heavy scroll wall.
- Several screenshots do not match their labels or nearby copy. See Screenshot and Asset Naming Audit.
- The screenshots are full-width and visually dense, but not curated. The page shows raw app states instead of a guided narrative.
- The card labels take up meaningful vertical space and repeat information already shown in the screenshot.
- Some screenshots show internal credits, profile avatars, MAX badges, and personal-looking details. This distracts from the buyer story.

Recommendation:

- Replace eight stacked cards with a shorter, curated product story.
- Use 3 to 4 strong visuals:
  - Smart Job Feed with ranked daily matches.
  - Job detail plus fit analysis.
  - Application Kit ready state with CV, cover letter, email, and follow-up.
  - Tracker overview.
- Crop or design screenshots so the key product moment is visible immediately.
- Use callouts sparingly, not large repeated cards.

### Trustpilot Reviews

What works:

- Real review content should be preserved.
- Trustpilot logo and names add credibility.

What is weak:

- Only two reviews can feel thin if presented as a large section.
- Review language is authentic but not premium. It has grammar issues and broad praise. That is okay for authenticity, but the layout should not overinflate it.
- The section headline "What Job Seekers Are Saying" is generic.
- Trustpilot logo has a large shadowed pill asset that feels less refined than the rest of the page.

Recommendation:

- Preserve review content, but make the section tighter.
- Add a small trust context line, such as "Early users on Trustpilot."
- Use a cleaner Trustpilot mark if allowed, or simplify the logo presentation.

Suggested heading:

```text
Early users are already saving time
```

Suggested support copy:

```text
Real reviews from job seekers using Karko to create targeted applications faster.
```

### Why Trust Karko AI

What works:

- Addresses quality, truthfulness, fit score, and specialization.
- These are important objections.

What is weak:

- The Anthropic image is not an Anthropic logo. It is a generic "AI" tile. This damages trust because the visual proof does not match the label.
- "Claude Sonnet 4.6" is very model-centric. Job seekers care less about the model name than about output quality and not making things up.
- "Self-Refining AI" sounds like AI hype. It is not concrete enough.
- The section title "Why Trust Karko AI" is blunt and a bit defensive.
- More rounded cards appear again, reinforcing the template feel.

Recommendation:

- Replace the Anthropic image with the actual Anthropic mark or remove the image and treat model info as a small proof note.
- Reframe the section around safeguards.

Suggested heading:

```text
Built to keep applications accurate
```

Suggested bullets:

```text
Uses your CV as the source of truth.
Shows fit before you generate documents.
Keeps every application tied to the job and company.
Lets you review and edit before sending.
```

### Founder Story

What works:

- The founder story is strong and human.
- It directly connects to the job seeker pain.
- The photo makes the company feel real.

What is weak:

- The story still frames Karko as "paste a job description, get a tailored CV, cover letter, and professional email," which underplays the new complete workspace.
- The card layout is heavy and familiar.
- The quote decoration is unnecessary.
- The founder photo is real but casual. It can work, but the surrounding layout should make it feel intentional.

Recommendation:

- Preserve story content, but update the second paragraph to include daily jobs, fit analysis, and tracker.
- Reduce decorative quote treatment.
- Add a clear line after the story that ties it to product principles.

Suggested replacement paragraph:

```text
So I built Karko AI to handle the whole workflow: find relevant jobs, check fit, create the tailored application kit, and keep every application organized. Within about 20 applications, I got my first interview. That is when I knew this needed to exist for other job seekers.
```

### Homepage Pricing

What works:

- Pricing appears after product, trust, and founder context.
- Free, Plus, and Max are easy to compare at a glance.
- The new job feed limits are visible in Plus and Max.

What is weak:

- The pricing cards still lead with credits. Credits are internal accounting, not customer value.
- Plus says "SAVE ~18 HOURS/MONTH" while Max says "SAVE ~108 HOURS EVERY MONTH." The jump is huge and not intuitively explained in the cards.
- Free includes "Application tracker included," but paid cards say "Unlimited application history." The difference needs clearer explanation.
- The home pricing section duplicates the dedicated pricing page nearly line for line.
- The "Claude Sonnet 4.6 by Anthropic" pill repeats the same model proof and uses the same incorrect Anthropic image.

Recommendation:

- Make home pricing a simplified decision section, not a full copy of pricing page.
- Lead each plan with user intent:
  - Free: test quality.
  - Plus: active job search.
  - Max: high-volume search with screening answers.
- Move credits into a secondary line.

### Time Savings Calculator

What works:

- Strong concept. Time saved is a core value driver.
- The tier selector is simple.
- Defaulting to Plus is commercially sensible.

What is weak:

- The math feels inconsistent. Plus: 25 apps saves 18 hours, but 45 to 60 minutes per application would imply closer to 19 to 25 hours before subtracting generation time. Max: 100 apps saves 108 hours, which exceeds the 45 to 60 minute baseline unless additional work is included. This needs a clear formula.
- "At ~$0.80 per application" is useful, but it competes with time savings.
- It ignores Smart Job Feed time savings, which is a major paid-plan differentiator.
- The component is duplicated in homepage and pricing code, increasing the chance of future inconsistency.

Recommendation:

- Use one shared calculator component.
- Show two savings dimensions:
  - Application writing time saved.
  - Job discovery and tracking time reduced.
- Make the formula explicit and conservative.

Suggested copy:

```text
Estimate based on 45 minutes of writing and editing per tailored application. Job discovery time is not included.
```

If including job feed:

```text
Estimate includes tailored application writing time only. Daily job discovery can save additional search time.
```

### Final CTA

What works:

- Clear closing CTA.
- Mentions two free applications and daily job matches.

What is weak:

- "Make your next application feel clear and fast" is soft. The product value is bigger than one application.
- The dark CTA background uses another decorative image and dot grid. It looks polished but generic.
- The CTA repeats the same two-button pattern without adding new conviction.

Recommendation:

- Make the final CTA outcome-based.

Suggested copy:

```text
Start your next job search with a workspace built for it
```

```text
Try 2 complete applications free. Upgrade when you want daily job matches and higher monthly volume.
```

### Master CV Section

What works:

- Master CV is important context for output quality.
- It helps users who may not be ready.

What is weak:

- It appears after the final CTA, which creates an awkward page ending. The final CTA should feel final.
- It introduces a secondary educational path after asking users to start.
- It may make the product feel more complex at the end.

Recommendation:

- Move Master CV earlier into a compact FAQ, onboarding note, or "How Karko gets better output" section.
- Or keep it below final CTA only if the CTA is not styled as final.

## 3. Pricing Page Section-by-Section Audit

### Pricing Hero

What works:

- Direct and clear.
- Mentions Free, daily hand-picked jobs, more applications, history, and screening answers.
- Pricing page does not waste space on generic marketing.

What is weak:

- "Choose the plan for your job search" is functional but not persuasive.
- The hero repeats the Anthropic pill with a mismatched image.
- It does not show the core plan difference visually: Free tests quality, Plus runs a focused search, Max supports high volume.

Recommendation:

Suggested heading:

```text
Choose how much of your job search Karko should run
```

Suggested subcopy:

```text
Start free with 2 complete applications. Upgrade for daily job matches, higher application volume, longer history, and screening answers.
```

### Pricing Cards

What works:

- Plans are scannable.
- Plus is clearly featured.
- Free, Plus, and Max have differentiated feature bullets.
- Pricing is transparent.

What is weak:

- Cards center "4 credits," "50 credits," and "200 credits." This forces the user to learn the internal unit before understanding value.
- The "Need more credits?" expandable add-on control appears before the feature list on the pricing page. That is too early. It distracts from plan selection.
- Plus and Max both say "Cancel anytime. No contracts." This is important, but it uses valuable card space that could clarify plan value.
- Max value is not strong enough. It has 100 applications and screening question answers, but the job feed difference is just one bullet.
- "AI Screening Question Answers" is capitalized like a feature label, but users need to know why it matters.
- Plus "SAVE ~18 HOURS/MONTH" and Max "SAVE ~108 HOURS EVERY MONTH" create a mismatch in tone and math.
- The cards do not explain whether Free includes Smart Job Feed. Based on positioning, Free appears to test Application Kit only, but the card does not explicitly say Smart Job Feed starts on Plus.

Recommendation:

- Lead with complete applications and daily jobs, then show credits as a small footnote.
- Add a small "Best for" line at the top of each plan.
- Move add-on packs below the plan comparison, not inside cards.
- Add an explicit line: "Smart Job Feed starts on Plus."

Suggested plan framing:

Free:

```text
Best for testing output quality
2 complete applications per month
No daily job feed
```

Plus:

```text
Best for an active search
Up to 15 jobs per day
25 complete applications per month
```

Max:

```text
Best for high-volume searches
Up to 25 jobs per day
100 complete applications per month
Screening question answers included
```

### Time Savings Calculator

What works:

- Good reassurance after price cards.
- Reinforces the economics of Plus and Max.

What is weak:

- The same math concerns from homepage apply.
- It appears after cards, which is fine, but could be more persuasive if included as a compact "why this pays for itself" row above FAQ.
- It duplicates code instead of using the homepage component.

Recommendation:

- Keep it, but tighten formula and add job feed disclaimer.
- Consider showing "manual applications replaced" rather than only "hours saved."

### How Credits Work

What works:

- Clarifies the credit mechanics.
- Helpful for users who need exact consumption rules.

What is weak:

- It makes pricing feel more complicated.
- "Credits are simple" is contradicted by 0.5-credit actions, 2-credit actions, monthly credits, add-on credits, rollover credits, and plan caps.
- The Full Application tile says "CV + Cover Letter + Email + Follow-up," which is accurate, but some older docs and sections elsewhere omit follow-up.

Recommendation:

- Put credit mechanics after a simpler plan comparison.
- Rename section to reduce friction.

Suggested heading:

```text
What counts as a complete application?
```

Suggested copy:

```text
One complete application includes a tailored CV, cover letter, application email, and follow-up email. Fit analysis and regenerations use smaller credit amounts.
```

### FAQ

What works:

- Covers important objections.
- Includes Smart Job Feed explanation.
- Mentions competitors and model.

What is weak:

- FAQ is long and partly SEO-driven.
- Competitor FAQs on the pricing page may distract users who are ready to choose a plan.
- "Are all features the same across plans?" answer says every plan includes the Application Kit, fit analysis, ATS templates, Master CV support, PDF export, and tracker. It then says Plus adds Job Feed and Max adds screening answers. This is clear, but the question wording invites confusion.
- "How is KarKo different from other resume builders?" uses the brand as "KarKo," while most page copy says "Karko." Brand capitalization is inconsistent.

Recommendation:

- Reorder FAQs by buyer concern:
  - What do I get?
  - Does Free include Job Feed?
  - How do credits work?
  - Can I cancel?
  - What happens when I run out?
  - How does Smart Job Feed work?
  - What AI model is used?
- Move competitor comparison links lower or into a compact "Compare Karko" block.

### Pricing Final CTA

What works:

- Restates the one-dashboard value.
- Primary CTA is clear.

What is weak:

- "Ready to make Karko your job search home?" is warm but vague.
- The secondary CTA says "See How It Works" but links to `/`, not directly to `/#how-it-works`. That is a flow issue.
- The dark CTA repeats the homepage final CTA pattern.

Recommendation:

- Link secondary CTA to `/#how-it-works`.
- Use clearer copy.

Suggested heading:

```text
Start with 2 complete applications
```

Suggested support copy:

```text
Test the quality for free. Upgrade when you want daily job matches and more monthly applications.
```

## 4. Pricing Card Audit

### Overall Card Problems

- Cards are visually polished, but too much of the hierarchy is spent on plan decoration: icons, ribbons, gradients, badges, animated border, rounded containers, and CTAs.
- The cards explain "what you get" but not "why this plan is right for me" clearly enough.
- Credits are too prominent.
- The plan upgrade ladder is not explicit enough:
  - Free: try Application Kit.
  - Plus: add daily job feed and a serious monthly volume.
  - Max: higher job feed volume, much higher application volume, and screening answers.
- The "Need more credits?" control inside paid cards feels like an upsell before the user has chosen a plan.
- Plan badges are inconsistent in tone:
  - "MOST POPULAR | SAVE ~18 HOURS/MONTH"
  - "SAVE ~108 HOURS EVERY MONTH"

### Free Card

What works:

- "2 complete applications/month" is clear.
- Good for low-friction trial.

What is weak:

- "Try the full AI agent" overpromises if Smart Job Feed is paid-only.
- It does not explicitly say Free is primarily for Application Kit testing.
- "4 credits/month" introduces unnecessary accounting.

Recommended copy:

```text
Free
Test the Application Kit
2 complete applications per month
Fit analysis included
Tracker included
Smart Job Feed starts on Plus
```

CTA:

```text
Start free
```

### Plus Card

What works:

- Strong price for active job seekers.
- Includes the new daily job feed value.

What is weak:

- The card says "~300/month" but does not explain that this is based on weekdays or daily delivery assumptions. If "up to 15 jobs/day" is everyday, 15 times 30 is 450, so "~300/month" implies business days. This needs clarity.
- "25 complete applications/month" competes with "~300 jobs/month." The relationship should be explained: Karko finds many jobs, user chooses which to apply to.
- "Priority email support" is low conversion value compared with daily job discovery.

Recommended copy:

```text
Plus
For an active search
Up to 15 matched jobs per day
25 complete applications per month
Fit analysis before you apply
Unlimited application history
Add-on packs available
```

Badge:

```text
Most popular for active searches
```

CTA:

```text
Get Plus
```

### Max Card

What works:

- 100 complete applications per month is high-volume and clear.
- Screening answers can be a strong differentiator.

What is weak:

- Max does not feel $60/month more valuable at first glance. It needs a stronger narrative around high-volume, multiple target roles, more daily matches, screening answers, and support.
- "Premium dedicated support" is vague.
- The card should make the Max upgrade path obvious for users applying across several roles, markets, or seniority bands.

Recommended copy:

```text
Max
For high-volume searches
Up to 25 matched jobs per day
100 complete applications per month
Screening question answers
More room for multiple roles and locations
Premium support
```

Badge:

```text
For high-volume searches
```

CTA:

```text
Get Max
```

### Credit Math Risk

Current pricing uses:

- Free: 4 credits, 2 complete applications.
- Plus: 50 credits, 25 complete applications.
- Max: 200 credits, 100 complete applications.
- One complete application costs 2 credits.

Risk:

- If the user performs fit analysis before each application at 0.5 credits, then "25 complete applications/month" may not be true if those complete applications include fit analysis first. The page currently treats complete applications and fit analysis as included in every plan, but the credit system charges fit analysis separately.

Recommendation:

- Clarify whether a "complete application" includes fit analysis or whether fit analysis is an optional pre-check.

Suggested copy:

```text
Each complete application uses 2 credits. Fit analysis is optional and uses 0.5 credits.
```

Or, if product policy allows:

```text
Each complete application includes the full kit. Fit checks are included before you generate.
```

## 5. CTA and Conversion Flow Audit

### Current CTA Inventory

- Navbar: "Try It Free"
- Hero: "Start free, no credit card"
- Hero secondary: "See How It Works"
- Pricing card Free: "Start Free"
- Pricing card Plus: "Get Plus"
- Pricing card Max: "Get Max"
- Final CTA: "Start Free"
- Final CTA secondary: "View Pricing" or pricing page "See How It Works"
- Footer: "Start free, no credit card"

What works:

- CTAs are visible and frequent.
- Free trial is low friction.

What is weak:

- CTA language is inconsistent.
- `/dashboard` as the primary free destination may be correct, but the page does not explain whether the user will sign up, upload CV, or start anonymously.
- The pricing page secondary CTA links to `/`, not the exact workflow section.
- Paid CTAs on pricing redirect unauthenticated users to signup with plan param, which is fine, but the UI copy does not set that expectation.

Recommended CTA system:

- Primary trial CTA: "Start with 2 free applications"
- Short version for small spaces: "Start free"
- Paid CTA: "Get Plus" and "Get Max"
- Secondary CTA: "See the workflow"
- Pricing detail CTA: "Compare plans"

Recommended flow:

1. Homepage hero CTA goes to the fastest free activation path.
2. Secondary CTA scrolls to a short product workflow with real UI.
3. Pricing section CTA to `/pricing` only after a compact plan preview.
4. Pricing paid CTA handles signup with plan context.
5. Final CTA repeats the same primary free CTA.

## 6. Visual Design and Premium-Feel Audit

What feels premium:

- Warm cream, navy, and gold palette is aligned with trust and career seriousness.
- Typography hierarchy is mostly clear.
- The product UI screenshots themselves are calm and high-quality in many places.
- Founder photo and real reviews help avoid faceless SaaS.

What weakens premium feel:

- Too many rounded white cards.
- Too much gold gradient treatment.
- Shimmer text, animated border, and CTA glow feel like conversion tricks rather than quiet confidence.
- Abstract generated images look polished but not persuasive.
- The page repeats similar section structures: eyebrow, centered heading, centered paragraph, card grid.
- Several screenshots are huge, raw, and mislabeled, which makes the page feel less considered.
- The Anthropic image mismatch hurts credibility.
- The cloud hero background feels soft but unrelated to job search.

Recommendation:

- Reduce decorative motion by at least 50 percent.
- Use real product visuals earlier.
- Use fewer cards, more structured layouts.
- Keep gold as an accent, not the main attention engine.
- Reduce border radius from `rounded-2xl` in marketing sections where possible.
- Create a more editorial visual rhythm:
  - Hero with product proof.
  - Light product explanation.
  - Workflow.
  - Screenshots.
  - Trust.
  - Pricing.
  - Final CTA.

## 7. Background, Animation, Transition, and Micro-Interaction Audit

### Backgrounds

Current patterns:

- Cream page background.
- Cloud hero background.
- Section fade overlays.
- Dot grid in trust and CTA areas.
- Dark CTA background image.

What is weak:

- The cloud background is not product-relevant.
- Dot grids are common SaaS decoration and do not add meaning here.
- Section fade overlays are subtle, but they create sameness across the page.
- The dark CTA background is generic and image-like rather than product-specific.

Recommendation:

- Remove clouds from hero or replace with a subtle product workspace background.
- Use flat section backgrounds with clearer rhythm.
- Use product screenshots as the main visual energy, not patterns.

### Animations

Current patterns:

- ScrollReveal on most sections.
- Logo marquee.
- Shimmer headline.
- Animated pricing border.
- Hover lift cards.
- CTA glow.
- Count-up stats.

What is weak:

- Too many elements animate. This can feel busy and less premium.
- ScrollReveal everywhere makes the page feel staged.
- Shimmer and CTA glow are the least premium motion choices.
- Animated gradient border on Plus may distract from comparing plan content.

Recommendation:

- Keep only:
  - Subtle scroll reveal for major sections.
  - Count-up in calculator.
  - Gentle button hover states.
- Remove or reduce:
  - Hero shimmer.
  - CTA glow.
  - Animated pricing border.
  - Logo marquee.
  - Most card hover lift effects.

### Loading and Interaction Feel

What works:

- Pricing buttons show loaders.
- Accordions and expanders have transitions.

What is weak:

- Add-on purchase buttons are nested inside plan cards and can become visually noisy.
- FAQ expands abruptly in height without much affordance beyond chevron.

Recommendation:

- Move add-on purchase below pricing cards.
- Use simple accordion animation and keep pricing cards stable.

## 8. Screenshot and Asset Naming Audit

### Screenshots Used on Homepage

The homepage ProductShowcase uses these assets:

| File | Nearby label | Visual audit | Status |
| --- | --- | --- | --- |
| `public/screenshots/01-smart-job-feed-populated.webp` | Smart Job Feed | Shows Application Kit CV tab with application package ready message, ATS score, and right assistant panel. It does not show the Smart Job Feed. | Replace or rename. Current use is incorrect. |
| `public/screenshots/02-job-detail-modal.webp` | Job Detail | Correctly shows Job Feed detail modal with role details and apply actions. | Keep, but crop tighter and anonymize company if needed. |
| `public/screenshots/04-fit-analysis-result.webp` | Fit Analysis | Shows fit analysis result. It is narrow portrait and visually unlike the other screenshots. It includes "GPT-4 usage" in content, which can conflict with Claude positioning. | Replace or update content. |
| `public/screenshots/03-application-kit-generated.webp` | Application Kit | Shows a tailored CV screen, not a full Application Kit overview. | Replace or rename. Current use is misleading. |
| `public/screenshots/03c-cv-tailored-clean.webp` | Tailored CV | Shows Job Feed with application generation progress on the right, not a tailored CV. | Replace or rename. Current use is incorrect. |
| `public/screenshots/13-cover-letter-panel.webp` | Cover Letter | Correctly shows cover letter panel. | Keep, but crop and remove excess chrome if used. |
| `public/screenshots/14-email-panel.webp` | Application Email | Correctly shows application email panel. | Keep, but consider showing follow-up toggle too. |
| `public/screenshots/05-application-tracker.webp` | Application Tracker | Correctly shows tracker. Lower resolution than most other screenshots. | Keep short term, replace with updated high-res capture. |

### Supporting Assets Used on Homepage and Pricing

| File | Usage | Visual audit | Status |
| --- | --- | --- | --- |
| `public/images/two-pillar-job-feed.webp` | Two Pillars Job Feed | Abstract generated job cards and compass. Attractive but generic. | Replace with product UI or keep only as secondary art. |
| `public/images/two-pillar-application-kit.webp` | Two Pillars Application Kit | Abstract documents and envelope. Premium-ish but generic. | Replace with product UI or keep only as secondary art. |
| `public/images/cta-background-navy.webp` | Final CTA background | Dark gradient/pattern. Generic, not product-specific. | Simplify or replace with subtle product texture. |
| `public/wasim-founder.jpg` | Founder story | Real and human. Casual outdoor portrait. | Keep, but style more intentionally. |
| `public/trustpilot-logo.png` | Reviews and footer | Large pill logo with heavy shadow. Feels chunky. | Replace with cleaner official mark if available. |
| `public/anthropic-icon.jpg` | Trust and pricing proof | This is not an Anthropic logo. It is a generic "AI" tile. | Replace immediately or remove. |

### Unused Screenshot Candidates

Observed assets in `public/screenshots`:

- `01b-job-feed-left-only.webp` is a clearer Smart Job Feed screenshot than the one currently used. It should replace `01-smart-job-feed-populated.webp` if using a job feed visual.
- `03a-application-kit-landing.webp` shows initial upload state. Useful for onboarding, less useful for premium homepage proof.
- `03b-application-kit-generating.webp` shows generation progress from Job Feed. Useful for demonstrating automation, but label it as generation progress, not Tailored CV.
- `07-documents-page.webp` is useful for document persistence, but not necessary on homepage.
- `10-dashboard-top-nav.webp` is mostly nav chrome and too shallow to be useful.
- `11-job-feed-empty-upsell.webp` actually shows a tracker-like view, not an empty job feed upsell. Filename appears mismatched.
- `12-profile-dropdown.webp` includes personal-looking name and email. Avoid marketing use.
- `showcase-cover-letter.jpg`, `showcase-ats-score.jpg`, and `showcase-follow-up.jpg` appear to be older, lower-quality, over-zoomed screenshots. They feel outdated and should not be used for premium marketing.

### Naming and Alt Text Problems

Current mismatch examples:

- `01-smart-job-feed-populated.webp` should not be used with alt "Karko AI Smart Job Feed with ranked jobs and fit scores."
- `03c-cv-tailored-clean.webp` should not be used with alt "Karko AI tailored CV panel showing an ATS-safe resume."
- `03-application-kit-generated.webp` should not be used with alt "Karko AI Application Kit with generated application materials."
- `04-fit-analysis-result.webp` includes content referencing GPT-4, while the page positions Claude Sonnet 4.6.

Recommended naming convention:

```text
job-feed-ranked-matches.webp
job-feed-detail-modal.webp
fit-analysis-result.webp
application-kit-generation-progress.webp
application-kit-ready-overview.webp
tailored-cv-panel.webp
cover-letter-panel.webp
application-email-panel.webp
follow-up-email-panel.webp
application-tracker-overview.webp
```

Recommended alt text pattern:

```text
Karko AI showing daily ranked job matches with fit labels
Karko AI job detail modal with role summary and apply action
Karko AI fit analysis showing match score, strengths, gaps, and recommendation
Karko AI application kit with CV, cover letter, application email, and follow-up email ready
Karko AI application tracker showing saved roles, match scores, and statuses
```

### Asset Quality Recommendation

Capture a fresh screenshot set from a single fictional user and a single fictional job search scenario. Use consistent viewport size, clean mock data, no real user emails, no inconsistent model references, no visible debug badges, no credit counts unless relevant, and no old nav states. Screenshots should be designed for marketing use, not copied raw from a dev session.

## 9. Copywriting and Messaging Audit

### What Is Clear

- Karko finds jobs.
- Karko creates tailored CVs, cover letters, application emails, and follow-up emails.
- Karko includes fit analysis and tracking.
- Free includes 2 complete applications.
- Plus and Max include daily job feed.

### What Is Confusing

- "Apply in 90 seconds" can sound like application submission.
- "Credits" and "complete applications" compete as the main unit of value.
- "15-25 jobs picked daily" in hero compresses Plus and Max into one stat, but Free does not get this.
- "~300/month" from 15 jobs/day needs a business-day assumption.
- "Try the full AI agent" is not precise if some core workspace features are paid.
- "Claude Sonnet 4.6" is repeated before the user understands the product benefit.
- Brand capitalization varies between Karko, KarKo, and Karko AI.

### Copy That Feels Generic or Salesy

- "Two problems. One app."
- "The full job search workflow, in one place"
- "Why Trust Karko AI"
- "Self-Refining AI"
- "Make your next application feel clear and fast"
- "Ready to make Karko your job search home?"
- "Premium dedicated support"

### Messaging Hierarchy Recommendation

Lead with outcomes in this order:

1. Karko finds relevant jobs daily.
2. You review fit before spending time.
3. Karko creates a complete application kit quickly.
4. Everything is saved in one tracker.
5. Free lets you test quality, paid plans unlock daily job discovery and more volume.

### Recommended Homepage Message Stack

Hero:

```text
Get matched jobs and complete applications in one place
```

Subcopy:

```text
Karko finds relevant jobs each day, checks your fit, writes the tailored CV, cover letter, application email, and follow-up, then tracks every application.
```

Proof row:

```text
2 free applications
Up to 25 jobs per day
Full application kit in under 90 seconds
```

### Recommended Pricing Message Stack

Pricing hero:

```text
Choose how much of your job search Karko should run
```

Subcopy:

```text
Start free with 2 complete applications. Upgrade when you want daily job matches, more monthly applications, and help with screening answers.
```

Plan comparison label:

```text
Free tests the quality. Plus supports an active search. Max is for high-volume searches.
```

### Language Cleanup

- Use "Karko" consistently unless the legal brand is definitively "KarKo."
- Use "complete application" consistently to mean CV, cover letter, application email, and follow-up email.
- Use "daily matched jobs" instead of "hand-picked jobs" if actual process is automated ranking. "Hand-picked" can imply manual human curation.
- Use "fit analysis" instead of "honest fit score" when explaining the feature, and use "honest fit score" only as a benefit phrase.
- Avoid "AI agent" in top-level marketing unless explaining the product architecture.

## 10. Mobile and Responsive Risks

High-risk areas:

- Hero headline is very large and may push proof and CTAs too far down on mobile.
- ProductShowcase has eight full-width screenshot cards. On mobile this becomes a very long scroll with dense, hard-to-read images.
- Pricing cards have long bullets such as "Smart Job Feed: up to 15 jobs/day (~300/month)" that can wrap awkwardly.
- The pricing page add-on expanders inside cards can create layout shifts.
- The time savings calculator uses a three-column stats row. On narrow devices, labels may become cramped.
- Trustpilot reviews are long and may feel like text walls.
- Navbar mobile menu has several links plus auth CTAs, which is okay, but "Contact" and "Blog" may distract from conversion.
- The final CTA buttons are full-width on mobile, good, but repeated CTA sections can feel redundant.

Recommended mobile adjustments:

- Show one strong hero product visual, not no visual and then many visuals later.
- Collapse product screenshots into tabs or a carousel with 4 items max.
- Use shorter pricing bullets on mobile.
- Move add-ons below pricing cards.
- Stack calculator stats vertically or use two rows.
- Reduce animation on mobile and respect reduced motion preferences.

## 11. Highest-Impact Improvements Ranked by Priority

### P0: Fix Screenshot Mismatches

The current screenshot labels and filenames actively misrepresent the product in the main ProductShowcase. Replace or rename mismatched assets before any design polish.

### P0: Replace Incorrect Anthropic Image

The page says Anthropic but shows a generic "AI" icon. This is a trust issue. Use the correct logo or remove the image.

### P1: Put Real Product Proof in the Homepage Hero

The hero claims a complete job search workspace but shows no workspace. Add a strong product visual above the fold.

### P1: Simplify ProductShowcase

Reduce eight stacked screenshot cards to 3 or 4 curated visuals with correct labels, consistent crop, and clean mock data.

### P1: Reframe Pricing Around Outcomes

Make daily jobs and complete applications the primary value. Move credits into supporting detail.

### P1: Clarify Free vs Plus vs Max

Explicitly state that Free tests Application Kit, Plus adds Smart Job Feed, and Max is for high-volume searches plus screening answers.

### P2: Reduce Decorative Motion and Gradients

Remove shimmer headline, animated pricing border, CTA glow, and logo marquee. Keep subtle transitions.

### P2: Tighten Page Flow

Homepage should move from hero to product proof to workflow to trust to pricing to CTA. Current order is too long and repetitive.

### P2: Update Founder Story to Match New Positioning

Preserve authenticity, but mention daily job discovery, fit analysis, and tracker.

### P3: Consolidate Calculator Code and Messaging

Use one shared calculator component with a clear, conservative formula.

### P3: Clean Brand and Copy Consistency

Standardize Karko naming, plan claims, complete application definition, and job feed monthly math.

## 12. Specific Recommended Changes

### Homepage Structure

Recommended order:

1. Hero with product screenshot.
2. Outcome proof row.
3. Two-part product explanation: Job Feed and Application Kit.
4. Compact workflow.
5. Curated product screenshots.
6. Reviews plus founder story.
7. Accuracy and trust safeguards.
8. Pricing preview.
9. Time savings.
10. Final CTA.
11. Master CV as compact support or FAQ.

### Homepage Hero Copy

```text
Get matched jobs and complete applications in one place
```

```text
Karko finds relevant jobs each day, checks your fit, writes the tailored CV, cover letter, application email, and follow-up, then tracks every application.
```

```text
Start with 2 free applications
```

```text
See the workflow
```

### Product Visual Copy

```text
Daily jobs ranked by fit
See why a role matches before you apply.
```

```text
One role becomes a complete application kit
CV, cover letter, application email, and follow-up email generated from your real experience.
```

```text
Everything stays tracked
Company, role, match score, documents, and status in one workspace.
```

### Pricing Card Copy

Free:

```text
Free
Test the Application Kit
2 complete applications per month
Fit analysis included
Application tracker included
Smart Job Feed starts on Plus
```

Plus:

```text
Plus
For an active search
Up to 15 matched jobs per day
25 complete applications per month
Fit analysis before you apply
Unlimited application history
Add-on packs available
```

Max:

```text
Max
For high-volume searches
Up to 25 matched jobs per day
100 complete applications per month
Screening question answers
More room for multiple roles and locations
Premium support
```

### Trust Section Copy

```text
Built to keep applications accurate
```

```text
Karko uses your CV as the source of truth, shows fit before you generate, and keeps every application tied to the role you chose.
```

### Founder Story Copy Adjustment

```text
So I built Karko AI to handle the whole workflow: find relevant jobs, check fit, create the tailored application kit, and keep every application organized. Within about 20 applications, I got my first interview. That is when I knew this needed to exist for other job seekers.
```

### Pricing Page FAQ Additions

```text
Does Free include the Smart Job Feed?
Free is built to test the Application Kit with 2 complete applications per month. Smart Job Feed starts on Plus.
```

```text
What is a complete application?
A complete application includes a tailored CV, cover letter, application email, and follow-up email for one role.
```

### Asset Work

- Replace `01-smart-job-feed-populated.webp` usage with `01b-job-feed-left-only.webp` or a new screenshot.
- Replace `03-application-kit-generated.webp` with a true Application Kit overview.
- Replace `03c-cv-tailored-clean.webp` with a real tailored CV panel screenshot.
- Update `04-fit-analysis-result.webp` to remove GPT-4 wording or align with current model positioning.
- Replace `anthropic-icon.jpg` with a correct Anthropic logo or remove logo treatment.
- Create a fresh screenshot set using one fictional candidate and one coherent scenario.

## 13. Proposed Implementation Plan

Do not implement until confirmed.

### Phase 1: Truth and Consistency Fixes

- Correct screenshot mapping in `ProductShowcase`.
- Rename or replace mismatched screenshots.
- Update alt text to match actual visuals.
- Replace or remove the incorrect Anthropic image.
- Standardize "Karko" capitalization and "complete application" wording on homepage and pricing.
- Clarify Free vs Plus vs Max feature access.

### Phase 2: Homepage Conversion Restructure

- Add hero product proof.
- Simplify Two Pillars and How It Works.
- Reduce ProductShowcase from eight visuals to 3 or 4 curated visuals.
- Tighten Trustpilot and founder sections.
- Move or compress Master CV section.

### Phase 3: Pricing Page Rewrite

- Rework card hierarchy around outcomes.
- Move credit details below the main card comparison.
- Move add-on packs out of the card body.
- Add FAQ for Smart Job Feed availability and complete application definition.
- Fix secondary CTA link to `/#how-it-works`.

### Phase 4: Premium Visual Polish

- Reduce shimmer, animated border, CTA glow, and marquee motion.
- Simplify backgrounds and section transitions.
- Reduce rounded card overuse.
- Improve mobile card and screenshot layout.
- Add reduced-motion handling where missing.

### Phase 5: Verification

- Run local site.
- Review homepage and pricing visually on desktop and mobile.
- Verify screenshots, filenames, labels, and alt text.
- Check console warnings, especially Next Image quality and sizing warnings.
- Run build or lint if code changes are made.

