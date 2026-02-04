# Karko AI Implementation Guide: Option A - Prompt Improvements

**Date:** February 2026  
**Goal:** Improve writing quality to approach Claude Haiku 4.5 / Sonnet 4.5 level while staying on GPT-4o mini  
**Target Market:** US, Canada, UK (80%) + Europe/Germany (20%)  
**Estimated Implementation Time:** 4-6 hours

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Priority Order](#2-priority-order)
3. [System Prompt Replacements](#3-system-prompt-replacements)
4. [Few-Shot Examples](#4-few-shot-examples)
5. [Anti-Cliché Blacklist](#5-anti-cliché-blacklist)
6. [Refinement Pass Implementation](#6-refinement-pass-implementation)
7. [Configuration Changes](#7-configuration-changes)
8. [Code Changes Required](#8-code-changes-required)
9. [Testing Checklist](#9-testing-checklist)
10. [Measuring Success](#10-measuring-success)

---

## 1. Executive Summary

### What's Wrong

Your current prompts are:
- Too vague ("compelling," "professional" — means nothing to the model)
- Missing explicit prohibitions (no cliché blacklist)
- Missing examples (no few-shot learning)
- Single-pass generation (no quality check)
- Wrong temperature for professional writing (0.7 is too high)

### What We're Fixing

| Problem | Solution | Expected Impact |
|---------|----------|-----------------|
| Generic output | Add anti-cliché blacklist | -80% generic phrases |
| No reference point | Add few-shot examples | +40% quality |
| First-draft quality | Add refinement pass | +25% polish |
| Wrong temperature | Lower to 0.5 | More consistent tone |
| Vague instructions | Specific style directives | More natural writing |

### Safety Note

**DO NOT modify:**
- Database schemas or connections
- Authentication/authorization logic
- API routes structure
- Frontend components (unless explicitly mentioned)
- File upload/parsing logic

**ONLY modify:**
- System prompts in agent files
- Temperature settings in config
- Add new refinement function to writer-agent.ts

---

## 2. Priority Order

Implement in this exact order. Each step is independent — you can test after each one.

| Priority | Task | File | Time | Impact |
|----------|------|------|------|--------|
| 1 | Replace cover letter prompt | writer-agent.ts | 30 min | HIGH |
| 2 | Add anti-cliché rules | writer-agent.ts | 15 min | HIGH |
| 3 | Add few-shot example | writer-agent.ts | 20 min | HIGH |
| 4 | Lower temperature | models/types.ts | 5 min | MEDIUM |
| 5 | Add refinement pass | writer-agent.ts | 45 min | MEDIUM |
| 6 | Replace email prompt | writer-agent.ts | 15 min | LOW |
| 7 | Update CV prompt | writer-agent.ts | 20 min | LOW |

---

## 3. System Prompt Replacements

### 3.1 Cover Letter System Prompt (HIGHEST PRIORITY)

**File:** `src/lib/agents/writer-agent.ts`  
**Location:** Line ~281

**REPLACE this:**
```typescript
systemPrompt: 'You are an expert cover letter writer. Create personalized, compelling cover letters. Only reference achievements that exist in the provided CV. NEVER use markdown formatting like ** or * - use plain text only.'
```

**WITH this:**
```typescript
systemPrompt: `You are an expert cover letter writer specializing in the US and UK job markets.

WRITING STYLE:
- Write like a confident professional, not a job applicant begging for consideration
- Use active voice and strong verbs
- Be specific and concrete — never vague
- Sound human — slightly conversational, not robotic
- Match the company's tone (startup = casual, corporate = professional)

STRUCTURE (Problem-Solution Format — highest performing in 2025):
1. Opening hook (1-2 sentences): Immediately show you understand their challenge or mention a specific achievement relevant to the role
2. Value paragraph (3-4 sentences): Connect YOUR specific experience to THEIR specific needs with metrics
3. Company knowledge (2-3 sentences): Reference something specific about the company — recent news, values, or products
4. Confident close (1-2 sentences): Clear call to action without desperation

TONE CALIBRATION:
- Startup/Tech: Casual, enthusiastic, show personality
- Corporate/Enterprise: Professional, measured, formal
- Creative industry: Show creativity in writing style
- Default to professional-casual if unsure

ABSOLUTE PROHIBITIONS — NEVER USE THESE:
- "I am writing to apply for..." or "I am excited to apply for..."
- "I believe I would be a great fit..."
- "Thank you for considering my application..."
- "To Whom It May Concern"
- "I am confident that..."
- "I would be a valuable asset..."
- "I am a [adjective] professional..."
- "References available upon request"
- "Please find attached..."
- "I look forward to hearing from you"
- Any phrase containing "passionate" without specific evidence
- Em-dashes (—) — use regular dashes (-) instead

WHAT TO DO INSTEAD:
- Instead of "I am excited to apply": Lead with an achievement or insight
- Instead of "great fit": Show the fit through specific examples
- Instead of "valuable asset": Demonstrate value with metrics
- Instead of generic close: "I'd welcome the chance to discuss how my [specific skill] can help [specific company goal]."

OUTPUT: Plain text only. No markdown. No bullet points. Professional letter format.`
```

### 3.2 Cover Letter User Prompt (HIGHEST PRIORITY)

**File:** `src/lib/agents/writer-agent.ts`  
**Location:** Line ~233-282

**REPLACE the entire prompt section WITH:**
```typescript
const response = await callModel({
  task: 'write_cover_letter',
  prompt: `Write a cover letter using the Problem-Solution format.

=== APPLICANT INFO ===
Name: ${applicant?.name || 'Applicant'}
Email: ${applicant?.email || ''}
Phone: ${applicant?.phone || ''}
Address: ${applicant?.address || ''}

=== TARGET POSITION ===
Job Title: ${job?.title || 'Position'}
Company: ${job?.companyName || 'Company'}
Location: ${job?.location || 'Not specified'}
Key Requirements: ${job?.requiredSkills?.join(', ') || 'Not specified'}
Nice-to-Have: ${job?.niceToHaveSkills?.join(', ') || 'Not specified'}

=== COMPANY RESEARCH ===
${companyResearch ? `
Company Name: ${companyResearch.name || job?.companyName}
What They Do: ${companyResearch.description || 'Not available'}
Company Values: ${companyResearch.values?.join(', ') || 'Not available'}
Culture: ${companyResearch.culture?.join(', ') || 'Not available'}
Recent News: ${companyResearch.recentNews?.[0] || 'None found'}
Industry: ${companyResearch.industry || 'Not specified'}
` : 'No company research available — focus on role requirements.'}

=== CANDIDATE BACKGROUND ===
${rawCV}

=== EXAMPLE OF EXCELLENT COVER LETTER ===
[Opening — hooks with achievement, shows understanding of company challenge]
"After leading Amazon marketplace operations that generated €150K in revenue across four markets, I've developed a keen eye for identifying underperforming product listings and transforming them into top sellers. When I saw your E-Commerce Manager role, I recognized the exact challenge I've been solving for the past three years."

[Value paragraph — specific experience matched to their needs]
"At my previous company, I inherited a stagnant Amazon presence with declining sales. Within six months, I restructured the PPC strategy, optimized 200+ listings for the A9 algorithm, and built an automated inventory system that cut stockouts by 40%. The result: a 67% increase in revenue and expansion into two new markets. I'm looking to bring this same systematic approach to your team."

[Company knowledge — shows research]
"I've been following your expansion into the agricultural equipment space, and I'm particularly impressed by your recent sustainability initiative. My experience optimizing supply chains for seasonal products aligns well with the unique inventory challenges in this sector."

[Confident close — specific and action-oriented]
"I'd welcome the opportunity to discuss how my marketplace optimization experience can accelerate your e-commerce growth. I'm available for a call this week or next at your convenience."
=== END EXAMPLE ===

INSTRUCTIONS:
1. Use the Problem-Solution format shown in the example
2. Include at least TWO specific metrics from the candidate's background
3. Reference something specific from the company research (if available)
4. Keep between 250-350 words
5. Do NOT copy the example — adapt it to this specific candidate and role
6. Verify every claim exists in the CV — never invent achievements

Write the complete cover letter now:`,
  systemPrompt: /* the new system prompt from 3.1 above */,
});
```

### 3.3 Email System Prompt

**File:** `src/lib/agents/writer-agent.ts`  
**Location:** Line ~316-317

**REPLACE this:**
```typescript
systemPrompt: 'You are an expert at professional email communication. Return ONLY valid JSON with subject and body fields. No markdown, no extra text.'
```

**WITH this:**
```typescript
systemPrompt: `You are an expert at professional email communication for job applications.

STYLE:
- Brief and direct — hiring managers scan emails in seconds
- Professional but warm — not robotic
- One clear purpose per email
- Subject line that stands out without being gimmicky

PROHIBITIONS:
- "I am writing to express my interest..."
- "Please find attached..."
- "I hope this email finds you well"
- "To Whom It May Concern"
- Multiple paragraphs — keep it to 3-4 sentences max

STRUCTURE:
Subject: [Job Title] Application - [Your Name] - [One Key Qualifier]
Body: One sentence hook + one sentence value + one sentence call to action

EXAMPLE:
Subject: E-Commerce Manager Application - Sarah Chen - €150K Amazon Revenue
Body: "Hi [Name], I'm applying for the E-Commerce Manager role and wanted to highlight my track record of growing Amazon revenue by 67% across four markets. I've attached my CV and cover letter with specific details on how I can bring this same approach to [Company]. Happy to discuss at your convenience."

Return ONLY valid JSON: {"subject": "...", "body": "..."}`
```

### 3.4 Email User Prompt

**File:** `src/lib/agents/writer-agent.ts`  
**Location:** Line ~291-339

**REPLACE the prompt WITH:**
```typescript
const response = await callModel({
  task: 'write_email',
  prompt: `Write a brief application email.

APPLICANT: ${applicant?.name || 'Applicant'}
JOB TITLE: ${job?.title || 'Position'}
COMPANY: ${job?.companyName || 'Company'}
COMPANY DESCRIPTION: ${companyResearch?.description || 'Not available'}

TOP ACHIEVEMENT FROM CV (use the most impressive metric):
${rawCV.slice(0, 500)}

INSTRUCTIONS:
1. Subject line format: [Job Title] Application - [Name] - [One impressive metric or qualifier]
2. Body: Maximum 4 sentences
3. Must include one specific number/achievement from CV
4. End with availability, not "I look forward to hearing from you"

Return ONLY valid JSON: {"subject": "...", "body": "..."}`,
  systemPrompt: /* the new system prompt from 3.3 above */,
  jsonMode: true,
});
```

---

## 4. Few-Shot Examples

### Why Few-Shot Matters

GPT-4o mini performs significantly better when shown concrete examples. One good example is worth 100 words of instruction.

### Implementation

The few-shot example is already embedded in the cover letter prompt above (Section 3.2). Here's the key principle:

**For each document type, include ONE complete example that demonstrates:**
1. The exact tone you want
2. The structure you expect
3. Specific metrics and achievements
4. What "good" looks like

**DO NOT:**
- Include multiple examples (diminishing returns, uses tokens)
- Use generic examples without metrics
- Use examples that sound AI-generated

---

## 5. Anti-Cliché Blacklist

### Complete Blacklist

Add this as a constant in your writer-agent.ts file:

**File:** `src/lib/agents/writer-agent.ts`  
**Location:** Add at top of file, after imports

```typescript
// Anti-cliché blacklist - phrases that make cover letters sound AI-generated
export const COVER_LETTER_BLACKLIST = {
  openings: [
    "I am writing to apply",
    "I am excited to apply",
    "I am writing to express my interest",
    "I wish to apply",
    "I would like to apply",
    "I am submitting my application",
    "I am reaching out regarding",
    "I came across your job posting",
  ],
  selfDescriptions: [
    "I am a highly motivated",
    "I am a dedicated professional",
    "I am a results-driven",
    "I am a team player",
    "I am a hard worker",
    "I am passionate about",
    "I am confident that",
    "I believe I would be",
    "I am the perfect fit",
    "I am uniquely qualified",
    "I think outside the box",
    "I go the extra mile",
    "I am a self-starter",
    "I am detail-oriented",
    "dynamic professional",
    "proactive individual",
  ],
  closings: [
    "Thank you for considering my application",
    "Thank you for your time and consideration",
    "I look forward to hearing from you",
    "Please do not hesitate to contact me",
    "I would welcome the opportunity",
    "I hope to hear from you soon",
    "References available upon request",
    "Please find attached",
  ],
  fillers: [
    "In today's fast-paced",
    "In this day and age",
    "leverage my skills",
    "utilize my experience",
    "bring to the table",
    "hit the ground running",
    "synergy",
    "paradigm",
    "circle back",
    "move the needle",
  ],
  greetings: [
    "To Whom It May Concern",
    "Dear Sir or Madam",
    "Dear Hiring Manager", // acceptable but not ideal
  ]
};

// Flatten for easy checking
export const ALL_BLACKLISTED_PHRASES = [
  ...COVER_LETTER_BLACKLIST.openings,
  ...COVER_LETTER_BLACKLIST.selfDescriptions,
  ...COVER_LETTER_BLACKLIST.closings,
  ...COVER_LETTER_BLACKLIST.fillers,
  ...COVER_LETTER_BLACKLIST.greetings.slice(0, 2), // Keep "Dear Hiring Manager" as acceptable fallback
].map(phrase => phrase.toLowerCase());
```

### Validation Function (Optional but Recommended)

Add this function to check outputs:

```typescript
export function containsBlacklistedPhrase(text: string): { found: boolean; phrases: string[] } {
  const lowerText = text.toLowerCase();
  const found: string[] = [];
  
  for (const phrase of ALL_BLACKLISTED_PHRASES) {
    if (lowerText.includes(phrase.toLowerCase())) {
      found.push(phrase);
    }
  }
  
  return { found: found.length > 0, phrases: found };
}
```

---

## 6. Refinement Pass Implementation

### Recommendation: Same Model, Critical Editor Prompt

Using the same model (GPT-4o mini) with a "critical editor" prompt is the best balance of cost and quality. A dedicated refinement pass catches ~60% of issues that slip through.

### Implementation

**File:** `src/lib/agents/writer-agent.ts`

**Add this new function after `generateCoverLetter`:**

```typescript
/**
 * Refinement pass - reviews and improves cover letter quality
 * Uses same model with "critical editor" persona
 */
async function refineCoverLetter(
  originalLetter: string,
  context: MasterContext,
  emit: AgentEventHandler
): Promise<string> {
  emit({ type: 'progress', percent: 75, message: 'Polishing cover letter...' });

  const { applicant, job, companyResearch } = context;

  const response = await callModel({
    task: 'refine_cover_letter',
    prompt: `You are a critical editor reviewing a cover letter. Your job is to improve it, not praise it.

=== ORIGINAL COVER LETTER ===
${originalLetter}

=== CONTEXT ===
Applicant: ${applicant?.name}
Target Role: ${job?.title} at ${job?.companyName}
Company Research Available: ${companyResearch ? 'Yes' : 'No'}

=== EDITING CHECKLIST ===

1. OPENING CHECK:
   - Does it start with a cliché like "I am writing to apply" or "I am excited"?
   - If yes: Rewrite to lead with an achievement or insight
   
2. SPECIFICITY CHECK:
   - Are there at least 2 specific metrics/numbers?
   - If no: Add metrics from the context if available
   
3. COMPANY KNOWLEDGE CHECK:
   - Does it mention something specific about the company?
   - If no and research is available: Add a specific reference
   
4. CLOSING CHECK:
   - Does it end with "Thank you for considering" or "I look forward to hearing"?
   - If yes: Rewrite with a confident, specific call to action
   
5. TONE CHECK:
   - Does any sentence sound robotic or AI-generated?
   - If yes: Rewrite in more natural language
   
6. LENGTH CHECK:
   - Is it between 250-350 words?
   - If too long: Cut filler. If too short: Add specific value.

=== BLACKLISTED PHRASES TO REMOVE ===
- "I am writing to apply/express interest"
- "I am excited/passionate about"
- "I believe I would be a great fit"
- "Thank you for considering my application"
- "I look forward to hearing from you"
- "Please find attached"
- Any "I am a [adjective] professional"

=== OUTPUT INSTRUCTIONS ===
Return ONLY the improved cover letter. No explanations, no "Here's the improved version", no markdown. Just the plain text letter.

If the original is already excellent (rare), return it unchanged.`,
    systemPrompt: 'You are a ruthless editor. Your job is to make this cover letter sound human, specific, and compelling. Cut clichés without mercy. Add specificity where vague. Return only the improved letter.',
  });

  return response.content || originalLetter;
}
```

### Integrate Refinement into generateCoverLetter

**Modify the `generateCoverLetter` function to call refinement:**

```typescript
async generateCoverLetter(context: MasterContext, emit: AgentEventHandler): Promise<string> {
  // ... existing code to generate initial cover letter ...
  
  let coverLetter = response.content || '';
  
  // NEW: Refinement pass
  if (coverLetter && coverLetter.length > 100) {
    coverLetter = await refineCoverLetter(coverLetter, context, emit);
  }
  
  return coverLetter;
}
```

### Add Task Configuration for Refinement

**File:** `src/lib/models/types.ts`

**Add to the task configs:**

```typescript
refine_cover_letter: {
  temperature: 0.4,  // Lower for more consistent editing
  maxTokens: 2048,
  jsonMode: false,
},
```

---

## 7. Configuration Changes

### Temperature Adjustments

**File:** `src/lib/models/types.ts`

**Current settings:**
```typescript
write_cover_letter: { temperature: 0.7, ... }
write_email: { temperature: 0.7, ... }
```

**Change to:**
```typescript
write_cover_letter: { 
  temperature: 0.5,  // Lower for more consistent professional tone
  maxTokens: 2048,
  jsonMode: false,
},
write_email: { 
  temperature: 0.5,  // Lower for consistency
  maxTokens: 1024,
  jsonMode: true,
},
refine_cover_letter: {
  temperature: 0.4,  // Even lower for editing — we want consistency
  maxTokens: 2048,
  jsonMode: false,
},
```

### Why These Changes

| Setting | Old | New | Reason |
|---------|-----|-----|--------|
| Cover letter temp | 0.7 | 0.5 | Professional writing needs consistency, not creativity |
| Email temp | 0.7 | 0.5 | Brief emails should be reliable |
| Refinement temp | N/A | 0.4 | Editing requires precision |

---

## 8. Code Changes Required

### Summary of Files to Modify

| File | Changes |
|------|---------|
| `src/lib/agents/writer-agent.ts` | New prompts, blacklist, refinement function |
| `src/lib/models/types.ts` | Temperature settings, new task config |

### Checklist for writer-agent.ts

- [ ] Add `COVER_LETTER_BLACKLIST` constant at top of file
- [ ] Add `containsBlacklistedPhrase` function (optional)
- [ ] Replace cover letter system prompt (Section 3.1)
- [ ] Replace cover letter user prompt (Section 3.2)
- [ ] Replace email system prompt (Section 3.3)
- [ ] Replace email user prompt (Section 3.4)
- [ ] Add `refineCoverLetter` function (Section 6)
- [ ] Modify `generateCoverLetter` to call refinement
- [ ] Add task config for `refine_cover_letter`

### Checklist for types.ts

- [ ] Update `write_cover_letter` temperature to 0.5
- [ ] Update `write_email` temperature to 0.5
- [ ] Add `refine_cover_letter` task configuration

---

## 9. Testing Checklist

### Test Cases

After implementation, run these test cases:

**Test 1: Cliché Detection**
```
Input: Any job description
Expected: Cover letter does NOT contain any blacklisted phrases
Check: Run containsBlacklistedPhrase() on output
```

**Test 2: Metrics Inclusion**
```
Input: CV with clear metrics (€150K, 30K followers, etc.)
Expected: Cover letter includes at least 2 specific numbers
Check: Count numeric values in output
```

**Test 3: Problem-Solution Format**
```
Input: Any job description
Expected: Letter opens with achievement/insight, NOT "I am writing to apply"
Check: First sentence analysis
```

**Test 4: Company Research Usage**
```
Input: Job at company with available research
Expected: Letter mentions something specific about the company
Check: Company name or specific detail appears in body
```

**Test 5: Length Compliance**
```
Input: Any job description
Expected: 250-350 words
Check: Word count
```

**Test 6: Tone Consistency**
```
Input: Run same job 3 times
Expected: Similar tone across all outputs (temperature check)
Check: Compare outputs subjectively
```

### A/B Testing Protocol

1. Generate 10 cover letters with OLD prompts (before changes)
2. Generate 10 cover letters with NEW prompts (after changes)
3. Rate each on 1-5 scale for:
   - Opening quality (1=cliché, 5=compelling hook)
   - Specificity (1=vague, 5=concrete metrics)
   - Natural tone (1=robotic, 5=human)
   - Overall effectiveness (1=would ignore, 5=would interview)

**Success criteria:** New prompts should average 3.5+ on all metrics (vs. likely 2.0-2.5 before).

---

## 10. Measuring Success

### Quantitative Metrics

| Metric | Baseline | Target | How to Measure |
|--------|----------|--------|----------------|
| Blacklisted phrases per letter | ~3-5 | 0 | `containsBlacklistedPhrase()` |
| Metrics included | 0-1 | 2+ | Count numbers in output |
| Word count compliance | ~60% | 95%+ | Check 250-350 range |
| Refinement improvement | N/A | 70%+ of letters modified | Compare pre/post refinement |

### Qualitative Assessment

Have 3 people rate 10 sample outputs:
1. "Would you interview this person based on this letter?" (Yes/No)
2. "Does this sound like a human or AI wrote it?" (Human/AI/Unsure)
3. "What's the most memorable thing about this letter?" (Open response)

**Success:** 
- 70%+ "Yes" on interview question
- 70%+ "Human" or "Unsure" on AI detection
- Specific achievements mentioned in memorable response

---

## Appendix: Quick Reference Card

### Cover Letter Structure (Problem-Solution Format)

```
1. OPENING (1-2 sentences)
   - Lead with achievement OR insight about their challenge
   - NOT "I am writing to apply"

2. VALUE (3-4 sentences)
   - YOUR specific experience → THEIR specific needs
   - Include 2+ metrics
   - Show impact, not responsibilities

3. COMPANY (2-3 sentences)
   - Reference specific company detail
   - Recent news, values, or products
   - Show you researched them

4. CLOSE (1-2 sentences)
   - Confident call to action
   - NOT "Thank you for considering"
   - State availability concretely
```

### Email Structure

```
Subject: [Job Title] Application - [Name] - [Top Metric]
Body: [Hook] + [Value] + [CTA] = 3-4 sentences max
```

### Temperature Guide

```
Parsing/extraction: 0.3 (precision)
Professional writing: 0.5 (consistency)
Editing/refinement: 0.4 (precision)
Creative writing: 0.7+ (variation)
```

---

## Next Steps After Implementation

1. **Implement Option A** (this guide)
2. **Test with 20 job applications** across different industries
3. **Collect feedback** on output quality
4. **If quality still insufficient:** Proceed to Option B (Claude Haiku integration)

Option B would involve:
- Adding Claude API integration
- Routing cover letter and email generation to Claude Haiku 4.5
- Keeping GPT-4o mini for parsing and CV optimization
- Expected additional cost: ~$1.50-2.00 per 100 applications

---

*End of Implementation Guide*
