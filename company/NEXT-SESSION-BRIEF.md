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

## The one job left

**Pull the outcome evidence.** This is the single most valuable thing outstanding, and it needs the Supabase connection that this directory has.

Everything strong in the pack routes back to one person: the founder. He was hired as an AI Specialist through an application Karko itself wrote, after 60+ applications and 5 interviews. Powerful, but n=1. Beyond him there is one paying customer and roughly 5 to 10 early users who had free access as design partners, with no recorded outcomes.

### Query Supabase for

1. **Lifetime signups.** Total registered users, and by month if cheap.
2. **Total applications generated.** Count of completed full-application runs, all time. Table to look at: `application_sessions`, cross-check against `credit_transactions`.
3. **Total fit analyses run.**
4. **Total CVs parsed / uploaded.**
5. **Active users by month**, to see the real shape rather than PostHog's weekly window.
6. **Free-to-paid conversion**, if signups and `subscriptions` can be joined. This is the number §6.2 says the whole business turns on, and it is currently a guess.
7. **Credit utilization per paid user.** Also currently a guess, and it swings the margin model.

### Why it matters

It converts *"about 120 people reach the site in a typical week"* into *"X people have generated Y real applications"*. That is a categorically better sentence, and it is the difference between a product that sounds like a demo and one that sounds like it is being used.

Items 6 and 7 additionally replace the two biggest assumptions in the unit-economics model (§6.2).

### Then update

- §8 traction table, with a fresh PostHog pull alongside.
- §6.2, replacing modelled conversion and utilization with measured figures if they exist.
- The progress bullets and the "how far along" answer in the answer bank.
- Open items 1, 1b, 2 in §12.

## The human task that only Wasim can do

Message the design partners and the paying customer. One question: **did you get an interview or an offer using Karko documents, and can I say so?**

A single yes takes the evidence base from n=1 to n=2 and gives any application its second-best sentence after the founder's own hire. Nothing in the codebase substitutes for this.

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
