# Karko AI, source of truth

**Owner:** Wasim Jalali
**Last updated:** 2026-07-25
**Scope:** the company, the product, the founder, the numbers.
**Purpose:** the single place to pull facts from for any application, accelerator, grant, investor conversation or press request. Nothing here should have to be re-researched.

---

## 0. How to use this document

1. **This file is the fact layer.** It holds what is true, with a source for each claim.
2. **`APPLICATION-ANSWER-BANK.md` is the writing layer.** It holds ready-to-paste answers built from these facts. Never let the two drift: change the fact here first, then update the answer.
3. **`../KARKO_POSITIONING.md` at the repo root is the marketing layer.** It owns taglines, brand voice and campaign copy. If marketing copy and this file disagree on a *fact* (pricing, limits, models), this file wins and the positioning doc gets corrected.
   **This folder lives inside the product repo on purpose.** When the code changes, these documents are in the same diff, so the facts and the product cannot drift apart unnoticed.
4. Every claim is tagged:
   - **[verified]** read directly from the codebase, the live site or LinkedIn, with the source named
   - **[self-reported]** true per Wasim, no external artifact checked yet
   - **[confirm]** needs a document or a number before it goes into any application
5. **Update triggers:** new funding, a pricing change, a model change, a monthly metrics pull, a change in employment, an entity or cap table change. Bump the date at the top.

---

## 1. Company at a glance

| Field | Value | Status |
|---|---|---|
| Legal name | Karko AI Inc. | [verified] imprint page + `public/llms.txt` |
| Registered address | 1207 Delaware Ave #412, Wilmington, DE 19806, USA | [verified] `src/app/imprint/page.tsx` |
| Entity type | Delaware C-Corp | [verified] Certificate of Incorporation |
| Incorporated | **February 9, 2026**, filed with the Delaware Secretary of State | [verified] |
| Formed via | Stripe Atlas | [verified] |
| Product name | **Karko AI** (never Cargo, never Carco) | locked |
| Website | https://www.karkoai.com | [verified] live |
| Internal repo/package name | `job-copilot` | [verified] `package.json` |
| Category | AI job application agent (recruiting / consumer SaaS) | locked |
| Founded | January 2026 | [verified] LinkedIn, first commit 2026-02-04 |
| Founder | Wasim Jalali, sole founder | [verified] git history: one human across 4 git identities |
| Team size | 1 | [verified] |
| Employees | 0 | [self-reported] |
| Ownership | Wasim Jalali holds **100% of issued and outstanding shares** | [verified] see §3 |
| Revenue | **$19.99 MRR.** 1 paying customer on Plus, subscribed 2026-07-09 | [verified] Stripe, 2026-07-25 |
| Funding raised | None. No SAFE has ever been executed. | [verified] §3.4 |
| Banking | Mercury, US. The company's only bank account. | [verified] |
| Payments | Stripe, live | [verified] `src/lib/stripe.ts`, webhook route in production |
| Analytics | PostHog (EU-hosted proxy via `/ingest/*`) | [verified] `next.config.ts` |

---

## 2. One-line descriptions

Pick by length. All are current and consistent with the live product.

| Length | Text |
|---|---|
| 41 chars | AI agent that runs your entire job search |
| 45 chars | AI agent for the entire job search in one app |
| 51 chars | AI job application agent. Entire search in one app. |
| Investor one-liner | Karko AI is the AI job application agent. It replaces the seven-tool job search workflow with one loop: search, fit, tailor, screen, track. |
| User tagline | Your entire job search, in one app. |
| Trust line | Never a word you didn't earn. |

---

## 3. Legal entity, ownership and structure

### 3.1 What is confirmed

- **Karko AI Inc.** is stated publicly as the operating entity on the site imprint and in `public/llms.txt`. [verified]
- Registered address is a Wilmington, Delaware address consistent with a Stripe Atlas formation. [verified]
- Stripe is live in production with subscription checkout, an add-on checkout, a customer portal and a webhook handler. A live Stripe account implies a verified business entity behind it. [verified] `src/app/api/stripe/*`

### 3.2 Incorporation, verified against the Stripe Atlas documents

All of the following was read directly from the formation pack in Google Drive at
`My Drive/Karko AI/03_Business/` on 2026-07-25.

| Item | Value |
|---|---|
| Legal name | Karko AI Inc. |
| Type | Delaware C-Corporation, one class of stock |
| **Certificate of Incorporation filed** | **February 9, 2026**, Delaware Secretary of State |
| Registered agent | Legalinc Corporate Services Inc. |
| Registered office | 131 Continental Dr, Suite 305, Newark, New Castle County, DE 19713 |
| Business/mailing address (public) | 1207 Delaware Ave #412, Wilmington, DE 19806 |
| Authorized shares | **10,000,000** shares of Common Stock, par value **$0.00001** |
| Shares issued | **7,000,000** to Wasim Jalali on **February 12, 2026** |
| Total purchase price | **$70.00** (par value, paid) |
| Stock certificate | Common Stock Certificate No. 1, Wasim Jalali |
| Board of Directors | One director: Wasim Jalali |
| Officers | President and CEO: Wasim Jalali. Secretary: Wasim Jalali. |
| Bylaws | Adopted, with Certificate of Secretary on file |
| EIN | Issued. IRS 147c verification letter on file. (Number deliberately not recorded in this document.) |
| IP assignment | Company IP assigned via the Assignment Agreement (Exhibit B to the RSPA) and a CIIAA |
| Other executed documents | Action by Sole Incorporator, Initial Board Action, Indemnification Agreement, Stockholder Consent, Joint Escrow Instructions, Stock Assignment, Form 8821 |

### 3.3 Cap table (this corrects the old "70 / 30" answer)

| Holder | Shares | % of issued and outstanding |
|---|---|---|
| Wasim Jalali | 7,000,000 | **100%** |
| **Total issued and outstanding** | **7,000,000** | **100%** |
| Authorized but unissued | 3,000,000 | n/a |

> **Important correction.** Every earlier document said "Wasim 70%, with a 30% pool reserved for future co-founders and employees". That is wrong as stated. The 3,000,000 remaining shares are **authorized but unissued**. **No equity incentive plan or option pool has been adopted**, which I confirmed by searching the Initial Board Action for any stock plan resolution. There is none.
>
> **On any application, the answer to "what percentage of equity do you own" is 100%, not 70%.** Saying 70% understates your ownership and implies a pool that does not legally exist yet.

### 3.4 Founder stock terms

| Term | Detail |
|---|---|
| Instrument | Restricted Stock Purchase Agreement, dated February 12, 2026 |
| Vesting | **4 years with a 1-year cliff.** 12/48 vests on **February 9, 2027** (the Vesting Anniversary Date, 12 months from February 9, 2026), then 1/48 monthly thereafter. |
| Repurchase option | The Company may repurchase unvested shares at cost if Wasim stops being a Service Provider |
| Acceleration | **Double trigger.** 100% of unvested stock accelerates if, within 1 month before or 12 months after a Change in Control, he is involuntarily terminated without Cause or resigns for Good Reason |
| **83(b) election** | **Filed, and filed on time.** Executed 2026-02-12, mailed to the IRS in Austin, TX via USPS Certified Mail on 2026-02-16, well inside the 30-day window. Stripe Atlas proof-of-filing certificate is on file. |

Wasim's personal address appears on the 83(b) election and the RSPA. It is not duplicated here; pull it from those documents when a form needs it.

### 3.5 Funding status

**No outside investment. No SAFE has ever been executed.** [verified]

The Drive folder contains `2026-02-12_postmoney_safe_valuation_cap.docx` and two Cayman variants, but I opened them and they are **blank Y Combinator / Stripe Atlas templates**, still containing `[Company Name]`, `[Investor Name]` and `$[_____]` placeholders. Nothing is filled in and nothing is signed.

This settles an old ambiguity: the "$500K on a post-money SAFE at a $5M cap" announced in February 2026 was never signed and raised nothing. **Do not repeat that claim anywhere.**

### 3.6 Where the company operates

Karko AI Inc. is a US company. That is the whole picture, and it is deliberately simple:

| | |
|---|---|
| Entity | Delaware C-Corp |
| Business banking | Mercury, US |
| Payments | Stripe, US |
| Founder location | Kaiserslautern, Germany, for now |
| After YC | San Francisco |

**No German entity. No EU subsidiary. No foreign registration.** The founder is temporarily based in Germany and works on the product from there while holding a full-time job. The company has not generated a profit.

> **Note for future sessions.** `03_Business/` and `06_Ops/` in the Drive folder contain German paperwork from May 2026: a Finanzamt questionnaire, a German business account application, a Netherlands virtual-office agreement. **All of it belongs to Wasim Academy UG, a separate and unrelated prior company.** None of it relates to Karko AI Inc. Do not pull it back into this document.

### 3.7 Where the documents live

`~/Library/CloudStorage/GoogleDrive-wasim@karkoai.com/My Drive/Karko AI/`

| Folder | Contents |
|---|---|
| `01_Product` | Market analysis, issue exports |
| `02_Brand` | Logo and brand assets |
| `03_Business` | **The full Stripe Atlas formation pack.** Also contains German forms belonging to Wasim Academy UG, unrelated to Karko AI Inc. |
| `04_Investor` | Blank SAFE templates, angel investor list, fundraising hub notes, the Spring 2026 YC application |
| `05_Marketing` | Demo videos (including a 2-minute demo and 4K full demos), content calendars, screenshots |
| `06_Ops` | Office and registration paperwork, GPU usage plan, Azure startup credits plan |

> Useful for applications: `05_Marketing/2026-05-01_karkoai_2min_demo.mp4` already exists. Most application forms want exactly that.

### 3.8 Brand and entity architecture

| Layer | What it is |
|---|---|
| Wasim Jalali | Founder, sole shareholder, the face and the technical builder |
| **Karko AI Inc.** | The Delaware C-Corp. The only legal entity. |
| **Karko AI** | The consumer product, karkoai.com. The company's primary and only revenue product. |
| Useful Build | A separate B2B brand (usefulbuild.com), parked under the same entity, zero clients, no commitments. Not part of the Karko story. Mentioned here only so the entity picture is complete. |
| Wasim Academy UG | A prior German training company. Separate legal entity, wound down. Not related to Karko AI Inc. [confirm] whether it is formally dissolved or dormant. |

---

## 4. Founder: Wasim Jalali

### 4.1 Basics

| Field | Value | Source |
|---|---|---|
| Full name | Wasim Jalali | LinkedIn |
| Pronouns | He/Him | LinkedIn |
| Nationality | Afghan, with a German residence permit | Spring 2026 application |
| Location | Greater Kaiserslautern Area, Germany | LinkedIn |
| Date of birth | 15 August 2004 | [verified] |
| Age | **21** (turns 22 on 2026-08-15) | [verified] |
| Role | Founder and CEO, Karko AI Inc. Sole founder, technical. | |
| Currently in school | No | |
| Languages | Dari (native/bilingual), English (full professional), German (limited working), Urdu (elementary) | LinkedIn |
| LinkedIn | https://www.linkedin.com/in/wasimjalali | verified live, this is the current vanity URL |
| X | https://x.com/WasimJalali | Spring 2026 application, [confirm] still active |
| GitHub | https://github.com/wasimjalali2004-art | Spring 2026 application |
| Email | jalaliwasim15@gmail.com | [confirm] whether to use a company address instead |

> **Note:** the old LinkedIn URL `/in/wasim-jalali-69435a231/` still redirects, but the canonical URL is now `/in/wasimjalali`. Use the short one everywhere.

### 4.2 Current employment (important, do not hide this)

**AI Specialist and developer, Nature Heart.** Full-time, May 2026 to present, Germany, remote. [verified] LinkedIn

This matters for three reasons and all three are assets, not liabilities:

1. **He got this job using Karko AI.** The product's best proof point is that it worked on its own founder.
2. It means he is **not currently full-time on Karko**, and any application that claims otherwise is false. Own it directly.
3. It seeded real B2B experience: he shipped more than six internal AI systems at Nature Heart in his first two months. [self-reported]

### 4.3 Work history

| Role | Company | Period | Substance |
|---|---|---|---|
| AI Specialist and developer | Nature Heart (full-time) | May 2026 to present | Claude Code, Claude Cowork, Claude API, OpenAI, AI workflow automation. Shipped 6+ internal AI systems in the first two months. |
| Founder and Lead Developer | **Karko AI** (self-employed) | Jan 2026 to present | Unified AI agent architecture with function calling on Claude Sonnet 4.6. Anti-hallucination via structural binding constraints. Prompt frameworks for ATS CV generation, cover letters and verified skill-gap assessment. Full stack on Next.js, TypeScript, Supabase/PostgreSQL, Vercel. Claude API and OpenAI API for multi-model workflows. Freemium credit pricing. Concept to launch, solo. |
| Founder and Lead Developer | Kursfind AI (self-employed) | Sep 2025 to Jan 2026 | kursfind.de. AI marketplace for AZAV-certified vocational training in Germany. Conversational course matching against Bildungsgutschein and AVGS eligibility. Provider dashboard with a CPL/CPA hybrid revenue model. Next.js + Supabase. Paused. |
| Founder and Coach | Wasim Academy UG (self-employed) | Mar 2023 to Jan 2026 | wasimacademy.org. AZAV-certified training company. Amazon e-commerce and digital marketing courses plus 1:1 coaching in English, German and Dari/Persian. **30,000+ EUR course revenue.** Built 30,000+ organic followers across Instagram, YouTube, TikTok and LinkedIn. Certified trainer, Ausbilder nach AEVO. |
| E-Commerce Specialist and Digital Marketing Expert | Self-employed | Apr 2022 to Apr 2025 | Amazon stores across 4 markets (Germany, Austria, Belgium, USA). **150,000+ EUR revenue** via Wholesale, Private Label and FBA. China sourcing to fulfilment. PPC, keyword research, listing optimisation. |

**Combined prior revenue built from scratch: 180,000+ EUR** (150K e-commerce + 30K courses), starting from 200 EUR in retail arbitrage, self-taught, as a non-native speaker in Germany.

### 4.4 Education

- **Nazoo Ana High School**, High School Diploma, General Studies, 2017 to 2020. Grade 92%. [verified] LinkedIn
- **No university degree.** This is part of the story, not a hole in it: no degree to fall back on is exactly why the job search problem was existential.
- Self-taught full-stack development in roughly 3 months, zero coding knowledge to production applications.

### 4.5 The founder story (the spine of every application)

The short version, in the order it actually happened:

1. Left Afghanistan, built a life in Germany without a degree and without native German.
2. Started with 200 EUR in Amazon retail arbitrage at 17. Scaled to 150K+ EUR across four European and US marketplaces over three years, handling sourcing, logistics, pricing and PPC alone.
3. Built a 30,000+ follower audience teaching Amazon FBA and AI, then turned it into an AZAV-certified training company that did 30K+ EUR.
4. Taught himself full-stack development in about three months and built Kursfind AI, an AI marketplace for German vocational training. Applied to YC with it. Paused it: two-sided marketplace, one regulated market, and he ran out of money.
5. Out of money, he started applying for jobs. Generic applications got zero interviews. Hand-tailoring each one took 45 to 60 minutes and still mostly failed.
6. He built the workflow manually inside Claude with his CV as context, then turned it into a product: **Karko AI**.
7. He used it on his own search. 60+ applications, every one written by Karko. 5 came back as interviews, roughly 8% against a 2 to 3% baseline.
8. **He was hired as an AI Specialist through an application his own product wrote.** That job is the one he holds today.

> **Step 8 is the single strongest fact this company owns. Lead with it, always.**
>
> The product did not just help its founder apply. It got him the job. That is founder-market fit expressed as an outcome, not a claim, and it is the one thing no competitor can copy.
>
> **The interview rate is support, never the headline.** An interview is a funnel step. A hire is the result. Any version of this story that stops at "5 interviews" has thrown away the punchline, which is exactly what the website did until 2026-07-25.

### 4.6 Accomplishments worth quoting

**The non-computer system hack (AZAV audit).** During the AZAV certification audit for his training company, his documentation had problems severe enough to fail. Instead of patching it on the spot, he noticed the auditor was drowning in manual review work, and showed him AI tools that would make his job dramatically easier. The dynamic flipped from adversarial to collaborative. The auditor helped fix the issues, overlooked the minor ones, and he passed. He turned a gatekeeper into an ally by giving him something valuable he did not know existed.

**Most impressive thing built other than the startup.** A 180K+ EUR business (150K e-commerce, 30K courses) from 200 EUR and zero experience, plus 30,000+ followers teaching Amazon FBA and AI, all self-taught as a non-native speaker in Germany.

**Things built, with URLs.**
- Karko AI, https://www.karkoai.com. AI job application agent. Solo. Agent architecture with function calling, anti-hallucination, fit assessment, multi-market support.
- Kursfind AI, https://kursfind.de. Germany's first AI-native marketplace for government-funded vocational training. Full-stack MVP solo in 4 weeks on Next.js.
- Wasim Academy, https://wasimacademy.org. AZAV-certified training provider, AI and e-commerce courses in German and English. 30K EUR revenue.
- Useful Build, https://usefulbuild.com. Applied AI systems firm. Site live, zero clients.

**Competitions, awards, papers:** none. He has been building instead of competing.
**Test scores:** high school graduation 92% across the final three years.
**Accelerators:** none, ever. Applied to YC twice (Kursfind AI, then Karko AI Spring 2026). Both rejected.

### 4.7 Co-founder status

**Solo founder. Confirmed 2026-07-25.** He applies solo and stays solo until funding lands. After funding he intends to bring in his two brothers, **Zaeem** (engineering) and **Samim** (operations), as co-founders. Nothing is committed today: no dates, no signed equity, no work being done by them.

> **Rule for applications: answer clean solo.** "Sole founder, not actively looking, here is how I ship anyway." Do not mention the brothers as future co-founders on any form. Future-tense co-founders read as a weakness everywhere, and the cap table backs the solo answer: 100% of issued shares, no pool, one director, both officer roles held by him.
>
> The post-funding plan is real and worth saying out loud in a conversation if someone asks how he would use the money. It just does not belong in a form field.

---

## 5. The product

### 5.1 What it is

Karko AI is an AI agent that runs the whole job search in one app. Upload your CV once. Every morning you get matched roles. Before you spend time, you see a fit score with real gaps. In about 90 seconds you get a complete application (tailored CV, cover letter, email and screening answers), with every line grounded in your actual experience. Nothing invented. Every application is tracked automatically.

### 5.2 The loop

1. Upload CV once (plus an optional Master CV with the full history)
2. Skip the job boards, a matched feed arrives each morning
3. See fit before you commit (score, strengths, honest gaps)
4. Full application in about 90 seconds (CV, cover letter, application email, follow-up email, screening answers)
5. Track everything automatically

Platform pillars on the site: **Find. Apply. Track.**

### 5.3 What it replaces (the seven-tool stack)

| Today's tool | Karko module |
|---|---|
| LinkedIn / Indeed search | Smart Job Feed, LLM-ranked |
| Zety / Canva resume builder | 6 ATS templates + inline editor |
| Jobscan / Resume Worded | Built-in ATS score + keyword injection |
| ChatGPT "am I a fit?" | Fit Analysis (score, strengths, gaps) |
| Generic cover letter AI | Cover letter grounded in the real CV |
| Copy-paste email drafting | Application email + follow-up |
| ChatGPT screening answers | Screening answers (Plus and Max) |
| Notion / spreadsheet | Application Tracker |

Compression: 7 to 8 tools into 1 loop, with the candidate's real CV as the shared source of truth.

### 5.4 Four product pillars

1. **Anti-hallucination (Trust).** Never a word you didn't earn.
2. **Personalization at every layer (Quality).** CV x role x voice.
3. **Full workflow, one loop (Compression).** One app for the entire job search.
4. **Human-sounding and ATS-optimized (Unlock).** Survives the ATS and the recruiter read.

### 5.5 What is actually shipped [verified from routes]

**App surfaces:** dashboard, documents, master CV, master CV template, settings, subscription, account, profile, notifications, auth flows.

**Marketing surfaces:** home, about, features, pricing, compare + per-competitor comparison pages, blog + posts, 10 SEO landing pages (90-second application package, ATS optimization, cover letter generator, follow-up email generator, application tracker, screening question answers, zero fabrication, pricing and credits, Workday/Greenhouse/Lever integrations, free no-signup test), contact, privacy, terms, imprint.

**API:** `agent-v2` (the main SSE generation endpoint), chat, regenerate, parse-cv, generate-pdf, credits/balance, contact, a cron job for resending confirmations, Inngest, 3 auth routes, 4 Stripe routes, and 14 job-feed routes (run, overview, inbox, saved, feedback, settings, settings/suggest, search-strategy, career-profile, summary, apply, apply/generation, apply/status, dev/run).

**CV templates, 6 confirmed:** premium-ats, modern-professional, executive, german-ats, german-classic, classic-green.

**Output languages, 7 confirmed:** English, German, French, Spanish, Portuguese, Italian, Dutch. Tone rules split into US/UK/Canada conventions versus German conventions. (Marketing says "US, UK, Canada, EU", which undersells what is built.)

### 5.6 What Karko is NOT

Not a resume builder. Not an auto-apply bot. Not a generic AI writer. Not a career coach. Not ChatGPT with a job-search UI.

---

## 6. Pricing and unit model [verified in code]

| Plan | Price | Credits | Full applications / mo | Job feed | Feed search breadth | Screening answers |
|---|---|---|---|---|---|---|
| Free | $0 | 4 (**dropping to 2**, see §6.4) | 2 (**dropping to 1**) | No | n/a | No |
| Plus | $19.99 / mo | 50 | 25 | Up to 25/day | 2 job titles, 2 countries | Yes |
| Max | $79.99 / mo | 200 | 100 | Up to 25/day | 4 job titles, 4 countries | Yes |
| Credit add-on pack | $19.99 one-time | 50 | n/a | n/a | n/a | n/a |

**Max's differentiator is not feed size.** Both paid plans surface up to 25 roles a day. Max runs 4 SerpAPI queries a day against Plus's 2, so it covers twice as many job titles and countries. It also carries 4x the credits and premium support.

Source: `src/lib/stripe.ts`. Stripe price IDs come from environment variables, nothing hardcoded.

**Credit costs** (`src/lib/supabase/credits.ts`):

| Action | Credits |
|---|---|
| Full application | 2.0 |
| Fit analysis | 0.5 |
| Generation after a fit analysis | 1.5 (so 0.5 + 1.5 = 2.0 total either way) |
| CV optimization alone | 1.0 |
| Cover letter regeneration | 0.5 |
| Email regeneration | 0.5 |
| Follow-up regeneration | 0.5 |

Credits roll over while the subscription is active. Top-ups are available on paid plans.

### 6.1 Unit economics [modelled in `docs/model-selection-analysis.md`, 2026-07-25]

Every tier prices credits identically at **$0.40 revenue per credit**. That is deliberate and it makes the margin analysis simple.

**Cost per full application:**

| Configuration | Cost / application |
|---|---:|
| **Today**, all Sonnet 4.6 | **$0.210** |
| After the locked Opus 5 migration, warm cache | $0.323 |
| After migration, cold cache | $0.436 |

The Opus 5 move raises cost per application by **54%**. Step 6 (CV optimization) alone is 46% of the bill.

**Paid subscription margin**, post-migration, including roughly 3-4% Stripe fees:

| Credit utilization | Plus margin | Max margin |
|---|---:|---:|
| 100% | 62% | 63% |
| 70% | 73% | 74% |
| 50% | 79% | 80% |

**Paid users are not the problem.** 73-80% at realistic utilization is healthy SaaS territory.

### 6.2 The number that actually matters: 4.7%

The free tier is 4 credits a month against zero revenue, and it dominates blended economics.

| Free-to-paid conversion | Blended margin per 100 signups |
|---:|---|
| 3% | **negative** |
| **4.7%** | **break-even** |
| 8% | 33% |
| 15% | 55% |

**Break-even sits at about 4.7% free-to-paid conversion.** Typical freemium SaaS converts at 2-5%, so the business sits directly on that line, before fixed infrastructure. Below 4.7%, every additional free signup loses money.

Three consequences worth stating plainly:

1. **Activation is not a growth problem, it is a solvency problem.** The 96.7% first-page drop is what keeps conversion under the line.
2. **The free tier is a bigger lever than the entire model decision.** Cutting free from 4 credits to 2 moves break-even from 4.7% to about 2.9%. The Sonnet-versus-Opus choice moves cost per application by $0.10; the free tier moves the required conversion rate by nearly two points. Not yet shipped.
3. **One cost is still unmeasured.** The daily job feed runs SerpAPI, Azure `gpt-4.1-mini` ranking and two Sonnet calls for free users, and none of it is charged against credits. The working figure is $0.75 per active free user per month. Treat it as an estimate.

### 6.4 Pricing strategy [locked, 2026-07-25]

**Two decisions, in this order:**

1. **Cut the free tier from 4 credits to 2**, which is exactly one full application. Ship this **first**.
2. **Then ship the Opus 5 migration**, accepting lower margin per application in exchange for the best output quality on the four documents a user actually sends.

Then raise prices later, once there is a real paying base, to recover the 80% margin band. The $5,000 of AWS inference credits is the cushion for the transition.

**Why this order matters.** The free-tier cut creates exactly the margin headroom the migration consumes, and it costs nothing to make: it applies only to new free users, so there is no churn risk. Sequenced the other way, the credits burn 54% faster on the users least likely to convert.

**What the free-tier cut does:**

| | 4 credits (today) | 2 credits (decided) |
|---|---:|---:|
| Free applications per month | 2 | 1 |
| Blended break-even conversion | 4.7% | **about 2.9%** |
| Credit runway at 1,000 monthly free users | 7 to 11 months | **11 to 15 months** |

The range depends on whether the unmeasured job-feed cost is included. Measure it and the range collapses.

There is also a product argument, not just a margin one. "One complete application, free, on a real job" is a clearer offer than "4 credits", which means nothing until a user has already learned the credit system.

**Implementation surface**, when this ships: `PLANS.free.credits` in `src/lib/stripe.ts`, plus every surface that says "4 credits" or "2 applications" for Free. Expect the same sprawl the job feed fix had, roughly a dozen places including `llms.txt`, `llms-full.txt`, `FEATURES.md` and `KARKO_POSITIONING.md`. Grep before assuming a number is only in one place.

**The original strategy, and its exposures:**

The logic is sound and it is consistent with the positioning: the product's whole claim is quality that survives both an ATS and a recruiter, so paying for the better model on the documents that get read is on-brand rather than indulgent.

Three exposures worth holding in view.

**1. The credit cushion is about 7 months, not a safety net.** $5,000 buys roughly 13,000 applications post-migration, or **6,700 to 7,700 free-user-months** at 4 credits each. At 1,000 monthly active free users that is around 7 months. If growth works, it burns faster, not slower. The credits are a runway, and runway has an end date that should be on a calendar.

**2. Price increases rarely recover margin on the base you acquired cheaply.** Standard practice is to grandfather existing subscribers, so a later increase applies to new cohorts only. In an episodic consumer product bought largely by people between incomes, ungrandfathered increases churn users at exactly the wrong moment. Plan the increase as applying to future cohorts and price the current cohort as a permanent acquisition cost.

**3. The free tier was the bigger lever, and it is now being pulled.** Resolved above: free drops to 2 credits before the migration ships.

**Ceiling check.** LinkedIn Premium Career is $39.99/month. Karko Plus at $19.99 is deliberately half of that, so there is real headroom, but it is not unlimited and the buyer is often between incomes.

**Define the trigger.** "Once we hit 1,000+ users" needs to say which. At 4.7% conversion, 1,000 signups is about 47 paying users and roughly $940 MRR, which is not yet a business. 1,000 *paying* users is about $20k MRR, which is. Write the trigger as a paid-user or MRR number, not a signup number.

### 6.3 What the AWS credits actually buy

The honest answer, and a direct upgrade on the Spring 2026 application, which claimed variable costs were near zero because of cloud credits:

> The credits do not change the unit economics. They postpone them by roughly 13,000 applications. The right use of that window is to measure the two numbers the model is guessing at: real credit utilization per paid user, and real free-to-paid conversion. Both swing blended margin from negative to 55%, and neither can be estimated from a spreadsheet.

If an investor asks about economics, that paragraph is the answer. It shows the founder has modelled the business rather than waved at it.

---

## 7. Technology [verified from the repo, 2026-07-25]

### 7.1 Stack

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js, App Router | ^16.2.3 |
| UI | React | 19.2.3 |
| Language | TypeScript | ^5 |
| Styling | Tailwind CSS | ^4 |
| Client state | Zustand | ^5.0.10 |
| Database, auth, storage | Supabase (PostgreSQL) | supabase-js ^2.93.3, ssr ^0.8.0 |
| Payments | Stripe | ^20.3.1, API version 2026-01-28.clover |
| Analytics | PostHog, reverse-proxied through `/ingest/*` | posthog-js ^1.372.1 |
| Transactional email | Resend | ^6.9.2 |
| Background jobs | Inngest | route present |
| Document generation | docx, jspdf, pdf-lib, pdfjs-dist, html2canvas | |
| Hosting | Vercel | `vercel.json` present but empty |

### 7.2 AI models actually in production

| Use | Model | Provider |
|---|---|---|
| All generation tasks (CV, cover letter, email, follow-up, fit assessment, chat) | **`claude-sonnet-4-6`** | Amazon Bedrock in production, direct Anthropic API in development |
| Fallback (env toggle) | `claude-haiku-4-5` | |
| Rollback (env toggle) | `claude-sonnet-4-5-20250929` | |
| Job feed ranking | `gpt-4.1-mini` | Azure OpenAI |

Sources: `src/lib/models/anthropic.ts`, `src/lib/models/types.ts`, `src/lib/job-feed/openai-ranking.ts`, README.

> **Correction to older material:** several documents say "Claude Sonnet 4.5". Production has been on **Sonnet 4.6** for a while. 4.5 exists only as a disabled rollback flag. Do not write 4.5 in any application.

**Pending model decision (locked, not implemented).** `docs/model-selection-analysis.md`, decided 2026-07-25:

> Claude Opus 5 generates the four documents the user sends to an employer (CV, cover letter, application email, follow-up). Everything upstream stays on Sonnet 4.6. Chat moves to Haiku 4.5.

Only 4 of 14 call sites migrate. The reasoning rests on GDPval-AA v2, the benchmark that grades human-expert-scored professional deliverables, where Opus 5 leads Sonnet 5 by 243 Elo. SWE-bench Pro is the headline number everywhere and is irrelevant here, because Karko writes no code.

**Cost consequence, which is a decision not a detail.** The migration raises cost per application from $0.210 to $0.323 warm, $0.436 cold, a 54% increase. The plan was deliberately shaped around this: keeping Phase 1 on Sonnet 4.6 avoids a fit analysis that would cost $0.209 against $0.200 of revenue, a loss on every screen. See §6.1.

**Blocked.** The AWS account returns HTTP 403 for every Claude model on Bedrock. Both self-serve prerequisites are done and an escalation is drafted (`docs/bedrock-claude5-access.md`). Implementation happens the day access lands, not before.

> **For applications and investor conversations:** say production runs Claude Sonnet 4.6, with a locked plan to move the user-facing document generation to Opus 5. Do not say Karko runs Opus 5. It does not yet.

### 7.3 Anti-hallucination, precisely

This is the headline moat claim, so state it accurately.

**What exists:** a structured `<anti_hallucination_rules>` block in the CV system prompt (`src/lib/agents/prompts/cv-prompt.ts`), rules 1 to 7, with rule 4 marked "HIGHEST PRIORITY, OVERRIDES ATS OPTIMIZATION". The core mechanism: a skill, tool or technology may only appear in the generated CV if it is explicitly named in the Primary CV or Master CV, or directly used in a described project. Plus a "fabrication test": before writing any number in a bullet, search both CVs for that exact number, and if it is not there, delete it.

**Plus one code-level guard:** in `src/lib/agents/context-builder.ts`, if the model's fit score deviates by more than 40 points from the computed skill-match ratio, the two are averaged. This protects the fit score only.

**What does not exist:** a deterministic post-generation validator that re-checks the produced CV, cover letter or email against the source CV.

> **How to say it honestly:** "Anti-hallucination is enforced as a highest-priority structural constraint in the generation prompt, with a self-check the model must run, plus a numeric sanity guard on the fit score. A deterministic post-generation validator is on the roadmap." That is defensible in a technical interview. "It is enforced in the architecture" invites a question you would lose.

### 7.4 Database

Supabase Postgres. Tables confirmed in `supabase/migrations/`:

`job_feed_settings`, `job_feed_runs`, `job_feed_raw_fetches`, `job_feed_canonical_jobs`, `job_feed_ranked_items`, `job_feed_feedback`, `job_feed_application_generations`, `job_feed_application_generation_events`, `user_cv_suggestions`, `user_job_preferences`, `credit_reservations`, `user_notifications`, `serpapi_filter_tokens`, `user_career_profiles`, `user_search_strategies`.

Core tables (`profiles`, `documents`, `application_sessions`, `user_credits`, `credit_transactions`, `subscriptions`, `connected_accounts`) are RLS-secured in migration `202605200002_codify_core_table_rls.sql` but their CREATE statements predate the migration history, so they were made directly in Supabase Studio.

Job data comes from SerpAPI.

### 7.5 Build history

383 commits. First commit 2026-02-04 ("Initial commit: Job Copilot"). Most recent 2026-07-25. Four git identities, all Wasim. Genuinely solo.

---

## 8. Traction and metrics

**Source: PostHog, pulled 2026-07-21. Refresh before any submission.**

### 8.0 The context these numbers need

**Karko has never had a growth attempt.** Read that first, because every number below describes a product nobody has tried to grow.

| Period | What was actually happening |
|---|---|
| **Feb to May 2026** | Founder was out of money and job hunting full time. He built Karko alongside that search and used it for his own applications. A small group of early users, roughly 5 to 10, had free access and acted as design partners. Their feedback drove five months of product work: the job feed, fit analysis, screening answers and the tracker all shipped in this window. |
| **May 2026** | Hired as an AI Specialist, through an application Karko wrote. The product has run beside a full-time job ever since. |
| **9 July 2026** | First paying customer converted, on Plus, fully organically. |
| **Throughout** | **Zero marketing spend.** No launch, no Product Hunt, no ads, no distribution push, no growth work of any kind. Every visitor arrived through organic Google and direct. |

So the funnel below is not the result of a monetisation attempt that failed. It is the ambient traffic of a product that was built, improved against real user feedback for five months, and then left to find its own users while its founder took a job to stay solvent.

**Monetisation has not been tested and failed. It has not been tested.** That distinction is accurate and it is the one to make.


| Metric | Value | Note |
|---|---|---|
| Unique users in the weekly window | 122 | PostHog tile labelled "unique users that use your app every week" |
| DAU shown on the same dashboard | 122 | Identical to WAU. Almost certainly a misconfigured insight. **Never quote both as separate facts.** |
| Pageview funnel, step 1 | 122 persons | |
| Pageview funnel, step 2 | 4 persons (3.28%) | 118 people, 96.72%, drop after one page |
| Pageview funnel, step 3 | 2 persons (1.64%) | |
| Weekly retention | ~0.9% day 1, ~1% day 2, ~0% days 5 to 7 | Cohort Jul 14 to 20. Almost everyone is day-0 only. |
| Referrers, last 14 days | Google 56, direct 55, YouTube 6, Bing 2, Android Google 1, DuckDuckGo 1 | Fully organic |
| Paid marketing spend | 0 | |
| Paying customers | **1**, on the Plus plan | [verified] Stripe |
| MRR | **$19.99** (ARR about $240) | [verified] Stripe |
| First paid conversion | **2026-07-09**, about 16 days before this snapshot | [verified] Stripe |

### 8.1 The honest framing (use this, not the raw numbers)

> Karko is live with paid billing and has never been marketed. No launch, no ads, no distribution push, zero spend. About 120 people still reach it in a typical week through organic Google and direct, and the first paying customer converted on 9 July. For the five months before that I was out of money and job hunting, building Karko alongside the search and shipping against feedback from a small group of early users on free access. In May I was hired as an AI Specialist through an application Karko wrote, and it has run beside a full-time job since. Nobody has ever tried to grow this. The honest gap is activation: most first visits don't reach a second page, and I know where it breaks.

### 8.2 Never claim

- "122 weekly active users" in the product sense. The funnel contradicts it.
- "122 DAU and 122 WAU" as two independent growth facts.
- "Strong retention" or anything implying stickiness.
- Any monthly active number. There is no verified MAU.

### 8.3 Founder dogfood metrics [self-reported]

- **Outcome: hired as an AI Specialist at Nature Heart in May 2026, through an application Karko wrote.** Lead with this.
- 60+ applications sent through Karko, every one generated by the product
- 5 interviews, roughly an 8% rate
- Industry baseline commonly cited at 2 to 3%
- First-time job seeker, no degree

**Numbers confirmed with Wasim 2026-07-25.** Earlier material variously said "50+", "over 50" and "sixty" applications with a 10% rate. 60+ and ~8% are correct. Do not reintroduce the old figures.

---

## 9. Market and competition

### 9.1 The thesis

The market forces a false choice between speed and quality.

| | Low quality | High quality |
|---|---|---|
| **High speed** | Auto-apply bots (LazyApply, Sonara) | **Karko AI** |
| **Low speed** | ChatGPT plus manual midnight rewriting | Resume writers and coaches, $100 to $500 per CV |

### 9.2 Why now

1. Agentic models can run full workflows, not just chat.
2. Auto-apply backlash. Candidates get flagged, ATS vendors harden.
3. AI copy fatigue. Recruiters recognise generic ChatGPT letters instantly.
4. Candidates apply more and for longer. They need compression, not another tool.

### 9.3 Competitors

| Bucket | Examples | What they optimize | What they miss |
|---|---|---|---|
| Resume builders | Teal, Kickresume, Rezi, Enhancv, Resume.io | Format and scores | The user still does all the tailoring |
| Auto-apply bots | LazyApply, Sonara | Volume | Quality, trust, ATS flags, interview embarrassment |
| Point AI tools | Jobscan, ChatGPT DIY | One slice | Context is lost between tools |
| Coaches and writers | Human services | Quality | Cost, speed, scale |

**The claim:** the problem is not formatting and it is not spray volume. It is the 45 to 60 minutes of skilled work between finding a role and sending a personalized application, plus discovery and tracking. That is an agent workflow, grounded in real experience.

**Never say "no one has built this."** Partners disbelieve it in one second in this category. Differentiate by mechanism, not by claimed absence of competitors.

### 9.4 Moats claimed

1. A trust posture while auto-apply dies (anti-hallucination as the product, not a feature).
2. A data flywheel: every fit analysis and accepted application can sharpen ranking and matching over time.

Both are early. Neither is proven. Say so if asked.

### 9.5 Positioning statement

> **For** active job seekers who want quality applications without spending evenings rewriting CVs,
> **Karko AI** is an AI job application agent
> **that** collapses the seven-tool job search workflow into one loop, from matched role discovery to tracked application, in under two minutes per job.
> **Unlike** auto-apply bots that sacrifice quality for volume, or resume writers that cost hundreds and take days,
> **Karko** gives speed and quality, grounded in real experience, with every word traceable to the actual CV.

---

## 10. Risks and weaknesses, stated plainly

Know these cold. Being the first to name them is a strength in every investor conversation.

1. **Activation is broken.** 96.7% of visitors never reach a second page. This is the number one product problem.
2. **Monetisation is unproven rather than disproven.** One paying customer at $19.99, converted 9 July 2026. There has never been a launch, a marketing budget, or a week of full-time work on the funnel, so there is no evidence in either direction about whether this converts at scale. An investor will still price it as risk, and that is reasonable. The answer is not to explain it away. It is to say what the five unfunded months bought (a product shaped by real design-partner feedback) and what the first funded months would go to (activation, then conversion).
3. **Episodic product with a built-in churn event.** Success fires the customer. The founder is the example: he got hired and stopped being an active user. The best proof point and the retention problem are the same fact.
4. **Crowded, fatigued category.** AI job application tools are among the most common startup pitches since 2023.
5. **Solo founder, part-time.** He holds a full-time job. Real constraint, and the job itself is the proof point, so own it.
6. **Blended economics sit on the break-even line.** Paid users are fine at 73-80% margin, but the free tier pushes break-even to about 4.7% free-to-paid conversion against a 2-5% freemium norm (§6.2). Current conversion is well below that. This is the same problem as activation, seen from the P&L rather than the funnel, and it is the single most important number in the business.
7. **Previously rejected with the same idea.** Spring 2026. The delta is real but modest in absolute terms.
8. **Visa and location friction.** Afghan national with a German residence permit. US travel may need support.
9. **No option pool exists.** Any hire or co-founder needs a board-adopted equity incentive plan first. Not a problem today, but it is a step that has to happen before equity can be offered to anyone.

---

## 11. Known drift to fix (code versus copy)

Found on 2026-07-25. Delete a row once the fix is merged.

### Fixed, awaiting merge

| # | Issue | Resolution |
|---|---|---|
| 1 | **Job feed daily limit** | Thirteen surfaces promised Plus 15 jobs/day. The backend has served **25 to both plans** since `dbab57bc` (2026-05-28). Decided: 25/day is correct for both, and Max's real differentiator is search breadth (4 job titles across 4 countries against Plus's 2 and 2, so 4 SerpAPI queries a day against 2). All surfaces corrected including `llms.txt` and `llms-full.txt`. **PR #76.** |
| 2 | **Founder story led with the wrong fact** | Every surface built its credibility on "5 interviews from 50+ applications, roughly 10%" and either buried the hire or omitted it. The homepage said "sixty applications", the About page said "over 50". Now corrected everywhere to the confirmed numbers (60+ applications, 5 interviews, ~8%) with **the hire as the headline**. Both founder headings read "The tool I built got me hired." Touches the About page, homepage, Person JSON-LD, page metadata, both llms files, the blog body and author bio, and six passages in `KARKO_POSITIONING.md` including proof point #1. **PR #76.** |
| 3 | **Screening answers wrongly attributed to Free** | The plan-comparison FAQ said every plan gets screening question answers. They are gated to Plus and Max. **PR #76.** |
| 4 | **Model decision untracked** | `docs/model-selection-analysis.md` and `docs/bedrock-claude5-access.md` existed only as untracked files. Now committed. **PR #77.** |

### Still open

| # | Issue | Detail |
|---|---|---|
| 5 | **Language support undersold** | Copy says "US, UK, Canada, EU". The code generates in 7 languages: English, German, French, Spanish, Portuguese, Italian, Dutch. Worth claiming. |
| 6 | **Anti-hallucination described as architectural** | It is a highest-priority prompt constraint plus a fit-score guard, not a post-generation validator. See §7.3. Either build the validator or soften the claim. |
| 7 | **Exposed test-account password** | A live test-account password was included in the Spring 2026 YC application text and committed to git. **Rotate it.** Never put credentials in an application again. Use a clean demo account plus the existing 2-minute demo video. |

---

## 12. Open items to close

Ordered by how often they get asked.

| # | Item | Who has it |
|---|---|---|
| 1 | Lifetime signups and total applications generated. This is the strongest number nobody has pulled yet, and it would quantify the five months of design-partner work. | Supabase |
| 2 | **Real credit utilization per paid user, and real free-to-paid conversion.** The margin model guesses both, and they swing blended margin from negative to 55%. Needs PostHog instrumentation before the AWS credits burn down. | Supabase + PostHog |
| 3 | Cost of the daily job feed for free users. Currently unmeasured and uncharged; working estimate $0.75 per active free user per month. | Instrument the feed |
| 4 | Whether the 9 July subscriber is the first ever, or whether earlier subscribers churned | Stripe |
| 5 | Whether Wasim Academy UG is dissolved or dormant | Wasim |

**Closed on 2026-07-25:** the incorporation and cap table picture (§3.2 to §3.5) from the Stripe Atlas pack. Co-founder status: solo. Stripe revenue: $19.99 MRR, one Plus subscriber, converted 9 July. Date of birth: 15 August 2004. Operating footprint: US only, Mercury is the sole bank account (§3.6).

---

## 13. Change log

| Date | Change |
|---|---|
| 2026-07-25 | Created. Consolidated from 14 files in the old `yc-fall-2026-decision` folder, verified against the Karko AI codebase (383 commits, HEAD 2026-07-25) and Wasim's live LinkedIn profile. Useful Build material removed except for the entity-structure line in §3.8. |
| 2026-07-25 | Moved into the Karko AI product repo at `company/`, out of the Useful Build repo, so the facts sit next to the code they describe. |
| 2026-07-25 | Stripe connected. Revenue is $19.99 MRR, one Plus subscriber, converted 9 July 2026, five months after launch. Date of birth confirmed: 15 August 2004, so 21 today. Section 3.6 rewritten to explain the German permanent-establishment question properly rather than just listing the paperwork. |
| 2026-07-25 | **Founder story corrected and re-anchored.** Confirmed with Wasim: 60+ applications through Karko, 5 interviews, hired as an AI Specialist through an application the product wrote. Earlier material said 50+ applications at a 10% rate and led with the interview count. The hire is now the headline on every surface and in this document. |
| 2026-07-25 | First pass of the drift list actioned. Job feed corrected to 25/day on both plans across 13 surfaces, founder story now includes the hire, screening-answer gating corrected, model decision docs committed (PRs #76 and #77). Pricing table now carries feed search breadth. Model section states Sonnet 4.6 in production with the Opus 5 move locked and blocked. |
| 2026-07-25 | Legal section rewritten from the actual Stripe Atlas formation pack in Google Drive. Incorporation date, registered agent, authorized and issued shares, officers, board, bylaws, EIN, IP assignment, vesting schedule and 83(b) filing all moved from [confirm] to [verified]. **Two corrections: ownership is 100%, not 70%, and there is no option pool.** Confirmed no SAFE was ever executed. Co-founder status confirmed solo. |
