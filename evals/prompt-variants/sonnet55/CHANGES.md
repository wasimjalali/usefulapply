# Prompt variant `sonnet55`: what changed and why

Written 2026-10-12 for the Sonnet 4.6 vs Sonnet 5.5 eval (`evals/results/2026-10-07-sonnet-46-vs-55.md`). Arm A runs the production prompts on Sonnet 4.6. The B arms run Sonnet 5.5 with `--prompt-variant sonnet55`, so each model gets prompts tuned for it. Production (`src/lib/agents/prompts/`) is untouched.

```bash
npx tsx evals/run-eval.ts --arm sonnet55-low --prompt-variant sonnet55 --allow-anthropic-api --out evals/results/2026-10-07-sonnet-eval
```

## Files

| File | Replaces | Notes |
|---|---|---|
| `fit-assessment-prompt.ts` | `src/lib/agents/prompts/fit-assessment-prompt.ts` | Changed |
| `email-prompts.ts` | `src/lib/agents/prompts/email-prompts.ts` | Changed (application email and follow-up) |
| `cover-letter-prompt.ts` | `src/lib/agents/prompts/cover-letter-prompt.ts` | Changed |
| `cv-prompt.ts` | `src/lib/agents/prompts/cv-prompt.ts` | Changed. The section-rewrite builder at the bottom is a byte-for-byte copy of production |
| `exports.typecheck.ts` | none | Type-level proof that each variant exports the same names and types as production. Checked by `npx tsc --noEmit` |
| `load-check.ts` | none | Offline check through the real eval hook. No API calls |

All four prompt modules are replaced, because each one had dated patterns the guidance names. The extraction prompts are not, see "Not changed" below.

## Sources

All guidance comes from the bundled Claude API skill, version 2.1.296 (`/private/tmp/claude-501/bundled-skills/2.1.296/.../claude-api/shared/`). The brief pointed at 2.1.290, which was no longer on disk; the sections are the same. Line numbers below refer to the 2.1.296 files.

- `model-migration.md`, "Migrating to Claude Sonnet 5" (lines 1169 to 1318) and "Migrating to Claude Sonnet 5.5" (lines 2077 to 2228). The 5.5 section is layered on top of the Sonnet 5 one (line 2083), so a caller coming from Sonnet 4.6 applies both.
- `prompt-audit.md`, the anti-pattern groups (lines 58 to 183) and the keep list (lines 187 to 201).

No WebFetch was used. `live-sources.md` lists no prompting best-practices page, and the bundled docs say they are the source of truth for migrations.

## What the guidance says, in short

1. Sonnet 5 and later reject non-default `temperature`. "Callers who previously relied on `temperature` for stylistic variety must use system-prompt instructions instead" (`model-migration.md` 1280; also 1194).
2. The model follows instructions literally. "State the scope explicitly" when a rule should apply broadly, and "style/tone directives carried over from Sonnet 4.6 may now over-apply" (1274, checklist 1310).
3. For tone, "re-evaluate style prompts against the new baseline", and say what voice you want (1276). For length, "positive examples showing the desired concision tend to be more effective than telling the model what not to do" (1268, checklist 1311).
4. Remove workarounds aimed at older models, including "do not be lazy" style lines (2204).
5. Pressure language over-applies on current models: `CRITICAL: You MUST`, several `NEVER`s per prompt, "Be thorough. Do not be lazy." (`prompt-audit.md` 1a, 60 to 75).
6. Say each thing once. "Repetition as reinforcement" is padding, and "duplicated rules make the model spend effort reconciling wordings" (1c, line 103). Bullet walls "sever rules from reasons, and prompt format bleeds into output format" (line 102).
7. Prohibition lists with no stated reason get restated as positive intent. Prohibitions that encode a real constraint stay, ideally with the reason beside them (1e, 127 to 129; keep list item 5, line 195).
8. Numeric output caps and "count your words" choreography go, except where the requirement is genuinely format-sensitive (1b line 88, 1f lines 133 to 135).
9. Keep list: context and reasons are never cruft (item 1); format-pinning examples stay (item 7); working redundancy is not cruft (item 8); a single end-of-prompt recap is fine (item 10).

## Changes that apply to every file

**G1. Temperature intent moved into the prompt.** Production steers warmth and variety with sampling temperature (`src/lib/models/types.ts`). The harness drops temperature for Sonnet 5.5 (`dropTemperature: true` in `evals/lib/arms.ts`). What each task used, and what replaces it:

| Task | 4.6 temperature and stated reason | Variant replacement |
|---|---|---|
| `write_cover_letter` | 0.6, "needs warmth and personality" | A `<voice>` block: warm, confident, specific, varied rhythm, an opening chosen for this applicant and this ad "so two letters for different jobs never share an opening or a sentence", contractions in English when the ad is conversational, formal Sie in German, three illustrative openings |
| `write_email` | 0.55, "emails need warmth" | A `<voice>` block in the same spirit, with one stiff and two natural hooks |
| `write_follow_up_email` | 0.5, "needs precision" | A short `<voice>` block: warm, brief, specific, a different detail per application |
| `optimize_cv` | 0.5, "variety for natural-sounding bullet points" | Added to `<quality_standard>`: bullets in one person's voice, varied openings and structure, mixed length, no action verb more than twice (that last rule already existed) |
| `fit_assessment` | 0.4, "precise analytical evaluations" | Nothing added. Lower temperature asked for precision, and the existing "Precision: use the exact numbers" principle already covers it |

Guidance: `model-migration.md` 1280 and 1276. Positive examples rather than more prohibitions: 1268.

**G2. Pressure language toned down.** ALL-CAPS emphasis, "CRITICAL", "MUST", "HARD RULE (NON-NEGOTIABLE)" and "Violation produces low-quality output" lines are rewritten at normal volume, and each keeps or gains its reason. Counted on the prompt text (CV section-rewrite builder excluded), emphasis tokens (MUST, NEVER, ALWAYS, CRITICAL, IMPORTANT, NON-NEGOTIABLE, FORBIDDEN, BANNED, STRICT, MANDATORY, HARD RULE, NOT) drop from 52 to 5 in the cover letter, 94 to 7 in the CV prompt, 46 to 8 in the emails and 14 to 0 in the fit assessment. What's left sits in the security blocks kept verbatim (see "Kept verbatim"). Firm rules stay firm: "never", "only" and "must not" remain wherever a rule is absolute, in lowercase. Guidance: `prompt-audit.md` 1a.

**G3. Each rule stated once, in the right place.** Production restates rules for reinforcement. The cover letter states the 250-word limit twice, the three-paragraph structure twice, the dash ban six times (including a "BEFORE FINALIZING: scan every sentence" block), and the skill-accuracy rule four times. The CV prompt states the experience-selection and bullet limits twice, and its CV-fit binding block repeats the missing-skills rule directly above itself. Each of these now appears once. Two things stay duplicated on purpose. The anti-hallucination rules appear in both the system prompt and the user-prompt binding blocks, as in production, because that redundancy is working (keep list item 8). And the cover letter and CV prompts end with one short recap of the critical constraints (keep list item 10). Guidance: `prompt-audit.md` 1c, line 103.

**G4. No em dashes in the prompts' own prose.** Production bans em dashes in output while using them freely in its own prose: rendered for one test case, 65 lines of the production CV system prompt, 49 of the cover letter and 14 of the application email contain a dash glyph. The variant prompts contain dash glyphs only inside the rules that ban them (and in one subject-line rule that names "/" or an em dash as separators in job titles). Each source file builds the glyphs from code points (`String.fromCharCode(0x2014)`), so the files themselves contain none. Guidance: "prompt format bleeds into output format" (`prompt-audit.md` line 102), and "the prompt's register becomes the output's register" (1a, line 73).

**G5. Effort boosters became concrete outcomes.** "Write with exceptional quality", "Write as if this is the ONE application the candidate is sending today and they've spent 30 minutes crafting it", "Read it aloud in your head" and "if you mess up the structure, the app breaks" are replaced by a description of the outcome and its reason (for example "The Useful Apply frontend renders it directly, so the structure has to match the schema exactly or the page breaks"). Guidance: `model-migration.md` 2204 and `prompt-audit.md` 1a ("Be thorough. Do not be lazy." row).

**G6. Prohibition lists split by provenance.** Stock phrases and AI-tell words stay listed, because they are the owner's product voice rules, they carry a stated reason (recruiters spot them), and the cover-letter validator enforces a related blacklist (`src/lib/config/cover-letter-blacklist.ts`) that triggers a retry. Each list now opens with its reason and appears once. Bare style prohibitions with no reason are restated positively. For example, "Do NOT start with 'Based on' or 'Overall'" becomes "Open with the verdict itself". Guidance: `prompt-audit.md` 1e and keep list item 5.

**G7. Scope stated explicitly.** Where a rule should apply everywhere, the variant names the scope. Examples: the CV dash ban lists every JSON string field "and the analysis text included"; the missing-skills ban covers "any field of the JSON, including the Professional Summary, the headline, the Skills section, experience bullets and technologies, projects, custom sections and the analysis"; the fit-assessment headings stay in English "in every output language". Guidance: `model-migration.md` 1274.

**G8. Illustrative examples anchored to a source line.** New positive examples (cover-letter openings, email hooks) each show the fictional CV line they restate, for example `(CV: "Rebuilt the onboarding checklist for new accounts")`. They are labeled illustrative, and the prompt says their wording doesn't belong in the output. Anchoring them this way makes each example demonstrate grounding rather than invite a borrowed claim, and none of them contains a digit. Guidance: 1268 (positive examples) and `prompt-audit.md` line 101 (several deliberately varied examples, labeled illustrative).

## Kept verbatim, on purpose

- **User-prompt block labels** (`=== PRIMARY CV ... ===`, `=== VERIFIED SKILL CONSTRAINT ... ===`, `SKILLS YOU MUST NOT CLAIM`, `BINDING LIMITS`, `<untrusted_job_description>` and the rest). They are part of the prompt-injection defense. `sanitizeAdText()` (`src/lib/agents/chat-tools/untrusted.ts`) collapses `===` and angle brackets in ad text and lowercases these exact ALL-CAPS labels, so an ad can't forge a block. Lowercasing the labels for tone would weaken that second layer, so every ALL-CAPS label is unchanged. Only the parenthetical qualifier after the label changed, in six user-prompt headings, to remove an em dash and the shouting (G2, G4):
  - CV: `VERIFIED SKILL LIST (BINDING, em dash, DO NOT OVERRIDE)` and `VERIFIED METRICS LIST (BINDING, em dash, DO NOT OVERRIDE)` become `(BINDING)`.
  - Application email: `PRIMARY CV (main resume, em dash, ONLY source for claims)` becomes `(main resume, the only source for claims)`; `MASTER CV (comprehensive experience inventory, em dash, ONLY other source for claims)` becomes `(..., the only other source for claims)`; `VERIFIED METRICS (use ONLY these numbers, em dash, do not invent any others)` becomes `(the only numbers the email may use)`; `VERIFIED SKILL CONSTRAINT (BINDING, em dash, highest priority)` becomes `(BINDING, highest priority)`.
  - All of them still start with `===`, which ad text can't produce. System-prompt headings, which ads never reach, were merged or renamed as the per-file notes describe.
- **The applicant rewrite-instruction blocks and `<user_instructions_rule>` blocks**, word for word. They are security text, and the eval never sets `userInstruction`, so a change there couldn't be measured.
- **Every anti-hallucination rule, in substance.** See the check at the end.
- **All validator-enforced limits**: fit assessment under 200 words with the three literal headings; email subject 60 characters or fewer, body at most 4 sentences, attachment sentence and signature; follow-up body at most 80 words and `recommendedDelay`; cover letter header and signature. These are format contracts, and the guidance keeps "genuinely format-sensitive" requirements (1f, line 135).
- **Product shape specs**: 250-word letter body in three paragraphs, 2-3 fit bullets per section at twelve words or fewer, CV limits (3-4 roles, 15 bullets, 5x5 skills). They define the product, not a model workaround, so they stay as specs, each stated once.
- **CVData schema**: field names, nesting and order unchanged.
- **CV section-rewrite builder** (`buildCVSectionRewriteUserPrompt` and its helpers): a byte-for-byte copy. The eval doesn't call it. It does use `buildVerifiedSkillList` and `buildVerifiedMetricsList`, so under this variant it picks up their reworded text.
- **System blocks stay fully static**, so prompt caching behaves as in production. `load-check.ts` confirms they are byte-identical across builds.

## Per-file changes

### fit-assessment-prompt.ts

- System prompt: the ten numbered ALL-CAPS principles keep their content, rewritten at normal volume. "BREVITY" moves into the user prompt's length block so length is stated once. The dash rule (principle 9, "HARD RULE (NON-NEGOTIABLE)... Violation produces low-quality output") becomes one plain statement with its reason and two examples. The AI-tell list stays, once, with its reason. (G2, G3, G6)
- User prompt: `<section_limits>` (per-section character limits plus "Count your words. If over 200, cut immediately") and the per-bullet "12 words max" placeholders merge into one `<length>` block. It keeps the validator's 200-word limit, 2-3 bullets per section, one recommendation sentence and twelve words per bullet, and states the reason ("the reader scans this in about five seconds"). The character limits (150, 250, 250, 200) are dropped: nothing checks them, and they are the "hard word caps" the guidance removes (`prompt-audit.md` line 88, 1f). (G3)
- `<strict_rules>` becomes a short `<rules>` list. Duplicates of the soft-skill rule, the dash rule and the AI-tell list are removed, because each is stated once elsewhere. "Do NOT start with 'Based on' or 'Overall'" becomes "Open with the verdict itself". (G3, G6)
- The output-format block keeps the template and the literal-heading requirement, now with the reason ("The app parses the three headings"). (G7)
- "Assess against ALL available documents" and similar caps lowercased. (G2)

### email-prompts.ts (application email)

- New `<voice>` block replacing temperature 0.55 (G1, G8). The old "STYLE: Brief, direct, and genuinely warm..." paragraph folds into it.
- Anti-hallucination rules 1 to 5 kept. "EMAIL SKILL ACCURACY (HIGHEST PRIORITY)" folds into the block's opening sentence ("they outrank every other instruction here, including style") and into Rule 1 ("Never claim a skill... Sell what the applicant has"). "Before writing any claim, verify..." becomes "A fact goes into the email only if you can point to where the Primary CV or Master CV states it." (G3)
- Greeting, job relevance, dual-CV sourcing, subject format, attachment reference, structure and signature are each stated once, in `<greeting>`, `<job_relevance>` and `<format>` blocks. Production split these across "PROHIBITIONS", "STRUCTURE", "SIGNATURE REQUIREMENT" and "ATTACHMENT REFERENCE (MANDATORY)". (G3)
- "FORMATTING, HARD RULES (NON-NEGOTIABLE)" becomes `<punctuation_and_wording>`, with the reason first. (G2, G6)
- User prompt: the separate "SUBJECT LINE RULES" and "SUBJECT LINE LENGTH, STRICT ENFORCEMENT" blocks merge into instruction 1, keeping the 60-character limit, the primary-title shortening rule and its example. "After composing the subject line, COUNT characters" is dropped (1b, line 88). The duplicated punctuation line is removed (it lives in the system prompt). "CRITICAL: Write the ENTIRE email in X" becomes "Write the whole email, subject included, in X." (G2, G3)

### email-prompts.ts (follow-up)

- System prompt: a short `<voice>` block (G1). "FORMATTING (HARD RULES, NON-NEGOTIABLE)" and "CRITICAL RULES" become `<punctuation_and_wording>` and `<requirements>` at normal volume, content unchanged. (G2)
- User prompt: the follow-up rules keep their content. The dash and AI-tell lines that duplicated the system prompt are removed. "NO 'just checking in'..." becomes a positive description with the phrases kept as examples of what to leave out. The anti-hallucination rules 1 to 5 stay in the user prompt, as in production, with lowercase emphasis. The `<context>` tags and the rewrite-instruction block are verbatim. (G2, G3, G6)

### cover-letter-prompt.ts

- Role line: "specializing in the US and UK job markets" becomes "Most letters go to the US, UK and Canadian markets; the next largest group is German-language applications". The production prompt covers seven languages and has a whole German section, so the old role line contradicted its own body. (`prompt-audit.md` Group 2 contradiction row, line 147; and 1274: the model won't generalize beyond the stated scope.)
- New `<voice>` block replacing temperature 0.6, `<writing_quality>` and `<tone_calibration>`. (G1, G5, G8)
- Anti-hallucination rules 1 to 5 kept. "COVER LETTER SKILL ACCURACY (HIGHEST PRIORITY)", with its three FORBIDDEN examples and its "transferable skills and learning ability" fallback, folds into Rule 1 and the block's opening priority sentence. (G3)
- `<jd_contextual_detail_rule>` kept. Its reference to "existing Rule 4d" is gone: Rule 4d exists only in the CV prompt, which this call never sees. The variant states the rule itself instead ("the employer's budget is not the applicant's budget, and the JD's team size is not a team the applicant led"). (`prompt-audit.md` Group 2.)
- "WRITING TONE, MARKET-SPECIFIC RULES", "LANGUAGE DETECTION" and "TONE MATCHING" become one `<markets>` block. "2026 COVER LETTER STANDARDS", "COMPANY CONTEXT EXTRACTION" and "DUAL-CV SOURCING (CRITICAL)" become one `<content>` block. (G3)
- "STRUCTURE" and "COVER LETTER STRUCTURE" (two copies of the three-paragraph layout) plus "INSTRUCTIONS" become one `<length_and_structure>` block. "66% of recruiters prefer half a page or less" is paraphrased as "most recruiters prefer half a page or less", so the prompt carries no number a letter could pick up. (G3)
- "LOCATION INTELLIGENCE", "RELOCATION RULES" and "INTERNATIONAL RELOCATION RULE" become one `<relocation>` block. The "Before generating, check: 1. 2. 3." choreography becomes a sentence, and every condition is kept. (`prompt-audit.md` 1c step lists; G3.)
- "ABSOLUTE PROHIBITIONS", the banned phrases in the tone section and `<ai_tell_phrase_ban>` become one `<stock_phrases>` list. Every phrase from the three production lists is in it. (G6)
- `<punctuation_rules>` keeps the reason and the replacement mapping. Five WRONG/RIGHT placeholder examples become four, and the "BEFORE FINALIZING" self-verification block is replaced by one closing recap line. (G3, keep list item 10)
- User prompt: headings, the allow-list and block-list logic, and the untrusted and rewrite blocks unchanged. Prose emphasis lowercased: "do NOT mention relocation", "MUST start with this exact header structure", "IMPORTANT:", "CRITICAL: Write the ENTIRE cover letter". (G2)

### cv-prompt.ts

- Role: "Writer Agent for Job Copilot" becomes "Writer Agent for Useful Apply" (stale product name; `prompt-audit.md` Group 2, volatile specifics). "You are NOT writing a document - you are generating a DATA PAYLOAD... if you mess up the structure, the app breaks" becomes a calm statement with the reason. (G5)
- `<quality_standard>`: "This quality standard is critical because..." stays as context, worded calmly. Bullet-variety instructions added (G1).
- Anti-hallucination rules 1, 2, 3, 4, 4b, 4c, 4d, 5, 5b, 6 and 7 all kept with their examples, including every ALLOWED/NOT ALLOWED pair. Rule 4c's repeated three-step number check is removed, because Rule 4b's fabrication test and Rule 4d already state it. (G3)
- Section-heading emojis (📏, 🧠) removed (prompt format bleeds into output, line 102).
- "LENGTH & FORMAT CONSTRAINTS", "EXPERIENCE SELECTION RULES (CRITICAL)" and the limits repeated in "OPTIMIZATION STRATEGY" item 4 merge into one block. All limits are unchanged. (G3)
- Education: the field mapping and its four placeholder examples are kept (format-pinning, keep list item 7). "COMMON MISTAKES TO AVOID" becomes "Each field holds one kind of information", with both concrete wrong examples kept. "EDUCATION FORMATTING (MANDATORY, NO EXCEPTIONS)... ALWAYS DELETE THIS" becomes one sentence with the reason. (G2, G6)
- Schema: the trailing comma after `localizedStrings` is removed. That comma makes the sample invalid JSON, and a literal-minded model could copy it. Schema descriptions that used an em dash between "string" and the description (for example the "institution" field) now use a colon. No field changed.
- "SECTION HEADERS" and "SECTION HEADERS RULE" merge into one item. (G3)
- "FORMATTING, HARD RULES (NON-NEGOTIABLE)" becomes "FORMATTING", with the dash ban scoped to every JSON string field (G7), the reason stated, and the AI-tell list kept. (G2, G6)
- "CRITICAL RULES" stays as the closing recap, nine items instead of ten: "never invent" and "traceable to the CVs" merged. (keep list item 10)
- `buildVerifiedSkillList`: "CV-FIT ASSESSMENT BINDING (REINFORCEMENT)" restated the missing-skills ban directly below the list. It merges into the list text. The one new rule it carried (variations and sub-types such as "Sponsored Products campaigns" are banned too) is kept, along with "check every skill, tool and platform name against this list before you return the JSON". (G3, G7)
- `buildVerifiedMetricsList`: four bullets of "BINDING CONSTRAINT" become two sentences. Every constraint is kept: these are the only permitted numbers, anything else counts as fabricated, describe without a number, the list is final. (G3)
- User prompt: unchanged apart from lowercase emphasis in the language rule.

## Not changed, and why

- **Extraction prompts** (`extract_applicant`, `parse_job`, `skill_matching`, `extract_metrics` in `src/lib/agents/context-builder.ts`, and the vendored parse-cv prompt). The variant hook only swaps modules that live in `src/lib/agents/prompts/` (`evals/lib/hooks.ts`), and the harness was not mine to edit. These prompts have the same dated patterns ("CRITICAL:", "HIGH PRIORITY", ALL-CAPS), and they ran at temperatures of 0.1 to 0.3 for consistency. The guidance notes that `temperature=0` never guaranteed determinism (line 1194). Sonnet 5.5's literal instruction following is if anything a better fit for extraction (line 1274). A fair test would need a hook change to swap `context-builder.ts`. Until then the B arms run production extraction prompts.
- **The JSON-only suffix** ("IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks...") is appended in request code (`src/lib/models/anthropic.ts`, mirrored in `evals/lib/models-shim.ts`), not in a prompt module. The guidance's replacement is structured outputs (`prompt-audit.md` line 87). Both arms get the same suffix.
- **Effort, thinking and `max_tokens`** are arm settings in `evals/lib/arms.ts`, not prompt text. The guidance suggests `low` effort as the starting point for content generation and extraction (line 2183), which the `sonnet55-low` arm covers. No prompt here tells the model to think more or less, so the guidance on that (lines 2184 to 2185) needs no prompt edit.
- **The banned-phrase lists themselves.** Removing them is a candidate for a later ablation, but they are the owner's voice rules, partly code-enforced, and scored by F8. They stay.
- **Cover-letter validator phrases missing from the prompt.** The validator rejects phrases the production prompt never mentions ("I would welcome the opportunity", "Please find attached", "hit the ground running", "bring to the table" and others). Adding them would help both models equally, so it isn't a 5.5 change. Worth testing on both arms.
- **German subject prefix conflict.** The application-email system prompt says "Bewerbung als [Job Title], [Your Name]", but the user prompt renders "Bewerbung als: [Job Title], [Your Name]" (with a colon). Production has the same conflict. Which form is right is a product decision, so the variant keeps both, as production does.
- **`"ats_compatibility": 85` in the schema sample.** A single sample value can anchor the estimate (`prompt-audit.md` line 101), but replacing it risks a non-numeric answer that the validator rejects. Low confidence, so it's flagged, not edited.
- **Rule 4b examples with real-looking figures** ("€150,000 revenue", "30,000+ followers", "92% reduction"). These are anti-hallucination content and stay. If they come from the owner's CV, F1 on the owner cases will treat them as source numbers; that's worth knowing when reading the owner-case scores.
- **Patterns the guidance names that these prompts don't contain**: "think step by step", scratchpad tags, assistant prefill, tool-use steering, progress-update choreography, refusal steering. Nothing to remove.

## Changes that aren't specific to Sonnet 5.5

Three edits would help Sonnet 4.6 just as much. The write-up should report them as such, and they are worth porting to production whatever the eval decides:

1. The CV schema's trailing comma (invalid JSON in the sample).
2. The stale "Job Copilot" name in the CV role line.
3. The cover letter's dangling "Rule 4d" reference, plus a role line limited to the US and UK.

They are small. They do mean the B arms differ from arm A in a few places that have nothing to do with the model.

## Anti-hallucination check (six rules from the agent brief)

| Rule | Status | Where |
|---|---|---|
| 1. No invented metrics | Preserved | CV Rules 2, 4b, 4d and the verified-metrics list; letter Rule 2 and the verified-metric block; email Rule 2, instruction 3 and the verified-metrics block; follow-up Rule 2 |
| 2. No added skills | Preserved | CV Rules 1, 4 and 5b plus the missing-skills list (scope widened to every JSON field); letter Rule 1 plus the allow-list and block-list; email Rule 1 plus the block-list; follow-up Rule 4 |
| 3. No inferred experience | Preserved | CV Rules 2 and 4c (durations kept exactly; "2+ years of training" never becomes a headcount); "dates exactly as the original CVs give them" |
| 4. No JD-to-claim translation | Preserved | JD wording usable only for role, domain and employer context in every prompt; employer numbers never become applicant achievements (CV Rule 4d, letter `<jd_contextual_detail_rule>`) |
| 5. Rephrase only existing facts | Preserved | CV "What optimization means", keyword repositioning and Rule 4c; letter and email voice blocks write about the applicant's own CV facts; the new examples show each restated fact's CV source |
| 6. Omit when the JD demands what's missing | Preserved | Every prompt keeps "leave it out, use transferable experience instead"; "accept the lower ATS score" kept |

No rule was weakened. One was tightened: the missing-skills ban now names every JSON field instead of "anywhere in the CV".

## Verification (2026-10-12, no API calls)

```bash
npx tsc --noEmit                                  # exit 0
npx eslint evals/prompt-variants/sonnet55         # exit 0
npx tsx evals/prompt-variants/sonnet55/load-check.ts
```

- `exports.typecheck.ts` asserts, in both directions, that each variant module has the same export names, the same value types and the same exported types (`CVSectionKind`, `ResolvedCVSection`, `FitAssessmentPromptInput`) as production. A negative control, a temporary file asserting equality against a changed `computeFitLevel` signature and against a module with one export removed, failed tsc with TS2322 as expected and was deleted.
- `load-check.ts` installs the real eval hook. It confirms the hook loaded all four variant files, that export names, kinds and arities match production, that the system blocks are byte-identical across builds (cache-stable), and that the only rendered prompt lines containing a dash glyph are the punctuation rules plus the job-title separator rule.

Rendered prompt sizes for one synthetic case (characters; the ad and CV text are cut from the user prompts before counting):

| Prompt | Production | sonnet55 |
|---|---|---|
| CV system | 32,978 | 29,220 |
| Cover letter system | 19,055 | 14,136 |
| Application email system | 8,473 | 8,702 |
| Follow-up system | 4,085 | 4,333 |
| Fit assessment system | 2,693 | 2,382 |
| CV user (en) | 3,844 | 3,208 |
| Cover letter user (en) | 3,707 | 3,620 |
| Application email user (en) | 3,894 | 2,863 |
| Follow-up user (en) | 4,430 | 4,299 |
| Fit assessment user (en) | 6,092 | 4,938 |

The email system prompts grew slightly because the voice blocks and examples are new text. The rest shrank because of de-duplication.

## What to watch in the run

- **Fit assessment length.** The per-section character caps are gone, so watch F11 (200 words, headings) and how long the verdict line runs.
- **Example leakage.** Search letters and emails for the illustrative openings ("onboarding checklist", "help desk", "warehouse", "weekly revenue report"). Any hit means the examples are being copied, not just imitated.
- **Variety.** Compare first sentences across cases. The voice blocks replace temperature, so lower variety than arm A would show here.
- **Validator retries.** Watch email and letter validation misses (F18) against arm A. A rise would point at the reworded length or format text.
- **F7 em dashes on the raw output.** The rule is now stated once with its reason, instead of six times with escalating emphasis.
