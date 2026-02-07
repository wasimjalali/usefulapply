# Main Components - Current State Documentation

**Location:** `/src/components/`  
**Purpose:** Reusable React components for the application  
**Last Updated:** February 6, 2026 (Marketing Animation Components)

## Marketing Animation Components (Feb 6, 2026)
- **marketing/ScrollReveal.tsx** (NEW): Scroll-triggered fade/slide animation wrapper using IntersectionObserver. Props: `delay`, `direction` (up/down/left/right/none), `duration`, `distance`. Uses CSS transitions, zero JS animation overhead.
- **marketing/StaggerChildren.tsx** (exported from ScrollReveal): Wrapper that staggers reveal of direct children with increasing delays. Props: `staggerDelay`, `direction`, `duration`.
- **marketing/CountUp.tsx** (NEW): Animated counter that counts up when scrolled into view. Handles numeric values with prefixes/suffixes (e.g., "45+", "<3", "100%", "3-in-1"). Ease-out curve, 1.5s duration.

## Recent Refactoring 
- **ChatPanel split** into 4 modular components (ChatMessage, ChatInput, ChatHistory, FeedbackModal)
- **Settings page split** into 4 section components (Profile, Account, Subscription, Notifications)
- **New UI components** created (Input, Select, Modal, Toast)
- **Store split** completed (useCVStore, useSessionStore, useUIStore)

## Marketing Components Update (Feb 5, 2026)
- **Navbar.tsx** enhanced: backdrop blur header, gradient CTA button, gold underline hover on nav links, Next.js Image component
- **Footer.tsx** enhanced: gradient background, gold accent top border, gold uppercase section headers, Master CV link added, "Built by a job seeker, for job seekers" tagline

## Auth & Settings Simplification (Feb 6, 2026)
- **Login page** (`auth/login/page.tsx`): Replaced "KarKo AI" text with `<KarkoLogo variant="full" size="lg" theme="light" />`. Removed Google Sign-In button, divider, and `signInWithGoogle` usage.
- **Signup page** (`auth/signup/page.tsx`): Same logo replacement. Removed Google Sign-In button, divider, and `signInWithGoogle` usage.
- **AccountSection.tsx**: Removed entire Connected Accounts section (Google + LinkedIn connect/disconnect). Simplified props to just `onChangePassword` and `onDeleteAccount`. Kept Password, 2FA, and Danger Zone sections.
- **Settings page** (`settings/page.tsx`): Removed `getConnectedAccounts`, `disconnectAccount`, `connectOAuthProvider`, `ConnectedAccount` imports. Removed `connectedAccounts` state, `handleConnectOAuth`, `handleDisconnectAccount` functions. Simplified `AccountSection` usage.

## Brand Logo & SEO Update (Feb 6, 2026)
- **KarkoLogo.tsx** (NEW): SVG logo component with 3 variants (`full`, `icon`, `wordmark`), 5 sizes (`xs`–`xl`), light/dark themes. Brand colors: Navy `#0F1B3D`, Gold `#C8A44E`. Font: Plus Jakarta Sans 800. Exports `KARKO_BRAND` color constants.
- **Navbar.tsx**: Replaced old `Image` + text logo with `<KarkoLogo variant="full" size="sm" theme="light" />`
- **Footer.tsx**: Replaced old `Image` + text logo with `<KarkoLogo variant="full" size="lg" theme="dark" />`. Added homepage tagline: "One Click. Complete Job Application. 45 Minutes Saved."
- **ChatPanel.tsx**: Replaced inline Sparkles icon + text header with `<KarkoLogo variant="full" size="xs" theme="light" />`
- **layout.tsx**: Added Plus Jakarta Sans font (`--font-plus-jakarta`), full SEO metadata (OpenGraph, Twitter cards, keywords, canonical URLs, robots directives, googleBot config), JSON-LD structured data (`SoftwareApplication` schema with pricing offers)
- **icon.svg** (NEW): SVG favicon — navy rounded rect with gold "K" monogram
- **robots.ts** (NEW): Crawler directives — allows public pages, blocks `/api/`, `/dashboard/`, `/documents/`, `/master-cv/`, `/settings/`, `/auth/`. Explicitly allows GPTBot, ChatGPT-User, Google-Extended, ClaudeBot, anthropic-ai
- **sitemap.ts** (NEW): Lists 9 public pages with priorities (homepage=1.0, pricing=0.9, about=0.8, signup=0.7, etc.)
- **Per-page metadata**: Added to homepage (`page.tsx`), about (`about/page.tsx`), pricing (`pricing/layout.tsx`), contact (`contact/layout.tsx`)
- **About page**: Fixed broken founder image — `Wasim.png` was HEIF format (iPhone), converted to `wasim-founder.jpg` (proper JPEG)
- **German CV template**: Updated font from Verdana to Arial (ATS-safe), color from `#004E92` to `#1E3A5F` (refined slate blue)
- **Bedrock API**: Added AWS Bearer Token support for Amazon Bedrock API calls (uses `AWS_BEARER_TOKEN_BEDROCK` env var)

## Application UI/UX Premium Redesign (Feb 5, 2026)
- **Dashboard tab bar**: White header with shadow, gold active tab indicator, gold-tinted icons on active, premium profile avatar with gold ring, gold resize handle
- **ChatPanel**: Branded header with Sparkles icon badge, rounded-xl AI avatars with shadow, gradient Upload CV CTA button, polished typing indicator
- **ChatMessage**: Rounded-xl avatars, shadow on AI message cards, premium action buttons with gold dot connectors and hover:border-gold-300, timestamps on all messages
- **CVPanel**: White header with icon badge, pill-style Content/Changes tabs (rounded-xl), pill-style Original/Optimized and View/Edit toggles, better empty state with rounded-2xl icon container
- **CoverLetterPanel**: Consistent with CVPanel - white header, icon badge, pill-style View/Edit toggle, premium empty states
- **EmailPanel**: Consistent styling, premium tips section with navy-50/cream-50 gradient and gold bullet points
- **AgentProgressV2**: Company research card rebranded from blue to navy/gold brand colors with rounded-xl cards
- **Settings page**: Backdrop blur header, gradient sidebar (from-navy-600 to-navy-700) with gold icon accents, subtle gradient background

## UI/UX Refinements Round 2 (Feb 5, 2026)
- **ChatPanel**: Fixed double icons in AI response action buttons - removed emoji from labels (Lucide icons already rendered by ChatMessage)
- **TemplateSelector**: Complete redesign - brand-consistent navy gradients for template previews, gold selected state (border-gold-400, ring-gold-100), premium recommendation tags with brand colors
- **ProfileSection**: Rounded-2xl cards, gold focus rings on inputs (focus:border-gold-400 focus:ring-gold-100), gold photo ring (ring-gold-100/50), gradient camera button
- **SubscriptionSection**: Gold gradient progress bar, gold-bordered active plan cards, gold checkmarks for Pro tier, gradient Popular badge, rounded-2xl cards
- **Documents page**: Navy/gold icon containers (replacing purple for photo section), cream borders, navy-50/gold-500 auto-save notice, consistent shadow treatment

## Fit Analysis Feature (Feb 5, 2026)
- **ChatPanel**: New `runFitAnalysisFlow()` function replaces direct `runAgentWorkflow()` on JD detection. Handles `fit_analysis_complete` SSE event. Shows fit assessment message with 🟢/🟡/🔴 badge, score, assessment paragraph, matching/missing skills. Action buttons: "Apply for This Job" (triggers `generate_with_context`) and "Start New Application" (skips). New state: `fitAnalysisContextId`, `fitAnalysisJD`.
- **AgentProgressV2**: Added `fit_assessment` step config with Zap icon, "Assessing Job Fit" label, and 3 sub-actions for progress display

### Design System Patterns (App UI)
- **Headers**: `bg-white border-b border-cream-200 shadow-sm`
- **Icon badges**: `w-8 h-8 rounded-lg bg-navy-50` with `w-4 h-4 text-navy-600` icon
- **Pill toggles**: `bg-cream-100 rounded-xl p-1` container, active: `bg-white text-navy-700 shadow-sm font-semibold rounded-lg`
- **Empty states**: `w-16 h-16 rounded-2xl bg-cream-100` icon container, `text-lg font-semibold` heading
- **AI avatars**: `rounded-xl bg-gradient-to-br from-navy-600 to-navy-700 shadow-sm`
- **Action buttons**: `rounded-xl border-cream-200 hover:border-gold-300 hover:shadow-sm`

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

## Change Log

| Date | Change | Files Modified | Reason |
|------|--------|----------------|--------|
| Feb 7, 2026 | SubscriptionSection: free tier credit update | SubscriptionSection.tsx | Starter plan 6→40 credits, 3→20 apps across mobile/desktop plan comparison and default credit display |
| Feb 7, 2026 | i18n: USPremiumATSTemplate — dynamic section headers | USPremiumATSTemplate.tsx | Replaced 7 hardcoded English headers + 4 hardcoded strings (Present, GPA:, in, LANGUAGES) with `data.sectionHeaders?.X \|\| 'ENGLISH_FALLBACK'` and `data.localizedStrings?.X \|\| 'fallback'` |
| Feb 7, 2026 | i18n: USModernATSTemplate — dynamic section headers | USModernATSTemplate.tsx | Replaced 8 hardcoded English headers + 2 hardcoded strings (Present, GPA:) with `data.sectionHeaders` and `data.localizedStrings` fallback pattern |
| Feb 7, 2026 | i18n: USProfessionalTemplate — dynamic section headers | USProfessionalTemplate.tsx | Replaced 7 hardcoded English headers + 4 hardcoded strings (Present, GPA:, in, LANGUAGES) with `data.sectionHeaders` and `data.localizedStrings` fallback pattern |
| Feb 7, 2026 | i18n: GermanATSTemplate — dynamic section headers | GermanATSTemplate.tsx | Replaced `GERMAN_HEADERS.X` with `data.sectionHeaders?.X \|\| GERMAN_HEADERS.X` (keeps German fallback chain). Replaced hardcoded 'Heute', 'Note:', 'Foto' with `data.localizedStrings` equivalents. |

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
