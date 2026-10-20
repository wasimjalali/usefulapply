You are a senior staff engineer doing an adversarial review of an implementation plan. Read-only: do not modify, create or delete any file. Do not read `.dev.vars*`, `.env*` or anything under `secrets/`.

## Context
Useful Apply (this repo, your current working directory) is a Next.js 16 app on Cloudflare Workers via OpenNext, with D1 + Drizzle, Better Auth 1.7, Stripe credits, R2, KV and Workers AI. It writes tailored CVs, cover letters and application emails, and has an application tracker and a job feed. Read `AGENTS.md` for the architecture.

The plan to review is `docs/agent-integration/PLAN.md`. It proposes one remote MCP server (OAuth via Better Auth's MCP plugin) packaged as a Claude connector, a ChatGPT plugin and a Claude Code plugin. It covers a service layer, server-side kit persistence, Queue-based generation, a 24-tool catalog, and server-side PDF/DOCX export through Cloudflare Browser Run print routes.

Product goal: an AI agent connected to this server can do everything a signed-in human can do in the app, at the same quality, including exporting a properly formatted CV in any of the 6 templates and a proper cover letter. Exports must be best-in-class for ATS and HR filters in two markets, US/North America and Germany/EU (plan section 4b), and the web app must use the same renderer. Scrutinise section 4b hard: are the ATS rules correct and complete, is DIN 5008 described correctly, will Browser Run's Chromium produce what's claimed (fonts, tagged PDF, text order in two-column layouts), and is the verification strong enough? It must also pass review for both the Anthropic connector directory and the OpenAI (ChatGPT) app directory.

## What to do
1. Read the plan in full.
2. Verify its factual claims against the code. Key places: `src/app/api/**`, `src/db/actions.ts`, `src/db/repos/*`, `src/db/schema.ts`, `src/hooks/useSupabaseSync.ts`, `src/lib/agents/chat-tools/**`, `src/lib/utils/cv-pdf.ts`, `src/lib/utils/cover-letter-export.ts`, `src/components/cv-templates/**`, `src/auth/server.ts`, `src/worker.ts`, `wrangler.jsonc`, `src/lib/credit-costs.ts`. Note anything the plan gets wrong.
3. Critically analyse it. Look for:
   - capabilities a human has that the tool catalog misses;
   - wrong assumptions;
   - security holes: OAuth, token scope, IDOR, render-token leakage, signed URLs, prompt injection through job descriptions or tool output, rate-limit or credit abuse by a looping agent;
   - credit and idempotency bugs, including double charges on MCP client retries and Queue redelivery;
   - race conditions between server-side persistence and the web client's debounced sync;
   - Workers limits: CPU time, wall time, Queue consumer limits, Browser Run timeouts;
   - export fidelity risks: fonts, page breaks, photos, A4 vs Letter, oklch colours, two-column layouts;
   - directory-review rejection risks (tool annotations, commerce rules, OAuth/CIMD/DCR, reviewer account);
   - PR ordering and dependency mistakes;
   - verification gaps;
   - anything simpler that gets the same result.
4. Propose concrete improvements.

## Output format
Return markdown only:
- `## Verdict`: 2 to 4 sentences.
- `## Findings`: a list. Each item is `{ finding, severity: "critical" | "high" | "low" | "none", evidence: file:line or doc reference, fix }`. Order by severity.
- `## Missing from the plan`: capabilities or work items the plan omits.
- `## DISMISSED`: everything you considered and decided is not a defect, with a one-line reason each. Don't leave this empty.

Keep the whole review under 2,000 words. Be specific. Generic advice is worthless here.

## Note for this run
You are reviewing plan v2, which already folds in two earlier reviews (Fable 5.1 and GPT-6.1 Sol, see evals/results/2026-10-20-mcp-plan-review.md). The exports and ATS sections referred to above as 4a and 4b are now sections 5 and 6. Focus on what is still wrong or missing in v2; do not repeat findings v2 already addresses.
