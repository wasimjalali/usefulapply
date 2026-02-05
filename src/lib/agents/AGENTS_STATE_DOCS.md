# AI Agents - Current State Documentation

**Location:** `/src/lib/agents/`  
**Purpose:** Unified AI agent architecture for job application generation  
**Last Updated:** February 5, 2026

---

## Overview

The agents directory contains the **Karko AI Unified Agent** - a single intelligent agent that replaced the previous 3-agent architecture (Orchestrator, Context, Writer). Migration completed February 4, 2026.

---

## File Inventory

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| unified-writer-agent.ts | 1329 | Main Karko AI agent implementation | ✅ Active |
| types.ts | 218 | Type definitions for agent system | ✅ Active |
| index.ts | ~50 | Exports unified agent | ✅ Active |

---

## Architecture Overview

### Karko AI Unified Agent

**Single agent handles entire workflow:**
1. Parse CV and extract applicant profile
2. Analyze job description requirements
3. Detect language (EN/DE)
4. Match skills and identify gaps
5. Optimize CV for the position
6. Compose tailored cover letter
7. Generate application email

**Streamlined Features:**
- No company research needed (relies on job description context)
- AI-native skill matching (no external RAG system)
- Direct structured JSON output (Solution B)

---

## Detailed File Analysis

### 1. unified-writer-agent.ts (1329 lines)

**Purpose:** Complete implementation of Karko AI unified agent

**Current State:**
- ✅ Single agent replaces 3-agent architecture
- ✅ Handles full workflow from CV parsing to email generation
- ✅ Typo correction for common tool/certification names
- ✅ Anti-cliché blacklist for cover letters
- ✅ Token usage tracking
- ✅ Language detection (EN/DE)
- ✅ Structured JSON output (Solution B)

**Key Features:**

**1. Typo Corrections (lines 41-120):**
```typescript
const TYPO_CORRECTIONS: Record<string, string> = {
  'semrash': 'Semrush',
  'hubspot': 'HubSpot',
  'linkedin': 'LinkedIn',
  'javascript': 'JavaScript',
  'nodejs': 'Node.js',
  // ... 60+ common typos
};
```
- Fixes common misspellings in certifications and tools
- Applied during CV parsing and skill extraction
- Ensures consistency across documents

**2. Anti-Cliché Blacklist (lines 127-182):**
```typescript
export const COVER_LETTER_BLACKLIST = {
  openings: ["I am writing to apply", "I am excited to apply", ...],
  selfDescriptions: ["I am a highly motivated", "I am passionate about", ...],
  closings: ["Thank you for considering", "I look forward to hearing", ...],
  fillers: ["In today's fast-paced", "leverage my skills", ...],
  greetings: ["To Whom It May Concern", "Dear Sir or Madam"],
};
```
- Prevents AI-generated clichés in cover letters
- Makes applications sound more human and authentic
- Enforced during cover letter generation

**3. Main Workflow Functions:**

**`runJobCopilot()` - Full Application Generation:**
- Entry point for complete workflow
- Streams progress events to frontend
- Returns optimized CV, cover letter, email
- Tracks token usage across all steps

**`parseApplicantProfile()` - CV Parsing:**
- Extracts name, email, phone, skills, experience
- Applies typo corrections
- Returns structured applicant data

**`analyzeJobRequirements()` - Job Description Analysis:**
- Parses job title, company, required skills
- Identifies responsibilities
- Detects work type and location

**`detectLanguage()` - Language Detection:**
- Analyzes job description for language indicators
- Supports EN and DE
- Returns detected language with confidence

**`matchSkillsAndGaps()` - Skill Matching:**
- Compares applicant skills vs job requirements
- Calculates match score (0-100)
- Identifies matching and missing skills

**`generateOptimizedCV()` - CV Optimization:**
- **Solution B:** Returns structured JSON (optimizedCVData)
- Includes personal info, experience, education, skills, languages
- Provides optimization analysis for "Changes" tab
- No text parsing needed - template renders directly

**`generateCoverLetter()` - Cover Letter Generation:**
- Personalized to job and company
- Avoids blacklisted clichés
- Supports EN/DE languages
- Returns structured format (salutation, body, closing)

**`generateApplicationEmail()` - Email Generation:**
- Professional subject line
- Concise body (3-4 paragraphs)
- Call to action
- Returns { subject, body }

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-architected unified agent
- ⚠️ Lines 200-400: Could extract helper functions to separate utilities
- ⚠️ Typo corrections list could be moved to separate config file

**Recommendations:**
- Extract typo corrections to `/src/lib/config/typo-corrections.ts`
- Extract blacklist to `/src/lib/config/cover-letter-blacklist.ts`
- Add more language support (FR, ES, IT)
- Add quality scoring for generated content

---

### 2. types.ts (218 lines)

**Purpose:** Type definitions for agent system and data structures

**Current State:**
- ✅ Comprehensive type definitions
- ✅ MasterContext - single source of truth
- ✅ Solution B types (optimizedCVData)
- ✅ Token usage tracking
- ✅ Event streaming types

**Key Types:**

**MasterContext (lines 31-164):**
```typescript
interface MasterContext {
  sessionId: string;
  jobDescription: string;
  rawCV: string;
  detectedLanguage?: 'en' | 'de';
  
  applicant?: { name, email, skills, experiences, ... };
  job?: { title, companyName, requiredSkills, ... };
  companyResearch?: { name, description, culture, ... };
  match?: { score, matchingSkills, missingSkills };
  
  // Solution B: Structured JSON output
  optimizedCVData?: { personal, experience, education, skills, ... };
  coverLetter?: string;
  applicationEmail?: { subject, body };
}
```

**OptimizationAnalysis (lines 170-175):**
```typescript
interface OptimizationAnalysis {
  summary: string;                   // 2-sentence strategy
  key_changes: string[];             // Specific changes made
  ats_compatibility: number;         // ATS score 0-100
  missing_keywords_added: string[];  // Keywords for ATS
}
```

**AgentEvent (lines 178-184):**
- step_started, step_completed, step_error
- message, progress, tool_usage
- Used for streaming progress to frontend

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Clean type definitions
- ⚠️ Lines 200-218: Legacy types kept for backward compatibility - can be removed after full migration

**Recommendations:**
- Remove legacy types after confirming no usage
- Add JSDoc comments for complex types
- Add validation schemas (Zod) for runtime type checking

---

### 3. index.ts (~50 lines)

**Purpose:** Export unified agent and utilities

**Current State:**
- ✅ Exports `runJobCopilot` as main entry point
- ✅ Exports types
- ✅ Clean barrel export

**Leftover Code Issues:**
- ✅ No leftover code

---

## Migration Notes

### From 3-Agent to Unified Agent

**Deleted Files (Feb 4, 2026):**
- `orchestrator-agent.ts` - Workflow coordination
- `context-agent.ts` - CV/JD parsing, skill matching
- `writer-agent.ts` - Document generation

**Benefits of Unified Agent:**
- **Reduced complexity:** 1 agent instead of 3
- **Faster execution:** No inter-agent communication overhead
- **Lower token usage:** Single context, no redundant parsing
- **Easier maintenance:** One codebase to update
- **Better coherence:** Single AI maintains context across all documents

**Code Reduction:**
- Before: ~2500 lines across 3 agents
- After: ~1400 lines in unified agent
- **Reduction: 44% less code**

---

## Solution B Architecture

### Structured JSON Output (No Text Parsing)

**Problem with Solution A (Legacy):**
- AI generates CV as plain text
- Frontend parses text to extract sections
- Prone to parsing errors (duplicate skills, malformed bullets)

**Solution B (Current):**
- AI outputs structured JSON directly (`optimizedCVData`)
- Template renders JSON without parsing
- No duplication, no parsing errors
- Clean separation: AI writes data, template renders UI

**Implementation:**
```typescript
// AI returns this structure directly
optimizedCVData: {
  personal: { fullName, email, phone, currentTitle, ... },
  summary: "Professional summary text",
  experience: [{ id, company, position, bullets, ... }],
  education: [{ id, institution, degree, ... }],
  skills: [{ category, items }],
  languages: [{ language, proficiency }],
  certifications: [{ id, name, issuer, date }],
  analysis: { summary, key_changes, ats_compatibility, ... }
}
```

**Benefits:**
- ✅ No text parsing needed
- ✅ No duplicate skills/languages
- ✅ Proper data structure for templates
- ✅ Easier to edit and manipulate
- ✅ Better for database storage

---

## Workflow Diagram

```
User Input (Job Description + CV)
         ↓
    Karko AI Agent
         ↓
┌────────────────────────┐
│ 1. Parse CV            │ → applicant profile
│ 2. Analyze Job         │ → job requirements
│ 3. Detect Language     │ → EN or DE
│ 4. Match Skills        │ → match score, gaps
│ 5. Optimize CV         │ → optimizedCVData (Solution B)
│ 6. Write Cover Letter  │ → coverLetter
│ 7. Generate Email      │ → applicationEmail
└────────────────────────┘
         ↓
    MasterContext
         ↓
  Frontend Display
```

---

## Token Usage Tracking

All agent functions return token usage:
```typescript
interface WithTokens<T> {
  result: T;
  tokens: { input: number; output: number };
}
```

**Tracked Operations:**
- CV parsing
- Job analysis
- Skill matching
- CV optimization
- Cover letter generation
- Email generation

**Total Usage Logged:**
- Per-step token counts
- Total workflow tokens
- Cost estimation

---

## Language Support

**Current Languages:**
- English (EN)
- German (DE)

**Detection Logic:**
- Scans job description for language indicators
- German indicators: "und", "oder", "für", "mit", "bei", "GmbH", "AG"
- Threshold: 5+ indicators = German
- Default: English

**Language-Specific Features:**
- Cover letter tone and structure
- Email formality level
- Date formatting
- Address formatting

---

## Cleanup Tasks

### High Priority
- None - unified agent is clean and well-architected

### Medium Priority
1. **Extract typo corrections** to config file
2. **Extract blacklist** to config file
3. **Remove legacy types** from types.ts (lines 200-218)

### Low Priority
4. Add more language support (FR, ES, IT)
5. Add quality scoring for generated content
6. Add Zod schemas for runtime validation
7. Add JSDoc comments for complex functions

---

## Testing Checklist

- [ ] Full workflow generates all documents
- [ ] Typo correction works for common tools
- [ ] Blacklist prevents clichés in cover letters
- [ ] Language detection works for EN/DE
- [ ] Skill matching calculates correct score
- [ ] Solution B outputs valid structured JSON
- [ ] Token usage tracking works
- [ ] Progress events stream to frontend
- [ ] Error handling works for API failures
- [ ] Fallback to DeepSeek on rate limits

---

## Performance Metrics

**Average Workflow Time:**
- CV parsing: ~2-3 seconds
- Job analysis: ~2-3 seconds
- Skill matching: ~1-2 seconds
- CV optimization: ~5-8 seconds
- Cover letter: ~4-6 seconds
- Email: ~2-3 seconds
- **Total: ~16-25 seconds**

**Token Usage (Typical):**
- Input: ~8,000-12,000 tokens
- Output: ~3,000-5,000 tokens
- **Total: ~11,000-17,000 tokens**

**Cost (Claude Haiku 4.5):**
- Input: $1/M tokens
- Output: $5/M tokens
- **Average cost per application: $0.02-$0.03**

---

## Notes for AI Agents

When working with agents:
1. **Use unified agent** - don't create new agents
2. **Solution B is preferred** - output structured JSON, not text
3. **Track token usage** - all functions return tokens
4. **Apply typo corrections** - use fixTypos() helper
5. **Enforce blacklist** - check cover letters against clichés
6. **Stream progress** - emit events for frontend updates
7. **Handle errors gracefully** - fallback to DeepSeek on rate limits
8. **Maintain MasterContext** - single source of truth for workflow
