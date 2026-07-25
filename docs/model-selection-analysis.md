# Model selection: locked decision

Status: **Decided. Implementation blocked on Bedrock access.**
Decided: 2026-07-25
Companion to [bedrock-claude5-access.md](bedrock-claude5-access.md), which tracks the access blocker.

---

## The decision

**Claude Opus 5 generates the four documents the user sends to an employer. Everything upstream stays on Claude Sonnet 4.6. Chat moves to Claude Haiku 4.5.**

This is locked. We implement it the day Bedrock access lands, not before. Nothing in this plan should be built speculatively against an account that currently returns 403 on every Anthropic model.

| Steps | What | Model | Change needed |
|---|---|---|---|
| 1-3 | Applicant extraction, JD parsing, metric extraction | **Sonnet 4.6** | merge 1+3 into one call |
| 4 | Skill matching and fit scoring | **Sonnet 4.6** | move rulebook to a cached system block |
| 5 | Fit assessment | **Sonnet 4.6** | none |
| 6 | CV optimization | **Opus 5** | full migration |
| 7 | Cover letter | **Opus 5** | full migration |
| 8 | Application email | **Opus 5** | full migration |
| 9 | Follow-up email | **Opus 5** | full migration |
| 10-11 | CV document parsing | **Sonnet 4.6** | none |
| 12 | Chat | **Haiku 4.5** | model ID only |
| 13-14 | Job feed synthesis and search strategy | **Sonnet 4.6** | none |

**Only four call sites migrate.** Ten stay exactly as they are: same model, same `temperature` values, same prompts, same `bedrock-runtime/converse` path, no regression risk.

---

## Why this shape

### Opus 5 on the documents

Opus 5 shipped 2026-07-24. The published benchmark that matches Karko's task class is **GDPval-AA v2**, which grades real-world professional deliverables with no single correct answer, scored by human experts. That is exactly what a tailored CV and cover letter are.

| Benchmark | Measures | Opus 5 | Sonnet 5 |
|---|---|---:|---:|
| **GDPval-AA v2** | human-graded knowledge work | **1,861 Elo** | 1,618 Elo |
| SWE-bench Pro | GitHub issue resolution | 79.2% | 63.2% |
| ARC-AGI-3 | agentic reasoning | 30.2% | not published |

A 243 Elo gap is roughly an 80% head-to-head win rate. SWE-bench Pro is the headline number everywhere and it is irrelevant to us, because Karko writes no code.

Opus 5 also has a **May 2026 knowledge cutoff** against Sonnet 5's January 2026, which is four months fresher on ATS conventions and hiring-market language, and a **512-token prompt-cache floor** against Sonnet 5's 1024, which means all four of our generation system blocks cache (the follow-up email block at 642 tokens would not cache on Sonnet 5).

The deciding principle is the project's own: *"Quality > speed > cost. Karko is a pre-revenue startup; perceived quality is the moat."*

### Sonnet 4.6, not Sonnet 5, upstream

Sonnet 4.6 is the most token-efficient model available to us short of Haiku. The context-window figures give it away: Sonnet 4.6 lists 1M tokens as **~3.4M characters**, the 5-family lists it as **~2.5M**.

| Model | chars/token | tokens vs 4.6 | list price | **cost for identical text** |
|---|---:|---:|---|---:|
| **Sonnet 4.6** | 3.4 | 1.00x | $3 / $15 | **1.00x** |
| Sonnet 5 (intro, to 2026-08-31) | 2.5 | 1.36x | $2 / $10 | 0.91x |
| Sonnet 5 (list) | 2.5 | 1.36x | $3 / $15 | **1.36x** |
| Opus 5 | 2.5 | 1.36x | $5 / $25 | 2.27x |
| Haiku 4.5 | 3.4 | 1.00x | $1 / $5 | 0.33x |

**Sonnet 5 at list costs 36% more than Sonnet 4.6 for the same work.** Same price per token, 36% more tokens. Once the introductory pricing ends on 2026-08-31 there is no cost argument for moving steps 1-5 to Sonnet 5, only a capability one, and these steps are already working in production.

### Haiku 4.5 on chat

Not primarily a cost call. `general_chat` has `maxTokens: 150`, and on any Claude 5 model adaptive thinking shares that budget, so it would return truncated or empty replies. Haiku 4.5 has no adaptive thinking, keeps `temperature`, and is correct on mechanics alone.

### Why not Haiku anywhere else

`extractVerifiedMetrics` and `computeSkillMatch` produce the **binding** lists that constrain every generated document. If a cheap model drops a real skill from a Master CV, that skill lands in VERIFIED MISSING and the CV prompt is then instructed never to mention it, anywhere. A cheap extraction error propagates into a worse CV silently, with no error surface. Extraction is not the low-stakes tier here, it is upstream of everything.

---

## Cost model

Prices per million tokens. Opus 5: $5 in / $0.50 cached-read / $25 out. Sonnet 4.6: $3 / $0.30 / $15. Haiku 4.5: $1 / $0.10 / $5.

Assumes a 3,000-char primary CV, 8,000-char master CV, 4,000-char JD, and a warm prompt cache. Static prompt sizes are measured from the prompt builders (see appendix); dynamic sizes are assumptions.

### Per step, after the optimizations below

| # | Step | Model | Input | Cached | Output | Cost |
|---|---|---|---:|---:|---:|---:|
| 1+3 | extraction (merged) | Sonnet 4.6 | 4,263 | 0 | 1,430 | $0.0342 |
| 2 | parse_job | Sonnet 4.6 | 2,085 | 0 | 588 | $0.0151 |
| 4 | skill_matching | Sonnet 4.6 | 5,999 | 2,874 | 515 | $0.0180 |
| 5 | fit_assessment | Sonnet 4.6 | 1,600 | 0 | 294 | $0.0092 |
| | **Phase 1 subtotal** | | | | | **$0.0765** |
| 6 | optimize_cv | Opus 5 | 18,542 | 12,762 | 4,500 | $0.1478 |
| 7 | cover_letter | Opus 5 | 10,987 | 7,587 | 1,100 | $0.0483 |
| 8 | write_email | Opus 5 | 4,441 | 2,441 | 650 | $0.0275 |
| 9 | follow_up | Opus 5 | 2,642 | 642 | 500 | $0.0228 |
| | **Phase 2 subtotal** | | | | | **$0.2464** |
| | **Total** | | | | | **$0.3229** |

Step 6 alone is 46% of the bill.

### Per billable action

| Action | Steps | Credits | Revenue | Cost | COGS |
|---|---|---:|---:|---:|---:|
| Fit analysis | 1-5 | 0.5 | $0.20 | $0.0765 | **38%** |
| Apply after fit | 6-9 | 2.0 | $0.80 | $0.2464 | 31% |
| Apply directly | 1-9 | 2.0 | $0.80 | $0.3229 | 40% |
| Full journey | 1-9 | 2.5 | $1.00 | $0.3229 | **32%** |
| Cover letter regen | 7 | 0.5 | $0.20 | $0.0483 | 24% |
| Email regen | 8 | 0.5 | $0.20 | $0.0275 | 14% |
| Follow-up regen | 9 | 0.5 | $0.20 | $0.0228 | 11% |

**The fit analysis is the number this decision fixed.** On Opus 5 it costs $0.209 against $0.20 of revenue, which is 105% COGS, a loss on every screen. Screening is also the flow users are meant to abandon, so most of those never convert to a paid application. Keeping Phase 1 on Sonnet 4.6 and merging the extraction calls takes it to $0.0765 and 38%.

### Against the alternatives

| Configuration | Cost / app | vs today | $5,000 runway |
|---|---:|---:|---:|
| All Sonnet 4.6 (today) | $0.210 | baseline | 23,800 |
| **Locked plan** | **$0.323** | **+54%** | **15,500** |
| Sonnet 5 front + Opus 5 docs | $0.402 | +91% | 12,400 |
| All Opus 5 | $0.456 | +117% | 11,000 |

### Cold cache

The numbers above assume cache hits. The default `cache_control` TTL is **5 minutes**, and at pre-revenue volume there will often be no request in the preceding five minutes.

| | Warm | Cold |
|---|---:|---:|
| Cost per application | $0.323 | $0.436 |
| $5,000 runway | 15,500 | 11,500 |

Plan against roughly **13,000 applications** as a blended figure, or about **7,700 free-user-months** at 4 credits each.

**Switch all cache blocks to `ttl: "1h"`.** The write premium rises from 1.25x to 2x and break-even moves from two requests to three, but one application per hour across all users is far more achievable than one per five minutes at our volume. This is a one-line change per block and is worth more today than any model-tier decision.

---

## Profit margin

Every tier prices credits identically: Plus $19.99 / 50, Max $79.99 / 200, credit pack $19.99 / 50. That is **$0.40 revenue per credit** everywhere.

### Margin per credit, by action

| Action | Credits | Cost | Cost / credit | **Gross margin** |
|---|---:|---:|---:|---:|
| Follow-up regen | 0.5 | $0.0228 | $0.046 | **89%** |
| Email regen | 0.5 | $0.0275 | $0.055 | **86%** |
| Cover letter regen | 0.5 | $0.0483 | $0.097 | **76%** |
| Apply after fit | 2.0 | $0.2464 | $0.123 | **69%** |
| Fit analysis | 0.5 | $0.0765 | $0.153 | **62%** |
| Apply directly | 2.0 | $0.3229 | $0.161 | **60%** |

Note that **Analyze-then-Apply is more profitable than Apply Directly**. Apply Directly re-runs all of Phase 1 inside the 2-credit action, while the Analyze-First flow charges 0.5 credits for that work separately and then reuses the cached context. The pricing already rewards the flow that is cheaper to serve, which is a good accident worth preserving.

### Margin per subscription

A representative usage basket at a 3:1 screening ratio (3 fit analyses per application): 3.5 credits at $0.4759, so **$0.136 per credit, 66% gross margin on LLM alone**.

Payment processing is the second line item. Stripe EEA rates run roughly 1.5% + €0.25 for European cards and around 3.25% + €0.25 international, so a blended **3-4% of revenue** is a reasonable planning figure pending real data.

**Plus, $19.99 for 50 credits:**

| Credit utilization | LLM cost | Stripe | Gross | **Margin** |
|---|---:|---:|---:|---:|
| 100% | $6.80 | $0.70 | $12.49 | **62%** |
| 70% | $4.76 | $0.70 | $14.53 | **73%** |
| 50% | $3.40 | $0.70 | $15.89 | **79%** |
| 30% | $2.04 | $0.70 | $17.25 | **86%** |

**Max, $79.99 for 200 credits:**

| Credit utilization | LLM cost | Stripe | Gross | **Margin** |
|---|---:|---:|---:|---:|
| 100% | $27.20 | $2.03 | $50.76 | **63%** |
| 70% | $19.04 | $2.03 | $58.92 | **74%** |
| 50% | $13.60 | $2.03 | $64.36 | **80%** |

Both tiers land in the same band because the credit price is identical. **Paid subscriptions run 62% margin at full utilization and 73-80% at realistic utilization.** That is healthy SaaS territory and it is not the problem.

### The free tier is the problem

Free is 4 credits per month against zero revenue.

| Free usage pattern | Cost |
|---|---:|
| 8 fit analyses | $0.61 |
| 2 full applications | $0.65 |
| Plus CV parsing on signup (one-time) | ~$0.04 |
| Plus daily job feed | **not measured** |

The job feed is the gap. It runs on-click in real time: SerpAPI searches, Azure `gpt-4.1-mini` ranking, plus `synthesizeCareerProfile` and `buildSearchStrategy` on Sonnet 4.6. None of that is charged against credits, and free users get the daily feed. **This needs measuring before the margin model can be trusted.** Working figure below is **$0.75 per active free user per month**, which assumes roughly $0.12 of uncharged feed cost. Treat it as an estimate, not a number.

### Blended margin, per 100 signups

Assumes Plus at 60% credit utilization ($4.78 all-in per paid user) and $0.75 per free user.

| Conversion | Revenue | Paid cost | Free cost | Gross | **Margin** |
|---:|---:|---:|---:|---:|---:|
| 3% | $59.97 | $14.34 | $72.75 | -$27.12 | **negative** |
| **4.7%** | $93.95 | $22.47 | $71.48 | $0 | **break-even** |
| 5% | $99.95 | $23.90 | $71.25 | $4.80 | 5% |
| 8% | $159.92 | $38.24 | $69.00 | $52.68 | 33% |
| 10% | $199.90 | $47.80 | $67.50 | $84.60 | 42% |
| 15% | $299.85 | $71.70 | $63.75 | $164.40 | 55% |

**Break-even sits at about 4.7% free-to-paid conversion.** Typical freemium SaaS converts at 2-5%, so the business sits directly on that line. This is excluding fixed infrastructure (Vercel, Supabase, Resend, SerpAPI base), which pushes the required rate higher.

**The free tier is a bigger margin lever than the entire model decision.** Halving it from 4 credits to 2 drops break-even from 4.7% to about **2.9%**, which moves the business from on-the-line to comfortably above it. For comparison, the whole Sonnet 4.6 vs Opus 5 choice on Phase 2 moves per-application cost by $0.10, while the free tier moves the break-even conversion rate by nearly two percentage points.

Options, in order of preference:

1. **Reduce free from 4 credits to 2**, or make the fourth credit earned rather than granted.
2. **Cap or throttle the free job feed** (weekly instead of daily, or fewer ranked results), once its cost is measured.
3. Leave it as is and accept that free tier is a customer-acquisition cost rather than a product tier, which is a legitimate choice if conversion is measured and above 5%.

### What the AWS credits actually buy

During the credit window, LLM cost is $0, so break-even conversion falls to roughly Stripe and infrastructure alone. **The credits do not change the unit economics, they postpone them by about 13,000 applications.**

The right use of that window is to **measure the two numbers this model is guessing at**: actual credit utilization per paid user, and actual free-to-paid conversion. Both are unknowns that swing blended margin from negative to 55%. Neither can be estimated from a spreadsheet. That is what the PostHog instrumentation in the checklist is for, and it should ship before the credits start burning, not after.

---

## Optimizations in scope

Three changes, all in the locked plan. None of them depend on model access, and all three cut latency as well as cost.

### 1. Merge steps 1 and 3 into a single call

`extractApplicantProfile` and `extractVerifiedMetrics` both read the **identical** combined CV (primary + master), both run pure extraction, and both emit JSON. Today the 11,100-character combined CV is sent twice, once per call.

- Saves ~3,265 duplicate input tokens
- Saves **$0.0104 per run**
- Removes one call from `Promise.allSettled` in the flow users hit first

The two prompts merge cleanly: one system prompt, one user prompt containing the CV once, one JSON response with a `profile` object and a `metrics` array. Downstream code reads `context.applicant` and `context.verifiedMetrics` from the same parse.

Keep the existing failure semantics. Applicant extraction is critical and must throw; metric extraction is non-blocking and defaults to `[]`. After merging, a partial parse should still yield the profile and fall back to an empty metrics array rather than failing the whole flow.

Files: [context-builder.ts:34](src/lib/agents/context-builder.ts:34), [context-builder.ts:602](src/lib/agents/context-builder.ts:602), [unified-writer-agent.ts:116](src/lib/agents/unified-writer-agent.ts:116), [unified-writer-agent.ts:265](src/lib/agents/unified-writer-agent.ts:265).

### 2. Move step 4's rulebook into a cached system block

`computeSkillMatch` carries a **9,773-character (2,874-token)** rulebook covering the tier hierarchy, the five-step scoring method, the universal-soft-skills list and the gap-detection rules. It is 100% static, identical on every request for every user, and it currently sits inside the **user** message, interleaved with per-request data, so it can never cache.

Moving it into a `systemBlocks` entry with `cache_control` puts it above Sonnet 4.6's 1024-token floor and saves **$0.0078 per run**. It is a pure code move with no prompt rewriting: cut the static text out of the template literal, leave the interpolated candidate and job data behind in the user prompt.

This is the only call site that passes a plain `systemPrompt` string while having enough static content to justify a cache block.

File: [context-builder.ts:311](src/lib/agents/context-builder.ts:311).

### 3. `ttl: "1h"` on every cache block

One line per block, five blocks. Converts misses into hits at low volume. See the cold-cache section above.

Files: [cv-prompt.ts:595](src/lib/agents/prompts/cv-prompt.ts:595), [cover-letter-prompt.ts:337](src/lib/agents/prompts/cover-letter-prompt.ts:337), [email-prompts.ts:218](src/lib/agents/prompts/email-prompts.ts:218), [email-prompts.ts:375](src/lib/agents/prompts/email-prompts.ts:375), [fit-assessment-prompt.ts:190](src/lib/agents/prompts/fit-assessment-prompt.ts:190).

### Combined effect on Phase 1

| | Cost | COGS @ $0.20 |
|---|---:|---:|
| Phase 1 today, unchanged | $0.0946 | 47% |
| Phase 1 with changes 1 and 2 | **$0.0765** | **38%** |

---

## Implementation checklist

Nothing here starts until Bedrock access lands.

### Blocked on access

1. **Build the `bedrock-mantle` client path** in [anthropic.ts](src/lib/models/anthropic.ts). Opus 5 rejects `InvokeModel` and `Converse`, so the existing `bedrock-runtime/converse` path cannot reach it. This is additive: the legacy path keeps serving steps 1-5, 10-14 untouched.
2. **Add a per-task `model` field to `MODEL_CONFIGS` and make it real.** The field already exists in [types.ts:68](src/lib/models/types.ts:68) and is ignored, because `anthropic.ts` resolves one global `MODEL_ID`. The locked plan needs three models in one request flow, so this has to become the routing key.
3. **Support two providers simultaneously.** Sonnet 4.6 runs on the larger production account via `bedrock-runtime`; Opus 5 would run on `514985057171` via `bedrock-mantle`. That is two credential sets and two endpoints inside a single application generation. The `AI_PROVIDER` switch cannot express this today. **Scope this before committing.** If the credits and the working entitlement end up on different accounts, the shape of this changes.
4. **Remove `temperature` from steps 6-9.** Rejected with a 400 on Opus 5. This is the largest single piece of work in the migration. It is load-bearing on these four calls specifically: 0.6 on the cover letter ("needs warmth and personality"), 0.55 on the application email ("emails need warmth"). That intent moves into prompt text and must be A/B'd against current output before shipping.
5. **Set `thinking` and `output_config.effort` explicitly on steps 6-9.** Never leave `thinking` unset on a Claude 5 model. **Never set `thinking: disabled` on Opus 5**: it can leak `<thinking>` tags into the visible response, which would break the brace-counting JSON extraction in [unified-writer-agent.ts:479](src/lib/agents/unified-writer-agent.ts:479). Use `effort: low` instead. Starting points: `medium` on steps 6-8, `low` on step 9.
6. **Raise `maxTokens` on steps 6 and 9.** Thinking now shares the budget. Step 6: 10000 → 16000. Step 9: 512 → 1500.
7. **Apply the Opus 5 prompt changes** (see next section).
8. **Run the eval** before flipping production: 20-30 real CVs across both languages, blind-scored on fabricated-claim rate, VERIFIED MISSING violations, bullet quality and German CEFR accuracy.

### Can start now

9. Merge steps 1 and 3 (optimization 1 above).
10. Move step 4's rulebook to a cached system block (optimization 2 above).
11. `ttl: "1h"` on all five cache blocks (optimization 3 above).
12. **Instrument cost-per-action in PostHog. Ship this before the credits start burning.** LLM cost tracking is already wired up. Three numbers the margin model is currently guessing at and cannot be derived from a spreadsheet: **actual credit utilization per paid user**, **actual free-to-paid conversion**, and **the uncharged cost of the free job feed** (SerpAPI + Azure ranking + the two Sonnet 4.6 calls). Blended margin swings from negative to 55% on those three.
13. **Delete `callModelStream` and `callAnthropicStream`.** No callers, verified by grep. Misleading, and the bearer-token branch inside `callAnthropicStream` silently falls back to non-streaming anyway.

---

## Opus 5 prompt changes for steps 6-9

Opus 5 is not a drop-in for these prompts. Three documented behaviors collide with the design.

**It writes longer.** The CV prompt enforces hard limits: max 15 bullets total, exactly 3-4 per role, max 5 skill categories, 5 items each, a 3-4 sentence summary, 2 pages. Opus 5 pushes against all of them, and lowering `effort` does **not** reliably shorten visible output. It has to be prompted. Add an explicit deliverable-length instruction and re-verify the 2-page constraint on real output.

**It expands scope.** It can add sections that were not requested. Against a CV schema with an open `customSections` array that is a live risk. Add the scope-discipline instruction to the CV and cover-letter system blocks.

**Our verification scaffolding is now counterproductive.** Opus 5 verifies its own work unprompted, and instructions telling it to verify cause over-verification with no capability gain. We have several: *"Perform this check as a final validation step before outputting"*, *"THE FABRICATION TEST: Before writing ANY number in a bullet, search the Primary CV and Master CV for that exact number"*, and the CV-fit assessment binding reinforcement.

Anthropic's guidance is to delete them. **Do not delete them blind.** They are load-bearing in an anti-hallucination system where a false negative reaches an employer. Test removal on a held-out set, measure fabricated-claim rate before and after, and keep them if the rate moves at all. This is the one place where following the migration guide literally could cost us the thing the product is built on.

---

## Open risks

**Access is unresolved and has no ETA.** Account `514985057171` returns 403 on every Anthropic model and 401 on every OpenAI model, with all Anthropic quotas pinned to 0 and no AWS support channel (Basic plan). This plan is contingent on that clearing. See [bedrock-claude5-access.md](bedrock-claude5-access.md).

**~~Check the AWS credit expiry date.~~ Resolved 2026-07-25: credits expire in 2028.** Roughly two years of runway, so the credit window is not a constraint on this plan.

**~~Bedrock pricing is not verified.~~ Resolved 2026-07-25: Bedrock matches first-party.** Claude Opus 5 on Bedrock is **$5 / $25 per MTok with cache reads at $0.50**, identical to the Anthropic API. Every cost figure in this doc holds. Two Bedrock-specific caveats below.

**Opus 5 is not open-access on Bedrock.** Claude Fable 5, Opus 4.8, Opus 4.7, Sonnet 5 and Haiku 4.5 are documented as "open to all Amazon Bedrock customers." **Claude Opus 5 is not.** Its access column says "See Access", meaning Bedrock sets criteria per model and they must be checked in the console. So clearing the current account-level 403 may not be sufficient on its own; Opus 5 could need a separate approval. Worth naming Opus 5 explicitly in the escalation to `bedrock-ant-eap@amazon.com` rather than asking for generic offering access.

**Regional endpoints carry a 10% pricing premium.** Global endpoints have no premium. Karko is German-market and CVs are heavily personal data, so if GDPR posture requires EU data residency we would use an EU inference profile or a regional endpoint. The docs distinguish regional endpoints (single region, +10%) from inference profiles (multi-region within a geography) without stating whether the profile carries the premium. **Confirm before sizing.** If +10% applies, the locked plan goes from $0.323 to about $0.355 per application, which does not change the decision.

**Batch API is unavailable on Bedrock**, so the 50% batch discount is not reachable. Not a loss for us: every Karko step is user-blocking and could not use batching anyway.

**Bedrock quota is 2M input TPM by default**, raisable to 4M without further Anthropic approval. That is far above what we need and a non-issue once entitlement clears.

**Step 4 stays on Sonnet 4.6, and the A/B decides whether it stays there permanently.** The reasoning for keeping it: Sonnet 4.6 produces good output today, and Opus 5 *receives* the skill match and fit assessment as context before writing, so it is a downstream consumer of that work rather than a replacement for it. That is sound.

The specific risk to test is narrower than "is the output good." VERIFIED MISSING is a **hard exclusion list**: the CV prompt states that a skill on it "MUST NOT appear anywhere in the CV," and reinforces that with a final cross-check. So a **false positive** in that list (a skill the applicant genuinely has, wrongly classified as missing) is something Opus 5 is *forbidden* to correct, no matter how capable it is. Extra capability sits downstream of a hard constraint and cannot recover from a bad one.

**Eval design for this specifically:** for each test CV, take the MISSING list `computeSkillMatch` produced and have a human check how many of those skills actually appear in the source documents. That false-positive rate is the metric, not overall CV quality. If it is at or near zero, step 4 stays on Sonnet 4.6 permanently and this risk closes. If it is not, promoting step 4 to Opus 5 costs about **+$0.02 per application**.

**Sonnet 4.6 is now a legacy model.** It will be deprecated eventually, typically with 6-12 months notice. This arrangement is not permanent and steps 1-5 will need the same migration later.

**Mixed tokenizers in one flow.** Steps 1-5 run at 3.4 chars/token, steps 6-9 at 2.5. Any cost accounting or token-budget logic has to know which. Relevant to the PostHog instrumentation in item 12.

---

## Appendix: how the model is actually used

### All 14 Claude call sites

The job feed's ranker is separate (Azure OpenAI `gpt-4.1-mini`, [openai-ranking.ts](src/lib/job-feed/openai-ranking.ts)) and out of scope.

| # | Step | Task type | temp | maxTokens | System caching |
|---|---|---|---|---|---|
| 1 | `extractApplicantProfile` | `extract_applicant` | 0.3 | 4096 | plain string, none |
| 2 | `parseJobDescription` | `parse_job` | 0.3 | 4096 | plain string, none |
| 3 | `extractVerifiedMetrics` | `extract_metrics` | 0.2 | 2048 | plain string, none |
| 4 | `computeSkillMatch` | `skill_matching` | 0.1 | 2048 | plain string, none |
| 5 | `generateFitAssessment` | `fit_assessment` | 0.4 | 400 | cacheable block |
| 6 | `generateOptimizedCVData` | `optimize_cv` | 0.5 | 10000 | cacheable block |
| 7 | `generateCoverLetter` | `write_cover_letter` | 0.6 | 2048 | cacheable block |
| 8 | `generateApplicationEmail` | `write_email` | 0.55 | 1024 | cacheable block |
| 9 | `generateFollowUpEmail` | `write_follow_up_email` | 0.5 | 512 | cacheable block |
| 10 | `parseDocumentAsCV` | direct | 0.3 | 8192 | none |
| 11 | `parse-cv` text fallback | direct | 0.3 | 8192 | none |
| 12 | `general_chat` | `general_chat` | 0.7 | 150 | none |
| 13 | `synthesizeCareerProfile` | direct | const | const | none |
| 14 | `buildSearchStrategy` | direct | const | const | none |

**Every step is user-blocking.** `callModelStream` and `callAnthropicStream` have no callers outside [index.ts](src/lib/models/index.ts). They are dead code. The SSE stream in `/api/agent-v2` carries step-level progress events, not tokens. The user sits on a spinner for each full completion, so latency compounds along the critical path.

- **Analyze First** (`runFitAnalysis`, 0.5 credits): steps 1+2+3 in parallel, then 4, then 5. Three sequential hops. **Two after the merge.**
- **Apply for This Job** (`runWithContext`, 2.0 credits): steps 6+7+8 in parallel, then 9. Two sequential hops.
- **Apply Directly** (`runJobCopilot`, 2.0 credits): both phases back to back. Five sequential hops, four after the merge.

### Measured static prompt sizes

Character counts are exact, read from the prompt builders. Token counts are derived at each model's chars/token ratio. No live `count_tokens` call was possible (see below).

| Static block | chars | tok @ 3.4 (4.6) | tok @ 2.5 (Opus 5) |
|---|---:|---:|---:|
| CV optimization system | 31,906 | 9,384 | **12,762** |
| Cover letter system | 18,968 | 5,579 | **7,587** |
| Skill-match rulebook (in user prompt) | 9,773 | **2,874** | 3,909 |
| Application email system | 6,102 | 1,795 | **2,441** |
| `parse_job` static | 3,091 | **909** | 1,236 |
| Fit assessment system | 2,689 | **791** | 1,076 |
| `extract_applicant` static | 2,133 | **627** | 853 |
| Follow-up email system | 1,604 | 472 | **642** |
| `extract_metrics` static | 1,263 | **371** | 505 |

Bold is the ratio that applies under the locked plan.

### Prompt cache floors, and two dead markers

The minimum cacheable prefix is model-dependent and fails **silently** when the prefix is too short. No error, just `cache_creation_input_tokens: 0`.

| Block | Model under plan | tok | Floor | Caches? |
|---|---|---:|---:|---|
| CV optimization | Opus 5 | 12,762 | 512 | yes |
| Cover letter | Opus 5 | 7,587 | 512 | yes |
| Application email | Opus 5 | 2,441 | 512 | yes |
| Follow-up email | Opus 5 | 642 | 512 | yes |
| Fit assessment | Sonnet 4.6 | 791 | 1024 | **no** |
| Skill-match rulebook | Sonnet 4.6 | 2,874 | 1024 | yes, after optimization 2 |

The follow-up email block is a good illustration of why Opus 5's lower floor matters: at 642 tokens it caches on Opus 5 and would **not** on Sonnet 5.

The fit assessment block stays dead under this plan. At 791 tokens it is below Sonnet 4.6's 1024 floor, so its `cache_control` marker is a no-op today and remains one. It is worth $0.002 per run, so it is not urgent, but the marker should either be removed or the block padded past the floor so the code stops implying a cache that does not exist.

### Bedrock caching mechanics

The bearer-token path converts `cache_control` markers to Converse `cachePoint` entries in [anthropic.ts:104](src/lib/models/anthropic.ts:104). That is correct for the legacy Sonnet 4.6 path. The new mantle path uses standard Anthropic `cache_control` directly, so the conversion is only needed on the legacy branch.

---

## Rejected: OpenAI on Bedrock

GPT-5.6 models carry 10-20M TPM quotas on `514985057171` while every Anthropic quota is zero, which made them look like a live fallback. **They are not callable.** Tested directly with SigV4 on 2026-07-25:

```
POST https://bedrock-mantle.us-east-1.api.aws/openai/v1/responses

openai.gpt-5.6-terra  -> 401 access_denied
  "openai.gpt-5.6-terra is not available for this account."
openai.gpt-5.6-luna   -> 401 access_denied  (same)
openai.gpt-5.6-sol    -> 401 access_denied  (same)
```

`GetFoundationModelAvailability` rejects all three IDs as invalid while returning all-green for `anthropic.claude-sonnet-5`, and `ListFoundationModels` does not list them. The IDs are real upstream, since `/v1/chat/completions` returns "does not support this API" rather than "does not exist", so this is an entitlement gap and not a naming error.

**The nonzero quotas are AWS default published values, not grants.** The account is not enrolled in the mantle offering for any vendor. If an OpenAI fallback is ever genuinely needed, Azure AI Foundry is the working path (the job feed ranker already runs there), not Bedrock.

---

## Sources

- [Models overview](https://platform.claude.com/docs/en/about-claude/models/overview), fetched 2026-07-25: pricing, context windows, knowledge cutoffs, effort defaults, chars-per-token figures
- [Migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide), fetched 2026-07-25: Opus 4.8 to Opus 5 breaking changes, effort guidance, temperature rejection
- [Claude Opus 5 vs Sonnet 5](https://codersera.com/blog/claude-opus-5-vs-sonnet-5-2026/) and [Opus 5 benchmark roundup](https://tech.yahoo.com/ai/claude/articles/claude-opus-5-outscores-fable-182843985.html): GDPval-AA v2, SWE-bench Pro, ARC-AGI-3, Frontier-Bench, Opus 5 launch date
- [Claude in Amazon Bedrock](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock), fetched 2026-07-25: mantle endpoint, per-model access criteria, regional endpoint premium, unsupported features, quotas
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/) and [Claude Opus 5 pricing](https://aireiter.com/blog/claude-opus-5): Bedrock Opus 5 at $5 / $25 with $0.50 cache reads, matching first-party
- Prompt caching reference: per-model minimum cacheable prefix table
- Live SigV4 probe against `bedrock-mantle.us-east-1.api.aws`, 2026-07-25
- `aws service-quotas list-service-quotas --service-code bedrock`, account `514985057171`, 2026-07-25
- Prompt sizes measured directly from `src/lib/agents/prompts/` and `src/lib/agents/context-builder.ts`

**Not measured:** no live `count_tokens` call was possible. Bedrock is 403 on this account, the `ant` CLI is not installed, and `.env.local` is off-limits per project rules. Token counts are derived from documented chars-per-token ratios, not measured. Re-baseline with `count_tokens` once access lands.
