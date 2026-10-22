---
paths:
  - "src/lib/models/**"
  - "src/lib/agents/**"
  - "src/lib/services/**"
  - "src/lib/job-feed/**"
  - "src/app/api/**"
  - "evals/**"
---

# Prompt caching (Anthropic API)

Source: Anthropic docs, read 2026-10-22: prompt-caching, tool-use-with-prompt-caching, cache-diagnostics. Re-read them before changing a cache layout. Every LLM call in the app takes every cache opportunity, and its hit rate is measured.

## How the cache works (the parts that bite)
- The cache key is a hash of the whole prefix in the order `tools` → `system` → `messages`, up to the block marked `cache_control`. One byte different anywhere before the marker is a miss.
- A write happens only at a marker. A read walks back at most 20 blocks from each marker looking for an entry an earlier request wrote. It never finds "stable content behind the marker" on its own. So put the marker on the last block that's identical across the requests you want to share, never on a block that changes every request.
- Up to 4 markers per request. Markers cost nothing; only writes and reads are billed.
- Minimum cacheable length is 512 tokens on Haiku 5.5 and Sonnet 5.5. Shorter prefixes silently don't cache (both cache fields read 0). If a prefix is just short, growing it to 512 can pay for itself.
- A cache entry is usable only after the first response that wrote it has started. Parallel requests sent at once all miss.
- Caches are per workspace on the Claude API. All app traffic uses one key in one workspace.
- Lifetime counts from the start of the request, including generation time. Each hit refreshes it for free.

## What invalidates
| Change | Invalidates |
|---|---|
| Tool definitions (name, description, schema, order, JSON key order) | everything |
| `system` text | system and messages |
| `tool_choice`, `disable_parallel_tool_use` | messages |
| Images present vs absent | messages |
| Thinking config or `output_config.effort` | messages always; on some models system and tools too |
| Model | everything (cache is per model) |
| Dropping or editing a thinking block from an earlier assistant turn | messages from that point |

Measured on claude-haiku-5-5 and claude-sonnet-5-5 (P0b probe, evals/results/2026-10-22-haiku-55-swap.md), which overrides the generic table for these two models:
- Changing `output_config.effort` (low, medium, high or omitted) invalidated nothing. Omitting `thinking` behaves as adaptive and invalidated nothing.
- `thinking: {type: "disabled"}` on Haiku 5.5 invalidated everything, tools and system included. Sonnet 5.5 rejects `disabled` (it wants `{"type": "between_tools"}`).
- `tool_choice` auto to none invalidated nothing, and switching back read the same entry.
- `output_config.format` adds about 186 tokens to the prompt and changes the cache key: a call with a format can't read an entry written without one. Two calls with the same format share.
- A different tool description is a full miss, so sites that share a prefix need byte-identical tools.
Re-run evals/haiku-55-swap/cache-probe.ts before relying on these for a new model.

Consequences for us:
- Each call site keeps one fixed model, effort and thinking config anyway, so its behaviour is predictable. Sites with different effort can still share a cached prefix; sites must match on model, tools, system, thinking mode (adaptive vs disabled) and format.
- Never use `thinking: disabled` on a Haiku site that should share a cache with others.
- A chat may switch to `tool_choice: none` for a final round without losing the cache, but on a first round Haiku can return empty content with none: handle empty content as a loud failure.
- Pass thinking blocks back unchanged. Haiku 5.5 and Sonnet 5.5 preserve them, so the cache stays valid.
- Per-turn dynamic instructions (today's date, app state, a mode switch) go in a mid-conversation `{"role": "system"}` message appended to `messages`, never into the top-level `system`. Haiku 5.5 and Sonnet 5.5 support this without invalidating the prefix.
- Serialize tool schemas and any JSON we put in a prompt deterministically (stable key order). Tool order is fixed.

## Layout rules
1. Order: tools, then static system instructions, then per-user stable context (CV, master CV, profile), then per-request content (job ad, question, history), then the incoming message.
2. No timestamps, request ids, random ids, user names or counts inside a cached prefix.
3. Markers:
   - one-shot calls with a varying tail: explicit marker on the last static block (end of system, or end of the per-user context block). Not automatic caching: it would mark the varying last block.
   - multi-turn chat: automatic caching (top-level `cache_control`) or a marker on the last message, so each turn reads the previous turn's prefix. Add an explicit marker on the system/stable-context block too. With long tool loops, add a second marker so the 20-block lookback always reaches an earlier write.
4. Share prefixes across sites where model/effort/tools match: the same CV block, in the same bytes, before site-specific instructions.

## TTL
- 5 minutes (write 1.25x) where the same prefix is hit more often than every 5 minutes (feed ranking system prompt across users, kit writers fanning out, tool loops inside one request).
- 1 hour (write 2x) where a user pauses: the chat's stable prefix (tools + system + CV), since users often answer after more than 5 minutes. Longer TTL markers must come before shorter ones in the same request.
- Haiku 5.5 prices (≤100k prompt): input $0.10, 5m write $0.125, 1h write $0.20, read $0.01, output $0.50 per MTok. Cached reads and writes count toward the 100k prompt-length tier.
- Sonnet 5.5: input $2, 5m write $2.50, 1h write $4, read $0.10 (0.05x), output $10.

## Parallel calls and pre-warming
- When one context feeds several parallel calls (the kit writers: CV, letter, emails), calls sent at the same moment all miss and each pays a full write (measured). Either warm the shared prefix first with a `max_tokens: 0` request (same model, tools, system, thinking; marker on the shared block), or stream the first call and start the rest at its `message_start` event (measured: they hit, 0.2 to 0.7 s later than a simultaneous start, much earlier than waiting for completion).
- `max_tokens: 0` is rejected with `stream: true`, `thinking.type: enabled` (extended thinking), structured outputs (`output_config.format`) or a forced `tool_choice` (`tool` / `any`). The thinking and effort config must match the real calls or the warm-up writes an entry nobody reads, so pre-warm only sites whose real calls use adaptive thinking or none. Sites with extended thinking, a forced tool or structured outputs stagger instead (first call, then the rest once it has started). Measured: the warm-up works with adaptive thinking at effort low on both models; with `output_config.format` it's a 400, so format sites stagger on `message_start`.
- Batch API: cache hits are best effort. Write the shared prefix with a 1-hour marker in a single first request, then submit the rest.

## Compaction
- The compaction block goes first in `messages`, so the prefix after `system` changes once at compaction. Put a marker right after the compaction block so the next turns read it.

## Our layout per site
Read from the code on 2026-10-22. Change a site and this table in the same PR. "Shared" means the same bytes for every user, "per user" means the bytes depend on one user's data.

| Site | Cached blocks (marker TTL) | Shared or per user |
|---|---|---|
| Haiku `chat` | tools + static system (1h), stableContext: document flags, CV and master CV summaries (1h), the compaction block when there is one (1h), new user turn (5m), last tool result (5m) | system shared; stableContext, block and turns per user |
| Haiku `chat` compaction | same tools and system (1h each), the earlier block (1h), the last compacted turn (5m) | per user |
| Haiku `screening` | static prompt (1h), applicant block as stableContext: saved start date and salary rules, then the CVs (1h); the fenced `<application_context>` block and the question are in the last user turn, uncached | static shared; applicant block per user |
| Haiku `tracker` | static system (5m, about 545 tokens, close to the 512 minimum), APPLICATIONS block opening the user turn (5m, `buildTrackerMessages`); TODAY and the message follow it, uncached | system shared; applications per user |
| Haiku `language` | static system (5m), far under 512 tokens so no entry is written | shared (uncached in practice) |
| Haiku `ranking` | static system (5m), user profile as stableContext (5m); candidates are in the user turn, uncached | system shared; profile per user |
| Haiku `search_strategy`, `career_profile` | static system (5m); profile or CV and the date are in the user turn, uncached | shared |
| Sonnet `optimize_cv`, `rewrite_cv_section` | writer system blocks (1h); no user-message marker | shared; the section rewrite reads the kit's CV system block |
| Sonnet `write_cover_letter`, `write_email`, `write_follow_up_email` | writer system blocks (1h); end of the first attempt's user message (5m) so a validation retry reads it; regenerate also marks the session context (1h) | system shared; user message per application |
| Sonnet `fit_assessment` | system blocks (5m); static evaluation framework at the head of the user message (5m) | shared |
| Sonnet `parse_job`, `skill_matching` | `parse_job`: plain system prompt marked (5m); `skill_matching`: static matching rules at the head of the user message (5m) | shared |
| Sonnet `extract_applicant`, `extract_metrics` | the whole user prompt (5m); depends on the CVs only, not the job | per user |
| Sonnet CV parsing (`parse-cv-core.ts`, `parseDocumentAsCV`) | none: the document comes first and the system prompt is short | n/a |

- Chat runs `cacheConversation: false` and places its own 5m markers (new user turn, last tool result), so a request carries at most 4 markers: two 1h system blocks, then two 5m. After a compaction the block takes the third (1h) marker, and on tool rounds the new user turn gives its 5m marker to the last tool result (round 0's entry at the turn is still inside the lookback, and the next request reads it from its own marker).
- A saved application's history comes from D1 in a fixed order (`created_at`, `rowid`), every turn rendered by `chatTurnText`, so each turn's prefix replays the previous turn's byte for byte. Only a local `session-` conversation still slides a 10-message client window (and misses past it).
- The per-turn state (time, the pasted-ad lines for the latest and an unanswered earlier message) goes after the marked user turn in a `role: system` message, so it never breaks the read.
- The four writers do not share a prefix with each other (each opens with its own instructions), so a kit fan-out does not pre-warm anything. The 1h system blocks are warm from earlier kits instead.
- `jsonMode` adds the JSON-only rule as an unmarked block after the marked system blocks, or inside the marked block when the system is a plain `systemPrompt`. Either way it is part of the prefix.
- A failed-over request goes to Bedrock with the same markers. Bedrock keeps its own cache, so the first request after a failover is a full write.

## Measure and test
- Total prompt = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`. `input_tokens` alone is only the uncached tail. Budget guards (100k) and cost tracking use the sum, plus `usage.iterations` when compaction ran.
- Every call logs per-site `cache_creation_input_tokens`, `cache_read_input_tokens`, `input_tokens` and the TTL split (`cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`) to PostHog `$ai_generation`. Hit rate = read / (read + write + uncached input).
- Each site has a test that builds two different requests and asserts the cached prefix (everything up to the marker) is byte-identical.
- Chat growth measured: each turn reads everything before it and writes only the new turn, about 90 to 93% hit rate from turn 3. Mixed TTL (1h marker on system, 5m automatic on the conversation) works; 5m before 1h is a 400.
- When a hit rate drops, use cache diagnostics: send `diagnostics: { previous_message_id }` and read `cache_miss_reason` (model_changed, system_changed, tools_changed, messages_changed, ...). Only fingerprints are stored, no prompt text.
