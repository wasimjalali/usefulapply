# Karko AI - Critical Bug Fixes (Round 3)

**Created:** 2026-02-03  
**Status:** ✅ ALL FIXES COMPLETE  
**Engineer:** Cascade AI

---

## Progress Tracker

| Task | Status | File(s) Modified |
|------|--------|------------------|
| F1 - CV Template Bullet Points | ✅ Complete | `parse-optimized-cv.ts` |
| F2 - Web Search → Cover Letter | ✅ Complete | `writer-agent.ts` (address handling improved) |
| F3 - Chat Panel Layout | ✅ Complete | `ChatPanel.tsx` |
| F4 - Open in Email | ✅ Complete | `EmailPanel.tsx` |
| F5 - Language Detection | ✅ Complete | `writer-agent.ts` |
| F6 - Remove Cert IDs from CV | ✅ Complete | `parse-optimized-cv.ts`, `writer-agent.ts` |

---

## Issue Analysis

### F1: CV Template Missing Bullet Points

**Problem:** The rendered CV shows job titles but bullet points are missing for most entries (except Volunteer Translator).

**Root Cause Analysis:**
1. The parser in `parse-optimized-cv.ts` uses `|` character to detect new job entries
2. If the AI's output format varies (e.g., missing `|` separator), bullets won't attach to the correct entry
3. The console logs show "7 experience entries (after dedup)" but bullets aren't rendering

**Fix Strategy:**
- Improve the experience parsing logic to handle multiple formats
- Add debug logging to track bullet extraction
- Ensure bullets array is always passed to template components

### F2: Web Search Data Not Reaching Cover Letter

**Problem:** Web search API is called but company address shows only "Germany" instead of actual address.

**Root Cause Analysis:**
1. Claude web search IS being called and returning data
2. Address is formatted in `context-agent.ts` lines 311-318
3. The issue is the formatted address may be undefined if source fields are empty
4. Writer agent receives `companyResearch?.address` which may be undefined

**Fix Strategy:**
- Add more robust address extraction from web search results
- Ensure address is passed through the entire chain
- Add fallback text explaining no address was found

### F3: Chat Panel Layout

**Problem:** "Start New Application" hint text is in a bubble above the button, should be plain text below.

**Current (WRONG):**
```
[View Optimized CV]
[View Cover Letter]  
[View Email]
[💡 To start a new... ] <-- In a bubble/button style
[🚀 Start New Application]
```

**Correct:**
```
[View Optimized CV]
[View Cover Letter]
[View Email]
[🚀 Start New Application]
To start a new application, begin a new chat. <-- Plain text, no bubble
```

**Fix:** In `ChatPanel.tsx` line 533, change the hint from an action to plain text after the button.

### F4: Open in Email Button

**Problem:** Button opens blank page instead of email client.

**Analysis:** The code in `EmailPanel.tsx` lines 140-159 looks correct. Issue might be:
1. Email subject/body is undefined when button is clicked
2. The mailto link is too long (browser limit ~2000 chars)
3. Need to verify the state is populated

**Fix Strategy:**
- Add more debug logging
- Add user-visible error message if email data missing
- Truncate body if too long for mailto

### F5: Language Detection Not Working

**Problem:** German job descriptions produce English output.

**Root Cause:**
1. Language IS detected in `context-agent.ts` line 86-88
2. The detected language is stored in `context.detectedLanguage`
3. BUT the writer agent prompts don't use this to change output language

**Fix:** Update writer agent prompts to check `detectedLanguage` and generate content in the appropriate language.

### F6: Certification IDs in CV

**Problem:** CV shows certification IDs like "ID: b2a13065-a357..." which looks unprofessional.

**Fix:** 
1. Update `parseCertificationsSection` to strip ID patterns
2. Update writer agent prompt to NOT include certification IDs
3. Update templates to not render ID fields

---

## Implementation Order

1. **F1 - Bullet Points** (Critical - CV unusable without this)
2. **F3 - Chat Layout** (Quick fix)
3. **F5 - Language Detection** (Important for German market)
4. **F6 - Cert IDs** (Quick fix)
5. **F2 - Web Search** (Requires more investigation)
6. **F4 - Email** (Needs testing to confirm fix)

---

## Detailed Fixes

### F1: Experience Parsing Fix

The issue is in `parseExperienceSection()` - it only creates new entries when it finds a line with `|`. But if the AI formats entries differently, bullets get lost.

**Enhanced parsing logic:**
1. Detect new entries by multiple patterns: `|`, date patterns, company names
2. Track current entry and accumulate bullets
3. Better line classification (is this a header, date, or bullet?)

### F3: Chat Panel Fix

Change line 533 from action to plain hint text that renders after the button, not as a button itself.

### F5: Language Detection Fix

Add language instructions to the writer agent prompts:
- If `context.detectedLanguage === 'de'`, all output in German
- Use German section headers, date formats, salutations

### F6: Certification ID Fix

Add regex to strip ID patterns:
- `ID: [alphanumeric-]+`
- Certificate verification codes
- Long alphanumeric strings that look like IDs

---

## Testing Checklist

After each fix:
1. Clear browser cache
2. Run fresh application with test job description
3. Check console for log statements
4. Verify fix visually
5. Test PDF download if applicable

---

## Files to Modify

1. `/src/lib/cv-parser/parse-optimized-cv.ts` - F1, F6
2. `/src/components/ChatPanel.tsx` - F3
3. `/src/components/EmailPanel.tsx` - F4
4. `/src/lib/agents/writer-agent.ts` - F2, F5, F6
5. `/src/lib/agents/context-agent.ts` - F2
6. `/src/components/cv-templates/*.tsx` - F1 (if needed)
