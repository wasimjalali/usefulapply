# Main Components - Current State Documentation

**Location:** `/src/components/`  
**Purpose:** Reusable React components for the application  
**Last Updated:** February 5, 2026 (Post-Refactoring)

## Recent Refactoring 
- **ChatPanel split** into 4 modular components (ChatMessage, ChatInput, ChatHistory, FeedbackModal)
- **Settings page split** into 4 section components (Profile, Account, Subscription, Notifications)
- **New UI components** created (Input, Select, Modal, Toast)
- **Store split** completed (useCVStore, useSessionStore, useUIStore)

---

## Overview

The components directory contains 13 main components (excluding UI primitives, CV templates, and marketing components). These handle the core application functionality: CV display, chat interface, document panels, and file uploads.

---

## Component Inventory

| Component | Lines | Purpose | Status | Dependencies |
|-----------|-------|---------|--------|--------------|
| CVPanel.tsx | 781 | CV display with templates & editing | ✅ Active | cv-templates, EditableCVCanvas |
| ChatPanel.tsx | 1214 | Chat interface with AI assistant | ✅ Active | AgentProgressV2, MarkdownText |
| CoverLetterPanel.tsx | 627 | Cover letter display & download | ✅ Active | jsPDF, docx |
| EmailPanel.tsx | 392 | Email display & mailto integration | ✅ Active | - |
| AgentProgressV2.tsx | 348 | Progress indicator for AI workflow | ✅ Active | - |
| EditableCVCanvas.tsx | 736 | Inline CV editing interface | ✅ Active | - |
| FileUpload.tsx | 97 | Drag-drop file upload | ✅ Active | react-dropzone |
| StorageCleaner.tsx | 59 | Cleanup old localStorage | ⚠️ Temporary | - |
| KarkoAIStepIndicator.tsx | ~150 | Loading indicator | ✅ Active | - |
| MarkdownText.tsx | ~100 | Markdown renderer | ✅ Active | - |
| PDFViewer.tsx | ~200 | PDF preview | ✅ Active | - |
| QualityScoreCard.tsx | ~150 | Quality score display | ✅ Active | - |
| CreditBalance.tsx | ~100 | Credit display | ✅ Active | - |

---

## Detailed Component Analysis

### 1. CVPanel.tsx (781 lines) - Core CV Display

**Purpose:** Main CV panel with template rendering, editing, and PDF export

**Current State:**
- ✅ Displays CV with multiple template options
- ✅ Template selector (Premium ATS, Modern, Classic, etc.)
- ✅ Toggle between original and optimized CV
- ✅ Inline editing mode with EditableCVCanvas
- ✅ PDF download via browser print
- ✅ Copy CV text to clipboard
- ✅ Profile photo integration
- ✅ Change tracking display

**Key Features:**

**1. CV Data Parsing (lines 73-147):**
- **Priority:** Uses `structuredCV` from AI parsing (proper arrays for skills/languages)
- **Fallback:** Re-parses raw text if structuredCV unavailable
- **Solution B:** Uses `optimizedCVData` (structured JSON from AI) directly - no text parsing needed
- **Legacy:** Falls back to text parsing for backward compatibility

**2. Template System:**
- Template selector with preview
- Supports US Letter and EU A4 formats
- Templates: premium-ats, modern, classic, executive, creative, minimal

**3. PDF Export (lines 155-240):**
- Uses browser print dialog (not server-side)
- Print-optimized CSS with proper margins
- Hides browser headers/footers
- Professional font sizing (10.5pt body, 12pt headers)

**4. Edit Mode:**
- Toggle to EditableCVCanvas
- Inline editing of all CV sections
- Save changes back to store

**Leftover Code Issues:**
- ⚠️ Lines 34-36: Comment about removed patching functions - can be deleted
- ⚠️ Lines 92-127: Solution B implementation - good architecture, keep
- ⚠️ Lines 129-144: Fallback text parsing - needed for backward compatibility
- ⚠️ Lines 173-240: PDF generation CSS - very long, could be extracted to separate file

**Recommendations:**
- Extract PDF CSS to `/src/styles/cv-print.css`
- Remove outdated comments (lines 34-36)
- Consider server-side PDF generation for better quality

---

### 2. ChatPanel.tsx (1214 lines) ⚠️ LARGE FILE

**Purpose:** Chat interface with AI assistant, message history, and action buttons

**Current State:**
- ✅ Real-time chat with AI assistant
- ✅ Message feedback (thumbs up/down)
- ✅ Copy message functionality
- ✅ Expandable long messages
- ✅ Agent progress tracking (V2)
- ✅ Session history sidebar
- ✅ Stop generation button
- ✅ Action buttons for navigation

**Key Features:**

**1. Message Management:**
- Chat history with user/assistant messages
- Markdown rendering via MarkdownText component
- Message collapse for long content (>300 chars)
- Copy to clipboard per message

**2. Feedback System (lines 113-152):**
- Thumbs up/down on messages
- Optional feedback text
- Saves to Supabase `message_feedback` table
- Success confirmation

**3. Agent Progress (lines 74-80):**
- V2 progress tracking (percent, message)
- Reflection status (iteration count)
- Model info (analysis, writing)
- Evaluation scores
- Token usage display

**4. Stop Generation (lines 155-178):**
- Abort controller for canceling requests
- Resets all loading states
- Adds system message with "Start New Application" action

**5. Job Description Detection (lines 198-350):**
- Detects if message is a job description
- Auto-triggers full application workflow
- Calls `/api/agent-v2` with streaming

**Leftover Code Issues:**
- 🔴 **LARGE FILE (1214 lines)** - Should be split into smaller components
- ⚠️ Lines 7-19: AgentStepData interface defined inline - should be in types file
- ⚠️ Lines 21: Comment about QualityScoreCard removal - can delete comment
- ⚠️ Lines 129: UUID validation check - good practice, keep
- ⚠️ Lines 500-800: Message rendering logic - could be extracted to MessageList component
- ⚠️ Lines 800-1000: Input area logic - could be extracted to ChatInput component

**Recommendations:**
- **Split into 4 components:**
  1. `ChatPanel.tsx` - Main container (200 lines)
  2. `MessageList.tsx` - Message rendering (400 lines)
  3. `ChatInput.tsx` - Input area (200 lines)
  4. `SessionHistory.tsx` - History sidebar (200 lines)
- Move AgentStepData to `/src/types/agent.ts`
- Extract feedback modal to separate component

---

### 3. CoverLetterPanel.tsx (627 lines)

**Purpose:** Display and download cover letter in multiple formats

**Current State:**
- ✅ Display formatted cover letter
- ✅ Copy to clipboard
- ✅ Download as PDF (jsPDF)
- ✅ Download as DOCX (docx library)
- ✅ Regenerate cover letter
- ✅ Edit mode (inline editing)
- ✅ Supports both structured and body-only formats

**Key Features:**

**1. Format Support (lines 47-74):**
- **Structured format:** Applicant address, company address, salutation, body, closing
- **Body-only format:** Full letter in body field (3-agent architecture compatibility)
- Auto-detects format and renders accordingly

**2. PDF Export (lines 85-240):**
- Uses jsPDF library
- Professional formatting with proper margins
- Multi-page support with overflow handling
- Font: Helvetica 11pt

**3. DOCX Export (lines 242-350):**
- Uses docx library
- Structured paragraphs with proper spacing
- Professional formatting
- Downloads as `.docx` file

**4. Regeneration (lines 352-450):**
- Calls `/api/regenerate` with context
- Uses Writer Agent
- 1 credit cost
- Updates cover letter in session

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured with clear format handling
- ⚠️ Lines 104-116: Body-only format check - needed for backward compatibility

**Recommendations:**
- Extract PDF generation to utility function
- Extract DOCX generation to utility function
- Add loading states for downloads

---

### 4. EmailPanel.tsx (392 lines)

**Purpose:** Display and manage application email

**Current State:**
- ✅ Display email subject and body
- ✅ Copy subject separately
- ✅ Copy body separately
- ✅ Copy full email (subject + body)
- ✅ Open in email client (mailto)
- ✅ Regenerate email
- ✅ Edit mode (inline editing)

**Key Features:**

**1. Mailto Integration (lines 142-188):**
- Encodes subject and body for mailto link
- Truncates body if >1500 chars (mailto limit)
- Creates hidden anchor and clicks it
- Handles browser compatibility

**2. Regeneration (lines 53-114):**
- Calls `/api/regenerate` with context
- Uses Writer Agent
- 1 credit cost
- Returns `{ subject, body }`

**3. Edit Mode (lines 33-51):**
- Toggle to edit mode
- Inline editing of subject and body
- Save changes to session

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured and focused
- ⚠️ Lines 146-187: Extensive mailto logging - could be reduced in production

**Recommendations:**
- Remove debug console.logs in production
- Add email validation before opening mailto
- Consider adding "Send via Gmail/Outlook" buttons

---

### 5. AgentProgressV2.tsx (348 lines)

**Purpose:** Visual progress indicator for AI workflow steps

**Current State:**
- ✅ Displays workflow steps (analysis, matching, CV, cover letter, email)
- ✅ Step status indicators (pending, running, completed, error)
- ✅ Company research card display
- ✅ Reflection/iteration indicator
- ✅ Token usage display
- ✅ Auto-expands running steps
- ✅ Simulated action progress

**Step Configuration (lines 51-133):**
```typescript
{
  analysis: { icon: Brain, label: 'Parsing CV & Requirements' },
  matching: { icon: Search, label: 'Skill Matching' },
  cv_generation: { icon: FileText, label: 'Optimizing CV' },
  cover_letter: { icon: Pencil, label: 'Composing Cover Letter' },
  email: { icon: Award, label: 'Generating Email' },
}
```

**Company Research Display (lines 284-325):**
- Shows company name, description
- Displays address, culture, tech stack, recent news
- Blue gradient card with grid layout
- **THE FIX:** Makes search results visible to user

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-designed progress UI
- ⚠️ Lines 113-133: Legacy step IDs (context, writing) - needed for backward compatibility

**Recommendations:**
- Consider adding estimated time remaining
- Add ability to cancel individual steps
- Show more detailed error messages

---

### 6. EditableCVCanvas.tsx (736 lines)

**Purpose:** Inline CV editing interface with field-by-field editing

**Current State:**
- ✅ Editable fields for all CV sections
- ✅ Click-to-edit interaction
- ✅ Save/cancel buttons per field
- ✅ Add/remove experience bullets
- ✅ Drag-to-reorder (GripVertical icon)
- ✅ AI improvement suggestions (optional)
- ✅ Has changes indicator

**Key Features:**

**1. EditableField Component (lines 23-84):**
- Inline editing with hover state
- Edit mode with save/cancel
- Supports single-line and multiline
- Shows edit icon on hover

**2. Field Updates (lines 91-103):**
- Deep object updates via path string
- Tracks changes with `hasChanges` flag
- Save/reset functionality

**3. Experience Bullets (lines 130-150):**
- Add new bullet
- Update existing bullet
- Remove bullet
- Maintains bullet order

**4. AI Improvement (lines 115-128):**
- Optional AI improvement callback
- Shows loading state during processing
- Updates field with improved content

**Leftover Code Issues:**
- ✅ No significant leftover code
- ✅ Well-structured editing interface
- ⚠️ Drag-to-reorder not fully implemented (GripVertical icon present but no drag logic)

**Recommendations:**
- Implement drag-to-reorder for experience entries
- Add undo/redo functionality
- Add field validation (email format, phone format)
- Show character count for fields with limits

---

### 7. FileUpload.tsx (97 lines)

**Purpose:** Drag-and-drop file upload component

**Current State:**
- ✅ Uses react-dropzone library
- ✅ Drag-and-drop support
- ✅ Click to browse
- ✅ File type validation (PDF, DOCX)
- ✅ File size limit (10MB)
- ✅ Selected file display
- ✅ Clear file button
- ✅ Loading state support

**Features:**
- Accepts: PDF, DOCX
- Max size: 10MB
- Max files: 1
- Visual feedback for drag state
- Shows file name after upload

**Leftover Code Issues:**
- ✅ No leftover code
- ✅ Clean, reusable component

**Recommendations:**
- Add file preview for images
- Show upload progress bar
- Add error messages for invalid files

---

### 8. StorageCleaner.tsx (59 lines) ⚠️ TEMPORARY

**Purpose:** One-time cleanup of old localStorage data

**Current State:**
- ⚠️ **TEMPORARY COMPONENT** - Should be removed after cleanup
- Runs once on mount
- Clears old PDF base64 data from localStorage
- Marks cleanup as complete with flag

**Cleanup Logic (lines 19-48):**
- Checks for old storage key
- Removes base64 PDF fields
- Preserves other data
- Handles corrupted storage

**Leftover Code Issues:**
- 🔴 **ENTIRE FILE IS TEMPORARY** - Should be removed after users have migrated
- Lines 8: Comment says "Remove this component after the first successful run"

**Recommendations:**
- **Remove this component** after 30 days (all users migrated)
- Add migration date tracking
- Consider server-side migration instead

---

### 9-13. Other Components (Summary)

**KarkoAIStepIndicator.tsx (~150 lines):**
- Loading indicator for AI steps
- Shows step type (CV, cover letter, email)
- Animated spinner
- Status message

**MarkdownText.tsx (~100 lines):**
- Renders markdown content
- Used in chat messages
- Syntax highlighting for code blocks

**PDFViewer.tsx (~200 lines):**
- PDF preview component
- Uses iframe or object tag
- Fallback to download link

**QualityScoreCard.tsx (~150 lines):**
- Displays quality score for generated content
- Shows match percentage
- Lists matching/missing skills

**CreditBalance.tsx (~100 lines):**
- Displays user credit balance
- Shows monthly, rollover, addon credits
- Links to pricing page

---

## Common Patterns

### State Management
All components use Zustand store:
```typescript
const { currentSession, isGenerating, isAgentWorking } = useAppStore();
```

### Loading States
```typescript
{isAgentWorking && <KarkoAIStepIndicator />}
```

### Copy to Clipboard
```typescript
await navigator.clipboard.writeText(content);
setCopied(true);
setTimeout(() => setCopied(false), 2000);
```

---

## Cleanup Tasks

### High Priority
1. **Split ChatPanel.tsx** (1214 lines) into 4 smaller components
2. **Remove StorageCleaner.tsx** after migration period (30 days)

### Medium Priority
3. **Extract PDF CSS** from CVPanel to separate file
4. **Extract PDF/DOCX generation** to utility functions
5. **Move AgentStepData interface** to types file
6. **Remove debug console.logs** from EmailPanel

### Low Priority
7. Implement drag-to-reorder in EditableCVCanvas
8. Add undo/redo to EditableCVCanvas
9. Extract PDF generation utilities
10. Add file preview to FileUpload
11. Add progress bars for file uploads

---

## Architecture Notes

### Component Hierarchy
```
Dashboard
├── CVPanel
│   ├── CVTemplateRenderer
│   ├── TemplateSelector
│   └── EditableCVCanvas
├── CoverLetterPanel
├── EmailPanel
└── ChatPanel
    ├── AgentProgressV2
    ├── MessageList
    └── ChatInput
```

### Data Flow
1. User uploads CV → FileUpload → Documents page
2. User pastes job → ChatPanel → `/api/agent-v2`
3. Agent generates → Updates session in store
4. Panels display → CVPanel, CoverLetterPanel, EmailPanel

---

## Testing Checklist

- [ ] CVPanel template switching works
- [ ] CVPanel PDF export works (all templates)
- [ ] CVPanel edit mode saves correctly
- [ ] ChatPanel sends messages
- [ ] ChatPanel feedback submission works
- [ ] ChatPanel stop generation works
- [ ] CoverLetterPanel PDF download works
- [ ] CoverLetterPanel DOCX download works
- [ ] EmailPanel mailto link works
- [ ] EmailPanel regeneration works
- [ ] FileUpload accepts PDF/DOCX
- [ ] FileUpload rejects invalid files
- [ ] AgentProgressV2 shows all steps
- [ ] EditableCVCanvas saves changes

---

## Notes for AI Agents

When working with components:
1. **ChatPanel is too large** - split before adding features
2. **StorageCleaner is temporary** - don't rely on it
3. **Use structured CV data** when available (Solution B)
4. **Always show loading states** during async operations
5. **Handle both formats** (structured and body-only) for backward compatibility
6. **Extract utilities** for PDF/DOCX generation
7. **Test across browsers** for mailto and PDF export
