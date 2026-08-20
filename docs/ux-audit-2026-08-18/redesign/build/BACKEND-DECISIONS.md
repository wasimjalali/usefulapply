# Backend gaps: the decision log

**Written 20 August 2026, then locked the same day.** Branch
`rebrand/usefulapply`. This is the companion to `BACKEND-GAPS.md`: that file
records what is missing, this one records what was decided and why.

**Status: locked, nothing outstanding.** Wasim accepted every recommendation on
20 August except A6, which he set to free. A `fable` agent then reviewed the
locked set, and five of its findings were verified against the code and folded
in. Those five are marked **REVISED** below, with what changed and what it was
checked against.

One of them, A8, reversed a recommendation Wasim had already approved. He then
ruled generally: where the review's version is the correct one, the review's
version wins over what he had already said yes to. A8 is settled on that basis
and is cleared to build.

Thirty-eight entries are still open in `BACKEND-GAPS.md`. They split three ways:

- **A. Twenty needed a decision from Wasim.** All twenty are answered. A8 is
  the one exception and needs him to confirm the corrected version.
- **B. Twelve need no decision.** There is one right answer and I can build it.
  Listed so nothing is lost, not so anything is debated.
- **C. Six are blocked on something outside the code.** A recording, a
  screenshot, a production migration window.

The three security and money gaps are already closed. See `SWEEP-HANDOFF.md`.

---

## A. The twenty decisions, locked

### Money and pricing

**A1. Does an instructed rewrite cost the same as a plain one?**
Today "make the cover letter shorter, keep the churn number" never reaches the
writer. Wiring it up is medium work. The question is the price.
**Recommend: keep it 0.5, the same as any rewrite.** It is the same model call.
A second price for the same work is one more number to explain, and the
instruction is what makes the rewrite worth buying.

**A2. What does a CV-only rewrite cost?**
There is no way to re-tailor just the CV. The only route is a full kit at 2.0,
which rewrites everything. `CV_OPTIMIZATION: 1` already sits in
`src/lib/credit-costs.ts` and nothing charges it.
**Recommend: 1 credit.** Half a kit for a third of the work reads fair, and the
constant is already there waiting.

**A3. Do screening answers cost credits?**
They are free today, capped at 5 turns per application by the client, which
means the cap is not really there. A user who edits the request gets unlimited
turns.
**Locked: free, with a real server-side cap. REVISED.** Screening answers are a
retention feature. A 0.25 charge per turn makes people count turns, which is
the opposite of what you want before there is revenue.

The revision is the cap. Both candidate signals are client-controlled:
`_screeningUsageCount` rides inside `generated_cv`, which the client writes
wholesale (`useSupabaseSync.ts:85`), and the chat route's per-session limit
counts client-supplied history. A cap reading either is a cap the client can
reset. A real one needs a server-owned counter the chat route increments, which
means a column. Batch that migration with A6's cap, B10's typed transaction
column and the pending production migration in C3, so production takes one
migration pass and not three.

**A4. Is a re-rank free?**
Asking the feed for "only remote" filters today's list rather than re-ranking
it. A real re-rank costs one Workers AI call and no SerpAPI.
**Locked: free, capped at five a day.** The daily limit exists to protect
SerpAPI spend, and a re-rank does not touch it. This is the thing that makes
the feed feel steerable instead of fixed, and it costs fractions of a cent.

**Build constraint, added after review.** The re-rank must update
`job_feed_ranked_items` rows in place. A delete-and-reinsert nulls every
generation row's `ranked_item_id` through the FK (`schema.ts:898`), so a user
mid-way through "check fit, re-rank, generate" loses the pointer. D1 has no
interactive transactions either, so a rewrite can be observed half-done.

**A5. Does the tracker chat get a ceiling?**
Every message there is an LLM call with no price and no cap.
**Recommend: leave it free, same as the kit chat.** The calls are small and two
different rules for two chat boxes is the kind of inconsistency users notice.

**A6. What does "Prep me for X" cost, if we build it?**
The chip is a hand-off today. Real interview prep needs a prompt and a price.
**Locked: free, on a cheaper model** (Wasim, 20 August). It stays scheduled
rather than squeezed into a backend pass, because it touches the agent prompts.

**REVISED:** free makes it the only unbounded heavy generation in the product,
so it needs a per-application or per-day ceiling. Same server-owned counter as
A3, same migration batch.

**A7. The Free SerpAPI rescue call is already built. REVISED, do not rebuild.**
This entry said it was decided last session but never built. That was stale.
It shipped in `433c0ccd`. `JOB_FEED_FREE_TIER_LIMITS` in `constants.ts` reads
`maxDailyQueries: 2, maxMainQueries: 1`, with a comment crediting Wasim on 20
August, and `server.ts` passes `maxMainQueries` into ingestion, so the reserve
is live.
**Locked: verify with one live Free run, then close the entry.** Building it
again would either duplicate shipped work or, worse, push Free to three calls
on top of the reserve that already exists.

**A8. Keep both passes, and give Plus and Max a reserve call. REVISED, and
cleared.**
The original recommendation was to reserve a call for the fallback pass and
delete the pagination pass, on the reasoning that "pagination just fetches more
of a query that already worked". That reasoning is wrong and Wasim approved it
before it was caught.

Checked in `ingestion.ts`: line 445 sends zero-result lanes to the fallback
pass and skips them for pagination, line 446 skips lanes at or above
`JOB_FEED_THIN_RESULT_THRESHOLD` (5). So pagination is what handles a lane that
came back with 1 to 4 jobs. On Free, which runs one main query, that is the
thin-day rescue. Deleting it would leave a Free user with 3 jobs in a top-5
feed and an unspent reserve call.

The two passes are mutually exclusive per lane and share one budget, so
pagination costs nothing extra. Keep both.

The real question underneath was never asked plainly: **Plus and Max have no
reserve at all.** Both run `maxMainQueries === maxDailyQueries` (2/2 and 4/4 in
`constants.ts`), so `extraCallsRemaining` is zero and neither extra pass can
ever fire for a paying user. Giving them Free's shape is +1 `maxDailyQueries`
each, spent only on an empty or thin day.
**Locked: yes, +1 on each paid tier.** Plus goes to `maxDailyQueries: 3,
maxMainQueries: 2`, Max to `maxDailyQueries: 5, maxMainQueries: 4`. The extra
call is only spent on an empty or thin day, so a normal day costs what it costs
today. It is the failure a paying user feels most, and at four paid accounts
the worst case is a handful of extra calls a day.

This raises the daily query count, which `constants.ts` says needs explicit
sign-off. Wasim gave it on 20 August, after the corrected version was put to
him with the cost stated. Update the comment in `constants.ts` to record that,
the way the Free reserve comment already does.

**A9. The design promises "ten searches", reality is two on Plus and one on
Free.** Either raise the daily query budget, which is real money per call, or
keep the copy honest as it is now.
**Recommend: keep the copy honest.** Revisit when there is revenue to spend.

**A10. Does the feed get a morning cron?**
The old "Run today" control is gone and the feed runs on a click.
**Recommend: no cron. Close this as decided.** A cron pays SerpAPI for every
user every day, including the ones who never open the app. On-click spends
money only when someone is actually looking.

### Security and policy

**A11. How do we close `NEXT_PUBLIC_ENABLE_JOB_FEED_DEBUG`?**
It is a `NEXT_PUBLIC_` variable, so it is inlined into the client bundle and
set through public config, and it unlocks a route that forces a feed run past
the cooldown and spends SerpAPI and ranking budget. It is set nowhere today, so
the route 404s, but the gate is the wrong shape.
**Recommend: a server-only secret checked as a header.** `NODE_ENV !==
'production'` also closes it, but it takes away the ability to force a run
against production data from a deployed environment, which is worth keeping.

**A12. Can consent be withdrawn?**
The feed asks once and there is no way back. `PUT /api/job-feed/settings` keeps
any stored `consent_accepted_at` and silently ignores a payload that clears it.
**Locked: build it. REVISED, and it is bigger than "small".** The company is in
Germany and the imprint says so. Consent you cannot withdraw is a compliance
problem, not a UX nicety.

Two things the original sizing missed, both verified:

- **Free users have no route to withdraw at all.** `PUT /api/job-feed/settings`
  403s anyone not on plus or max (`settings/route.ts:38`). GDPR does not care
  about the plan, so the withdrawal control cannot live behind that gate.
- **The free path invents the consent record.**
  `getOrProvisionFreeJobFeedSettingsAdmin` stamps
  `consent_accepted_at: new Date().toISOString()` unconditionally when it
  provisions settings (`server.ts:152`), and the run route calls it on a free
  user's first run (`server.ts:1191`) with no consent assertion in the request.
  The UI shows a chip, but a direct POST to `/api/job-feed/run` records a
  consent the user never gave. A server-invented timestamp is not a
  demonstrable grant.

Scope: a tier-agnostic withdrawal endpoint that clears `consent_accepted_at`
and sets `enabled: false`, plus the free run path requiring an explicit
`consent_accepted` field before it provisions anything.

**A13. Two-factor authentication.**
Recorded as dropped, not deferred.
**Recommend: leave it dropped and keep the row off the settings pane.** This
matches what you already told me. Listed here only so it is not rediscovered as
an open question.

### Data and deletion

**A14. Deleting an application: single row or bulk, soft or hard?**
There is no way to delete an application at all. The whole server chain is
intact and orphaned.
**Locked: single row, hard delete, plain confirm. REVISED.** Bulk select is a
power feature for a product with 115 applications in total. Hard delete matches
how everything else in this app behaves and avoids a `deleted_at` filter on
every query forever.

The revision is the confirm. A typed DELETE is ceremony that belongs on account
deletion, not on one application out of 115. A plain confirm matches the weight
of the action.

Verified safe: chat messages (`schema.ts:415`) and generation rows
(`schema.ts:902`) cascade, feed feedback goes `set null` (`schema.ts:852`), so
the applied or dismissed record survives the delete and the job does not
resurface in the feed.

**A15. What happens when the tracker and the session store disagree?**
Clicking a tracker row whose id is not in the store blanks the kit with no
message.
**Recommend: fetch the session on demand.** The row is in D1, the store just
has not loaded it. Refusing to navigate would be telling the user about our
bug.

**A16. How do saved jobs survive the 7 day retention delete?**
Every write authorises through a live `job_feed_ranked_items` row, and cleanup
deletes those 7 days after their run. So a saved job is still on screen and
every action on it 404s.
**Locked: exempt saved jobs from the retention delete. REVISED reasoning.** The
decision stands. The reason given first was wrong and must not be reused: it
claimed the alternative meant making `ranked_item_id` nullable and weakening
the authorisation model. That column is already nullable (`schema.ts:898`, no
`.notNull()`, `onDelete: 'set null'`) and cleanup already nulls it nightly.

The real argument is two-fold. It is less code, because
`authorizeJobFeedJobActionAdmin` does not change. And the ranked row is what
the just-closed "Why it's a match is empty on saved jobs" fix joins against, so
deleting it loses the match reason on saved jobs even if authorisation is
fixed.

One addition to the spec: unsaving a job has to re-expose its rows to cleanup,
or bookmark churn leaves rows alive forever.

**A17. Do screening answers get their own column?**
They ride inside `generated_cv` JSON today and survive reload fine.
**Recommend: keep the embed.** A migration now is speculative. Add the column
when something outside the kit needs to read them.

**A18. Does the feed conversation survive a reload?**
It does not persist anywhere.
**Recommend: day-keyed localStorage, not a table.** It is a daily feed and the
conversation is about today's list. A table means a schema change plus cleanup
for something that is stale tomorrow.

### Product surface

**A19. Do the two dead notification toggles get senders, or come out?**
Two of the five toggles control nothing.
**Recommend: take them out until the senders exist.** Same call you made on
`notify_feed_ready` last session. A toggle that controls nothing is a lie the
user cannot detect.

**A20. When does checkout fire for a plan clicked on the landing page?**
The tier is dropped at sign-up today, so someone who picks Plus on the landing
lands on a Free account with no memory of what they clicked.
**Locked: carry the tier through, but not through the verification callback.
REVISED.** Dropping the param would waste the landing's main upgrade entry, so
the direction stands.

The mechanics change. Firing checkout "right after email verification" puts the
trigger inside the Better Auth verification flow, which is fenced, and
verification often happens on the phone that opened the email rather than the
desktop the user signed up on. Persist the chosen plan server-side at sign-up
instead, and surface checkout as a one-time prompt on the first authenticated
dashboard load. Same intent, no fenced auth surgery, works whichever device
verified.

---

## B. No decision needed, I will just build these

These have one right answer. Listed so they are not lost.

**B1. Free users are 403'd from their own career profile.** The GETs gate on
`canAccessJobFeed`, which is paid only, while the free feed is explicitly
CV-driven and builds that profile during its run. The GETs move to
`canViewJobFeed`. The copy telling a free user "I haven't read your CV into a
profile yet" is untrue today.

**B2. A failed verification resend reports success.** Split "unknown user" from
"send failed" inside the catch. The uniform 200 stays for an unknown address,
because that is what stops the endpoint being used to test whether an address
has an account. Only a real send failure returns 500.

**B3. Chat history loads for the 10 most recent applications only.** Load a
session's messages when it opens instead of in the initial sweep.

**B4. The free tier cannot say how many roles it is hiding.** Return the
uncapped count as its own field and keep the item list capped.

**B5. Per-tier input caps are not shown anywhere.** A Free user's second
country is silently dropped and the settings look honoured. One line of copy
per tier against `getJobFeedInputCaps(tier)`.

**B6. The balance is not shared, so priced controls guess.** Two entries, one
cause: the rewrite chip renders priced while the balance is loading, and the
feed cards cannot price against it at all. Fetch the balance once at shell
level and let every priced control read the same number. The 402 stays as the
backstop.

**B7. The run reports no progress until it finishes.** Write per-query progress
onto the run row as it goes and let the client poll it. The run is under a
minute, so a real SSE stream is a lot of machinery for very little.

**B8. The tracker silently truncates at 300 applications.** A line of copy
admitting the cap now. Paging when somebody is near it. The largest account has
115.

**B9. Follow-up drafting from the tracker rides on the kit's session state.** A
session-scoped regenerate endpoint that builds its own context server side.

**B10. The usage breakdown leans on free-text transaction types.** A typed
column, because free-text keys the UI buckets on will drift the first time
someone writes a new description.

**B11. "Last changed 3 months ago" under Password has no source.** The line is
invented. Either store the timestamp or delete the line. I would delete it: the
design rule here is no helper copy under a label unless it prevents an error.

**B12. Stripe returns to `/subscription`, which is now a redirect.** Point the
three URLs at `/dashboard?settings=usage`. Trivial, but it is a Stripe route,
so it needs a nod before I touch it.

---

## C. Blocked on something outside the code

**C1. The daily feed moment on the landing is still the mock.** Agreed 19
August: the placeholder stays until the end-to-end pass. Needs a real account
and a screenshot at 1440x900, under 150 KB.

**C2. The demo video is off the landing.** Needs the recording. Flow 7 already
schedules it for after the build.

**C3. The new profile columns are not on the remote D1 yet.** Staging has them,
because the timezone write was verified there this session. Production needs
the migration at cutover. This gates the whole Notifications pane.

**C4. Before/After pairs in the ATS view.** Needs the CV prompt to emit
`changes: [{ section, before, after, reason }]`. Small, but it is in
`src/lib/agents/**`, which is fenced. Say the word and it goes through the
`agent-expert` agent with a token-cost check.

**C5. Download all ships loose files, not a zip.** Needs jszip. It is already
in the tree as a transitive dependency of docx, but relying on that is fragile.
Declaring it explicitly is a new package, which needs your yes.

**C6. Rewrite instructions and the CV rewrite** both need agent prompt work as
well as the pricing decisions in A1 and A2. Same fence as C4.

---

## Order for the next session, revised after the review

**Step 0, before any code.** Diff section A against `git log` since 18 August.
A7 proves this doc and the code already diverged once in two days, and it was
only caught because a reviewer went and looked. Assume there is another one.

1. **A15, B3, A14.** The data-loss cluster, and the answer to "what if there is
   only one session". These three share one code neighbourhood
   (`useSessionStore`, `useSupabaseSync`, the tracker), they are the three
   things a clicking user experiences as broken today, and none of them touches
   a fence. A16 joins them if there is room.
2. **A12, B1, B2, A11.** Correctness and compliance. A12 first: the free run
   path recording a consent nobody gave is the only item here with a legal
   edge. A11 last, because the flag is set nowhere and deployed builds run with
   `NODE_ENV=production`, so the route 404s everywhere that matters. It is the
   wrong shape, not a live hole.
3. **A7 verification, then A8.** A7 is one live Free run to confirm what is
   already shipped. A8 is a change to the two paid tiers in `constants.ts`,
   plus the comment recording the sign-off.
4. **B4 to B12.** The honesty pass. Mostly copy and one shared balance fetch.
   B12 is included: Wasim approving this doc is the nod the Stripe fence asks
   for, and it is three URL strings.
5. **The migration batch: A3's counter, A6's ceiling, B10's typed column and
   C3's pending production migration.** One migration pass, not four. The fence
   on migrations is about approval, not avoidance.
6. **A1, A2, A4, A5, A6, C4, C6.** The kit, feed-steering and pricing work, as
   a scheduled feature batch rather than a backend pass.

---

## What the review changed, in one place

A `fable` agent reviewed the locked set. Every finding was checked against the
code before it was accepted; all five that survived are folded in above.

| Finding | Verified against | Effect |
|---|---|---|
| A7 was already built | `constants.ts` free tier limits, commit `433c0ccd` | Stopped a rebuild that could have pushed Free to three calls |
| Pagination is Free's thin-day rescue | `ingestion.ts:445-446` | Reversed A8; the approved version would have broken a working rescue. Wasim ruled that the corrected version wins, so both passes stay and the paid tiers get a reserve |
| Free users cannot withdraw consent, and the free run path invents the grant | `settings/route.ts:38`, `server.ts:152` and `:1191` | A12 grew from "small" to a real scope |
| `ranked_item_id` is already nullable | `schema.ts:898` | A16's stated reason was false; decision unchanged, reasoning replaced |
| A screening cap on client-written state is not a cap | `useSupabaseSync.ts:85` | A3 needs a server-owned counter, so it joins the migration batch |

It also flagged a pattern worth keeping: "it is a schema change, so avoid it"
was used as a reason twice, and it was wrong once and nearly unenforceable once.
The fence is about approval, not avoidance.
