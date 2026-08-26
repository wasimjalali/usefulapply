# Useful Apply: source of truth

Keep this current: update when the product, stack or direction changes.

**Owner:** Wasim Jalali
**Last updated:** 2026-08-26
**Scope:** the company, the product, the founder, the numbers.
**Purpose:** the single place to pull facts from for any application, accelerator, grant, investor conversation or press request. Nothing here should have to be re-researched.

---

## 0. How this folder works

1. **This file is the fact layer.** It holds what is true, with a source or date for each claim.
2. **`APPLICATION-ANSWER-BANK.md` is the writing layer.** Ready-to-paste answers built from these facts. If a number changes, change it here first.
3. **`../USEFULAPPLY_POSITIONING.md` owns taglines, brand voice and campaign copy.** If marketing copy and this file disagree on a fact (pricing, limits, models), this file wins and the positioning doc gets corrected.
4. Every claim is tagged: **[verified]** read directly from the codebase, the live site, Stripe or formation documents; **[self-reported]** true per Wasim, no external artifact checked yet; **[confirm]** needs a document or number before it goes into any application.
5. **Update triggers:** new funding, a pricing change, a model change, a monthly metrics pull, a change in employment, an entity or cap table change. Bump the date at the top.

> **Rebrand and migration note.** The product launched as Karko AI and rebranded to Useful Apply in 2026. Alongside the rebrand, the stack migrated from Vercel plus Supabase to Cloudflare (Workers, D1, R2, KV). Any older document that says karkoai.com, Vercel, Supabase, Resend, Inngest or Azure OpenAI is obsolete. This file and the answer bank replace them.

---

## 1. Company at a glance

| Field | Value | Status |
|---|---|---|
| Brand / product name | **Useful Apply** (formerly Karko AI) | locked |
| Legal entity | **Karko AI Inc.**, trading as Useful Apply | [verified] imprint page |
| Website | https://www.usefulapply.com | [verified] live |
| Entity type | Delaware C-Corp | [verified] Certificate of Incorporation |
| Incorporated | **February 9, 2026**, Delaware Secretary of State, via Stripe Atlas | [verified] |
| Registered address | 1207 Delaware Ave #412, Wilmington, DE 19806, USA | [verified] imprint page |
| Category | AI job application agent (recruiting / consumer SaaS) | locked |
| Founded | January 2026 | [verified] first commit 2026-02-04 |
| Founder | Wasim Jalali, sole founder, technical | [verified] git history |
| Team size | 1 | [verified] |
| Ownership | Wasim Jalali holds **100% of issued and outstanding shares** | [verified] see §3 |
| Revenue | **$19.99 MRR.** 1 paying customer on Plus, subscribed 2026-07-09 | [verified] Stripe, 2026-07-25 |
| Funding raised | None. No SAFE has ever been executed. Not running a raise. | [verified] |
| Banking | Mercury, US. The company's only bank account. | [verified] |
| Payments | Stripe, live (subscriptions + credit packs) | [verified] |
| Analytics | PostHog (analytics, error tracking, LLM cost tracking) | [verified] |

Domains: `usefulapply.com`, `www.usefulapply.com`, `admin.usefulapply.com` (Cloudflare Access protected).

---

## 2. One-line descriptions

Pick by length. All are current and consistent with the live product.

| Length | Text |
|---|---|
| 41 chars | AI agent that runs your entire job search |
| 45 chars | AI agent for the entire job search in one app |
| Investor one-liner | Useful Apply is the AI job application agent. It replaces the seven-tool job search workflow with one loop: search, fit, tailor, screen, track. |
| User tagline | Your entire job search, in one app. |
| Trust line | Every word traces back to your real CV, and you review before it goes anywhere. |

---

## 3. Legal entity, ownership and structure

All incorporation facts below were read directly from the Stripe Atlas formation pack on 2026-07-25. [verified]

| Item | Value |
|---|---|
| Legal name | Karko AI Inc. (rebrand to Useful Apply did not change the registered name) |
| Type | Delaware C-Corporation, one class of stock |
| Certificate of Incorporation filed | February 9, 2026 |
| Registered agent | Legalinc Corporate Services Inc. |
| Authorized shares | 10,000,000 Common Stock, par value $0.00001 |
| Shares issued | 7,000,000 to Wasim Jalali on February 12, 2026 |
| Board | One director: Wasim Jalali. He also holds both officer roles (President/CEO and Secretary). |
| EIN | Issued. IRS 147c letter on file. Number deliberately not recorded here. |

### Cap table

| Holder | Shares | % of issued and outstanding |
|---|---|---|
| Wasim Jalali | 7,000,000 | **100%** |
| Authorized but unissued | 3,000,000 | n/a |

**On any form, equity owned is 100%, not 70%.** No option pool or equity incentive plan exists. Earlier drafts saying 70% were wrong.

### Founder stock terms

- Restricted Stock Purchase Agreement dated February 12, 2026.
- Vesting: 4 years with a 1-year cliff. Double-trigger acceleration on a change in control.
- 83(b) election filed on time (executed 2026-02-12, mailed 2026-02-16, inside the 30-day window). Proof of filing on file.

### Funding status

**No outside investment. No SAFE has ever been executed.** The "$500K on a $5M cap" announced in February 2026 was never signed and raised nothing. Do not repeat that claim anywhere.

### Where the company operates

US entity only. No German entity, no EU subsidiary, no foreign registration. The founder is based in Kaiserslautern, Germany, while holding a German residence permit. The company has not generated a profit.

Related brands under the same entity: **Useful Build** (usefulbuild.com), an applied-AI services brand, parked, no clients. **Wasim Academy UG**, a prior German training company, separate legal entity, unrelated.

---

## 4. Founder: Wasim Jalali

### Basics

| Field | Value |
|---|---|
| Full name | Wasim Jalali (he/him) |
| Date of birth | 15 August 2004 |
| Nationality | Afghan, with a German residence permit |
| Location | Greater Kaiserslautern Area, Germany |
| Languages | Dari (native), English (full professional), German (limited working), Urdu (elementary) |
| LinkedIn | https://www.linkedin.com/in/wasimjalali |
| Role | Founder and CEO. Sole founder, technical. |
| Education | High school diploma, 92% final grade. No university degree. Self-taught full-stack development in about 3 months. |

### Current employment (do not hide this)

**AI Specialist and developer, Nature Heart.** Full-time, May 2026 to present, Germany, remote. [verified]

Three things follow, and all three are assets:

1. He got this job using his own product. It is the strongest proof the company owns.
2. He is not currently full-time on Useful Apply, and any application claiming otherwise is false. Own it directly.
3. It seeded real applied-AI experience: 6+ internal AI systems shipped at Nature Heart in his first two months. [self-reported]

The product predates the job by four months and the employment contract explicitly permits it as a side project, so there is no IP or moonlighting question.

### Work history

| Role | Company | Period | Substance |
|---|---|---|---|
| AI Specialist and developer | Nature Heart | May 2026 to present | Internal AI systems and workflow automation |
| Founder | Useful Apply (launched as Karko AI) | Jan 2026 to present | Solo, concept to launch and every rebuild since |
| Founder | Kursfind AI (kursfind.de) | Sep 2025 to Jan 2026 | AI marketplace for AZAV vocational training. Paused: two-sided, one regulated market, ran out of money |
| Founder and Coach | Wasim Academy UG | Mar 2023 to Jan 2026 | AZAV-certified training company. 30,000+ EUR course revenue, 30,000+ organic followers |
| E-commerce | Self-employed | Apr 2022 to Apr 2025 | Amazon stores across 4 markets. 150,000+ EUR revenue |

Combined prior revenue built from scratch: **180,000+ EUR**, starting from 200 EUR in retail arbitrage at 17, self-taught, as a non-native speaker in Germany.

### The founder story (the spine of every application)

1. Left Afghanistan, built a life in Germany without a degree and without native German.
2. Started with 200 EUR in Amazon retail arbitrage at 17. Scaled to 150K+ EUR across four marketplaces over three years.
3. Built a 30,000+ follower audience teaching Amazon FBA and AI, turned it into the training company.
4. Taught himself full-stack development in about three months, built Kursfind AI, applied to YC with it, paused it.
5. Out of money, started applying for jobs. Generic applications got zero interviews. Hand-tailoring took 45 to 60 minutes each and still mostly failed.
6. Built the workflow manually inside Claude with his CV as context, then turned it into a product.
7. Used it on his own search: 60+ applications written by the product, 5 interviews (roughly 8% against a 2 to 3% baseline).
8. **Hired as an AI Specialist through an application his own product wrote.** That is the job he holds today.

Step 8 is the strongest fact this company owns. Lead with it. The interview rate is support, never the headline: an interview is a funnel step, a hire is the result.

### Co-founder status

**Solo founder. Confirmed 2026-07-25.** After funding he intends to bring in his brothers Zaeem (engineering) and Samim (operations). Nothing is committed today.

Rule for applications: answer clean solo. Future-tense co-founders read as a weakness everywhere, and the cap table backs the solo answer. The post-funding plan is fine to say out loud in conversation if asked how money would be used. It does not belong in a form field.

---

## 5. The product

### What it is

Useful Apply is an AI agent that runs the whole job search in one app. Upload your CV once. You run a daily feed of matched roles. Before you spend anything you see a fit score with real gaps. In about 90 seconds you get a complete application: tailored CV, cover letter, application email, follow-up email and screening answers, with every line grounded in your actual CV. You review everything before it goes anywhere. Every application is tracked automatically.

### The loop

1. Upload your CV once (plus an optional Master CV with the full history)
2. Skip the job boards: run a matched daily feed (on click, once a day)
3. See the fit before you commit (score, strengths, honest gaps)
4. Full application in about 90 seconds
5. Track everything automatically

Platform pillars: **Find. Apply. Track.**

### What it replaces (the seven-tool stack)

| Today's tool | Useful Apply module |
|---|---|
| LinkedIn / Indeed search | Smart Job Feed, LLM-ranked |
| Zety / Canva resume builder | 6 ATS templates + inline editor |
| Jobscan / Resume Worded | Built-in ATS score + keyword alignment |
| ChatGPT "am I a fit?" | Fit Analysis (score, strengths, gaps) |
| Generic cover letter AI | Cover letter grounded in the real CV |
| Copy-paste email drafting | Application email + pre-drafted follow-up (7 to 10 days later) |
| ChatGPT screening answers | Screening answers (STAR structure, Plus and Max) |
| Notion / spreadsheet | Application Tracker |

Compression: 7 to 8 tools into 1 loop, with the candidate's real CV as the shared source of truth.

### Four product pillars

1. **Anti-hallucination (Trust).** Every skill, metric and claim must trace to the user's CV. The JD is for keyword alignment, never a source of facts about the applicant. And the user reviews before anything goes anywhere.
2. **Personalization at every layer (Quality).** CV x role x voice.
3. **Full workflow, one loop (Compression).** One app for the entire job search.
4. **Human-sounding and ATS-optimized (Unlock).** Survives the ATS scan and the recruiter read.

### What is shipped

App surfaces: dashboard, documents, master CV, profile, settings, subscription, tracker, auth flows. Marketing surfaces: landing, about, features, pricing, comparison pages, blog, SEO landing pages, contact, legal pages.

Key capabilities: SSE-streamed unified writer agent (analyze-first or apply-directly modes), fit analysis, PDF and DOCX export, 6 ATS-safe CV templates including two German market templates, output in 7 languages (English, German, French, Spanish, Portuguese, Italian, Dutch), on-click daily job feed with feedback and saved roles, application tracker, career profile and search strategy.

### What it is NOT

Not a resume builder. Not an auto-apply bot. Not a generic AI writer. Not a career coach. Not ChatGPT with a job-search UI.

---

## 6. Pricing and unit model

Source: live Stripe config and README. [verified]

| Plan | Price | Credits | Notes |
|---|---|---|---|
| Free | $0 | 4 / month | Top-5 daily feed (visibleCount 5), no wizard, one main search. No screening answers |
| Plus | $19.99 / mo | 50 | Feed up to 25 roles/day, 2 searches (2 job titles x 2 countries), screening answers, priority email support |
| Max | $79.99 / mo | 200 | Same visible cap (25), 4 searches (4 job titles x 4 countries), premium dedicated support |
| Credit Pack | $19.99 one-time | +50 | Paid plans |

Credit costs: full application 2.0, fit analysis 0.5, cover letter regeneration 0.5, email regeneration 0.5, follow-up regeneration 0.5. Credits roll over while the subscription is active.

Max's differentiator is search breadth (4 searches vs Plus at 2), not feed size. Both paid plans surface up to 25 roles a day. Free has a feed: 5 roles, no wizard, one main search.

A decision recorded in July 2026 to cut the free tier to 2 credits has **not shipped**. Quote 4 credits until it does.

### Unit economics (modelled, 2026-07-25)

Every tier prices credits identically at **$0.40 revenue per credit**.

- Cost per full application on the current all-Sonnet configuration: **about $0.21** of inference.
- Paid subscription gross margin at realistic utilization: **73 to 80%**, including Stripe fees.
- Blended break-even sits at **about 4.7% free-to-paid conversion**, against a 2 to 5% freemium norm. Below that line, each free signup loses money. This makes activation a solvency problem, not just a growth problem.
- The daily feed cost for free users is unmeasured and uncharged against credits.

Paid users are not the problem. Conversion is. The two levers, in order: fix activation, then conversion. The free-tier size is a bigger lever than any model choice.

---

## 7. Technology (current)

Migrated from Vercel + Supabase to Cloudflare. Source: README. [verified]

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19), TypeScript 5, on **Cloudflare Workers** via `@opennextjs/cloudflare` |
| Styling / state | Tailwind CSS v4, Zustand v5 |
| Database | **Cloudflare D1** (SQLite) with Drizzle ORM |
| Storage | **Cloudflare R2** (`usefulapply-files`), served through `/api/files` |
| Caching | **Cloudflare KV** for the agent context cache |
| Auth | Better Auth (email + password, Google OAuth) |
| Email | **Cloudflare Email Service** (transactional) |
| Payments | Stripe (subscriptions + credit packs) |
| Analytics | PostHog |
| Documents | pdfjs-dist (parsing), jsPDF + html2canvas + docx (export) |

### AI models in production

| Task | Model | Provider |
|---|---|---|
| Kit writing (CV, cover letter, emails, screening answers), CV parsing, fit analysis | Claude Sonnet 4.6 | Amazon Bedrock |
| Chat, tracker chat, career profile, search strategy, job-feed ranking | `@cf/openai/gpt-oss-120b` | Cloudflare Workers AI |

Job data comes from SerpAPI. [verified] `src/lib/job-feed/`

Never claim a model upgrade before it ships. Production generation is Sonnet 4.6. Say nothing else.

### Leftover `src/lib/supabase/` names

The folder name is historical. Those files are D1 and R2 wrappers (`credits.ts`, `sessions.ts`, `documents.ts`, `storage.ts`, `useSupabaseSync`). They are not a live Supabase client. Keep them until a dedicated rename. Do not delete the folder: the app imports it.

`supabase/migrations/` is the frozen Postgres history that D1 was ported from. Keep until decommission, then delete with `scripts/migrate/**`.

`@supabase/supabase-js` is only for `scripts/migrate/*` (one-shot cutover). `@supabase/ssr` is unused.

### When to delete the Supabase project and Vercel

Cutover to Cloudflare: **2026-08-23** (PR #87 merged, usefulapply.com live).

| When | What |
|---|---|
| **Now (2026-08-25)** | Do not delete either project. Production no longer reads them. Keep as rollback and as the source for a final export. |
| **2026-09-22** (30 clean days) | Pause the Supabase project. Take a final encrypted export (DB + Storage) and store it offline. Delete the Vercel project and cancel Vercel Pro. Disable any leftover Vercel Stripe webhook. |
| **2026-11-21** (90 days after pause) | Delete the paused Supabase project. Then delete `scripts/migrate/**`, `supabase/migrations/` and the unused npm packages from this repo. |

Do not pause earlier than 30 days unless a live incident forces it. karkoai.com should keep redirecting to usefulapply.com for at least 12 months.

### Anti-hallucination, precisely

This is the headline trust claim, so state it accurately.

- **What exists:** a highest-priority structural rules block in the generation prompts. A skill, tool or technology may only appear if it is explicitly named in the user's Primary CV or Master CV, or directly used in a described project. Plus a fabrication test: before writing any number, the model must find that exact number in the source CVs or delete it. A numeric sanity guard protects the fit score.
- **What does not exist:** a deterministic post-generation validator that re-checks output against the source CV. That is on the roadmap.

How to say it honestly: grounding is enforced as a highest-priority constraint the model must follow, and the user reviews everything before it goes anywhere. Do not claim guarantees ("zero hallucinations", "100% accurate"). The design commitment plus human review is the defensible claim.

### Build history

Solo. All commits are Wasim's across every git identity. 383 commits as of 2026-07-25.

---

## 8. Traction and metrics

**PostHog pulled 2026-07-21. Stripe verified 2026-07-25. Refresh before any submission.**

Context first: **there has never been a growth attempt.** From February to May 2026 the founder was out of money and job hunting, building the product alongside his own search with roughly 5 to 10 early users on free access acting as design partners. Since May 2026 it has run beside a full-time job. Zero marketing spend ever: no launch, no ads, no distribution push. Every visitor arrived organically.

Monetisation has not been tested and failed. It has not been tested.

| Metric | Value | As of |
|---|---|---|
| Unique visitors per week | ~120, fully organic (mostly Google and direct) | PostHog, 2026-07-21 |
| First-page drop | 96.7% never reach a second page | PostHog, 2026-07-21 |
| Early retention | Near zero past day 0 | PostHog, 2026-07-21 |
| Paying customers | **1**, on Plus | Stripe, 2026-07-25 |
| MRR | **$19.99** (ARR about $240) | Stripe, 2026-07-25 |
| First paid conversion | **2026-07-09**, entirely organic | Stripe |
| Founder outcome | Hired as an AI Specialist in May 2026 through an application the product wrote | [self-reported] |
| Founder dogfood | 60+ applications through the product, 5 interviews (~8%) | confirmed with Wasim, 2026-07-25 |

**Never claim:** "122 weekly active users" in the product sense, any DAU/MAU figure, or any retention strength. Use the visitor framing above. The honest gap is activation, and it is known where the funnel breaks.

---

## 9. Market and competition

Researched and verified 2026-07-25. Claims marked [R] came from research and were not independently confirmed. Do not put an [R] number in front of an investor unchecked.

**What market:** candidate-side software, paid for by the candidate. Indeed, the LinkedIn job board and Google Jobs are supply, not competitors. **LinkedIn Premium is a competitor.**

### The anchor

LinkedIn Premium Career runs $39.99 monthly, or $239.88 a year, which works out at exactly $19.99 a month [R]. Useful Apply Plus is priced at parity with that annual rate, not below it. Never say "half the price of LinkedIn" without specifying monthly billing. LinkedIn Premium passing $2B in trailing revenue (Microsoft earnings call, Jan 2025) [R] proves job seekers pay real money for job-search software.

### The competitive rings

| Ring | Who | Relationship |
|---|---|---|
| Substrate | Indeed, LinkedIn job board, Google Jobs | Supply. We read them. |
| **Free platform features** | ChatGPT, Indeed Career Scout, LinkedIn free | **The real threat.** |
| Auto-apply | Sorce (YC F2025), Tsenta (YC S2026), LazyApply, Sonara, Simplify | Volume over quality. Being engineered against. |
| Point tools | Teal, Rezi, Kickresume, Enhancv, Resume.io, Huntr | One slice each, context lost between them |
| Full loops already shipped | **Jobscan** ($49.95/mo), **Career.io** (human writers) | Name them before a partner does |
| Human services | CV writers, coaches, $100 to 500 per CV | Quality without speed or scale |

### The free-platform threat (verified 2026-07-25)

- **ChatGPT:** resume tailoring to a posting, free since June 2026. English only, web only. Its job search is US only.
- **Indeed Career Scout:** free since September 2025, but inside the Indeed app only.
- **LinkedIn:** AI job search free to all members since January 2026, English first, German and other languages followed. The deeper posting-level assistant stays Premium.

Where the free tier stops, which is the wedge (call it a wedge, not a moat):

1. **Non-English packaged workflow.** German CV conventions, tabular Lebenslauf formats, CEFR handling, two German templates, market-specific tone rules, inside a grounded pipeline. LinkedIn reached German in January 2026; ChatGPT's structured resume feature has not.
2. **The rest of the kit.** Nobody free writes the application email, the follow-up or the screening answers.
3. **Grounding as a rule, not a preference.** A general chatbot will invent a metric if pushed. Our generation prompts forbid it as a highest-priority constraint, and the user reviews before sending.

Specialised beats generic, and there is a familiar precedent: ChatGPT can build a website, yet Lovable and Replit still win, because purpose-built beats general at a specific job. This is a claim, not a proven fact. The best evidence today is the founder's own hire.

### Why not auto-applying is deliberate

The submission layer is being closed off: Greenhouse quietly deprioritises mass third-party submissions [R], Indeed's terms prohibit automating Indeed Apply, and Cloudflare is shipping behavioural agent detection with cryptographic agent identity [R]. Auto-apply companies optimise the layer that is closing. We automate the skilled work between finding a role and sending something worth reading. The reputation data supports the posture: Trustpilot scores fall as products get more autonomous (Massive 1.8, LazyApply 2.1, JobCopilot 3.0) [R].

**Never claim to be the only full loop.** Jobscan and Career.io ship one. The honest claim: we are trying to be the first one a job seeker can trust, with honest public pricing, grounded output and a human gate on every send.

### Evidence and its limits

*Algorithmic Writing Assistance on Jobseekers' Resumes Increases Hires* (Management Science, April 2025): 8% increase in hiring probability, n of roughly half a million. Cite as supporting evidence for the mechanism only. It studies a freelance market, not ATS hiring, and the intervention was non-generative. A partner who has read it will raise every one of these limits.

FTC exposure is real: a job-search operator was permanently banned with a $1.74M judgment in 2019 partly for advertising placement rates [R]. The founder's own outcome is fine to state as his experience. "Users get X% more interviews" is not, unless measured.

### Market size

No TAM theater. The defensible frame is a wallet you can point at: LinkedIn Premium's price, $100 to 500 for a human CV writer, monthly resume-builder subscriptions. Useful Apply at $19.99 competes for money job seekers already spend. A bottom-up sizing model does not exist yet; build it before a seed deck rather than quoting a number you cannot defend.

---

## 10. Risks, stated plainly

Know these cold. Naming them first is a strength in every investor conversation.

1. **Activation is broken.** 96.7% first-page drop. The number one product problem.
2. **Monetisation is unproven, not disproven.** One paying customer, zero growth attempts. Say what the unfunded months bought and what funded months go to.
3. **Episodic churn.** Success fires the customer; the founder is the example. Median unemployment is weeks, not months [R]. The credible answer is the expansion sequence below.
4. **Crowded category.** AI job tools are among the most common pitches since 2023.
5. **Solo founder, part-time.** Own it; the job is the proof point.
6. **Blended economics sit on the break-even line** (about 4.7% conversion needed).
7. **Previously rejected** with the same idea (YC Spring 2026).
8. **Visa friction.** Afghan national, German residence permit. US presence may need support.
9. **No distribution thesis yet.** The biggest hole reviewers found. Consumer subscription lives or dies on a channel.
10. **No option pool exists.** A board-adopted plan is required before any equity can be offered.
11. **AI-detection tools target CVs** and false-flag non-native English writers at high rates [R]. Non-native speakers are a core segment.

### Expansion sequence (the answer to churn)

Consumer subscription today because the candidate's interests must stay first. Institutions next (universities, bootcamps, outplacement): the institution renews even though the individual churns. A talent marketplace last, once outcome data shows which candidates are genuinely strong. Frame it as sequence, never as a hedge against the primary.

---

## 11. Fundraising position (brief)

Status: not running a raise. Focus is activation and product.

- **What money is for, in order:** inference (dominant variable cost), activation engineering, influencer marketing (a channel the founder has executed before, 30,000+ followers built), founder salary.
- **Commitment answer:** output, not hours. 383 commits, the entire current feature set built while employed, product predates the job, contract permits it. If funded, he leaves the job.
- **Y Combinator standard deal:** $500K as $125K for 7% on a post-money SAFE plus $375K uncapped MFN.
- **Honest valuation read (July 2026):** $10M post was not achievable. A realistic angel outcome was $150K to $350K on a $3M to $5M cap, likely conditional on going full time. Do not announce a raise that is not moving.

### Open items that would strengthen any application

1. Outcome evidence beyond the founder (ask design partners and the paying customer whether they got interviews or offers).
2. Lifetime signups, total applications generated, total fit analyses (now in D1).
3. Real free-to-paid conversion and credit utilization, replacing the modelled figures.
4. A distribution thesis.

---

## 12. Change log

| Date | Change |
|---|---|
| 2026-08-26 | Product-locked job-feed caps. Free has a feed: visibleCount 5, no wizard, one main search. Plus/Max visibleCount 25 (Plus 2 searches, Max 4). README no longer lists the feed as Plus/Max only. |
| 2026-08-25 | Recorded leftover `src/lib/supabase/` as D1/R2 wrappers, not a live client. Decommission calendar: pause Supabase and delete Vercel on 2026-09-22; delete the paused Supabase project on 2026-11-21. |
| 2026-08-25 | Synced with the live codebase. Free has a top-5 daily feed (not "no job feed"). The feed is user-triggered once a day, not a morning batch. Plus and Max visible cap is 25 roles. Dropped "arrives each morning" language. |
| 2026-08-23 | Consolidated from three Karko-era documents (`KARKO-AI-SOURCE-OF-TRUTH.md`, `APPLICATION-ANSWER-BANK.md`, `NEXT-SESSION-BRIEF.md`) into two files under the Useful Apply brand. Restated the stack as Cloudflare (Workers, D1, R2, KV) after the migration from Vercel and Supabase. Cut session-specific strategy, the unshipped Opus 5 migration material and Vercel-era infrastructure detail. Kept every fact that survives the rebrand, with its as-of date. |
