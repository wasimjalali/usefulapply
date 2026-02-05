# API Routes - Current State Documentation

**Location:** `/src/app/api/`  
**Purpose:** Next.js API routes for backend functionality  
**Last Updated:** February 5, 2026 (Post-Refactoring)

---

## Overview

The application has **5 active API routes** handling CV parsing, job application generation, PDF creation, and chat functionality. All routes use the unified agent architecture (migrated from 3-agent system). **3 duplicate routes deleted** during refactoring.

---

## Route Inventory

| Route | Purpose | Credit Cost | Status | Notes |
|-------|---------|-------------|--------|-------|
| `/api/agent-v2` | Main workflow - full job application generation | 2 credits | ✅ Active | Uses CV transformers utility |
| `/api/chat` | Chat assistant for user guidance | Free | ✅ Active | Context-aware responses |
| `/api/generate-pdf` | Generate PDF from structured CV | Free | ✅ Active | Uploads to Supabase |
| `/api/parse-cv` | Advanced CV parsing with AI | Free | ✅ Active | Primary parser + logging |
| `/api/regenerate` | Regenerate cover letter or email | 1 credit | ✅ Active | Uses language detector utility |
| `/api/optimize` | CV optimization (standalone) | N/A | 🗑️ **DELETED** | Removed during refactoring |
| `/api/optimize-cv` | CV optimization with edits tracking | N/A | 🗑️ **DELETED** | Removed during refactoring |
| `/api/parse` | Simple CV parsing | N/A | 🗑️ **DELETED** | Removed during refactoring |

---

## Detailed Route Analysis

### 1. `/api/agent-v2/route.ts` (~220 lines) ✅ REFACTORED

**Purpose:** Main orchestration endpoint for complete job application workflow

**Current State:**
- ✅ Uses unified agent (`runJobCopilot` from `@/lib/agents`)
- ✅ Implements credit system (2 credits per full application)
- ✅ Streams progress events to frontend via SSE
- ✅ Handles authentication via Supabase
- ✅ Returns structured results: CV, cover letter, email
- ✅ **REFACTORED:** CV transformation functions extracted to utility

**Key Functions:**
- `POST()` - Main handler with streaming
- `getWorkflowSteps()` - Defines workflow steps
- `getStepIndex()` - Maps step IDs to indices

**Dependencies:**
- `@/lib/agents` - Unified writer agent
- `@/lib/supabase/server` - Authentication
- `@/lib/middleware/creditCheck` - Credit deduction
- `@/lib/supabase/credits` - Credit operations
- `@/lib/utils/cv-transformers` - **NEW:** CV transformation utilities

**Refactoring Completed:**
- ✅ Extracted `extractOriginalExperience()` to cv-transformers.ts
- ✅ Extracted `extractOriginalHeadline()` to cv-transformers.ts
- ✅ Extracted `extractSectionByHeader()` to cv-transformers.ts
- ✅ Extracted `transformToGeneratedCV()` to cv-transformers.ts
- ✅ Removed TODO comment (line 212)
- ✅ File reduced from 497 → ~220 lines (55% reduction)

---

### 2. `/api/chat/route.ts` (201 lines)

**Purpose:** AI chat assistant for user guidance and document navigation

**Current State:**
- ✅ Uses Claude via `callModel()` with strict 100 token limit
- ✅ Context-aware (knows about uploaded documents, generated content)
- ✅ Returns action buttons for navigation
- ✅ Maintains conversation history (last 10 messages)

**Key Functions:**
- `POST()` - Main chat handler
- `buildSystemPrompt()` - Constructs context-aware system prompt
- `extractActions()` - Generates navigation action buttons

**Context Tracking:**
```typescript
interface ChatContext {
  hasCV: boolean;
  cvSummary?: string;
  hasAnalysis: boolean;
  jobTitle?: string;
  company?: string;
  hasMasterCV?: boolean;
  masterCVSummary?: string;
  hasCertifications?: boolean;
  certificationsCount?: number;
  certificationsList?: string;
  chatHistory?: ChatMessage[];
  hasGeneratedCV?: boolean;
  hasGeneratedCoverLetter?: boolean;
  hasGeneratedEmail?: boolean;
}
```

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured and focused

**Recommendations:**
- Consider increasing token limit to 150 for slightly more detailed responses
- Add error handling for rate limits

---

### 3. `/api/generate-pdf/route.ts` (367 lines)

**Purpose:** Generate PDF from structured CV and upload to Supabase Storage

**Current State:**
- ✅ Uses `pdf-lib` for PDF generation
- ✅ Uploads to Supabase `generated-pdfs` bucket
- ✅ Returns signed URL (7-day expiry)
- ✅ Supports US Letter and EU A4 formats
- ✅ Professional font sizing (2026 standards)

**Font Standards (Lines 105-111):**
```typescript
const FONT_SIZES = {
  name: 20,           // Professional name header
  sectionHeader: 12,  // Section headers
  jobTitle: 11,       // Job/degree titles
  body: 10.5,         // Body text, bullets, skills
  small: 9,           // Dates, secondary info
};
```

**Key Functions:**
- `POST()` - Main handler
- `generatePDF()` - Core PDF generation logic
- `ensureSpace()` - Page overflow handling
- `wrapText()` - Text wrapping for proper layout
- `drawText()` - Text rendering with wrapping
- `drawSection()` - Section header rendering
- `formatDate()` - Date formatting

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured PDF generation

**Recommendations:**
- Consider extracting PDF generation to `/src/lib/pdf-generator/` for reusability
- Add template selection logic (currently ignores `templateId` parameter)

---

### 4. `/api/parse-cv/route.ts` (386 lines) ✅ PRIMARY PARSER + LOGGING

**Purpose:** Advanced CV parsing with AI (Anthropic/Gemini) and local fallback

**Current State:**
- ✅ Primary CV parsing endpoint
- ✅ Tries AI first (Anthropic Claude Haiku 4.5 or Gemini 2.0 Flash)
- ✅ Falls back to local parsing if no API keys
- ✅ Extracts comprehensive CV data
- ✅ Handles PDF files
- ✅ Optional Vercel Blob storage
- ✅ **NEW:** Parser usage logging (tracks which parser was used)

**Parsing Strategy:**
1. Try Anthropic Claude Haiku 4.5 (if API key available)
2. Try Gemini 2.0 Flash (if API key available)
3. Fall back to local regex-based parsing

**Key Functions:**
- `POST()` - Main handler with logging
- `parseLocally()` - Regex-based local parser
- `parseWithGemini()` - Gemini AI parser
- `parseWithAnthropic()` - Anthropic AI parser
- `getParsingPrompt()` - Shared AI prompt
- `parseAIResponse()` - Converts AI JSON to StructuredCV

**Recent Improvements:**
- ✅ Added parser usage logging (Anthropic/Gemini/Local)
- ✅ Includes parser metadata in response
- ✅ Tracks parsing performance metrics

**Recommendations:**
- Keep as-is - fallback logic is valuable
- Monitor logs to optimize parser selection

---

### 5. `/api/regenerate/route.ts` (~80 lines) ✅ REFACTORED

**Purpose:** Regenerate cover letter or email (1 credit each)

**Current State:**
- ✅ Uses unified writer agent
- ✅ Implements credit system (1 credit per regeneration)
- ✅ Handles authentication
- ✅ Detects language (EN/DE)
- ✅ Supports both cover letter and email regeneration
- ✅ **REFACTORED:** Language detection extracted to utility

**Key Functions:**
- `POST()` - Main handler

**Dependencies:**
- `@/lib/agents/unified-writer-agent` - Content generation
- `@/lib/supabase/server` - Authentication
- `@/lib/middleware/creditCheck` - Credit deduction
- `@/lib/utils/language-detector` - **NEW:** Language detection utility

**Refactoring Completed:**
- ✅ Extracted `detectLanguage()` to language-detector.ts
- ✅ File reduced from 114 → ~80 lines (30% reduction)
- ✅ Language detection now reusable across codebase

**Recommendations:**
- Add rate limiting for regeneration requests

---

## Architecture Notes

### Current Agent System
The application uses a **unified agent architecture** (migrated from 3-agent system in Feb 2024):
- Single agent handles: CV parsing, job analysis, CV optimization, cover letter, email
- Located in: `/src/lib/agents/unified-writer-agent.ts`
- Old 3-agent files deleted: `orchestrator-agent.ts`, `context-agent.ts`, `writer-agent.ts`

### Credit System
- Full application: **2 credits** (agent-v2)
- Cover letter regen: **1 credit** (regenerate)
- Email regen: **1 credit** (regenerate)
- Parsing/PDF generation: **Free**

### Authentication Flow
All protected routes use:
```typescript
const supabase = await createClient();
const { data: { user }, error } = await supabase.auth.getUser();
```

---

## Refactoring Completed ✅

### High Priority - Duplicate Routes DELETED ✅
1. ✅ **DELETED `/api/optimize/route.ts`** - 93 lines removed
2. ✅ **DELETED `/api/optimize-cv/route.ts`** - 141 lines removed
3. ✅ **DELETED `/api/parse/route.ts`** - 99 lines removed
**Total:** 333 lines of duplicate code removed

### Medium Priority - Code Refactoring COMPLETED ✅
4. ✅ **Moved helper functions from agent-v2** to `/src/lib/utils/cv-transformers.ts`:
   - `extractOriginalExperience()`
   - `extractOriginalHeadline()`
   - `extractSectionByHeader()`
   - `transformToGeneratedCV()`

5. ✅ **Extracted language detection** from regenerate to `/src/lib/utils/language-detector.ts`

6. ✅ **Added parser usage logging** to parse-cv route

7. ✅ **Removed TODO comment** from agent-v2 (line 212)

### Remaining Improvements (Optional)
8. Extract PDF generation from generate-pdf to `/src/lib/pdf-generator/` for reusability
9. Remove Vercel Blob storage code if not used (parse-cv lines 26-39)
10. Add rate limiting to regenerate endpoint

---

## Change Log

| Date | Change | Files Modified | Reason |
|------|--------|----------------|--------|
| Feb 5, 2026 | **Major refactoring** | All API routes | Code cleanup & optimization |
| Feb 5, 2026 | Deleted 3 duplicate routes | optimize, optimize-cv, parse | Removed 333 lines |
| Feb 5, 2026 | Extracted CV transformers | agent-v2 → cv-transformers.ts | Reusability |
| Feb 5, 2026 | Extracted language detector | regenerate → language-detector.ts | Reusability |
| Feb 5, 2026 | Added parser logging | parse-cv | Track parser usage |
| Feb 4, 2026 | Migrated to unified agent | agent-v2, regenerate | Simplified architecture |

---

## Dependencies Map

```
agent-v2/route.ts
├── @/lib/agents (unified agent)
├── @/lib/utils/cv-transformers ⭐ NEW
├── @/lib/supabase/server (auth)
├── @/lib/middleware/creditCheck
└── @/lib/supabase/credits

chat/route.ts
└── @/lib/models (AI model router)

generate-pdf/route.ts
├── pdf-lib (PDF generation)
└── @supabase/supabase-js (storage)

parse-cv/route.ts
├── pdf-parse (PDF text extraction)
├── @anthropic-ai/sdk (AI parsing)
├── @google/generative-ai (AI parsing)
└── @/lib/types/cv-schema (type definitions)

regenerate/route.ts
├── @/lib/agents/unified-writer-agent
├── @/lib/utils/language-detector ⭐ NEW
├── @/lib/supabase/server
└── @/lib/middleware/creditCheck
```

---

## Testing Checklist

- [ ] Test agent-v2 full workflow with valid job description
- [ ] Test credit deduction for agent-v2 (2 credits)
- [ ] Test credit deduction for regenerate (1 credit each)
- [ ] Test chat context awareness
- [ ] Test PDF generation for US and EU formats
- [ ] Test parse-cv with Anthropic, Gemini, and local fallback
- [ ] ✅ Verify duplicate routes deleted (optimize, optimize-cv, parse)
- [ ] Test authentication on all protected routes
- [ ] Test error handling for insufficient credits
- [ ] ✅ Verify CV transformers utility works correctly
- [ ] ✅ Verify language detector utility works correctly
- [ ] ✅ Verify parser logging captures usage data

---

## Notes for AI Agents

When working with API routes:
1. **Always use agent-v2** for full job application generation
2. **Always use parse-cv** for CV parsing
3. **Duplicate routes deleted** - optimize, optimize-cv, parse no longer exist
4. **Check credit costs** before calling endpoints
5. **Handle streaming responses** properly for agent-v2
6. **Use regenerate endpoint** for cover letter/email regeneration only
7. **Use cv-transformers utility** for CV data transformation
8. **Use language-detector utility** for EN/DE language detection
