# Karko AI — Complete Prompt & Configuration Export

> **Purpose:** Full export for migration from Claude Haiku 4.5 → Claude Sonnet 4.5
> **Generated:** 2026-02-07
> **Key Source Files:**
> - `src/lib/models/anthropic.ts` — Claude API client
> - `src/lib/models/types.ts` — Model configs per task
> - `src/lib/agents/unified-writer-agent.ts` — ALL phase prompts (2,022 lines)
> - `src/lib/prompts.ts` — Legacy prompt templates
> - `src/app/api/chat/route.ts` — Chat system prompt
> - `src/app/api/parse-cv/route.ts` — Standalone CV parser

---

## 1. MODEL CONFIGURATION

### Model IDs (src/lib/models/anthropic.ts)

```typescript
const BEDROCK_MODEL_ID = `us.anthropic.claude-haiku-4-5-20251001-v1:0`;
const DIRECT_MODEL_ID = 'claude-haiku-4-5';
```

### Three Auth Paths
1. Bedrock Bearer Token → custom `BedrockBearerTokenClient`
2. Bedrock IAM keys → `AnthropicBedrock` SDK
3. Direct Anthropic API → standard `Anthropic` SDK

### Default callAnthropic() Parameters
```typescript
temperature = 0.7, maxTokens = 4096, jsonMode = false
```

### JSON Mode Injection (appended to system prompt when jsonMode=true)
```
IMPORTANT: You MUST respond with ONLY valid JSON. No markdown code blocks, no explanations, no text before or after the JSON. Start your response with { and end with }. Ensure all strings are properly escaped.
```

### Prompt Caching
Uses `systemBlocks` with `cache_control: { type: 'ephemeral' }` for CV optimization (~3k tokens) and cover letter (~1.5k tokens).

### Pricing (MUST UPDATE for Sonnet)
```typescript
// Current Haiku 4.5: $1/$5 per million tokens
// Sonnet 4.5: $3/$15 per million tokens
const inputCost = (inputTokens / 1_000_000) * 1.00;  // ← CHANGE TO 3.00
const outputCost = (outputTokens / 1_000_000) * 5.00; // ← CHANGE TO 15.00
```

---

## 2. TEMPERATURE / MAX TOKENS PER TASK (src/lib/models/types.ts)

| Task | Temp | MaxTokens | Notes |
|---|---|---|---|
| parse_job_description | 0.3 | 4096 | |
| parse_cv | 0.3 | 4096 | |
| extract_skills | 0.2 | 2048 | |
| gap_analysis | 0.3 | 4096 | |
| evaluate_content | 0.2 | 2048 | |
| validate_ats | 0.1 | 2048 | |
| check_limits | 0.1 | 1024 | |
| orchestrate | 0.3 | 2048 | |
| extract_company_info | 0.2 | 2048 | |
| write_summary | 0.7 | 1024 | |
| write_bullets | 0.7 | 2048 | |
| write_cover_letter | 0.5 | 2048 | |
| refine_cover_letter | 0.4 | 2048 | |
| write_email | 0.5 | 1024 | |
| optimize_content | 0.6 | 4096 | |
| general_chat | 0.7 | 2048 | **Overridden to 100 in chat route** |
| extract_applicant | 0.3 | 4096 | |
| parse_job | 0.3 | 4096 | |
| optimize_cv | 0.4 | 8192 | |
| fit_assessment | 0.5 | 512 | **Overridden to 300 in actual call** |
| skill_matching | 0.1 | 2048 | |

---

## 3. WORKFLOW & DATA FLOW

```
Phase 1: ANALYSIS (runFitAnalysis)
  extractApplicantProfile() → context.applicant
  parseJobDescription()     → context.job
  detectLanguage()          → context.detectedLanguage (regex, not LLM)
  computeSkillMatch()       → context.match {score, matchingSkills, missingSkills}
  generateFitAssessment()   → context.fitAnalysis

Phase 2: GENERATION (runWithContext) — reuses Phase 1 context
  generateOptimizedCVData()   → context.optimizedCVData
  generateCoverLetter()       → context.coverLetter
  generateApplicationEmail()  → context.applicationEmail
```

**MasterContext** (src/lib/agents/types.ts) is the shared state object flowing between all phases. Key fields: `applicant`, `job`, `match` (with matchingSkills/missingSkills), `fitAnalysis`, `rawCV`, `masterCV`.

---

## 4. PHASE 1A: EXTRACT APPLICANT PROFILE

**Task:** `extract_applicant` | Temp: 0.3 | MaxTokens: 4096 | jsonMode: true

**System Prompt:**
```
You are a precise CV parser that extracts factual information from provided documents.

<extraction_rules>
Extract and merge information from ALL provided CV documents (Primary CV and Master CV if available). Deduplicate entries that appear in both sources. Only extract facts that are explicitly stated — do not infer, assume, or fabricate any information. If a field is not present in any source document, return null for that field. Preserve exact numbers, dates, and proficiency levels as stated in the source documents.
</extraction_rules>

Return valid JSON only. No explanation or preamble.
```

**User Prompt:**
```
Extract the applicant's complete profile from the provided CV documents. You may have TWO sources: a Primary CV and a Master CV. Extract and MERGE information from BOTH sources.

{combinedCV}

EXTRACTION RULES:
- Personal info (name, email, phone, address): Use PRIMARY CV as the source of truth
- Skills, tools, experiences, certifications: COMBINE from BOTH CVs, deduplicate
- The Master CV is a comprehensive inventory
- Extract ALL skills and tools from BOTH sources

Return a JSON object with this exact structure:
{
  "name": "string", "email": "string", "phone": "string|null",
  "address": "string|null", "headline": "string|null",
  "skills": ["ALL technical skills from BOTH CVs"],
  "tools": ["ALL tools from BOTH CVs"],
  "languages": ["spoken languages"],
  "experiences": [{"company":"","title":"","startDate":"","endDate":"","bullets":[]}],
  "certifications": ["ALL from BOTH CVs"]
}

CRITICAL: Only extract information that EXISTS. Do not invent or assume anything.
```

**Fallback:** Regex extraction if JSON parse fails.

---

## 5. PHASE 1B: PARSE JOB DESCRIPTION

**Task:** `parse_job` | Temp: 0.3 | MaxTokens: 4096 | jsonMode: true

**System Prompt:**
```
You are a job description parser that extracts structured requirements from job postings in any language.

<parsing_rules>
Extract ALL skills, requirements, and qualifications — including technical skills, soft skills, tools, frameworks, language requirements, and certifications. Preserve the original language of skill names. Distinguish between must-have and nice-to-have. Extract company name, job title, location, work type. Return null for missing fields.
</parsing_rules>

Return valid JSON only. No explanation or preamble.
```

**User Prompt:**
```
Parse this job description and extract all requirements.

JOB DESCRIPTION:
{jobDescription}

Return JSON: {"title":"","companyName":"","location":"","workType":"",
"requiredSkills":[],"niceToHaveSkills":[],"responsibilities":[],
"startDate":"","expectedSalary":""}
```

**Language detection** is regex-based (counts German indicator words, threshold ≥10).

---

## 6. PHASE 1C: SKILL MATCHING (LLM Semantic)

**Task:** `skill_matching` | Temp: 0.1 | MaxTokens: 2048 | jsonMode: true

**System Prompt:**
```
You are a precise skill matching engine. Return only valid JSON. Be fair but honest — count semantic and cross-language matches, but never inflate.
```

**User Prompt (full text from unified-writer-agent.ts lines 432-481):**
```
You are an expert recruiter performing a skill match analysis. Use SEMANTIC matching.

<matching_rules>
1. CROSS-LANGUAGE MATCHING: Same concept in different languages = match
2. CONCEPTUAL MATCHING: Closely related professional domain skills = match
3. EXPERIENCE-BASED MATCHING: Demonstrated competency via work history = match
4. LANGUAGE PROFICIENCY: B2 ≠ "verhandlungssicher" (requires C1+)
5. SOFT SKILLS: Match based on demonstrated experience
6. PARTIAL MATCHES: Genuinely related domain experience = match
7. HONESTY: No inflation. No connection = missing
8. MATCHING ACCURACY: EXACT tool/technology or direct synonym only
   NOT matches: "Google SEO Fundamentals" ≠ "Google Analytics"
   ARE matches: "Node.js" = "Node"
   When uncertain, mark as MISSING.
</matching_rules>

=== CANDIDATE SKILLS ===
{applicantSkillsList}

=== CANDIDATE EXPERIENCE ===
{experienceContext}

=== MASTER CV RAW TEXT (authoritative) ===
{masterCVText}

=== JOB REQUIRED SKILLS ===
{numbered list}

Return ONLY: {"matching":[],"missing":[],"score":N}
```

**Fallback:** Case-insensitive substring matching if LLM fails.

---

## 7. PHASE 1D: FIT ASSESSMENT

**Task:** `fit_assessment` | Temp: 0.5 | **MaxTokens: 300** (overrides config 512)

**Fit level pre-computed:** score ≥70 = strong, ≥45 = good, else weak.

**System Prompt:**
```
You are Karko AI, a senior talent acquisition specialist and career coach.

<assessment_guidelines>
You evaluate job fit using the 5-dimension framework: Skills & Competency Match, Experience Relevance, Transferable Value, Role Readiness, Competitive Positioning.

Principles:
1. HONESTY: Never sugarcoat weak fits
2. CONSTRUCTIVENESS: Always identify genuine strengths
3. SPECIFICITY: Reference actual skill names from data
4. ACTIONABILITY: Concrete strategy recommendation
5. BREVITY: Under 100 words total. Each bullet under 10 words.
</assessment_guidelines>
```

**User Prompt (full text, lines 715-795):**

Includes the 5-dimension evaluation framework with weights (40%/25%/15%/10%/10%), candidate profile data, job requirements, computed skill match data, and strict output format:

```
<output_format>
[One short sentence: verdict with job title, company, fit level]

**Strengths:**
- [10 words max]
- [10 words max]

**Gaps:**
- [10 words max]
- [10 words max]

**Recommendation:** [One sentence]
</output_format>

<strict_rules>
- HARD LIMIT: 100 words total
- Address candidate as "you"/"your"
- Exactly 2 strength bullets, 2 gap bullets, 1 recommendation
- Do NOT start with "Based on" or "Overall"
</strict_rules>
```

---

## 8. SKILL-BINDING ANTI-HALLUCINATION ARCHITECTURE

This is the critical data flow from fit assessment → CV generation.

### How It Works

1. **Phase 1C** (`computeSkillMatch`) produces `context.match`:
   - `matchingSkills: string[]` — skills verified as present
   - `missingSkills: string[]` — skills verified as absent

2. **Phase 2A** (`generateOptimizedCVData`) constructs the `verifiedSkillList` variable:

```typescript
const verifiedSkillList = match ? `
=== VERIFIED SKILL LIST (BINDING — DO NOT OVERRIDE) ===

VERIFIED MATCHING SKILLS:
${match.matchingSkills.join(', ')}

VERIFIED MISSING SKILLS (DO NOT ADD TO CV):
${match.missingSkills.join(', ')}

This list was generated by a separate verification system. You cannot override it.
If a skill appears in VERIFIED MISSING, it MUST NOT appear anywhere in the CV output.
The conservative approach (leaving it out) is always correct.
` : '';
```

3. This `verifiedSkillList` is injected into the **user prompt** for CV generation (between the job requirements and the raw CV text).

4. The CV system prompt reinforces this with **RULE 4 — SKILL ACCURACY** which states:
   > "This rule has HIGHER priority than ATS optimization."

5. **Cover letter** also receives a parallel constraint:
```
=== VERIFIED SKILL CONSTRAINT ===
SKILLS YOU MUST NOT CLAIM:
${match.missingSkills.join(', ')}
```

6. **Email** receives a similar constraint:
```
SKILL CONSTRAINT: The following skills are NOT in the applicant's background. Do not claim them: ${match.missingSkills.join(', ')}
```

### Data Flow Diagram
```
extractApplicantProfile() → applicant.skills, applicant.tools
parseJobDescription()     → job.requiredSkills
         ↓                         ↓
    computeSkillMatch(applicant, job, masterCV)
         ↓
    match.matchingSkills / match.missingSkills
         ↓                    ↓                    ↓
  CV verifiedSkillList   CL skill constraint   Email skill constraint
```

---

## 9. PHASE 2A: CV OPTIMIZATION — SYSTEM PROMPT

**Task:** `optimize_cv` | Temp: 0.4 | MaxTokens: 8192 | jsonMode: true | Uses systemBlocks with cache_control

The full system prompt is ~3,000+ tokens. Key sections (see unified-writer-agent.ts lines 886-1195):

- **Role:** "Writer Agent for Job Copilot - Expert Resume Architect"
- **Anti-hallucination rules:** 7 rules covering source verification, metric accuracy, language proficiency, skill accuracy (highest priority), skill categorization, OCR cleanup, language consistency
- **Experience selection:** Max 3-4 roles, strict bullet limits (4/3-4/3/3), max 15 total
- **Skills:** Max 5 categories, max 5 per category
- **Output:** Strict JSON CVData schema
- **ATS optimization:** "Accuracy over ATS score" principle
- **Dual-CV sourcing rules**
- **Data preservation:** Driver's license, languages, work auth, location

**User Prompt** injects: target job info, verified skill list, raw CV, master CV, language instruction.

> The FULL system prompt text is in Section 8 of the companion file `karko_ai_prompts_export_part2.md` or can be read directly from `src/lib/agents/unified-writer-agent.ts` lines 886-1195.

---

## 10. PHASE 2B: COVER LETTER — SYSTEM PROMPT

**Task:** `write_cover_letter` | Temp: 0.5 | MaxTokens: 2048 | Uses systemBlocks with cache_control

The full system prompt is ~1,500+ tokens. Key sections (see lines 1492-1687):

- **Anti-hallucination rules:** 5 rules (source verification, metric accuracy, industry accuracy, language proficiency, verification check)
- **Writing tone:** Market-specific (US/UK vs German)
- **2026 standards:** Max 250 words body, 3 paragraphs, keyword mirroring
- **Problem-Solution structure:** Opening hook → Value paragraph → Confident close → Signature
- **Location intelligence:** Relocation rules tied to Master CV statements
- **Company context extraction:** From JD only (no web search)
- **Prohibitions:** 15+ banned phrases
- **Punctuation rule:** NO em-dashes (AI writing tell)
- **Blacklist** (from `src/lib/config/cover-letter-blacklist.ts`): 40+ phrases across openings, self-descriptions, closings, fillers, greetings

**User Prompt** injects: applicant info, target position, both CVs, verified skill constraints, relocation constraints, full JD, required header format, language instruction, required signature format.

---

## 11. PHASE 2C: EMAIL GENERATION

**Task:** `write_email` | Temp: 0.5 | MaxTokens: 1024 | jsonMode: true

**System Prompt (lines 1869-1925):**
```
You are an expert at professional email communication for job applications.

<anti_hallucination_rules>
Only reference skills, tools, metrics, and experience from source CVs. Do not invent numbers. Reproduce language proficiency exactly. Every claim must be traceable.
</anti_hallucination_rules>

EMAIL SKILL ACCURACY: Only verified skills from Primary CV or Master CV.

GREETING RULE: Always "Hello," or "Hi there," — NEVER "[Name]" placeholder

STYLE: Brief, direct, professional but warm

DUAL-CV SOURCING: Use most impressive metric from EITHER source

SUBJECT LINE: "Application: [Job Title] — [Name]" (max 60 chars)
German: "Bewerbung als [Job Title] — [Name]" (max 60 chars)

ATTACHMENT REFERENCE (MANDATORY): Must include before closing

PROHIBITIONS: "I am writing to express...", "I hope this email finds you well",
"To Whom It May Concern", "I look forward to hearing from you",
"[Name]" placeholders, skills not in CVs

STRUCTURE: Greeting + hook with metric + value + attachment ref + availability + Signature

Return ONLY valid JSON: {"subject": "...", "body": "..."}
```

**User Prompt** injects: applicant name, job title, company, key JD requirement, CV highlights (first 500 chars each), skill constraints, subject line rules with strict 60-char enforcement, attachment reference rules, language instruction, signature requirement.

---

## 12. CHAT SYSTEM PROMPT (src/app/api/chat/route.ts)

**Task:** `general_chat` | Temp: 0.7 | **MaxTokens: 100** (overrides config 2048)

```
<identity>
You are Karko AI, an intelligent job application assistant. You help users optimize their CVs, write cover letters, create application emails, and navigate the job application process. You are friendly, professional, and concise.
</identity>

<current_user_state>
CV uploaded: {Yes/No}
Master CV uploaded: {Yes/No}
Certifications uploaded: {Yes/No (count)}
Job analyzed: {Yes/No}
Current application: {jobTitle} at {company}
Generated documents: {CV | Cover Letter | Email}
</current_user_state>

{master_cv_summary if available}
{certifications list if available}

<response_rules>
1. BREVITY: Under 2 sentences. Short, direct answers only.
2. CONTEXT AWARENESS: Reference current_user_state
3. SCOPE: Only job applications, CVs, cover letters, emails, career advice
4. TONE: Warm, professional, encouraging
5. ACCURACY: Only reference skills from uploaded documents
6. LANGUAGE: Match user's language
7. GUIDANCE: Be specific about next steps
8. NO REPETITION
</response_rules>
```

---

## 13. STANDALONE CV PARSER (src/app/api/parse-cv/route.ts)

**Separate Anthropic call** — not via callModel(). Direct SDK usage:

```typescript
const response = await anthropic.messages.create({
  model: 'claude-haiku-4-5',
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }],
});
```

**No system prompt.** **No temperature set** (defaults to Anthropic default of 1.0).

**User prompt** extracts structured CV data into a detailed JSON schema with personal info, experience (with date confidence levels), education, skills by category, certifications, languages, projects.

> **⚠️ MIGRATION NOTE:** This file creates its own `new Anthropic()` client and hardcodes `'claude-haiku-4-5'` — it bypasses the model abstraction layer entirely.

---

## 14. LEGACY PROMPTS (src/lib/prompts.ts)

These are exported but the **Karko AI unified agent does NOT use them**. They may be used by other parts of the app or are dead code:

- `SYSTEM_PROMPTS.analyzer` — generic job analyst
- `SYSTEM_PROMPTS.cvOptimizer` — generic CV writer
- `SYSTEM_PROMPTS.coverLetterWriter` — generic cover letter
- `SYSTEM_PROMPTS.emailWriter` — generic email
- `ANALYSIS_PROMPTS.extractRequirements()` — JD extraction
- `ANALYSIS_PROMPTS.analyzeGaps()` — gap analysis
- `GENERATION_PROMPTS.optimizeCV()` — CV with region-specific rules (US/Germany/EU)
- `GENERATION_PROMPTS.writeCoverLetter()` — cover letter with JSON output
- `GENERATION_PROMPTS.writeEmail()` — email with JSON output
- Section-specific: `optimizeHeadline()`, `optimizeSummary()`, `optimizeSkills()`, `optimizeExperienceBullet()`, `formatLanguages()`

> **⚠️ These legacy prompts have different structures and rules than the unified agent.** Confirm whether any code path still calls them before migration.

---

## 15. POST-PROCESSING

### Typo Corrections (src/lib/config/typo-corrections.ts)
Applied via `fixTypos()` to CV text, cover letter, and email output. 73 corrections for brand names (Semrush, HubSpot, LinkedIn, JavaScript, Node.js, etc.)

### Cover Letter Blacklist (src/lib/config/cover-letter-blacklist.ts)
40+ banned phrases in categories: openings, selfDescriptions, closings, fillers, greetings. Used for validation but **not currently enforced as a rejection filter in generation** — the prompts try to prevent these phrases, but there's no post-generation check that strips them.

---

## 16. MIGRATION CONCERNS & ISSUES FOR SONNET 4.5

### Issues Your Engineer MUST Know

**1. HARDCODED MODEL IDs IN TWO PLACES**
- `src/lib/models/anthropic.ts` lines 17-18: `BEDROCK_MODEL_ID` and `DIRECT_MODEL_ID`
- `src/app/api/parse-cv/route.ts` line 368: `model: 'claude-haiku-4-5'` — **bypasses the model abstraction layer entirely**, uses its own `new Anthropic()` client, no system prompt, no temperature set

**2. BEDROCK MODEL ID FORMAT**
The Bedrock model ID is constructed dynamically: `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Sonnet 4.5 will have a different Bedrock ID. You need the exact Bedrock model ID for Sonnet 4.5.

**3. PRICING HARDCODED**
`src/lib/models/index.ts` line 77-78: Haiku pricing ($1/$5) is hardcoded in `estimateCost()`.

**4. maxTokens OVERRIDES**
Two places override the config values:
- `fit_assessment`: config says 512, actual call passes 300
- `general_chat`: config says 2048, chat route passes 100
These should be reconciled — put correct values in config.

**5. PROMPT CACHING MINIMUMS**
Haiku 4.5 minimum for cache is 2,048 tokens. Sonnet 4.5 minimum is 1,024 tokens. Current prompts already exceed both thresholds, so caching will work better on Sonnet.

**6. SONNET 4.5 BEHAVIORAL DIFFERENCES — PROMPT IMPLICATIONS**

| Concern | Haiku Behavior | Sonnet Implication | Action Needed |
|---|---|---|---|
| **JSON compliance** | Sometimes wraps in ```json blocks despite instructions | More literal instruction following — may still need the `parseAnthropicJSON` cleanup | Test; may be able to remove JSON cleanup code |
| **Creativity in CVs** | Temp 0.4 produces decent variety | Sonnet at 0.4 may be too conservative | May need to increase to 0.5-0.6 |
| **Cover letter tone** | Haiku fills gaps, adds warmth even when not asked | Sonnet will do exactly what's asked — nothing more | Add explicit tone instructions: "Write with warmth and personality" |
| **Word count adherence** | Haiku often overshoots 100-word fit assessment limit | Sonnet should follow 100-word limit precisely | This is a win — may not need maxTokens:300 override |
| **Bullet count adherence** | Haiku sometimes adds 5+ bullets instead of 4 | Sonnet should follow "exactly 4 bullets" literally | This is a win |
| **Anti-hallucination** | Haiku sometimes adds implied skills despite rules | Sonnet should follow "DO NOT ADD" constraints better | This is a win — core product differentiator |
| **Email length** | Haiku sometimes exceeds 4-sentence limit | Sonnet will stick to 4 sentences | This is a win |
| **Output tokens** | optimize_cv at 8192 is generous for Haiku | Sonnet may use more tokens for same content due to better detail | Monitor token usage |

**7. COST IMPACT**
Sonnet 4.5 is 3x input / 3x output vs Haiku 4.5. A full pipeline run will cost ~3x more. Prompt caching savings will offset some of this (cache reads at 10% of base price).

**8. LATENCY IMPACT**
Sonnet 4.5 is slower than Haiku 4.5. The sequential 5-7 API call pipeline will take longer. Consider if any calls can be parallelized (Phase 1A and 1B are independent — they could run in parallel but currently don't).

**9. NO TOOL/FUNCTION CALLING**
The system does **not** use Claude's native tool/function calling feature. All "tool usage" is prompt-based JSON extraction. There are no `tools` arrays in API calls.

**10. STREAMING LIMITATION**
`callAnthropicStream()` does not support `systemBlocks` (prompt caching). It only takes `systemPrompt` as string. If any streaming call needs caching, this needs to be fixed.

**11. DEAD CODE / UNUSED TASKS**
Several task types in `MODEL_CONFIGS` appear unused by the unified agent: `parse_job_description`, `parse_cv`, `extract_skills`, `gap_analysis`, `evaluate_content`, `validate_ats`, `check_limits`, `orchestrate`, `extract_company_info`, `write_summary`, `write_bullets`, `refine_cover_letter`, `optimize_content`. They may be used by legacy code paths or are dead code. Confirm before updating all 21 configs.

**12. FILES THAT NEED CHANGES FOR MIGRATION**
1. `src/lib/models/anthropic.ts` — Model IDs (lines 17-18)
2. `src/lib/models/types.ts` — All MODEL_CONFIGS entries (model field)
3. `src/lib/models/index.ts` — estimateCost() pricing, comments
4. `src/app/api/parse-cv/route.ts` — Hardcoded model ID (line 368)
5. Temperature values — may need tuning for Sonnet behavior
6. Prompts — may need explicit quality/tone instructions added
