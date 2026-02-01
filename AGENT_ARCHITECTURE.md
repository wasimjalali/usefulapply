# Job Copilot - 3-Agent AI Architecture

## Overview

Job Copilot uses a **simplified 3-Agent Architecture**:
1. **Orchestrator** - Coordinates the workflow
2. **Context Agent** - Gathers all information (CV parsing, JD parsing, company research)
3. **Writer Agent** - Generates all documents (CV, cover letter, email)

This design follows the [Orchestrator Pattern](https://hopx.ai/blog/ai-agents/orchestrator-pattern-ai-agents/) and keeps the Writer isolated from tools to prevent hallucination.

---

## The 3-Agent Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      ORCHESTRATOR                                │
│                   (Coordinates workflow)                         │
└───────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CONTEXT AGENT                                 │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  CV Parsing     │  │  JD Parsing     │  │ Company Research│  │
│  │  (RAG-style)    │  │  (Requirements) │  │ (GPT/Tavily)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │            │
│           └────────────────────┼────────────────────┘            │
│                                ▼                                 │
│                    ┌───────────────────┐                         │
│                    │   MasterContext   │                         │
│                    │   (All data here) │                         │
│                    └─────────┬─────────┘                         │
└──────────────────────────────┼───────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WRITER AGENT                                │
│                    (No tools, no research)                       │
│                                                                  │
│  Receives MasterContext and generates:                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Optimized   │  │   Cover     │  │ Application │              │
│  │    CV       │  │   Letter    │  │    Email    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Agent Details

### 1. Orchestrator (`src/lib/agents/orchestrator-agent.ts`)

**Role**: Coordinates the Context → Writer flow

**Responsibilities**:
- Initializes `MasterContext` with raw inputs (JD, CV)
- Calls Context Agent to gather all information
- Calls Writer Agent to generate all documents
- Emits progress events for frontend visibility

### 2. Context Agent (`src/lib/agents/context-agent.ts`)

**Role**: Gathers and structures all information needed for writing

**Responsibilities**:
1. **Extract Applicant Profile** (RAG-style from CV)
   - Name, email, phone, address
   - Skills, tools, languages
   - Work experiences with bullets
   - Certifications

2. **Parse Job Description**
   - Job title, company name
   - Location, work type (remote/hybrid/onsite)
   - Required skills, nice-to-have skills
   - Start date, expected salary (if mentioned)

3. **Company Research** (GPT-4o or Tavily)
   - Company address, website
   - Description, values, culture
   - Tech stack, recent news

4. **Compute Match Analysis**
   - Match score (% of required skills present)
   - Matching skills, missing skills

### 3. Writer Agent (`src/lib/agents/writer-agent.ts`)

**Role**: Generates all documents from MasterContext

**Key Design**: The Writer is "dumb" - it only writes based on what it's given. It does NOT research or think. This prevents hallucination.

**Generates**:
1. **Optimized CV** - Tailored to job requirements
2. **Cover Letter** - With company address and research
3. **Application Email** - Professional and concise

---

## MasterContext Type

```typescript
interface MasterContext {
  sessionId: string;
  jobDescription: string;
  rawCV: string;
  masterCV?: string;

  applicant?: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    skills: string[];
    tools: string[];
    experiences: Array<{...}>;
    certifications: string[];
  };

  job?: {
    title: string;
    companyName: string;
    requiredSkills: string[];
    niceToHaveSkills: string[];
    startDate?: string;
    expectedSalary?: string;
  };

  companyResearch?: {
    name: string;
    address?: string;
    description?: string;
    culture?: string[];
    techStack?: string[];
    recentNews?: string[];
  };

  match?: {
    score: number;
    matchingSkills: string[];
    missingSkills: string[];
  };

  // Generated outputs
  optimizedCV?: string;
  coverLetter?: string;
  applicationEmail?: string;
}
```

---

## Storage Abstraction

The `src/lib/storage/applicantStore.ts` provides an abstraction layer for document storage:

```typescript
// Currently uses localStorage/IndexedDB
// Can be swapped to Supabase later without changing agent code
export async function loadApplicantDocuments(sessionId: string): Promise<ApplicantDocuments>
```

---

## API Route

Single endpoint: `POST /api/agent-v2`

```typescript
// Request
{
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
  action: 'full_optimization';
}

// Response (streamed)
{ type: 'step_started', step: { id: 'context', description: '...' } }
{ type: 'progress', percent: 50, message: '...' }
{ type: 'tool_usage', tool: 'company_research', output: {...} }
{ type: 'workflow_complete', results: { context: MasterContext } }
```

---

## Key Benefits of 3-Agent Architecture

1. **Simplicity** - Only 3 agents instead of 4-5
2. **No Data Loss** - All data flows through single MasterContext
3. **No Hallucination** - Writer only uses provided context
4. **Visible Research** - Company research emitted to frontend
5. **Easy Migration** - Storage abstraction allows Supabase swap
6. **Fast** - No evaluator loop, linear flow
