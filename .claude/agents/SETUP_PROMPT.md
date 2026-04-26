# Karko AI Agent Setup Prompt

Paste the prompt below into a fresh Claude Code terminal session (Sonnet 4.6 recommended). The session will create all four project-scoped agents in `.claude/agents/`, update the project `CLAUDE.md` to reference them, verify the setup, and report back.

**Copy from the line below "BEGIN PROMPT" to the line above "END PROMPT" — paste everything in between into the new terminal.**

---

## BEGIN PROMPT

You are setting up four new project-scoped specialist agents for Karko AI. They are meant to live in the project repo at `/Users/wasimjalali/Desktop/Karko_AI/.claude/agents/` so they version-control with the codebase.

All four files are already written and committed to main. Your job is to VERIFY the setup and update the project CLAUDE.md reference. If any file is missing, create it from the spec below.

### Step 1 — Verify files exist

Run:
```
ls -la /Users/wasimjalali/Desktop/Karko_AI/.claude/agents/
```

Expected files:
- `agent-expert.md` (existing)
- `ui-tester.md` (existing)
- `karko-architect.md` (NEW)
- `supabase-dba.md` (NEW)
- `integration-tester.md` (NEW)
- `job-feed-specialist.md` (NEW)

If any of the four NEW files are missing, read the "Agent spec" section below and create them. They have YAML frontmatter with `name`, `model`, `effort`, and `description` fields, followed by a markdown system prompt.

Model IDs in use (Bedrock global):
- `global.anthropic.claude-sonnet-4-6` — for karko-architect, supabase-dba, job-feed-specialist
- `global.anthropic.claude-haiku-4-5-20251001-v1:0` — for integration-tester

Effort levels in use:
- `high` — karko-architect, supabase-dba, job-feed-specialist (decisions and pipeline work deserve deep reasoning)
- `low` — integration-tester (narrow verify-only scope; cheap + fast is the whole point)

### Step 2 — Type-check nothing is broken

Run:
```
cd /Users/wasimjalali/Desktop/Karko_AI && npx tsc --noEmit 2>&1 | grep -v "\.next/types" | head
```

Expect zero output. If errors appear, do not proceed — investigate first.

### Step 3 — Update the project CLAUDE.md's "Karko AI Agents" section

Open `/Users/wasimjalali/Desktop/Karko_AI/CLAUDE.md`. Find the section titled "Karko AI Agents (use proactively — do not ask permission)". Under the "Project-scope agents (this repo)" sub-section, it currently lists `agent-expert` and `ui-tester`. Add four bullet points for the new agents, preserving the same tone and format:

```
- **`karko-architect`** — For cross-cutting design decisions, refactors, and "where should this state live" questions. Use for anything that spans 3+ files or has non-obvious tradeoffs. Returns a plan with ordered steps; does not modify code itself.
- **`supabase-dba`** — When writing or reviewing migrations in `supabase/migrations/`, changing RLS policies, touching schema, or when a query looks suspicious. Will not run migrations itself.
- **`integration-tester`** — Before every commit touching components, hooks, API routes, or job-feed files. Runs tsc + lint + narrow spot-checks. Cheap and fast — uses Haiku 4.5.
- **`job-feed-specialist`** — When editing anything under `src/lib/job-feed/**`, `src/inngest/job-feed.ts`, `src/app/api/job-feed/**`, or `src/components/job-feed/**`. Owns ingestion, prefilter, LLM ranker, batch reconcile, and settings flows.
```

Commit the CLAUDE.md change with message: `docs: add karko-architect, supabase-dba, integration-tester, job-feed-specialist to agent roster`

Do NOT push yet — leave the commit local for the user to review.

### Step 4 — Verify each agent is registered

Run:
```
grep -l "^name:" /Users/wasimjalali/Desktop/Karko_AI/.claude/agents/*.md
```

You should see all 6 files listed (2 existing + 4 new). Confirm each file begins with `---` and has `name:`, `model:`, `description:` fields. `effort:` is optional but should be present on the four new agents.

### Step 5 — Report back

Provide a summary:
- Which files existed, which were created
- tsc output (should be clean)
- CLAUDE.md commit SHA (from `git log -1 --oneline`)
- Any concerns or unexpected state

### Agent spec (use only if you need to create a missing file)

If any of the four new files is missing, use the content that already lives in the repo on `main` — they were committed as part of this session. You can recover them via:

```
git log --all --oneline -- .claude/agents/karko-architect.md
git show <commit>:.claude/agents/karko-architect.md
```

Do NOT invent content from scratch — the author-signed versions are on main.

### Rules while you work

- Do not run `npm run build`.
- Do not push to main.
- Do not touch any file outside `.claude/agents/` and `CLAUDE.md`.
- Do not spawn any sub-agents — this setup task is intentionally single-threaded for clarity.
- If anything is ambiguous, stop and ask the human user rather than guessing.

## END PROMPT

---

## What each new agent is for (quick reference)

| Agent | Model | Effort | Trigger |
|-------|-------|--------|---------|
| `karko-architect` | Sonnet 4.6 | high | Cross-cutting refactors, "where should X live" decisions, 3+ file scope |
| `supabase-dba` | Sonnet 4.6 | high | Writing migrations, reviewing RLS, schema + query review |
| `integration-tester` | Haiku 4.5 | low | Pre-commit verification (tsc + lint + spot checks). Fast and cheap. |
| `job-feed-specialist` | Sonnet 4.6 | high | Any edit under `src/lib/job-feed/**`, `src/inngest/job-feed.ts`, job-feed API routes, or JobFeedPanel |

## Why these models

- **Sonnet 4.6 + high effort** for architect / DBA / job-feed — these agents make decisions with multi-day blast radius. Cheaping out here risks a bad refactor or a silent data bug that costs weeks to unwind. Sonnet 4.6 is the sweet spot of cost vs reasoning depth; Opus 4.7 would be overkill for routine work.
- **Haiku 4.5 + low effort** for integration-tester — narrow, mechanical scope. Runs `tsc` and `grep` and reports. No synthesis required. Using Sonnet here would waste money without meaningful quality gain.
- **No Opus agents** intentionally. Opus is still appropriate for one-off hard bugs where the parent session promotes a sub-agent to Opus explicitly, or when the user says "use the architect with maximum reasoning". Putting Opus in a frontmatter default would quietly drain budget on every invocation.

## About "effort" inheritance

Verified via the Claude Code sub-agents docs: the `effort:` frontmatter field is a per-agent override. When omitted, the sub-agent inherits the parent session's effort. When set, the sub-agent runs at that level regardless of the parent. I've set `effort: high` on the three Sonnet agents so a quick session (user running at medium) still gets deep reasoning from the architect / DBA / specialist when they are spawned.

Resolution order (documented):
1. `CLAUDE_CODE_SUBAGENT_MODEL` env var (overrides everything)
2. Per-invocation `model` param passed when spawning
3. Agent frontmatter `model` / `effort`
4. Parent session's current model / effort

So a user who runs `/effort max` and then spawns `integration-tester` will still get `low` effort on that specific call because the frontmatter wins over session state.
