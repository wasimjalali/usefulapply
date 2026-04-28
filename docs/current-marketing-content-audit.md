# Current Website Content Audit

Date: 2026-04-27

Purpose: document the current public-facing and conversion-related copy before rewriting Karko AI positioning around the Smart Job Feed and the newer complete job-search package.

## Scope

Audited areas:

- Home page: `src/app/page.tsx`
- Features page: `src/app/features/page.tsx`
- Pricing page and pricing layout metadata: `src/app/pricing/page.tsx`, `src/app/pricing/layout.tsx`
- Shared marketing navigation and footer: `src/components/marketing/Navbar.tsx`, `src/components/marketing/Footer.tsx`
- Comparison pages: `src/app/compare/[slug]/page.tsx`, `src/lib/comparisons/data.ts`, `src/components/comparisons/*`
- Blog listing and related blog/product-SEO pages: `src/app/blog/page.tsx`, `src/lib/blog/posts.ts`, `src/app/ai-job-application/*`
- Dashboard conversion surfaces: `src/app/dashboard/page.tsx`
- Pricing, credit, signup, and plan-gate prompts: `src/components/InsufficientCreditsModal.tsx`, `src/components/ui/LowCreditsModal.tsx`, `src/components/ui/LowCreditsBanner.tsx`, `src/components/ui/CreditIndicator.tsx`, `src/components/SignUpWallModal.tsx`, `src/components/settings/SubscriptionSection.tsx`, `src/components/ChatPanel.tsx`
- Smart Job Feed product surface: `src/components/job-feed/JobFeedPanel.tsx`, `src/components/job-feed/feed-cards.tsx`, `src/lib/job-feed/constants.ts`

## Current Positioning Summary

The site currently positions Karko AI primarily as an AI job application generator:

- Core promise: complete job application package in 90 seconds.
- Main outputs: tailored CV, cover letter, application email, follow-up email.
- Supporting features: fit analysis, ATS-safe templates, Master CV, application tracker, screening question answers on Max.
- Pricing logic: credits per month, where 2 credits equals one complete application.
- Differentiator emphasized repeatedly: Karko generates application and follow-up emails, unlike resume builders.

The Smart Job Feed exists in the dashboard, but it is not yet a major marketing-page promise. Pricing cards still contain stale "Chrome Extension: auto-fill ATS forms" copy with a "Coming Soon" badge.

## Shared Navigation and Footer

### Navbar

Current desktop/mobile nav links:

- Features
- How It Works
- Pricing
- Blog
- About
- Contact

Current account/conversion links:

- Log in
- Try It Free

Primary CTA destination: `/dashboard`.

### Footer

Brand copy:

- "Get your complete job application package in 90 seconds."

Footer CTA:

- "Try It Free - 2 Applications, No Credit Card" -> `/dashboard`

Product links:

- Features
- How It Works
- Master CV
- Application Tracker
- Pricing

Resources links:

- All comparison pages as "Karko AI vs {Competitor}"
- Try Free, No Sign-Up

Blog links:

- Latest 5 posts from the blog data store.

Company/legal:

- About Us
- Contact
- Log In
- Privacy Policy
- Terms of Service
- Imprint

## Home Page

Source: `src/app/page.tsx`

### SEO Metadata

Title:

- "KarKo AI | AI-Powered Job Application Assistant"

Description:

- "AI-powered job application assistant: Generate ATS-optimized CV, cover letter, and application emails in 90 seconds. Free for 2 applications. Try now."

Structured data feature list currently includes:

- AI CV Optimization
- Tailored Cover Letter Generation
- Professional Application Email Drafting
- Smart Fit Analysis
- ATS-Friendly Output
- Multi-Language Support
- Master CV Support

Structured data offers:

- Free: 4 credits/month, about 2 applications
- Plus: $19.99, 50 credits/month, about 25 applications
- Max: $79.99, 200 credits/month, about 100 applications

### Hero

Headline:

- "Your Entire Job Application in 90 Seconds"

Supporting copy:

- "Paste any job description. Get a tailored CV, cover letter, emails, screening question answers, and more. All generated from your real experience."

Primary CTA:

- "Try It Free, No Sign Up" -> `/dashboard`

Secondary CTA:

- "See How It Works" -> `#how-it-works`

Hero stats:

- "<90s" / "Per application"
- "4 Docs" / "Ready to send"
- "100%" / "From your real CV"

### Trust Bar

Eyebrow:

- "Optimized for the tools recruiters use"

Displayed ATS/recruiting platforms:

- Workday
- Greenhouse
- Lever
- SAP SuccessFactors
- iCIMS
- Taleo
- BambooHR
- SmartRecruiters

### How It Works

Section label:

- "How It Works"

Headline:

- "Three Steps. One Complete Application."

Intro:

- "From CV upload to ready-to-send application in under 90 seconds."

Step cards:

- "Upload Your CV" - upload master CV once; Karko reads professional history and builds a profile.
- "Paste the Job Description" - Karko analyzes requirements, matches skills, and gives an honest fit score.
- "Get Your Entire Application" - receive tailored CV, cover letter, application email, follow-up email, and screening question answers in 90 seconds.

Additional card:

- "Track All Your Applications" - track every application with match scores, statuses, and company details inside Karko AI.

### Product Showcase

Label:

- "See It in Action"

Headline:

- "Everything You Get, In One Place"

Intro:

- "A tailored CV, cover letter, application email, follow-up email, ATS score, and full application tracker. All from a single job description."

### Reviews

Trustpilot review component is rendered after Product Showcase.

### Why Trust Karko AI

Label:

- "Why Trust Karko AI"

Headline:

- "Built Different. Built Better."

Intro:

- Karko does not cut corners on AI.
- Powered by one of the world's most capable models.
- Positioned as "the best AI job application tool for quality-focused job seekers."

AI model card:

- "Claude Sonnet 4.6"
- "by Anthropic"
- Copy says Karko is powered by Claude Sonnet 4.6, a frontier model, plus a specialized agentic workflow.

Trust feature cards:

- "Anti-Hallucination Guardrails" - every skill comes from actual profile.
- "Honest Fit Score" - real match before applying.
- "Self-Refining AI" - Karko reviews/refines its output.
- "Specialized for Jobs" - custom system only for job applications.

### Founder Story

Label:

- "Built by a Job Seeker"

Headline:

- "The Tool I Wished I Had"

Story summary:

- Founder ran out of money building a startup in Germany.
- Generic applications got zero interviews.
- Tailoring by hand took 45 to 60 minutes.
- Built Karko AI to automate tailored CV, cover letter, and professional email in under 90 seconds.
- Got first interview after about 20 applications.

Link:

- "How long does it really take to apply for a job?" -> `/blog/how-long-to-apply-for-job-2026`

### Home Pricing Section

Label:

- "Pricing"

Headline:

- "Simple, Transparent Pricing"

Intro:

- "Every plan includes the full AI agent. Upgrade for more volume and automation."

AI pill:

- "Claude Sonnet 4.6 by Anthropic"
- "Specialized for job applications"

Cards:

- Free
- Plus
- Max

Home pricing cards duplicate most of the dedicated pricing page cards. The Max card currently includes stale Chrome extension copy.

### Home Time Savings Section

Label:

- "Time Savings"

Headline:

- "How Much Time Will You Save?"

Intro:

- "Each tailored application takes 45 to 60 minutes by hand. KarKo AI does it in under 90 seconds."

### Home Final CTA

Headline:

- "Your Next Interview Is 90 Seconds Away"

Supporting copy:

- "Start with 2 free applications. No credit card required."

Buttons:

- "Try It Free" -> `/dashboard`
- "View Pricing" -> `/pricing`

### Master CV Section

Label:

- "Master CV"

Headline:

- "Don't Have a Master CV?"

Copy:

- Explains Master CV as a 5-10 page source document containing full professional history.
- Says it is not sent to employers; Karko draws from it to create tailored applications.
- Says a free guided process helps users create one in about 30 minutes using any AI chatbot.

CTA:

- "Learn How to Create Yours" -> `/master-cv`

Included list:

- Complete work history with metrics
- All skills with years of experience
- Every certification and qualification
- Side projects and portfolio work
- Languages and proficiency levels
- Professional mindset and approach

Tip:

- "The more detailed your Master CV, the better KarKo AI can personalize your applications."

## Features Page

Source: `src/app/features/page.tsx`

### SEO Metadata

Title:

- "Features: The Complete AI Job Application Assistant"

Description:

- "Everything you need to apply smarter: fit analysis, AI-generated CVs, cover letters, application emails, follow-up emails, and ATS optimization."

### Hero

Badge:

- "All Features, All Plans"

Headline:

- "Karko AI Features: The Complete AI Job Application Assistant"

Supporting copy:

- "Everything you need to apply smarter: fit analysis, AI-generated application materials, personalized emails, and ATS optimization. All powered by Claude Sonnet 4.6."

Primary CTA:

- "Try It Free - 2 Applications, No Credit Card" -> `/dashboard`

### Feature Cards

1. Fit Analysis (Analyze First Mode)

- Description: analyze JD against Master CV before spending credits.
- Benefits: saves time on bad matches; focuses effort; costs 0.5 credits; actionable gap analysis.
- Cost label: "0.5 credits"
- Link: "Learn about our anti-hallucination system ->" -> `/ai-job-application/zero-fabrication`

2. AI CV Optimization

- Description: tailored ATS-optimized resume from Master CV and JD.
- Benefits: ATS-safe by default, role-specific prioritization, keyword-rich without stuffing, 6 templates.
- Cost label: "Part of 2.0 credit package"
- Link: ATS optimization guide.

3. Personalized Cover Letters

- Description: company-researched, tailored narrative, not generic templates.
- Benefits: company-specific research, achievement-led opening, consistent voice, "50%+ higher callback rate than templates."
- Cost label: "Part of 2.0 credit package"

4. AI Screening Question Answers

- Description: paste screening questions from ATS portals; Karko drafts concise role-specific answers using CV and JD.
- Supports yes/no, behavioral STAR, situational, free-text.
- Benefits: up to 7 questions per session, compressed STAR, under 750 chars, anti-hallucination.
- Cost label: "Max plan"

5. Application Email Generation

- Description: "Nobody else offers this." Professional emails with subject, body, and attachment references.
- Benefit claim: application emails increase response rates by up to 40%.
- Cost label: "Part of 2.0 credit package"

6. Follow-Up Email Generation

- Description: professional follow-up email for 7-10 days after applying.
- Benefits: unique feature, optimal timing, reinforces interest, "40% increase in callback rate."
- Cost label: "Part of 2.0 credit package"

7. Master CV System

- Description: upload complete work history once as source of truth.
- Benefits: upload once, structured consistency, all claims traced to document, free to store.
- Cost label: "Free"

8. ATS-First Templates

- Description: 6 templates engineered for ATS parsers.
- Benefits: ATS by default, 6 designs, US/German templates, system fonts.
- Cost label: "Included in all plans"

9. 90-Second Workflow

- Description: complete package in under 90 seconds; one unified agent and consistent voice.
- Benefits: "100 applications in 2.5 hours vs 75 hours manually", "97% time savings", unified voice, context cached.
- Cost label: "2.0 credits per application"

### Feature Comparison Table

Heading:

- "All Features, All Plans"

Intro:

- "Every plan includes the full feature set. The only difference is the number of monthly credits."

Rows:

- Fit Analysis: all plans
- CV Generation: all plans
- Cover Letter: all plans
- Application Email: all plans
- Follow-Up Email: all plans
- ATS Templates (6): all plans
- Master CV Storage: all plans
- Screening Question Answers: Max only
- Credits/Month: Free 10, Plus 100, Max 200
- Applications/Month: Free about 5, Plus about 50, Max about 100

Note: this table conflicts with current pricing cards and FAQs, which say Free 4 credits, Plus 50, Max 200.

CTA:

- "View Pricing" -> `/pricing`

### Features FAQ

Questions and current answers:

- "What makes Karko different from resume builders?" Karko generates CV, cover letter, application email, and follow-up email; nobody else offers email generation.
- "Do all features work on all plans?" Says every plan includes all features, with only credits differing; says Free 4, Plus 50, Max 200.
- "Can I buy more credits?" Yes for Plus/Max; $19.99 for 50 credits / 25 applications; rollover while subscription active.
- "What AI model do you use?" Claude Sonnet 4.6 by Anthropic via Amazon Bedrock with context caching.
- "Are all templates ATS-safe?" Yes, 6 templates with ATS-safe conventions.
- "How does fit analysis work?" Upload Master CV and paste JD; extracts skills, compares, calculates match percentage, gaps, recommendation; costs 0.5 credits.

### Final CTA

Headline:

- "Try All Features Free"

Supporting copy:

- "2 complete application packages including CV, cover letter, application email, and follow-up email. No credit card required."

CTA:

- "Try Karko AI Free" -> `/dashboard`

## Pricing Page

Sources: `src/app/pricing/page.tsx`, `src/app/pricing/layout.tsx`

### SEO Metadata

Layout description:

- "Transparent pricing for AI job applications: Free (2 apps), Plus $19.99/mo (25 apps), Max $79.99/mo (100 apps). No hidden fees. Compare plans."

### Hero

Label:

- "Pricing"

Headline:

- "Simple, Transparent Pricing"

Supporting copy:

- "Every plan includes the full AI agent. Upgrade for more volume and automation."

AI pill:

- "Claude Sonnet 4.6 by Anthropic"
- "Specialized for job applications · All plans"

### Add-On Pack

Single add-on pack:

- Name: "Credit Pack"
- Credits: 50
- Applications: 25
- Price: $19.99
- Per credit: "$0.40"
- Available in Plus and Max UI flows.

### Pricing Cards

#### Free

Header:

- Free
- "Try the full AI agent"

Price:

- "Free forever"
- "4 credits/month"

Features:

- "2 complete applications/month"
- "Tailored CV, cover letter, email & follow-up"
- "Honest fit score before you apply"
- "ATS-optimized, US & EU templates"
- "Anti-hallucination guardrails"
- "Powered by Claude Sonnet 4.6"

Info row:

- "~2 hours saved/month"

CTA:

- "Start Free" -> `/dashboard`

#### Plus

Badge:

- "MOST POPULAR | SAVE ~18 HOURS/MONTH"

Header:

- Plus
- "For serious job seekers"

Price:

- "$19.99/month"
- "50 credits/month"

Expandable add-on section:

- "Need more credits?"
- "Buy add-on credit packs:"
- "50 credits (25 apps)"
- "$19.99"
- "Credits roll over while subscription is active."

Features:

- "25 complete applications/month"
- "Everything in Free, plus:"
- "Unlimited application history"
- "Add-on credit packs (rollover)"
- "Priority email support"
- "Powered by Claude Sonnet 4.6"

Info row:

- "Cancel anytime. No contracts."

CTA:

- "Get Plus"
- If signed out, routes to `/auth/signup?plan=plus`.
- If signed in, creates Stripe checkout.

#### Max

Badge:

- "SAVE ~108 HOURS EVERY MONTH"

Header:

- Max
- "Full automation for power applicants"

Price:

- "$79.99/month"
- "200 credits/month"

Expandable add-on section:

- "Need more credits?"
- Same add-on pack as Plus.

Features:

- "100 complete applications/month"
- "Everything in Plus, plus:"
- "Chrome Extension: auto-fill ATS forms" with "Coming Soon"
- "AI Screening Question Answers"
- "Premium dedicated support"
- "Powered by Claude Sonnet 4.6"

Info row:

- "Cancel anytime. No contracts."

CTA:

- "Get Max"
- If signed out, routes to `/auth/signup?plan=max`.
- If signed in, creates Stripe checkout.

### Time Savings Calculator

Label:

- "Time Savings"

Headline:

- "How Much Time Will You Save?"

Intro:

- "Each tailored application takes 45-60 minutes by hand. KarKo AI does it in under 90 seconds."

Tier values:

- Free: 2 apps, 2 hours saved, "That is 2 hours you get back for free. No credit card required."
- Plus: 25 apps, 18 hours saved, "$19.99/mo", "That is over 18 hours saved every month. At ~$0.80 per application."
- Max: 100 apps, 108 hours saved, "$79.99/mo", "That is over two and a half work weeks saved. Full automation at ~$0.80 per application."

Displayed stats:

- applications/month
- "<90 seconds each"
- hours saved/month

Disclaimer:

- "Based on 45-60 min of manual work per tailored application."

### Credit System

Label:

- "Credit System"

Headline:

- "How Credits Work"

Intro:

- "Credits are simple. Each action costs a fixed number of credits. No surprises."

Credit cards:

- 0.5 credits: Fit Analysis, "Job fit score + skill gaps"
- 2 credits: Full Application, "CV + Cover Letter + Email"
- 0.5 credits: Cover Letter Regen, "Regenerate with new tone"
- 0.5 credits: Email Regen, "Regenerate application email"

Note: current "Full Application" subcopy omits follow-up email even though other page copy includes it.

### Pricing FAQ

Questions and current answers:

- "What exactly do I get with each application?" CV, cover letter, professional application email in under 90 seconds. This answer omits follow-up email, unlike other copy.
- "Are all features the same across plans?" Says all plans include full agentic workflow and only credits differ.
- "What happens if I run out of credits?" Plus/Max can buy add-on packs; Free resets monthly; upgrade for more credits.
- "Do unused credits expire?" Monthly credits reset; add-on credits roll over while subscription active.
- "Can I change or cancel my plan?" Upgrade anytime; downgrade/cancel at billing-cycle end.
- "How is KarKo different from other resume builders?" Agentic system with company analysis, fit analysis, skill gaps, ATS templates, self-refinement, emails, follow-ups.
- "What AI model does KarKo use?" Claude Sonnet 4.6 by Anthropic; frontier-grade, US-based, specialized workflow.
- "How does Karko AI pricing compare to Teal?" Free 2 apps, Plus 25, Max 100, transparent; Karko generates complete packages with emails.
- "How does Karko AI pricing compare to Jobscan?" Jobscan scans; Karko creates application packages.

### Pricing Final CTA

Headline:

- "Ready to Transform Your Job Search?"

Supporting copy:

- "Start with 2 free applications. No credit card required. See why job seekers are switching to KarKo AI."

Buttons:

- "Try It Free" -> `/dashboard`
- "Learn More" -> `/`

## Comparison Pages

Sources: `src/lib/comparisons/data.ts`, `src/app/compare/[slug]/page.tsx`, `src/components/comparisons/*`

### Template Structure

Each comparison page renders:

- Back link: "Back to Blog"
- Hero with H1, description, and summary comparison table.
- "Detailed Overview" with Karko and competitor cards.
- "Feature-by-Feature Comparison"
- "Use Case Recommendations"
- FAQ
- Verdict card with CTA.

Shared Karko deep-dive card CTA:

- "Try Karko AI Free" -> `/dashboard`

### Current Comparison Set

1. `/compare/karko-ai-vs-teal`

- Title: "Karko AI vs Teal: Which Resume Builder Wins in 2026?"
- H1: "Karko AI vs Teal: Complete Applications vs Job Tracking (2026)"
- Current frame: Teal tracks applications; Karko creates them.
- Karko pricing: Free 2 apps, Plus $19.99/mo 25 apps, Max $79.99/mo 100 apps.
- Stale/important copy: Karko job tracking is "Roadmap"; Karko cons include "No job tracking (yet - on roadmap)" and "No Chrome extension for one-click job saving."
- Teal is praised for job tracking and Chrome extension.
- CTA: "Try Karko AI Free - 2 Complete Applications with Emails"

2. `/compare/karko-ai-vs-jobscan`

- Title: "Karko AI vs Jobscan: Which ATS Optimizer Wins in 2026?"
- H1: "Karko AI vs Jobscan: Creating vs Scanning Resumes (2026 Comparison)"
- Current frame: Jobscan scans existing resumes; Karko writes complete packages.
- CTA: "Generate ATS-Optimized Application in 90 Seconds - 2 Free"

3. `/compare/karko-ai-vs-rezi`

- Title: "Karko AI vs Rezi: Which AI Resume Builder Wins in 2026?"
- H1: "Karko AI vs Rezi: Complete Packages vs Resume Scoring (2026)"
- Current frame: Rezi scores/resume-optimizes; Karko generates packages with emails and fit analysis.
- Karko pricing: Free 2 apps, Plus $19.99/mo 25 apps, Max $79.99/mo 100 apps.
- CTA: "Try Karko AI Free - 2 Complete Applications with Emails"

4. `/compare/karko-ai-vs-kickresume`

- Title: "Karko AI vs Kickresume: Which Resume Builder Wins in 2026?"
- H1: "Karko AI vs Kickresume: AI Applications vs Design Templates (2026)"
- Current frame: Kickresume focuses on design/templates/portfolio; Karko focuses on ATS-safe complete applications.
- CTA: "Try Karko AI Free - 2 ATS-Optimized Applications"

5. `/compare/karko-ai-vs-enhancv`

- Title: "Karko AI vs Enhancv: Which Resume Builder Wins in 2026?"
- H1: "Karko AI vs Enhancv: AI Applications vs Multi-Language Builder (2026)"
- Current frame: Enhancv has multi-language builder and job tracking; Karko has complete application packages with emails.
- Stale/important copy: summary table says Karko Job Tracking = "Roadmap"; Karko cons include "No job tracking (yet - on roadmap)."
- CTA: "Try Karko AI Free - 2 Complete Applications"

6. `/compare/karko-ai-vs-resume-io`

- Title: "Karko AI vs Resume.io: Which Resume Builder Wins in 2026?"
- H1: "Karko AI vs Resume.io: Focused Quality vs Full Ecosystem (2026)"
- Current frame: Resume.io has broader ecosystem, recruiter matching, auto-apply; Karko focuses on controlled strategic applications.
- CTA: "Try Karko AI Free - 2 Strategic Applications"

### Comparison Content Patterns

Karko is repeatedly described as:

- "AI-powered job application assistant"
- "complete application packages"
- CV, cover letter, application email, follow-up email in under 90 seconds
- Claude Sonnet 4.6
- transparent pricing
- fit analysis before applying
- ATS-optimized templates
- Master CV system
- German market specialization

Common stale points to revisit:

- Job tracking described as unavailable/roadmap in Teal and Enhancv comparisons.
- Chrome extension absence is listed as a Karko con.
- Smart Job Feed is not present as a comparison advantage.
- Pricing volume is still expressed only as application credits, not job feed volume.

## Blog and Related SEO Pages

### Blog Listing

Source: `src/app/blog/page.tsx`

Hero:

- Badge: "KarKo AI Blog"
- Headline: "Career Tips, AI Insights & Job Search Strategies"
- Supporting copy: "Practical advice to help you land your dream job faster. From CV optimization to interview prep, powered by real-world insights."
- RSS link: "Subscribe via RSS"

Empty state, if no posts:

- "Coming Soon"
- "We're working on expert articles about CV optimization, AI in job search, and career strategies. Stay tuned!"
- CTA: "Try KarKo AI Free"

Blog listing CTA:

- Headline: "Ready to Apply Smarter?"
- Copy: "Stop spending hours on each application. Let KarKo AI generate your complete job application in under 90 seconds."
- CTA: "Try It Free — No Sign Up Required" -> `/dashboard`

### Relevant Blog/Data Store Patterns

Source: `src/lib/blog/posts.ts`

Repeated Karko claims in post content:

- Free for first 2 applications.
- No credit card.
- No sign-up wall / no account needed.
- Complete package in 90 seconds.
- Package includes CV, cover letter, application email, follow-up email.
- Pricing: Free 2 apps/month, Plus $19.99/month 25 apps, Max $79.99/month 100 apps, add-on $19.99 for 50 credits.

Important related post sections:

- Follow-up email post says follow-up emails increase chances by 40% and Karko generates follow-up email as part of the 4-document package.
- Tailoring resume post says Karko reduces 100 applications from 33 hours to 2.5 hours.
- ATS optimization post says Karko outputs are ATS-optimized by default.
- Cover letter post says customized cover letters get 50% more callbacks and Karko includes cover letter plus CV, email, follow-up.
- AI tools comparison post includes a matrix and pricing references. It also references Teal's Chrome extension.
- "How long to apply" style content frames manual applications as 45-60 minutes and Karko as 90 seconds.

### Related Product SEO Pages

Relevant pages found under `src/app/ai-job-application/*`:

- Main AI job application page
- 90-second application package
- Cover letter generator
- Follow-up email generator
- Free no-signup test
- Pricing credits
- Screening question answers
- Application tracker
- ATS optimization
- Integrations Workday/Greenhouse/Lever
- Zero fabrication

The related pricing/credits page currently says:

- Free: 4 credits, 2 complete applications per month.
- Plus: $19.99/month, 50 credits, 25 complete applications per month.
- Max: $79.99/month, 200 credits, 100 complete applications per month.
- One complete application costs 2 credits.
- Fit assessment costs 0.5 credits.
- Regenerating cover letter or email costs 0.5 credits.
- Add-on credit packs are available if users exceed monthly plan volume.

## Dashboard and App Conversion Surfaces

### Dashboard Navigation

Source: `src/app/dashboard/page.tsx`

Workspace nav:

- Application Kit
- Job Feed
- Tracker

Upgrade CTA in dashboard header:

- Free users see "Upgrade to Plus"
- Plus users see "Upgrade to Max"
- Mobile variants: "Upgrade" for Plus and "Go Max" for Max.
- CTA destination: `/pricing`

### Job Feed Nav Badge and Popup

Source: `src/app/dashboard/page.tsx`

Job Feed nav badge:

- Shows unprocessed job count.
- Accessibility label: "{count} jobs waiting for your review"
- Caps display at "99+"

Popup shown once per new feed run:

- Title for 1 job: "1 new role for you today"
- Title for multiple jobs: "{count} new roles for you today"
- Supporting copy: "Fresh matches, hand-picked for you."
- Buttons: "Open Job Feed", "Later"
- Dismiss aria label: "Dismiss new jobs notification"

### Chat Welcome / Application Kit

Source: `src/components/ChatPanel.tsx`

Signed-in with CV:

- Heading: "Ready to apply?"
- Copy: "Paste a job description and I'll create a tailored CV, cover letter, and application emails."
- Buttons:
  - "Apply Directly" - title says optimized CV, cover letter, and email immediately, 2 credits.
  - "Analyze Fit First" - title says match score and skill gaps first, 0.5 credits, then +2 if user continues.
- Helper copy contrasts Apply Directly vs Analyze First.

No CV:

- Signed-in heading: "Upload your CV to get started"
- Anonymous heading: "Your AI Job Application Assistant"
- Copy: upload CV, paste JD, Karko creates tailored CV, cover letter, application emails.

Anonymous CTA block:

- "Sign Up Free"
- "Already have an account? Sign in"
- "Try one application free, no account needed"

Screening question gate:

- If Max: starts "Screening Question Mode"
- If not Max: assistant message says "Screening Question Answers is available on the Max plan."
- Copy says Max drafts personalized answers using CV/JD context, formatted for copy/paste.
- Action: "View Plans"

### Anonymous Signup Wall

Source: `src/components/SignUpWallModal.tsx`

Triggers:

- Download: "Sign up to download your documents"
- New application: "Sign up to get 2 more free applications"
- General: "Create your free account"

Subtitle in all triggers:

- "Free plan includes 4 credits (2 applications/month)"

Form CTA:

- Signup mode: "Create Free Account"
- Login mode: "Sign In"

Success state:

- "Check your email"
- "We've sent a confirmation link to {email}. Please click the link to verify your account."
- Button: "Got it"

Tracking:

- Anonymous users have one free generation in local storage.

### Insufficient Credits Modal

Source: `src/components/InsufficientCreditsModal.tsx`

Header:

- "You're out of credits"

Dynamic explanation:

- "This action requires {required} credits, but you only have {available} credit(s) remaining."

Supporting copy:

- "Upgrade to keep applying — your CV, cover letter, email, and follow-up, all tailored for every role."

Plan cards:

Plus:

- "For serious job seekers"
- Badge: "SAVE ~18 HOURS/MONTH"
- Price: $19.99/month
- Price note: "~$0.80 per application"
- Credits: "50 credits/month"
- Features: 25 applications, everything in Free, unlimited history, add-on credit packs, priority email support, Claude Sonnet 4.6.
- CTA: "Get Plus ->"

Max:

- "Full automation for power applicants"
- Badge: "SAVE ~108 HOURS/MONTH"
- Price: $79.99/month
- Price note: "~$0.80 per application"
- Credits: "200 credits/month"
- Features: 100 applications, everything in Plus, "Chrome Extension: auto-fill ATS forms (Coming Soon)", AI Screening Question Answers, premium support, Claude Sonnet 4.6.
- CTA: "Get Max ->"

Footer:

- "Not ready to upgrade? View all plans or continue with current plan."

### Low Credits Modal

Source: `src/components/ui/LowCreditsModal.tsx`

Trigger:

- Opens once per session when paid users have 5 or fewer credits.

Header:

- If zero or below: "You're out of credits"
- Otherwise: "Almost out of credits"

Supporting copy:

- "You have {totalCredits} credit(s) left. Top up to keep applying."

Add-on card:

- Badge: "INSTANT TOP-UP"
- "Add-on Credits"
- "One-time purchase"
- "$19.99 one-time"
- "50 credits, ~25 applications. Credits roll over."
- CTA: "Buy Credits"

Plus-only Max upsell card:

- Badge: "200 CREDITS/MONTH"
- "Max Plan"
- "Full automation"
- "$79.99/month"
- "200 credits/month, ~100 applications."
- CTA: "Upgrade to Max"

Footer:

- "Maybe later"

### Low Credits Banner

Source: `src/components/ui/LowCreditsBanner.tsx`

Trigger:

- Paid users with 15 or fewer credits, unless dismissed in session storage.

Copy:

- "You have {totalCredits} credit(s) left. Almost out." when at 5 or fewer.
- "You have {totalCredits} credit(s) left. Running low." when 6-15.

Buttons:

- "Buy Credits"
- Plus users also see "Upgrade to Max"

### Credit Indicator Dropdown

Source: `src/components/ui/CreditIndicator.tsx`

Collapsed:

- Shows "{credits} credits" with progress bar.
- Compact mobile version links to `/subscription`.

Expanded content:

- "Credits Remaining"
- Breakdown: Monthly, Rollover, Add-on.
- "Credit Usage"
- Fit Analysis: 0.5
- Full Application: 2
- Cover Letter Regen: 0.5
- Email Regen: 0.5

Actions:

- "Buy More Credits"
- "Manage Subscription ->"

### Settings Subscription Section

Source: `src/components/settings/SubscriptionSection.tsx`

Current plan card:

- Heading: "Subscription"
- Subcopy: "Manage your subscription and billing"
- Current plan label: Free Plan / Plus Plan / Max Plan
- Shows "{totalCredits} credits remaining"
- Shows Monthly, Rollover, Add-on breakdown.
- Paid users can "Manage Billing".

Free upgrade block:

- "Upgrade to Plus"
- "Get 25 applications per month (50 credits), add-on packs, and priority support."
- CTA: "Upgrade Now"

Paid add-on block:

- "Need More Credits?"
- "Purchase add-on credit packs. Credits roll over while subscribed."
- "View all packs ->"
- Pack: 50 credits, 25 apps, $19.99, CTA "Buy"

Plan comparison table:

- Free: Free, 4 credits/mo
- Plus: $19.99, 50 credits/mo, badge "SAVE ~37 HOURS"
- Max: $79.99, 200 credits/mo, badge "SAVE ~108 HOURS"

Rows:

- Applications/month: 2 / 25 / 100
- CV + Cover Letter + Email + Follow-up: all
- Honest fit score: all
- ATS-optimized templates: all
- Unlimited application history: Plus/Max
- Add-on credit packs: Plus/Max
- Chrome Extension (Coming Soon): Max only
- Hours saved/month: Free ~4h, Plus ~37h, Max ~108h

CTAs:

- Current
- Get Plus ->
- Get Max ->
- Downgrade for Max users where billing management is available.

## Smart Job Feed Current Product Copy

Sources: `src/components/job-feed/JobFeedPanel.tsx`, `src/components/job-feed/feed-cards.tsx`, `src/lib/job-feed/constants.ts`

### Access and Limits

Current paid tiers with Job Feed access:

- Plus
- Max

Free users see an upgrade gate.

Current backend/UI limits:

- Plus: 2 daily queries, up to 20 raw jobs per run, up to 15 visible matches per day.
- Max: 4 daily queries, up to 40 raw jobs per run, up to 25 visible matches per day.
- Default visible count before load-more: 10.
- Absolute visible max in UI: 25.

Input caps:

- Plus: up to 2 roles, 2 countries, 2 cities per country.
- Max: up to 4 roles, 4 countries, 4 cities per country.

### Signed-Out Job Feed Stage

Headline:

- "Jobs picked for you, every day"

Supporting copy:

- "Tell Karko what you're looking for. Each morning, your best matches are ready when you open this page."

CTAs:

- "Sign up free" -> `/auth/signup`
- "Already have an account? Sign in" -> `/auth/login`

Preview jobs:

- Senior Product Manager at Northstar Labs, Remote, Strong match
- Growth Product Manager at SignalPath, New York, NY, Strong match
- Platform Product Manager at Orbit Systems, Toronto, ON, Good match

### Free User Upgrade Stage

Headline:

- "Get jobs picked for you, every morning"

Supporting copy:

- "Upgrade to Plus and Karko will search for jobs while you sleep. When you open this page, your top matches are already here."

Bullets:

- Fresh picks delivered at your chosen hour
- Search across roles, countries, and cities
- Up to 15 ranked matches visible per day on Plus

CTA:

- "Upgrade to Plus" -> `/pricing`

Subcopy:

- "Plus plan · Cancel anytime"

### Feed Header

Possible headlines:

- "{n} job(s) for you today"
- "Your feed for today"
- "Set up your daily feed"
- "Your feed is paused"
- "Your first feed is on the way"
- "Preparing your jobs..."
- "Daily Job Feed"
- Saved tab: "{n} saved job(s)" or "Saved jobs"

Tabs/buttons:

- Today
- Saved
- Edit feed
- Refresh feed

Delivery subcopy:

- "Delivered {time/date label}"

### Inline State Messages

Setup required:

- "Add your roles and delivery time so Karko knows what to look for."
- CTA: "Start setup"

Paused:

- "Your settings are saved. Turn the feed back on when you're ready."
- CTA: "Edit settings"

Awaiting first run:

- "Everything is set. Your first jobs will arrive at your chosen delivery time."

Generating:

- If previous jobs exist: "Karko is finding your latest jobs right now. The cards below are from your most recent completed feed."
- Otherwise: "Karko is finding your jobs right now. This usually takes a few minutes."

Empty:

- "Nothing matched today. Try broadening your countries, loosening seniority, or removing a minimum salary to improve tomorrow's results."
- CTA: "Adjust settings"

Error:

- Latest run error message, or "Something went wrong with the latest run. Try refreshing or checking your settings."
- CTA: "Review settings"

### Job Feed Onboarding Wizard

Header:

- New setup: "Set up your daily feed"
- Edit mode: "Edit your feed settings"

Subcopy:

- New setup: "Fill in the basics and your first feed will be ready by tomorrow."
- Edit mode: "Changes save when you press save below."

Step indicator:

- "Step {n} of 4"

CV import:

- "Take from my CV"
- "CV data applied"
- If CV changed: "Your CV was updated. Refresh your feed settings to reflect the latest roles and skills?"
- CTA: "Refresh from my CV"

Step 1:

- Heading: "What jobs are you looking for?"
- Roles label: "Roles"
- Roles help: type or pick roles; runs one search per role x country each day up to plan cap.
- Countries label: "Countries to search"
- Countries help: pick one or more; daily budget split across countries.
- Cities label: "Cities"
- Cities help: city names only; rotate through cities per country; leave empty to search whole country.

Step 2:

- Heading: "How do you want to work?"
- Work modes help: "This is the only place remote preference is set. Pick any that work for you — Karko will match jobs to any mode you choose."

Step 3:

- Heading: "When should we deliver your jobs?"
- Delivery time help: "Karko prepares your feed at this hour in your local time."
- Timezone help: "Needed so we schedule and rank jobs for your local day."
- Optional browser timezone CTA.

Step 4:

- Header: "Fine-tune your feed"
- Subcopy: "Seniority, skills, minimum salary and a few more details to improve matches."
- Badge: "Recommended"
- Fields: Seniority, Search style, Employment types, Languages, Work authorization, Minimum salary, Your skills.
- Skill import CTA: "Import skills from CV"

Consent:

- "I agree to let Karko search for jobs on my behalf once a day, using the preferences above."

Save actions:

- "Start my daily feed"
- "Save and keep paused"
- Edit mode: "Save changes"
- Edit mode next delivery: "Next delivery: {delivery time} in {timezone}"

### Feed Results Cards

Feed summary:

- "{roles} · {countries} · Delivered at {time}"

Job card labels:

- Strong match
- Good match
- Promising match
- Application ready
- Application started
- Retry available
- Saved

Job actions:

- "Apply with Karko"
- "Continue in Karko"
- "Employer site"
- "View details"
- "Copy" / "Copied"

Load-more button:

- "Load more ({n})"
- "Show less"

### Job Detail Modal

Header labels:

- Strong / Good / Promising match
- Application ready / Application started / Retry available / Saved

Sections:

- Role details
- Apply via
- Match-quality feedback

Fallback:

- "The provider did not include a full description for this job."

Feedback prompt:

- "How does this match feel?"
- "Your rating helps us tune tomorrow's feed."
- Buttons: "Good match", "Not relevant"

Footer actions:

- Save / Saved
- Dismiss
- Copy / Copied
- Employer site
- Apply with Karko / Continue in Karko

### Saved Jobs View

Loading:

- "Loading your saved jobs..."

Empty state:

- "No saved jobs yet"
- "Open a job from your feed and click Save to bookmark it — you'll find all your saved jobs here."
- CTA: "Back to today's feed"

Non-empty summary:

- "{n} saved job(s)"

## Current Inconsistencies and Stale Copy

This section documents current-state issues only; it does not prescribe new copy.

- Pricing card Max feature still says "Chrome Extension: auto-fill ATS forms" with "Coming Soon" on home, pricing, insufficient credits modal, and subscription settings.
- Comparison pages still describe Karko job tracking as unavailable/roadmap in Teal and Enhancv comparisons.
- Comparison pages do not mention Smart Job Feed as a Karko advantage.
- Features page plan table says Free 10 credits and Plus 100 credits, while pricing and account systems say Free 4 and Plus 50.
- Pricing FAQ says each application includes CV, cover letter, and professional application email, but omits follow-up email.
- Pricing "Full Application" credit card says "CV + Cover Letter + Email" but omits follow-up email.
- Dashboard anonymous copy says "Try one application free, no account needed," while public marketing says "2 applications" or "4 credits."
- Time-saved claims vary: Plus is ~18 hours in pricing/home cards, ~37 hours in subscription settings.
- Smart Job Feed current product limits in code are daily visible caps of 15 for Plus and 25 for Max, not the proposed monthly "up to 300 / 500 hand-picked jobs" messaging.

## Current Primary CTA Inventory

- "Try It Free, No Sign Up" -> `/dashboard`
- "See How It Works" -> `/#how-it-works`
- "Try It Free" -> `/dashboard`
- "Start Free" -> `/dashboard`
- "Get Plus" -> checkout/signup flow
- "Get Max" -> checkout/signup flow
- "View Pricing" -> `/pricing`
- "View credit details and add-ons" -> `/pricing`
- "Try It Free - 2 Applications, No Credit Card" -> `/dashboard`
- "Try Karko AI Free" -> `/dashboard`
- "View Plans" -> `/pricing`
- "Buy Credits" / "Buy More Credits" -> add-on checkout or `/pricing#addons`
- "Upgrade to Plus" -> `/pricing` or checkout
- "Upgrade to Max" -> checkout
- "Manage Subscription ->" -> `/subscription`
- "Open Job Feed" -> dashboard Job Feed workspace
- "Sign up free" -> `/auth/signup`
- "Already have an account? Sign in" -> `/auth/login`
- "Apply with Karko" / "Continue in Karko" -> application workspace handoff
- "Employer site" -> external apply/source URL

