# Batch 3: the Job Feed (flow 3)

**Status:** built 19 August 2026 on `build/flow-3-feed`. Awaiting review and the merge into `rebrand/usefulapply`.
**Branch:** `build/flow-3-feed` off `rebrand/usefulapply`.
**Design of record:** `../flow-3-job-feed.md`. PNGs: `../flow-3-artboards/png/` (J1 Setup chips, J2 Building, J3 Daily feed, J4 Job detail, J5 Check fit from card, J6 Edit feed, J7 Free top 5). Shell from batch 1, kit from batch 2. Rules: `../../design-philosophy.md` section 5. The `job-feed-specialist` agent's scope applies: `src/lib/job-feed/**`, `src/app/api/job-feed/**`, `src/components/job-feed/**`.

## What this batch delivers

"Today's feed" in the sidebar opens the feed's own conversation (middle column) and the ranked list in the canvas. Setup by chips, building with named stages, the daily list with one gold action per card, a job detail view with Back, Check fit from a card creating an application conversation, Edit feed as a canvas view, the Free top-5 variant.

## Read first

`../flow-3-job-feed.md` in full, every J PNG, then `src/components/job-feed/*` and `src/components/JobBoardPanel.tsx`, `src/app/api/job-feed/**` (read; change only what the tasks name), `src/lib/job-feed/**` (read; the ranking, prefilter and ingestion stay as they are), the shell and chat components from batch 1.

## Tasks, in order

1. **Feed conversation.** A conversation of its own, backed by the same chat infrastructure as applications, opened from the sidebar card. Header "Today's feed · <weekday day month> · <n> new roles". Composer placeholder "Tell me what to change, e.g. 'more remote, no agencies'". The conversation column opens with the canvas wide enough for cards (collapse the conversation to a rail when the user asks for it; the PNGs show both open at 1440).
2. **J1 Setup by chips** (first run, no settings yet): three questions one at a time as chips (Where should I look? / How do you want to work? / Minimum salary, or skip?), or one typed line. Consent is one line under the last question ("I'll search public job boards on your behalf. OK?") with a chip. Chips write the same `job_feed_settings` fields the current wizard writes. Canvas: "Your feed lands here. About a minute. After that it refreshes every morning on its own." Retire the wizard components (`JobFeedPreferencesCard`, `AISearchProfileCard`, `SearchStrategyPreviewCard`, `JobFeedSetupBuildingCard`, `SmartFeedProgressCard`) once their content is covered; grep first, list deletions.
3. **J2 Building.** Chat: four named stages (Reading your profile, Planning ten searches, Searching "N of 10 done, M roles so far", Ranking against your CV) with a progress bar, streamed from the progress the run already records. Canvas: the queries with rationales ticking off with "N found". No "feed ready" modal; J3's message is the announcement.
4. **J3 Daily feed.** Assistant opening message (count, the two strongest, duplicates removed, honest numbers) with chips Why <company> first? / Only remote / Raise my salary floor. Canvas header serif "<n> new roles today", one muted line (ranked for, market, refresh time), Today / Saved pills, outlined Edit feed (Plus and Max only). Card: match badge (Strong match sage, Good match gold), title, company, four chips (location, work mode, salary in sage tint, age), two-line summary ending in "Details →", one gold **Check fit · 0.5**, quiet Save and Employer-site icons. Card body and Details open detail; Check fit, Save and Employer site stop propagation. Saved filters to bookmarked. Duplicates removed before render.
5. **J4 Job detail** as a canvas view: ← Back to feed, Save, Employer site; badge, serif title, company, chips; gold **Check fit · 0.5 credits** with "Skip the check, generate the kit (2 credits)" as a text link; "Why it's a match" from the stored ranking rationale; "The ad" full text.
6. **J5 Check fit from a card**: creates the application (sidebar "<company> · Now"), switches to its conversation, the job arrives as the user's message ("From today's feed · <location> · <salary>"), then the chip and the three fit stages (flow 1's path). Canvas keeps the base CV with the gold banner "Checking fit for <company>. Your CV stays here. The score lands in the chat."
7. **Re-rank by chat.** "Only remote", "Raise my salary floor", "no agencies", "drop Group PM", "add Berlin" map to the existing settings fields (work mode, salary floor, avoid keywords, downweighted titles) and trigger a re-rank, not a full re-fetch, when possible. The assistant confirms in one line and the list updates.
8. **J6 Edit feed** canvas view (Plus and Max): ← Back to feed, "How I search for you", pills Profile / Searches / Preferences with the content the doc lists. First-visit nudge: about 3 s after the view opens, gold dot + soft pulse on Searches and Preferences and a one-line hint card; one-time flag per user (localStorage is fine); stops on any pill click.
9. **J7 Free tier**: same cards, "Your top 5 today", no Edit feed, one upgrade line at the end ("9 more roles matched today. Plus shows all 20, searches more sources and lets you steer the feed.") with **See Plus** (opens the existing upgrade route until batch 4 lands the settings pane). The morning message says the same in one sentence.
10. Retire `JobBoardPanel` and old feed UI after grep. `npx tsc --noEmit`, `npm run lint`, report.

## Don't

- Don't change ranking, prefilter or ingestion logic in `src/lib/job-feed/**`; only the read paths the UI needs and the settings writes the chips need.
- Don't change the cron or the Workers AI ranking call.
- Don't add packages.

## Definition of done

At 1440x900 the seven J screens match. A new Plus user sets the feed up by chips, sees it build, gets the list, opens a detail, checks fit from a card and lands in the application conversation. A Free user sees top 5 with the upgrade line. tsc 0, lint clean, report filed.

## Kickoff prompt (paste into a fresh Grok 4.6 session in this repo)

```
You are the implementer for batch 3 of the Useful Apply UX redesign. Claude Code is the orchestrator; it will review, fix and commit your work. Batches 1 and 2 are merged on rebrand/usefulapply; build on them. Read, in order: docs/ux-audit-2026-08-18/redesign/build/BUILD-PLAN.md, docs/ux-audit-2026-08-18/redesign/build/batch-3-feed.md, docs/ux-audit-2026-08-18/design-philosophy.md (section 5), docs/ux-audit-2026-08-18/redesign/flow-3-job-feed.md, every PNG in docs/ux-audit-2026-08-18/redesign/flow-3-artboards/png/, and .claude/rules/design-system.md. Then do the batch's tasks in order on branch build/flow-3-feed off rebrand/usefulapply. Do not commit or push. Do not add packages. Do not change ranking, prefilter, ingestion, the cron, credits, Stripe, D1 schema or Better Auth config. Finish with npx tsc --noEmit and npm run lint, then end with the exact report format from BUILD-PLAN.md.
```
