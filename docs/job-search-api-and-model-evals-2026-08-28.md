# Job search API + Workers AI model evals: due diligence

**Date:** 2026-08-28
**Status:** Research complete. Nothing implemented. Waiting on decisions in "Open questions".
**Scope:** Two tracks. (A) Is SerpApi the right job search provider for US, UK, Canada, Germany. (B) Is `@cf/openai/gpt-oss-120b` the right model for our Workers AI tasks, and how do we prove it.

Target markets, in priority order: **US, UK, Canada, Germany.** Ireland and Netherlands are secondary. Everything else in the country picker is not a priority for the job feed.

---

## Track A: job search API

### How it works today

`src/lib/job-feed/serpapi.ts` calls SerpApi's `google_jobs` engine. One call per (role x country). 10 results per page. Budgets from `src/lib/job-feed/constants.ts`:

| Tier | Main queries | Reserve | Raw jobs cap | Visible |
|---|---|---|---|---|
| Free | 1 | 1 | 10 | 5 |
| Plus | 2 | 1 | 20 | 25 |
| Max | 4 | 1 | 40 | 25 |

Pagination fires only when a main query returned thin results *and* SerpApi handed back a `next_page_token` (`src/lib/job-feed/ingestion.ts:483`). 29 countries mapped in the `gl` / `hl` / `google_domain` tables, 22 offered in `JOB_FEED_COUNTRY_OPTIONS`.

### Cost is not the problem

At SerpApi's $75/mo Developer tier (5,000 searches, $0.015 each):

| Tier | Per daily run | Per daily-active user/month | Revenue |
|---|---|---|---|
| Free | $0.015 | $0.45 | $0 |
| Plus | $0.030 | $0.90 | $19.99 |
| Max | $0.060 | $1.80 | $79.99 |

Paid tiers sit at 1 to 4% of revenue. The only real exposure is free users: 1,000 daily-active free users would be 30,000 searches/month, which is the $275 tier against zero revenue. **That is the number to watch.** Throughput cap is 20% of monthly volume per hour, so 1,000/hour at the $75 tier. Not a constraint for us.

### Coverage verdict for the four target markets

All four are supported by `google_jobs` (`us`, `uk`, `ca`, `de` are on SerpApi's supported country list, ~105 codes). Germany works: the code already sends `hl=de` and `google.de`, and `estimateFreshnessDays` parses "vor 3 Tagen".

Two caveats:

1. **Ireland (`ie`) may not be supported.** It did not appear on SerpApi's Google Jobs country list on two separate reads, yet `JOB_FEED_COUNTRY_OPTIONS` offers Ireland. Unverified, read through a summariser. **One test call settles it.** If unsupported, Irish users get an empty or wrong-country feed.
2. **Google Jobs is an index of indexes.** It surfaces boards publishing `JobPosting` schema. LinkedIn largely does not feed it, so LinkedIn-exclusive postings are invisible to us in every market. Structural, not fixable by tuning.

### Risks found in the current integration

- **Google changed the jobs layout in March 2026.** Descriptions moved out of the results body into a per-job request. SerpApi absorbed it (roadmap issue #3661 closed), but their own benchmark on that change shows ~15s average response. Our feed runs on-click in real time and a Max run is 4 queries. Latency needs measuring.
- **Descriptions are load-bearing and unmonitored.** The prefilter and ranker read `job.description` and nothing else of substance. If SerpApi returns thinner descriptions, ranking quality degrades silently. No canary exists.
- **`JOB_FEED_PROVIDER = 'serpapi'` is baked into `canonical_key`** (`serpapi.ts:422`). Adding a second source means a dedupe key migration, not just a new fetcher.

### Provider comparison, priced per Max run (4 queries, up to 40 raw jobs)

| Provider | Pricing model | Cost per Max run | Covers US/UK/CA/DE | Notes |
|---|---|---|---|---|
| **SerpApi** (current) | per call | $0.060 | yes | $25/1k entry, $9.17/1k at $275. No pay-as-you-go |
| **Fantastic.jobs** | per job | **$0.009** | yes | $45/mo under 200k jobs. 200k+ career sites plus LinkedIn, hourly refresh, 100+ countries |
| **JobsPipe** | per job | $0.040 | yes | Free tier. 30+ ATS sources, webhooks, $1/1k jobs at scale |
| **Adzuna** | per call | **$0** | yes (12 to 20 countries) | Free 1,000 calls/mo, instant key. Strong UK/EU, thinner US |
| **TheirStack** | per job | $1.31 ($0.48 at scale) | yes | Best coverage on paper (352k sources, LinkedIn + Indeed + 16k ATS, deduped, minute-level). Per-job pricing is brutal at our shape |
| **Coresignal** | enterprise | ~$1k+/mo | yes | Overkill |
| Scrapingdog / SearchApi / DataForSEO | per call | $0.60 to $2 per 1k | Google-sourced | 8 to 25x cheaper than SerpApi per call. **Unverified** whether any exposes a `google_jobs` engine. Mostly vendor-blog sourced |

### The big boards do not offer APIs (checked 2026-08-28)

| Board | Public search API | Status |
|---|---|---|
| Indeed | No | Publisher API deprecated 2023, publisher program closed to new signups since Oct 2022. Partner access is sales-led, aimed at ATSs and staffing platforms |
| LinkedIn | No | Only a **Job Posting** API (publishing, not querying). Search retrieval is partner-gated |
| Glassdoor | No | API closed |
| ZipRecruiter | No | Publisher-partner only |

Being the destination is their business. This gap is not going to close.

### MCP servers: exist, but wrong layer for us

Every LinkedIn/Indeed MCP server is third-party, not published by the board:

- **JobSpy MCP** (open source, free): scrapes LinkedIn, Indeed, Glassdoor, ZipRecruiter, Google Jobs + 3. Local stdio.
- **Apify actors + Apify MCP**: "Real-Time Jobs API" covering LinkedIn, Indeed, Workday, Glassdoor, XING, Arbeitsagentur, Job Bank Canada. ATS actors ~$1.50/1k jobs.
- **TheirStack MCP**: only production-grade one with OAuth. Per-job pricing problem stands.

The first two are scrapers. For a paid product where the apply link is the deliverable, stay off scraped LinkedIn and Indeed data. ToS exposure, and they break without warning.

**Architectural conclusion:** MCP is a protocol for an LLM client to discover and call tools interactively. Our feed is a server-side ingestion pipeline inside a Worker, fired on a click, needing a fast deterministic HTTP fetch. Wrapping an HTTP call in MCP adds a session handshake, a transport hop and latency for zero benefit, and every job MCP server is a thin wrapper over an HTTP API we could call directly. **MCP is a dev-time tool here, not a runtime one.**

### Free official sources worth adding (the best finding on this track)

| Market | Source | Auth | Cost |
|---|---|---|---|
| **Germany** | Bundesagentur für Arbeit Jobsuche | fixed public client ID via `X-API-Key`, no signup | **free**, Germany's largest job database |
| **UK** | Reed.co.uk Jobseeker API | free key after account | **free** |
| US/UK/CA/DE | Adzuna | instant key | **free**, 1,000 calls/mo |
| US | USAJOBS | free key | free, federal roles only |
| Canada | Job Bank | XML feed on request, no public API | needs a request |
| Any | Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Recruitee, Personio | **none** | free, unlimited |

Two standouts:

- **Bundesagentur für Arbeit is the highest-value single addition for Germany.** Free, official, largest German database, and Google Jobs' German coverage is comparatively thin. Caveat: community-documented against the client ID their own app uses, so not a contractual API. Can change without notice.
- **ATS endpoints are no-auth public JSON.** The startup-native play. Catch: you get "all jobs at company X", not search, so it is a crawl-and-index project (company token list, nightly crawler, our own index). Real work, but the only route to inventory nobody in our price band has, at zero cost per job.

### Recommendation on Track A

Do not rip out SerpApi. It covers all four target markets, it is cheap at current scale, and the integration is mature. Instead:

1. Verify Ireland and measure real per-country latency. Cheap, immediate.
2. Add **Adzuna as a shadow source** on the free tier to measure how much unique inventory a second source adds, before paying anyone.
3. Add **Bundesagentur für Arbeit** (Germany) and **Reed** (UK). Both free, both cover markets Google Jobs underserves.
4. Only pay for **Fantastic.jobs** if that trio still leaves a LinkedIn-shaped hole in the US. If we do pay, it is Fantastic.jobs, not TheirStack: 8 to 20x cheaper at our shape and it covers Google Jobs' blind spot.
5. Park the ATS crawler as a later strategic bet.

---

## Track B: model choice and evals

### Where gpt-oss-120b runs

`@cf/openai/gpt-oss-120b` is the default in `callWorkersAI` (`src/lib/models/workers-ai.ts:20`), serving main chat, tracker chat, career-profile synthesis, search strategy, CV suggestions and language detection. Job-feed ranking goes through `rankWithWorkersAi` with the model set by the `JOB_FEED_RANKING_MODEL` wrangler var (`wrangler.jsonc:61`).

### We are closer to evals than it looks

Two things already exist:

- **`llm_generations` in D1** records model, operation, latency, input/output/cached tokens and status on every call. That is the eval substrate, already built.
- **Ranking already has model + fallback wired to env vars**, so an A/B is a config change, not a refactor.

Blocked: tried to pull the production baseline, wrangler account auth is expired (`code 7403`). **Needs re-auth before Phase 0.**

### Workers AI pricing, August 2026 ($/M input, $/M output)

| Model | In | Out | vs gpt-oss-120b | Notes |
|---|---|---|---|---|
| `@cf/openai/gpt-oss-120b` **(current)** | 0.350 | 0.750 | baseline | reasoning |
| `@cf/deepseek-ai/deepseek-v4-flash-0731` **(current fallback)** | 0.440 | 1.320 | **1.3x / 1.8x more** | see finding 1 |
| `@cf/google/gemma-4-26b-a4b-it` | 0.100 | 0.300 | 3.5x / 2.5x cheaper | function calling, reasoning, vision |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 0.051 | 0.335 | 6.9x / 2.2x cheaper | |
| `@cf/openai/gpt-oss-20b` | 0.200 | 0.300 | 1.8x / 2.5x cheaper | function calling |
| `@cf/ibm-granite/granite-4.0-h-micro` | 0.017 | 0.112 | 20x / 6.7x cheaper | function calling, small |
| `@cf/meta/llama-4-scout-17b-16e-instruct` | 0.270 | 0.850 | cheaper in / dearer out | |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | 0.351 | 0.555 | same / 1.4x cheaper | |
| `@cf/nvidia/nemotron-3-120b-a12b` | 0.500 | 1.500 | dearer | built for multi-agent, tool calling |
| `@cf/moonshotai/kimi-k2.6` | 0.950 | 4.000 | much dearer | 262k ctx, **cached input $0.160** |
| `@cf/moonshotai/kimi-k2.7-code` | 0.950 | 4.000 | much dearer | cached input $0.190 |

### Four findings worth acting on

1. **Our fallback costs more than our primary.** `deepseek-v4-flash-0731` is 1.3x the input and 1.8x the output of `gpt-oss-120b`. A fallback rescuing a failed run should be cheaper and more reliable, not pricier. Backwards.
2. **Prompt caching is available and unused.** Workers AI does prefix caching, surfaces `cached_tokens` as a metric and bills them at a discount, triggered by an `x-session-affinity` header. `workers-ai.ts:6` explicitly notes caching is not mirrored, and the ranking system prompt is large and completely static across runs. We already record `cacheReadInputTokens` in the ledger, so the effect is immediately visible. **Cheapest win on the list.**
3. **Gemma 4 is the obvious challenger for ranking.** 0.10/0.30 with function calling and reasoning. If it holds quality that is a 2.5 to 3.5x cut on our heaviest LLM task.
4. **`RANKING_MODEL_RATES` (`src/lib/job-feed/server.ts:2160`) is a hardcoded 3-model table** with a stale "GPT-4.1 Mini pricing" comment above it. The three rates it has are correct, but it returns `null` cost for any other model, which blinds the admin dashboard the moment we A/B a fourth.

### What is missing

No golden dataset, no offline harness, no quality gate. Today the ranker's only check is `validateModelRankingResponse`, which asks "is this valid JSON with the right shape", not "are these good jobs". You cannot compare two models without spending a real user's feed run.

### Eval design

**Five task families.** Ranking first, highest stakes.

1. Job-feed ranking
2. Chat + tracker chat (tool calling)
3. Career-profile synthesis (JSON extraction)
4. Search strategy (query generation)
5. Language detection / CV suggestions (cheap classification)

**Metrics:**

- *Ranking*: schema validity rate (must be ~100%), full-coverage rate (every candidate returned exactly once), precision@k against labels, hard-constraint violation rate (employment type, salary floor, sponsorship), hallucinated-reason rate, em-dash and AI-tell violations, latency p50/p95, cost per run.
- *Chat / tracker chat*: tool-call correctness (right tool, right args), over-refusal rate (a claim-guard over-refusal watch is already open from the agentic chat work), latency to first token.
- *Synthesis, search strategy*: JSON validity, field-level agreement against a Claude Sonnet 4.6 reference.
- *Language detection, CV suggestions*: plain accuracy. Cheap models likely win outright.

**Golden set, built cheaply:** we retain raw fetch payloads 14 days and run metadata 30 days. Pull ~10 profiles spanning US/UK/CA/DE, junior through senior, remote and onsite, sponsorship-needed and not, each paired with ~40 real candidates from a real run. About 400 (profile, job) pairs. Label with an Opus 5 judge, then Wasim spot-checks 50 to 80 pairs to calibrate the judge. Human labels are ground truth on the calibration subset, the judge scales to the rest.

**Where it runs:** `scripts/evals/` hitting the Workers AI REST API directly with an API token. Offline, no user credits burned, no production traffic.

**What it costs:** 8 models x 10 profiles x 1 ranking call, roughly 8k in / 3k out each. **Under $5 across every model on the list**, including Kimi. The whole bake-off costs less than a coffee.

---

## Plan

| Phase | Work | Blocked on |
|---|---|---|
| **0** | Re-auth wrangler, pull ledger baseline (latency, tokens, cost by operation). One test SerpApi call per country to settle Ireland and measure real per-country latency. Confirm descriptions still arrive full | wrangler auth |
| **1** | Build `scripts/evals/` + the ranking golden set. Wasim's calibration pass on 50 to 80 pairs | Phase 0 |
| **2** | Run the bake-off. Pick per-task winners. Add a per-task model map in `src/lib/models/`. Fix the fallback so it is cheaper than the primary. Complete `RANKING_MODEL_RATES` | Phase 1 |
| **3** | Prompt caching via `x-session-affinity` on the ranker and chat. Verify against `cached_tokens` in the ledger | independent, can run parallel to 1 |
| **4** | Adzuna shadow source to measure unique-job yield. Then Bundesagentur für Arbeit (DE) and Reed (UK). Requires lifting `JOB_FEED_PROVIDER` out of `canonical_key` | Phase 0 |
| **5** | Continuous eval: sample ~2% of production ranking calls, re-score nightly with the judge, alert on drift | Phase 2 |

Phases 0 and 3 are cheap and independent. Start there.

---

## Open questions for Wasim

1. **Is Ireland a real market?** It is in the country picker and may not be supported by `google_jobs` upstream. If it is not a market, drop it from `JOB_FEED_COUNTRY_OPTIONS`.
2. **Budget for a second job source.** Is $45/mo acceptable now, or must anything new be free until there are more paying users? Changes Phase 4 from "free trio then maybe Fantastic.jobs" to "free trio only".
3. **Per-task model map, or one global model?** Recommendation: per-task. Ranking and language detection have nothing in common.
4. **Calibration labels: you, or an Opus judge alone for v1?** Your labels make the eval trustworthy. The judge alone makes it fast.
5. **Is the ATS crawl-and-index play (Greenhouse, Lever, Ashby et al.) something we want on the roadmap at all,** or out of scope for now? It is free inventory nobody in our price band has, but it is a real project.

---

## Sources

- [SerpApi pricing explained](https://apiserpent.com/blog/serpapi-pricing-explained)
- [SerpApi Google Jobs API](https://serpapi.com/google-jobs-api)
- [SerpApi Google Jobs supported countries](https://serpapi.com/google-jobs-countries)
- [SerpApi roadmap #3661, jobs layout change](https://github.com/serpapi/public-roadmap/issues/3661)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Workers AI model catalog](https://developers.cloudflare.com/workers-ai/models/)
- [Workers AI prefix caching and session affinity](https://developers.cloudflare.com/changelog/post/2026-03-19-kimi-k2-5-workers-ai/)
- [TheirStack pricing](https://theirstack.com/en/pricing)
- [Job data MCP servers compared](https://theirstack.com/en/blog/best-jobs-mcp)
- [Fantastic.jobs](https://fantastic.jobs/about)
- [JobsPipe jobs API](https://jobspipe.dev/jobs-api)
- [Adzuna developer portal](https://developer.adzuna.com/)
- [Indeed API status](https://jobspipe.dev/blog/indeed-api-key)
- [LinkedIn Jobs API guide](https://www.realtyapi.io/blog/linkedin-jobs-search-api)
- [JobSpy MCP server](https://github.com/chinpeerapat/jobspy-mcp-server)
- [Apify Real-Time Jobs MCP](https://apify.com/hermann_samimi/real-time-jobs-api-linkedin-indeed-workday-glassdoor/api/mcp)
- [bundesAPI/jobsuche-api](https://github.com/bundesAPI/jobsuche-api)
- [Reed.co.uk Jobseeker API](https://www.reed.co.uk/developers/Jobseeker)
- [ATS platforms with public job posting APIs](https://cavuno.com/blog/ats-platforms-public-job-posting-apis)
- [SERP API price comparison](https://www.scrapingdog.com/blog/best-serp-apis/)
