# Backend gaps: the decision log

**Written 20 August 2026.** Branch `rebrand/usefulapply`. This is the companion
to `BACKEND-GAPS.md`: that file records what is missing, this one records what
has to be decided before it can be built, and what I recommend.

Thirty-eight entries are still open in `BACKEND-GAPS.md`. They split three ways:

- **A. Twenty need a decision from Wasim.** Money, product policy, or something
  that cannot be reversed cheaply. Listed below with a recommendation each.
- **B. Twelve need no decision.** There is one right answer and I can build it.
  Listed so nothing is lost, not so anything is debated.
- **C. Six are blocked on something outside the code.** A recording, a
  screenshot, a production migration window.

The three security and money gaps are already closed. See `SWEEP-HANDOFF.md`.

---

## A. Decisions I need from you

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
**Recommend: keep them free, move the cap to the server.** Screening answers
are a retention feature. A 0.25 charge per turn makes people count turns, which
is the opposite of what you want before there is revenue. The cap has to be
real though, because it is the only thing bounding the cost.

**A4. Is a re-rank free?**
Asking the feed for "only remote" filters today's list rather than re-ranking
it. A real re-rank costs one Workers AI call and no SerpAPI.
**Recommend: free, capped at five a day.** The daily limit exists to protect
SerpAPI spend, and a re-rank does not touch it. This is the thing that makes
the feed feel steerable instead of fixed, and it costs fractions of a cent.

**A5. Does the tracker chat get a ceiling?**
Every message there is an LLM call with no price and no cap.
**Recommend: leave it free, same as the kit chat.** The calls are small and two
different rules for two chat boxes is the kind of inconsistency users notice.

**A6. What does "Prep me for X" cost, if we build it?**
The chip is a hand-off today. Real interview prep needs a prompt and a price.
**Recommend: 0.5, and do it later.** It is a genuine feature, not a gap, and it
touches the agent prompts. It should be scheduled, not squeezed into a backend
pass.

**A7. The Free SerpAPI rescue call, decided last session but never built.**
You chose to give Free two calls a day so a main query and a rescue both fit.
It touches `JOB_FEED_MAX_DAILY_QUERIES` and the tier limits in `constants.ts`,
which the file says needs explicit sign-off, and it costs real money per Free
user.
**Recommend: build it as decided.** Free is the top of the funnel, and a Free
user whose one query returns nothing gets an empty day and leaves.

**A8. Do the pagination and fallback passes get their own budget?**
They draw from the shared per-tier budget, which the main plan fills, so they
almost never run. Giving them a real budget is up to three extra calls a day on
Max.
**Recommend: give the fallback pass a reserved call, delete the pagination
pass.** The fallback is what rescues an empty day, which is the failure a user
actually feels. Pagination just fetches more of a query that already worked.

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
**Recommend: yes, build it.** The company is in Germany and the imprint says
so. Consent you cannot withdraw is a compliance problem, not a UX nicety, and
the fix is small.

**A13. Two-factor authentication.**
Recorded as dropped, not deferred.
**Recommend: leave it dropped and keep the row off the settings pane.** This
matches what you already told me. Listed here only so it is not rediscovered as
an open question.

### Data and deletion

**A14. Deleting an application: single row or bulk, soft or hard?**
There is no way to delete an application at all. The whole server chain is
intact and orphaned.
**Recommend: single row, hard delete, with a typed confirm.** Bulk select is a
power feature for a product with 115 applications in total. Hard delete matches
how everything else in this app behaves and avoids a `deleted_at` filter on
every query forever.

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
**Recommend: exempt saved jobs from the retention delete.** The alternative is
making `ranked_item_id` nullable, which weakens the authorisation model that
protects every feed write. Keeping a few extra rows for jobs someone
deliberately bookmarked is the cheaper trade.

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
**Recommend: carry the tier through sign-up and open checkout right after email
verification.** If that is more than you want, the alternative is dropping the
param so the landing stops implying it carries. Doing neither is the worst of
both.

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

## Suggested order for the next session

1. **A11, A12, B1, B2.** Security and correctness. Small, and two of them are
   things the product currently gets wrong in a way a user could notice.
2. **A14, A15, A16, B3.** The data-loss cluster. No delete, a blanking
   workspace, saved jobs that 404 and chat history that vanishes are the four
   that read as broken rather than missing.
3. **A7, A8.** The SerpAPI spend, once you have confirmed the numbers.
4. **B4 to B11.** The honesty pass. Mostly copy and one shared fetch.
5. **A1 to A6, C4, C6.** The kit and pricing work, as a scheduled feature
   batch rather than a backend pass.
