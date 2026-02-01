# V2 API Migration Guide

This guide explains how to migrate from the legacy OpenAI-based APIs to the new V2 APIs powered by **Gemini 3 Flash** (analysis) and **Claude Sonnet 4.5** (writing).

## Overview

| Legacy API | V2 API | Models Used |
|------------|--------|-------------|
| `/api/agent` | `/api/agent-v2` | Gemini 3 Flash + Claude Sonnet 4.5 |
| `/api/analyze` | `/api/analyze-v2` | Gemini 3 Flash + RAG |
| `/api/optimize-cv` | `/api/optimize-cv-v2` | Claude Sonnet 4.5 + Evaluator |

## Key Improvements in V2

1. **Multi-Model Architecture**: Analysis uses fast Gemini 3 Flash, writing uses premium Claude Sonnet 4.5
2. **RAG-Based Skill Matching**: Semantic skill matching with synonyms and related skills
3. **Evaluator-Optimizer Loop**: Content is evaluated and refined automatically
4. **Company Research**: Tavily web search for company insights
5. **Streaming Progress**: Real-time progress updates with agent events

---

## API Changes

### `/api/agent-v2`

**Request Body:**
```typescript
interface AgentRequest {
  jobDescription: string;      // Required
  currentCV: string;           // Required
  masterCV?: string;           // Optional
  certifications?: string;     // Optional
  action: 'full_optimization' | 'analyze_only' | 'generate_cv' | 'generate_cover_letter' | 'generate_email';
  emailType?: 'application' | 'followup' | 'thankyou';  // For generate_email action
  enableWebSearch?: boolean;   // Default: true - enables Tavily company research
  enableReflection?: boolean;  // Default: true - enables quality refinement loop
}
```

**New Event Types:**
```typescript
// Progress events
{ type: 'progress', percent: number, message: string }

// Reflection loop events
{ type: 'reflection', iteration: number, status: 'started' | 'completed', improved?: boolean }

// Model info in workflow_start
{ type: 'workflow_start', steps: [...], models: { analysis: 'gemini-3-flash-preview', writing: 'claude-sonnet-4-20250514' } }
```

**Response includes:**
- `evaluation`: Quality score and improvement suggestions
- `companyResearch`: Company info from Tavily (if enabled)
- `iterations`: Number of refinement iterations

---

### `/api/analyze-v2`

**Request Body:** (unchanged)
```typescript
interface AnalyzeRequest {
  jobDescription: string;
  currentCV: string;
  masterCV?: string;
}
```

**Response Changes:**
```typescript
interface AnalyzeResponse {
  success: boolean;
  requirements: JobRequirements;
  gaps: {
    matchScore: number;
    matchingSkills: Array<{
      cvSkill: string;
      jobSkill: string;
      score: number;        // 0-1 similarity score
      isExactMatch: boolean;
    }>;
    missingSkills: string[];
    experienceGaps: string[];
    suggestions: string[];
  };
  metadata: {
    model: 'gemini-3-flash-preview';
    latencyMs: number;
    usedRAG: boolean;
  };
}
```

---

### `/api/optimize-cv-v2`

**Request Body:**
```typescript
interface OptimizeRequest {
  cv: StructuredCV;
  jobDescription: string;
  masterCV?: string;
  enableReflection?: boolean;  // Default: true
}
```

**Response Changes:**
```typescript
interface OptimizeResponse {
  success: boolean;
  optimizedCV: StructuredCV;
  edits: CVEdit[];
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  suggestions: string[];
  evaluation?: {              // New in V2
    score: number;
    passed: boolean;
    improvements: string[];
  };
  metadata: {
    analysisModel: 'gemini-3-flash-preview';
    writingModel: 'claude-sonnet-4-20250514';
    usedRAG: boolean;
    latencyMs: number;
  };
}
```

---

## Frontend Migration

### Updating API Calls

**Before (Legacy):**
```typescript
const response = await fetch('/api/agent', {
  method: 'POST',
  body: JSON.stringify({
    jobDescription,
    currentCV,
    action: 'full_optimization',
  }),
});
```

**After (V2):**
```typescript
const response = await fetch('/api/agent-v2', {
  method: 'POST',
  body: JSON.stringify({
    jobDescription,
    currentCV,
    action: 'full_optimization',
    enableWebSearch: true,      // Optional: company research
    enableReflection: true,     // Optional: quality refinement
  }),
});
```

### Handling New Events

```typescript
// Handle progress events
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'progress':
      setProgress(data.percent);
      setMessage(data.message);
      break;
      
    case 'reflection':
      if (data.status === 'started') {
        setMessage(`Refining content (iteration ${data.iteration})...`);
      }
      break;
      
    case 'workflow_complete':
      // V2 includes evaluation data
      if (data.results.evaluation) {
        setQualityScore(data.results.evaluation.score);
      }
      break;
  }
};
```

---

## Environment Variables

The V2 APIs require these environment variables:

```env
# Required for V2
GOOGLE_AI_API_KEY=your-gemini-api-key
ANTHROPIC_API_KEY=your-anthropic-api-key

# Optional but recommended
TAVILY_API_KEY=your-tavily-api-key      # For company research
PINECONE_API_KEY=your-pinecone-api-key  # For vector skill matching

# Legacy (can be removed after full migration)
OPENAI_API_KEY=your-openai-api-key
```

---

## Gradual Migration Strategy

1. **Phase 1**: Deploy V2 APIs alongside legacy APIs
2. **Phase 2**: Update frontend to use V2 APIs with feature flags
3. **Phase 3**: Monitor performance and quality metrics
4. **Phase 4**: Remove legacy APIs and OpenAI dependency

---

## Testing V2 APIs

```bash
# Test analyze-v2
curl -X POST http://localhost:3000/api/analyze-v2 \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"...", "currentCV":"..."}'

# Test agent-v2 (streaming)
curl -X POST http://localhost:3000/api/agent-v2 \
  -H "Content-Type: application/json" \
  -d '{"jobDescription":"...", "currentCV":"...", "action":"full_optimization"}'

# Test agents directly
curl http://localhost:3000/api/test-agents
```

---

## Performance Comparison

| Metric | Legacy (OpenAI) | V2 (Gemini + Claude) |
|--------|-----------------|----------------------|
| Analysis Speed | ~3-5s | ~2-4s |
| Writing Quality | Good | Excellent (Claude) |
| Skill Matching | Text-based | Semantic (RAG) |
| Cost | Higher | Lower (Gemini for 90%) |
| Reflection | None | Auto-refinement |
