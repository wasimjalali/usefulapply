# Karko AI — ATS Compatibility & Match Score: Full Codebase Audit

**Generated:** February 6, 2026  
**Scope:** Every file, prompt, type definition, UI component, and data flow related to ATS compatibility scoring and match scoring in the Karko codebase.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Two Scores (ATS Compatibility vs Match Score)](#2-the-two-scores)
3. [Score 1: Match Score (Skill Match %)](#3-score-1-match-score)
4. [Score 2: ATS Compatibility (Changes Tab %)](#4-score-2-ats-compatibility)
5. [Type Definitions](#5-type-definitions)
6. [System Prompts — Full Extracts](#6-system-prompts)
7. [UI Rendering — Where Scores Are Displayed](#7-ui-rendering)
8. [Data Flow Diagram](#8-data-flow-diagram)
9. [QualityScoreCard Component (Unused/Legacy)](#9-qualityscorecard-component)
10. [ATS Optimization Rules in CV Prompt](#10-ats-optimization-rules)
11. [Key Observations & Risks](#11-key-observations--risks)

---

## 1. Architecture Overview

There are **two distinct scoring systems** in Karko AI, and they are often confused:

| Score | What It Measures | Who Computes It | Where It's Shown |
|-------|-----------------|----------------|-----------------|
| **Match Score** (0-100%) | How well the candidate's existing skills match the JD requirements | LLM (skill matching step) + fallback string matcher | Chat panel (fit analysis message), session store |
| **ATS Compatibility** (0-100%) | How well the *optimized CV* will perform in ATS systems | LLM (CV generation step) — self-assessed | CV Panel → Changes tab (progress bar) |

**Critical distinction:** Match Score is computed *before* CV generation (Phase 1). ATS Compatibility is computed *during* CV generation (Phase 2) and is the LLM's self-assessment of its own output.

---

## 2. The Two Scores

### Match Score
- **Purpose:** Pre-generation assessment — "Should the user even apply?"
- **Computed by:** `computeSkillMatch()` in Phase 1 (analysis)
- **Input:** Candidate skills/experience vs JD required skills
- **Method:** LLM semantic matching with string-match fallback
- **Stored in:** `MasterContext.match.score` → `session.matchScore` → `session.gaps.matchScore`
- **Displayed in:** Chat panel fit analysis message (e.g., "🟢 Strong Fit for Senior Developer at Company (78% match)")

### ATS Compatibility
- **Purpose:** Post-generation quality signal — "How ATS-friendly is the optimized CV?"
- **Computed by:** The same LLM call that generates the optimized CV
- **Input:** The LLM self-assesses its own output
- **Method:** LLM estimates based on keyword coverage, section headers, formatting
- **Stored in:** `optimizedCVData.analysis.ats_compatibility`
- **Displayed in:** CV Panel → Changes tab (gold progress bar with percentage)

---

## 3. Score 1: Match Score (Skill Match %)

### 3.1 Primary: LLM-Based Semantic Matching

**File:** `src/lib/agents/unified-writer-agent.ts` — `computeSkillMatch()` (lines ~428-491)

```typescript
// Called during Phase 1 (analysis), before any document generation
async computeSkillMatch(applicant, job): Promise<{ score, matchingSkills, missingSkills }>
```

**Full LLM Prompt:**
```
You are an expert recruiter performing a skill match analysis. Compare the candidate's 
skills and experience against the job requirements. Use SEMANTIC matching — skills don't 
need to be exact string matches.

<matching_rules>
1. CROSS-LANGUAGE MATCHING: Skills expressed in different languages that refer to the 
   same concept or domain are matches.
2. CONCEPTUAL MATCHING: Skills that are closely related within the same professional 
   domain count as matches.
3. EXPERIENCE-BASED MATCHING: If the candidate's work experience clearly demonstrates 
   a competency even though it is not explicitly listed as a skill, count it as a match.
4. LANGUAGE PROFICIENCY: Match language requirements honestly using CEFR standards. 
   B2 does NOT match "verhandlungssicher" (requires C1-C2).
5. SOFT SKILLS: Match based on demonstrated experience, not just keywords.
6. PARTIAL MATCHES: Genuinely related experience in the same domain counts.
7. HONESTY: Do not inflate. If no connection exists, mark as missing.
</matching_rules>

=== OUTPUT FORMAT (strict JSON) ===
{
  "matching": ["skill1", "skill2"],
  "missing": ["skill3", "skill4"],
  "score": 35
}
```

**System prompt:** `"You are a precise skill matching engine. Return only valid JSON. Be fair but honest — count semantic and cross-language matches, but never inflate."`

**Score computation (post-LLM):**
```typescript
// Lines ~481-482
const score = typeof parsed.score === 'number' 
  ? Math.max(0, Math.min(100, Math.round(parsed.score))) 
  : (requiredSkills.length > 0 
    ? Math.round((matchingSkills.length / requiredSkills.length) * 100) 
    : 0);
```

The LLM provides its own score, but if it's not a number, the code falls back to `matchingSkills.length / requiredSkills.length * 100`.

### 3.2 Fallback: String-Based Matching

**File:** `src/lib/agents/unified-writer-agent.ts` — `computeSkillMatchFallback()` (lines ~496-532)

Used only if the LLM call fails:

```typescript
computeSkillMatchFallback(applicant, job) {
  // Simple substring matching: skill.includes(required) || required.includes(skill)
  const score = requiredSkills.length > 0
    ? Math.round((matchingSkills.length / requiredSkills.length) * 100)
    : 0;
  return { score, matchingSkills, missingSkills };
}
```

### 3.3 Fit Level Classification

**File:** `src/lib/agents/unified-writer-agent.ts` — `generateFitAssessment()` (lines ~684-800)

The match score is classified into fit levels:

```typescript
const fitLevel: 'strong' | 'good' | 'weak' = 
  (match?.score ?? 0) >= 70 ? 'strong' :
  (match?.score ?? 0) >= 45 ? 'good' : 'weak';
```

| Score Range | Fit Level | Emoji |
|------------|-----------|-------|
| 70-100% | Strong | 🟢 |
| 45-69% | Good | 🟡 |
| 0-44% | Weak | 🔴 |

### 3.4 Match Score Data Flow

```
computeSkillMatch() → MasterContext.match.score
                     ↓
              generateFitAssessment() → MasterContext.fitAnalysis.score
                     ↓
              ChatPanel (fit_analysis_complete event)
                     ↓
              useAppStore → session.matchScore, session.gaps.matchScore
```

**ChatPanel rendering (lines ~358-373):**
```typescript
case 'fit_analysis_complete': {
  const { contextId, fitAnalysis, job } = data;
  const fitEmoji = fitAnalysis.fitLevel === 'strong' ? '🟢' : 
                   fitAnalysis.fitLevel === 'good' ? '🟡' : '🔴';
  const fitLabel = fitAnalysis.fitLevel === 'strong' ? 'Strong Fit' : 
                   fitAnalysis.fitLevel === 'good' ? 'Good Fit' : 'Weak Fit';
  
  addChatMessage({
    content: `${fitEmoji} **${fitLabel}** for **${job?.title}** at **${job?.companyName}** (${fitAnalysis.score}% match)\n\n${fitAnalysis.assessment}`,
    actions: [
      { label: 'Apply for This Job', action: 'generate-full-application' },
      { label: 'Start New Application', action: 'skip-job' },
    ],
  });
}
```

---

## 4. Score 2: ATS Compatibility (Changes Tab %)

### 4.1 How It's Generated

**File:** `src/lib/agents/unified-writer-agent.ts` — `generateOptimizedCVData()` (lines ~820-1240)

The ATS compatibility score is **not computed by any algorithm**. It is part of the `analysis` object that the LLM is instructed to include in its JSON output when generating the optimized CV.

**Prompt instruction (lines ~948-953):**
```
=== 🧠 "CHANGES" TAB LOGIC ===
You MUST populate the "analysis" object to explain your work to the user:
- summary: Explain your high-level strategy in 2 sentences
- key_changes: A list of 4-6 specific improvements made
- ats_compatibility: Your estimated ATS compatibility score (0-100)
- missing_keywords_added: List of keywords from the job description that you added to the CV
```

**JSON schema example (lines ~1019-1024):**
```json
"analysis": {
  "summary": "2-sentence strategy summary",
  "key_changes": ["Change 1", "Change 2", "Change 3", "Change 4"],
  "ats_compatibility": 85,
  "missing_keywords_added": ["keyword1", "keyword2"]
}
```

**System prompt enforcement (line ~853):**
```
CRITICAL: Always include the "analysis" object with summary, key_changes, 
ats_compatibility, and missing_keywords_added fields.
```

**Critical rule #7 (line ~1088):**
```
7. ALWAYS include the "analysis" object - it powers the Changes tab
```

### 4.2 How It's Parsed

**File:** `src/lib/agents/unified-writer-agent.ts` (lines ~1222-1227)

```typescript
analysis: parsed.analysis ? {
  summary: parsed.analysis.summary as string || '',
  key_changes: (parsed.analysis.key_changes as string[]) || [],
  ats_compatibility: (parsed.analysis.ats_compatibility as number) || 0,
  missing_keywords_added: (parsed.analysis.missing_keywords_added as string[]) || [],
} : undefined,
```

Note: If the LLM omits `analysis` entirely, it defaults to `undefined`. If `ats_compatibility` is missing or not a number, it defaults to `0`.

### 4.3 What Informs the ATS Score

The LLM bases its ATS compatibility estimate on the rules it was given:

**ATS Optimization Rules (lines ~1027-1054):**
```
=== ATS OPTIMIZATION (2026 STANDARDS) ===
1. SECTION HEADERS: Use ONLY standard ATS-recognized headers:
   - "Professional Summary" or "Summary"
   - "Professional Experience" or "Work Experience"
   - "Education"
   - "Skills" or "Core Competencies"
   - "Certifications"
   - "Languages"
   NEVER use creative headers like "What I Bring", "My Journey"

2. KEYWORD MIRRORING: Use EXACT phrases from the job description, not synonyms.
   - JD says "project management" → write "project management" (NOT "managing projects")
   - Include both acronyms AND full forms: "SEO (Search Engine Optimization)"
   - Place JD keywords in Skills section FIRST, then in bullet points

3. BULLET FORMAT (CAR Method - Challenge → Action → Result):
   - Every bullet MUST start with a strong action verb
   - Every bullet SHOULD include at least one metric/number
   - No action verb used more than twice across ALL bullets

4. SKILLS SECTION: List JD keywords FIRST, then additional relevant skills
   - Match EXACT terminology from job posting
   - Include tool versions where relevant
```

### 4.4 The `missing_keywords_added` Field

This field reports which JD keywords the LLM added to the CV. It is:
- **Metadata only** — displayed as gold pills in the Changes tab
- **NOT programmatic injection** — the LLM decides what to add during generation
- **Constrained by RULE 4 (Skill Inference)** — only skills explicitly in the CV or demonstrated by projects can be added

---

## 5. Type Definitions

### 5.1 OptimizationAnalysis Interface

**File:** `src/lib/agents/types.ts` (lines 175-184)

```typescript
/**
 * OptimizationAnalysis - Data for the "Changes" tab
 * AI must populate this to explain what optimizations were made
 */
export interface OptimizationAnalysis {
  summary: string;                   // 2-sentence strategy summary
  key_changes: string[];             // List of specific changes made
  ats_compatibility: number;         // Estimated ATS score 0-100
  missing_keywords_added: string[];  // Keywords added for ATS
}
```

### 5.2 MasterContext (Agent Internal State)

**File:** `src/lib/agents/types.ts` (lines 88-172)

```typescript
// Match analysis (computed by Context Agent)
match?: {
  score: number;           // 0-100 skill match percentage
  matchingSkills: string[];
  missingSkills: string[];
};

// Structured CV data includes analysis
optimizedCVData?: {
  // ... personal, experience, education, skills, etc.
  analysis?: OptimizationAnalysis;  // <-- ATS compatibility lives here
};

// Fit analysis result (pre-generation assessment)
fitAnalysis?: {
  fitLevel: 'strong' | 'good' | 'weak';
  score: number;           // 0-100 from computeSkillMatch
  assessment: string;      // AI-written assessment paragraph
  matchingSkills: string[];
  missingSkills: string[];
};
```

### 5.3 Session Store Types

**File:** `src/store/useSessionStore.ts` (lines ~116-125)

```typescript
// In OptimizedCVData type (duplicated from agents/types.ts):
analysis?: {
  summary: string;
  key_changes: string[];
  ats_compatibility: number;
  missing_keywords_added: string[];
};
```

### 5.4 useAgentV2 Hook Types

**File:** `src/hooks/useAgentV2.ts` (lines ~102-112)

```typescript
// AgentV2Result interface:
analysis?: {
  summary: string;
  key_changes: string[];
  ats_compatibility: number;
  missing_keywords_added: string[];
};

// Also has:
gaps?: {
  matchScore: number;
  matchingSkills: Array<{ cvSkill: string; jobSkill: string; score: number }>;
  missingSkills: string[];
  suggestions: string[];
};
```

### 5.5 Agent Result Types

**File:** `src/types/agent.ts` (lines ~99-108)

```typescript
// CVData interface:
analysis?: {
  summary: string;
  key_changes: string[];
  ats_compatibility: number;
  missing_keywords_added: string[];
};
```

---

## 6. System Prompts — Full Extracts

### 6.1 CV Optimizer System Prompt (ATS Compatibility Context)

**File:** `src/lib/agents/unified-writer-agent.ts` — systemBlocks for `generateOptimizedCVData`

The system prompt that frames the ATS compatibility score:

```
You are an expert CV optimization engine for the Karko AI job application platform.
Your job is to FORMAT, ARTICULATE, and OPTIMIZE the content based on the CV and job description.
Output ONLY valid JSON matching the CVData schema.
The frontend will render your JSON directly - if you mess up the structure, the app breaks.
CRITICAL: Always include the "analysis" object with summary, key_changes, 
ats_compatibility, and missing_keywords_added fields.
```

### 6.2 Skill Matching System Prompt (Match Score Context)

```
You are a precise skill matching engine. Return only valid JSON. 
Be fair but honest — count semantic and cross-language matches, but never inflate.
```

### 6.3 Fit Assessment System Prompt

```
You are Karko AI, a senior talent acquisition specialist and career coach.

You evaluate job fit using the industry-standard 5-dimension framework: 
Skills & Competency Match, Experience Relevance, Transferable Value, 
Role Readiness, and Competitive Positioning.

Principles:
1. HONESTY: Never sugarcoat weak fits.
2. CONSTRUCTIVENESS: Always identify genuine strengths.
3. SPECIFICITY: Reference actual skill names and tools.
4. ACTIONABILITY: Give concrete strategy.
5. BREVITY: Under 100 words total.
```

### 6.4 Legacy Prompts (prompts.ts)

**File:** `src/lib/prompts.ts` (lines ~12-15)

```typescript
cvOptimizer: `You are an expert CV writer and career consultant.
Your task is to optimize CVs for specific job applications.
You maintain the candidate's authentic voice while strategically incorporating relevant keywords.
You NEVER fabricate experience or skills - only reorganize and rephrase existing content.`
```

This is the **old system prompt** from the 3-agent architecture. The unified agent in `unified-writer-agent.ts` has its own, more detailed prompts. This legacy prompt is likely dead code but still present.

---

## 7. UI Rendering — Where Scores Are Displayed

### 7.1 ATS Compatibility — CV Panel Changes Tab

**File:** `src/components/CVPanel.tsx` (lines ~699-757)

```tsx
{/* Shown when user clicks "Changes" tab in CV Panel */}
{optimizedCVData?.analysis ? (
  <div className="space-y-6">
    {/* 1. Strategy Summary */}
    <div className="bg-gradient-to-r from-navy-50 to-navy-100 p-4 rounded-lg">
      <h3>Optimization Strategy</h3>
      <p>{optimizedCVData.analysis.summary}</p>
    </div>

    {/* 2. ATS Compatibility Score — THE PROGRESS BAR */}
    <div className="bg-cream-50 p-4 rounded-lg">
      <h3>ATS Compatibility</h3>
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-cream-200 rounded-full h-3">
          <div 
            className="bg-gradient-to-r from-gold-400 to-gold-500 h-3 rounded-full"
            style={{ width: `${optimizedCVData.analysis.ats_compatibility}%` }}
          />
        </div>
        <span className="font-bold text-navy-700 text-lg">
          {optimizedCVData.analysis.ats_compatibility}%
        </span>
      </div>
    </div>

    {/* 3. Key Changes List */}
    <ul>
      {optimizedCVData.analysis.key_changes.map((change, i) => (
        <li key={i}><CheckCircle /> {change}</li>
      ))}
    </ul>

    {/* 4. Keywords Added for ATS — Gold pills */}
    {optimizedCVData.analysis.missing_keywords_added.length > 0 && (
      <div className="flex flex-wrap gap-2">
        {optimizedCVData.analysis.missing_keywords_added.map((keyword, i) => (
          <span className="px-3 py-1.5 bg-gold-50 text-gold-700 rounded-full">
            + {keyword}
          </span>
        ))}
      </div>
    )}
  </div>
)}
```

### 7.2 Match Score — Chat Panel Fit Analysis

**File:** `src/components/ChatPanel.tsx` (lines ~358-376)

Displayed as part of the fit analysis chat message:
```
🟢 **Strong Fit** for **Senior Developer** at **Company** (78% match)

[AI-written assessment paragraph]

**Matching Skills:** React, TypeScript, Node.js
**Missing Skills:** Kubernetes, Terraform
```

### 7.3 Legacy: QualityScoreCard Component

**File:** `src/components/QualityScoreCard.tsx` (182 lines)

This component exists but appears to be **unused in the current UI flow**. It has a more detailed breakdown:

```typescript
interface QualityCriteria {
  keywordCoverage: { score: number; feedback: string };
  characterLimits: { score: number; feedback: string };
  actionVerbs: { score: number; feedback: string };
  quantifiedResults: { score: number; feedback: string };
  atsCompatibility: { score: number; feedback: string };
}
```

It renders:
- Overall score with color coding (green ≥80, amber ≥60, red <60)
- Per-criteria progress bars (Keywords, Length, Action Verbs, Metrics, ATS Ready)
- Optional match score display
- Suggested improvements list

**This component is NOT currently wired into the CV Panel or any other active view.** It may have been from an earlier iteration or planned for future use.

---

## 8. Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHASE 1: ANALYSIS                           │
│                                                                 │
│  extractApplicantProfile() ──→ applicant (skills, experience)   │
│           │                                                     │
│           ▼                                                     │
│  parseJobDescription() ──→ job (requiredSkills, title)          │
│           │                                                     │
│           ▼                                                     │
│  computeSkillMatch(applicant, job) ──→ match.score (0-100)      │
│  [LLM semantic matching]              match.matchingSkills      │
│  [Fallback: string matching]          match.missingSkills       │
│           │                                                     │
│           ▼                                                     │
│  generateFitAssessment(context) ──→ fitAnalysis.fitLevel        │
│  [LLM writes assessment]             fitAnalysis.score          │
│  [Uses 5-dimension framework]        fitAnalysis.assessment     │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────────────────────────────┐                    │
│  │ CHAT PANEL: "🟢 Strong Fit (78% match)" │                    │
│  │ [Apply for This Job] [Start New]         │                    │
│  └─────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
                          │
                    User clicks "Apply"
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PHASE 2: GENERATION                           │
│                                                                 │
│  generateOptimizedCVData(context) ──→ optimizedCVData           │
│  [Single LLM call produces:]                                    │
│    - personal, experience, education, skills, languages, certs  │
│    - analysis.summary                                           │
│    - analysis.key_changes                                       │
│    - analysis.ats_compatibility  ◄── LLM SELF-ASSESSMENT        │
│    - analysis.missing_keywords_added                            │
│           │                                                     │
│           ▼                                                     │
│  ┌──────────────────────────────────────────────┐               │
│  │ CV PANEL → Changes Tab:                       │               │
│  │  "Optimization Strategy: ..."                 │               │
│  │  "ATS Compatibility: ████████░░ 85%"          │               │
│  │  "Key Improvements: [list]"                   │               │
│  │  "Keywords Added: [+React] [+TypeScript]"     │               │
│  └──────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. QualityScoreCard Component (Unused/Legacy)

**File:** `src/components/QualityScoreCard.tsx`

Full interface and rendering logic for a detailed quality breakdown card. Currently **not rendered anywhere** in the active UI. Accepts:

- `overallScore` (number)
- `passed` (boolean)
- `criteria` (5 sub-scores: keywordCoverage, characterLimits, actionVerbs, quantifiedResults, atsCompatibility)
- `improvements` (string array)
- `matchScore` (optional number)

Color thresholds: ≥80 green, ≥60 amber, <60 red.

This could be repurposed for a more detailed ATS breakdown in the future.

---

## 10. ATS Optimization Rules in CV Prompt

The LLM is given these specific ATS rules to follow when generating the CV (which inform its self-assessed ATS compatibility score):

```
=== ATS OPTIMIZATION (2026 STANDARDS) ===

1. SECTION HEADERS: Use ONLY standard ATS-recognized headers
   - "Professional Summary", "Professional Experience", "Education", 
     "Skills", "Certifications", "Languages"
   - NEVER creative headers like "What I Bring", "My Journey"

2. KEYWORD MIRRORING: Use EXACT phrases from JD, not synonyms
   - Include both acronyms AND full forms: "SEO (Search Engine Optimization)"
   - Place JD keywords in Skills section FIRST, then in bullet points

3. BULLET FORMAT (CAR Method):
   - Every bullet starts with strong action verb
   - Every bullet includes metric/number if available
   - No action verb used more than twice across entire CV

4. SKILLS SECTION: JD keywords FIRST, then additional relevant skills
   - Match EXACT terminology from job posting
   - Include tool versions where relevant
```

---

## 11. Key Observations & Risks

### The ATS Compatibility Score Is a Self-Assessment

The most important thing to understand: **the ATS compatibility score is the LLM grading its own homework.** There is no independent validation. The LLM generates the CV and then estimates how ATS-friendly it is, all in the same output.

**Risk:** The LLM will almost always rate itself highly (typically 80-95%). It has no incentive to give itself a low score, and no external checker to verify.

**Possible improvements:**
- Add a separate validation step that programmatically checks: keyword coverage ratio, section header compliance, bullet format compliance
- Use the `QualityScoreCard` component (already built, currently unused) to display a more granular breakdown
- Run a second LLM call specifically to audit the generated CV against the JD

### Match Score Is More Reliable

The match score from `computeSkillMatch()` is more trustworthy because:
1. It's computed *before* generation (no self-assessment bias)
2. It has a fallback algorithm (string matching) if the LLM fails
3. The score is clamped to 0-100 and validated
4. It uses semantic matching rules that are well-defined

### `missing_keywords_added` Has a Tension with Skill Inference Rules

The prompt asks the LLM to report `missing_keywords_added` — keywords from the JD that it added to the CV. But RULE 4 (Skill Inference, added in the recent enhancement) says the LLM may NOT add skills that are "required by the job description but not present in the applicant's background."

This creates a tension: the LLM is asked to report keywords it added, but also told not to add keywords that aren't in the source CVs. In practice, this means `missing_keywords_added` should only contain keywords that were already in the CV but weren't prominently placed — not truly "missing" skills.

### Type Duplication

The `OptimizationAnalysis` interface is defined in 4 places:
1. `src/lib/agents/types.ts` — canonical definition
2. `src/store/useSessionStore.ts` — duplicated inline
3. `src/hooks/useAgentV2.ts` — duplicated inline
4. `src/types/agent.ts` — duplicated inline

This is a maintenance risk. Changes to the schema need to be synchronized across all 4 files.

### QualityScoreCard Is Ready But Unused

The `QualityScoreCard` component at `src/components/QualityScoreCard.tsx` has a complete UI for displaying a 5-criteria quality breakdown. It's not wired into any current view. It could replace or supplement the current simple progress bar in the Changes tab.

---

## File Index

| File | Relevance | Lines |
|------|-----------|-------|
| `src/lib/agents/unified-writer-agent.ts` | Core — all scoring logic, prompts, parsing | ~428-491 (match), ~681-800 (fit), ~820-1240 (CV gen + ATS) |
| `src/lib/agents/types.ts` | Type definitions — OptimizationAnalysis, MasterContext | 88-184 |
| `src/components/CVPanel.tsx` | UI — Changes tab rendering (ATS bar, keywords, changes) | 695-757 |
| `src/components/ChatPanel.tsx` | UI — Fit analysis message with match score | 358-376, 539-552 |
| `src/components/QualityScoreCard.tsx` | UI — Unused detailed quality card | 1-182 |
| `src/hooks/useAgentV2.ts` | Hook — type duplication, data flow | 102-112 |
| `src/store/useSessionStore.ts` | Store — session state with analysis types | 116-125 |
| `src/types/agent.ts` | Types — CVData with analysis | 99-108 |
| `src/lib/prompts.ts` | Legacy — old system prompts (likely dead code) | 12-15 |
