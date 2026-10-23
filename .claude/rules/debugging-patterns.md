---
paths:
  - "src/app/api/**/*.ts"
  - "src/lib/agents/**/*.ts"
  - "src/store/**/*.ts"
  - "src/hooks/**/*.ts"
  - "src/lib/models/**/*.ts"
  - "src/db/repos/**/*.ts"
  - "src/components/**/*.ts"
  - "src/components/**/*.tsx"
---

# Debugging patterns (Useful Apply)

Read this first when root-causing a runtime bug. Find the cause, name it in one sentence ("<component> does X when <condition>, which causes <symptom>"), then propose the smallest fix. Form at least two hypotheses and test the cheapest first. Do not force-fit a pattern below if the symptom doesn't match.

## Failure patterns we have hit

| Pattern | Where | Smell |
|---|---|---|
| **Context cache TTL expired mid-flow** | `src/app/api/agent-v2/route.ts` (30-minute TTL, `CONTEXT_CACHE` KV with an in-memory `Map` fallback) | Phase 2 generation falls back to `full_optimization` with no client-visible reason |
| **`useSessionStore` persist-rehydrate vs sync fetch** | `src/store/useSessionStore.ts` + `src/hooks/useSupabaseSync.ts` | Refresh shows old session content; race between persist-rehydrate and the sync fetch |
| **Anonymous to authed CV migration loss** | `src/app/api/parse-cv/route.ts`, `src/hooks/useSupabaseSync.ts` | Anonymous upload disappears after sign-in; check session_id reassignment |
| **SSE event ordering** | `src/app/api/agent-v2/route.ts`, `src/components/chat/useAgentWorkflow.ts` | `fit_analysis_complete` arrives after generation starts; client-side buffering or out-of-order parse |
| **Stripe webhook idempotency** | `src/app/api/stripe/webhook/route.ts` | Credits granted twice or zero times; check `event.id` dedupe (`hasWebhookEvent`) and signature verification |
| **Concurrent `deductCredits` race** | `src/db/repos/credits.ts` (`deductCredits`) | Negative or double-spent credits; check the optimistic-concurrency `version` check |
| **Zustand selector returning a stale ref** | components subscribing to derived objects | UI doesn't re-render despite a store update; the selector returns a new object each render or compares by ref |
| **`userId` from the request body** | API routes | Auth bypass; `userId` must come from the Better Auth session (`getCurrentUser()`) |
| **Unexpected Bedrock failover** | `src/lib/models/providers.ts` (`isFailoverError`, `AWS_BEARER_TOKEN_BEDROCK`, `BEDROCK_REGION`) | Ledger rows with provider `bedrock` or PostHog `llm_provider_failover`: the primary returned a 5xx or a network error. A Bedrock 403 or 404 means model access isn't enabled for that model in the AWS account |
| **Em dash in agent prompts** | `src/lib/agents/prompts/**` | Output reads as AI slop; U+2014 is forbidden in user-facing strings |

## Hard prohibitions

1. No `try/catch` added only to silence an error, and no fallback values (`?? 0`, `|| []`) that hide an upstream bug.
2. No fix without a named root cause, and no shotgun "try X and see" changes. Instrument first.
3. No "while I'm in here" cleanup. One bug, one fix; list the rest as deferred.
4. **No mocking the DB to test a fix.** We have hit production bugs from this.
5. **No `@ts-ignore`, `@ts-expect-error` or `as any` to pass the build.** Fix the type, or report the type problem as the root cause.
6. Auth, Stripe and credit changes are the Sensitive review row. Propose them with file:line and flag them.

## Hand off

- Bug in prompt construction or SSE event semantics inside `src/lib/agents/**` → `agent-expert`.
- Fix touches 3+ files or needs a structural decision → `karko-architect`.
- Schema or query-plan cause → `d1-dba`.
