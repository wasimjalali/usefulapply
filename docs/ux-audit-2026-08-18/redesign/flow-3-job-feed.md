# Flow 3: the Job Feed. Locked 19 August 2026.

Approved by Wasim on 19 Aug 2026: every variant decision went with the recommendation, plus three additions (Details link on the card, detail opens in the canvas with Back to feed, a first-visit nudge on the Edit feed pills). Inherits the shell from `flow-1-first-run.md` and the canvas patterns from `flow-2-application-kit.md`.

## Canvas and visuals

- **Locked canvas (7 artboards):** https://claude.ai/code/artifact/e2777c6a-cb17-4118-9449-a9d6348b3d73 (the variant round lives in the artifact's version history)
- **Rendered artboards (PNG, 1440x900):** `flow-3-artboards/png/` (J1 Setup, J2 Building, J3 Daily feed, J4 Job detail, J5 Check fit from card, J6 Edit feed, J7 Free top 5).
- Sources: `flow-3-artboards/gen4.mjs` (feed partials and the variant round), `gen5.mjs` (the locked artboards). Both import the shared tokens and spine from `flow-1-artboards/`.

## The decision

**The feed has its own conversation and its own canvas.** "Today's feed" in the sidebar opens the feed conversation in the middle column and the ranked list in the canvas. The assistant announces each run, answers "why this job", and re-ranks on plain-language requests. Clicking a card opens the job's detail in the canvas with **Back to feed**. Check fit from a card creates the application conversation in the sidebar and runs there, exactly as in flow 1.

## Screen by screen

### J1 · First run (setup as chips)
The feed conversation asks the three things it can't read from the CV, one at a time, as chips: **Where should I look?** (countries or "Anywhere remote"), **How do you want to work?** (Remote only / Remote first / Hybrid okay / On-site okay), **Minimum salary, or skip?** ($120K / $150K / $180K / Skip). Or the user types it in one line ("US and Canada, remote, 150K+"). The canvas shows "Your feed lands here. About a minute. After that it refreshes every morning on its own."

### J2 · Building
Chat: four named stages (Reading your profile, Planning ten searches, Searching "6 of 10 done, 41 roles so far", Ranking against your CV) with a progress bar. Canvas: the ten searches, each with its rationale, ticking off with "N found". **No "feed ready" modal.** J3's message is the announcement.

### J3 · The daily feed
- Conversation header: "Today's feed · Wednesday 19 August · 20 new roles". First message: "Good morning. I searched ten ways for you overnight and found 20 new roles, two strong matches at the top: Avetta and Zapier... Two duplicates removed." with chips **Why Avetta first?**, **Only remote**, **Raise my salary floor**. Composer placeholder: "Tell me what to change, e.g. 'more remote, no agencies'".
- Canvas header: serif "20 new roles today", one muted line (what it's ranked for, market, refresh time), **Today / Saved** pills, outlined **Edit feed**.
- **Card:** match badge (Strong match sage, Good match gold), title, company, four chips (location, work mode, salary in sage tint, age), two-line summary ending in a subtle **Details →** link, one gold **Check fit · 0.5**, quiet Save and Employer-site icons. The whole card is clickable (opens detail); the Details link is the visible affordance.

### J4 · Job detail
Replaces the list in the canvas: **← Back to feed**, Save, Employer site. Badge, serif title, company, chips, then one gold **Check fit · 0.5 credits** with "Skip the check, generate the kit (2 credits)" as a text link, then **Why it's a match** (one paragraph, names the gap too), then **The ad**.

### J5 · Check fit from a card
Creates the application (sidebar: "Avetta · Now") and switches to its conversation. The job arrives as the user's message ("From today's feed · Remote, US · $87.5K to $180K"), then the chip, then the three fit stages. The canvas shows the base CV with the gold banner "Checking fit for Avetta. Your CV stays here. The score lands in the chat." From here it is flow 1.

### J6 · Edit feed (Plus and Max)
Canvas view with **← Back to feed**, title "How I search for you", three pills **Profile / Searches / Preferences**.
- Profile: what I read from your CV (discipline, industries, best-fit titles, strongest skill areas, one paragraph), with an Edit button.
- Searches: the ten queries in priority order, each with its rationale.
- Preferences: countries, cities, work mode, salary floor, work authorization, words to avoid.
- **First visit only:** about three seconds after the view opens, the Searches and Preferences pills get a gold dot and a soft pulse, and a one-line hint card appears under the profile ("First time here? Searches shows the ten queries I run and why. Preferences holds..."). Shown once, then never again.
- Anything in this view can also be changed by asking in the feed conversation ("drop Group PM", "add Berlin", "no agencies").

### J7 · Free tier
Same layout and cards, "Your top 5 today", no Edit feed button, and one upgrade line at the end of the list: "9 more roles matched today. Plus shows all 20, searches more sources and lets you steer the feed." with an outlined-on-gold **See Plus**. The assistant's morning message says the same in one sentence.

## Notes for the spec and build

1. **Feed conversation is a real conversation** backed by the same chat infrastructure; the assistant's re-rank requests map to the existing settings (work mode, salary floor, avoid keywords, downweighted titles) and trigger a re-rank, not a full re-fetch, when possible.
2. **Card click vs. buttons:** card body and Details → open detail; Check fit, Save and Employer site stop propagation.
3. **Saved** pill filters the list to bookmarked jobs; saving is free.
4. **Detail view** shows the full ad text; "Why it's a match" comes from the ranking rationale already stored per job.
5. **Setup chips** write the same `job_feed_settings` fields the current wizard writes; the consent checkbox becomes one line under the last question ("I'll search public job boards on your behalf. OK?") with a chip.
6. **Building** streams the per-query progress that the run already records (queries, found counts) to the canvas.
7. **Edit feed nudge** is a one-time flag per user (localStorage or a user setting), fires 3 s after first open, stops on any pill click.
8. **Duplicates** are removed before the list renders (B9); the announcement states the count honestly.

## Build notes (19 August 2026, `build/flow-3-feed`)

Where the built screens diverge from the artboards, and why. Every gap has an entry in `build/BACKEND-GAPS.md`.

1. **"Ten searches" is the tier's real budget.** Plus runs 2 SerpAPI calls a day, Max 4, Free 1, while the strategy generator plans up to 10 queries. J2's stage reads "Planning your searches" with the real count, the canvas lists today's queries only, and Edit feed's Searches pill adds "N more queries are in the plan. Each morning works down the list."
2. **No per-query tick-off.** The run writes its search plan and counts only when it completes, so the canvas shows the planned queries without "N found" and the Searching stage stays active for the whole run. Stages 1 and 2 do flip off real completions (the profile and strategy calls returning).
3. **Re-rank is a filter plus a saved preference.** There is no re-rank endpoint and only one run per local day, so "only remote" hides non-remote roles from today's list and saves the setting for tomorrow. The assistant says both halves in one line.
4. **The free tier's upgrade line does not name a number.** The overview caps the count before the client sees it, so the line reads "You're seeing your top 5 today" rather than "9 more roles matched today".
5. **The feed conversation is derived, not stored.** The opening message is rebuilt from the overview on every load; the steering exchange lives in `useFeedStore` and does not survive a reload. A daily feed resetting each morning is the intended behaviour.
6. **"Why it's a match"** now comes from `job_feed_ranked_items.reason`, threaded onto `JobFeedFeedItem.matchReason` in this batch. It is empty for jobs opened from the Saved tab (no ranked-item join there), and the section is hidden rather than filled with a guess.
7. **Mobile** gets the same canvas in read-only mode (list, detail, save, employer site). Setup and steering live in the conversation, which is desktop only.

## Out of scope for flow 3

Tracker table (flow 4). Settings pages (flow 5).
