# Kickoff prompt for the backend build session

Paste everything below the line into a fresh session.

---

You are implementing the backend gaps for Useful Apply on branch
`rebrand/usefulapply`. `main` is off limits: no PR, no merge. Staging is
https://usefulapply.com, deployed from this branch at version `fdd834f5`.

Read `docs/ux-audit-2026-08-18/redesign/build/BACKEND-DECISIONS.md` first. It is
the locked decision log: twenty decisions, each with what was decided and why.
Then read `BACKEND-GAPS.md` in the same directory for the underlying detail on
any entry you are about to build, and `SWEEP-HANDOFF.md` for what already
landed. All three are current as of 20 August 2026.

**The decisions are locked. Do not reopen them.** If building one shows the
decision was wrong, stop and say so with the evidence rather than quietly
choosing differently. That has already happened once and it is how A7 and A8
got caught.

## Step 0, before you write any code

Diff section A of the decision log against `git log` since 18 August. The log
and the code have already diverged once: A7 was recorded as "decided but never
built" when it had shipped in `433c0ccd`, and rebuilding it would have pushed
the Free tier to three SerpAPI calls a day. Assume there is another one. Report
what you find before you start.

## One item is not cleared to build

**A8 needs Wasim to confirm before you touch it.** The version he approved was
reversed by the review: deleting the pagination pass would break the Free
tier's thin-day rescue (`ingestion.ts:445-446`). The corrected proposal is to
keep both passes and give Plus and Max a reserve call each, which raises the
daily query count and needs sign-off per `constants.ts`. If he has not answered,
skip it.

## Build order

1. **A15, B3, A14, and A16 if there is room.** The data-loss cluster. One code
   neighbourhood: `useSessionStore`, `useSupabaseSync`, the tracker. None of it
   touches a fence.
2. **A12, B1, B2, A11.** Correctness and compliance. A12 first, because the
   free run path records a consent the user never gave.
3. **A7 verification.** One live Free run to confirm what already shipped, then
   close the entry.
4. **B4 to B12.** The honesty pass, mostly copy plus one shared balance fetch.
5. **The migration batch.** A3's counter, A6's ceiling, B10's typed column and
   C3's pending production migration, as one pass.

Stop after each numbered group, report, and let Wasim decide whether to
continue. Do not run all five in one go.

## Rules

Surgical edits only. npm only, no new packages. Do not touch Stripe
webhook or credit-deduction logic, D1 schema or migrations, Better Auth config,
or `src/lib/agents/**` prompts without asking. B12 is the one Stripe exception:
Wasim approving the decision log is the nod for those three URL strings.

Copy rules on any user-facing string, and in docs and commit messages too: no em
dashes, contractions, short sentences, no filler, "X, Y and Z".

## Before calling anything done

`npx tsc --noEmit` must be 0 errors, and `npm run lint` must not exceed 72
errors and 60 warnings. tsc OOMs on the default Node heap on this machine, on a
clean `HEAD` too, so run it as
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`.

Deploy with
`NEXT_PUBLIC_SITE_URL=https://usefulapply.com NEXT_PUBLIC_SITE_STAGE=staging npm run deploy:cf`
and verify on staging in the browser. Deploys have failed on transient
Cloudflare errors before and worked on a straight retry.

Never run INSERT, UPDATE or DELETE against the remote database.

Commit in logical chunks with conventional commits and push to
`rebrand/usefulapply`.

## Four habits that carried the work so far. Keep them.

**Check every agent finding against the code before acting on it.** Five of
thirty-three did not survive that check in one session. In the next, a review
of the locked decisions produced five findings and all five held, including two
that reversed a decision the founder had already approved. Neither would have
been caught by reasoning about it.

**Measure against the real database instead of reasoning about it.** That has
already caught a 97-row email blast, a glued-list rule that did nothing across
41 ads, a Free SerpAPI rescue that could never fire, an overwrite rule that
would have destroyed the wrong CV in four of six cases, and 16 job-feed
generation rows that showed nobody had ever hit the credit gap being fixed.

**Check the clock before trusting a cron result.** One reading of zero sent
rows was just the 08:00 UTC sweep not having run yet.

**Do not use "it is a schema change" as a reason to avoid the right fix.** That
argument was used twice in the decision log. It was factually wrong once and
would have produced an unenforceable cap the other time. The fence on
migrations is about approval, not avoidance. Batch them and ask.
