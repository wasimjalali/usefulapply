Written when the product was called Karko AI.

# Marketing Copy Rewrite Plan

Date: 2026-04-27
Phase: Copy rewrite planning (design phase comes later)
Source documents:
- `docs/current-marketing-content-audit.md`
- `docs/marketing-copy-rewrite-brief-and-agent-prompt.md`

---

## 1. Strategic Summary

### New positioning
Karko AI moves from "AI job application generator" to a **complete job application platform** that covers the full workflow a job seeker actually does:

1. **Find jobs** — Smart Job Feed delivers hand-picked, ranked roles daily.
2. **Understand fit** — honest fit score before you spend time or credits.
3. **Generate the application package** — tailored CV, cover letter, application email, follow-up email in under 90 seconds.
4. **Apply and follow up** — application-ready documents plus a timed follow-up email.
5. **Track progress** — every application stored with match score, status, and company context.

Two product pillars are now equal partners in marketing:
- **Smart Job Feed** (new pillar).
- **AI Application Kit** (existing pillar — CV, cover letter, emails, fit analysis).

The single sentence the whole site should communicate:
> Karko finds your best jobs every morning and writes a complete, tailored application for each one. One place. Under 90 seconds per job.

### What stays the same
- Founder story section on the homepage — kept verbatim, preserves authenticity.
- Trustpilot review block — kept as-is.
- Time-savings calculator concept (tier selector + big numbers + tagline) — kept. Surrounding framing may be tightened but the mechanic stays.
- Trust bar logos (Workday, Greenhouse, etc.) — kept.
- Claude Sonnet 4.6 trust pill and the "Why Trust Karko" block — kept, but the block moves after Job Feed positioning so the order reads: find jobs → fit → package → trust.

### Verified live pricing (source of truth)
Per `src/lib/supabase/credits.ts` and `.claude/rules/stripe-and-credits.md`:

| Tier | Credits/mo | Price | Applications |
|---|---|---|---|
| Free | 4 | $0 | ~2 full applications |
| Plus | 50 | $19.99 | ~25 full applications |
| Max | 200 | $79.99 | ~100 full applications |
| Add-on Pack | 50 | $19.99 (one-time) | ~25 applications |

Credit costs (verified in `credits.ts`):
- Full Application (CV + CL + email + follow-up): 2.0 credits
- Fit Analysis: 0.5 credits
- Generation after paid fit: 1.5 credits (so 0.5 + 1.5 = 2.0 total)
- Cover Letter / Email / **Follow-up** regen: 0.5 credits each

### Verified Job Feed caps (source of truth: `src/lib/job-feed/constants.ts`)

| Tier | Daily SerpAPI queries | Raw jobs/run | Visible jobs/day |
|---|---|---|---|
| Plus | 2 | 20 | **15** |
| Max | 4 | 40 | **25** |

Input caps (roles × countries × cities): Plus 2/2/2, Max 4/4/4.

Monthly framing the brief requested: "up to ~300 hand-picked jobs/month" (Plus) and "up to ~500 hand-picked jobs/month" (Max). This is conservative vs. the daily ceiling (15 × 20 weekdays = 300, 25 × 20 weekdays = 500) and matches a weekday framing. **Flagging for confirmation** (see §7).

---

## 2. Stale / Contradictory Claims To Fix Everywhere

These are documented in the audit and need coordinated fixes across multiple surfaces.

| Issue | Where | Fix |
|---|---|---|
| "Chrome Extension: auto-fill ATS forms" + "Coming Soon" | Pricing page Max card, Home pricing cards, `InsufficientCreditsModal`, `SubscriptionSection` | Delete entirely. Replace with Smart Job Feed value bullets. |
| Features page table: "Free 10, Plus 100, Max 200" | `src/app/features/page.tsx` | Correct to 4 / 50 / 200 to match live pricing. |
| Teal + Enhancv comparisons: "Karko job tracking = Roadmap", "No job tracking (yet)" | `src/lib/comparisons/data.ts` | Flip: Karko now has an in-app tracker (already implemented on `/applications`). Remove roadmap framing. |
| No Smart Job Feed mention in any comparison | `src/lib/comparisons/data.ts` | Add Smart Job Feed as a Karko advantage (Teal, Jobscan, Rezi, Enhancv, Resume.io). |
| "Full Application: CV + Cover Letter + Email" — missing follow-up | Pricing page credit card | Say "CV + Cover Letter + Application email + Follow-up email". |
| Pricing FAQ "What do I get?" — missing follow-up | Pricing page FAQ | Include follow-up email. |
| Time-saved conflict: Plus ~18h vs ~37h | Pricing page calculator vs Subscription settings | Standardize on one number. **Needs confirmation** (see §7). |
| Dashboard anonymous copy says "1 application free" but marketing says "2 applications / 4 credits" | `ChatPanel.tsx` signup block | Align wording: anonymous trial = 1 application free with no account; signed-up free plan = 2 applications/month. |
| `SubscriptionSection` comparison table: "Hours saved: Free ~4h" (should be ~2h since Free = 2 apps × ~45 min) | `SubscriptionSection.tsx` | Correct to ~2h. |
| Regen credit cards show Cover Letter + Email only; follow-up regen omitted | Pricing page "How Credits Work" | Either add Follow-up Regen tile or compress to "Any document regen: 0.5 credits". |
| Pricing page CTA labels fine, but `/pricing` "Learn More" button goes to `/` — weak | Pricing final CTA | Replace with either "See Features" → `/features` or delete. |

---

## 3. Rewrite Scope Per Surface

### 3.1 Home page — `src/app/page.tsx`

**Structure change (small reorder, not a redesign):**
1. Hero
2. Trust bar (kept)
3. **NEW: Two-pillar band** — "Find jobs + write applications. One app." (introduces Smart Job Feed and AI Application Kit side by side.)
4. How It Works — rewritten to **5 steps** (find → fit → package → apply → track) instead of 3.
5. Product Showcase — expanded to include Job Feed screenshot/card.
6. Reviews (Trustpilot, kept)
7. Why Trust Karko AI (kept)
8. Founder Story (kept, untouched)
9. Pricing cards (rewritten, see §3.3)
10. Time Savings calculator (kept, surrounding copy polished)
11. Master CV section (kept, minor polish)
12. Final CTA (rewritten)

**Rewritten hero:**
- Headline: "Find your next job and apply in 90 seconds."
- Subhead: "Karko finds hand-picked roles for you every morning, then writes a tailored CV, cover letter and emails for each one. All in one place."
- Primary CTA: "Start free, no credit card" → `/dashboard`
- Secondary CTA: "See how it works" → `#how-it-works`
- Stats row: "Jobs picked daily", "<90s per application", "4 docs per job"

**Rewritten How It Works (5 steps):**
1. **Upload your CV once.** Your source of truth. Karko reads your real experience and stores it as your Master CV.
2. **Get jobs picked for you.** The Smart Job Feed searches across your roles, countries and cities. Every morning your best matches are ready when you open Karko.
3. **See how well you fit.** An honest match score and skill-gap read, so you know where to focus before spending credits.
4. **Get your complete application.** Tailored CV, cover letter, application email and follow-up email in under 90 seconds.
5. **Track everything in one place.** Every application stored with match score, status and company context. No spreadsheet needed.

**Rewritten Product Showcase intro:**
- Headline: "Everything your job search needs, in one app."
- Subhead: "Find roles, review fit, write the package, apply and track. You never leave Karko."

**Rewritten Final CTA:**
- Headline: "Your job search lives here now."
- Subhead: "Start free. No credit card. Two complete applications on the house."
- Buttons: "Try it free" / "See pricing"

**Reviews + Why Trust Karko**: keep, no rewrite.

**Founder story**: kept verbatim.

**SEO metadata** (new):
- Title: "Karko AI | Find Jobs and Write Tailored Applications in 90 Seconds"
- Description: "Karko picks hand-picked jobs for you every morning and writes a complete application package (CV, cover letter, emails) for each one. Free to try, no credit card."
- Structured-data feature list: add "Smart Job Feed (hand-picked daily jobs)" and "Application Tracker".

### 3.2 Features page — `src/app/features/page.tsx`

**Add Smart Job Feed as feature card #1** (before Fit Analysis). Reorder to reflect the 5-step flow.

New feature order:
1. Smart Job Feed *(new)*
2. Fit Analysis
3. AI CV Optimization
4. Personalized Cover Letters
5. Application Email Generation
6. Follow-Up Email Generation
7. Application Tracker *(new — currently absent)*
8. AI Screening Question Answers (Max)
9. Master CV System
10. ATS-First Templates

**Smart Job Feed feature card copy (new):**
- Label: "Smart Job Feed"
- Description: "Tell Karko the roles, countries and cities you want. Every morning, you open Karko to a feed of hand-picked jobs ranked by fit. Save the ones you like, dismiss the rest, or go straight into Apply with Karko."
- Bullets: "Daily delivery at your chosen hour", "Ranked by real fit against your CV", "Up to 15 jobs/day on Plus (~300/month), up to 25/day on Max (~500/month)", "Apply with Karko handoff into the Application Kit".
- Cost label: "Included in Plus and Max".

**Application Tracker feature card copy (new):**
- Label: "Application Tracker"
- Description: "Every application you generate is stored with its match score, status, company and role. Update status as you progress. No more spreadsheet."
- Cost label: "Included in all plans".

**Feature comparison table fix:**
- Credits row: Free **4**, Plus **50**, Max **200** (correcting from the stale 10/100/200).
- Applications row: Free ~2, Plus ~25, Max ~100.
- Add row: "Smart Job Feed" — Plus up to 15/day, Max up to 25/day.
- Add row: "Application Tracker" — all plans.
- Screening Question Answers — Max only (unchanged).

**Features FAQ updates:**
- Fix plan-credits answer: "Free includes 4 credits (about 2 applications). Plus includes 50 credits (about 25 applications). Max includes 200 credits (about 100 applications)."
- Add new FAQ: "How does the Smart Job Feed work?"
- Add new FAQ: "Can I track my applications in Karko?"

**Hero** headline updated: "Everything you need to find jobs and apply smarter." Subhead introduces both pillars.

### 3.3 Pricing page — `src/app/pricing/page.tsx`, `src/app/pricing/layout.tsx`

**Hero subhead rewrite:**
> "Start free. Upgrade when you want daily hand-picked jobs and more complete applications every month."

**Cards rewritten to communicate user value, not credit math first:**

**Free card:**
- Title: "Free"
- Tagline: "See if Karko is for you."
- Price: Free, forever
- Badge under price: "4 credits / ~2 full applications per month"
- Value bullets:
  - "2 complete applications per month"
  - "Tailored CV, cover letter, application email and follow-up"
  - "Honest fit score before you apply"
  - "Application tracker included"
  - "ATS-optimized US and EU templates"
  - "Powered by Claude Sonnet 4.6"
- Stat card: "~2 hours saved per month"
- CTA: "Start free"

**Plus card:**
- Title: "Plus"
- Tagline: "For active job seekers."
- Badge: "MOST POPULAR"
- Price: $19.99/month
- Badge under price: "50 credits / ~25 full applications per month"
- Value bullets (lead with Smart Job Feed):
  - "**Smart Job Feed: up to 15 hand-picked jobs daily (~300/month)**"
  - "25 complete applications per month"
  - "Full application tracker and history"
  - "Add-on credit packs (50 credits for $19.99, credits roll over)"
  - "Priority email support"
  - "Everything in Free"
- Stat card: "~18 hours saved per month"
- CTA: "Get Plus"

**Max card:**
- Title: "Max"
- Tagline: "For the intense job search."
- Badge: "SAVE ~108 HOURS/MONTH"
- Price: $79.99/month
- Badge under price: "200 credits / ~100 full applications per month"
- Value bullets:
  - "**Smart Job Feed: up to 25 hand-picked jobs daily (~500/month)**"
  - "100 complete applications per month"
  - "AI screening question answers (Max exclusive)"
  - "Premium dedicated support"
  - "Add-on credit packs (credits roll over)"
  - "Everything in Plus"
- Stat card: "~108 hours saved per month"
- CTA: "Get Max"

**REMOVED:** "Chrome Extension: auto-fill ATS forms (Coming Soon)" — gone from Max card.

**"How Credits Work" section:**
- Keep the 4-tile grid but fix copy:
  - Fit Analysis — 0.5 credits — "Fit score + skill gaps before you apply"
  - Full Application — 2 credits — "Tailored CV, cover letter, application email **and follow-up email**"
  - Cover Letter Regen — 0.5 credits — "New tone, same CV"
  - Any Email Regen — 0.5 credits — "Application email or follow-up"
- Optionally: add one more tile "Smart Job Feed delivery" — free with Plus/Max (editorial choice).

**Pricing FAQ rewrites:**
- "What do I get with each application?" — include follow-up email explicitly.
- "What's in the Smart Job Feed?" — new FAQ.
- Teal and Jobscan comparison FAQs — update to mention Smart Job Feed and application tracker.
- "Can I change my plan?" — keep.

**Final CTA:**
- Headline: "Your job search deserves better than a blank page."
- Subhead: "Start free. Two complete applications on the house. No credit card required."
- Primary button: "Try it free" → `/dashboard`
- Secondary button: "See features" → `/features`

**Layout metadata (`layout.tsx`):**
- Description rewrite: "Free, Plus $19.99/mo (25 apps + daily hand-picked jobs) and Max $79.99/mo (100 apps + 25 daily picks). Transparent pricing for the complete Karko workflow."

### 3.4 Navbar / Footer — `src/components/marketing/Navbar.tsx`, `Footer.tsx`

**Navbar:**
- Nav order unchanged. Add "Job Feed" as a nav item only if we build a dedicated `/job-feed` marketing page (flag as optional — see §7). Otherwise keep current links.
- Primary CTA label: "Try it free" (cleaner than "Try It Free").

**Footer:**
- Brand tagline rewrite: "Find jobs. Write applications. Track progress. All in one app."
- Free CTA: "Start free — 2 complete applications, no credit card" → `/dashboard`
- Product links — add "Smart Job Feed" entry (anchor to home section or features page Job Feed card). Keep "Master CV", "Application Tracker". Rename "Features" → "Features" (unchanged).

### 3.5 Comparison pages — `src/lib/comparisons/data.ts`

Every comparison page currently frames Karko as "AI job application assistant / complete application packages". This becomes "AI job application **platform**: find jobs, write applications, track progress".

**Global edits to all 6 comparisons:**
- Karko's Pros: add "Daily Smart Job Feed with hand-picked roles" and "Built-in application tracker".
- Karko's Cons: remove "No job tracking (yet)" and "Chrome extension" references.
- Summary tables: add "Smart Job Feed" row, add "Built-in Tracker" row, Karko = yes.
- Karko pricing line: unchanged (already correct: Free 2 apps, Plus $19.99/25 apps, Max $79.99/100 apps).

**Per-page edits:**

| Slug | Key fix |
|---|---|
| `karko-ai-vs-teal` | Teal's biggest differentiator was its tracker + Chrome extension. Flip the narrative: Karko now has a tracker and adds the Smart Job Feed that Teal doesn't. Teal still wins on their Chrome extension only. |
| `karko-ai-vs-jobscan` | Reframe: Jobscan scans. Karko finds the jobs and writes the full package. Smart Job Feed is a clean advantage. |
| `karko-ai-vs-rezi` | Rezi scores; Karko finds + writes + tracks. Adding Job Feed strengthens the positioning. |
| `karko-ai-vs-kickresume` | Design vs function. Keep ATS advantage; add Smart Job Feed and tracker as workflow advantages. |
| `karko-ai-vs-enhancv` | Enhancv had tracking and multi-language. Flip tracking claim. Add Job Feed. Multi-language still Enhancv's edge. |
| `karko-ai-vs-resume-io` | Resume.io has recruiter matching. Add Smart Job Feed as Karko's equivalent "job discovery" surface with transparent user control. |

**CTAs on comparison pages:** keep "Try Karko AI Free" but vary hero sub-CTA labels to include Smart Job Feed (e.g., "Find jobs and generate applications in 90 seconds").

### 3.6 Blog listing + product-SEO pages

**`/blog` listing page:**
- Hero subhead update: "Practical advice for finding jobs, writing applications, and getting callbacks. From the Karko team and real-world insights."
- Final CTA rewrite: "Stop switching between job boards and writing tools. Karko does both in one app."

**`src/lib/blog/posts.ts` (repeated claims inside post content):**
- Existing claims "Free for first 2 applications", "$19.99 / 25 apps", "$79.99 / 100 apps" — **already correct**, no rewrite needed.
- Posts that mention competitors' Chrome extensions or tracking gaps — low priority to change, but we should do a pass to add Smart Job Feed as a Karko advantage where it fits naturally. Specifically the "AI tools comparison" post and the "Teal comparison" post.
- No change to the evergreen "follow-up email" / "cover letter" / "ATS" / "how long to apply" posts. They are on-brand.

**`src/app/ai-job-application/*` product-SEO pages:**
- Main `/ai-job-application` page — update hero/positioning to match home-page language (find + apply + track).
- Pricing-credits page — already uses correct Free 4 / Plus 50 / Max 200 numbers, **no change needed**.
- Application tracker page — already on-brand; add Smart Job Feed handoff note.
- Add Smart Job Feed mentions to the 90-second-application-package and zero-fabrication pages where context fits. Keep narrow edits, no structural rewrites.

### 3.7 Dashboard & app conversion surfaces

These are in-app, not public marketing, but the brief explicitly asks they be updated for consistency.

**`ChatPanel.tsx`:**
- Signed-in-with-CV heading stays: "Ready to apply?"
- Anonymous CTA line: replace "Try one application free, no account needed" with "Try one application free. No account needed to test it."
- Keep "Apply Directly" / "Analyze Fit First" buttons but make sure helper copy matches current credit costs (2 / 0.5 + 1.5 split).

**`InsufficientCreditsModal.tsx`:**
- Header unchanged.
- Supporting copy rewrite: "Upgrade to keep applying. Your tailored CV, cover letter, emails and daily hand-picked jobs, all in one plan."
- Plus card features — lead with "Smart Job Feed: ~15 jobs/day", then 25 applications, unlimited history, add-on packs, priority support. **Remove Chrome Extension from Max card.** Replace with "Smart Job Feed: ~25 jobs/day" and "AI screening answers".

**`LowCreditsModal.tsx`:**
- Header + add-on card — no structural changes, minor copy tighten.
- Max upsell card — rewrite to mention Smart Job Feed (~25 jobs/day) instead of "full automation".

**`LowCreditsBanner.tsx`:**
- Keep the "X credits left, almost out" thresholds. No rewrite needed beyond tone check.

**`CreditIndicator.tsx`:**
- Credit Usage list — add Follow-Up Regen (0.5 credits). Currently omitted.

**`SubscriptionSection.tsx`:**
- Free upgrade block: rewrite to lead with Smart Job Feed: "Get daily hand-picked jobs and 25 applications per month. Upgrade to Plus."
- Plan comparison table:
  - **Remove Chrome Extension row.** Replace with "Smart Job Feed (~15 jobs/day on Plus, ~25 on Max)".
  - **Fix "Hours saved" row**: Free ~2h (not ~4h), Plus ~18h, Max ~108h. Standardize with pricing page and home-page calculator.
  - Add "Application tracker" row as "All plans".

**`SignUpWallModal.tsx`:**
- Subtitle: keep "Free plan includes 4 credits (2 applications/month)". No change needed.
- General trigger copy — optionally mention "Plus unlocks the Smart Job Feed" as a soft upsell cue post-signup. Flag for decision (see §7).

**Dashboard header upgrade CTAs:**
- Keep labels "Upgrade to Plus" / "Upgrade to Max". No rewrite needed.

**Job Feed onboarding wizard (`JobFeedPanel.tsx`, `feed-cards.tsx`):**
- Current wizard copy is good, no rewrite needed. One small edit:
  - Free-user upgrade stage bullet "Up to 15 ranked matches visible per day on Plus" → add a matching bullet "Up to 25 on Max" to make the tiering visible.

---

## 4. New Copy Blocks To Introduce

### 4.1 Home: Two-pillar band (new section, placed between Trust Bar and How It Works)

```
Label: What Karko does
Headline: Two problems. One app.

Left card — Smart Job Feed
  Icon: compass / feed
  Title: "Jobs picked for you, every morning."
  Copy: "Tell Karko the roles, cities and countries you want. Every morning,
        you open the app to a feed of hand-picked jobs ranked by real fit.
        Save the good ones. Dismiss the rest. Apply with one click."

Right card — Application Kit
  Icon: document / sparkles
  Title: "A full application in 90 seconds."
  Copy: "Paste or pick a job. Karko writes a tailored CV, cover letter,
        application email and follow-up email from your real experience.
        All ATS-safe, all from the truth in your Master CV."
```

### 4.2 Features: Smart Job Feed card (detailed)

```
Label: Smart Job Feed
Headline: "Your daily feed of hand-picked jobs."
Copy: "Karko runs searches across the roles, countries and cities you care
       about. You open the app once a day. Your top matches are already there,
       ranked by fit against your CV. Save jobs you like, dismiss ones that
       miss, or open the Application Kit and let Karko write the full package
       in under 90 seconds."

Bullets:
- Daily delivery at your chosen hour
- Ranked by real fit against your CV, not keyword match
- Up to 15 jobs per day on Plus (~300/month)
- Up to 25 jobs per day on Max (~500/month)
- Save, dismiss and rate matches to improve tomorrow's feed
- One-click "Apply with Karko" into the Application Kit

Plan note: "Included with Plus and Max."
```

### 4.3 Home: 5-step How It Works

Covered in §3.1.

### 4.4 Pricing card Smart Job Feed bullets

Covered in §3.3.

---

## 5. Voice & Style Rules Applied

Following CLAUDE.md and the brief:

- **No em dashes.** All copy above uses commas, colons or new sentences.
- Contractions encouraged ("you're", "we'll", "it's").
- Short sentences, active voice.
- No hollow filler ("Absolutely!", "Seamlessly unlock"), no SaaS cliches ("revolutionize", "game-changing", "leverage").
- Specific numbers over vague adjectives: "up to 15/day (~300/month)" beats "lots of jobs".
- "Apply with Karko" is a named action, kept consistent.
- Claim rules: keep only the claims backed by product or existing content. Flag unsupported ones (see §7).

---

## 6. Execution Order (when we start implementing)

1. **Pricing numbers + Chrome-extension cleanup first**, because several surfaces contradict each other:
   - `src/app/features/page.tsx` plan table (fix 10→4, 100→50).
   - `src/app/pricing/page.tsx` Max card (remove Chrome extension).
   - `src/components/InsufficientCreditsModal.tsx` Max card (remove).
   - `src/components/settings/SubscriptionSection.tsx` table (remove + fix hours-saved row).
2. **Home page rewrite** (`src/app/page.tsx`): hero, How It Works → 5 steps, new two-pillar band, Product Showcase intro, Final CTA, SEO metadata.
3. **Features page rewrite** (`src/app/features/page.tsx`): new Smart Job Feed card, new Application Tracker card, reorder, fix FAQ, fix plan table.
4. **Pricing page rewrite** (`src/app/pricing/page.tsx`, `layout.tsx`): hero, cards, credit grid, FAQ, final CTA, metadata.
5. **Navbar/Footer** polish (`src/components/marketing/*`).
6. **Comparison pages** (`src/lib/comparisons/data.ts`): add Smart Job Feed and tracker lines, remove roadmap framing.
7. **Blog listing + targeted product-SEO pages** (`src/app/blog/page.tsx`, `src/app/ai-job-application/page.tsx`).
8. **In-app conversion copy**: `ChatPanel.tsx`, `InsufficientCreditsModal.tsx`, `LowCreditsModal.tsx`, `CreditIndicator.tsx` (add follow-up regen), `SubscriptionSection.tsx` (full table update), `JobFeedPanel.tsx` (Max bullet).
9. **Final pass**: grep for "Chrome Extension", "Coming Soon", "Free 10 credits", "Plus 100 credits", "roadmap" in any remaining surface.
10. **Verify**: `npx tsc --noEmit`, `npm run lint`, spot-check affected pages locally.

No new component files required. All changes are inline to existing sources. The redesign phase (visual hierarchy, card layouts, section art) happens after this copy pass is merged.

---

## 7. Items That Need Your Confirmation Before I Write Anything

These are product, business or brand decisions that I should not make unilaterally.

1. **Smart Job Feed monthly framing.**
   Brief asks for "up to ~300 jobs/month (Plus)" and "up to ~500 jobs/month (Max)". Live caps are 15/day and 25/day, so "~300 and ~500" aligns with 20 weekdays and reads as conservative. Weekday framing is honest but undersells the ceiling (15 × 30 = 450; 25 × 30 = 750). **Confirm:** use the brief's 300/500 numbers? Or do you want the higher "up to 450/750" ceiling? My recommendation is 300/500 — conservative marketing beats eventual walk-back.

2. **Max tier positioning: "Full automation" vs "For the intense job search".**
   Current copy says "Full automation for power applicants", which is misleading since nothing auto-applies. I plan to rewrite to "For the intense job search" or "For full-time job searching". Confirm the new framing.

3. **Hours-saved number standardization.**
   Pricing page says Plus "~18h/mo". Subscription settings table says "~37h". Home calculator says "~18h". The math: 25 apps × (45min manual − 90s Karko) ≈ 18h. ~37h would require 50 apps. I recommend standardizing on **~18h (Plus)** and **~108h (Max)**, which match the credit cap. Confirm.

4. **Free plan and Smart Job Feed.**
   Today Free users see an upgrade gate on Job Feed. Brief is silent on whether Free should get a 1x/week or limited Job Feed preview. My recommendation: keep Free as-is (gated, serves as the upgrade hook). Confirm or flip.

5. **Claims currently in the copy that may not be supported.**
   Please confirm or remove:
   - "Application emails increase response rates by up to 40%"
   - "Cover letters get 50% more callbacks than templates"
   - "100 applications in 2.5 hours vs 75 hours manually / 97% time savings"
   If these are sourced, we can keep them. If not, I'll soften to "can meaningfully lift callbacks" or drop.

6. **Dedicated `/job-feed` marketing page.**
   Do we want a standalone marketing page for the Smart Job Feed (similar to `/master-cv`), or is feature-surface-on-home plus a Features page card enough for this pass? My recommendation: skip in the copy phase, revisit during the redesign phase so we can pair new copy with a proper layout.

7. **Footer link for Smart Job Feed.**
   If we add "Smart Job Feed" to the Footer product column, where should it link? Options: `/features#smart-job-feed`, `/#how-it-works`, or a yet-to-exist `/job-feed` page. Recommendation: `/features#smart-job-feed` during this copy pass.

8. **Anonymous trial wording inconsistency.**
   Site marketing says "2 free applications" (that's the signed-up Free plan). Dashboard anonymous says "1 application free no signup". Both are true but different audiences. Recommendation: keep both with clearer phrasing — "Try one application with no signup, then get 2 more free applications when you create an account." Confirm.

9. **Screening-question claim.**
   Keep "AI Screening Question Answers" as Max-only and mention on Max card? (Currently yes, implementation matches.) Confirm.

10. **Application Tracker positioning.**
    Tracker exists and works. Confirm it's allowed to be marketed as a first-class pillar on Features and in comparisons. (This is the key flip from "Teal wins on tracking".)

---

## 8. Out of Scope For This Pass

- Visual redesign, typography changes, card layouts, new illustrations, new screenshots.
- Any backend / product / feature changes.
- New comparison pages or new blog posts.
- Email templates (transactional emails, welcome emails).
- Paid-ad / landing-page variants.
- Changing Stripe pricing, credit costs or plan tiers.

These belong to the redesign phase that follows, once copy is approved and merged.

---

## Ready for review

Please review sections 1–7. The ten confirmation questions in §7 are the blockers. Once you answer them (or tell me "use your recommendations for everything"), I'll execute the rewrite in the order shown in §6 and come back with a tsc-clean, lint-clean diff.
