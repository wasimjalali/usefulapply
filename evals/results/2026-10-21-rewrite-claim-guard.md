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

**What the 10 remaining false refusals are** (corrected in round 2). 9 of the 10 contain at least one noun: "hands-on" (twice), "topics", "core", "relationships", "foundation", "explanation", "practice", "decisions", "Kollegen", "Auftragsabwicklung" and "Zahnärztin"/"Zahnarzt". The tenth is "raising", a verb form WordNet also lists as a noun. Rows with a noun also hold "operational" (a relational adjective, a domain word by design), "nachvollziehbar" and the German first-person past tense "assistierte". The first version of this paragraph called them "mostly generic nouns" and left "operational" out. Nouns stay claims by design, because domain nouns, tools and products are nouns too.

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
- Licensing: the generated word list adapts CC BY-SA 4.0 data, so it carries that licence (attribution is in the file header). HDT's running text is licensed for academic use and its annotation is CC BY-SA. Only isolated word forms with their tags are shipped. This is Wasim's call to confirm. *Superseded in round 2: Wasim dropped HDT.*

## Round 2 (2026-10-21): fail closed

### Question

Review of round 1 (Opus and Sonnet, PR #170) found three ways the part-of-speech guard let through claims that `origin/main` refuses. Can the guard still stop refusing ordinary words while refusing everything `origin/main` refuses as a claim?

### What the reviewers found, and the causes

1. **Names at the start of a segment.** `claimCapitalisedWords()` skipped the first word of every sentence, line and bullet. List sections are joined with newlines, so every item was "first". Any name whose lowercase form was in the lexicon passed: "Convex", "Perforce", "Welsh", "Photoshop", "Google" (a WordNet verb), and also lowercase "at google".
2. **Claim words the lexicon freed.** WordNet frees every qualitative adjective and every verb with no noun reading, which takes in proficiency, standing, credential, scope and authority words: knowledgeable, excellent, eminent, competent, orchestrated, presided, administered, sworn, notarized, citywide, kompetent, hervorragend and so on. CLAIM_WORDS could never list them all.
3. **The German fold backed claim words from another form.** "zu leiten" backed "leite ich das Team", "leitenden Angestellten" backed "leitende Entwicklerin", "Rechnungen geprüft" backed "geprüfte Bilanzbuchhalterin".

Round 1's own injections couldn't see any of this: they were the guard's own claim words, always capitalised, always mid-sentence.

### What changed

The lexicon is no longer "every verb, adjective and adverb WordNet or a treebank knows". It's a short, reviewed list.

- **Reviewed and attested only.** A lemma is a candidate only if the UD treebanks attest it (verbs twice, adverbs and adjectives five times). Every candidate (936 English and 1,398 German verbs, 525 and 695 adjectives, 182 and 228 adverbs, 201 and 287 function words) was read against a written rubric. The rubric excludes authority, credentials, standing and evaluation, proficiency, traits, scope, domain and nationality. The rejections are in `scripts/claim-lexicon-review.ts` with a category each. A rare word nobody reviewed ("orchestrated", "masterminded", "preeminent") is never freed. The build hashes every candidate list and stops if a corpus or threshold change adds a word nobody reviewed.
- **Adjectives are never freed.** Most leaks were adjectives, and an adjective can turn a neutral noun into a claim ("manual testing"). The adjective review still decides which forms need exact backing.
- **Verbs only in inflected forms.** "built", "evaluated", "including", "betreue" are free. The bare lemma isn't: that's where products collide with verbs ("resolve", "ramp", "grab", "make"). Neither is a form that's also a noun lemma or that the treebank reads as a name in 5% of sightings or more ("United").
- **Participles reviewed as adjectives.** Every freed verb form that WordNet lists as an adjective (English, 510 forms) or that GSD tags as one (German, 313) was reviewed again. "committed", "devoted", "connected", "sought", "bemüht", "vernetzt", "eingehend" and a few more are out.
- **Capitals.** Mid-sentence capitals, acronyms and every capital in a `custom_section_items` item are names, and in English they outrank NEUTRAL_WORDS ("Microsoft Teams", an item reading "Make"). A capital opening a sentence or bullet frees only a function word, an inflected verb or a NEUTRAL_WORDS entry, so "Keep families informed" and "Cut close from 9 days to 6" still pass, as on main. A chat instruction's opening imperative is ignored.
- **Exact backing.** Claim words, role words, every form of a rejected lemma and German agent nouns ("Leiter", since "Leitern" are ladders) are never backed through the German fold.
- **German separable verbs.** "bildete das Team aus" is joined to "ausbildete" and refused, because the review rejected "ausbilden" even though "bilden" is free. The build emits particle + every form of the base verb for each rejected particle verb, so strong verbs ("schloss … ab") are covered too.
- **Dotted degrees.** "B.S.", "M.B.A.", "Ph.D." become one token. Split at the dots they were one-letter words the two-character floor dropped, so "completed an M.S." checked nothing.
- **Claim words.** Verb claim words are listed as lemmas and every form is generated (championing, licensing, accrediting, publishes, held…). "hold", "earn", "obtain", "beherrschen" and a handful of German stems were added.
- **The instruction check** uses the same rules, so "knowledgeable in welsh" is reported. Because it's only advisory, it also frees reviewed adjectives and bare reviewed verbs, so "lead with the most relevant experience" reports nothing.
- **Licence.** UD_German-HDT is dropped. Sources are now Open English WordNet 2025 (CC BY 4.0), UD 2.18 EN-EWT and DE-GSD (CC BY-SA 4.0). The build pins each file's URL, release tag and sha256, and the generated header credits the creators. The list is an adaptation shared under CC BY-SA 4.0.

Cost on Workers: 320 KB raw, 78 KB gzipped (round 1: 538 KB and 152 KB). First use takes 5.6 ms, then 0.02 ms per call (Node, local).

### Options measured

Re-scoring the stored rewrites is free, so the adjective question was measured, not argued:

| Option | False refusals (of 52) | New held-out misses | New lowercase-brand misses |
|---|---|---|---|
| Round 1: every WordNet qualitative adjective and verb | 10 | 8,035 | 26 |
| Reviewed adjectives and adverbs, -ly adverbs derived from them | 10 | 0 | 1 (gladly) |
| No adjectives, reviewed adverbs except -ly | 11 | 0 | 0 |
| No adjectives or adverbs | 12 | 0 | 0 |
| **Shipped: no adjectives, reviewed treebank adverbs, no derived adverbs** | **11** | **0** | **0** |

The middle rows were measured on intermediate lexicon builds (`option-*.json`). The shipped row is the final build.

### What ran

- `npx tsx scripts/build-claim-free-lexicon.ts --corpora <folder>`: the inputs are checksum-pinned in the script.
- `npx tsx evals/rewrite-claim-guard.ts score --in evals/results/2026-10-21-rewrite-claim-guard/run --scores scores-round2.json`
- Round 1's guard on the same sets: commit `cc8d6f38` in a temporary worktree, `--guard <that worktree>/src/lib/agents/unified-writer-agent.ts --scores scores-round1-guard.json` (gzipped).
- No model calls. Cost $0. The 59 stored rewrites from round 1 are the data.
- **Held-out set** (`evals/rewrite-claim-guard/heldout.ts`), written before round 2 was scored. It holds the reviewers' probes plus new items: names opening a sentence or bullet, new first sentences, new list items, lowercase brands, 74 English and 76 German proficiency, standing and trait adjectives (German in several inflections), 70 authority, credential and evaluation verbs, 27 scope words, and German separable and first-person verbs: 354 items. Every item goes into every stored rewrite of its language and into 23 synthetic list sections built from the kits' skills and languages (`custom_section_items`), skipping any the CV already backs. That's 14,902 injections. A separate check puts 103 product names spelled like ordinary words, lowercase, into one sentence each.
- **Labels.** "de:beherrsche", "en:hold" and "en:holding" were labelled ordinary in round 1. They're proficiency and credential claims, restating something the CV does state, so they're now `strict`. This moves 4 baseline rows from false refusal to strict refusal, which is why the baseline reads 19 here and 23 in round 1.

### Numbers

| Changed rewrites (52) | Baseline (`origin/main`) | Round 1 | Round 2 |
|---|---|---|---|
| Applied | 23 | 36 | 31 |
| False refusal (only ordinary words) | 19 (37%) | 10 (19%) | **11 (21%)** |
| Strict refusal | 8 | 4 | 8 |
| True refusal | 2 | 2 | 2 |
| English (36) false refusals | 12 | 7 | 7 |
| German (16) false refusals | 7 | 3 | 4 |
| Summaries (24) false refusals | 9 | 3 | 4 |
| Bullets (28) false refusals | 10 | 7 | 7 |

Round 1's 36 applied rewrites include 4 that a strict reading refuses ("hold", "holding", "beherrsche"). Round 2 refuses them again.

| Injected fabrications | Injected | Baseline missed | Round 1 missed | Round 2 missed | Round 2 new misses |
|---|---|---|---|---|---|
| Original set | 531 | 10 | 10 | 10 | **0** |
| Held-out set | 14,902 | 746 | 8,753 | 604 | **0** |
| ... English | 11,002 | 732 | | 590 | 0 |
| ... German | 3,900 | 14 | | 14 | 0 |
| ... list items (`custom_section_items`) | 4,160 | 203 | | 81 | 0 |
| Lowercase product names | 103 | 5 | 31 | 5 | **0** |

Round 1 missed 8,035 held-out injections that the baseline catches (54%). Round 2 misses none of them. It also catches 142 the baseline misses: NEUTRAL words written as names, plus items. The 604 it still misses are injections the baseline misses too: NEUTRAL words opening a sentence ("Make", "Next", "Close", "Later") and claim words the CV happens to back through the compound rule or stems.

All 106 reviewer probes are refused, each for the probed word. They're pinned as regression tests in `unified-writer-agent.claim-guard.test.ts`.

### Honest notes on tuning

- The first held-out score had 93 new misses. 19 were "Bildete das Team aus": the guard didn't join separable verbs yet, so I added that, and the item now also accepts the joined form "ausbildete" the guard reports. 19 came from "erreichte", which GSD lemmatises under a stray lemma "erreicht" the review had kept, and from the build letting a kept lemma win any form it shared with a rejected one. The fix was general: a shared form now goes where most of its treebank sightings go, and an unseen one stays rejected. 55 were lowercase "resolve".
- After that, I changed the design so bare verb lemmas are never freed. The 0 new held-out misses come after that change, so for "resolve" and its class the set is no longer strictly held out. The lowercase-brand check was 3 new misses before (resolve, gladly, ramp) and 0 after, once derived adverbs were dropped too. The intermediate raw file for the 55-miss run was overwritten. Its numbers are from the session log.
- One German morphology bug turned up in the false refusals: "rechnen" → "rechnet" was missing because of how the e before -t is inserted. It was fixed as a rule.

### What the 11 remaining false refusals are

9 of the 11 contain a noun: hands-on (twice), topics, core, relationships, foundation, explanation, practice, decisions, Kollegen, Auftragsabwicklung, Zahnärztin/Zahnarzt. The other two are "raising" (WordNet also lists it as a noun) and "aktuell" (an adjective, never freed in round 2; this row is the one round 2 adds over round 1). Rows that already hold a noun also hold adjectives ("active", "operational", "offene", "nachvollziehbar"), "turning" (a noun lemma), "assistierte" (no reviewed source) and the trait words "ruhigem" and "beratendem", re-inflected from the CV's "ruhigen, beratenden", which exact backing for rejected lemmas now refuses (the HIGH 3 fix).

### Residual risks

- **Lowercase product names spelled like a word the guard still frees.** None of the 102 checked, but the class is open: an inflected verb or a reviewed adverb that's also a product ("seeking" for SEEK, "indeed" was rejected for this reason). A brand list would close it, and that's a growing list by definition.
- **NEUTRAL_WORDS is unchanged.** A neutral word opening a sentence passes, as on main ("Make", "Next", "Teams"). "full" and "working" ("full professional proficiency", "working knowledge") are on main's list, so main frees them too. In those phrases "professional", "proficiency" and "knowledge" are refused.
- **The review is one reading of about 4,500 candidates** against a rubric, with the hash check making sure nothing new slips in unreviewed. A second reviewer reading `claim-lexicon-review.ts` is cheap and would raise confidence.
- **The compound rule and source stems (pre-existing, shared with main):** "knowledge" in a CV backs "knowledgeable", "intern" backs "international", "on my own" backs "owned".

### Deferred

- German "führte … durch" (conduct) is still refused, because "führte" is a claim word. Separable-verb joining could free it, but that frees a claim word, so it needs its own review.
- English present-tense verbs not in the treebank ("Tailor") stay claims, as on main.
- The pre-existing backing holes above, in both guards.
