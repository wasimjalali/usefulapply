# Feed data, MCP parity and the composer and sidebar (2026-10-25)

Source: Wasim's job search through the MCP on 2026-10-25. Each item names the root cause found in the code, the fix and its regression test. One commit per item, in this order.

Two PRs:
- **PR A, `feature/feed-data-mcp-parity`:** items 1 to 10. Sensitive review row (D1 schema, optimistic concurrency, the run state machine).
- **PR B, `feature/composer-sidebar`:** items 11 and 12. Feature review row.

Migrations 0016 (description source), 0017 (settings revision) and 0018 (run slot) are additive: new columns with defaults, and the one-run-a-day unique index rebuilt to include the slot. No row is rewritten or dropped.

## Part 1: feed data

### 1. Descriptions cut off
- **Root cause, ~2,004 characters:** `get_job_feed` splits a 40,000-character budget evenly across the page and cuts each description (`descriptionCapFor` in `src/lib/mcp/tools/feed.ts`). 20 jobs = 2,000 characters + the `<<>>` marks.
- **Root cause, 122 characters:** the stored text is Google Jobs' copy from SerpAPI, sometimes a snippet. Nothing fetches the posting itself.
- **Fix:** never cut a description in the MCP (paging by size is item 10). At ingestion, after the prefilter, fetch the employer or apply page of any job whose text is short, cut with an ellipsis or flat (no line breaks), and read the `JobPosting` JSON-LD that Google Jobs requires of every listed page. Store that text (`description_source = 'employer_page'`) and `description_complete`. A later SERP sighting never replaces an employer-page text. Fetches: https or http only, no IP literals or local hosts, re-checked on every redirect, 8 s timeout, 1.5 MB cap, 6 at a time.
- **Test:** E2E tool `e2e/tools/feed-data.ts` (stubbed SerpAPI and employer pages) runs the real workflow and reads the result through the `get_job_feed` tool.

### 2. URLs cut at 80 characters
- **Root cause:** `applyUrl`, `sourceUrl` and `applyOptions[].link` go through `wrapShort`, which runs `flattenUntrusted`, which cuts at 80 characters. Storage keeps the full URL.
- **Fix:** a `wrapUrl` helper: the URL parsed and re-serialized (which percent-encodes `<` and `>`), never cut. The web app already truncates links with CSS only.
- **Test:** the same E2E tool, with a 190-character apply URL.

### 3. Lists and headings run together
- **Root cause:** Google Jobs strips list markup and joins items ("CI/CD-PipelinesSehr gute"). We store that text and only the web app tries to repair it at render time. The repo already showed a word-glued-to-capital splitter can't be made safe ("salaryCompetitive" vs "HealthTech").
- **Fix:** the employer page's HTML is converted at ingestion: `li` to "- item", `p`, `br`, `div` and headings to line breaks, headings kept as their own line. The web renderer and the MCP get the same stored text. The render-time repair stays for older rows.
- **Test:** the E2E tool asserts separate lines for list items and headings.

### 4. Settings ignored
- **Root cause, onsite jobs:** `inferWorkMode` labels every job with a location and no remote or hybrid keyword `onsite`, so hybrid ads were "onsite". The prefilter never checks work mode, and the ranker prompt lets `remote_first` and `hybrid` accept onsite jobs in a preferred city.
- **Root cause, seniority:** the ranker prompt prefers a high-confidence inferred seniority over the user's choice.
- **Root cause, applied job back:** only jobs applied to from the feed are blocked (feedback rows). The dexter health application came from another path, so the new listing had no link to it.
- **Fix:** location alone gives `unknown`. The ranker returns the work mode and level it reads in each ad; the server drops a job whose mode or level is outside the settings (unknown is kept), and stores the read mode on the job. The prompt follows the user's levels and modes. Jobs matching any tracker application by normalized company and title (gender tags such as "(m/w/d)" removed) are dropped from ranking and hidden from the inbox.
- **Test:** E2E tool scenarios: an onsite ad with onsite excluded, a senior ad with junior and mid chosen, a job already in the tracker under another URL.

### 5. A stale settings form overwrites newer changes
- **Root cause:** the editor sends the whole settings object and the server saves it with no version check.
- **Fix:** `job_feed_settings.revision`, bumped by every write in one conditional update. The web save and `update_feed_settings` send the revision they read; a stale one is a 409 with "Your feed settings changed somewhere else. I loaded the latest. Check them and save again." and the editor reloads. `get_feed_settings` returns the revision.
- **Test:** MCP lane spec: change through the MCP, save the already-open web form, see the refusal and the reloaded values.

## Part 2: MCP parity

### 6. Seniority hidden and stuck
- **Root cause:** every save replaces `seniority_targets` (and `languages`) with the career profile's inferred value, and no screen shows it.
- **Fix:** a sent value wins; the profile only fills a field never set. A "Seniority" chip group in the editor, `seniority` in `update_feed_settings`. The feed honours it (item 4).

### 7. Missing fields in update_feed_settings
- **Fix:** add `seniority`, `excludedTerms`, `cities`, `languages`, `workAuthorization`, with the same limits as the web route. A "Languages" field joins the editor so both sides cover the same set.

### 8. Career profile can't be regenerated
- **Fix:** `regenerate_career_profile` (reads the primary CV again, rate limited, no credits), the same as a "Read my CV again" button in the editor. `update_feed_searches` sets the confirmed search list (query and country per row), the MCP twin of the editor's search list.

### 9. Roles dropped silently, fixed limits
- **Fix:** `update_feed_settings` returns `droppedRoles` and a warning. Searches per run and runs per day come from one per-plan table (`JOB_FEED_PLAN_LIMITS`). Max goes from 4 searches and 1 run to 8 searches and 3 runs a day; free and Plus stay as they are. A second run on the same day takes the next slice of the search list (it wraps), and `run_job_feed` takes an optional custom query set an agent writes, run through the same search, filter and rank. `job_feed_runs.run_slot` with a unique index on user, local day and slot.

### 10. Smaller MCP issues
- **Fix:** `give_job_feedback` says why a job can't change (kit already made, dismissed, rated not relevant, no longer in the 7-day feed). `get_job_feed` with `full` fills a page up to about 40,000 characters of descriptions, never cutting one, and returns `nextOffset` (this landed with item 1, the same code).

## Part 3: UI (PR B)

### 11. Composer
Rebuilt on the Useful Brain composer pattern (layout and behaviour), with Useful Apply's tokens unchanged.

### 12. Sidebar
Reworked on the Useful Brain rail's structure: fewer, calmer elements, clear hierarchy, Useful Apply colours.

## Verification
- Through the MCP (local preview over OAuth, and production after deploy): run the feed, `get_job_feed` full (no cut text or URL, separate list items); set seniority, excluded terms and cities, read them back, check the web editor shows them; a stale form save refused; an applied job absent.
- Screenshots of the composer and sidebar in light and dark mode, frame-by-frame recordings for anything that moves.
- Job-data provider research (SerpAPI alternatives) runs alongside; its write-up lands in `docs/research/`.
