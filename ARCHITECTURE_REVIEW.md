# KarKo AI Architecture Review

**Document prepared for expert review**  
**Date:** February 2026

---

## Table of Contents

1. [System Prompts](#1-system-prompts)
2. [Agent Architecture](#2-agent-architecture)
3. [Input Context](#3-input-context)
4. [Web Search Integration](#4-web-search-integration)
5. [Prompting Strategy](#5-prompting-strategy)
6. [Refinement/Iteration](#6-refinementiteration)
7. [Output Format](#7-output-format)
8. [Model Configuration](#8-model-configuration)
9. [Known Issues](#9-known-issues)
10. [Code Snippets](#10-code-snippets)

---

## 1. System Prompts

### Are there separate system prompts for different tasks?

**Yes.** Each task has its own system prompt. Here are all of them:

### 1.1 CV Parsing (Context Agent)

**File:** `src/lib/agents/context-agent.ts` (lines 155-156)

```
System Prompt: "You are a precise CV parser. Extract only factual information present in the document. Return valid JSON only."
```

### 1.2 Job Description Parsing (Context Agent)

**File:** `src/lib/agents/context-agent.ts` (lines 215-216)

```
System Prompt: "You are a job description parser. Extract comprehensive requirements. Return valid JSON only."
```

### 1.3 CV Optimization (Writer Agent)

**File:** `src/lib/agents/writer-agent.ts` (lines 201-202)

```
System Prompt: "You are an expert ATS-optimized CV writer. Return ONLY valid JSON. CRITICAL: Only use information from the provided CV and Master CV. Never invent anything. No markdown formatting."
```

### 1.4 Cover Letter Generation (Writer Agent)

**File:** `src/lib/agents/writer-agent.ts` (lines 281)

```
System Prompt: "You are an expert cover letter writer. Create personalized, compelling cover letters. Only reference achievements that exist in the provided CV. NEVER use markdown formatting like ** or * - use plain text only."
```

### 1.5 Email Generation (Writer Agent)

**File:** `src/lib/agents/writer-agent.ts` (lines 316-317)

```
System Prompt: "You are an expert at professional email communication. Return ONLY valid JSON with subject and body fields. No markdown, no extra text."
```

### 1.6 Company Research (GPT-4o Web Search)

**File:** `src/lib/tools/gpt-web-search.ts` (lines 37-39)

```
System Prompt: "You are a company research assistant. Search the web and provide accurate, up-to-date information about companies. Return only valid JSON."
```

---

## 2. Agent Architecture

### How many agents are involved?

**3 Agents** in a linear flow:

1. **Orchestrator Agent** - Coordinates the workflow
2. **Context Agent** - Gathers all information (CV parsing, JD parsing, company research)
3. **Writer Agent** - Generates all documents (CV, cover letter, email)

### Is it a single LLM call or a chain?

**Chain of 5-6 LLM calls** (depending on whether company research is triggered):

### Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATOR AGENT                                 │
│                    (src/lib/agents/orchestrator-agent.ts)                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONTEXT AGENT                                     │
│                     (src/lib/agents/context-agent.ts)                       │
│                                                                              │
│  Step 1: extractApplicantProfile() ──────────────► LLM Call #1              │
│          Parse CV → Extract structured applicant data                        │
│                                                                              │
│  Step 2: parseJobDescription() ──────────────────► LLM Call #2              │
│          Parse JD → Extract job requirements                                 │
│                                                                              │
│  Step 3: doCompanyResearch() ────────────────────► LLM Call #3 (optional)   │
│          GPT-4o web search OR Tavily API                                     │
│                                                                              │
│  Step 4: computeMatch() ─────────────────────────► No LLM (local logic)     │
│          Compare skills → Calculate match score                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                             WRITER AGENT                                     │
│                      (src/lib/agents/writer-agent.ts)                       │
│                                                                              │
│  Step 5: generateOptimizedCV() ──────────────────► LLM Call #4              │
│          Generate ATS-optimized CV                                           │
│                                                                              │
│  Step 6: generateCoverLetter() ──────────────────► LLM Call #5              │
│          Generate personalized cover letter                                  │
│                                                                              │
│  Step 7: generateApplicationEmail() ─────────────► LLM Call #6              │
│          Generate application email                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Are there verification/review steps?

**Minimal verification:**

- **Context validation** in `writerAgent.validateContext()` (lines 24-57 of writer-agent.ts)
  - Checks if applicant name exists
  - Checks if applicant email exists
  - Checks if job title/company exists
  - Logs warnings but **does not block** generation

**No second-pass review or refinement step exists currently.**

---

## 3. Input Context

### 3.1 For CV Optimization

**Inputs passed to the model:**

| Input | Source | Format |
|-------|--------|--------|
| `rawCV` | User upload (parsed PDF/DOCX) | Plain text |
| `masterCV` | Optional user upload | Plain text |
| `job.title` | Extracted from JD | String |
| `job.companyName` | Extracted from JD | String |
| `job.requiredSkills` | Extracted from JD | Array of strings |
| `job.niceToHaveSkills` | Extracted from JD | Array of strings |
| `companyResearch` | Web search results | Structured object |
| `match.matchingSkills` | Computed locally | Array of strings |
| `match.missingSkills` | Computed locally | Array of strings |

**File:** `src/lib/agents/writer-agent.ts` (lines 99-217)

### 3.2 For Cover Letter

**Inputs passed to the model:**

| Input | Source | Format |
|-------|--------|--------|
| `applicant.name` | Extracted from CV | String |
| `applicant.email` | Extracted from CV | String |
| `applicant.phone` | Extracted from CV | String |
| `applicant.address` | Extracted from CV | String |
| `job.title` | Extracted from JD | String |
| `job.companyName` | Extracted from JD | String |
| `job.location` | Extracted from JD | String |
| `job.startDate` | Extracted from JD | String |
| `job.expectedSalary` | Extracted from JD | String |
| `job.requiredSkills` | Extracted from JD (first 5) | Array of strings |
| `companyResearch` | Web search results | Full object |
| `rawCV` | Original CV text | Plain text (full) |

**File:** `src/lib/agents/writer-agent.ts` (lines 223-284)

### 3.3 For Email

**Inputs passed to the model:**

| Input | Source | Format |
|-------|--------|--------|
| `applicant.name` | Extracted from CV | String |
| `applicant.email` | Extracted from CV | String |
| `job.title` | Extracted from JD | String |
| `job.companyName` | Extracted from JD | String |
| `companyResearch.description` | Web search | String |

**File:** `src/lib/agents/writer-agent.ts` (lines 291-339)

### 3.4 How is Master CV structured?

**Plain text.** The Master CV is concatenated with the primary CV:

```typescript
// File: src/lib/agents/context-agent.ts (lines 121-123)
const combinedCV = masterCV 
  ? `PRIMARY CV:\n${primaryCV}\n\nMASTER CV (additional experience):\n${masterCV}`
  : primaryCV;
```

Certifications are also appended:

```typescript
// File: src/lib/agents/context-agent.ts (lines 46-49)
if (docs.certifications && docs.certifications.length > 0) {
  const certText = '\n\nCERTIFICATIONS:\n' + docs.certifications.join('\n');
  context.masterCV = (context.masterCV || '') + certText;
}
```

### 3.5 How is Job Description processed?

The JD is parsed into a structured JSON object:

**File:** `src/lib/agents/context-agent.ts` (lines 193-231)

```typescript
// Output structure:
{
  "title": "Job title",
  "companyName": "Company name",
  "location": "Location or null",
  "workType": "Remote/Hybrid/On-site or null",
  "requiredSkills": ["must-have", "skills"],
  "niceToHaveSkills": ["preferred", "skills"],
  "responsibilities": ["key", "responsibilities"],
  "startDate": "Required start date if mentioned, or null",
  "expectedSalary": "Salary range if mentioned, or null"
}
```

---

## 4. Web Search Integration

### What triggers a web search?

**Automatic** - triggered when a company name is extracted from the job description.

**File:** `src/lib/agents/context-agent.ts` (lines 81-95)

```typescript
if (job?.companyName) {
  emit({ type: 'progress', percent: 50, message: `Researching ${job.companyName}...` });
  const companyResearch = await this.doCompanyResearch(job.companyName);
  context.companyResearch = companyResearch;
}
```

### What search queries are generated?

**Two options depending on configuration:**

#### Option 1: GPT-4o Web Search (Primary)

**File:** `src/lib/tools/gpt-web-search.ts` (lines 42-58)

Single query:
```
Research ${companyName} and provide the following information in JSON format:
{
  "name": "Company official name",
  "description": "Brief 1-2 sentence description of what the company does",
  "address": "Full headquarters address (street, city, state, zip)",
  "industry": "Primary industry/sector",
  "culture": ["3-5 key cultural aspects or values"],
  "techStack": ["5-8 main technologies they use"],
  "recentNews": ["3 recent news headlines from 2025-2026"],
  "values": ["3-5 company values or mission statements"],
  "size": "Number of employees",
  "founded": "Year founded",
  "website": "Official website URL"
}
```

#### Option 2: Tavily (Fallback)

**File:** `src/lib/tools/tavily.ts` (lines 101-122)

**4 parallel searches:**

1. `${companyName} company overview headquarters address industry size founded`
2. `${companyName} company culture values mission employee reviews glassdoor`
3. `${companyName} tech stack technology engineering blog developers`
4. `${companyName} recent news announcements 2025 2026`

### How are search results formatted?

Results are structured into a `CompanyResearch` object:

```typescript
// File: src/lib/agents/types.ts (lines 66-75)
companyResearch?: {
  name: string;
  address?: string;
  website?: string;
  description?: string;
  values?: string[];
  culture?: string[];
  techStack?: string[];
  recentNews?: string[];
};
```

### Is there filtering/validation of search results?

**Minimal:**

- GPT-4o: Uses `response_format: { type: 'json_object' }` to ensure valid JSON
- Tavily: Basic keyword matching to extract relevant snippets
- **No fact-checking or source validation**

---

## 5. Prompting Strategy

### Are you using few-shot examples?

**No.** There are no example CVs, cover letters, or emails in the prompts.

### Are there explicit "do not" rules?

**Yes, but limited:**

**For CV Optimization:**
```
- Do NOT use markdown formatting (no **, *, ---, etc.)
- NEVER invent skills, experiences, or achievements
- Keep CV under 2 pages worth of content
```

**For Cover Letter:**
```
- Do NOT use markdown formatting (no ** or * for bold/italic)
- Only reference achievements that exist in the provided CV
```

**Missing "do not" rules:**
- No prohibition on clichés like "I am excited to apply"
- No prohibition on generic phrases
- No prohibition on overly formal language

### Is there a tone/style directive?

**Minimal:**

- Cover letter: "Professional business letter"
- Email: "Professional job application email"
- **No specific style guidance** (e.g., German business style, conversational, etc.)

### Is there a word count constraint?

**Yes:**

| Document | Constraint |
|----------|------------|
| CV | "Keep CV under 2 pages worth of content" |
| Cover Letter | "250-350 words" |
| Email | "100-150 words" |

---

## 6. Refinement/Iteration

### What does "twice the refinement" mean?

**There is currently NO refinement step.** Each document is generated in a single LLM call.

The workflow is:
1. Generate CV → Done
2. Generate Cover Letter → Done
3. Generate Email → Done

### Is there a second LLM call that reviews/improves output?

**No.** There is no review or improvement pass.

### Recommendation

A refinement step could be added where a second LLM call:
1. Reviews the generated content
2. Checks for clichés, generic phrases, and formatting issues
3. Improves the output

---

## 7. Output Format

### How are outputs structured?

| Document | Format | Template? |
|----------|--------|-----------|
| Optimized CV | JSON with `optimizedCV` (plain text) and `changes` array | No template - free generation with section guidelines |
| Cover Letter | Plain text | No template - free generation with structure guidance |
| Email | JSON with `subject` and `body` fields | No template - free generation |

### CV Output Structure

**File:** `src/lib/agents/writer-agent.ts` (lines 173-192)

```json
{
  "optimizedCV": "The complete optimized CV as plain text...",
  "changes": [
    {
      "section": "Headline",
      "before": "Original headline text",
      "after": "New optimized headline",
      "reason": "Aligned with job title requirements"
    }
  ]
}
```

### Cover Letter Output

Plain text with structure:
1. Header with applicant contact info
2. Date
3. Company address
4. Opening hook
5. 2-3 achievement paragraphs
6. Company knowledge paragraph
7. Call to action
8. Sign-off

### Email Output

```json
{
  "subject": "Application for [Job Title] at [Company]",
  "body": "Dear Hiring Team,\n\n[email body]\n\nBest regards,\n[Name]"
}
```

---

## 8. Model Configuration

### What model is used?

**GPT-4o mini** for all tasks.

**File:** `src/lib/models/openai.ts` (line 14)

```typescript
const MODEL = 'gpt-4o-mini';
```

### Temperature Settings

**File:** `src/lib/models/types.ts` (lines 60-173)

| Task | Temperature | Max Tokens |
|------|-------------|------------|
| `extract_applicant` (CV parsing) | 0.3 | 4096 |
| `parse_job` (JD parsing) | 0.3 | 4096 |
| `optimize_cv` | 0.6 | 8192 |
| `write_cover_letter` | 0.7 | 2048 |
| `write_email` | 0.7 | 1024 |

### Response Format Constraints

**JSON mode is used for:**
- CV parsing (`jsonMode: true`)
- JD parsing (`jsonMode: true`)
- CV optimization (`jsonMode: true`)
- Email generation (`jsonMode: true`)

**Plain text for:**
- Cover letter generation

### Fallback Configuration

**File:** `src/lib/models/index.ts` (lines 62-81)

If OpenAI rate limits, falls back to **DeepSeek V3.2**.

---

## 9. Known Issues

### Issues Identified in Code

1. **No refinement step** - Single-pass generation may produce suboptimal content

2. **Generic system prompts** - Prompts lack specific style guidance

3. **No cliché prevention** - No explicit rules against phrases like:
   - "I am excited to apply"
   - "I believe I would be a great fit"
   - "Thank you for considering my application"

4. **No few-shot examples** - Model has no reference for ideal output

5. **Minimal validation** - Only checks for missing fields, not content quality

6. **No language/locale awareness** - No handling for German vs English business styles

7. **Cover letter may be too generic** - Only uses first 5 required skills

8. **Company research may fail silently** - Returns empty object on error

### Potential Failure Modes

1. **Hallucination** - Model may invent achievements not in CV (mitigated by explicit rules but not verified)

2. **Markdown leakage** - Despite rules, model may still output `**bold**` text

3. **Missing contact info** - If CV parsing fails, cover letter header is incomplete

4. **Generic content** - Without few-shot examples, output tends toward generic phrasing

---

## 10. Code Snippets

### 10.1 Main Orchestration Logic

**File:** `src/lib/agents/orchestrator-agent.ts`

```typescript
export async function runJobCopilot(
  input: OrchestratorInput,
  emit: AgentEventHandler
): Promise<AgentResult<OrchestrationResult>> {
  const startTime = Date.now();

  // Initialize MasterContext
  let context: MasterContext = {
    sessionId: input.sessionId,
    jobDescription: input.jobDescription,
    rawCV: input.primaryCV,
    masterCV: input.masterCV,
  };

  try {
    // STEP 1: Context Building (Context Agent)
    emit({ type: 'step_started', step: { id: 'context', description: 'Gathering all information' } });
    context = await contextAgent.buildContext(context, emit);
    emit({ type: 'step_completed', step: { id: 'context', description: 'Context ready' } });

    // STEP 2: Writing All Documents (Writer Agent)
    emit({ type: 'step_started', step: { id: 'writing', description: 'Generating CV, cover letter, and email' } });
    context = await writerAgent.generateAll(context, emit);
    emit({ type: 'step_completed', step: { id: 'writing', description: 'All documents generated' } });

    // DONE
    emit({ type: 'progress', percent: 100, message: 'Complete!' });

    return {
      success: true,
      data: { context, totalLatencyMs: Date.now() - startTime },
      latencyMs: Date.now() - startTime,
    };
  } catch (error) {
    // Error handling...
  }
}
```

### 10.2 CV Optimization Prompt

**File:** `src/lib/agents/writer-agent.ts` (lines 117-203)

```typescript
const response = await callModel({
  task: 'optimize_cv',
  prompt: `Optimize this CV for the target job. Return JSON with the optimized CV and changes made.

TARGET JOB:
Title: ${job?.title || 'Unknown'}
Company: ${job?.companyName || 'Unknown'}
Required Skills: ${job?.requiredSkills?.join(', ') || 'N/A'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'N/A'}
${companyContext}
${matchContext}

CURRENT CV:
${rawCV}

${masterCV ? `MASTER CV (additional relevant experience/skills to draw from):
${masterCV}` : ''}

=== CV OPTIMIZATION RULES ===

SECTIONS TO KEEP EXACTLY AS-IS (DO NOT MODIFY):
• Personal Info: Name, email, phone, address - copy exactly
• Education: Keep exactly as in original CV
• Languages: Keep exactly as in original CV

SECTIONS TO OPTIMIZE (for ATS keywords and relevance):

1. HEADLINE (under name):
   - Optimize to match the job title while staying truthful
   - Max 3-4 keywords separated by " | "

2. PROFESSIONAL SUMMARY:
   - 3-4 sentences maximum
   - Include key achievements with metrics from CV
   - Incorporate relevant keywords from job description

3. CORE COMPETENCIES / SKILLS:
   - Maximum 8-10 skills total
   - Prioritize skills that match job requirements

4. PROFESSIONAL EXPERIENCE:
   - Keep job titles, companies, and dates exactly as-is
   - Optimize bullet points (3-4 bullets per role maximum)
   - Use action verbs and include metrics

5. CERTIFICATIONS:
   - Maximum 4-5 most relevant certifications

CRITICAL RULES:
- Do NOT use markdown formatting
- NEVER invent skills, experiences, or achievements
- Keep CV under 2 pages worth of content`,
  systemPrompt: 'You are an expert ATS-optimized CV writer...',
  jsonMode: true,
});
```

### 10.3 Cover Letter Prompt

**File:** `src/lib/agents/writer-agent.ts` (lines 233-282)

```typescript
const response = await callModel({
  task: 'write_cover_letter',
  prompt: `Write a professional cover letter.

TODAY'S DATE: ${today}

APPLICANT:
Name: ${applicant?.name || 'Applicant'}
Email: ${applicant?.email || ''}
Phone: ${applicant?.phone || ''}
Address: ${applicant?.address || ''}

TARGET JOB:
Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
${job?.location ? `Location: ${job.location}` : ''}
Key Requirements: ${job?.requiredSkills?.slice(0, 5).join(', ') || 'N/A'}

${companyResearch ? `COMPANY RESEARCH:
Company: ${companyResearch.name}
Address: ${companyResearch.address || 'N/A'}
Description: ${companyResearch.description || 'N/A'}
Values: ${companyResearch.values?.join(', ') || 'N/A'}
Culture: ${companyResearch.culture?.join(', ') || 'N/A'}
Recent News: ${companyResearch.recentNews?.[0] || 'N/A'}` : ''}

CANDIDATE BACKGROUND (from CV):
${rawCV}

Write a cover letter that:
1. Has proper header with applicant contact info
2. Includes the date
3. Addresses the company
4. Opens with a compelling hook about the specific role
5. Highlights 2-3 achievements with metrics FROM THE CV
6. Shows knowledge of the company
7. Ends with a clear call to action
8. Signs off with the applicant's name

Format: Professional business letter, 250-350 words.`,
  systemPrompt: 'You are an expert cover letter writer...',
});
```

### 10.4 Web Search Integration

**File:** `src/lib/tools/gpt-web-search.ts` (lines 29-91)

```typescript
export async function researchCompanyWithGPT(companyName: string): Promise<CompanyResearch> {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a company research assistant. Search the web and provide accurate, up-to-date information about companies. Return only valid JSON.',
        },
        {
          role: 'user',
          content: `Research ${companyName} and provide the following information in JSON format:
{
  "name": "Company official name",
  "description": "Brief 1-2 sentence description",
  "address": "Full headquarters address",
  "industry": "Primary industry/sector",
  "culture": ["3-5 key cultural aspects"],
  "techStack": ["5-8 main technologies"],
  "recentNews": ["3 recent news headlines"],
  "values": ["3-5 company values"],
  "size": "Number of employees",
  "founded": "Year founded",
  "website": "Official website URL"
}

Search the web for current, accurate information.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    return JSON.parse(response.choices[0]?.message?.content);
  } catch (error) {
    // Return empty object on error
    return { name: companyName, /* ... empty fields */ };
  }
}
```

---

## Summary for Expert Review

### Current State

| Aspect | Status |
|--------|--------|
| Agent Architecture | 3-agent linear flow (good) |
| LLM Calls per Application | 5-6 calls |
| Model | GPT-4o mini for all tasks |
| Temperature | 0.3-0.7 depending on task |
| Few-shot Examples | None |
| Refinement Pass | None |
| Cliché Prevention | None |
| Style Guidance | Minimal |
| Validation | Basic field checking only |

### Key Areas for Improvement

1. **Add few-shot examples** for cover letters and emails
2. **Add explicit cliché blacklist** in prompts
3. **Add refinement/review step** for quality improvement
4. **Add style directives** (professional German, conversational, etc.)
5. **Consider Claude Haiku** for writing tasks (better prose quality)
6. **Add content validation** to check for generic phrases

---

*Document generated from codebase analysis on February 2026*
