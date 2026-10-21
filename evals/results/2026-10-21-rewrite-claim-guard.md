# Rewrite claim guard: drawing the line by part of speech (2026-10-21)

> Status: rounds 1 and 2 describe PR #170, which was **rejected** (superseded by a narrow fix, Wasim's decision on 2026-10-21). Round 3 at the end is what shipped. The rounds are kept as the record of what was tried and measured.

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

## Round 3 (2026-10-21): narrow fix (shipped)

### What #170 tried, and why it was rejected

Rounds 1 and 2 freed about 19,000 verb, adjective and adverb forms from a generated lexicon (Open English WordNet plus UD tags, reviewed by hand) and read capitalisation to tell names from words. Review kept finding claims it let through that origin/main refuses. Round 1 had 5 highs, round 2 had 10 (PR #170, comment of 2026-10-21 and the review outputs). Examples, all refused on main and passed by #170 round 2:

- Authority from freed verbs and function words: "took over the team", "Ich übernahm das Team", "Das Team berichtete an mich", "Ich baute das Team auf".
- Practice verbs: "verschrieb Medikamente", "verteidigte Mandanten", "bescheinigte".
- Standing and degree adverbs and verbs: "significantly improved", "personally", "Thrived", "decided", "focused and engaged".
- A credential from a freed participle: "gelernte Kauffrau" backed by a CV that only says "gelernt".
- Function words of the other language spelled like a product: "Nix", "Pro", "Plus".
- German verb forms spelling English nouns, freed in English text: "Team legend.", "at a plant", "during the war".
- Brands at the start of a line or as list items: Google, Convex, Welsh, Photoshop, and lowercase "at google".

The cause was the design: it decided by part of speech which words can carry a claim, and a part of speech does not say that ("legend" is a verb form in German, "personally" is an adverb, "took" is a plain verb). Every round fixed the listed cases and the next review found the next ones. Wasim's decision: ship a narrow fix that keeps main's fail-closed behaviour now, and add a model-based claim check in a later PR. The work of #170 is not reused, and its eval harness and raw results are kept here (`run/`, `dryrun/`, `evals/rewrite-claim-guard/`).

### What changed

Two changes, nothing else. The section-word rule from PR #165 and the number guard are as on main.

1. **The `isNeutral` stem bug.** `isNeutral(w)` asked `NEUTRAL_WORDS.has(claimStem(w))`, but the list holds surface forms, so "including" (stem "includ") missed although "include" and "included" are listed. Now an inflected form (`claimStem(w) !== w`) is also neutral when its stem is the stem of a listed word. Never a role or title word (`ROLE_WORDS`), never an "-ly" word (the stem cut would let "directly" free "directs"), and never `NOT_NEUTRAL_BY_STEM`: featured, featuring, sentenced, sentencing, writs. Like the grammar words, a stem-matched form is not freed when it is capitalised mid-sentence or as a list item, and a capital opening an experience bullet or a prose sentence is fine.
2. **Closed class grammar words, per language** (`src/lib/agents/claim-grammar-words.ts`). Prepositions, conjunctions, articles and determiners, pronouns, auxiliaries and particles. No verb other than an auxiliary, no adjective, no adverb. English words are freed only for an English rewrite, German words only for a German one, and a rewrite in any other language frees none. A word is freed only where it is written in lowercase or capitalised as the first word of a sentence of prose. Never capitalised mid-sentence, never in capitals, never capitalised in a list section (`experience_bullets` and `custom_section_items`), and a capital after a line break is a list item. One such occurrence keeps the word checked everywhere in the text. If the scan and `claimWords()` disagree on how often a word occurs, the word is not freed.

How the lists were made: `scripts/build-grammar-words.ts` reads UD_English-EWT and UD_German-GSD r2.18 (CC BY-SA 4.0; URLs and sha256 pinned in the script, which refuses other bytes; HDT, GUM and LinES not used) and writes every form tagged ADP, CCONJ, SCONJ, DET, PRON, AUX or PART at least half the time and seen at least 3 times. That is 209 English and 313 German candidates (`narrow/candidates-en.tsv`, `-de.tsv`). Multiword tokens ("im" = in + dem, "don't") count as one sighting of their surface form. A person read every candidate. Kept: **137 English and 220 German forms**, of which **38 English and 170 German are refused on main** (after the #171 review: **136 English and 195 German, 37 and 145 refused on main**; see Review fixes) (the rest are already in `NEUTRAL_WORDS`). Every dropped candidate is in `EXCLUDED_GRAMMAR_WORDS`, with its reason:

| Dropped | Why | Examples |
|---|---|---|
| Names in either language | product, tier, brand | nix, pro, plus, via, per, art |
| Reflexives and intensives | "did it myself" claims sole ownership | myself, himself, selber, selbst |
| Indefinites and quantifiers | they quantify or scope | everyone, nothing, someone, viele, mehrere, einige, niemand |
| Prepositions of contrast, exception or scope | "without help", "beyond scope" | without, beyond, despite, except, throughout, ohne, trotz, innerhalb |
| Also an ordinary noun or name | | can, may, will, might, must, till, soll, muss |
| Typos, slang, English tokens in GSD, fragments | not CV words | adn, ya, outta, ll, nt, "and" and "the" in German |

### What ran

Everything is free: no model calls, $0. The 59 stored rewrites and kits from round 1 (`run/`, Sonnet 5.5, 2026-10-21, $1.21) were re-scored.

```
# The six UD 2.18 files (the build script checks their sha256 and refuses other bytes):
mkdir -p corpora && for f in UD_English-EWT/en_ewt UD_German-GSD/de_gsd; do for p in train dev test; do
  curl -fsSL -o "corpora/$(basename $f)-ud-$p.conllu" "https://raw.githubusercontent.com/UniversalDependencies/${f%/*}/r2.18/$(basename $f)-ud-$p.conllu"; done; done
npx tsx scripts/build-grammar-words.ts --corpora corpora --out evals/results/2026-10-21-rewrite-claim-guard/narrow
npx tsx evals/rewrite-claim-guard.ts score --in evals/results/2026-10-21-rewrite-claim-guard/run --scores scores-round3-final.json
# <corpora folder> below is the same folder of six .conllu files.
npx tsx evals/rewrite-claim-guard/stem-audit.ts corpora evals/results/2026-10-21-rewrite-claim-guard/narrow/stem-freed-forms.txt
npx tsx evals/rewrite-claim-guard/freed-forms.ts corpora evals/results/2026-10-21-rewrite-claim-guard/narrow/freed-forms.txt
```

Raw score files: `run/score-round3-final.stdout.txt` and `run/scores-round3-final.json.gz` are the shipped guard (after both review rounds below); `run/score-round3-review1.*` is the guard after review round 1. `run/score-round3.stdout.txt` and `run/scores-round3.json.gz` are the worker's first run, before the role-word and review fixes, kept as the record.

Sources and licence: UD_English-EWT r2.18 (Silveira et al.) and UD_German-GSD r2.18 (McDonald et al., Google), both CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). The grammar-word lists in `claim-grammar-words.ts` and the candidate files `narrow/candidates-*.tsv` are adaptations of them (word forms with counts and tags) and are shared under the same licence.

Changes to the harness: the baseline is now origin/main byte for byte (`baseline-guard.ts` carries its own copy of main's `claim-token-normalization.ts`; rounds 1 and 2 imported the working tree's version, which joined dotted degrees, so "B.S." was a claim for the baseline and not on main). `probes.ts` holds the reviewer probes. Raw files over 1 MB are gzipped (`scores-round2.json.gz`, `option-*.json.gz`, `scores-round3.json.gz`). Because the harness's normalisation is now main's, the held-out set has 14,911 injections here and had 14,902 in round 2, and the baseline misses 801 of them here and missed 746 there. Compare each guard with the baseline of its own row.

### Numbers

Stored rewrites (52 changed of 59; labels in `labels.json`, 68 terms):

| | Baseline (origin/main) | #170 round 2 (quoted, rejected) | Narrow fix (shipped) |
|---|---|---|---|
| Applied | 23 | 31 | 23 |
| False refusals | 19 | 11 | **19** |
| Strict refusals | 8 | 8 | 8 |
| True refusals | 2 | 2 | 2 |
| English false refusals (36) | 12 | not split | 12 |
| German false refusals (16) | 7 | not split | 7 |

The narrow fix does not change any stored verdict. The improvement is much smaller than #170's, and on this set it is zero. Distinct flagged terms fall from 68 to 62: the six words freed here are "including" (en) and "habe", "mein", "sie", "er", "sodass" (de; "mein" is no longer freed after the review), but each of those rewrites is still refused for another word (a noun, an adjective or a verb outside the closed class: "stayed", "evaluated", "additional", "release"). The production case that started this is fixed and pinned by a test: a rewrite whose section already holds the paraphrase and that adds "including" is applied (main refused it). What still refuses ordinary rewrites is exactly what this fix does not free by design: verbs, adjectives, adverbs and nouns the CV never used. That is the model-based check's job.

Misses (an injected fabrication none of whose claim words is flagged):

| Set | Injected | Baseline missed | Narrow missed | New misses vs baseline | #170 round 2 missed (baseline) |
|---|---|---|---|---|---|
| Original injections (9 kinds) | 531 | 10 | 10 | **0** | 10 (10) |
| Held-out (names at line start, list items, lowercase brands, standing, authority, scope; EN and DE) | 14,911 | 801 | 773 | **0** | 604 (746) |
| of which English | 11,011 | 787 | 759 | 0 | 590 (732) |
| of which German | 3,900 | 14 | 14 | 0 | 14 (14) |
| Lowercase brands | 103 | | | 0 | |
| Reviewer probes (`probes.ts`) | 190 | 179 refused on main | 179 refused | **0** | |

Held-out misses fall from main's 801 to 773: the grammar words free nothing any injection used as a claim, and the role-word fix catches 28 "founded"/"founding" injections main missed. #170 caught 142 more than main, and also let through the claims listed above that main refused. 179 counts the probes where main refuses a claim word of the probe; main refuses 180 probes in all, because it refuses "M.S." on "completed", not on "ms". The 10 probes main passes outright (all still pass, unchanged): "knowledgeable" (the compound rule, "knowledge" is in the CV), the items Make, Next, Close, Later (listed in `NEUTRAL_WORDS`), "greatly", "mainly", "largely" (stems of listed words) and "during the war" ("war" is a listed German word).

The probes: the PR's "106/106 reviewer probes" was a working list that was not committed, so the list is rebuilt in `probes.ts` from the PR's test file, the round 1 and round 2 review outputs and the round 3 brief. It has 190 probes, 179 of which main refuses. Every one of those 179 is refused by the narrow fix, including each case named in the brief: took over the team, Ich übernahm das Team, Das Team berichtete an mich, Ich baute das Team auf, verschrieb Medikamente, verteidigte Mandanten, significantly improved, personally, Thrived, gelernte Kauffrau, Nix as an item and mid-sentence, Pro, Plus, Team legend., at a plant, Google, Convex, Welsh and Photoshop at line start and as list items, lowercase "at google", knowledgeable (main passes it too), masterminded. They run in `npm test`.

### Every form this newly frees

Method: every word of a 66,323-word vocabulary (all forms of both treebanks, both grammar lists, the regular forms of every stem the match uses) was tried in 12 positions: lowercase mid-sentence, capitalised opening a sentence, capitalised mid-sentence, capitalised list item, capitalised bullet, lowercase in a bullet, in English and German text (`narrow/freed-forms.txt`). A word counts when main flags it and the narrow fix does not. 284 distinct words, none capitalised mid-sentence or as a list item.

- **In the stored rewrites, the held-out set, the injections and the probes** (the words where main flags and the fix does not, in contexts the eval built): including, habe, mein, sie, er, sodass, ich, bin, mich (the worker's first run). After the review, "mein", "mich" and the other first-person forms are claims again; the final list is in Review fixes.
- **Stem match, by form** (`narrow/stem-freed-forms-first-run.txt`, the worker's first run; after the review "shares", "shars", "serviced" and "servicing" are kept out, 73 forms remain in `narrow/stem-freed-forms.txt`): continues, continuing, creates, dated, dating, ensures, handles, haves, improves, includes, including, increases, increasing, lined, lining, making, moves, provides, reduces, reducing, removes, removing, scales, serviced, servicing, shares, timed, timing. Checked by hand, none is a role, title, credential or standing claim. The match also reaches the forms `featured`, `featuring`, `sentenced`, `sentencing` and `writs` (stems of "features", "sentence", "writes"); those would be claims (recognition, a court's act), so they are in `NOT_NEUTRAL_BY_STEM` and stay refused. `headed` and `heads` (stem of the listed "heading") are role words and stay refused. The scan also frees non-words that share a stem ("acrosed", "writed"). Nobody writes them, and they are not claims.
- **English grammar words refused on main, now free** (38 in the worker's first list, `narrow/grammar-words-newly-freed.txt`; 36 after the review, which removed "ours" and "behind"): against, along, although, among, arent, behind, cannot, cant, couldnt, didnt, doesnt, hasnt, havent, isnt, itll, its, ours, shouldnt, thatll, theyd, theyll, theyre, theyve, though, toward, towards, unless, wasnt, werent, weve, whatever, whereas, whilst, wouldnt, youd, youll, youre, youve.
- **German grammar words refused on main, now free** (170 in the worker's first list, same file; 145 after the review, which removed mich, mir, uns, the mein and unser forms, ab, and the alle and jede forms): the pronouns and possessives (ich, mich, mir, er, ihm, ihn, es, sie, ihnen, ihr and forms, wir, uns, euch, man, wer, mein and unser and sein and ihr forms), the determiners (alle, jede, jene, solche, welche, kein, andere, selben and forms), the auxiliaries and modals (bin, bist, sei, seien, sein, gewesen, haben, habe, hat, hatte, hätte, kann, könnte, konnte, können, müssen, sollen, wollen, dürfen and their past and subjunctive forms, but not soll or muss; werden, wird, würde, worden), the conjunctions (denn, sondern, sowie, sowohl, weder, entweder, ob, weil, wenn, obwohl, nachdem, bevor, indem, sobald, solange, sodass, sofern, soweit, falls) and the prepositions (ab, ans, anhand, aufgrund, aufs, bis, entlang, gegen, hinter, ins, mittels, neben, seit, um, ums, während, wegen, zwischen).

None of these asserts a title, credential, standing, scope, ownership or quantity of the applicant. The words a reviewer could argue about were dropped (see the table above). The brand and homograph cases of #170 stay refused: Nix, Pro, Plus and Art are on no list, an English text never frees a German word (so "Team legend." and "at a plant" are refused), and "via", "per" and "war" are free exactly as on main, where `NEUTRAL_WORDS` lists them.

### Review fixes (Opus and Sonnet on #171, 2026-10-21)

- **High:** German "mir" was the only gate on "mit dem Team unter mir" (a supervision claim with no verb), and main refused it. The first-person object and possessive forms (mich, mir, uns, mein*, unser*) are now excluded from the German list. English "me", "my", "our" and "us" were already neutral on main and stay as they were.
- "ab" is excluded too (also the lowercase CLI tool Apache Bench).
- More abbreviations (inkl., evtl., Mio., Mrd., Abt., Univ., Mrs. and similar) no longer count as a sentence end, so a capitalised grammar word after them isn't freed.
- The advisory "your CV doesn't mention X" list (`unsupportedInstructionTerms`) keeps main's neutral check exactly, so it doesn't change. "Heading" is now refused in rewrites ("Heading the agents team"), because it's a role word as well as a listed word. That's a deliberate tightening.
- Re-scored after these fixes (`run/score-round3-review1.*`): the stored rewrites, the original injections and the probes are unchanged; held-out misses 773; 0 new misses everywhere. Newly freed in the eval contexts: including, habe, sie, er, sodass, ich, bin.

Review round 2 (Opus), fixed in the next commit:
- **High:** the stem match freed "shares" (from the listed "shared"), so "with shares in the company", an equity claim main refused, passed. "shares" is now in `NOT_NEUTRAL_BY_STEM`.
- The German universal determiners (alle, jede and forms) are excluded, like viele and saemtliche ("Betreuung aller Kunden" passed). English "ours" is excluded, like the German possessives.
- No grammar word is freed in a list section (`custom_section_items`), in any case ("man" is also a tool).
- Lists after the review: 136 English (37 refused on main) and 195 German (145 refused on main). `narrow/grammar-words-newly-freed.txt` is the worker's first list, kept as the record.
- Re-score after round 2 (`run/score-round3-review2.*`): unchanged from round 1.

Review round 3 (Opus, the last round), fixed before merge:
- **High:** "behind" (en) and "hinter" (de) claim authorship with no verb to catch it ("the engineer behind the migration" from "on the migration"); main refused them. Both are excluded.
- "serviced" and "servicing" (a noun-to-verb jump from the listed "services") are kept out of the stem match. German "man" (also a tool) and the third-person possessives (seine, ihre and forms) are excluded.
- The stem audit now covers claimStem's "-ies" path. `narrow/stem-freed-forms.txt` and `narrow/freed-forms.txt` are regenerated for the shipped lists; the first-run listings are kept as `*-first-run.txt`.
- Shipped lists: 135 English (36 refused on main) and 183 German (133 refused on main). 73 stem-freed forms.
- Re-score after round 3 (`run/score-round3-review3.*`; listings `narrow/*-review3.txt`): unchanged.

Arbiter (Opus, after round 3): do not merge until these were fixed, then merge without a fourth round:
- **Highs:** the uninflected German possessives "sein" and "ihr" ("durch ihr Team", the same supervision claim as seine and ihre) are excluded. The stem match no longer frees "dating" ("a dating platform") or "timing" ("timing analysis").
- **Lows:** "lining" is kept out of the stem match, and the German authority modal "darf" (dürfen, durfte and forms) is excluded.
- Shipped lists: 135 English (36 refused on main) and 174 German (124 refused on main). 70 stem-freed forms (`narrow/stem-freed-forms.txt`).
- Final re-score (`run/score-round3-final.*`): false refusals 19 of 52 (unchanged), original injections 10 missed (0 new), held-out 773 missed (en 759, de 14; 0 new), probes 179 of 179 refused. Newly freed in the eval contexts: including, habe, sie, er, sodass, ich, bin.

### What was not changed, and was found on main

Out of scope by decision, listed so the model-based check can take them:

- `isNeutral` already frees any inflection of a listed surface form, so **"founded" and "founding" pass on main** (stem "found", and "found" is listed), although both are in `ROLE_WORDS`. This fix keeps role words out of its own new match and does not touch the old one. Proposal: apply the `ROLE_WORDS` check to the whole of `isNeutral`. It only adds refusals. **Done in the same PR (orchestrator, 2026-10-21):** `isListedNeutral` now returns false for any `ROLE_WORDS` word. Re-scored with no other change: held-out misses fall from 801 to 773 (28 more caught), and the stored rewrites, the original injections and the probes are unchanged (0 new misses everywhere). Pinned by the test "founding claims are never neutral".
- Main passes the 10 probes listed above, and misses 801 of 14,911 held-out injections, mostly names at the start of a line or as a list item whose lowercase form is a listed word (Make, Next, Close, Later, Word) and a handful of authority verbs. None is new.
- Capitalised function words that are names (Via, Per) stay free exactly as on main, where `NEUTRAL_WORDS` has them.

### Conclusion

The guard is as strict as main on every injection, probe and brand measured (0 new misses), frees the production word "including" and the closed class words of English and German in lowercase and at the start of a sentence, and nothing else. On the 52 stored rewrites it changes no verdict: false refusals stay at 19 (37%), against 11 for the rejected #170. That is the price of keeping every claim main refuses refused. The remaining false refusals are nouns, adjectives, verbs and adverbs the CV never used, and only a check that reads meaning can free those safely. That check, model-based and run in the same eval harness against these same sets and probes, is the next PR.
