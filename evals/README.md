# evals: Sonnet 4.6 vs Sonnet 5.5 for the Useful Apply kit

Question: should the Claude kit tasks and CV parsing move from Sonnet 4.6 to Sonnet 5.5? Writing quality and grounding come first, then cost and latency. Write-up: `results/2026-10-12-sonnet-46-vs-55.md` (the 2026-10-07 file is the superseded Bedrock-era plan).

## Phase sequence

Bedrock is no longer used. Both models run on the Anthropic API (same network path, fairer latency).

1. Dataset, harness, failure modes, deterministic scorer (built).
2. All arms on the Anthropic API: arm A `sonnet46-api`, then B arms `sonnet55-low` and `sonnet55-medium`. Needs `--allow-anthropic-api` and `ANTHROPIC_API_KEY`. The three arms are independent processes and can run in parallel (quality pass), then the latency reps run one at a time per arm.
3. Deterministic scoring per arm folder.
4. Judge: Claude Opus 5.5 blind pairwise (`judge.ts`), three comparisons.
5. Re-judge: GPT-6 Astra via Codex at xhigh on a 30% sample of synthetic pairs (`build-rejudge.ts`), agreement with Opus.
6. Report (`report.ts`), then the Fable 5.1 critical analysis of the report and the write-up.
7. Owner blind review, decision, write-up update (`results/2026-10-12-sonnet-46-vs-55.md`).

## Arms

| Arm | Model | Request shape |
|---|---|---|
| `sonnet46-api` (A) | `claude-sonnet-4-6` | Production-identical: `MODEL_CONFIGS` temperature and max_tokens, same system blocks and `cache_control`, JSON-only suffix, no thinking. Non-streaming. |
| `sonnet55-low` (B) | `claude-sonnet-5-5` | No temperature/top_p/top_k, `thinking: {type: "adaptive"}`, `output_config: {effort: "low"}`, no prefill, no `tool_choice`, no `fallbacks`. Same system blocks, run with the `sonnet55` prompt variant. |
| `sonnet55-medium` (B) | `claude-sonnet-5-5` | Same with `effort: "medium"`. |
| `sonnet46-bedrock` | Bedrock Sonnet 4.6 | Kept in code, unused. |

B-arm `max_tokens` = max(4000, 4 x production value), because thinking counts toward it and the tokenizer uses about 30% more tokens: parse_cv 32768, extract_applicant 16384, parse_job 16384, skill_matching 8192, extract_metrics 8192, fit_assessment 4000, optimize_cv 40000, write_cover_letter 8192, write_email 4096, write_follow_up_email 4000. Above 16000 the client streams (`messages.stream(...).finalMessage()`), otherwise a plain `messages.create`. Response text is read by block type (thinking blocks skipped). `stop_reason` is recorded for every call, including `refusal` with `stop_details`. Refusals are not retried on another model: the server-side `fallbacks` parameter is deliberately not used, a refusal is a failure of that arm (F13). The installed `@anthropic-ai/sdk` 0.71.2 has no types for adaptive thinking or `output_config`, so the request is built as a plain object and cast at the call (`lib/client.ts`); the SDK forwards the body unchanged.

## Two ways to run the B arms

- **End to end (chain):** the arm runs the whole kit itself, so its analysis stage (applicant, job, skill match) differs from A's. Answers "what happens if we switch the model everywhere".
- **Identical inputs (writing only):** `--inputs-from sonnet46-api` reuses A's stored analysis (applicant, job, match, verified metrics) for the same case and rep, and runs parse_cv plus the writing tasks (fit_assessment, optimize_cv, cover letter, email, follow-up) on the B arm. Each B document chain still builds on its own earlier documents (its CV feeds its letter and so on). Output goes to a separate folder `<arm>__on-sonnet46-api`, so it never mixes with the chain results. Run arm A first. Isolates writing quality from extraction differences.

## Files

| Path | What |
|---|---|
| `dataset/cases.jsonl` | 30 cases (schema below) |
| `dataset/build-cases.ts` | Rebuilds cases.jsonl: fetches the public ads, reads the private owner subset |
| `dataset/cvs/*.txt` | 6 constructed CVs (fictional people, example.com contacts) |
| `run-eval.ts` | Runner (resumable, JSONL append, concurrency 4 by default) |
| `lib/client.ts` | Eval-only provider client (Anthropic API with streaming above 16000 max_tokens and dry-run; Bedrock kept) |
| `lib/pricing.ts` | Prices: Sonnet 4.6 $3/$15, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20 per MTok; cache write 1.25x, cache read 0.1x input |
| `lib/judge-common.ts` | Rubric, verdict schema, seeded positions, pair resolution, document extraction |
| `judge.ts` | Opus 5.5 blind pairwise judge |
| `build-rejudge.ts` | Blind packets for the second-vendor re-judge, plus the merge and agreement parser |
| `report.ts` | Aggregate tables and JSON for the write-up (numbers only) |
| `lib/models-shim.ts`, `lib/hooks.ts` | Replace `@/lib/models` so the real agent code runs without the D1 ledger |
| `lib/pipeline.ts` | One kit: parse_cv, extract_applicant, parse_job, extract_metrics, skill_matching, fit_assessment, optimize_cv, cover letter, email, follow-up |
| `lib/arms.ts` | Arm definitions |
| `lib/parse-cv.ts` | Vendored parse-cv prompt with a drift check against the route |
| `score-deterministic.ts` | Deterministic scorer for the failure modes below |
| `prompt-variants/<name>/` | Eval-only replacements for prompt modules (`sonnet55`, see `CHANGES.md`) |
| `results/` | Write-ups and raw outputs on non-owner cases |
| `private/` | Ignored by git: owner CV, owner ads, raw outputs on owner cases |

## Dataset schema (`cases.jsonl`, one JSON object per line)

`id`, `origin` (`owner` or `synthetic`), `language` (`en` or `de`, the ad language, verified by reading), `tags`, `jd` (public ads, inline) or `jd_ref` (`private:owner_jds.json#<session id>`), `cv_ref` (`cv:<file>` or `private:owner_cv.json`), `source_url` (public ads only), `notes`.

Composition: 30 cases, 24 EN and 6 DE. 14 owner cases (10 EN, 4 DE, owner CV plus master CV) and 16 synthetic cases (14 EN, 2 DE) on 6 constructed CVs. Public ads come from Greenhouse boards (Coinbase, Datadog, Elastic, Figma, Cloudflare, Duolingo, GitLab, Okta, Airbnb) and the ottonova Personio feed. Hard cases: thin CV, career changer, senior with a gap, seven bait cases (the ad demands skills the CV lacks), long ads (8.5k to 10.4k characters).

## How a kit runs

The harness calls the real `unifiedWriterAgent` methods and prompt builders in the order the two production orchestrators use. `@/lib/models` is redirected to a shim, so the request is built exactly as `callAnthropic()` builds it (same `MODEL_CONFIGS` temperature and max tokens, same system blocks and cache markers, same JSON-only suffix) but nothing is written to the production ledger and no credits move. The provider client sends the same body to the Anthropic API (the Bedrock paths remain in code, unused). It adds stop_reason, usage including cache tokens, retries and raw output to every call record.

Differences from production, all deliberate: the language is taken from the case (the detector is a Workers AI task); a failed step is recorded and the kit continues instead of stopping; SDK retries are done in the client so they can be counted; parse_cv runs on the primary CV only and its output does not feed generation (production generates from the stored raw text).

## Failure modes (written before the scorer)

Every way an output can fail. `score-deterministic.ts` checks each one. IDs appear in its report.

| ID | Failure | Check |
|---|---|---|
| F1 | Fabricated number (also percent, money, years) in CV, letter, emails, fit text | digit tokens not in the CV text or master CV. A number found only in the ad is reported separately (`jd_only_number`) because a letter may quote company facts |
| F2 | Fabricated employer, job title, degree or institution in the optimized CV | every company, position and institution is matched against the CV text with claim-token normalization |
| F3 | Fabricated skill or tool in the optimized CV skills list | each skill's tokens must appear in the CV text |
| F4 | Claimed skill the matcher said is missing (fabrication bait) | a `missingSkills` term appearing in letter or emails. Candidates only, needs manual review |
| F5 | Fabricated contact details or name in extract_applicant and the CV header | email, phone, name must appear in the CV text |
| F6 | Unknown named entity in prose (possible invented employer or product) | capitalized mid-sentence terms in neither the CV nor the ad. Candidates only |
| F7 | Em dash U+2014 (and en dash used as a dash) | counted on the raw model output, before production's `sanitizeDashes` |
| F8 | Voice rules from AGENTS.md "Copy & Voice" | Oxford comma in English, filler openers (Great, Sure, Absolutely), exclamation marks, cover-letter blacklist phrases |
| F9 | Wrong language | stopword ratio of each document against the case language |
| F10 | German formality | German letters and emails must use Sie and a formal greeting, no du/dein addressed to the company |
| F11 | Length | fit assessment over 200 words or missing the three headings, cover letter over 420 words, email subject over 60 characters, application email over 4 sentences, follow-up over 80 words, wrong `recommendedDelay` |
| F12 | Invalid JSON or schema on JSON tasks | parse_cv, extract_applicant, parse_job, skill_matching, extract_metrics, optimize_cv, both emails |
| F13 | API-level failure | stop_reason `max_tokens` (truncation), `refusal`, content filter, empty output, HTTP error after retries |
| F14 | Truncation without a stop_reason | JSON that does not close, prose ending mid-sentence |
| F15 | Placeholders left in text | `[Name]`, `[Company]`, `[Your ...]` |
| F16 | Copying the ad | a run of 12 or more words identical to the ad in the letter |
| F17 | Wrong identity | applicant name missing from letter or email signature, target company missing from the letter |
| F18 | Production validation miss | the real validators (fit, letter, emails, CV payload, applicant profile) threw; counted per task from the kit record |

Limits: F1 to F6 are token matches and miss paraphrased claims. Bait cases need manual review of the F4 and F6 candidates. Quality (voice, specificity, tone) is not scored here, that is the judge phase.

## Commands

All paths below use `R=evals/results/2026-10-12-sonnet-eval`. Credentials: the runner loads `.env.local` and `.dev.vars` into the process (never printed) and needs `ANTHROPIC_API_KEY`. Every paid script refuses without `--allow-anthropic-api`; add `--dry-run` to any of `run-eval.ts` and `judge.ts` to build requests with no network, key or flag (the run prints one built request per task).

```bash
R=evals/results/2026-10-12-sonnet-eval

# 1. quality pass, 30 cases, 1 rep. The three arms are separate processes; run them in parallel (three terminals, or & and wait).
npx tsx evals/run-eval.ts --arm sonnet46-api   --allow-anthropic-api --out $R &
npx tsx evals/run-eval.ts --arm sonnet55-low   --prompt-variant sonnet55 --allow-anthropic-api --out $R &
npx tsx evals/run-eval.ts --arm sonnet55-medium --prompt-variant sonnet55 --allow-anthropic-api --out $R &
wait

# 1b. identical-inputs writing runs (needs arm A done)
npx tsx evals/run-eval.ts --arm sonnet55-low    --prompt-variant sonnet55 --allow-anthropic-api --inputs-from sonnet46-api --out $R &
npx tsx evals/run-eval.ts --arm sonnet55-medium --prompt-variant sonnet55 --allow-anthropic-api --inputs-from sonnet46-api --out $R &
wait

# 1c. arm C: Sonnet 4.6 on the sonnet55 prompts, 16 synthetic cases. --tag suffixes the output folder (sonnet46-api__prompts-sonnet55)
npx tsx evals/run-eval.ts --arm sonnet46-api --prompt-variant sonnet55 --tag prompts-sonnet55 --allow-anthropic-api --only syn-01,syn-02,syn-03,syn-04,syn-05,syn-06,syn-07,syn-08,syn-09,syn-10,syn-11,syn-12,syn-13,syn-14,syn-15,syn-16 --out $R

# 2. latency reps: 10 cases, reps 2 and 3, one at a time per arm (concurrency 1). Arms can still run in parallel with each other.
npx tsx evals/run-eval.ts --arm sonnet46-api --allow-anthropic-api --out $R --latency-set --reps 2,3 --concurrency 1
npx tsx evals/run-eval.ts --arm sonnet55-low --prompt-variant sonnet55 --allow-anthropic-api --out $R --latency-set --reps 2,3 --concurrency 1

# 3. deterministic scoring (folder names: sonnet46-api, sonnet55-low, sonnet55-medium, sonnet55-low__on-sonnet46-api, ...)
npx tsx evals/score-deterministic.ts --run $R --arm sonnet46-api

# 4. Opus 5.5 judge: three comparisons, repeat with the __on-sonnet46-api folders for the identical-inputs mode
npx tsx evals/judge.ts --run $R --a sonnet46-api  --b sonnet55-low    --allow-anthropic-api
npx tsx evals/judge.ts --run $R --a sonnet46-api  --b sonnet55-medium --allow-anthropic-api
npx tsx evals/judge.ts --run $R --a sonnet55-low  --b sonnet55-medium --allow-anthropic-api
npx tsx evals/judge.ts --run $R --a sonnet46-api__prompts-sonnet55 --b sonnet55-low --allow-anthropic-api   # arm C vs 5.5-low

# 5. second-vendor re-judge (synthetic cases only), per comparison
npx tsx evals/build-rejudge.ts build --run $R --a sonnet46-api --b sonnet55-low
codex exec -C $R/rejudge -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only \
  -o $R/rejudge/codex-sonnet46-api__vs__sonnet55-low.md - < $R/rejudge/brief-sonnet46-api__vs__sonnet55-low.md
npx tsx evals/build-rejudge.ts merge --run $R --a sonnet46-api --b sonnet55-low --codex $R/rejudge/codex-sonnet46-api__vs__sonnet55-low.md

# 6. report: markdown block for the write-up plus JSON
npx tsx evals/report.ts --run $R --mode chain
npx tsx evals/report.ts --run $R --mode fixed
```

Rerunning any step resumes: finished kits and judge passes are skipped. The judge shows the JD, the source CV and two outputs labelled Output 1 and Output 2, never an arm or model name. Each pair is judged twice with positions swapped (seeded, `--seed`); disagreeing passes count as a tie. Judge calls use Opus 5.5 at effort high with adaptive thinking and `output_config.format` JSON schema. Owner-case verdicts are written to `evals/private/results/<run>/judge/`. A missing document counts as a loss for that arm without a judge call. The re-judge key (packet to case and arm order) is written to `$R/rejudge-key/`, outside the folder Codex reads.

Output folders: `--tag <name>` suffixes the arm's folder (`<arm>__<name>`), so an extra variant of the same arm (arm C, 4.6 on the `sonnet55` prompts) never mixes with the arm's main results. With `--inputs-from` the folder ends in `__on-<arm>` after the tag. Pass the full folder name to `score-deterministic.ts --arm`, `judge.ts --a/--b` and `report.ts`.

Prompt variants: `--prompt-variant <name>` makes a prompt module in `evals/prompt-variants/<name>/` replace the production module with the same file name (cover-letter-prompt.ts, cv-prompt.ts, email-prompts.ts, fit-assessment-prompt.ts). Arm A uses `production`. The 5.5 arms are run with `--prompt-variant sonnet55` (`prompt-variants/sonnet55/CHANGES.md`); the arm table above describes their request shape only.

## Privacy

`evals/private/` is in `.gitignore`. It holds the owner CV, the 14 owner ads, and every raw call and intermediate on owner cases (`evals/private/results/<run>/<arm>/`). Committed results contain only synthetic cases and aggregate numbers for owner cases. Public ad text is committed with its source URL. Synthetic CVs are fictional (example.com and example.org contacts).

Raw call logs over 5 MB are committed gzipped (`calls.jsonl.gz`). Run `gunzip -k <file>` before re-scoring or re-judging that arm.

Reproducibility: the published per-kit cost, token and latency means and the 30-case judge tables include the 14 owner cases, whose raw calls and verdicts stay in the gitignored `evals/private/`. From the repo alone you can re-derive the 16 synthetic cases; the write-up's synthetic-only tables are those numbers. Local paths in committed logs are redacted to `<repo>`, `<scratch>` and `~`.
