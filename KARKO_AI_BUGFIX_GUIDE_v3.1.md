# Karko AI — Implementation Guide v3.1: Critical Bug Fixes (Updated)

**Created:** February 6, 2026
**Updated:** February 6, 2026 — Added root cause analysis from ATS/Match Score codebase audit
**For:** Developer Agent (Claude Opus 4.6 in Windsurf, Thinking Mode ON)
**Reference:** `KARKO_AI_ATS_MATCH_SCORE_AUDIT.md` for full codebase context

---

## Agent Instructions

**Use Thinking Mode (Extended Thinking) for this task.** Bug 1 especially requires understanding a structural conflict between competing prompt instructions.

**Context Window Management:**
- Read this ENTIRE file first before making any changes
- The key file is `unified-writer-agent.ts` — 90% of changes go there
- Work through bugs in order (P0 first, then P1, then P2)
- After EACH bug fix, run `npm run build` to verify
- After completing each fix, update the state tracker markdown of the related files

---

## Root Cause Analysis: Why the LLM Fabricates Skills

Before fixing individual bugs, understand this — it explains Bugs 1, 2, 3, and 8.

### The Structural Conflict

There are **two competing instruction sets** in the CV optimization prompt:

**Instruction Set A — ATS Optimization (lines ~1027-1054):**
```
KEYWORD MIRRORING: Use EXACT phrases from the job description
SKILLS SECTION: List JD keywords FIRST, then additional relevant skills
```
Plus the `missing_keywords_added` field in the JSON schema, which literally asks: "What missing keywords did you add to the CV?"

**Instruction Set B — Skill Accuracy (RULE 4):**
```
Only add skills explicitly listed in Primary CV or Master CV
Never add skills just because the JD requires them
```

**Result:** The LLM resolves this conflict by prioritizing ATS optimization (it's louder, more detailed, has a reporting mechanism, and the LLM knows it's being self-scored on ATS compatibility). RULE 4 loses every time.

### The `missing_keywords_added` Problem

The field name itself instructs fabrication:
- "missing" = not in the CV
- "keywords" = from the JD
- "added" = you put them in

Translation: "List the JD keywords that weren't in the CV which you added." This DIRECTLY tells the LLM to inject skills the applicant doesn't have.

### The Self-Assessment Bias

The ATS compatibility score (0-100) is the LLM grading its own work. Higher keyword coverage = higher self-score. The LLM is incentivized to add more JD keywords to give itself a better grade.

### The Fix Strategy

We need to:
1. **Redefine `missing_keywords_added`** — Change its meaning from "missing skills I fabricated" to "existing skills I repositioned for ATS"
2. **Make skill accuracy structurally dominant** — Not just another rule, but a framework that wraps around and constrains ATS optimization
3. **Separate "keyword repositioning" from "keyword injection"** — The LLM should reposition existing skills for ATS visibility, not inject new ones

---

## Bug Tracker

| # | Severity | Bug | Status |
|---|----------|-----|--------|
| 1 | P0 | CV fabricates skills — structural ATS vs accuracy conflict | ✅ |
| 2 | P0 | Fit assessment ignores Master CV (0% on JD4) | ✅ |
| 3 | P0 | Cover letter fabricates international relocation | ✅ |
| 4 | P1 | Driver's license not appearing in CV output | ✅ |
| 5 | P1 | Education "in Allgemeinbildung" still appearing | ✅ |
| 6 | P2 | German subject line exceeds 60 characters | ✅ |
| 7 | P2 | Raw primary CV text leaking into optimized output | ✅ |
| 8 | P2 | Fit assessment lists non-existent skills as matching | ✅ |

---

## Bug 1 (P0): CV Fabricates Skills — Structural Fix

This is a 3-part fix targeting the root cause.

### Part A: Rewrite ATS Optimization Rules

Find the `=== ATS OPTIMIZATION (2026 STANDARDS) ===` section in the CV optimization prompt (around lines 1027-1054 of `unified-writer-agent.ts`). **REPLACE THE ENTIRE SECTION** with:

```
=== ATS OPTIMIZATION (2026 STANDARDS) ===

FOUNDATIONAL PRINCIPLE — ACCURACY OVER ATS SCORE:
ATS optimization means making the applicant's REAL skills more visible to automated systems.
It does NOT mean adding skills the applicant doesn't have.
A CV with 70% ATS compatibility and zero fabricated skills is ALWAYS better than
a CV with 95% ATS compatibility that includes skills the applicant will fail to demonstrate in an interview.

1. SECTION HEADERS: Use ONLY standard ATS-recognized headers:
   - "Professional Summary" or "Summary" or "Profil"
   - "Professional Experience" or "Work Experience" or "Berufserfahrung"
   - "Education" or "Ausbildung"
   - "Skills" or "Core Competencies" or "Fähigkeiten"
   - "Certifications" or "Zertifikate"
   - "Languages" or "Sprachen"
   NEVER use creative headers like "What I Bring", "My Journey"

2. KEYWORD REPOSITIONING (NOT INJECTION):
   - Scan the JD for required skills and keywords
   - Check if the applicant HAS those skills (in Primary CV or Master CV)
   - If YES: Reposition that skill to be more prominent — move to Skills section header, use exact JD phrasing
   - If NO: Do NOT add the skill. Leave it out. The fit assessment already flagged it as a gap.
   - Include both acronyms AND full forms for skills the applicant HAS: "SEO (Search Engine Optimization)"

3. BULLET FORMAT (CAR Method - Challenge → Action → Result):
   - Every bullet MUST start with a strong action verb
   - Every bullet SHOULD include at least one metric/number when available
   - No action verb used more than twice across ALL bullets
   - Bullets must describe things the applicant ACTUALLY DID (from Primary CV or Master CV)

4. SKILLS SECTION ORDERING:
   - List skills that MATCH the JD first (but only skills the applicant actually has)
   - Then list additional relevant skills from the applicant's background
   - Match EXACT terminology from job posting WHERE the applicant has the equivalent skill
   - Example: If JD says "project management" and Master CV shows project management experience → use "Project Management"
   - Example: If JD says "Kubernetes" and neither CV mentions it → DO NOT ADD IT

5. WHAT "OPTIMIZATION" MEANS:
   - Rephrasing existing skills to match JD terminology (e.g., "managed teams" → "Project Management")
   - Reordering sections to put most relevant experience first
   - Adding metrics from Master CV that Primary CV omitted
   - Using exact JD phrases for skills the applicant demonstrably has
   
   WHAT "OPTIMIZATION" DOES NOT MEAN:
   - Adding skills not found in any applicant document
   - Claiming proficiency in tools never mentioned
   - Inventing experience or achievements
   - Inferring skills from adjacent knowledge (e.g., "knows Node.js" ≠ "knows Python")
```

### Part B: Redefine `missing_keywords_added` in the JSON Schema

Find the `=== "CHANGES" TAB LOGIC ===` section and the JSON schema example. **REPLACE** the `missing_keywords_added` description:

**OLD:**
```
- missing_keywords_added: List of keywords from the job description that you added to the CV
```

**NEW:**
```
- keywords_repositioned_for_ats: List of EXISTING applicant skills that you repositioned, rephrased, or made more prominent to match JD terminology. These must ALL be skills the applicant already had — you are reporting what you MOVED, not what you INVENTED. If a JD keyword has no matching skill in the applicant's background, do NOT include it here.
```

**IMPORTANT:** This field name change (`missing_keywords_added` → `keywords_repositioned_for_ats`) requires updating:
1. The JSON schema in the prompt
2. The TypeScript interface `OptimizationAnalysis` in `src/lib/agents/types.ts`
3. The parsing logic in `unified-writer-agent.ts` (around lines 1222-1227)
4. The UI rendering in `src/components/CVPanel.tsx` (the gold pills section)
5. The duplicated type definitions in:
   - `src/store/useSessionStore.ts`
   - `src/hooks/useAgentV2.ts`
   - `src/types/agent.ts`

**If renaming the field across the codebase is too risky or too many files to change**, you can keep the field name `missing_keywords_added` but change ONLY the prompt description to:

```
- missing_keywords_added: List of EXISTING applicant skills that you repositioned or rephrased to better match ATS keywords from the JD. Only include skills the applicant ALREADY HAD in their Primary CV or Master CV. This is a report of what you REPOSITIONED, not what you INVENTED.
```

This is the safer approach — no TypeScript changes needed, just prompt changes.

### Part C: Add Accuracy Override to Skill Inference Rule

Find the existing RULE 4 (Skill Inference) or the skill accuracy rule. **REPLACE** it with this version that explicitly references the ATS tension:

```
RULE — SKILL ACCURACY (HIGHEST PRIORITY — OVERRIDES ATS OPTIMIZATION):

This rule has HIGHER priority than ATS optimization. If there is ANY conflict between
improving ATS score and maintaining skill accuracy, skill accuracy WINS.

You may ONLY include a skill, tool, or technology in the CV if:
1. It is EXPLICITLY listed by name in the Primary CV OR Master CV
2. It is DIRECTLY used in a described project (e.g., "Technology Stack: Next.js" → can list Next.js)

You may NEVER include a skill if:
- It is only IMPLIED by adjacent skills ("Amazon Seller Central" does NOT imply "Amazon Advertising Console")
- It is required by the JD but absent from the applicant's documents
- Adding it would improve the ATS score (ATS score is secondary to accuracy)
- It is industry-standard but the applicant hasn't listed it ("knows Node.js" does NOT imply "knows Python")

CONCRETE EXAMPLES OF VIOLATIONS:
- Master CV: "Google SEO Fundamentals" → Adding "Google Analytics" = FORBIDDEN (different product)
- Master CV: "Amazon Seller Central" → Adding "Amazon Advertising Console" = FORBIDDEN (different tool)
- Master CV: "Node.js, Next.js" → Adding "Python" = FORBIDDEN (different language)
- Master CV: "Listing Optimization" → Adding "A/B Testing" = FORBIDDEN (different methodology)
- Master CV: "Supabase" → Adding "FastAPI" = FORBIDDEN (different technology)

IF A JD KEYWORD HAS NO MATCH IN THE APPLICANT'S DOCUMENTS:
→ Do NOT add it to the CV
→ Do NOT add it to keywords_repositioned_for_ats
→ The fit assessment already flagged it as a gap
→ Accept a lower ATS compatibility score — honesty is the product's value proposition
```

### Part D: Add Same Rule to Cover Letter and Email Prompts

**Cover letter system prompt — ADD:**
```
COVER LETTER SKILL ACCURACY (HIGHEST PRIORITY):

The cover letter must NEVER claim experience with skills, tools, or technologies not documented in the Primary CV or Master CV. This overrides all other instructions.

FORBIDDEN: "I've executed A/B testing" (if not in Master CV)
FORBIDDEN: "Proficient in Python" (if not in Master CV)
FORBIDDEN: "Experience with [tool]" (if not in Master CV)

Sell what the applicant HAS. Never fabricate what they DON'T have.
If the JD requires a skill the applicant lacks, emphasize transferable skills and learning ability instead.
```

**Email prompt — ADD:**
```
EMAIL SKILL ACCURACY: Only reference skills and achievements verified in Primary CV or Master CV. Never claim undocumented skills.
```

---

## Bug 2 (P0): Fit Assessment Ignores Master CV

### Problem

JD4 returned 0% match with "Zero documented web development skills" — but Master CV lists HTML, CSS, JavaScript, React, Next.js, TypeScript, Node.js, Git.

The fit assessment's `computeSkillMatch()` function (lines ~428-491) is likely only receiving Primary CV data as input.

### Root Cause Investigation

Check the `computeSkillMatch()` function call. What is passed as the `applicant` parameter? Specifically:
1. Does `applicant.skills` include skills from the Master CV?
2. Or only skills extracted from the Primary CV?

Also check `extractApplicantProfile()` — does it merge Primary CV + Master CV data?

### Fix

**Step 1:** Find where `extractApplicantProfile()` builds the applicant profile. Verify it includes Master CV data. If the Master CV content is available in `MasterContext` but not being passed to `computeSkillMatch()`, that's the gap.

**Step 2:** Ensure the skill matching prompt receives BOTH data sources. Update the user prompt in `computeSkillMatch()`:

```
=== CANDIDATE SKILLS AND EXPERIENCE ===

PRIMARY CV SKILLS:
${primaryCVSkills}

MASTER CV SKILLS (comprehensive inventory — treat as authoritative):
${masterCVSkills}

IMPORTANT: A skill listed in EITHER document counts as a candidate skill.
The Master CV is the complete skills inventory. If a skill appears in the Master CV
but not the Primary CV, it is still a real skill the candidate has.

=== JOB REQUIREMENTS ===
${jobRequiredSkills}
```

**Step 3:** Similarly update `generateFitAssessment()` (lines ~684-800) to include Master CV context:

```
FIT ASSESSMENT DATA SOURCES:

Assess the candidate against ALL available documents:
1. Primary CV — the uploaded resume
2. Master CV — the comprehensive skills and experience inventory (if available)

A skill in EITHER document is a candidate skill. Only mark as MISSING if absent from BOTH.
```

**Step 4:** Verify by checking: after the fix, JD4 should recognize HTML, CSS, JavaScript, React, Next.js, Git as matching skills and produce a score significantly above 0%.

---

## Bug 3 (P0): Cover Letter Fabricates International Relocation

### Problem

Master CV says: "Ready to relocate to major German cities (Berlin, Munich, Hamburg, etc.)"
Cover letter promised New York (JD1) and Toronto (JD3). Only Munich (JD4) was correct.

### Fix

Find the LOCATION INTELLIGENCE section in the cover letter prompt. **REPLACE** entirely with:

```
LOCATION INTELLIGENCE:

Before generating the cover letter, check:
1. Applicant's current location (from CV/Master CV)
2. Job location (from JD)
3. Master CV relocation preferences — read the EXACT text

RELOCATION RULES:
- If Master CV specifies relocation to specific cities/regions → ONLY mention relocation to those places
- Example: "Ready to relocate to major German cities" → can mention Munich, Berlin, Hamburg — CANNOT mention New York, Toronto, London
- If job is in a city/country NOT covered by the Master CV relocation statement → Do NOT mention relocation at all
- If job is fully remote → Do NOT mention relocation
- If Master CV has no relocation statement → Do NOT mention relocation

NEVER fabricate relocation willingness beyond what the Master CV explicitly states.
International relocation requires the user to update their Master CV — the AI cannot assume it.
```

---

## Bug 4 (P1): Driver's License Not in CV Output

### Problem

Master CV has "Driver's License: Class B". All 4 CV outputs omit it. Changes tab claims it's preserved, but it's not in the actual text.

### Fix

The LLM acknowledges the rule but doesn't know WHERE to place it. Add explicit placement:

```
DRIVER'S LICENSE PLACEMENT:

If Primary CV or Master CV includes a driver's license:
- Include it in the CV header/contact line OR as a separate line in personal info
- This MUST appear in the actual CV text output, not just in the analysis/changes metadata

English format:
jalaliwasim15@gmail.com | +49 163 044 6980 | Kaiserslautern | Driver's License: Class B

German format:
jalaliwasim15@gmail.com | +49 163 044 6980 | Kaiserslautern | Führerschein: Klasse B

After generating the CV, verify the driver's license text appears in the output.
```

---

## Bug 5 (P1): Education "in Allgemeinbildung" Still Appearing

### Problem

JD3: "in General Education" and JD4: "in Allgemeinbildung" still present despite Task 7 prompt.

### Fix

The existing rule is too subtle. Make it an explicit prohibition with examples:

```
EDUCATION FORMATTING (MANDATORY — NO EXCEPTIONS):

REMOVE these phrases from ALL education lines:
- "in Allgemeinbildung" — ALWAYS DELETE THIS
- "in General Education" — ALWAYS DELETE THIS
These are redundant with "Allgemeine Hochschulreife" / "General University Entrance Qualification"

CORRECT:
- German: "Allgemeine Hochschulreife (Abitur-Äquivalent) | Note: 92,43%"
- English: "General University Entrance Qualification (Abitur Equivalent) | Grade: 92.43%"

WRONG (never output these):
- "...in Allgemeinbildung" ← DELETE "in Allgemeinbildung"
- "...in General Education" ← DELETE "in General Education"

If the source CV contains these phrases, REMOVE them during optimization.
```

---

## Bug 6 (P2): German Subject Line Over 60 Characters

### Fix

Add to email subject line rules:

```
SUBJECT LINE LENGTH — STRICT ENFORCEMENT:

Maximum: 60 characters. No exceptions.

If job title is too long:
1. Use only the PRIMARY title (before any "/" or "—" separator in the JD title)
2. Drop secondary titles or specializations
3. "Junior Webentwickler / E-Commerce" → use "Junior Webentwickler" only

After composing the subject line, COUNT characters. If over 60, shorten the job title portion.
```

---

## Bug 7 (P2): Raw CV Text Leaking Into Output

### Problem

JD4 has unprocessed text after Certifications: "Co-Founder | Kursfind AI (Side Project) Kaiserslautern | 2025 –" followed by address info.

### Fix

**Step 1:** Search codebase for where optimized CV output is assembled. Check if there's any logic that appends "remaining" or "unparsed" primary CV sections after the LLM output.

**Step 2:** If found in code, remove the append logic. The optimized CV should be self-contained.

**Step 3:** If it's in the LLM output itself, add to CV prompt:

```
OUTPUT COMPLETENESS:
Your CV output must be a COMPLETE, standalone document ending after the last section (Certifications, Languages, or similar). Do NOT append any raw text from the original CV. Nothing follows the last section.
```

---

## Bug 8 (P2): Fit Assessment Lists Non-Existent Skills as Matching

### Problem

JD1 lists "Google Analytics" as Matching despite it not being in either CV.

### Fix

Add to the `computeSkillMatch()` prompt:

```
MATCHING ACCURACY:

A skill is MATCHING only if the EXACT tool/technology (or a direct synonym) appears in the applicant's documents.

NOT matches (different products/tools):
- "Google SEO Fundamentals" ≠ "Google Analytics"
- "Amazon Seller Central" ≠ "Amazon Advertising Console"
- "JavaScript" ≠ "Python"

ARE matches (same tool, different naming):
- "Node.js" = "Node"
- "Helium 10" = "Helium10"

When uncertain, mark as MISSING. False negatives are far less harmful than false positives.
```

---

## Post-Fix Verification

After all fixes, rerun the 4 test JDs and check:

### JD #3 (Honesty test — most critical):
- [ ] CV does NOT list Python, FastAPI, LangChain, or PyTorch
- [ ] Cover letter does NOT claim Python experience
- [ ] `keywords_repositioned_for_ats` (or `missing_keywords_added`) only lists skills from Master CV
- [ ] ATS compatibility score may be lower (60-75% instead of 78%) — this is CORRECT
- [ ] Fit assessment still ~43% (weak fit)
- [ ] No Toronto relocation

### JD #4 (Master CV integration test):
- [ ] Fit assessment recognizes HTML, CSS, JavaScript, React, Next.js, Git — score should be 50-70%, NOT 0%
- [ ] CV includes driver's license
- [ ] No "in Allgemeinbildung"
- [ ] Subject line ≤ 60 chars
- [ ] No raw text leak
- [ ] Munich relocation ✅ (German city, allowed by Master CV)

### JD #1 and #2 (Regression):
- [ ] No Google Analytics in CV (not in Master CV)
- [ ] No Amazon Advertising Console in JD2 CV
- [ ] No A/B testing claims in JD1 cover letter
- [ ] Driver's license present in both CVs
- [ ] All previously passing checks still pass

---

## Commit Message

```
fix: resolve structural conflict between ATS optimization and skill accuracy

ROOT CAUSE: ATS keyword mirroring rules + missing_keywords_added field were
instructing the LLM to inject JD skills not in applicant's documents,
overriding the skill accuracy rule (RULE 4).

FIXES:
- P0: Rewrite ATS optimization to "keyword repositioning" (not injection)
  Redefine missing_keywords_added as repositioned existing skills only
  Make skill accuracy rule structurally dominant over ATS scoring
- P0: Fix fit assessment to read both Primary CV and Master CV
- P0: Fix relocation to respect Master CV scope (German cities only)
- P1: Add explicit driver's license placement instructions
- P1: Strengthen education formatting prohibition
- P2: Enforce 60-char subject line with long title handling
- P2: Fix raw CV text leaking into optimized output
- P2: Fix fit assessment matching non-existent skills

ARCHITECTURE NOTE: missing_keywords_added field meaning changed from
"JD keywords injected into CV" to "existing skills repositioned for ATS visibility"
```

---

*Fix in order: 1A → 1B → 1C → 1D → 2 → 3 → 4 → 5 → 6 → 7 → 8. Build after each. Push when all pass.*
