# Job data sources beyond SerpAPI (2026-10-25)

**Question.** Is there a better job source than SerpAPI's Google Jobs engine? Better means same-day freshness, whole ad text, direct employer apply links and proper coverage of Germany, the UK, the rest of Europe and North America, even at a higher price.

**What ran.** Two Opus 5.5 research agents ran in parallel on 2026-10-25. Each was capped at about 30 web calls, all read-only: no sign-ups and no live API calls.
- Agent A covered dedicated job-data APIs and ATS-direct sources (48 tool calls).
- Agent B covered Google Jobs scrapers and live-search APIs (40 tool calls).

Every number below comes from vendor pages or third-party write-ups and is not yet measured by us. "Unverified" marks claims neither agent could confirm.

## Findings

1. **Another Google Jobs vendor won't fix the problems.** SerpAPI, SearchAPI.io, JSearch, DataForSEO, Bright Data SERP, ScraperAPI and Scrapingdog all return Google's own payload. That means about 10 jobs a page, Google's copy of the description and Google's `apply_options`. Changing vendor changes price and legal cover, not quality.
   - In March 2026 Google started leaving descriptions out of the results page. SerpAPI's fix was "still not 100% covered" (serpapi/public-roadmap#3661).
   - `google_jobs_listing` now returns only ratings.
2. **Google Jobs has had freshness gaps.** From late August to mid-September 2026, jobs from the last 1 to 3 days were missing for parts of the day in the US and Spain. SerpAPI's status page showed a partial outage on 14 Sep. Whether it's fixed now is unverified.
3. **Google is broad but not complete for Germany.** Indeed DE has historically stayed out of Google for Jobs. The Bundesagentur für Arbeit (BA) holds more than 1M postings and Google reaches them only in part. No published coverage comparison exists, so we have to measure it ourselves.
4. **Whole ad text comes from the ad's own page.** Google lists a page only when it carries `JobPosting` JSON-LD, so the apply link usually holds the full HTML ad. This PR reads that JSON-LD (`src/lib/job-feed/posting-page.ts`). It improves every source we keep.

## Shortlist

| Source | Why | Freshness | Germany | Price (vendor pages) | Risk |
|---|---|---|---|---|---|
| **Fantastic.jobs** Career Site API (275k+ ATS career sites) and its LinkedIn index | Full text and HTML, direct ATS apply links, hourly polling, filters an agent can drive (title, description, language, work mode, time windows 1h/24h/7d) | 95% of new ATS jobs within 3 h (claim); LinkedIn index about 1 h behind | Personio, JOIN, Recruitee, Workday, SuccessFactors covered; Softgarden not; no Germany count published | $95 for 20k jobs, $250 for 100k, $2,800 for 2M a month | Display terms not published; LinkedIn data is scraped (vendor's risk) |
| **Bundesagentur für Arbeit Jobsuche** | Deepest Germany source; `veroeffentlichtseit=0` (posted today), radius, home-office filter | Not documented | More than 1M open postings | Free | Unofficial use of the BA site's own API; no published terms or limits; ads often short, and the "partner" is often another board |
| **TheirStack** | Broadest single API with published German volume (453k postings in Sep 2026), rich filters, webhooks | 69.9% same day, 88.8% next day (their own table) | Mostly Indeed and LinkedIn copies, so aggregator links | $169 for 10k jobs, $600 for 100k | Terms page returned 404 |
| **Techmap** | Only vendor that states public display is allowed; EU company; cheapest per job | Every source at least twice a day | No Germany count | $99 for 100k jobs | Weaker freshness, no Indeed |
| **ATS-direct** (Greenhouse, Lever, Ashby, Workable, Personio XML, Recruitee, Workday) | Free, minutes fresh, employer apply links, full HTML | Minutes | Per company watchlist | Free | Some endpoints unofficial (JOIN, Workday) |

**Closed, don't chase:** the Indeed Publisher API (deprecated) and LinkedIn's Job Posting API (no new partners, no search).

## Recommended shape (not built)

1. **Shared hourly ingest into our own job index.** Today we call a vendor per user search; the feed would read from the index instead.
   - Primary feed: Fantastic.jobs, ATS feed first.
   - Germany breadth: a BA job every 1 to 2 hours with `veroeffentlichtseit=0` or `1`.
   - An ATS-direct watchlist for the companies users pin.
2. **Keep one Google Jobs engine for breadth while migrating.** SerpAPI for its legal shield, or SearchAPI or JSearch at a quarter of the price.
3. **Dedupe on company, normalized title and city**, preferring the ATS record.

**Rough monthly cost.** These are both agents' estimates, not quotes.
- One heavy user (about 6,000 searches a month): $95 to $250 on Fantastic.jobs with "new since last run" windows, or $150 on SerpAPI.
- 1,000 users on a shared index: about $1k to $6k a month, set by the corpus size, not the user count.

## What changed because of it

- This PR reads each ad's own page, which is the fix for descriptions whatever the source.
- Max's searches per run and runs per day went up (item 9).
- The provider switch itself is a separate decision. It needs trial accounts and an overlap eval: the same 20 Berlin queries across SerpAPI, Fantastic.jobs, BA and TheirStack on one day, measuring unique jobs, duplicates, whole descriptions, direct links and hours from posting to appearance, saved under `evals/`.

## Open questions for the trials

- Germany and Berlin volumes for "AI Engineer", "ML Engineer" and "KI" on Fantastic.jobs, and whether its self-serve plan allows showing jobs to end users.
- Whether the BA `jobdetails` text is the whole ad, and its rate limits.
- How often Google's `via` names Indeed DE or StepStone for German results.
- Whether the Aug-Sep 2026 Google Jobs freshness gap is over.
- Whether Google filed an amended complaint against SerpAPI after 10 Aug 2026.
