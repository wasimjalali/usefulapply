# Streamed chat replies, live check (2026-10-23)

**Question.** Does the streamed `/api/chat` (PR #180) work against the real Anthropic API the way the E2E fake says: text arriving as server-sent events through a tool round, the deltas adding up to the stored reply exactly, the same cache reads and ledger rows as an unstreamed turn, and a request without `Accept: text/event-stream` still answered with JSON? And how much sooner does the user see text?

**What ran.** `evals/chat-streaming/live-check.ts` against a local production build (`opennextjs-cloudflare preview -c wrangler.e2e.generated.json -- --port 8850 --var BETTER_AUTH_URL:http://localhost:8850`, the Worker's own config for the key), claude-haiku-5-5, @anthropic-ai/sdk 1.1.0, API 2026-10-21. The script signs up a throwaway user on the local D1, seeds three tracker rows (Northwind Foods drafted, Bosch applied 9 days ago, Zapier in interview), and sends three turns on the Northwind application:
1. "Wie viele Bewerbungen habe ich gerade, und bei welcher bin ich am weitesten?" (streamed; needs the tracker);
2. "Wie formuliere ich eine freundliche Nachfrage bei Bosch, ...? Gib mir drei kurze Tipps." (streamed; the model also looked the tracker up);
3. "Danke dir!" with no Accept header, as a tab loaded before the deploy sends it.

Command (inside the shared heavy lock): `LIVE_BASE_URL=http://localhost:8850 npx tsx evals/chat-streaming/live-check.ts`. Raw results: `2026-10-23-chat-streaming-live-run1.json` (run 1, code at d6888c82) and `2026-10-23-chat-streaming-live.json` (run 2, final code 7fe4df10).

Two setup lessons: a preview without `-c wrangler.e2e.generated.json` keeps the production route, so the host becomes usefulapply.com and Better Auth refuses the origin (403 INVALID_ORIGIN); and the tracker tool lists only applications with a generated CV, so run 1's seed (no CV) showed the model an empty tracker. Run 2 seeds one.

## Results (run 2, the final code)

| Turn | Headers | Status event | First text | Last text | Done | Deltas | Deltas = reply | Stored = reply |
|---|---|---|---|---|---|---|---|---|
| 1, tracker question | 1.75 s | 1.76 s | 3.26 s | 3.71 s | 3.71 s | 3 | yes | yes |
| 2, three tips | 2.20 s | 2.20 s | 3.87 s | 5.30 s | 5.30 s | 7 | yes | yes |
| 3, no Accept header | JSON 200, every key of the old body, reply stored | | | | | | | |

| Call | Input (uncached / cache write / cache read) | Output | Latency | Cost |
|---|---|---|---|---|
| turn 1, round 0 | 58 / 108 / 9,637 | 27 | 1.4 s | $0.00013 |
| turn 1, tool round | 2 / 500 / 9,745 | 211 | 1.9 s | $0.00027 |
| turn 2, round 0 | 58 / 193 / 9,745 | 283 | 2.2 s | $0.00027 |
| turn 2, tool round | 2 / 756 / 9,938 | 471 | 3.1 s | $0.00043 |
| turn 3 (JSON) | 58 / 358 / 9,938 | 58 | 1.0 s | $0.00018 |

Run 2 total **$0.0013**; run 1 $0.0030 (it wrote the 9.7k system prefix fresh). Both runs together: **$0.0043**.

- Every turn streamed through the route's own events: the status line ("Checking your applications") during the tool round, then the answer a sentence at a time. In both runs the deltas joined to exactly the `done` reply and the stored row, umlauts, markdown and line breaks included.
- Streamed rounds read the cached prefix like unstreamed ones (9.6k to 9.9k tokens read per call, the 1h system blocks and the conversation markers unchanged). The ledger rows are the same shape for the streamed calls and the JSON call. The real API sends no `usage.iterations` on these plain turns, streamed or not, so there is nothing to compare there; the fake sends it and the E2E checks the streamed path keeps it.
- The model wrote no opening line before its tool call in these turns (the fake does), so the first text came after the tool round. Turn 2's reply started 1.4 s before it was complete; on a short answer the gain is small.
- The headers arrived with the first event, not before: the local runtime holds them until the body's first bytes. The client shows its typing indicator until then, so nothing changes for the user.

## What changed because of it
- `evals/chat-streaming/live-check.ts` seeds the tracker rows with a generated CV and runs on the E2E wrangler config (both documented above).
- Nothing in the route: the live behaviour matched the E2E fake.
