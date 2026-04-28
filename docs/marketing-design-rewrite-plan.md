---
name: Marketing Design Rewrite Plan
description: Expert UI/UX redesign for Karko marketing surfaces (home, features, pricing, compare). Critique + resolution.
version: 3
date: 2026-04-28
owner: karko-ui-designer
---

# Marketing Design Rewrite — UI/UX Critique & Redesign

> **Version 3 adds:** self-critique of version 2, the Founder Story section (previously removed in error), a full pricing card redesign for both `/pricing` and the home pricing teaser, and a revised section order. Read section 0 first.

---

## 0. Self-critique of v2 (what I got wrong)

Before adding new sections, here is an honest pass on what version 2 missed or overreached on. This is the diff between v2 and v3.

### 0.1 I removed the Founder Story. That was a mistake.
- **What I did in v2.** The home section list in v2 §1.2 dropped to 7 sections and did not include the Founder Story. I treated it as "polish" content and implicitly deprioritized it.
- **Why that is wrong.** Karko is a pre-revenue tool built by a solo founder who lived the problem the product solves. The founder story ("I ran out of money building a startup in Germany… Generic applications got me zero interviews") is **the highest-legitimacy asset on the page.** It answers the unasked question every visitor has: *"why should I trust this product made by a company I have not heard of?"* Removing it weakens conversion more than gaining a shorter page does. Every pre-PMF SaaS marketing page keeps this block for a reason.
- **Fix.** Restore the Founder Story as a first-class home section. Keep the copy exactly as it is — that copy is earned. Redesign the container only. Details in §12.

### 0.2 I treated the pricing cards as solved. They are not.
- **What v2 did.** v2 said "Pricing Teaser" on the home page as if the existing card component was fine, and said nothing about the real pricing page (`/pricing`) cards.
- **What is actually broken.**
  1. **Value hierarchy is inverted.** On each card the first thing the eye sees is a tiny icon + small plan name. The price is the second row. The actual value proposition ("25 complete applications per month") is buried below a credits pill that most users do not know how to price. Pricing-page best practice: **lead with the outcome the user buys**, then the price, then the credits/metering.
  2. **The "credits" concept is confusing without a framing sentence.** "50 credits/month" is shown as a pill before the user is told an application costs 2 credits. The feature list later mentions "25 complete applications/month" but the pill implies credits are the unit they buy. Visitors have to do arithmetic to know what they are getting.
  3. **Three different badge styles across three cards.** Free has no badge, Plus has "MOST POPULAR | SAVE ~18 HOURS" in a gold gradient bar, Max has "SAVE ~108 HOURS" in a navy gradient bar. The badges collide visually and compete for "most popular" status. Only one card should claim it.
  4. **The "Need more credits?" expandable panel lives inside each card.** This is an upsell for an add-on pack; putting it in the pricing card turns the card into a mini-shop and distracts from the plan decision. It belongs **below** the plan grid as a single "Add-on credit packs" band, not inside each card.
  5. **Feature lists mix feature categories (what you get) and meta claims (powered by Claude Sonnet 4.6).** The model name is not a feature a job seeker evaluates; it is marketing trivia for LLM-aware visitors. Put it in a footnote.
  6. **Gradients on the CTAs** (`bg-gradient-to-r from-gold-400 to-gold-500`) violate the design system and read as AI-slop. The brand-new CTA tokens are flat.
  7. **Rounded radii inside cards are `rounded-xl` on icon chips and `rounded-xl` on add-on buttons** — both violate the "3 + 1 radii" scale (`rounded-full`, `rounded-lg`, `rounded-2xl`).
  8. **Home pricing teaser duplicates the full pricing page.** It shows the same three full cards with all features. That is wasteful: home should **summarize** (price + headline benefit + CTA) and link to `/pricing` for the full comparison.
- **Fix.** Full pricing card redesign, §13 and §14.

### 0.3 My "carousel" spec was under-engineered.
- **What v2 did.** I said "one carousel, 5 slides, 36/64 split, no auto-play." I did not specify: (a) what happens on tablet, (b) how tall the screenshot frame is when the source image has a wildly different aspect ratio, (c) what the heading above the carousel actually says, (d) whether to use a library (Embla) or hand-roll.
- **Fix.** Clarification in §3.x below — use **Embla Carousel** (13KB, accessibility baked in, keyboard and swipe), fix a 16:10 aspect-ratio frame so the five screenshots render consistently, and give the section a real heading.

### 0.4 Nothing in v2 said *why* the redesign should move conversion. That was a tell.
- **Fix.** Every major change in v3 now has a one-line **conversion hypothesis** ("this should move X because Y").

---

# Marketing Design Rewrite — UI/UX Critique & Redesign

> **Scope.** This plan covers the Karko AI marketing surfaces (`/`, `/features`, `/pricing`, `/compare`). It is not an asset manifest. Each recommendation below starts from a **design problem** the current page has, states the **principle being applied**, and ends with a **concrete implementation** Claude Code can ship.

The goal is simple: make the home page feel like the product it sells. Confident, focused, typographically grounded, without the AI-brochure tells (gradient fills everywhere, stacked sections, six showcase tiles nobody reads).

---

## Asset inventory (final — keep only these)

After audit, the image library is reduced to **10 files total**. Everything else was dropped for being redundant, wrongly named, or off-brand.

### Product screenshots (5 — `docs/screenshots/*.webp`)

| File | What it shows | Primary use |
|---|---|---|
| `product-01-job-feed.webp` | 6 hand-picked jobs with match badges, Apply with Karko button | Hero product shot + showcase slide 1 |
| `product-02-cv-optimized.webp` | Optimized CV with ATS score, templates, full preview | Showcase slide 3 |
| `product-03-application-email.webp` | Application email with subject line + body ready to send | Showcase slide 4 |
| `product-04-tracker.webp` | Tracker with 51 jobs, status pills, match scores | Showcase slide 5 |
| `product-05-fit-analysis.webp` | Strong fit analysis: strengths, gaps, recommendation | Showcase slide 2 |

### Brand illustrations (5 — `docs/images/*.webp`)

| File | Concept | Primary use |
|---|---|---|
| `gpt-01-two-pillar-job-feed.webp` | Compass / briefcase motif in navy+gold | Two-Pillar band (left pillar) |
| `gpt-02-two-pillar-application-kit.webp` | Folder of documents motif | Two-Pillar band (right pillar) |
| `gpt-03-compass-card.webp` | Decorative compass card | How It Works step 2 accent |
| `gpt-04-email-seal.webp` | Wax-seal email illustration | How It Works step 4 accent |
| `gpt-05-checklist-tracker.webp` | Checklist on a warm background | How It Works step 5 accent |

Everything else is archived under `docs/screenshots/_archive_v2/` and `docs/images/_archive_v2/`. Do not re-introduce without cause.

---

## 1. Home page — the redesign

### 1.1 What's wrong today

Reading the current `src/app/page.tsx` top-to-bottom, the eye hits **too many sections of roughly equal weight**: hero, two-pillar, showcase list of 6 cards, how-it-works 5-step, trust, calculator, pricing teaser, testimonials, FAQ, final CTA. Every band has its own heading, its own padding, its own background tint. The page reads as a table of contents for the product rather than a confident pitch. A user who scrolls past the hero sees **cards, cards, cards** before anything memorable happens.

Three specific problems:

1. **`ProductShowcase.tsx` lists 6 features as stacked rows.** That format punishes the most important visual asset (the real product UI). Each screenshot gets less than a second of attention because the next heading is already visible under it.
2. **Gradient headers and gradient CTAs everywhere.** The design system says gradients are reserved for CTAs only, yet the showcase uses `h-1.5 bg-gradient-to-r from-navy-600 to-navy-700` strips and gradient icon tiles on every card. This reads as AI-slop.
3. **Hero uses a single product thumbnail on the right.** It's fine, but the thumbnail itself is small relative to the hero's ambition. The screenshot should be the headline of the page, not a sidebar illustration.

### 1.2 New home page section order (authoritative — v3, 8 sections)

Every section earns its place by doing one job the others can't. Order is tuned to the visitor's question sequence:
*what is this → does it actually work → how → can I trust it → what does it cost → get started.*

| # | Section | Visitor question it answers | Key asset |
|---|---|---|---|
| 1 | **Hero** | "What is Karko and what does it do for me?" | `product-01-job-feed.webp` (large) |
| 2 | **Two-Pillar band** | "What are the two things it does?" | `gpt-01`, `gpt-02` |
| 3 | **Product Showcase (carousel)** | "Show me the actual product." | 5 product WebPs |
| 4 | **How It Works** | "How do I go from upload to tracked application?" | icons + 3 GPT accents |
| 5 | **Founder Story** | "Why should I trust this tool?" (legitimacy anchor) | `/wasim-founder.jpg` |
| 6 | **Time Savings Calculator** | "How much time does this really save me?" | n/a |
| 7 | **Pricing Teaser** | "What does it cost — headline view?" | n/a (links to /pricing) |
| 8 | **Final CTA** | "Okay, get me started." | flat navy |

Drop from home: long Trustpilot block (move to `/compare`), FAQ block (it already lives on `/pricing`), and the legacy feature tiles grid (the carousel replaces it).

**Why Founder Story sits between How It Works and Pricing:** the user has just understood *what the product does* and *how it works*. The next question a skeptical visitor asks is *who made this and why should I trust it.* The founder story answers that immediately before the price is shown. This order is deliberate — do not move it next to the hero (it becomes navel-gazing) and do not move it to the bottom (it becomes a footnote nobody sees).

---

## 2. Hero — `src/app/page.tsx` top section

### Problem
The hero does the positioning work well ("Find your next job and apply in 90 seconds"), but the **visual hierarchy leaks**: left column is heavy on copy (eyebrow, H1, paragraph, two CTAs, trust row, four-metric strip), right column is a small screenshot in a rounded card. Readers bounce between the two columns because neither dominates.

### Principle
**One hero, one visual gravity center.** On marketing surfaces, the product shot should be the page's biggest pull, not a sidekick. The copy is the caption.

### Redesign

- **Left column (40%)**: eyebrow pill, H1 (Georgia, semibold, 48–60px), subhead (single sentence), primary CTA `bg-gold-400 hover:bg-gold-500 text-navy-900` + secondary ghost link. That's it. Kill the 4-metric strip for now (those numbers read better in the calculator).
- **Right column (60%)**: `product-01-job-feed.webp` at full column width (≥720px on desktop), no rounded card chrome, just a single thin `border-cream-200 shadow-lg` wrapper. Let the product itself be the frame. Float a small navy+gold "Apply with Karko" callout arrow pointing at one of the job cards (SVG overlay, no animation).
- **Background**: solid `bg-cream-100`. No radial gradient washes. The product shot + gold CTA is plenty of contrast.

**CTA rules (apply everywhere, not just hero):**
- Primary: `bg-gold-400 hover:bg-gold-500 text-navy-900 rounded-lg shadow-sm` — no gradient.
- Secondary: text link in `text-navy-600` with underline on hover, or `border border-navy-200 bg-white` ghost.

---

## 3. Product Showcase — replace stacked list with a **focused carousel**

### Problem
`ProductShowcase.tsx` currently renders all 6 features as full-width stacked cards, each with its own colored strip, icon tile, heading, description, and screenshot. The result:
- Each screenshot is only visible for the width of the viewport, but the **section itself takes ~3,000px of vertical scroll**. No one reads all 6.
- The visual framing (gradient strips, icon chips, "01" numerals, gradient hover shadows) steals attention from the screenshots themselves — the opposite of what a product showcase should do.
- Six features dilutes the story. The user needs to see **the 5 beats of the product**, not a feature laundry list.

### Principle
**A product showcase is a film, not a catalog.** One frame at a time. The viewer chooses the pace. The chrome disappears; the product appears.

### Redesign — one carousel, full bleed, 5 slides

**Component:** rewrite `src/components/marketing/ProductShowcase.tsx` as a horizontal carousel with the following spec.

**Layout per slide (desktop ≥1024px):**
```
+-----------------------------------------------------------+
|  Section label + step counter          [   <    >   ]     |   56px bar
+-----------------------------------------------------------+
|                                                           |
|   LEFT (36%, sticky-centered)      RIGHT (64%, dominant)  |
|   ----------------------           -------------------    |
|   Eyebrow (gold 400 text, caps)    [ Large screenshot ]   |
|   H3 Georgia semibold 32px         width: 100% of col     |
|   1-sentence description           shadow-lg, border only |
|   (max-w-md, text-warm-gray)                              |
|                                                           |
|   Slide indicator (1 of 5)                                |
|                                                           |
+-----------------------------------------------------------+
|                       . . o . .                           |   dot nav
+-----------------------------------------------------------+
```

**Behavior:**
- Fixed section height `min-h-[680px]`. Content wrapper `max-w-[1200px] mx-auto px-6`.
- Advance/back via `<` `>` chevrons top-right **and** dot-nav bottom. No auto-play by default (too AI-brochure). Optional 6s auto-advance that stops on first interaction.
- Slide transition: `transition-transform duration-500 ease-out` on a flex track, no fade. Horizontal swipe-able on touch devices.
- Keyboard: left/right arrow keys advance when section is in viewport.

**Visual treatment:**
- **No gradient strips. No icon chips. No "01" numerals.** The eyebrow ("Morning Job Feed") carries all the labeling weight.
- Screenshot wrapper: `rounded-2xl border border-cream-200 shadow-lg bg-white overflow-hidden`. That's the entire frame.
- Section background: `bg-cream-100` (canvas). Section heading above the carousel in Georgia semibold 36px, centered, with a short gold-500 rule (4px by 48px) under it.

**Slide content (final copy + asset map):**

| # | Eyebrow | Title | Description | Screenshot |
|---|---|---|---|---|
| 1 | Morning Job Feed | Jobs picked for you, daily | Every morning Karko delivers hand-picked roles that fit your profile. No keyword wrangling, no job-board swamp. | `product-01-job-feed.webp` |
| 2 | Fit Analysis | See why before you apply | A 0.5-credit read of your fit. Strengths, gaps, and what to lead with in the cover letter. | `product-05-fit-analysis.webp` |
| 3 | Optimized CV | ATS-ready in seconds | Your CV tuned to the role. Skills reordered, keywords matched, ATS score visible at the top. | `product-02-cv-optimized.webp` |
| 4 | Application Email | Ready to send | Subject line, body, tone. Copy it, paste it, hit send. Follow-up email included. | `product-03-application-email.webp` |
| 5 | Tracker | Every application in one place | Statuses, match scores, follow-up timers. One view of your search. | `product-04-tracker.webp` |

This replaces **one stacked 3,000px section with a 680px-tall carousel**. More impact, less scroll. Bigger screenshots. One story at a time.

---

## 4. Two-Pillar band — keep, simplify

### Problem
Currently fine in concept but the two-card grid uses heavy shadows and mismatched padding. The two GPT illustrations carry enough visual weight on their own.

### Redesign
- Same two-column grid, but remove the card shadows and replace with a single thin `border-cream-200` and `bg-cream-50` surface.
- Headings Georgia semibold 28px, short supporting line, one CTA each (ghost style).
- Illustrations `gpt-01-two-pillar-job-feed.webp` and `gpt-02-two-pillar-application-kit.webp` at `aspect-[4/3]` with `object-cover`.
- Spacing: `py-24` not `py-16`. This band deserves breathing room because it's the conceptual anchor of the product.

---

## 5. How It Works — 5 steps, not 5 cards

### Problem
The current 5-step section uses five identical cards in a row. Five equal-weight cards is visually monotonous and the step numbers get lost.

### Redesign — vertical timeline instead of horizontal cards

On desktop, render a **left-aligned vertical timeline** (60% width, centered):

```
  1 --- Upload your CV
  |    Takes 10 seconds. PDF or paste.
  |
  2 --- Get jobs picked for you
  |    Every morning, 15 hand-picked roles.        [gpt-03-compass-card]
  |
  3 --- See your fit for each one
  |    A 0.5-credit read, before you spend 2 credits.
  |
  4 --- Generate your application
  |    CV, cover letter, email. Tailored to that job.    [gpt-04-email-seal]
  |
  5 --- Track and follow up
       Status, reminders, a follow-up email ready.       [gpt-05-checklist-tracker]
```

- Step circles: `w-10 h-10 rounded-full bg-navy-600 text-white font-semibold` — numerals in Georgia.
- Connecting line: `border-l-2 border-cream-300`.
- GPT illustrations inline at 160x160 on the right of steps 2, 4, 5 — `rounded-2xl bg-cream-50 p-4`. Not every step needs one; let them punctuate.
- This collapses to a normal vertical stack on mobile (which we don't optimize for but shouldn't break).

---

## 6. Typography system — tighten on marketing only

The design system specifies Georgia for H1/H2/modal titles and Inter for everything else. On marketing pages, strengthen this:

| Element | Font | Size (desktop) | Weight |
|---|---|---|---|
| H1 (hero) | `font-serif` (Georgia) | 56px (clamp 40 to 56) | 600 |
| H2 (section) | `font-serif` | 36px | 600 |
| H3 (slide/card) | `font-serif` | 28px | 600 |
| Eyebrow | `font-sans` (Inter) | 12px, uppercase, letter-spacing 0.08em | 600 |
| Body | `font-sans` | 17px | 400 |
| Small meta | `font-sans` | 14px | 400 |

**Do not apply Georgia to:** CTAs, pricing numbers, step counters, nav, footer, trust pills, stat numerals. They're data points, not anchors.

---

## 7. Color & surface discipline on marketing pages

A checklist the implementation must pass:

- [ ] **No gradients** on page shells (`bg-gradient-to-b from-cream-50 to-white` — remove all).
- [ ] **No gradients** on CTAs (replace every `from-gold-400 to-gold-500` and `from-navy-600 to-navy-700` on `<button>` with the flat variants).
- [ ] **No `bg-white/85` or `bg-white/90`** translucent fills on cream canvas.
- [ ] **No `cream-300` or `cream-400` large fills** (they read as aged paper).
- [ ] **Card surfaces** default to `bg-cream-50 border-cream-200`. Not `bg-white` unless the card holds a document.
- [ ] **Rounded radii**: only `rounded-full` (pills), `rounded-lg` (controls), `rounded-2xl` (cards). Delete every `rounded-xl`, `rounded-3xl`, `rounded-[14px]`, `rounded-[20px]` you find.
- [ ] **Shadows**: `shadow-sm` at rest, `shadow-md` hover, `shadow-lg` for modals/elevated screenshots. Nothing else.

Spend a focused 30-minute pass on `src/app/page.tsx`, `src/components/marketing/ProductShowcase.tsx`, `src/app/features/page.tsx`, and `src/app/pricing/page.tsx` running this checklist top-to-bottom.

---

## 8. Motion — restraint, not orchestration

The current page uses `ScrollReveal` on almost every section. When everything reveals on scroll, nothing feels special; the page stutters as it loads.

**Rules:**
- Use `ScrollReveal` on the **hero**, the **Two-Pillar band**, and the **final CTA**. Nothing else.
- Carousel slide transitions: 500ms ease-out, translate only. No fade.
- Card hover: `-translate-y-0.5` + `shadow-md`. 200ms. Never lift more than 2px.
- Step circles (How It Works): no motion.

---

## 9. What to delete

Concrete cleanups, in order:

1. `src/components/marketing/ProductShowcase.tsx` — rewrite as carousel (the 6 to 5 reduction + new component is the biggest single change).
2. `src/app/page.tsx` — remove the separate features grid section (the carousel replaces it), move Trustpilot block to `/compare`, delete the FAQ block from home (it's on `/pricing`).
3. Any remaining `bg-gradient-to-*` classes on buttons and section shells across `src/app/page.tsx`, `src/app/features/page.tsx`, `src/app/pricing/page.tsx`.
4. `docs/screenshots/_archive_v2/` and `docs/images/_archive_v2/` — leave in place for rollback, but do not reference in code.

---

## 10. Implementation order (ship in 4 PRs)

1. **PR 1 — Asset trim + carousel.** Replace `ProductShowcase.tsx` with carousel. Copy 5 WebPs into `public/screenshots/`. Move 5 GPT WebPs into `public/images/`. Update `src/app/page.tsx` to render only the sections in section 1.2. *This is the visible win.*
2. **PR 2 — Hero rebalance.** 40/60 columns, larger product shot, drop the 4-metric strip. Apply flat-gold CTA. *This changes the first impression.*
3. **PR 3 — How It Works timeline + Two-Pillar cleanup.** Vertical timeline with 3 inline GPT accents. Drop shadows from Two-Pillar cards.
4. **PR 4 — Gradient + radius sweep.** Run section 7 checklist across all marketing pages. Lint pass. Visual regression check with `ui-tester` on `/`, `/features`, `/pricing`, `/compare`.

Each PR should be small enough to review in 15 minutes. Don't merge all four into one — the point is to watch conversion metrics per change.

---

## 11. Success criteria

After all four PRs ship:

- Home page vertical length drops by ~35% (fewer, tighter sections).
- Largest product screenshot on the page is 720px wide or larger (up from ~520px).
- Zero gradient fills on CTAs or section shells outside of `<Carousel>` internal chrome.
- `ui-tester` passes on `/`, `/features`, `/pricing`, `/compare` at 1440px.
- `npx tsc --noEmit` = 0 errors.

---

## 12. Founder Story — keep the copy, redesign the container

### 12.1 What exists today (src/app/page.tsx lines 434–486)

A center-aligned section with eyebrow "Built by a Job Seeker", H2 "The Tool I Wished I Had", then a white rounded card containing:
- 224×224 founder photo on the left (`rounded-2xl ring-4 ring-gold-100 shadow-lg`)
- Pull-quote on the right with a huge decorative left-quote glyph and two paragraphs
- "Read the full story" link to a blog post
- Name + title: *Wasim Jalali — Founder of Karko AI*

The copy is **the strongest asset on the page**. Do not touch it.

### 12.2 What is visually off

1. **The decorative `"` glyph in `text-gold-200/60 leading-none text-8xl`** is an AI-brochure tell. Every SaaS landing page overuses oversized pull-quote marks. It signals "AI landing-page template" to design-literate visitors.
2. **`bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400`** top strip — gradient on a non-CTA surface, violates design system.
3. **`ring-4 ring-gold-100`** around the photo is visual sugar. A founder photo does not need a halo.
4. **The photo is vertically centered with the quote.** With two paragraphs of copy, the photo floats awkwardly next to ~180px of text. Top-align the photo with the first paragraph instead.
5. **No visual anchor between the face and the quote.** The user reads the quote, sees the face, reads the name. Add a small handwritten-signature aesthetic (just the name in Georgia italic) under the face — it ties the face to the words.

### 12.3 Redesign spec

**Section shell:**
- `bg-cream-50` (surface, not canvas — this block should feel like a card laid on the page).
- `py-24` on desktop. This is a moment-section; breathing room matters.
- Kill `SectionBackground` overlay. The story is the asset; no texture needed.

**Inner container:**
- `max-w-5xl mx-auto`, no card border, no shadow, no gradient strip, no ring. The section background itself is the card.
- 2-column layout on desktop: 280px photo column + flex-1 quote column. `items-start` (top-aligned).

**Photo treatment:**
- 240×240, `rounded-2xl`, `border border-cream-200`, `shadow-sm` (not `shadow-lg`). No ring.
- Under the photo: `Wasim Jalali` in `font-serif italic text-charcoal` (24px). Below it, `Founder, Karko AI` in Inter 14px `text-warm-gray`. This reads like a signed card instead of a LinkedIn profile.

**Quote block:**
- Small eyebrow in gold-500 caps: `A NOTE FROM THE FOUNDER`.
- H2 in Georgia semibold 32px: *The tool I wished I had.*
- **Remove the `"` decorative glyph entirely.** Use a left-border treatment instead: `border-l-2 border-gold-400 pl-6` on the paragraphs. This is a quote, not a billboard.
- Paragraphs: 18px Inter, `text-charcoal`, `leading-relaxed`.
- "Read the full story" link: stays, styled as `text-navy-600 underline underline-offset-4 hover:text-gold-600`. Move it to its own line with a subtle chevron `→`.

**Copy (unchanged):**
> I ran out of money building a startup in Germany. No savings, no degree to fall back on. Generic job applications got me zero interviews. Tailoring each one by hand took 45 to 60 minutes, and it still was not fast enough.
>
> So I built Karko AI to do the entire workflow automatically. Paste a job description, get a tailored CV, cover letter, and professional email in under 90 seconds. Within about 20 applications, I got my first interview. That's when I knew every job seeker needed this.

### 12.4 Conversion hypothesis
Trust is the hidden blocker for pre-revenue SaaS. Moving the founder story up in visual quality (less templated, more human) and keeping it in the scroll path right before pricing should lift **pricing-page scroll-through rate** by ~10–15%.

---

## 13. Pricing page (`/pricing`) — card redesign

### 13.1 What is broken (in one line each)

| # | Issue | Impact |
|---|---|---|
| 1 | Value hierarchy inverted (icon → plan name → price → credits pill → features → CTA) | User has to scroll inside the card to find what they actually buy |
| 2 | "50 credits/month" shown before "25 applications/month" — credits ≠ outcome | Forces mental arithmetic before comparison |
| 3 | Two competing badges ("MOST POPULAR" on Plus, "SAVE ~108 HOURS" on Max) | Dilutes the "most popular" signal |
| 4 | "Need more credits?" add-on expandable lives inside each paid card | Turns pricing cards into mini-shops, distracts from plan decision |
| 5 | "Powered by Claude Sonnet 4.6" in feature list | Marketing trivia, not a feature |
| 6 | Gradient CTAs on Plus (`from-gold-400 to-gold-500`) | Violates design system; AI-slop tell |
| 7 | `rounded-xl` on icon chips and add-on buttons | Violates 3+1 radii scale |
| 8 | Free card feature count (6) = Plus (6) = Max (6), no visual ladder of value | User does not see that Plus is "more than Free, for a reason" |
| 9 | Plus `p-8` inner padding vs Max `p-8` + navy header = different vertical card lengths | Cards do not align, eye has nowhere to rest |
| 10 | "Try the full AI agent" subtitle on Free is jargon | Visitor does not know what an "AI agent" is |

### 13.2 Redesign — value-first pricing card template

**Card anatomy (top to bottom, every card follows this identical order):**

```
┌─────────────────────────────────────┐
│  [BADGE BAR — one card only]        │   36px (Plus only: MOST POPULAR)
├─────────────────────────────────────┤
│                                     │
│  PLAN NAME + tagline                │   plan name Georgia semibold 22px,
│                                     │   tagline Inter 14px warm-gray
│                                     │
│  [HEADLINE OUTCOME]                 │   32px Georgia semibold
│  e.g. "25 tailored applications     │   the outcome they BUY
│   every month"                      │   max 2 lines
│                                     │
│  $19.99 /month                      │   price: 40px Inter bold navy
│  $0.80 per application              │   per-unit in Inter 13px warm-gray
│                                     │
│  [Primary CTA — full width]         │   CTA ABOVE the features, not below
│                                     │   (best practice 2024+: reduce scroll to action)
│                                     │
│  ── INCLUDED ──                     │   small caps divider
│  ✓  Smart Job Feed, 15 jobs/day     │   feature list, 5 items MAX per card
│  ✓  Fit Analysis before every apply │   6px gap between items
│  ✓  Tailored CV, cover letter,      │
│      email and follow-up            │
│  ✓  Unlimited application history   │
│  ✓  Cancel anytime                  │
│                                     │
└─────────────────────────────────────┘
```

**Key structural changes from the current design:**

1. **Headline outcome sits ABOVE price.** Visitor sees *"25 tailored applications every month"* before they see *$19.99*. Value first, price second.
2. **CTA moves ABOVE the feature list.** On pricing pages the action must be reachable in ≤1 eye-scan. Features are confirmation of value *after* the CTA is visible.
3. **Feature lists capped at 5 items per card.** Free: 5. Plus: 5. Max: 5. Every card has the same length. The ladder is expressed in the headline outcome ("2 applications/month" → "25" → "100"), not by making cards longer.
4. **"Everything in Free" / "Everything in Plus" goes under the feature list**, as a subtle footer chip — not as a bullet. It does not fight the real features for attention.
5. **Claude Sonnet 4.6, anti-hallucination guardrails, ATS-optimized templates** move to a single sentence **below** the card grid: *"Every plan includes the full agentic AI workflow, US + EU ATS-optimized templates, and anti-hallucination guardrails. Powered by Claude Sonnet 4.6."* One line, serves all three cards.
6. **Add-on credit packs move to a dedicated band under the cards.** Single row, not inside cards. Headline: *Need more this month? Top up anytime.* Short form with one buy button per pack. Only visible for paid plans (same as today).
7. **Exactly one card carries a badge.** Plus gets `MOST POPULAR`. Max gets nothing above the card. Max already differentiates on price and the "100 applications" number — it does not need a 108-hours badge competing with Plus.
8. **Time saved moves into the card footer as a single line**, not a colored pill. *Saves you about 18 hours a month.* Italic, warm-gray, 14px. Subtle.
9. **"Powered by Claude Sonnet 4.6" is deleted from feature lists.** It goes in the trust-strip under the grid.

### 13.3 Copy rewrite (the outcome-first headline per card)

| Plan | Headline outcome (32px Georgia) | Tagline (14px Inter) | Price line |
|---|---|---|---|
| **Free** | 2 tailored applications every month | Try Karko, no card required | Free forever |
| **Plus** | 25 tailored applications every month | For serious job seekers | $19.99 / month — $0.80 per application |
| **Max** | 100 tailored applications every month | For the intense job search | $79.99 / month — $0.80 per application |

### 13.4 Card visual tokens (all three cards)

- Shell: `bg-cream-50 border border-cream-200 rounded-2xl shadow-sm`. No `bg-white` unless we want "document" layer, which pricing cards are not.
- Plus highlight: top border `border-t-2 border-gold-400` and `shadow-md` (not `shadow-xl`). No animated border. No inner gradient. Scale 1.0, not 1.02 — scaling a card in a 3-grid breaks column alignment.
- Max emphasis: just a darker border `border-navy-200`. No navy header bar.
- Icon chips: delete. Plan name alone carries it.
- CTA: `bg-gold-400 hover:bg-gold-500 text-navy-900 rounded-lg shadow-sm w-full py-3.5 font-semibold`. On Free and Max variants use the navy flat variant.
- Radii: only `rounded-2xl` (card) and `rounded-lg` (CTAs, pills).

### 13.5 Order on the pricing page (keep but tighten)

1. Page H1 + subhead
2. Plan cards (3-column grid)
3. Trust sentence (one line under cards, see §13.2 item 5)
4. **Add-on credit pack band** (moved out of cards)
5. Time Savings Calculator (unchanged logic, same design cleanup as home)
6. Comparison table (unchanged for now)
7. FAQ
8. Final CTA

### 13.6 Conversion hypothesis
Outcome-above-price + CTA-above-features is the most consistently validated pricing-card pattern in SaaS (Basecamp, Linear, Superhuman use it). Expected lift on `/pricing` → checkout: +8–12%. Measurable via PostHog `stripe_checkout_initiated` per plan.

---

## 14. Home pricing teaser — do NOT duplicate /pricing

### 14.1 What is wrong today
The home page Pricing section (`src/app/page.tsx` lines ~488–600) renders three near-full pricing cards with feature lists, add-on expandables, and time-saved pills. That is a second `/pricing` page inside the home page. It:
- Adds ~900px of vertical scroll the user will bounce through because they haven't decided to buy yet
- Gives away decision complexity before the user is ready, lowering conversion on the "View full pricing" CTA
- Duplicates a maintenance surface — any pricing change has to be made twice

### 14.2 Redesign — a 3-tile summary row, nothing more

Replace the full pricing cards on home with a compact 3-column row. Each tile shows only:

```
┌──────────────────────────────┐
│  FREE                        │   Plan name (18px Inter semibold navy)
│  Free forever                │   Price line (20px Inter bold charcoal)
│                              │
│  2 tailored applications     │   Headline outcome (Georgia 18px semibold)
│  every month                 │
│                              │
│  [ Start Free → ]            │   Ghost CTA, navy-200 border
└──────────────────────────────┘
```

Three tiles side-by-side. 280px tall max. Under the row: a single link — `Compare all plans and features →` → `/pricing`.

### 14.3 Spec
- Grid: `grid md:grid-cols-3 gap-4 max-w-5xl mx-auto`.
- Tile: `bg-cream-50 border border-cream-200 rounded-2xl p-6 shadow-sm`.
- Plus tile highlight: `border-t-2 border-gold-400` + a tiny `MOST POPULAR` caps chip inline with the plan name. Nothing else.
- CTAs: Free and Max use ghost-navy; Plus uses flat-gold.
- No feature lists, no add-on expandables, no hour-saved pills.
- Section H2 above the row: `Pricing made simple` (Georgia semibold 36px). Subhead: `Start free. Upgrade when you're applying every day.`

### 14.4 Conversion hypothesis
Reducing home pricing from three full cards to three summary tiles should:
- Lower home-page bounce at the pricing section (shorter scroll before "what's next?")
- Raise `/pricing` visit rate from home by ~15% (people click the compare link when the summary doesn't already answer the question)
- Leave final purchase conversion on `/pricing` unchanged or better (qualified traffic, not window shoppers)

---

## 15. Updated implementation order (ship in 5 PRs, v3)

| PR | Scope | Effort | Visible impact |
|---|---|---|---|
| 1 | Asset trim + carousel + new home section order (with Founder Story restored) | ~2 days | First impression |
| 2 | Hero rebalance (40/60) + flat gold CTA | ~1 day | Top-of-page conversion |
| 3 | Founder Story redesign | ~0.5 day | Trust block |
| 4 | Pricing page card redesign (§13) + home pricing teaser (§14) | ~1.5 days | Pricing conversion |
| 5 | How It Works timeline + gradient/radius sweep on all marketing pages | ~1 day | Brand coherence |

Merge in this order, not all at once. Each PR is reviewable in 15 min and conversion-metric-measurable independently.

---

## 16. Approval checklist (before implementation)

Please confirm before I start:

- [ ] Home section order in §1.2 is correct (8 sections, Founder Story at #5)
- [ ] Founder Story copy stays exactly as-is, only the container is redesigned
- [ ] Pricing card headline-outcome copy (§13.3) is acceptable
- [ ] Home pricing teaser becomes a 3-tile summary, not full cards (§14)
- [ ] Only Plus keeps the MOST POPULAR badge; Max loses its hours-saved bar
- [ ] Add-on credit packs move out of pricing cards into a dedicated band
- [ ] Claude Sonnet 4.6 moves from feature bullets into the trust sentence
- [ ] 5 PRs instead of 4 (§15) is fine

Reply "approved" or mark the boxes you want changed and I'll implement from PR 1 forward.
