# Next session brief

**Written 2026-07-25.** Read this first if you are picking up the Karko AI company documents cold.

---

## What exists

Two documents in this folder, both current and both merged to `main`:

| File | Purpose |
|---|---|
| `KARKO-AI-SOURCE-OF-TRUTH.md` | The fact layer. Company, entity, cap table, founder, product, unit economics, technology, traction, market, risks, fundraising position. |
| `APPLICATION-ANSWER-BANK.md` | The writing layer. Ready-to-paste answers for YC, other accelerators and investors. Landmines and a pre-submit checklist. |

Every claim is tagged **[V]** verified, **[R]** research not independently confirmed, **[self-reported]**, or **[?]** open. **Respect these tags.** Do not promote an `[R]` to a fact without checking it, and never put one in front of an investor unchecked. Two of them turned out to be wrong when checked, and one bad citation nearly went into a YC application.

## Done on 2026-07-25: the Supabase pull

**The outcome evidence has been pulled.** It lives in **§8.4** (usage, monthly shape, the activation ladder, the paying customer) and **§6.2a** (conversion and utilization). §8.2, §12 and the answer bank were updated to match.

**The headline, and it is not the one anybody expected.** The volume numbers are dominated by the founder: 202 applications and 304 fit analyses all time, of which 191 and 296 are internal. The number that describes other people is **11 applications by 8 users**, out of 27 external signups. And **the one paying customer has used 0 of 50 credits and has not returned since the day they paid.**

Three consequences:

1. **The raw totals are now the most dangerous numbers in the pack.** "202 applications generated" is true and would be caught in a minute. §8.2 and answer-bank landmines 16 to 18 exist to stop that.
2. **Credit utilization was the wrong variable to model.** Paid users are not burning margin, they are not activating. §6.2a explains what to model instead.
3. **The activation story got better, not worse.** It is no longer just "visitors bounce off the landing page". The ladder shows 18 people uploaded a CV and 10 of them never generated anything. That is narrower and more fixable, and it is a stronger thing to say in an application than a vague funnel complaint.

**Still not done: the PostHog refresh.** There was no PostHog access in that session, so §8's funnel block is still the 2026-07-21 pull. It is now §12 item 6.

### What the numbers do not tell you

Nothing in the database records an **outcome**. It knows a document was generated. It does not know whether anybody got an interview. That is still the gap below, and no query closes it.

## The human task that only Wasim can do

Message the design partners and the paying customer. One question: **did you get an interview or an offer using Karko documents, and can I say so?**

A single yes takes the evidence base from n=1 to n=2 and gives any application its second-best sentence after the founder's own hire. Nothing in the codebase substitutes for this.

**§8.4 narrowed the target list.** Only 8 external people have ever generated a full application, and only 3 generated more than one. Those 3 are the best odds. Ask all 8.

**Ask the paying customer a different question.** They paid four minutes after uploading a CV and then never used it. The question there is not "did you get an interview", it is "what stopped you". Renewal is 9 August, so this one has a clock on it.

## What is still open

See §12 of the source of truth for the full list. The three that matter:

1. **A distribution thesis.** Two independent reviewers called this the real hole. Consumer subscription lives or dies on a channel and the current answer is one line about influencer marketing.
2. **Outcome evidence beyond the founder.** Above.
3. **One institutional conversation** (university careers service, bootcamp, outplacement) to make the §9.9b expansion thesis credible rather than aspirational.

## Decisions already locked, do not relitigate

- **Free tier drops from 4 credits to 2**, which is one full application, and it ships **before** the Opus 5 migration. Sequencing matters: it creates the headroom the migration consumes. Implementation surface is listed in §6.4 and it sprawls across roughly a dozen files.
- **Opus 5 migration** for the four documents a user sends. Blocked on AWS Bedrock returning 403.
- **Solo founder.** Brothers come in after funding, and they stay out of application forms.
- **Karko does not auto-apply.** This is a considered strategic position, not a missing feature. See §9.7.
- **Equity on any form is 100%**, not 70%. There is no option pool.

## Operational gotchas

- **`/reload-plugins` destroys MCP OAuth sessions.** It cost four attempts to connect Stripe. Authorize first, then do not reload.
- The repo is `wasimjalali/Karko`. Work on a branch, never commit to `main`.
- House voice: **no em dashes**, contractions, short sentences, no Oxford comma. Grep for `—` before committing.
- Numbers sprawl. When you change a figure, grep the whole repo including `public/llms.txt`, `public/llms-full.txt`, `FEATURES.md` and `KARKO_POSITIONING.md`. A job-feed limit that looked like it lived in 6 places actually lived in 13.
