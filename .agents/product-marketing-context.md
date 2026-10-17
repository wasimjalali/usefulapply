# Product Marketing Context — Useful Apply

*Last updated: 2026-08-25 (synced to live codebase: Useful Apply brand, on-click daily feed, Cloudflare stack)*

---

## Product Overview

**One-liner:** The complete job application platform: find hand-picked jobs in a daily feed and write a tailored application for each one in 90 seconds.

**What it does:** Useful Apply is the one app a job seeker needs. It does three things that used to require three different tools:
1. **Finds jobs** — you run the Smart Job Feed across your roles, countries and cities, once a day, and get hand-picked matches ranked by real fit against your CV.
2. **Writes the application** — paste or pick a job and Useful Apply produces a complete package in under 90 seconds: ATS-optimized CV, personalized cover letter, application email, and follow-up email, all drawn from your Master CV.
3. **Tracks progress** — every application is stored with match score, status and company context, so you stop living in a spreadsheet.

A Fit Analysis mode lets users check their match score before spending credits.

**Product category:** Complete job application platform (how customers now search: "find jobs and apply with AI", "AI job search app", "daily job feed plus CV builder")

**Product type:** SaaS web app

**Business model:**
- Free: 4 credits/month (~2 applications)
- Plus: $19.99/mo — 50 credits/month (~25 applications)
- Max: $79.99/mo — 200 credits/month (~100 applications)
- Add-on credit packs: $19.99 for 50 credits (Plus and Max only, rollover while subscribed)

---

## Target Audience

**Target users:** Job seekers globally, with focus on professionals actively applying to roles

**Primary use cases:**
- Active job seekers who don't want to scan job boards every day
- Job seekers who apply to many roles and want to speed up the process
- Career changers who need tailored materials for a new field
- International job seekers applying to both US and EU (German) markets
- Anyone whose applications get filtered by ATS and want to fix that

**Jobs to be done:**
- "Tell me about good jobs without making me hunt for them every day"
- "Get my application materials ready fast without spending hours writing"
- "Make sure my CV passes ATS so a human actually reads it"
- "Apply to more jobs in less time without sacrificing quality"
- "Know if a job is worth applying to before I invest time in it"
- "Keep track of who I applied to and where I stand, without building my own spreadsheet"

**Secondary audiences:**
- Recent graduates entering the job market
- Professionals in transition (layoff, relocation, career pivot)

---

## Personas

| Persona | Cares about | Challenge | Value we promise |
|---------|-------------|-----------|------------------|
| Passive-to-active job seeker | Finding good jobs without daily hunting | Too busy to scan LinkedIn/Indeed every morning; misses relevant roles | Smart Job Feed delivers hand-picked matches when you run your daily feed |
| Active job seeker | Speed, quality, response rates | Spending 45-60 min per application; generic CVs not getting callbacks | Complete package in 90 seconds, tailored to each job |
| ATS-blocked candidate | Getting past software filters | Strong experience but applications filtered before human review | ATS-first templates; keyword matching without stuffing |
| International applicant | Correct regional format | US vs EU formats differ; German Lebenslauf has strict conventions | Region-specific templates (US ATS, German classic, German two-column) |
| High-volume applier | Efficiency at scale | Applying to 50+ roles is exhausting and repetitive | 100 applications in 2.5 hours vs 75 hours manually |
| Organized tracker | Staying on top of where they applied | Spreadsheet fatigue; losing track of status across dozens of roles | Built-in tracker with match score, status, and company context on every application |

---

## Problems & Pain Points

**Core problem:** The job search is fragmented across too many tools. You hunt for jobs on LinkedIn and Indeed, draft the CV in Word, rewrite the cover letter in another tool, send the email from Gmail, track everything in a spreadsheet, then repeat. Every application eats 45-90 minutes, and most never get a reply. It is exhausting and demoralizing.

**Why current solutions fall short:**
- Resume builders (Canva, Zety) only format — they do not write content and cannot find jobs
- ChatGPT requires prompting expertise; no application workflow, no ATS templates, no job discovery
- Teal and Jobscan help optimize existing content but do not generate from scratch and do not surface new roles daily
- LinkedIn/Indeed help you search but do not write the application or track progress
- No other tool combines daily job discovery, complete application generation, and tracking in one place
- No other tool generates application emails or follow-up emails alongside the CV

**What it costs them:**
- Time: 45-90 minutes per application, multiplied by dozens of roles, plus hours of job hunting every week
- Opportunity: Applications filtered by ATS before a human ever reads them; good roles missed because the job seeker was not looking that day
- Energy: Writing the same cover letter with small tweaks, over and over, and context-switching between five different apps
- Discipline tax: Keeping a manual spreadsheet of applications is its own part-time job

**Emotional tension:**
- Feeling like you are shouting into a void
- Uncertainty about whether your materials are good enough
- Exhaustion from the volume and repetition
- Guilt from not applying on the days you should have been job-hunting

---

## Competitive Landscape

**Direct competitors:**
- **Teal** — Resume builder with a Chrome-extension job tracker. Their tracker used to be a real edge; Useful Apply now has a built-in tracker plus the Smart Job Feed. Teal does not discover jobs for you and does not generate emails.
- **Enhancv** — Resume builder with multi-language and basic tracking. Useful Apply now matches on tracking and exceeds on discovery and email generation.
- **Kickresume / Zety** — Resume formatting tools with AI copy suggestions. Not agentic workflows. No application emails. No job discovery.
- **Rezi** — ATS-focused resume builder. No cover letter + email workflow. No job discovery.

**Secondary competitors (same problem, different approach):**
- **ChatGPT / Claude.ai directly** — Capable but requires the user to design their own workflow, prompts, and templates. No structured output, no ATS templates, no PDF export, no job discovery, no tracker.
- **Jobscan** — ATS scoring and keyword matching. Optimizes existing content rather than generating new content.
- **LinkedIn / Indeed job alerts** — Discover jobs but do not write the application, do not score fit against your real CV, and do not track once you have applied.
- **Resume.io + recruiter matching** — Broader ecosystem with auto-apply; Useful Apply's positioning is controlled, strategic applications rather than blast-apply.

**Indirect competitors:**
- **Professional CV writers (freelance / agencies)** — High quality but expensive ($200-$500+), slow (3-7 days), not scalable for multiple applications.
- **Doing it manually across 5 tabs** — The default. The status quo we are competing against most of the time.

**How Useful Apply wins:**
- The only app that covers the full workflow: discover → fit → write → apply → track
- Smart Job Feed delivers hand-picked, ranked jobs daily (up to ~15/day on Plus, ~25/day on Max) — no other resume tool has this
- Complete application package (CV + cover letter + application email + follow-up email) in 90 seconds — no other tool generates emails
- Built-in application tracker (match score, status, company) — no spreadsheet needed
- ATS-first by default — passes Workday, Greenhouse, Lever
- Anti-hallucination system: every claim traces to the user's real experience (Master CV)
- Powered by Claude Sonnet 5.5 (frontier-grade AI vs. cheaper models competitors use)

---

## Differentiation

**Key differentiators:**
- **One app for the whole workflow** — discover, fit, write, apply, track. No other tool covers all five.
- **Smart Job Feed** — hand-picked jobs delivered daily, ranked by real fit against your CV (up to ~15/day Plus, ~25/day Max)
- **Complete application package** — no other tool includes application and follow-up emails
- **Built-in application tracker** — match score, status, company, role; every generated application stored automatically
- **90-second workflow** — fastest end-to-end application generation available
- **Master CV system** — upload once, use for every job without rewriting
- **Anti-hallucination guarantee** — only facts from your actual experience appear in output
- **ATS-first templates** — 6 professional designs engineered for ATS compatibility
- **Global templates** — US and German (Lebenslauf) formats included
- **Fit Analysis mode** — check match score before spending credits

**Why that is better:**
- Job search is a workflow, not a single task. One app beats five browser tabs.
- Job seekers do not just need a CV — they need a complete package ready to send
- Personalization at scale is the core promise; each application is tailored, not templated
- Zero fabrication builds trust: users can send outputs confidently without fact-checking
- Daily job discovery keeps the pipeline full without requiring daily effort from the user

**Why customers choose us:**
- Completeness: the whole workflow in one app, not five tools stitched together
- Speed: complete application in 90 seconds
- Quality: outputs trace to real experience, never hallucinated
- Discovery: you do not have to hunt for jobs — they come to you

---

## Objections

| Objection | Response |
|-----------|----------|
| "AI CVs all sound the same / generic" | Useful Apply uses your specific experience from your Master CV. Every claim traces to something you actually did. It is tailored, not templated. |
| "Recruiters can tell when a CV is AI-generated" | Our output uses your own words and experience as raw material. The AI restructures and optimizes — it does not invent. Plus, ATS software does not care who wrote the content. |
| "I can just use ChatGPT for free" | You would need to design the workflow, write the prompts, handle ATS formatting, and export PDFs yourself. Useful Apply is an end-to-end system with ATS templates, Master CV storage, and a structured workflow built in. |
| "Is my data safe?" | [needs input — add privacy/data handling statement] |

**Anti-persona:**
- Users who want a portfolio/design-forward CV (Useful Apply is ATS-first; not for graphic designers using visual CVs)
- Users who only need one application per year (Free tier handles this, but the ROI is lower)

---

## Switching Dynamics

**Push (away from current approach):**
- Spending 45-90 minutes per application is not sustainable at volume
- Generic templates not getting callbacks despite strong experience
- ATS filters silently rejecting well-qualified candidates

**Pull (toward Useful Apply):**
- 90-second workflow promises immediate time savings
- Complete package removes the "I still have to write the email" friction
- Fit Analysis mode removes the risk of applying to a bad match

**Habit (keeps users stuck in old approach):**
- Existing CV files are "good enough"
- Uncertainty about AI quality: "I should just write it myself"
- Familiarity with Word/Google Docs for CV editing

**Anxiety (about switching to Useful Apply):**
- "What if the output is generic or wrong?"
- "What if I put in my experience and the AI invents things?"
- "Is this worth paying for if I only apply occasionally?"

---

## Customer Language

**How they describe the problem:**
- "I spend hours on each application and hear nothing back"
- "My CV keeps getting filtered out"
- "I have to rewrite everything for every job"
- "I know I am qualified but I cannot even get an interview"

**How they describe the solution:**
- "It saves so much time and energy"
- "You can create a targeted CV, cover letter and email in a matter of seconds"
- "Best site for job seekers"
- "Helps create a professional CV in European and USA format"
*(Source: reviews embedded in page.tsx schema markup)*

**Words to use:**
- hand-picked, daily feed, your feed, ranked by fit, apply with Useful Apply, one app, all in one place
- tailored, targeted, specific, ATS-optimized, complete package, 90 seconds, application kit, zero fabrication, Master CV, tracker
- daily, ready when you open the app

**Words to avoid:**
- revolutionary, innovative, cutting-edge, seamless, streamline, leverage, utilize, game-changing, transformative, agentic (in user-facing copy), unlock, revolutionize, supercharge
- "AI-powered" as a lead — show the capability, not the implementation
- em dashes (—) in any user-facing copy
- Exclamation points in marketing copy
- "Coming Soon" (we are cutting all roadmap references from Smart Job Feed's neighbor surfaces)

**Glossary:**
| Term | Meaning |
|------|---------|
| Master CV | User's complete work history uploaded once; source of truth for all generated content |
| Smart Job Feed | Daily feed of hand-picked, ranked jobs based on user roles, countries, cities, seniority, and CV fit |
| Apply with Useful Apply | One-click handoff from a Job Feed card into the Application Kit generation workflow |
| Application Kit | The complete output: CV + cover letter + application email + follow-up email |
| Application Tracker | In-app list of every generated application with match score, status, company, role |
| Fit Analysis | Pre-application match score + skill gap analysis (0.5 credits) |
| ATS | Applicant Tracking System — software employers use to filter CVs before human review |
| Lebenslauf | German-format CV (two-column and single-column templates available) |

---

## Brand Voice

**Tone:** Premium, calm, direct. Knowledgeable colleague, not a corporate chatbot.

**Style:**
- Short sentences. One idea per sentence.
- Active voice in confirmations: "Your application is ready." not "The application has been generated."
- Contractions where natural: "you're", "it's", "we'll"
- No hollow filler: no "Great!", "Sure!", "Absolutely!"
- No em dashes in user-facing text

**Personality:** Trustworthy, efficient, humane. Built for humans who are stressed about job hunting, not for enterprise procurement teams.

---

## Proof Points

**Metrics (from codebase, verified):**
- 90 seconds: complete application package generation time
- 100 applications in 2.5 hours vs 75 hours manually (97% time savings — use sparingly, calculated not measured)
- 6 professional ATS-compatible CV templates
- Passes Workday, Greenhouse, Lever ATS parsers
- Smart Job Feed: top 5 on Free, up to 25 hand-picked jobs per day on Plus and Max. Max searches twice as wide (4 titles x 4 countries vs 2 x 2).
- Fit Analysis: 0.5 credits; full kit: 2 credits, or 1.5 after a fit check
- Pricing: Free (4 credits, ~2 apps), Plus ($19.99/mo, 50 credits, ~25 apps), Max ($79.99/mo, 200 credits, ~100 apps), add-on pack ($19.99 for 50 credits, rollover while subscribed)

**Reviews (verbatim, from schema markup in page.tsx):**
> "Useful Apply is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications." — Mohammad Shafiq, 5 stars

> "If you are someone who's looking for jobs like me this is the best site for you. It saves so much time and energy for you. You can create targeted CV, Cover Letter and Email + follow up email in a matter of seconds for any Job application you want." — Zaeem Jalali, 5 stars

**Technology differentiator:**
- Powered by Claude Sonnet 5.5 by Anthropic (frontier-grade AI)
- Sonnet 5.5 was chosen for grounding, speed and cost, not as a claimed writing upgrade. Don't market it as better writing.
- Anti-hallucination: every claim in output traces to the user's Master CV

**Claims NOT to make (unverified):**
- Do not cite "40% higher callback rate" for application emails without verified sourcing — appears in current feature page copy and should be removed or softened
- Do not cite "50% more callbacks" for cover letters without verified sourcing
- Do not cite "2.5 hours vs 75 hours / 97% time savings" as a user-measured stat — it is a calculated claim (100 apps × 90s vs 100 × 45min). Use the underlying math ("under 90s per app") instead of the aggregate claim in headline copy.
- Do not invent testimonials or user counts beyond what is verified above
- Do not promise auto-apply. Smart Job Feed delivers jobs; users still choose which to apply to.

---

## Goals

**Business goal:** Acquire paying subscribers; convert free users to Plus/Max plans

**Key conversion actions:**
1. Sign up for free (primary: lowest friction)
2. Complete first application (activation)
3. Upgrade to Plus or Max (monetization)

**Current metrics:** [needs input — add MRR, user count, conversion rate when available]

---

*Edit this file directly to update any section.*
