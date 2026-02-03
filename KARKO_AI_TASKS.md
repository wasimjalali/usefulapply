# Karko AI - Bug Fixes & Feature Implementation Tasks

**Created:** 2026-02-03  
**Status:** Active  
**Context:** Follow-up from "Evaluating Karko AI job application output quality" conversation

---

## Progress Tracker

| Task | Status | Started | Completed | Notes |
|------|--------|---------|-----------|-------|
| Task 1 | ✅ Complete | 2026-02-03 | 2026-02-03 | Web Search diagnostic logging added |
| Task 2 | ✅ Complete | 2026-02-03 | 2026-02-03 | Email copy/mailto fixed, tip added |
| Task 3 | ✅ Complete | 2026-02-03 | 2026-02-03 | Page break CSS fixed for all templates |
| Task 4 | ✅ Complete | 2026-02-03 | 2026-02-03 | Language detection + German template |
| Task 5 | ✅ Complete | 2026-02-03 | 2026-02-03 | Sparkle avatar + Start New Application |
| Task 6 | ✅ Complete | 2026-02-03 | 2026-02-03 | Pricing updated, SQL in USER_TASKS.md |
| Task 7 | ✅ Complete | 2026-02-03 | 2026-02-03 | Master CV page created at /master-cv |

---

## CRITICAL INSTRUCTIONS FOR AGENT

1. **Complete each task fully before moving to the next task**
2. **Test each task after completion** — verify it works as expected
3. **Update the Progress Tracker** above after completing each task
4. **If you encounter a blocker**, document it and ask the user before proceeding
5. **Do NOT skip parts** — complete Part A before Part B, etc.
6. **Console logging is mandatory** for debugging tasks — add logs to trace issues

---

## Task 1: Web Search Debugging & Verification

**Priority:** 🔴 HIGH  
**Estimated Complexity:** Medium-Hard  
**Dependencies:** None

### Background
The application uses Anthropic Claude web search as the primary search API, with GPT search and Tavily as fallbacks. However, company research information (company address, recent news) is NOT appearing in cover letters. Either:
- Web search is not being called
- Results are not being passed to context agent
- Context agent is not passing results to writer agent
- Writer agent is not using the information

### Part A: Add Diagnostic Logging

**Goal:** Trace the web search flow to identify where information is being lost.

1. Add console logs at these checkpoints:
   - When web search is triggered
   - The query being sent to search API
   - The raw results received from search API
   - What gets passed to context agent
   - What context agent outputs
   - What gets passed to writer agent
   - What writer agent uses in the cover letter

2. Log format should be clear:
```javascript
console.log('[WEB_SEARCH] Step 1: Triggering search for:', query);
console.log('[WEB_SEARCH] Step 2: Raw results:', results);
console.log('[CONTEXT_AGENT] Received company info:', companyInfo);
console.log('[WRITER_AGENT] Company data available:', companyData);
```

### Part B: Verify Web Search Toggle Connection

**Goal:** Confirm the Web Search toggle in the chat panel (bottom left, green "Web Search" button) is actually connected to the backend.

1. Find the toggle component in the codebase
2. Verify it dispatches an action or updates state when toggled
3. Verify the backend/API respects this setting
4. Add console log: `console.log('[WEB_SEARCH_TOGGLE] Enabled:', isEnabled);`

### Part C: Fix Web Search Data Flow

**Goal:** Once you identify where the data is being lost, fix it.

1. If search is not being called → Fix the trigger condition
2. If results are not being passed → Fix the data pipeline
3. If writer agent is not using it → Update writer agent prompt to explicitly require company address and research

**Expected Writer Agent Output Should Include:**
- Company address in cover letter header (recipient section)
- Company-specific details in cover letter body
- Recent news/achievements if available

### Part D: Test & Verify

1. Run a test application with web search enabled
2. Check console logs at each step
3. Verify cover letter contains:
   - Company address
   - Company-specific information from web search
4. Document any issues that remain

**✅ Task 1 Complete When:**
- Console logs show full data flow
- Web search toggle confirmed working
- Cover letter includes company address and web research info

---

## Task 2: Email Panel Fixes

**Priority:** 🔴 HIGH  
**Estimated Complexity:** Easy  
**Dependencies:** None

### Part A: Fix "Copy" Button to Include Subject Line

**Current Issue:** Copy button only copies email body, not the subject line.

1. Find the copy button component for email panel
2. Modify to copy both subject AND body in this format:
```
Subject: [Subject Line]

[Email Body]
```
3. Test the copy functionality

### Part B: Fix "Open in Mail" Button

**Current Issue:** Clicking "Open in Mail" opens a blank page instead of the user's email client with pre-filled content.

1. Find the "Open in Mail" button component
2. Verify it uses the `mailto:` protocol correctly
3. Correct implementation:
```javascript
const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
window.location.href = mailtoLink;
// OR
window.open(mailtoLink, '_blank');
```
4. Test with Gmail and Outlook (web and desktop)
5. Handle edge cases:
   - Long email bodies (URL length limits)
   - Special characters in subject/body

### Part C: Add Email Tips Item

**Goal:** Add one more tip to the "Tips for sending the email" section.

Add this tip:
> "Attach your relevant certifications mentioned in your CV to strengthen your application."

1. Find the email tips component
2. Add the new tip to the list
3. Ensure consistent styling with other tips

**✅ Task 2 Complete When:**
- Copy button copies both subject and body
- Open in Mail correctly opens email client with pre-filled subject and body
- New certification tip appears in tips section

---

## Task 3: CV PDF Page Break Fix

**Priority:** 🔴 HIGH  
**Estimated Complexity:** Medium  
**Dependencies:** None

### Problem Description

When downloading the CV as PDF, if a section (like Professional Experience) is too long:
- The entire section moves to the next page
- This leaves a huge empty gap on the previous page (see attached screenshots)

**Expected Behavior:** Sections should flow naturally across pages. If a section doesn't fit completely on one page, it should start on the current page and continue on the next page.

### Part A: Diagnose the Issue

1. Identify the PDF generation library used (e.g., html2pdf, jsPDF, puppeteer, etc.)
2. Check current CSS/styling for page breaks
3. Look for any `page-break-inside: avoid` or `break-inside: avoid` rules

### Part B: Fix Page Break CSS

Add or modify these CSS rules for PDF generation:

```css
/* Allow sections to break across pages */
.cv-section {
  page-break-inside: auto;
  break-inside: auto;
}

/* Prevent orphaned headers - keep heading with at least some content */
.section-header {
  page-break-after: avoid;
  break-after: avoid;
}

/* Prevent single lines at bottom of page */
p, li {
  orphans: 2;
  widows: 2;
}

/* Individual experience/education items can break if needed */
.experience-item, .education-item {
  page-break-inside: auto;
  break-inside: auto;
}
```

### Part C: Apply Fix to All Three Templates

Apply the page break fix to:
1. Template 1 (whatever the current default is)
2. Template 2
3. Template 3

Ensure consistent behavior across all templates.

### Part D: Test PDF Generation

1. Create a test CV with a long Professional Experience section
2. Generate PDF
3. Verify:
   - No large empty gaps between pages
   - Sections flow naturally across page breaks
   - Section headers stay with their content
   - All three templates work correctly

**✅ Task 3 Complete When:**
- All three templates generate PDFs without large empty gaps
- Sections break naturally across pages
- Tested with long CVs (2+ pages)

---

## Task 4: German Language Support

**Priority:** 🟡 MEDIUM  
**Estimated Complexity:** Medium-Hard  
**Dependencies:** None

### Goal
Enable the system to:
1. Automatically detect German job descriptions and generate German output
2. Allow users to explicitly request German output regardless of job description language

### Part A: Update Writer Agent System Prompt

Add these instructions to the writer agent:

```
LANGUAGE DETECTION AND GENERATION RULES:

1. AUTOMATIC DETECTION:
   - Analyze the job description language
   - If job description is in German → Generate CV, cover letter, and email in German
   - If job description is in English → Generate CV, cover letter, and email in English

2. USER OVERRIDE:
   - If user explicitly says "generate in German" or "auf Deutsch" → Generate in German
   - If user explicitly says "generate in English" → Generate in English
   - User's explicit instruction overrides automatic detection

3. CONSISTENCY:
   - All three outputs (CV, cover letter, email) must be in the SAME language
   - Do not mix languages within a single document
```

### Part B: Create German CV Template

Create a German CV template with these German section headers:

| English | German |
|---------|--------|
| Professional Summary | Berufliches Profil |
| Core Competencies | Kernkompetenzen |
| Professional Experience | Berufserfahrung |
| Education | Ausbildung |
| Certifications | Zertifizierungen |
| Skills | Fähigkeiten |
| Languages | Sprachkenntnisse |

**Additional German CV Requirements:**
1. Include photo placeholder (standard for German CVs)
2. Connect to the photo upload feature in Documents page
3. Standard photo size: 45mm x 55mm (German passport photo style)
4. Photo position: Top right corner of CV

### Part C: Connect Photo Upload to German Template

1. Find the photo upload component in Documents page
2. Store the uploaded photo in user's profile/documents
3. When generating German CV:
   - Retrieve the uploaded photo
   - Insert into the German template at correct position
   - Ensure photo renders in PDF download

### Part D: Template Selection Logic

Implement logic to select correct template:

```javascript
function selectCVTemplate(language) {
  if (language === 'de') {
    return 'german-template';
  }
  // Default to existing English templates
  return 'english-template';
}
```

### Part E: Test German Generation

1. Test with German job description → Should auto-generate in German
2. Test with English job description + user says "generate in German" → Should generate in German
3. Test photo upload and rendering in German CV
4. Verify PDF download includes photo correctly

**✅ Task 4 Complete When:**
- German job descriptions trigger German output automatically
- User can override with explicit language request
- German CV template exists with correct section names
- Photo uploads render correctly in German CV PDF

---

## Task 5: Chat Panel UI Improvements

**Priority:** 🟡 MEDIUM  
**Estimated Complexity:** Easy  
**Dependencies:** None

### Part A: Replace AI Response Avatar

**Current Issue:** The Karko logo as AI avatar doesn't display clearly (see Image 1 - red highlighted area).

**Solution:** Replace with a clean AI/sparkle icon.

1. Create or source an icon:
   - Sparkle icon or AI robot icon
   - Colors: Use Karko brand colors (primary gradient Cyan #0EA5E9 to Emerald #10B981)
   - Size: 32x32 or 40x40 pixels
   - Style: Clean, minimal, modern

2. Replace the avatar component
3. Test visibility on different backgrounds

### Part B: Add "Start New Application" Flow

**Current Issue:** After completing an application, users need guidance on starting fresh.

After "View Email" button, add:

1. **Text message:**
   > "To start a new application, please begin a new chat. Each job application requires a fresh conversation for optimal results."

2. **Clickable bubble button:**
   > "🚀 Start New Application"

3. When clicked → Start new chat (same behavior as the "+" button or new chat action)

**Implementation:**
```jsx
// After View Email button
<p className="text-gray-600 mt-4">
  To start a new application, please begin a new chat. 
  Each job application requires a fresh conversation for optimal results.
</p>
<button 
  onClick={startNewChat}
  className="mt-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white rounded-lg"
>
  🚀 Start New Application
</button>
```

**✅ Task 5 Complete When:**
- AI avatar is a clean, visible sparkle/AI icon with brand colors
- "Start New Application" text and button appear after View Email
- Button correctly starts a new chat

---

## Task 6: Pricing & Credit System Overhaul

**Priority:** 🟡 MEDIUM  
**Estimated Complexity:** Hard  
**Dependencies:** None

### New Pricing Structure

| Plan | Old Price | New Price | Old Credits | New Credits | Old Apps | New Apps |
|------|-----------|-----------|-------------|-------------|----------|----------|
| Starter (Free) | Free | Free | 10 | 6 | 5 | 3 |
| Plus | $19.99/mo | $19.99/mo | 200 | 120 | 100 | 60 |
| Pro | $39.99/mo | $39.99/mo | 300 | 240 | 150 | 120 |

### New Add-On Credit Packages

Calculate based on Plus plan rate ($19.99 for 120 credits ≈ $0.17/credit):

| Package | Credits | Price |
|---------|---------|-------|
| Small | 30 | $4.99 |
| Medium | 60 | $9.99 |
| Large | 120 | $19.99 |

### Part A: Update Landing Page / Pricing Section

1. Update displayed credit amounts
2. Update displayed application counts
3. Change "Start free - 5 applications" → "Start free - 3 applications" on all CTA buttons
4. Remove "CV only optimization - 1 credit" from "How Credits Work" section (this feature doesn't exist)

### Part B: Update Settings/Subscription Page

1. Update credit indicator components
2. Update pricing plans display
3. Ensure consistency with landing page

### Part C: Update Supabase Backend

1. Update credit allocation in subscription tiers
2. Modify any SQL schemas or functions that reference old credit amounts
3. Generate migration SQL if needed:

```sql
-- Example migration (adjust based on actual schema)
UPDATE subscription_tiers SET credits = 6, applications = 3 WHERE tier_name = 'starter';
UPDATE subscription_tiers SET credits = 120, applications = 60 WHERE tier_name = 'plus';
UPDATE subscription_tiers SET credits = 240, applications = 120 WHERE tier_name = 'pro';
```

### Part D: Implement Add-On Credits Purchase

1. Check if add-on credit purchase UI exists
2. If not, create it in user account/settings
3. Connect to payment processor (Stripe?)
4. Add Supabase tables/functions for credit add-ons

### Part E: Update FAQ Section

Update any FAQ content that references:
- Old credit amounts
- Old application limits
- Old pricing
- "CV only optimization" (remove references)

### Part F: Test Credit System

1. Test free tier signup → Verify 6 credits, 3 applications
2. Test Plus subscription → Verify 120 credits, 60 applications
3. Test Pro subscription → Verify 240 credits, 120 applications
4. Test add-on credit purchase flow
5. Verify credit deduction works correctly

**✅ Task 6 Complete When:**
- All UI displays new credit/application amounts
- Supabase correctly allocates new amounts
- Add-on credit purchase works
- FAQ is updated
- "CV only optimization" removed from all references

---

## Task 7: Master CV Page Creation

**Priority:** 🟢 LOW  
**Estimated Complexity:** Medium  
**Dependencies:** None

### Goal
Create a new page explaining Master CV and providing the prompt for users to copy.

### Part A: Add Navigation Item

1. Add "Master CV" to the header navigation
2. Route: `/master-cv`
3. Position: Logical place in nav (after Features? Before Pricing?)

### Part B: Create Page Layout

**Page Structure:**

```
[Header - Navigation]

[Hero Section]
- Title: "Create Your Master CV"
- Subtitle: "The complete skills inventory that powers hyper-personalized applications"

[Section 1: What is a Master CV?]
- Explanation of Master CV concept
- Comparison table: Regular CV vs Master CV

[Section 2: Why You Need One]
- Benefits list
- How Karko AI uses it

[Section 3: How to Create Your Master CV]
- Step-by-step instructions
- Supported chatbots (Claude, ChatGPT, Gemini)

[Section 4: The Prompt - COPYABLE]
- Styled code block or box
- Copy button
- The full prompt from Master_CV_Guide_Simple.md

[Section 5: What's Included]
- List of all sections in Master CV

[CTA Section]
- "Ready to create yours? Copy the prompt above and paste into any AI chatbot."
- Link to sign up / dashboard to upload

[Footer]
```

### Part C: Content from Master_CV_Guide_Simple.md

Use the content from the uploaded document:
- Part 1 (What is Master CV, Why You Need One, What's Included) → Explanatory sections
- Part 2 (The Prompt) → The copyable prompt section

### Part D: Design Requirements

1. Match existing Karko AI website design
2. Brand colors: Cyan #0EA5E9, Emerald #10B981
3. Make the prompt box visually distinct:
   - Background: Light gray or code-style
   - Copy button: Prominent, with "Copied!" feedback
   - Font: Monospace for the prompt

### Part E: Copy Functionality

```javascript
const copyPrompt = async () => {
  await navigator.clipboard.writeText(masterCVPrompt);
  setCopied(true);
  setTimeout(() => setCopied(false), 2000);
};
```

**✅ Task 7 Complete When:**
- Master CV page exists at /master-cv
- Navigation link added to header
- All explanatory content from guide is included
- Prompt is easily copyable with copy button
- Page design matches Karko AI brand

---

## Summary: Task Order & Priority

| Order | Task | Priority | Estimated Time |
|-------|------|----------|----------------|
| 1 | Task 1: Web Search & Debugging | 🔴 HIGH | 2-3 hours |
| 2 | Task 2: Email Panel Fixes | 🔴 HIGH | 1 hour |
| 3 | Task 3: CV PDF Page Break | 🔴 HIGH | 1-2 hours |
| 4 | Task 5: Chat Panel UI | 🟡 MEDIUM | 1 hour |
| 5 | Task 4: German Language Support | 🟡 MEDIUM | 2-3 hours |
| 6 | Task 6: Pricing & Credits | 🟡 MEDIUM | 2-3 hours |
| 7 | Task 7: Master CV Page | 🟢 LOW | 1-2 hours |

**Total Estimated Time:** 10-15 hours

---

## Notes for Agent

- After completing each task, update the Progress Tracker at the top
- If blocked, document the issue and wait for user guidance
- Console logging is essential for Task 1 — do not skip
- Test each fix before marking complete
- If any task requires clarification, ask before proceeding
