# Rewrite claim check by model: does it free ordinary words without letting claims through? (2026-10-21)

> Status: **gate failed. Don't merge as is.** False refusals fell from 19 to 9 of 52 (target: under 10%, so 5 or fewer). The model also freed 11 claim words that main's word guard catches (target: 0). The branch `feature/rewrite-claim-model-check` holds the code, this write-up and the raw results. Nothing was tuned after scoring.

## Question

`rewriteCVSection` refuses a rewrite (`unsupported_claim`) when the word guard (`introducedClaims`) flags a word that's in neither CV nor the current section. After PR #171, 19 of 52 real rewrites (37%) were still refused for ordinary words ("stayed", "additional", "release"). Freeing words by a word list (PR #170) kept leaking claims (see `2026-10-21-rewrite-claim-guard.md`). Can a model judge the flagged words by meaning against the CVs, cutting false refusals below 10% while freeing nothing main catches?

## What was built

1. The word guard runs exactly as on main. If it flags nothing, nothing changes and no model is called.
2. The flagged words are split (`splitIntroducedClaims`):
   - **Refused without the model:** a word written as a name anywhere in the rewrite (capitalised mid-sentence, in capitals, mixed case, a capital after a line break in prose), a `ROLE_WORDS` word, every word in a list section (`custom_section_items`), any word with a digit, and every word of a rewrite in a language other than English or German (the only languages measured). The case rule is the one #171 already uses (`writtenAsWords`, the same scan as `freedByStemCase`).
   - **Judged by the model:** the rest, which are lowercase words, or capitals opening a sentence of prose or a bullet.
3. If any word is refused without the model, the rewrite is refused with no model call, naming those words. The outcome is already decided, so the call would cost money and about 2 s for nothing. This is one deviation from the brief, which had the refusal name the model's words too.
4. Otherwise the verifier (`verifyJudgedClaims`, task `verify_rewrite_claims`) gets the Primary CV, the Master CV, the section before, the rewrite and the judged words, each in a delimited data block with angle brackets neutralised. It returns `{ term, verdict: ordinary | supported | unsupported, evidence, reason }` per word. Validation is strict: an unknown word, a duplicate, a verdict outside the three, or a malformed entry fails the whole answer. "supported" counts only when `evidence` is a real passage of a CV (whitespace, case and quote marks folded, at least 4 characters). A quote from the section or anywhere else counts as unsupported.
5. The rewrite is applied only when nothing is refused. An error, a timeout (60 s), invalid JSON or a missing word refuses every judged word. There's no retry in our code. The SDK client already retries transport errors twice with backoff (its default, shared by every call). That's a second deviation: the brief said at most one retry.
6. Model config is the same as `optimize_cv`: Claude Sonnet 5.5 on the Anthropic API, adaptive thinking, effort low, no temperature (temperature 0 on the 4.x fallback shape). `maxTokens` is 2048, which scales to 8000. The system block is static and cached. The ledger records the call like every `callModel` call (operation `verify_rewrite_claims`, parent generation = the rewrite). The regenerate route sends a PostHog `$ai_generation` with step `section_rewrite_claim_check`. It's never charged to the user.

The system prompt is in `src/lib/agents/prompts/claim-check-prompt.ts`.

## What ran

```
npx tsx evals/rewrite-claim-guard.ts model-check --out evals/results/2026-10-21-rewrite-claim-model-check/plan --plan
npx tsx evals/rewrite-claim-guard.ts model-check --out evals/results/2026-10-21-rewrite-claim-model-check/dryrun --allow-anthropic-api --limit 6
npx tsx evals/rewrite-claim-guard.ts model-check --out evals/results/2026-10-21-rewrite-claim-model-check/run --allow-anthropic-api --budget 12
```

- Model: `claude-sonnet-5-5` through the eval shim (arm `sonnet55-low`, the production request shape), 2026-10-21. It doesn't touch the production ledger.
- Data: the 59 stored rewrites and kits of the round 1 run (`2026-10-21-rewrite-claim-guard/run/`), 52 of them changed. Labels: `evals/rewrite-claim-guard/labels.json`, unchanged. Every word the new check refuses is a word main flags, so no new labels were needed.
- Misses are scored at claim level, which is stricter than production. "Main catches" means main flags a claim word of the case. The check catches it when a claim word is refused without the model, or when the model, asked about every judged word of that text (even where production wouldn't ask, because another word already refuses), refuses a claim word main flagged.
- Sets:
  - All 531 original injections (521 caught by main).
  - All 190 probes (179 caught by main).
  - 639 held-out injections: a stratified sample (language x kind, proportional with a floor of 20) of the 14,138 that main catches, seed `20261021`. All 13 strata and both languages are covered (`plan.json`).
  - 40 new adversarial cases (`evals/rewrite-claim-guard/adversarial.ts`), written before the run: ordinary words combined into ownership, supervision, authorship, equity, scope, tenure, award, publication, certification and fluency claims, two each in EN and DE.
- Cost: $3.28 for the run (821 verifier calls) plus $0.007 for the dry run (1 call). The cap was $12.

## Numbers

**Stored rewrites (52 changed):**

| | Main (word guard) | Model check |
|---|---|---|
| Applied | 23 | 39 |
| False refusal (only ordinary words) | 19 (37%) | **9 (17%)** |
| Strict refusal | 8 | 3 |
| True refusal | 2 | 1 (the other true refusal is still refused, now naming "Mitarbeiter", a word refused without the model) |
| English (36) false refusals | 12 | 3 |
| German (16) false refusals | 7 | 6 |

The 9 that are still refused:
- 5 hold a capitalised German noun, which is refused without the model by design: kontakt/kollegen, auftragsabwicklung, bereich/auszubildende, zahnaerztin/zahnarzt, beratung. That's a floor of 5. Even a perfect model can't get below 10% with this split.
- 4 the model refused: foundation/explanation, prepare, turning/operational/decisions, konsequent.

Both real claims ("arbeite sicher mit SAP CRM, ...") stay refused. The model freed five `strict` words, each a restatement the CV makes in other words. That's what "supported" means, but main refuses them by design: holding, responsibility, hold (twice) and beherrsche. Of 52 changed rewrites, 21 reached the model.

**Misses (claim words main catches that the check frees):**

| Set | Cases | Main catches | Judged by the model | New misses |
|---|---|---|---|---|
| Original injections | 531 | 521 | 203 | **2** |
| Probes | 190 | 179 | 149 | **1** |
| Held-out sample | 639 | 639 | 413 | **8** |
| Adversarial | 40 | 38 | 38 | **0** (2 missed by main too) |

The 11 new misses, with the model's verdict:

| Set, case | Injected | Verdict and evidence |
|---|---|---|
| injections syn-04-19 | "working in fluent English" | supported: "Languages: English (native), French (school level)" |
| injections syn-16-56 | "Führte" replacing the bullet's first verb | ordinary ("billing", read as "abführen") |
| probes probe-130 | "Mit ruhigem Verkaufsstil." | supported: "Ein ruhiger, beratender Verkaufsstil." |
| heldout syn-16-53 | "Erfahrene" | supported: "... mit sechs Jahren Praxiserfahrung ..." |
| heldout syn-15-42 | "Erfolgreiche" | supported: "Steigerte den Jahresumsatz meines Gebiets von 3,1 auf 4,2 Mio. EUR" |
| heldout syn-11-38 | "Authored" opening a bullet | ordinary ("a plain synonym for Prepared") |
| heldout syn-11-32 | "Graduated" opening a bullet | supported: "B.S. Finance \| University of Illinois Chicago \| 2015 - 2019" |
| heldout syn-11-36 | "Held" opening a bullet | supported: "Own the monthly forecast and variance reporting ..." |
| heldout syn-04-18 | "Served" opening a bullet | ordinary ("replacing Taught") |
| heldout syn-08-21, syn-08-20 | "Sr. engineer." | supported: "Senior Backend Engineer" |

The misses fall into two kinds:
- **Real misses, verdict "ordinary" on a claim verb:** Führte (ownership), Authored (authorship), Served (duty). These are the dangerous ones: no evidence was asked for and none was checked.
- **"supported" with a real quote that backs a nearby fact, not the claim word's strength:** fluent from native, Erfahrene from six years, Erfolgreiche from a revenue increase, Held from "Own", ruhigem from ruhiger, Graduated from a degree with dates, Sr. from Senior. Some are defensible readings: Sr. is Senior, native covers fluent, and the injection filter didn't know the CV already backed them. Others are upgrades the rules forbid: "erfolgreich" is an evaluation, "Held" restates ownership. Main refuses all of them.

**Adversarial:** the model refused a claim word in all 38 cases main flags ("took over", "a stake in", "the playbook behind", "won a company prize", "allein verantwortet", "mühelos verhandelt", "staatlich geprüft" and so on). Main misses 2, so the check misses them too, because the model only sees flagged words: "a warehouse team of 12 who reported to me" ("reported" is neutral by stem) and "ausbildungsberechtigt" (the compound rule backs it from "Ausbildung").

**Verifier:** 821 calls, 0 failures, 0 invalid answers. $0.0040 per call on average (input 922k, output 132k, cache reads 1.14M tokens, the system block cached after the first call). Latency p50 1.9 s, p95 3.6 s, max 8.7 s. On the stored rewrites the verifier ran on 21 of 52 changed rewrites (40%), for $0.0018 per changed rewrite.

## Conclusion

The model check does what it was built for on real data: English false refusals fall from 12 to 3 and the applied count rises from 23 to 39, at about $0.004 and 2 s per call. Both real claims stay refused, and so do all 38 adversarial combinations main flags. It fails both gates:

1. **11 new misses where main catches the claim.** Three are "ordinary" verdicts on claim verbs (Führte, Authored, Served). Eight are "supported" verdicts backed by a real but weaker quote. The quote check proves the quote exists, not that it states the claim at the same strength.
2. **False refusals 9 of 52 (17%).** Five come from capitalised German nouns the design keeps away from the model, so the target can't be met without changing the split.

Per the brief, I stopped here and didn't tune the prompt or the split to these cases. Options for a next round (Wasim's call, each needs a fresh held-out set):
- Make "supported" require the evidence quote to contain the claim word or its stem, or move verbs opening a bullet to the deterministic side. Either closes most misses but gives back some false refusals.
- Let the model judge capitalised German nouns. That would remove the 5-row floor, but it widens what the model can free.
- Accept "supported" only for words that aren't role-adjacent, using a reviewed list of standing, authority and credential verbs and adjectives that stay deterministic (the #170 lesson says this list will leak).

## What changed

Nothing ships from this run. The code is on the branch. If merged unchanged, it would free the 11 claim types above.

## Files

- `run/summary.json`: every number above. `run/results-*.jsonl`: per case, with route, verdicts, latency and tokens. `run/calls.jsonl.gz`: every verifier call (request bodies stripped). `run/plan.json`: the case counts and held-out strata.
- `dryrun/`: the one-call dry run. `plan/`: the free plan run.
- `run.stdout.txt`: the run's console output.
