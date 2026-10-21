# Rewrite claim guard: drawing the line by part of speech (2026-10-21)

## Question

`rewriteCVSection` refuses a rewrite (`unsupported_claim`) when it contains a word that is in neither CV nor the current section and is not "neutral". After PR #165 production still refused almost every summary rewrite for an ordinary word: "went", "evaluated" and "additional" before it, "including" after it. Can the guard stop refusing ordinary words without letting fabricated tools, employers, titles, credentials, degrees, ownership, scope, proficiency or domain claims through?

## Root cause

`introducedClaims()` was default-deny over the whole vocabulary. A word passed only if the CVs or the section backed it, or if it was in `NEUTRAL_WORDS`, a hand list of about 400 English words plus about 50 German function words. English and German together have tens of thousands of words that can't carry a claim, so any common word the model added that wasn't in that list was refused. A second defect made the list weaker than it looked: `isNeutral(w)` checks `NEUTRAL_WORDS.has(claimStem(w))`, but the list holds surface forms, not stems. So "including" (stem "includ") missed even though "include" and "included" are listed, and "evaluated" (stem "evaluat") would miss even if "evaluate" were added. The two-character floor and the compound rule played no part. Every production example (went, evaluated, additional, including) is a verb, adjective or connector, never a noun.

## What changed

The guard now decides first whether a word can carry a claim at all (`carriesClaim` in `unified-writer-agent.ts`), and only then asks for backing:

1. Claim words (`claim-vocabulary.ts`, EN and DE): verbs and adjectives that do carry a claim. That covers seniority, ownership, scope, proficiency, credentials, domain adjectives whose main sense is qualitative ("legal") and tools or employers spelled like ordinary words (Go, Excel, React, Linear). `ROLE_WORDS` is unchanged. These always count.
2. `NEUTRAL_WORDS`: unchanged, plus German forms of its generic nouns.
3. A word written as a name (capitalised mid-sentence, or an acronym anywhere) counts as a claim.
4. A generated lexicon (`claim-free-lexicon.generated.ts`, built by `scripts/build-claim-free-lexicon.ts`) frees function words, verbs, qualitative adjectives and adverbs. English comes from Open English WordNet 2025 (CC BY 4.0). Its lexicographer codes keep relational adjectives ("clinical", "financial", "technical": adj.pert) out, and `-ing` forms that are noun lemmas ("marketing", "engineering") stay out too. German and extra English coverage come from Universal Dependencies 2.18 gold tags: EN-EWT, DE-GSD and DE-HDT, all CC BY-SA 4.0. GUM and LinES were skipped because they're NonCommercial. Nouns and proper nouns are never in the lexicon.
5. Everything else is a claim. Nouns, names, acronyms and unknown words keep the old default-deny.

German text also gets an inflection fold when backing a word ("ruhigem" in the rewrite, "ruhigen" in the CV). It folds within a word class only: a lowercase word against lowercase words, a capitalised noun against capitalised nouns. That keeps "Berater" from being backed by "beraten". The fold is never applied to English, where it would back "researcher" with "researches". `unsupportedInstructionTerms` (the advisory "omitted" list) uses the same `carriesClaim`, so it stops reporting ordinary words. The number guard is untouched.

Cost on Workers: 538 KB raw, 152 KB gzipped, server-only. The set is built on first use (5.5 ms, measured locally under Node), then each call takes 0.23 ms.

## What ran

- `npx tsx evals/rewrite-claim-guard.ts generate --allow-anthropic-api --out evals/results/2026-10-21-rewrite-claim-guard/run --max 59`, after a one-rewrite dry run into `.../dryrun` (`--cases syn-01 --max 1`). That's 60 section rewrites in total.
- Model: `claude-sonnet-5-5` through the eval model shim (arm `sonnet55-low`: adaptive thinking, effort low, no temperature), the production request shape. Nothing touched the production ledger.
- Data: six constructed CVs (`evals/dataset/cvs`, fictional people), four in English and two in German, each paired with a public ad (`syn-01, -04, -08, -11, -15, -16`). The real analysis calls and `generateOptimizedCVData()` wrote a tailored CV. Then the real `rewriteCVSection()` rewrote the summary and two roles' bullets under ten instructions per CV: no note, the production "two sentences, lead with the most relevant experience", sharper, tailor, punchier, tools and impact, shorten, a bait "sound more senior and say I led the team", and a confident tone. The German instructions mirror these.
- Scoring: `npx tsx evals/rewrite-claim-guard.ts score --in evals/results/2026-10-21-rewrite-claim-guard/run`. It runs the guard shipped in PR #165 (frozen verbatim in `evals/rewrite-claim-guard/baseline-guard.ts`) and the new guard on the same stored rewrites. Every term either guard flags is hand-labelled in `evals/rewrite-claim-guard/labels.json` (68 terms):
  - `claim`: unsupported by the CVs.
  - `strict`: a title, ownership or standing word restating something the CV says in other words. Refusing it is by design.
  - `ordinary`: a word that asserts nothing.

  A false refusal is a refusal whose terms are all `ordinary`. The baseline flags every word outside its small list, so every word the new guard frees in these rewrites was flagged by the baseline and so got labelled. A new real-data miss can't hide unlabelled.
- Misses: every rewrite gets one fabrication of each of nine kinds injected: tool, employer, title, certification, degree, ownership lead verb, scope, proficiency and domain. That's 531 variants in total. Fillers the CV already backs are skipped. A miss is an injection none of whose claim words get flagged.
- Cost: $1.11 for the run plus $0.10 for the dry run, 95 calls.

## Numbers

Of the 59 rewrites, 7 came back unchanged and none were refused by the number guard, which leaves 52 changed rewrites to score.

| Changed rewrites | Baseline (PR #165) | New guard |
|---|---|---|
| Applied | 23 | 36 |
| False refusal (only ordinary words) | **23 (44%)** | **10 (19%)** |
| Strict refusal (by design) | 4 | 4 |
| True refusal (real unsupported claim) | 2 | 2 |
| English (36) false refusals | 15 | 7 |
| German (16) false refusals | 8 | 3 |
| Summaries (24) false refusals | 13 | 3 |
| Bullets (28) false refusals | 10 | 7 |
| Dev half (27) false refusals | 8 | 3 |
| Holdout half (25) false refusals | 15 | 7 |

| Injected fabrications | Injected | Baseline missed | New guard missed |
|---|---|---|---|
| All | 531 | 10 | 10 |
| Tool, employer, certification, degree, proficiency, domain | 354 | 0 | 0 |
| Title | 59 | 2 | 2 |
| Ownership | 59 | 3 | 3 |
| Scope | 59 | 5 | 5 |

The dry-run rewrite was applied by both guards, and both caught all 9 of its injections.

**Real-data claims.** The two true refusals come from one German rewrite style. "arbeite sicher mit SAP CRM, SAP SD (Anwender), MS Office und MS Teams" extends a proficiency the CV states for one tool to every tool. The new guard catches both.

**Misses.** All 10 are the same injections under both guards, caused by backing rules that predate this change:
- The compound-part rule lets "intern" (internship) back "international" (5 misses) and the verb "führe" back "Geschäftsführer" (2 misses).
- Stem backing lets "on my own" back "Owned" (3 misses).

**What the 10 remaining false refusals are.** Mostly generic nouns: "hands-on" (twice), "topics", "core", "relationships", "foundation", "explanation", "practice", "decisions", "Kollegen", "Auftragsabwicklung" and "Zahnärztin". Two are verb forms the lexicon doesn't cover: "raising", which WordNet also lists as a noun, and the German first-person past tense "assistierte". Nouns stay claims by design, because domain nouns, tools and products are nouns too.

## What was tuned after seeing data

The dev/holdout split was fixed before scoring: even rows are dev, odd rows holdout. These changes came after the first scoring pass. Each is a general rule, not a word list, and each applies to both halves:

1. Casing is ignored for closed-class words. "mein" was dropped because headlines capitalise it.
2. The German class-split inflection fold and first-person verb forms ("Betreue", "Halte") were added, prompted by dev rows 44 and 46.
3. "sicher" was added to the German proficiency stems, prompted by rows 40 (dev) and 43 (holdout).
4. A sweep of the domain-adjective vocabulary through the lexicon added the ones it frees ("legal", "regulatory", "mechanical", "wirtschaftlich" and so on), prompted by 8 "legal" misses in the injections.

The first scoring pass of the new guard gave 11 false refusals and 2 real-data misses ("sicher"). Its first miss count was 21: 8 of them "legal", plus 3 injections the CV actually backed, which the eval's filler chooser now skips.

## Conclusion

The guard stops refusing ordinary words. False refusals fall from 23 to 10 of 52 changed rewrites, and in summaries, the surface from production, from 13 to 3 of 24. It catches every injected fabrication the shipped guard catches. The residual false refusals are generic nouns, which is a deliberate line: deciding which nouns are generic needs a semantic test (for example WordNet noun hypernyms), and that would be the next step if the noun residual matters. The 10 shared misses are pre-existing backing holes, listed below to fix separately.

## Deferred

- Generic nouns (hands-on, topics, relationships) are still refused: 8 of the 10 residual false refusals.
- Pre-existing backing holes in both guards: the compound-part rule's substring match ("intern" in "international", "führe" in "Geschäftsführer"), and stem backing of role words from the source ("own" backing "owned").
- The German separable verb "führte ... durch" counts as the ownership verb "führte" and is refused unless a source has it.
- Licensing: the generated word list adapts CC BY-SA 4.0 data, so it carries that licence (attribution is in the file header). HDT's running text is licensed for academic use and its annotation is CC BY-SA. Only isolated word forms with their tags are shipped. This is Wasim's call to confirm.
