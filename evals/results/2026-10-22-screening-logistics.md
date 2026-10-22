# Screening answers: does the model use the applicant's own availability, and only theirs?

Date: 2026-10-22. PR #173 (`fix/no-invented-availability`), after the arbiter's ruling.

## Question

Screening answers ("When can you start?", "What are your salary expectations?") used to see only a 3,000-char cut of the Master CV and never the uploaded Primary CV. A keyword scan quoted "likely" logistics lines to the model. Two failures followed from that:

- A German applicant with "Ab sofort verfügbar" in the CV header got "nach Ablauf meiner Kündigungsfrist", a notice period they'd said they don't have.
- A product bullet like "Sofort verfügbar: Self-Service-Portal ..." could be quoted to the model as a possible availability.

The ruling removed the scan. Screening now reads both CVs in full, server-side, each capped at 20,000 chars with a `[truncated]` marker, fenced as applicant data, with static instructions on where a statement sits and what doesn't count. The question here: with the shipped prompt on the production model, does the answer use a stated availability, ignore look-alikes and stay silent on salary?

## What ran

- Model: `@cf/openai/gpt-oss-120b` on Workers AI. Default reasoning (medium), temperature 0.4, `max_tokens` 8000. That's the same call shape as `generateScreeningReply` / `callWorkersAI`: one system message, then the question as the user turn (the MCP path).
- Prompt: the real `buildScreeningPrompt` imported from `src/lib/services/screening.ts`. Each run file stores the full system prompt per case under `prompts`.
- Proxy: `evals/screening-logistics/worker.ts` under `wrangler dev` (wrangler 4.123.0). Its `AI` binding is remote and uses wrangler's own login, and the harness never touches credentials.
- Fixtures: `evals/screening-logistics/fixtures.ts`, all fictional people with example.com contacts. Each case also carries a tailored CV, as in production, and that tailored CV drops the header line.
- Grader: deterministic regexes in `run.ts`, applied to the answer text inside the first `---ANSWER_START---` block with the repeated question removed.

Command:

```
npx wrangler dev -c evals/screening-logistics/wrangler.jsonc --port 8799
npx tsx evals/screening-logistics/run.ts --url http://localhost:8799 --runs 5 --label run-N
```

| Case | Setup | Pass when |
|---|---|---|
| a | DE applicant with a current role, "Ab sofort verfügbar" only in the Primary CV header. Q: "Wann können Sie anfangen?" | says sofort, never Kündigungsfrist |
| b | Same CV without that line, plus the bullet "Sofort verfügbar: Self-Service-Portal für 2.000 Nutzer eingeführt." The ad says "zum nächstmöglichen Zeitpunkt". | "nach Ablauf meiner Kündigungsfrist", no sofort / umgehend / kurzfristig, no digits |
| c | EN, "Notice period: 3 months" at char 12,129 of a 14,086-char Master CV, with distractors ("Negotiated notice period clauses in supplier contracts", "available immediately after the 2023 data centre failover"). Q: "When can you start?" | mentions 3 months, never immediately |
| d | EN, no salary anywhere, the ad says "£65,000 - £75,000", the CV has a "salary benchmarking dashboard" bullet. Q: "What are your salary expectations?" | no digit, no currency |

## Results

| Round | Prompt | a | b | c | d | Cost |
|---|---|---|---|---|---|---|
| run-1 | as ruled ("if the applicant stated it, use exactly that") | 4/5 | 5/5 | 0/5 (1/5 regraded) | 5/5 | $0.0268 |
| run-2 | stated value "including its length or date" | 4/5 | 5/5 | 2/5 | 5/5 | $0.0267 |
| run-3 | stated and standard split into steps 1 and 2; "read the CVs themselves, not only the optimized CV"; "lines right under the name" | 5/5 | 5/5 | 3/5 | 5/5 | $0.0333 |
| run-4 | plus "a stated notice period counts as stated even when the question asks for a start date" | 5/5 | 5/5 | 5/5 | 5/5 | $0.0278 |
| run-5 | same as run-4, confirmation | 5/5 | 5/5 | 5/5 | 5/5 | $0.0276 |

Total cost: $0.14 for 100 calls, at $0.35 per M input and $0.75 per M output tokens. Median latency was 2.9 to 3.9 s per round.

What the failures were:

- **c, runs 1 to 3.** The model found "Notice period: 3 months" every time; its reasoning says so. It still answered "I can start after my notice period." That canned answer contains the words "notice period", so the model read it as the stated-case answer. A second reason it gave in run-3: "hasn't stated a specific start date, so use the standard rule". Splitting the rule into step 1 (stated, with length or date) and step 2 (only when nothing is stated), then saying a notice period answers a start-date question, fixed both.
- **a, run-2 #3.** The model read only the experience section and concluded nothing was stated. Pointing at "the lines right under the name" and saying the optimized CV drops such lines fixed it: 15/15 since.
- **Degenerate output.** a run-1 #2 and c run-3 #5 returned 8,000 tokens of "!" with `finish_reason: length`. That's 2 of 100 calls, both under prompts that answered correctly on the other runs. It's a model-side failure, not a logistics one, and it's counted as a fail here.
- **Grader fix.** In run-1, c #4 answered "3‑month" with a non-breaking hyphen (U+2011), which the first regex missed. The grader accepts it from run-2 on. run-1's raw file keeps its original grades.
- **Fixture fix.** run-1's Master CV was only 6,287 chars, under the ~15k target. From run-2 on it's 14,086.

The look-alikes never leaked, in any of the 74 answered runs of b, c and d (c run-3 #5 was the degenerate one): no "sofort" from a product bullet, no "immediately" from a failover bullet, no figure from the ad's salary range or the benchmarking bullet.

## Conclusion

With the full CVs in the prompt, gpt-oss-120b finds a stated availability in the header (case a) and a notice period 12k chars deep (case c). It doesn't mistake a product or system line for the applicant's availability. The ruling's prompt alone wasn't enough for a stated notice period, though: the model fell back to the canned sentence. The stated-first, standard-second structure got the final prompt to 40/40 over two rounds.

Token cost: case c's prompt is about 4.9k input tokens against about 2.1k without a Master CV. A worst case of two 20k-char CVs adds roughly 10k tokens, about $0.0035 per call.

## What changed because of it

- `src/lib/services/screening.ts`: the start-date rule is now two steps. Step 1: a stated availability, notice period or start date goes in with its length or date exactly as stated, and a stated notice period counts for a start-date question. Step 2: only when nothing is stated, the standard date-free answer. The logistics check now says to read the uploaded and master CVs themselves, not only the optimized CV, and to look at the lines under the name first.
- Not changed: the degenerate "!" outputs. They're a model or serving issue worth tracking separately: the chat route would show them as the reply, and the MCP tool rejects them as unformatted and hands the turn back.

## Files

- `evals/screening-logistics/`: `run.ts` (harness and grader), `fixtures.ts`, `worker.ts` and `wrangler.jsonc` (proxy).
- `evals/results/2026-10-22-screening-logistics/run-{1..5}.json`: every raw response, usage and grade, plus the exact system prompt per case.
