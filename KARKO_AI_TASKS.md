# Karko AI - Bug Fixes & Feature Implementation Tasks

**Created:** 2026-02-03  
**Status:** Active  
**Context:** Follow-up from "Evaluating Karko AI job application output quality" conversation


# Karko AI - Remaining Tasks (Round 2)

**Created:** 2026-02-03  
**Status:** Active  
**Context:** Follow-up fixes for incomplete tasks from Round 1

---

## ⚠️ CRITICAL NOTICE TO AGENT

The previous implementation was marked as "complete" but multiple critical features are NOT WORKING. This document contains the specific fixes needed.

**Rules:**
1. Do NOT mark a task complete until you have TESTED it
2. Add console.log statements and VERIFY they appear in browser console
3. If you cannot find where to make a change, ASK before guessing
4. Read each instruction completely before implementing

---

## Progress Tracker

| Task | Status | Tested | Notes |
|------|--------|--------|-------|
| Task R1 | ⬜ Not Started | ⬜ | Web Search Fix (CRITICAL) |
| Task R2 | ⬜ Not Started | ⬜ | Email Panel - Open in Email |
| Task R3 | ⬜ Not Started | ⬜ | Chat Panel UI Fix |
| Task R4 | ⬜ Not Started | ⬜ | CV Template Rendering Fix |
| Task R5 | ⬜ Not Started | ⬜ | German Template Visibility |
| Task R6 | ⬜ Not Started | ⬜ | Settings Page Pricing Update |
| Task R7 | ⬜ Not Started | ⬜ | German Language Detection |
| Task R8 | ⬜ Not Started | ⬜ | Master CV Prompt Update |

---

## Task R1: Web Search Fix (CRITICAL)

**Problem:** Web search is NOT being called at all. The Anthropic API dashboard shows ZERO web search requests. Console logs show no `[WEB_SEARCH]` entries.

### The Root Cause

The web search tool configuration may be incorrect. Here is the CORRECT Anthropic web search configuration:

### Correct Anthropic Web Search Tool Configuration

```javascript
// The tool definition to pass to the API
const webSearchTool = {
  type: "web_search_20250305",
  name: "web_search",
  // Optional: restrict to specific domains
  // allowed_domains: ["example.com"],
  // Optional: block specific domains
  // blocked_domains: ["spam.com"],
  // Optional: user location for localized results
  // user_location: {
  //   type: "approximate",
  //   city: "Berlin",
  //   country: "DE"
  // }
};

// Example API call with web search enabled
const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022", // or your model
  max_tokens: 4096,
  tools: [webSearchTool],
  messages: [
    {
      role: "user",
      content: "Search for information about [company name] and include their address"
    }
  ]
});
```

### Web Search Response Structure

When web search is used, the response contains these block types:

```javascript
// Response content array can contain:
{
  type: "web_search_tool_result",
  tool_use_id: "string",
  content: [
    {
      type: "web_search_result",
      encrypted_content: "string", // The search result content
      page_age: "string",          // How old the page is
      title: "string",             // Page title
      url: "string"                // Source URL
    }
  ]
}

// Or an error:
{
  type: "web_search_tool_result_error",
  error_code: "invalid_tool_input" | "unavailable" | "max_uses_exceeded"
}
```

### Part A: Find Current Web Search Implementation

1. Search the codebase for:
   - `web_search`
   - `WebSearchTool`
   - `anthropic` API calls
   - Any search-related functions

2. Identify:
   - Where is the web search tool defined?
   - Is it using the correct `type: "web_search_20250305"`?
   - Is it being passed to the API call?

### Part B: Fix Web Search Tool Definition

Ensure the tool is defined EXACTLY like this:

```javascript
const tools = [
  {
    type: "web_search_20250305",
    name: "web_search"
  }
];
```

**COMMON MISTAKES TO CHECK:**
- ❌ Using `type: "web_search"` instead of `type: "web_search_20250305"`
- ❌ Not including the tool in the `tools` array
- ❌ Putting the tool in wrong format
- ❌ Web search toggle state not being read correctly

### Part C: Add Diagnostic Logging

Add these console logs to trace the ENTIRE flow:

```javascript
// Where web search toggle is read
console.log('[WEB_SEARCH] Toggle enabled:', isWebSearchEnabled);

// Where API call is made
console.log('[WEB_SEARCH] Tools being sent to API:', JSON.stringify(tools));

// After API response
console.log('[WEB_SEARCH] API response content types:', 
  response.content.map(block => block.type));

// Check for web search results
const webSearchResults = response.content.filter(
  block => block.type === 'web_search_tool_result'
);
console.log('[WEB_SEARCH] Found results:', webSearchResults.length);

// Log actual results
if (webSearchResults.length > 0) {
  console.log('[WEB_SEARCH] Results:', JSON.stringify(webSearchResults, null, 2));
}
```

### Part D: Verify Web Search Toggle Connection

The Web Search toggle in the chat input area must:
1. Update a state variable when toggled
2. That state must be read when making API calls
3. When enabled, the web search tool must be included in the `tools` array

```javascript
// Example of correct implementation
const makeAPICall = async (message) => {
  const tools = [];
  
  // Check if web search is enabled
  if (isWebSearchEnabled) {
    tools.push({
      type: "web_search_20250305",
      name: "web_search"
    });
    console.log('[WEB_SEARCH] Adding web search tool to request');
  }
  
  const response = await anthropic.messages.create({
    model: modelName,
    max_tokens: 4096,
    tools: tools.length > 0 ? tools : undefined,
    messages: [...]
  });
  
  return response;
};
```

### Part E: Pass Web Search Results to Writer Agent

After getting web search results, they must be passed to the writer agent:

```javascript
// Extract company info from web search results
const extractCompanyInfo = (webSearchResults) => {
  const companyInfo = {
    address: null,
    recentNews: [],
    description: null
  };
  
  // Parse web search results for company information
  webSearchResults.forEach(result => {
    if (result.content) {
      result.content.forEach(item => {
        // Look for address patterns, news, etc.
        // Add to companyInfo
      });
    }
  });
  
  return companyInfo;
};

// Pass to writer agent prompt
const writerPrompt = `
Company Information from Web Search:
- Address: ${companyInfo.address || 'Not found'}
- Recent News: ${companyInfo.recentNews.join(', ') || 'None found'}

Use this information in the cover letter header and body.
`;
```

### Testing Checklist

After implementation, test with web search enabled:

1. ⬜ Console shows `[WEB_SEARCH] Toggle enabled: true`
2. ⬜ Console shows `[WEB_SEARCH] Tools being sent to API: [{"type":"web_search_20250305"...`
3. ⬜ Console shows `[WEB_SEARCH] Found results: X` (where X > 0)
4. ⬜ Anthropic API dashboard shows web search usage
5. ⬜ Cover letter includes company address
6. ⬜ Cover letter includes company-specific information

---

## Task R2: Email Panel - Open in Email Fix

**Problem:** Clicking "Open in Email" button opens a blank page instead of the user's email client.

### Visual Reference (Button Location)

```
+------------------------------------------------------------------+
|  Application Email                                                |
|                                                                   |
|  [View] [Edit]    [Regenerate] [Copy All] [Open in Email] <--THIS |
|                                                                   |
|  SUBJECT LINE                                        [Copy]       |
|  +------------------------------------------------------------+  |
|  | E-Commerce Manager Application - Wasim Jalali...           |  |
|  +------------------------------------------------------------+  |
|                                                                   |
|  EMAIL BODY                                          [Copy]       |
|  +------------------------------------------------------------+  |
|  | Hello,                                                      |  |
|  | I'm applying for the E-Commerce Manager role...             |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

### The Fix

The `mailto:` link must be constructed correctly:

```javascript
// Find the Open in Email button click handler and replace with:

const handleOpenInEmail = () => {
  // Get subject and body from state
  const subject = emailSubject; // e.g., "E-Commerce Manager Application..."
  const body = emailBody;       // The full email body text
  
  // Encode for URL
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  
  // Construct mailto link
  // Note: Leave 'to' empty so user can add recipient
  const mailtoLink = `mailto:?subject=${encodedSubject}&body=${encodedBody}`;
  
  console.log('[EMAIL] Opening mailto link:', mailtoLink.substring(0, 100) + '...');
  
  // Open in same window (will trigger email client)
  window.location.href = mailtoLink;
};
```

### Common Mistakes to Check

1. ❌ Using `window.open(mailtoLink)` instead of `window.location.href`
2. ❌ Not encoding the subject and body with `encodeURIComponent`
3. ❌ Having empty subject or body variables
4. ❌ Button not connected to the handler function
5. ❌ Handler function throwing an error before mailto executes

### Add Debug Logging

```javascript
const handleOpenInEmail = () => {
  console.log('[EMAIL] Button clicked');
  console.log('[EMAIL] Subject:', emailSubject);
  console.log('[EMAIL] Body length:', emailBody?.length);
  
  if (!emailSubject || !emailBody) {
    console.error('[EMAIL] Missing subject or body!');
    return;
  }
  
  const mailtoLink = `mailto:?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
  console.log('[EMAIL] Mailto link created, length:', mailtoLink.length);
  
  window.location.href = mailtoLink;
};
```

### Testing Checklist

1. ⬜ Console shows `[EMAIL] Button clicked` when clicking the button
2. ⬜ Console shows subject and body are populated
3. ⬜ Email client opens (Gmail, Outlook, or default mail app)
4. ⬜ Subject line is pre-filled correctly
5. ⬜ Body is pre-filled correctly

---

## Task R3: Chat Panel UI Fix

**Problem:** The "Start New Application" instruction text is appearing in the WRONG location.

### Current (WRONG) Layout

```
+------------------------------------------+
| ✅ Analysis Complete!                     |
|                                          |
| Your CV has been optimized for this role.|
| Check the CV tab to review the changes.  |
| ─────────────────────────────────────────|  <-- This line should NOT be here
| To start a new application, please begin |  <-- This text should NOT be here
| a new chat. Each job application requires|
| a fresh conversation for optimal results.|
|                                          |
|    [View Optimized CV]                   |
|    [View Cover Letter]                   |
|    [View Email]                          |
|    [🚀 Start New Application]            |
+------------------------------------------+
```

### Correct Layout

```
+------------------------------------------+
| ✅ Analysis Complete!                     |
|                                          |
| Your CV has been optimized for this role.|
| Check the CV tab to review the changes.  |
|                                          |
|    [View Optimized CV]                   |
|    [View Cover Letter]                   |
|    [View Email]                          |
|                                          |
| To start a new application, please begin |  <-- Text comes AFTER View Email
| a new chat. Each job application requires|
| a fresh conversation for optimal results.|
|                                          |
|    [🚀 Start New Application]            |  <-- Button at the very end
+------------------------------------------+
```

### The Fix

Find the component that renders the completion message and restructure it:

```jsx
// CORRECT structure
const CompletionMessage = () => (
  <div className="completion-message">
    {/* Part 1: Success header */}
    <div className="success-header">
      <span>✅ Analysis Complete!</span>
    </div>
    
    {/* Part 2: Instructions */}
    <p>Your CV has been optimized for this role.</p>
    <p>Check the <strong>CV tab</strong> to review the changes.</p>
    
    {/* Part 3: Action buttons */}
    <div className="action-buttons">
      <button onClick={() => navigateTo('cv')}>
        📄 View Optimized CV
      </button>
      <button onClick={() => navigateTo('coverLetter')}>
        ✉️ View Cover Letter
      </button>
      <button onClick={() => navigateTo('email')}>
        📧 View Email
      </button>
    </div>
    
    {/* Part 4: New application guidance - MUST BE AFTER BUTTONS */}
    <div className="new-application-section">
      <p className="guidance-text">
        To start a new application, please begin a new chat. 
        Each job application requires a fresh conversation for optimal results.
      </p>
      <button onClick={startNewChat} className="start-new-btn">
        🚀 Start New Application
      </button>
    </div>
  </div>
);
```

### What to Remove

- Remove the horizontal line/divider between "Check the CV tab" and the buttons
- Remove any duplicate text that appears before the buttons

### Testing Checklist

1. ⬜ "Analysis Complete" message shows at top
2. ⬜ "Check the CV tab" text appears next
3. ⬜ Three view buttons appear (CV, Cover Letter, Email)
4. ⬜ Instructional text appears AFTER the three view buttons
5. ⬜ "Start New Application" button appears at the very end
6. ⬜ No horizontal line between elements

---

## Task R4: CV Template Rendering Fix

**Problem:** Changes made by the AI are showing in the "Changes Made" summary but NOT rendering in the actual CV template.

### Example of the Issue

The AI made these changes to Professional Experience:
- Expanded from 3 bullets to 6 bullets
- Added: "Managed complete e-commerce operations..."
- Added: "Analyzed customer behavior..."
- Added: "Specialized in FlatFile bulk listing..."
- Added: "Trained 50+ Amazon business founders..."

But the CV template only shows the original 3 bullets, not the expanded 6.

### Diagnosis Steps

1. Check where the optimized CV data is stored
2. Check where the CV template reads its data from
3. Verify they are reading from the SAME source

### Likely Cause

The CV template might be reading from `originalCV` instead of `optimizedCV`, or the optimized experience bullets are not being correctly parsed/stored.

### Console Log Evidence

The console shows:
```
[ParseOptimizedCV] Parsed 4 experience entries (after dedup)
```

But 4 entries might be the number of JOB positions, not the bullets within each position.

### Fix Approach

1. Add logging to see what data the template receives:

```javascript
// In the CV template component
console.log('[CV_TEMPLATE] Rendering with data:', {
  summary: cvData.summary?.substring(0, 50),
  experienceCount: cvData.experience?.length,
  firstExperienceBullets: cvData.experience?.[0]?.bullets?.length,
  allBullets: cvData.experience?.map(exp => ({
    company: exp.company,
    bulletCount: exp.bullets?.length
  }))
});
```

2. Compare with what the optimizer outputs:

```javascript
// After optimization
console.log('[OPTIMIZER] Generated experience:', {
  entriesCount: optimizedCV.experience.length,
  bullets: optimizedCV.experience.map(exp => ({
    company: exp.company,
    bullets: exp.bullets
  }))
});
```

3. If the data is correct but not rendering, check the template JSX:

```jsx
// Make sure you're mapping through bullets correctly
{experience.bullets && experience.bullets.map((bullet, index) => (
  <li key={index}>{bullet}</li>
))}
```

### Testing Checklist

1. ⬜ Console shows correct number of bullets in optimizer output
2. ⬜ Console shows same number of bullets in template input
3. ⬜ All 6 bullets render in the CV template
4. ⬜ PDF download includes all 6 bullets

---

## Task R5: German Template Visibility

**Problem:** The German CV template was supposedly created but is NOT showing in the template selector with the other 3 templates.

### What Should Exist

The template selector should show 4 options:
1. Template 1 (English - existing)
2. Template 2 (English - existing)
3. Template 3 (English - existing)
4. German Template (NEW - with photo support)

### Diagnosis Steps

1. Find where templates are defined/listed
2. Check if German template file exists
3. Check if it's added to the template list/array
4. Check if there's a filter excluding it

### Example Template Registry

```javascript
// templates/index.js or similar
export const CV_TEMPLATES = [
  {
    id: 'template-1',
    name: 'Modern',
    language: 'en',
    component: Template1
  },
  {
    id: 'template-2', 
    name: 'Classic',
    language: 'en',
    component: Template2
  },
  {
    id: 'template-3',
    name: 'Minimal',
    language: 'en',
    component: Template3
  },
  // THIS MUST BE ADDED:
  {
    id: 'template-german',
    name: 'Deutsch (mit Foto)',
    language: 'de',
    component: GermanTemplate,
    hasPhoto: true
  }
];
```

### Template Selector Component

```jsx
// Make sure ALL templates are shown, not filtered
const TemplateSelector = () => {
  return (
    <div className="template-grid">
      {CV_TEMPLATES.map(template => (
        <TemplateCard 
          key={template.id}
          template={template}
          onSelect={() => selectTemplate(template.id)}
        />
      ))}
    </div>
  );
};
```

### German Template Requirements

The German template must have:
- German section headers (Berufserfahrung, Ausbildung, etc.)
- Photo placeholder in top-right corner
- Photo size: ~35x45mm (passport style)
- Connection to document upload for photo

### Testing Checklist

1. ⬜ German template file exists in codebase
2. ⬜ German template is added to template registry
3. ⬜ Template selector shows 4 options
4. ⬜ German template has German section headers
5. ⬜ Photo placeholder is visible in German template

---

## Task R6: Settings Page Pricing Update

**Problem:** The "Compare Plans" section in Settings > Subscription still shows OLD pricing/credits.

### Visual Reference (Current WRONG State)

```
+------------------+------------------+------------------+
|     Starter      |      Plus        |       Pro        |
|     $0/mo        |    $19.99/mo     |    $39.99/mo     |
|                  |    [Popular]     |                  |
+------------------+------------------+------------------+
| ✓ 5 apps/month   | ✓ 80+ apps/month | ✓ 150+ apps/month|  <-- WRONG
| ✓ All templates  | ✓ Add-on credits | ✓ Add-on credits |
| ✓ CV+CL+Email    | ✓ 1mo rollover   | ✓ 2mo rollover   |
|                  | ✓ Priority       | ✓ Premium        |
+------------------+------------------+------------------+
```

### Required Update (CORRECT Values)

```
+------------------+------------------+------------------+
|     Starter      |      Plus        |       Pro        |
|     $0/mo        |    $19.99/mo     |    $39.99/mo     |
|                  |    [Popular]     |                  |
+------------------+------------------+------------------+
| ✓ 3 apps/month   | ✓ 60 apps/month  | ✓ 120 apps/month |  <-- CORRECT
| ✓ 6 credits      | ✓ 120 credits    | ✓ 240 credits    |
| ✓ All templates  | ✓ Add-on credits | ✓ Add-on credits |
| ✓ CV+CL+Email    | ✓ 1mo rollover   | ✓ 2mo rollover   |
|                  | ✓ Priority       | ✓ Premium        |
+------------------+------------------+------------------+
```

### Find and Update

Search for these strings and replace:
- "5 applications" → "3 applications"
- "80+ applications" → "60 applications"
- "150+ applications" → "120 applications"

Also add credit amounts if not shown:
- Starter: 6 credits
- Plus: 120 credits
- Pro: 240 credits

### Files to Check

1. Settings/Subscription page component
2. Pricing constants file
3. Any hardcoded values in the UI

### Testing Checklist

1. ⬜ Starter shows "3 applications/month" and "6 credits"
2. ⬜ Plus shows "60 applications/month" and "120 credits"
3. ⬜ Pro shows "120 applications/month" and "240 credits"
4. ⬜ Landing page pricing matches settings page pricing

---

## Task R7: German Language Detection Fix

**Problem:** When pasting a German job description, the AI still generates output in English instead of German.

### Required Behavior

1. If job description is in German → Generate all outputs in German
2. If job description is in English → Generate all outputs in English
3. User can override with explicit instruction

### Implementation

Add language detection to the context agent or early in the pipeline:

```javascript
// Simple language detection
const detectLanguage = (text) => {
  // German indicators
  const germanWords = ['und', 'der', 'die', 'das', 'für', 'mit', 'auf', 'ist', 'bei', 'zur', 'zum', 'wir', 'Sie', 'Ihre', 'haben', 'werden', 'können', 'Erfahrung', 'Kenntnisse'];
  
  // Count German words
  const words = text.toLowerCase().split(/\s+/);
  const germanCount = words.filter(word => 
    germanWords.some(gw => word.includes(gw.toLowerCase()))
  ).length;
  
  // If more than 10% of words are German indicators, it's German
  const ratio = germanCount / words.length;
  
  console.log('[LANGUAGE] Detection ratio:', ratio, 'German words found:', germanCount);
  
  return ratio > 0.1 ? 'de' : 'en';
};
```

### Update Writer Agent Prompt

Add to the writer agent system prompt:

```
LANGUAGE RULES:

1. DETECT the language of the job description.
2. If the job description is in German (contains German words like "wir suchen", "Ihre Aufgaben", "Anforderungen"):
   - Write the CV content in German
   - Write the cover letter in German
   - Write the email in German
   - Use German date format (DD.MM.YYYY)
   - Use German section headers for CV

3. If the job description is in English:
   - Write all outputs in English
   - Use standard date format

4. USER OVERRIDE: If the user explicitly says "generate in German" or "auf Deutsch", 
   use German regardless of job description language.

5. ALL THREE OUTPUTS (CV, cover letter, email) must be in the SAME language.
```

### Pass Language to Writer Agent

```javascript
// In the orchestration code
const jobLanguage = detectLanguage(jobDescription);
console.log('[LANGUAGE] Detected language:', jobLanguage);

// Pass to writer agent
const writerContext = {
  ...otherContext,
  outputLanguage: jobLanguage,
  useGermanTemplate: jobLanguage === 'de'
};
```

### Testing Checklist

1. ⬜ Paste German job description → All outputs in German
2. ⬜ Paste English job description → All outputs in English
3. ⬜ Console shows `[LANGUAGE] Detected language: de` for German
4. ⬜ German output uses German CV template
5. ⬜ German cover letter has proper German format (place, date format)

---

## Task R8: Master CV Prompt Update

**Problem:** The Master CV page exists but needs the prompt content updated to the correct version.

### Location

Find the Master CV page and the section containing the copyable prompt.

### Replace Prompt With This

Replace the current prompt content with the following (this is the COMPLETE prompt):

```
You are helping me create a Master CV — a complete inventory of my professional background. This is NOT a regular CV to send to employers. It's a detailed reference document (5-10 pages) that an AI job application tool will use to generate tailored applications for me.

=== YOUR INSTRUCTIONS ===

1. Ask me questions ONE SECTION AT A TIME
2. After each section, summarize what I told you before moving on
3. Ask follow-up questions to get specific METRICS (revenue, followers, percentages, time saved, etc.)
4. At the end, compile everything into the structured format below
5. Remind me to verify all information before using it

=== RULES ===

- Only include FACTS — no future plans or aspirations
- Every achievement needs a NUMBER if possible
- Include YEARS OF EXPERIENCE for each skill
- Length: 5-10 pages, 3,000-7,000 words (max 15 pages / 15,000 words)
- No marketing language ("passionate", "driven", "dynamic")
- Help me identify my PROFESSIONAL MINDSET (see mindset types below)

=== SECTIONS TO COVER ===

**Section 1: Personal Information**
- Full name, date of birth, nationality
- Current location, email, phone
- Driver's license, work authorization
- Open to relocation? Which cities?

**Section 2: Professional Mindset**
- How do you approach work? (Ask me questions to identify my type)
- What do you do when you face a problem?
- Have you ever BUILT something to solve a problem?
- How do you learn new skills?

Mindset types to identify:
- Builder Mindset: Creates solutions when facing problems (prove with projects built)
- Growth Mindset: Constantly learning and improving (prove with skills learned)
- Analytical Mindset: Makes data-driven decisions (prove with examples)
- Entrepreneurial Mindset: Takes initiative and ownership (prove with businesses/projects led)
- Problem-Solver Mindset: Finds solutions others miss (prove with specific outcomes)
- Systems Mindset: Creates processes and frameworks (prove with systems implemented)

**Section 3: Work Experience**
For EACH job, ask:
- Job title, company name, location, dates
- Main responsibilities
- ACHIEVEMENTS WITH NUMBERS: revenue, costs saved, growth %, projects completed, team size, etc.
- Tools and technologies used
- Problems solved

**Section 4: Projects (Side projects, things built, businesses started)**
For EACH project, ask:
- Project name
- What PROBLEM were you solving?
- What did you BUILD?
- What technology/tools?
- What was the RESULT? (with numbers)

**Section 5: Education**
- Degree, institution, location, year
- Final grade/GPA
- Notable achievements

**Section 6: Certifications**
For EACH certification:
- Exact name, issuer, date
- Expiration date (if any)
- Certificate ID or verification link

**Section 7: Skills**
Ask about skills in categories:
- Technical/Development (with years)
- AI & Automation (with years)
- Marketing (with years)
- Business/Operations (with years)
- Soft skills

**Section 8: Languages**
For EACH language:
- Language, level (Native/Fluent/Intermediate/Basic)
- Certification and score (if any)

**Section 9: Quantified Achievements**
Compile ALL metrics mentioned into one table.
Ask: "Any other achievements with specific numbers?"

**Section 10: Available Documents**
- CV versions (languages?)
- Certificates as documents
- Portfolio/GitHub
- Professional photo

=== OUTPUT FORMAT ===

Structure the final document exactly like this:

---

# [Full Name] — Master CV (Skills & Experience Inventory)

**Purpose:** Factual reference document for job applications.
**Last Updated:** [Date]

---

## Personal Information

- **Full Name:** [X]
- **Date of Birth:** [X]
- **Nationality:** [X]
- **Location:** [X]
- **Email:** [X]
- **Phone:** [X]
- **Driver's License:** [X]
- **Work Authorization:** [X]
- **Relocation:** [X]

---

## Professional Mindset — [Type] Approach

*[One sentence describing their approach]*

### How This Shows in My Work:

**Example 1:** [Problem faced] → [What they did] → [Result with metric]
**Example 2:** [Problem faced] → [What they did] → [Result with metric]

### Ready-to-Use Framing for Applications:

**For Technical Roles:** "[Sentence they can use]"
**For Business Roles:** "[Sentence they can use]"
**For Startup Roles:** "[Sentence they can use]"

---

## Projects

### [Project Name]
**[Date Range]**

- **Problem:** [What they were solving]
- **Solution:** [What they built]
- **Technology:** [Stack used]
- **Results:** [Metrics]

---

## Professional Experience

### [Job Title] | [Company Name]
**[Location] | [Start Date] – [End Date]**

- [Achievement with metric]
- [Achievement with metric]
- Tools: [List]

---

## Education

### [Degree]
**[Institution] — [Location] | [Year]**

- Grade: [X]
- Notable: [X]

---

## Certifications

### [Category]

| Certification | Issuer | Date | ID |
|---------------|--------|------|-----|
| [Name] | [Issuer] | [Date] | [ID] |

---

## Skills Inventory

### [Category]
- [Skill] ([X] years)
- [Skill] ([X] years)

---

## Languages

| Language | Level | Certification |
|----------|-------|---------------|
| [X] | [X] | [X] |

---

## Quantified Achievements

| Achievement | Metric | Context |
|-------------|--------|---------|
| [X] | [X] | [X] |

---

## Documents Available

1. [Document]
2. [Document]

---

## Notes for Application Systems

- **Primary Mindset:** [X]
- **Primary Strength:** [X]
- **Differentiator:** [X]
- **Availability:** [X]

---

## ⚠️ Verification Checklist

Before using this Master CV, verify:
- [ ] All dates are correct
- [ ] All metrics are accurate
- [ ] All certification IDs are valid
- [ ] All skills can be demonstrated

**Verified by:** _________________ **Date:** _____________

---

*This document contains only verified, factual information.*

---

=== NOW START ===

Begin by asking me Section 1: Personal Information.
```

### Testing Checklist

1. ⬜ Master CV page loads correctly
2. ⬜ Prompt content matches the above exactly
3. ⬜ Copy button works and copies full prompt
4. ⬜ "Copied!" feedback appears when copied

---

## Summary: Priority Order

| Priority | Task | Issue |
|----------|------|-------|
| 🔴 1 | R1 | Web search not working AT ALL |
| 🔴 2 | R2 | Open in Email opens blank page |
| 🔴 3 | R4 | CV changes not rendering in template |
| 🟡 4 | R3 | Chat UI layout wrong |
| 🟡 5 | R6 | Settings pricing shows wrong values |
| 🟡 6 | R5 | German template not visible |
| 🟡 7 | R7 | German language detection not working |
| 🟢 8 | R8 | Master CV prompt update |

---

## Final Notes

- Test EVERY fix before marking complete
- Check browser console for the log statements
- If a fix doesn't work on first attempt, add more logging to diagnose
- Update the Progress Tracker after each task
- Ask for clarification rather than guessing

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
