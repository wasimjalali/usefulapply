# Opus 5.5 vs Sonnet 5.5 vs Gemini 4 Argon as coding agents (2026-10-13)

## Question

Gemini 4 Argon is new in the Devin CLI. Where does it stand as a coding agent on real Useful Apply work: closer to Sonnet 5.5 or to Opus 5.5? And what does each cost, how fast is it and how many tokens does it burn?

## Short answer

Argon is a Sonnet-class coder, not an Opus-class one, and on this harness it's the most expensive way to get Sonnet-level work. All three models solved both tasks and passed every automated check. The differences were in judgment, speed and token use:

| | Opus 5.5 high | Sonnet 5.5 high | Gemini 4 Argon high |
|---|---|---|---|
| Blind quality rank (Codex judge) | 1st on both tasks | 2nd overall (3rd on A) | 3rd overall (2nd on A) |
| Judge scores, Task A / Task B (of 10) | 10 / 9 | 9 / 8 | 9 / 7 |
| Wall time, both tasks | 462 s | **317 s** | 745 s |
| Cost at Devin list prices, both tasks | $1.89 | **$0.91** | $1.43 |
| Output tokens, both tasks | 39.8k | 39.1k | 83.3k |
| Uncached input tokens | 156k | 160k | 906k |
| Lines added | 179 | 229 | 346 |

Argon's list price is a quarter of Opus's and half of Sonnet's per token. It lost that edge by writing about twice as many output tokens, reading about six times as much uncached input (cache hit rate 61 to 71% against 88 to 94% for the Claude models) and taking the longest. On the harder task it ran 632 s against Sonnet's 238 s and cost $1.18 against Sonnet's $0.72.

## Key findings

Each one stands on its own and is backed by the numbers below.

1. **Argon is Sonnet-class, not Opus-class.** Blind judge scores: Opus 10 and 9, Sonnet 9 and 8, Argon 9 and 7. Argon tied Sonnet's score on the small task (ranked just ahead of it) and came last on the harder one.
2. **Cheap per token isn't cheap per task.** Argon's list price is a quarter of Opus's, but the whole eval cost $1.43 on Argon against $0.91 on Sonnet and $1.89 on Opus. It wrote 2.1x the output tokens and read 5.7x the uncached input of the Claude models.
3. **Cache behaviour is part of the bill.** Argon reused 61 to 71% of its input from cache, against 88 to 94% for Opus and Sonnet. Together with its larger output, that gap ate Argon's price advantage.
4. **Sonnet was the fastest on both tasks.** 79 s and 238 s. Opus took 141 s and 320 s, Argon 113 s and 632 s. On the harder task Argon took 2.7x Sonnet's time.
5. **Argon thinks out loud.** On the harder task its session carried 56.6k characters of visible reasoning, against 16.0k for Opus and 12.1k for Sonnet. A large share of its extra output was visible reasoning, and its diff was also about twice as big.
6. **Tests didn't separate the models. Judgment did.** All three passed every automated check, including a hidden 17-case acceptance test they never saw. The differences only showed up in a blind code review.
7. **Opus's edge was small judgment calls.** It wrote the cleanest fix for the scripts. It was also the only model to add a prompt line telling the model the subject is set elsewhere, so it doesn't write one into the email body.
8. **Sonnet showed the most initiative on structure.** It put the subject builder in its own module because the eval's prompt variants replace the prompt file wholesale and would have hidden the helper. Nobody asked for that. Its one weak call: a CommonJS workaround that lets a missing dependency exit with success.
9. **Argon overbuilt.** Its diff on the harder task was +321 lines against +153 for Opus, with unnecessary exports and behaviour outside the spec.
10. **A real run caught what everything else missed.** The spec (mine) split titles at any `/`, so "Senior/Software Engineer II" became "Senior". All three models, the hidden test and the blind judge passed it, because they all checked against the same spec. One live Sonnet 5.5 kit on a real ad title caught it.
11. **The grader can be wrong too.** The first version of the hidden test marked Opus's helpful prompt line as a failure (15/17). The first judge run missed a new file in Sonnet's patch. Both were caught, corrected for every model and recorded.
12. **When blocked, the models behaved differently.** In the first harness setup Devin's edit tool was refused. Opus and Argon stopped. Sonnet worked around it by editing files through the shell. Whether that's resourcefulness or ignoring a guardrail depends on why the block was there.
13. **Harness setup is a real confound.** In Devin's print mode, one refused shell command ends the session, so a narrow allow-list measures the list, not the model. Two setups were thrown out before any scoring until all three models had the same fair conditions.
14. **Reviewers break rules too.** A Sonnet subagent reviewing PR #142 ignored its read-only brief, ran an image script and left a stray file in the worktree.
15. **The whole eval cost about $6.** $4.23 for the scored Devin runs, $1.28 for the discarded setups and $0.46 of live Anthropic API calls, with the judge and reviews on subscription.

## What ran

- **Harness:** Devin CLI 3000.11.3, print mode (`devin -p --prompt-file`), one fresh session per model per task, `--permission-mode accept-edits` with a fixed shell allow-list (`harness/devin-config.local.json`). The same brief, tools and repo state for every model. Models: `claude-opus-5-5-high`, `claude-sonnet-5-5-high`, `gemini-4-argon-high`. High is Argon's top level, so this compares each model at its best common setting.
- **Repo state:** `main` at `38f59306`, one git worktree per run.
- **Concurrency:** the three models ran in parallel for each task, so CPU contention from `tsc` and ESLint was the same for all of them.
- **Task A, lint gate** (bug-hunt follow-up #10): fix 16 ESLint errors in 7 files without disabling rules, including a React setState-in-effect, and add two ignore globs. Brief: `harness/brief-a-lint.md`.
- **Task B, email subjects in code** (follow-up #6): build the application and follow-up email subjects in code (localized prefixes, a 60-character cap with a three-step fallback, missing-value rules), make the prompts body-only, keep every caller working. Brief: `harness/brief-b-subjects.md`.
- **Scoring:**
  1. Objective. Task A: ESLint errors, `tsc`, `node --check`, no `eslint-disable`, no rule changes (`harness/grade-a.sh`). Task B: `tsc`, the existing test suite, ESLint on touched files and a hidden 17-case acceptance test the models never saw (`harness/hidden-subjects.test.ts`, `harness/grade-b.sh`). The hidden test fails 17/17 on the untouched baseline.
  2. Blind review. The six diffs were renamed X/Y/Z (`judge/judge-key.txt`: X Sonnet, Y Argon, Z Opus) and judged by Codex (GPT-6 Sol, high reasoning, read-only), a different vendor from all three contestants (`judge/JUDGE-BRIEF.md`, verdict `judge/judge-codex.md`). I (Opus, the orchestrator) also read every diff. I'm the same family as one contestant, so the ranking above is Codex's.
  3. Real model. The winning Task B code ran through the existing eval harness (`evals/run-eval.ts`, arm `sonnet55-low`, production prompts) on synthetic cases syn-09 (EN) and syn-16 (DE) against the live Anthropic API.
- **Metrics:** from each session's Devin export (ATIF-v1.7 `final_metrics` and per-step metrics). Cost = uncached input × input price + cached input × cached price + output × output price, at the prices `devin models list` showed on 2026-10-13 (USD per 1M tokens, input / cached / output): Opus 4 / 0.20 / 20, Sonnet 2 / 0.10 / 10, Argon 1 / 0.05 / 5. `metrics.py` computes it.

## Results

### Task A, lint gate

All three: 0 ESLint errors, `tsc` clean, scripts pass `node --check`, no disables, both ignore globs added, and the same auth-page fix (derive from `useSearchParams` during render). The difference was in the three Node scripts:

- **Opus:** ESM imports plus `import.meta.dirname`. The cleanest diff (Argon's is two lines shorter). Judge: 10.
- **Argon:** ESM plus the `fileURLToPath(import.meta.url)` `__dirname` shim. Correct, more boilerplate. Judge: 9.
- **Sonnet:** kept CommonJS by moving `await import()` inside the functions. It works without a module warning, but a missing dependency now reaches `.catch(console.error)` and exits 0. Sonnet also changed `let tableLines` to `const` instead of deleting the dead variable. Judge: 9.

| | wall | turns | tool calls | output tok | cache hit | cost |
|---|---|---|---|---|---|---|
| Opus | 141 s | 13 | 31 | 9.1k | 93% | $0.53 |
| Sonnet | **79 s** | 7 | 26 | 6.7k | 88% | **$0.19** |
| Argon | 113 s | 9 | 33 | 9.0k | 62% | $0.25 |

### Task B, email subjects in code

All three passed `tsc`, lint and their updated test suites, and scored 17/17 on the hidden acceptance test after one correction to the test (below). All three removed the subject rules from the prompts the same way. The difference was in judgment around the spec:

- **Opus (9):** private helpers in the writer agent, one candidate list measured after cleanup. It was the only one to add a prompt line telling the model the subject is set separately, so it doesn't put one in the body.
- **Sonnet (8):** the same algorithm in a new module, `prompts/email-subjects.ts`, explicitly because the eval prompt variants replace `email-prompts.ts` wholesale and would shadow the helper. That's a good catch nobody asked for.
- **Argon (7):** correct, but the most code (+321 lines): exported prefix maps, separate raw and cleaned length checks, and extra behaviour outside the spec (it truncates an overlong name when there's no title, and cuts inside a single word). The judge gave it four lows, two of them unique (cutting inside a single word, truncating an overlong name).

| | wall | turns | tool calls | output tok | uncached in | cache hit | cost |
|---|---|---|---|---|---|---|---|
| Opus | 320 s | 18 | 45 | 30.6k | 104k | 94% | $1.36 |
| Sonnet | **238 s** | 18 | 56 | 32.3k | 114k | 94% | **$0.72** |
| Argon | 632 s | 23 | 44 | 74.3k | 716k | 71% | $1.18 |

Argon's export carried 56.6k characters of visible reasoning on Task B, against 16.0k for Opus and 12.1k for Sonnet. A large share of its extra output was visible reasoning rather than code.

### The real-model check found a spec bug none of the models could

The first live Sonnet 5.5 run on syn-09 produced `Application: Senior, Priya Raman` for the ad title "Senior/Software Engineer II, Backend". The spec (mine) said to split a title at any `/`, which also breaks German gendered forms such as "Medizinische/r Fachangestellte/r". All three models implemented the spec faithfully, and the hidden test and the blind judge both passed it, because they checked against the same spec. Only running the real pipeline on a real ad title caught it. The fix (only a spaced ` / ` or ` | ` separates) was rerun live and gave `Application: Senior/Software Engineer II, Backend` (both subjects are in `realcheck/*/sonnet55-low/intermediates/syn-09.rep1.json`). Body-only JSON parsed first time on all six live email calls (three kits), with no retries.

## Caveats

- One run per model per task, two tasks. Opus ranked first on both tasks and overall, which matched my own reading. Sonnet and Argon swapped places between tasks (on Task A both scored 9 and the judge ranked Argon above Sonnet). This is a small sample, not a benchmark.
- These are Devin list prices, not invoices, and Devin's token counts. Whether `completion_tokens` includes hidden reasoning isn't documented, so treat output-token comparisons across vendors as indicative.
- The Devin harness (tool schemas, system prompt, caching) may suit some models better than others. Argon's low cache hit rate could be partly the harness's doing.
- **Harness attempts that didn't count** (kept in `invalid-attempts/`): attempt 1 used `--sandbox`, where Devin's edit tool can't be approved in print mode. Opus and Argon stopped, and Sonnet worked around it by editing through the shell. Attempt 2 used a narrow allow-list, and any refused command ends a print session, so all three stopped within 27 s. The scored runs use a broader allow-list that the brief lists explicitly, the same for every model. Nobody reran until all three had a fair setup.
- **Two corrections to my own grading, applied to every model:** (1) v1 of the hidden test failed any prompt line mentioning "subject", which marked Opus's helpful "the subject is set separately" line as a failure (15/17). v2 checks for subject rules instead (`harness/hidden-subjects.v1-strict.test.ts`, `grade-b.v1-strict.jsonl`). (2) The first judge run omitted Sonnet's new untracked file from its patch. It was stopped, the patches were regenerated with `git add -N`, and the judge was rerun. Only the complete run counts.
- One reviewer subagent (Sonnet) broke its read-only brief during the review of PR #142 and ran an image script that wrote a stray file into a worktree. It was deleted before merge.

## Cost of the eval

- Devin runs (scored): $4.23 at list price, from Opus $1.89, Sonnet $0.91 and Argon $1.43. The invalid attempts used another 1.63M tokens ($1.28) and are in their folders.
- Live Anthropic API check: $0.46 (3 kits, 30 calls on Sonnet 5.5: 89.4k input, 22.3k output, 41.2k cache read and 20.6k cache write tokens at $2 / $10 / $0.20 / $2.50 per 1M).
- Codex judge and reviews: subscription.

## What changed because of it

- **Shipped:** Opus's implementations of both tasks: PR #142 (lint gate) and PR #143 (email subjects in code), each through the review loop (Sonnet, plus Codex for #143). They carry the spec fix found live and the review lows (`.mjs` scripts, unspaced en and em dashes, a single overlong word, control characters). ESLint now reports 0 errors on `main`.
- **Model routing, as evidence rather than a rule change:** Sonnet 5.5 stays the default worker. It was fastest and cheapest, and its quality was a close second. Opus earns its cost where judgment matters (spec gaps, prompt wording). Argon isn't worth routing work to through Devin today: Sonnet-level output at a higher real cost and twice the time. Worth retesting if its cache behaviour or verbosity changes.
- **Process:** a real-pipeline run belongs in the acceptance check for any prompt or contract change. Here it caught what a spec-derived test, three models and a blind judge all missed.

## Reproduce

```
# set REPO (the repo checkout) and EVAL_DIR (a working folder holding the briefs); worktrees eval-<task>-<model> from main 38f59306,
# each with harness/devin-config.local.json copied to .devin/config.local.json
harness/run.sh a opus   claude-opus-5-5-high
harness/run.sh a sonnet claude-sonnet-5-5-high
harness/run.sh a argon  gemini-4-argon-high
harness/grade-a.sh <model>; harness/grade-b.sh <model>
python3 harness/metrics.py <eval dir>
codex exec -C <clean worktree with judge/> -s read-only -c model_reasoning_effort="high" -o judge-codex.md - < judge/JUDGE-BRIEF.md
TSX_TSCONFIG_PATH=<worktree>/tsconfig.json npx tsx <worktree>/evals/run-eval.ts --arm sonnet55-low --allow-anthropic-api --only syn-09,syn-16 --out <dir>
```

Raw data in `2026-10-13-devin-coding-agents/`: `runs/<task>-<model>/` (sanitized Devin exports with system prompt and loaded rules removed, stdout, diff, timing, hidden-test output), `metrics.json`, `grade-*.jsonl`, `judge/`, `realcheck/`.
