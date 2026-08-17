# Marketing Copy Rewrite Brief and Agent Prompt

Date: 2026-04-27

Related baseline document:

- `docs/current-marketing-content-audit.md`

Purpose: define what should be preserved, what should change, and the exact prompt for the implementation agent that will rewrite the website copy around Useful Apply's expanded product.

## Part 1: User Requirements and Rewrite Brief

### What Must Be Kept

Preserve these parts unless there is a very strong reason to make a small polish-only edit:

1. Founder story / founder voice on the homepage.
   - Keep the founder story section and its human voice.
   - The story is part of the product trust layer and should not be replaced with generic marketing copy.

2. Reviews / transparency / Trustpilot content.
   - Keep the review content as-is where it reflects real reviews.
   - Reviews are currently correct and should remain trustworthy.

3. Time-savings calculator.
   - Keep the calculator as a concept and conversion section.
   - The model may improve the surrounding copy or presentation if it creates a significant improvement.
   - The calculator should still clearly communicate saved time and practical value.

Everything else is open to rewrite, restructure, improvement, or repositioning if it makes the website clearer and stronger.

### Product Repositioning Goal

Useful Apply is no longer only an AI job application generator.

The new positioning should present Useful Apply as a complete job application platform where users can:

- Find relevant jobs inside Useful Apply using the Smart Job Feed.
- Review hand-picked, ranked jobs without searching job boards manually.
- Generate a complete application package for each role.
- Track the application process inside the app.
- Start free to test the product.
- Upgrade to Plus or Max when they want more volume, automation, and job-feed power.

The site should make it obvious that Useful Apply now covers the full job application workflow:

1. Find jobs.
2. Understand fit.
3. Generate the application package.
4. Apply and follow up.
5. Track progress.

### Smart Job Feed Requirements

The rewrite must introduce the Smart Job Feed as a major product pillar.

Use the implementation and current product copy as source material:

- `src/components/job-feed/JobFeedPanel.tsx`
- `src/components/job-feed/feed-cards.tsx`
- `src/lib/job-feed/constants.ts`
- `docs/current-marketing-content-audit.md`

Current product capabilities to reflect:

- Plus users can receive up to 15 ranked matches per day.
- Max users can receive up to 25 ranked matches per day.
- Plus monthly framing: up to about 300 hand-picked jobs per month.
- Max monthly framing: up to about 500 hand-picked jobs per month.
- Jobs are selected based on roles, countries, cities, work mode, seniority, skills, languages, work authorization, salary floor, and user preferences.
- Useful Apply can use the user's CV to help set up feed preferences.
- Users can save jobs, dismiss jobs, rate relevance, open employer sites, and apply with Useful Apply.
- Job Feed supports "Apply with Useful Apply" handoff into the application-generation workflow.

Important: verify the current code and wording before finalizing exact claims. If there is any mismatch between desired marketing framing and implemented product caps, point it out clearly before changing copy.

### Pricing and Plan Copy Requirements

Rewrite pricing cards and plan feature bullets so they communicate pure user value, not just credit math.

Current stale item to remove everywhere:

- "Chrome Extension: auto-fill ATS forms"
- "Chrome Extension (Coming Soon)"
- Any "Coming Soon" badge tied to the Chrome extension.

Replace that value with the Smart Job Feed and the expanded platform value.

Pricing cards should explain what users actually get:

- Free: test the quality, generate a small number of complete applications, experience the product with low friction.
- Plus: serious job search support, daily hand-picked jobs, more complete applications, application history, add-on credits, priority support.
- Max: highest-volume job search package, more hand-picked jobs, more applications, screening question answers, premium support, strongest automation.

Pricing copy should communicate both:

- Speed: Useful Apply saves hours by finding jobs and generating application materials quickly.
- Quality: Useful Apply uses the user's real CV, fit analysis, ATS-safe templates, and anti-hallucination guardrails.

Avoid framing the product as choosing between speed and quality. The intended message is that Useful Apply gives job seekers both quality and speed at a fraction of the cost and effort of doing everything manually.

### Copywriting Standards

Use strong product copy, but keep it grounded.

Do:

- Write in plain, direct language.
- Show concrete value.
- Explain what the user gets after signing up.
- Explain how each feature saves time or improves application quality.
- Use job seeker language, not internal engineering language.
- Make the product feel helpful, trustworthy, and capable.
- Keep claims believable and connected to implemented features.
- Use specific numbers where useful, especially around time saved, applications, credits, and job-feed volume.
- Keep the tone confident without sounding pushy.

Do not:

- Use long em dashes.
- Use AI-sounding filler.
- Use jargon-heavy copy.
- Use vague phrases like "revolutionize your job search" unless backed by specific product value.
- Overuse "agentic", "seamless", "game-changing", "unlock", "leverage", or similar generic SaaS language.
- Make unsupported claims about interview rates, response rates, or competitors unless already supported in existing content.
- Make the copy too salesy or aggressive.

### Pages and Surfaces to Update

The implementation agent should critically review and update copy across:

- Home page
- Features page
- Pricing page
- Shared navbar/footer CTAs if needed
- Comparison pages where the current positioning is stale
- Relevant blog listing CTA or product-SEO pages if they conflict with the new positioning
- Pricing cards on the homepage
- Pricing cards on the pricing page
- Upgrade and low-credit modals
- Subscription settings plan comparison
- Dashboard upgrade CTAs if wording needs adjustment
- Signup wall and anonymous-user prompts if the free-plan copy needs consistency

The agent should use `docs/current-marketing-content-audit.md` to avoid rediscovering every current copy surface from scratch, but should still inspect files before editing.

### Critical Analysis Required Before Implementation

Before making changes, the agent should:

1. Read `docs/current-marketing-content-audit.md`.
2. Read this brief.
3. Inspect the relevant source files for exact implementation details.
4. Identify contradictions or stale claims.
5. Propose a clear rewrite plan to the user.
6. Wait for user confirmation before implementing.

The rewrite plan should explain:

- What sections will keep their current copy.
- What sections will be rewritten.
- Where Smart Job Feed will be introduced.
- How pricing cards will change.
- Which stale comparison or blog claims will be updated.
- Which claims require user confirmation because they may be product or business decisions.

### Design Phase Guidance

This task should be handled in two phases:

1. Copy and content rewrite first.
2. Redesign after the copy is approved and implemented.

After the content rewrite is complete, the agent should commit/push the copy work if requested or if that is part of the workflow, then return and say it is ready for the redesign phase.

For the redesign phase, the agent should act as an expert UI/UX designer and use the new copy to improve page structure, visual hierarchy, pricing-card clarity, and feature storytelling while respecting Useful Apply's existing brand palette and design language.

The redesign should not happen before the copy direction is clear.

## Part 2: Ready-To-Use Agent Prompt

Use this prompt for the implementation agent.

```text
You are working in the Useful Apply codebase. Your task is to rewrite the marketing copy and conversion copy for the website based on two markdown documents:

1. docs/current-marketing-content-audit.md
2. docs/marketing-copy-rewrite-brief-and-agent-prompt.md

First, read both documents carefully. The current-content audit tells you what copy exists today and where it appears. The rewrite brief tells you what the user wants to keep, what must change, and how the product should now be positioned.

The major strategic shift:
Useful Apply is no longer just an AI job application generator for CVs, cover letters, application emails, and tracking. It is now a complete job application platform. Users can find hand-picked jobs through the Smart Job Feed, understand fit, generate a complete application package, apply, follow up, and track their process inside Useful Apply.

Preserve:
- The founder story / founder voice section on the homepage.
- The real review / Trustpilot review content.
- The time-savings calculator concept, though you may improve surrounding copy if it is clearly better.

Everything else is open to rewrite or improvement.

Important content goals:
- Introduce Smart Job Feed as a major product pillar.
- Reflect Plus job-feed value: up to 15 ranked jobs per day, about 300 hand-picked jobs per month.
- Reflect Max job-feed value: up to 25 ranked jobs per day, about 500 hand-picked jobs per month.
- Remove the stale Chrome extension coming-soon feature from pricing, modals, and settings copy.
- Rewrite Free, Plus, and Max pricing cards so they communicate user value, time saved, quality, speed, and the complete job-search workflow.
- Make the product feel like the place where users can find jobs, generate applications, and track everything.
- Keep claims grounded in the actual product implementation.

Writing standards:
- Do not use long em dashes.
- Avoid AI-sounding filler and generic SaaS jargon.
- Avoid pushy or overhyped sales copy.
- Use clear, direct, high-converting product copy.
- Focus on pure value: what the user gets, how it saves time, and why it improves their job search.
- Keep the founder/review trust layer authentic.

Workflow:
1. Read both markdown documents.
2. Inspect the relevant code files before editing, especially:
   - src/app/page.tsx
   - src/app/features/page.tsx
   - src/app/pricing/page.tsx
   - src/components/marketing/Navbar.tsx
   - src/components/marketing/Footer.tsx
   - src/lib/comparisons/data.ts
   - src/components/InsufficientCreditsModal.tsx
   - src/components/ui/LowCreditsModal.tsx
   - src/components/ui/LowCreditsBanner.tsx
   - src/components/ui/CreditIndicator.tsx
   - src/components/SignUpWallModal.tsx
   - src/components/settings/SubscriptionSection.tsx
   - src/components/job-feed/JobFeedPanel.tsx
   - src/components/job-feed/feed-cards.tsx
   - src/lib/job-feed/constants.ts
3. Do a critical analysis of the current copy and identify stale or contradictory claims.
4. Before implementing, present a clear plan to the user:
   - What you will keep.
   - What you will rewrite.
   - Where Smart Job Feed will appear.
   - How pricing cards will change.
   - Which comparison/blog/upgrade surfaces need updates.
   - Any claims that need confirmation.
5. Wait for user confirmation.
6. After confirmation, implement the copy changes.
7. Run appropriate checks.
8. Summarize changes clearly.

You may use local or global agents to gather information or inspect the codebase, but the final analysis, decisions, and copywriting should be done by you. Use any relevant local or global project skills for copywriting or design if available.

Design comes later:
Do not redesign the pages in this copy phase unless a tiny layout adjustment is required to fit the new copy. After the copy rewrite is complete, report that you are ready for the redesign phase. In the redesign phase, use the rewritten copy as the foundation for stronger UX/UI, visual hierarchy, and pricing/feature presentation.
```

## Part 3: Short Initial Prompt To Start The Next Agent

```text
Please start the marketing copy rewrite planning phase. Read these two files first:

- docs/current-marketing-content-audit.md
- docs/marketing-copy-rewrite-brief-and-agent-prompt.md

Do not implement yet. First, inspect the relevant source files, do a critical analysis, and propose the exact rewrite plan for the home, features, pricing, comparison, blog/SEO, CTA, pricing-card, and upgrade-prompt surfaces. After I confirm the plan, implement the copy changes.
```

