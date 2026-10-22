# Useful Apply: application answer bank

Keep this current: update when the product, stack or direction changes.

**Owner:** Wasim Jalali
**Last updated:** 2026-08-26
**Companion to:** `SOURCE-OF-TRUTH.md` (the fact layer). This file is the writing layer.
**Use for:** Y Combinator, other accelerators, angel and pre-seed conversations, grants, startup competitions, press.
**Brand:** Useful Apply (formerly Karko AI). Legal entity remains Karko AI Inc., a Delaware C-Corp.

---

## 0. How to use this

- Every answer below is built from facts in `SOURCE-OF-TRUTH.md`. If you change a number here, change it there first.
- Answers are written to be pasted and lightly trimmed, not read out loud verbatim.
- Anything in `[brackets]` is a blank you must fill before sending.
- **Read §7 (landmines) before every submission.** It is a list of things that have already cost one rejection.

---

## 1. One-liners, by length

| Constraint | Text | Chars |
|---|---|---|
| 50 char limit | `AI agent that runs your entire job search` | 41 |
| 50 char limit, alt | `AI agent for the entire job search in one app` | 45 |
| Twitter bio style | The AI job application agent. Your entire job search, in one app. | |
| Investor sentence | Useful Apply is the AI job application agent. It replaces the seven-tool job search workflow with one loop: search, fit, tailor, screen, track. | |

---

## 2. The core answers

### What is your company going to make?

> Useful Apply is an AI agent that runs the whole job search in one app. You upload your CV once. You run a daily feed of matched roles. Before you spend time, you see a fit score with real gaps. In about 90 seconds you get a complete application: tailored CV, cover letter, email and screening answers, with every line grounded in your actual experience. You review everything before it goes anywhere. Every application is tracked automatically. It replaces the seven tools job seekers juggle today: job board, resume builder, ATS checker, cover letter AI, email drafts, screening prep and a tracking spreadsheet.

### Why did you pick this idea? Do you have domain expertise?

> I needed it myself. I ran out of money building a startup in Germany, had no degree to fall back on, and generic applications got zero interviews. Tailoring by hand took 45 to 60 minutes each and still failed. I built the workflow manually inside Claude with my CV as context, then turned it into a product. Then I pointed it at my own search: 60+ applications, every one written by the product, 5 interviews, and I was hired as an AI Specialist through one of them. That is the job I hold today. The product didn't just help me apply, it got me the job. Domain proof is personal use plus a live product, not recruiting theory.

### Who are your competitors? What do you understand that they don't?

> The real competition isn't the resume builders, it's the free platform features. ChatGPT has tailored a CV to a posting since June, free, but English only and web only. Indeed Career Scout is free inside the Indeed app. LinkedIn's AI job search went free to everyone in January. Those three give away a slice of what we charge for, and any answer that ignores them isn't serious.
>
> Where they stop is where we live. ChatGPT's resume tool is English only; we generate in seven languages with German CV conventions and two German templates, and LinkedIn only reached German in January. None of them writes the application email, the follow-up or the screening answers. And a general chatbot will invent a metric if you push it, whereas refusing to is our highest-priority generation rule. The same goes for logistics: we ask for your real start date and salary expectation once, and the letters use only those.
>
> We're also not the first full loop; Jobscan and Career.io ship one too. Our claim is narrower and better: we're trying to be the loop a job seeker can trust, with honest public pricing, grounded output and the user's hand on every send.
>
> ChatGPT can build a website too. Lovable and Replit still win, because purpose-built beats general at a specific job. That's the bet.
>
> Then there's the auto-apply group, including Sorce and Tsenta from YC batches. They automate submission. We deliberately don't, and that's a considered call: Indeed's terms now explicitly prohibit automating Indeed Apply, and Cloudflare is shipping behavioural detection that blocks agent-class bots by default. My read is that the submission layer is closing. They're automating the layer that's closing. We automate the part that isn't, which is the skilled work between finding a role and sending something worth reading.

### How do you make money? How much could you make?

> Credit-based subscription. Free, Plus at $19.99 a month, Max at $79.99 a month, plus credit top-ups on paid plans. Free gets a top-5 daily feed, no wizard, one main search. Plus and Max get up to 25 roles a day. Plus searches twice (2 job titles x 2 countries), Max four times (4 x 4). Job search is episodic, so churn is real and I don't pretend otherwise. Near-term growth is activation and free-to-paid conversion, not market-size slides. The economics are modelled, not guessed: about $0.21 of inference per full application today, $0.40 revenue per credit, and 73 to 80% gross margin on a paid subscription at realistic utilization. The number I actually watch is free-to-paid conversion, because blended break-even sits at about 4.7% and that is where the business is won or lost.

### How far along are you?

> Live at usefulapply.com with paid billing. Since my Spring 2026 application, filed under the previous name Karko AI, I rebuilt it from a one-step application generator into the full loop: matched job feed, fit analysis, a 90-second application kit with CV, cover letter, emails and screening answers, a tracker, and grounding rules so output only uses the user's real CV. Along the way I migrated the entire stack from Vercel and Supabase to Cloudflare. Most of that came out of five months shipping against feedback from a small group of early users on free access, while I was out of money and job hunting. I was hired as an AI Specialist in May through an application the product wrote, and have built around that job since. About 120 people reach the site in a typical week, all organic, with zero marketing spend ever. First paying customer converted 9 July. Honest gap: activation. Most visitors don't reach a second page. Nobody has tried to grow this yet, which is the opportunity and the risk in the same sentence.

### Progress bullets (short-field version)

> - Live at usefulapply.com with paid billing. Free / Plus $19.99 / Max $79.99, credit-based.
> - Rebuilt since Spring 2026 into the full loop: feed, fit, 90-second kit, screening, tracker.
> - Migrated the whole stack to Cloudflare (Workers, D1, R2, KV).
> - About 120 people reach the site in a typical week, all organic. Zero paid marketing, no launch push yet.
> - 1 paying customer.
> - **I was hired as an AI Specialist through an application the product wrote.** 60+ applications through it, 5 interviews, one offer. First-time job seeker, no degree.
> - Five months of product work driven by a small design-partner cohort on free access, while I was unfunded and job hunting.
> - Zero marketing spend, ever. No launch, no ads. All traffic organic.
> - First paying customer converted 9 July, organically, at $19.99.
> - Honest gap: most visitors don't activate past the first page and early retention is near zero. Activation is the hill.

### How many users, how many paying, who pays the most?

> About 120 people reach the site in a typical week, organic only through Google and direct, with zero marketing spend ever. One paying customer, on the $19.99 Plus plan, converted 9 July. Before that a small group of early users, around 5 to 10, had free access and acted as design partners; their feedback drove five months of product work. I don't claim those visitors are weekly active users in the product sense, because most first visits don't go deep yet. Activation is the open problem and I know where the funnel breaks.

### Do you have revenue?

> Yes, $19.99 MRR. One paying customer on Plus, converted 9 July 2026, entirely organic. Context worth giving: the product has never been marketed. No launch, no ads, no distribution push, zero spend. For the first three months I was out of money and job hunting, building alongside my own search with a small group of early users on free access shaping it. Since May it has run beside a full-time job. So conversion isn't a thing I tried and failed at. It's a thing nobody has tried yet.

### How long have you been working on this, and how much full-time?

> I have been building it since January 2026, so about seven months, live and evolving for roughly five of those. I am currently employed full-time as an AI Specialist, and that job came through using the product itself. I build around the job. If accepted I will leave the job and work exclusively on Useful Apply.

### Tech stack

> Next.js 16 with React 19 and TypeScript, Tailwind CSS 4 and Zustand, running on Cloudflare Workers via OpenNext. Cloudflare D1 for data with Drizzle, R2 for file storage, KV for caching, Better Auth for accounts, Cloudflare Email Service for transactional email, Stripe for payments, PostHog for analytics. Generation runs on Claude Sonnet 5.5 through the Anthropic API. Lighter high-volume tasks like chat and job-feed ranking run on open-weight GPT-OSS-120B through Cloudflare Workers AI, with SerpAPI for job data. I write all the code with Claude Code, Cursor and similar AI coding tools.

*If they push on model choice:* the documents a user actually sends to an employer run on Sonnet 5.5 via the Anthropic API, because output quality there is the product. It replaced Sonnet 4.6 after an October 2026 eval where it invented fewer claims and ran faster for less. High-volume auxiliary tasks run on cost-efficient open-weight models through Workers AI, which keeps unit economics sane without touching what gets read. **Do not claim any model upgrade before it ships.**

### Who writes the code?

> I write all of it. I taught myself full-stack development in about three months and ship with AI coding tools. No non-founder has contributed technical work. 383 commits as of late July 2026, all mine.

### Are you looking for a co-founder?

> Not actively. I ship solo, and the company reflects that: I hold 100% of the stock, I am the sole director and I write all the code. I may bring co-founders on later with meaningful equity, but I am not going to promise named co-founders on a future-tense timeline.

*(Confirmed solo as of 2026-07-25. The plan to bring his brothers Zaeem and Samim in after funding is real, but it stays out of form fields. Say it in conversation if asked how the money gets used, never on the application itself.)*

### Where do you live, where would the company be based?

> Kaiserslautern, Germany. The company is Karko AI Inc., trading as Useful Apply, a Delaware C-Corp. [After the program: San Francisco.]

### Explain your location decision

> I am based in Germany and the company is a Delaware C-Corp. The product targets English-speaking markets first: US, UK and Canada. I want to be in San Francisco for the network, the investors and the AI ecosystem. As an Afghan national with a German residence permit I may need visa support to be in the US, I will do everything on my end to make it work and would appreciate any help you can provide.

### Commit exclusively for the next year?

> Yes. If accepted I will leave my job and work exclusively on Useful Apply for the next year.

### Equity and entity

> Useful Apply is operated by Karko AI Inc., a Delaware C-Corp incorporated February 9, 2026 via Stripe Atlas. 10,000,000 shares of Common Stock authorized at $0.00001 par. I hold 7,000,000 shares, which is 100% of the issued and outstanding stock, on a standard 4-year vest with a 1-year cliff and a filed 83(b). Sole director, and I hold both officer roles. No option pool has been adopted yet.

**Equity percentage on a form: 100%.** Not 70%. The other 3,000,000 shares are authorized but unissued, and no equity incentive plan exists, so there is no pool to subtract. Earlier drafts said 70% and that was wrong.

### Investment and fundraising status

> No investment taken. No SAFE has ever been signed. Not running a raise right now; the focus is product activation.

*(The $500K on a $5M cap announced in February 2026 was never signed and raised nothing. Never repeat it.)*

### Why this accelerator / why now?

> I can start and ship products. I have not yet scaled one. I don't have a network of people who have raised funding, scaled companies or exited. That environment is what I am missing, along with the pressure to make activation and revenue real. I learned the product mindset largely from public content, mostly Michael Seibel and Dalton Caldwell.

---

## 3. The founder story, three lengths

### One sentence

> I ran out of money building a startup in Germany, got zero interviews from generic job applications, built the tool I needed, and was hired as an AI Specialist through an application my own product generated.

### One paragraph

> I left Afghanistan and built a life in Germany with no degree. At 17 I started with 200 EUR in Amazon retail arbitrage and scaled it to 150,000+ EUR across four marketplaces over three years, then turned a 30,000-follower audience into an AZAV-certified training company that did another 30,000 EUR. I taught myself full-stack development in three months and built Kursfind AI, an AI marketplace for German vocational training. I paused it: two-sided marketplace, one regulated market, and I ran out of money. So I started applying for jobs. Generic applications got zero interviews and hand-tailoring took 45 to 60 minutes each. I built the workflow inside Claude, then turned it into Useful Apply. Sixty-plus applications through it, 5 interviews, and then the offer: I was hired as an AI Specialist through an application my own product wrote. That is the job I have today, and Useful Apply is the product I keep building.

### Long version

Use §4 of `SOURCE-OF-TRUTH.md`, the eight-step timeline.

### The best single line to lead with

> I was hired as an AI Specialist through an application my own product generated.

---

## 4. Standard credential answers

**Most impressive thing built other than this startup**

> A 180,000+ EUR business, 150K in e-commerce and 30K in courses, starting from 200 EUR and zero experience, while growing 30,000+ followers teaching Amazon FBA and AI, all self-taught as a non-native speaker in Germany.

**A time you hacked a non-computer system**

> During the AZAV certification audit for my training company, my documentation had problems serious enough to fail. Instead of trying to fix everything on the spot, I noticed the auditor was overwhelmed with manual review work, and I showed him AI tools and techniques that would make his job dramatically easier. He was genuinely impressed. The dynamic shifted from adversarial to collaborative. He helped me fix issues, overlooked minor problems, and I passed. I turned a gatekeeper into an ally by giving him something valuable he didn't know existed.

**Things you have built**

> - Useful Apply, usefulapply.com. AI job application agent, built solo. Unified agent architecture with grounding constraints, fit assessment, multi-market output in 7 languages. Live with paid billing on Cloudflare.
> - Kursfind AI, kursfind.de. Germany's first AI-native marketplace for government-funded vocational training. Full-stack MVP solo in 4 weeks on Next.js with AI course matching.
> - Wasim Academy, wasimacademy.org. AZAV-certified training provider delivering AI and e-commerce courses in German and English. 30K EUR revenue.
> - Useful Build, usefulbuild.com. Applied AI systems firm for SMBs. Site live, no clients yet.
> - Self-taught full-stack development in 3 months, from zero coding knowledge to production applications.

**Competitions, awards, papers**

> None. I have been building instead of competing.

**Test scores**

> High school graduation, 92% overall across the final three years.

**Entrepreneurship programs, clubs, hacker houses**

> None. I have been building businesses independently since finishing high school: e-commerce, then a training company, then Kursfind AI, now Useful Apply.

**Accelerators participated in**

> None.

---

## 5. Application history (answer "what changed since last time" from this)

### Y Combinator, Spring 2026, applied as Karko AI. Rejected.

What was submitted: a one-line pitch of "AI that tailors your full job application in 90sec", a live product where the founder was the only real user, zero revenue, pricing at Free 20 apps / $29.99 for 60 / $49.99 for 120, no legal entity at submit time, and a mid-process update announcing a $500K post-money SAFE at a $5M cap.

Why it likely failed:
1. Almost no external usage and no revenue. "I'm the primary user" in a crowded category.
2. Two weeks on the idea, product built in 3 days. Fast shipping, weak proof of durable demand.
3. Sole founder, with co-founders only in the future tense.
4. Market-size theater (Indeed billions, 9,000 applications per minute) with no unit economics.
5. "No one has built this", which is easy to disbelieve.
6. Cloud credits presented as economics, which underplays real COGS.
7. A live account password pasted into the application form.
8. A fundraise announced that, per the record, closed nothing.

### Y Combinator, earlier, Kursfind AI. Rejected.

> I applied with Kursfind AI, an AI marketplace for government-funded vocational training in Germany. I paused it: two-sided marketplace, a single regulated market, and I ran out of money. What it taught me was how to build full-stack AI products, how to evaluate a market, and that the best ideas come from problems you are desperate to solve.

### The "what changed" answer

> I applied in Spring 2026 under the name Karko AI, when I was essentially the only user, the product was a one-step generator (paste a job, get a CV, cover letter and email), and revenue was zero. Since then: the full job-search loop is live (feed, fit, 90-second kit, screening, tracker), paid plans are live, the stack migrated to Cloudflare, people find it organically without any marketing, there is a first paying customer, and I used the product to land my AI Specialist role. It rebranded to Useful Apply along the way, and that is the company I am applying with now.

---

## 6. Investor question prep (the ones that will actually be asked)

| Question | The honest answer |
|---|---|
| Why does nobody get past page one? | Name it as the top product problem, say what you are testing next. Do not deflect. |
| One paying customer, why so few? | Because nobody has tried yet. Zero marketing spend to date, no launch, and I was unfunded and job hunting for the first five months, then employed full time. That's the honest answer, and it's better than it sounds: it means the conversion question is still open rather than already answered badly. Then point at what the first funded months go to: activation first, conversion second. |
| Job search ends when someone gets hired. What's the retention story? | Acknowledge the built-in churn event, and that you are the example. Then give the actual plan, as a sequence: consumer today, institutions next (universities, bootcamps, outplacement renew even when individuals churn), a talent marketplace last. **[confirm] which stage you actually believe in most.** |
| What does a full application kit cost you? | About $0.21 of inference today on Sonnet 5.5, measured in the October 2026 eval. Revenue is $0.40 per credit, so a paid subscription runs 73 to 80% gross margin at realistic utilization. |
| So the economics work? | For paid users, yes. Blended is the honest answer: free credits cost against zero revenue, so break-even is about 4.7% free-to-paid against a 2-5% freemium norm. We sit on that line, which makes activation the single most important number in the business. |
| Why do you win in a category with hundreds of entrants? | Mechanism, not absence of competitors: the full grounded loop with trust as the product, multi-market depth the free incumbents lack, and a data flywheel from fit analyses. Concede all three are early, and concede Jobscan and Career.io already ship a full loop. |
| You are solo and employed. Is this real? | The job came through the product and it seeded real applied-AI experience. If funded, you leave. Say it plainly. |
| What is your cap table? | 7,000,000 shares issued to you, 100% of outstanding, of 10,000,000 authorized. No pool adopted. 4-year vest, 1-year cliff, 83(b) filed on time. Clean and boring, which is what you want. |
| Have you raised or signed a SAFE? | No. Never. Verified against the Drive folder: the SAFE files there are blank templates. |
| What jurisdictions do you operate in? | US entity (Karko AI Inc.), you are resident in Germany. **[confirm]** the German tax registration status first. |

---

## 7. Landmines: do not do these again

1. **No credentials on any form, ever.** Rotate the Spring 2026 test-account password, it was committed to git. Use a clean demo account plus a short Loom.
2. **No market-size theater.** No Indeed billions, no applications-per-minute. Use unit-level proof: the hire, the funnel you understand, the interview rate as support.
3. **Never say "no one has built this."**
4. **Never present cloud credits as unit economics.**
5. **No future-tense co-founders.** Names and dates, or clean solo.
6. **Never headline shipping velocity.** "Built in 3 days" advertises thin demand proof.
7. **One clean entity fact:** Useful Apply, operated by Karko AI Inc., Delaware C-Corp, Stripe live. No contradictions between fields, and don't mix the brand and legal names up mid-form.
8. **Never announce a fundraise that isn't moving.**
9. **Pricing must match the live site:** $19.99 and $79.99, never the old $29.99 / $49.99.
10. **Never claim full-time.** You are employed. Own it, the job is the best story you have.
11. **Never quote 122 WAU or DAU figures.** Use the ~120 weekly visitors framing from the source-of-truth file.
12. **The brand name is Useful Apply.** Never write Cargo or Carco. Historical references may say Karko AI once, clearly marked as the former name.
13. **Never write Claude Sonnet 4.5 or 4.6 as the production model.** Production is Sonnet 5.5. And never claim a model upgrade before it ships.
14. **Never write 70% equity.** You own 100% of the issued stock.
15. **Never promise zero hallucinations.** Grounding is a design commitment plus human review. Pair every trust claim with "you review before it goes anywhere".
16. **No em dashes** in any application text.

---

## 8. Pre-submission checklist

Run this every time, for any application.

- [ ] Pull fresh PostHog numbers. The ones in the source-of-truth file are dated 2026-07-21.
- [ ] Confirm exact Stripe MRR, plan and paying-customer count.
- [ ] Equity percentage says **100%**, not 70%.
- [ ] Confirm current age, city and visa wording.
- [ ] Confirm employment status and the exclusivity answer.
- [ ] Pricing on the form matches the live site.
- [ ] Test-account password rotated. No credentials anywhere in the text.
- [ ] Demo path ready. A 2-minute demo exists in Drive (`05_Marketing/2026-05-01_karkoai_2min_demo.mp4`), plus 4K full demos. Use one of those or a fresh Loom, with a clean demo account.
- [ ] Read §7 landmines top to bottom.
- [ ] Proofread for em dashes, for "Cargo/Carco", for "Sonnet 4.5", and for any leftover karkoai.com links.
- [ ] Deadline and timezone double-checked.
