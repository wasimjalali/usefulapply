# Karko AI — Implementation Guide v2: Post-Audit Fixes & Optimizations

**Created:** February 6, 2026
**Context:** Expert audit of Haiku 4.5 output quality after migration from GPT-4o mini
**Primary Market:** US, UK, Canada (English-speaking)
**Secondary Market:** EU (German + other European languages)
**Model:** Claude Haiku 4.5 (unified writer agent with function calling)

---

## Summary

The migration from GPT-4o mini to Claude Haiku 4.5 was a significant upgrade. Writing quality improved from 5-6/10 to 8/10. The unified agent architecture with function calling is cleaner and more cost-effective than the previous multi-agent setup. The following fixes will push quality from 8/10 to 9/10.

**Overall Assessment:**
- CV Optimization: 8.5/10
- Cover Letter: 8/10
- Email: 7.5/10
- Fit Assessment: 9/10
- Dashboard UI: 9/10

---

## Task Tracker

| # | Task | Priority | Status | Impact |
|---|------|----------|--------|--------|
| 1 | Fix [Insert Company Address] placeholder | P1 | ✅ Complete | Critical UX |
| 2 | Fix email subject line length | P1 | ✅ Complete | High |
| 3 | Add attachment reference to email | P1 | ✅ Complete | High |
| 4 | Preserve driver's license from Master CV | P2 | ✅ Complete | Medium |
| 5 | Add location/relocation awareness to cover letter | P2 | ✅ Complete | Medium |
| 6 | Improve company-specific research in cover letter | P2 | ✅ Complete | Medium |
| 7 | Fix education line formatting | P3 | ✅ Complete | Low |
| 8 | Add Google Analytics inference warning (Option A) | P3 | ✅ Complete | Low |

**After completing each task:** Update the state tracker markdown of the related files you modified.

---

## Task 1: Fix [Insert Company Address] Placeholder

**Decision: KEEP the placeholder but improve the UX around it.**

The reasoning is sound — a wrong address from hallucinated web search is worse than a placeholder. However, the current implementation has a risk: users in a hurry might send the application with "[Insert Company Address]" still visible.

### Implementation

In the **cover letter generation prompt**, replace the current address placeholder instruction with:

```
COMPANY ADDRESS HANDLING:
- Always include the company name in the address block
- For the company street address, use the placeholder: [Company Address — verify before sending]
- NEVER attempt to guess or fabricate a company address
- The user will verify and fill in the correct address before sending

FORMAT:
Hiring Manager
{company_name}
[Company Address — verify before sending]
```

**Why this change:** The updated placeholder text "[Company Address — verify before sending]" is more descriptive than "[Insert Company Address]" and serves as an explicit reminder. For the US/UK market especially, many applications are email-only and the address block may not even be needed — but for German/EU formal letters (Anschreiben), it's expected.

### Optional Enhancement (Recommended)

Add a frontend validation warning. When the user clicks "Copy" or "Download" on the cover letter, check if the text still contains "[Company Address" and show a yellow warning toast:

```
⚠️ Don't forget to add the company address before sending!
```

This is a 5-minute frontend fix that prevents embarrassment.

---

## Task 2: Fix Email Subject Line Length

**Problem:** Current output: "Bewerbung als E-Commerce Manager - Wasim Jalali - E-Commerce-Lösungen" (72 characters). Most email clients truncate at 50-60 characters on mobile. US/UK recruiters often read emails on mobile first.

### Implementation

In the **email generation prompt**, add these subject line rules:

```
EMAIL SUBJECT LINE RULES:

Primary Market (US/UK/Canada — English):
- Format: "Application: [Job Title] — [Your Name]"
- Example: "Application: E-Commerce Manager — Wasim Jalali"
- Maximum 60 characters total
- NEVER add extra descriptors like "E-Commerce Solutions" or skill keywords
- The subject line is for identification, not selling

Secondary Market (EU/German):
- Format: "Bewerbung als [Job Title] — [Your Name]"
- Example: "Bewerbung als E-Commerce Manager — Wasim Jalali"
- Maximum 60 characters total
- Same rules: no extra descriptors or keywords

LANGUAGE DETECTION:
- If the job description is in German → use German format
- If the job description is in English → use English format
- If the job description is in another EU language → use English format unless the user specifies otherwise
```

---

## Task 3: Add Attachment Reference to Email

**Problem:** The email body doesn't mention that CV and cover letter are attached. In the US/UK market, this is standard practice. In German business correspondence, "Anbei finden Sie meine Bewerbungsunterlagen" is expected.

### Implementation

In the **email generation prompt**, add:

```
EMAIL BODY STRUCTURE:

1. Greeting (Guten Tag / Dear Hiring Team)
2. Opening hook — 1-2 sentences with strongest achievement + connection to role
3. Value proposition — 1 sentence on what you bring
4. Attachment reference — REQUIRED
5. Availability + call to action
6. Closing + signature

ATTACHMENT REFERENCE RULES:

English market:
- "Please find my CV and cover letter attached."
- OR "I've attached my CV and cover letter for your review."
- Place BEFORE the availability line

German market:
- "Anbei finden Sie meinen Lebenslauf und mein Anschreiben."
- OR "Meine vollständigen Bewerbungsunterlagen finden Sie im Anhang."
- Place BEFORE the availability line

NEVER skip the attachment reference. Recruiters need to know documents are attached.
```

---

## Task 4: Preserve Driver's License from Master CV

**Problem:** The original CV and Master CV both include "Driver's License: Class B" but the optimized CV dropped it. For roles requiring Präsenztage (hybrid in-office days), commute logistics matter. For US/UK roles, it's less critical but still a data point that shouldn't be silently removed.

### Implementation

In the **CV optimization prompt**, add:

```
DATA PRESERVATION RULES:

The following fields from the original CV or Master CV must ALWAYS be preserved in the optimized CV, regardless of job description relevance:

1. Driver's License — include in personal info or a footer section
2. Languages — always include all languages with levels
3. Work Authorization status — if mentioned in Master CV
4. Location — always include current city

These fields cost zero space in terms of relevance but can be disqualifying if missing. A recruiter scanning for "has a driver's license" will skip the application if it's not listed.
```

---

## Task 5: Add Location/Relocation Awareness to Cover Letter

**Problem:** The job at 1Q Health Group requires "zwei Präsenztagen pro Woche am Standort Straßlach" (near Munich). The applicant is in Kaiserslautern (400km away). The cover letter doesn't address this. Any recruiter will notice this mismatch and likely reject.

### Implementation

In the **cover letter generation prompt**, add:

```
LOCATION INTELLIGENCE:

Before generating the cover letter, check:
1. Where is the applicant located? (from CV/Master CV)
2. Where is the job located? (from job description)
3. Is relocation or hybrid/remote mentioned? (from job description)
4. Does the Master CV mention relocation readiness?

IF the applicant and job are in different cities AND the job requires on-site presence:
- Check if Master CV mentions relocation willingness
- If YES: Add one sentence in the closing paragraph: 
  English: "I am open to relocating to [city] and available to discuss logistics."
  German: "Ich bin bereit, nach [Stadt] umzuziehen und stehe für ein Gespräch zur Verfügung."
- If NO: Do not fabricate relocation willingness. Instead, omit any location reference and let the user decide.

IF the job is fully remote or doesn't mention location requirements:
- Do not mention location or relocation

NEVER ignore a location mismatch. Addressing it proactively shows professionalism. Ignoring it looks careless.
```

---

## Task 6: Improve Company-Specific Research in Cover Letter

**Problem:** The cover letter mentions "1Q Health Group" by name but doesn't reference anything specific about the company — their product range (Arznei- und Nahrungsergänzungsmittel), their subsidiaries, or their market position. Since web search is disabled, the agent must extract company intelligence from the job description itself.

### Implementation

In the **cover letter generation prompt**, add:

```
COMPANY CONTEXT EXTRACTION:

Since web search is not available, extract ALL company context from the job description:
- Company name
- Industry/sector
- Products or services mentioned
- Company values or culture signals
- Team size or structure hints
- Any unique selling points mentioned

USE this extracted context in the cover letter:
- Reference at least ONE specific company detail in the opening or closing paragraph
- Connect the applicant's experience to the company's specific industry/products
- Do NOT use generic phrases like "your company" or "your team" without specifics

EXAMPLE (from a JD mentioning health products):
BAD: "I would love to contribute to your team's success."
GOOD: "Die Entwicklung innovativer Premium-Gesundheitsprodukte in höchster Qualität — von Nahrungsergänzungsmitteln bis Arzneimittel — ist ein Bereich, in dem meine E-Commerce-Expertise direkt Mehrwert schaffen kann."

The job description is the richest source of company information available. Use it fully.
```

---

## Task 7: Fix Education Line Formatting

**Problem:** The optimized CV shows "Allgemeine Hochschulreife (Abitur-Äquivalent) in Allgemeinbildung" — the "in Allgemeinbildung" is technically accurate (from the Master CV context of a general education diploma from Afghanistan) but reads redundantly in German because "Allgemeine Hochschulreife" already implies general education.

### Implementation

In the **CV optimization prompt**, add:

```
EDUCATION FORMATTING:

For non-German qualifications mapped to German equivalents:
- Use the recognized German equivalent name
- Include the grade if available
- Do NOT add redundant descriptors

CORRECT: "Allgemeine Hochschulreife (Abitur-Äquivalent) | Note: 92,43%"
INCORRECT: "Allgemeine Hochschulreife (Abitur-Äquivalent) in Allgemeinbildung"

For the US/UK market:
CORRECT: "High School Diploma GPA: 92.43%"
```

---

## Task 8: Add Google Analytics Inference Warning

**Problem:** The agent added "Google Analytics" to the skills section even though neither the original CV nor Master CV explicitly lists it. The agent inferred it from adjacent skills (Google SEO, Keyword Research, Competitive Analysis). While this is intelligent optimization, it creates a risk: the user might be asked about GA proficiency in an interview.

### Implementation

This is a design decision, not a bug. Two options:

**Option A (Conservative — Recommended for launch):**
Add to the CV optimization prompt:

```
SKILL INFERENCE RULES:

You may ONLY add skills to the CV that are:
1. Explicitly listed in the original CV or Master CV, OR
2. Directly demonstrated by a project or achievement described in the CV/Master CV

You may NOT add skills that are:
- Inferred from adjacent or similar skills
- Common in the industry but not evidenced by the applicant
- Required by the job description but not present in the applicant's background

If a required skill is missing, flag it in the fit assessment as a GAP, not in the CV as a claimed skill.
```

**Option B (Aggressive — Consider post-launch):**
Allow skill inference but flag it transparently in the Changes view:

```
When adding an inferred skill, tag it as:
"⚠️ Google Analytics (inferred from SEO and analytics background — verify before interview)"
```

**Recommendation:** Start with Option A. Building trust with early users is more important than aggressive keyword optimization. A user who gets caught claiming GA expertise in an interview will never trust the product again.

---

## Writing Quality Notes for System Prompts (US/UK Primary Market)

Since the primary market is US/UK/Canada, ensure these tone guidelines are in the cover letter and email prompts:

```
WRITING TONE — PRIMARY MARKET (US/UK/CANADA):

- Confident but not arrogant. "I bring X" not "I believe I could possibly contribute X"
- Direct and concise. American/British recruiters value brevity
- Achievement-led. Open with your strongest quantified result
- No filler phrases: "I am writing to express my interest" — BANNED
- No excessive formality: "I would be honored" — BANNED
- No AI-isms: "leverage", "synergy", "passionate about", "excited to" — BANNED
- Natural vocabulary: Write like a confident professional, not a corporate template
- Problem-Solution format: What challenge did you face → What did you do → What was the result

WRITING TONE — SECONDARY MARKET (EU/GERMAN):

- More formal than US/UK — "Sehr geehrte Damen und Herren" is appropriate
- Still achievement-led — German recruiters also value quantified results
- Use professional German business vocabulary — avoid colloquialisms
- Include "Bewerbungsunterlagen" (application documents) references
- Address company-specific details from the Stellenanzeige (job posting)
- Structure: Opening with achievement → Skills match → Company connection → Closing with availability
- Maintain the Sie-form throughout (formal address)

LANGUAGE DETECTION:
- Job description in English → Write all documents in English with US/UK tone
- Job description in German → Write all documents in German with formal business tone
- Job description in other EU language → Default to English unless user specifies otherwise
```

---

## Verification Checklist

After implementing all tasks, test with this checklist:

### Test Case 1: US/UK English Job (e.g., E-Commerce Manager at a UK company)
- [ ] CV is in English
- [ ] Cover letter opens with achievement, no clichés
- [ ] Email subject ≤ 60 characters
- [ ] Email includes attachment reference
- [ ] No [Insert Company Address] appears without the descriptive text
- [ ] Driver's license preserved (if in Master CV)
- [ ] No inferred skills added without evidence
- [ ] Fit assessment is honest about gaps

### Test Case 2: German Job (e.g., E-Commerce Manager at a German company)
- [ ] CV is in German
- [ ] Cover letter uses formal German business tone
- [ ] Email uses "Anbei" attachment reference
- [ ] Subject uses "Bewerbung als..." format
- [ ] Education line doesn't have redundant "in Allgemeinbildung"
- [ ] Location mismatch is addressed if applicable
- [ ] Company-specific details from JD are referenced

### Test Case 3: Edge Cases
- [ ] Job with no company address findable → placeholder appears correctly
- [ ] Job that's fully remote → no relocation mention
- [ ] Job requiring skills the applicant doesn't have → fit assessment flags gaps, CV doesn't fabricate
- [ ] Job in French/Spanish → defaults to English unless user specifies

---

## State Tracker Update Reminder

After completing each task above, update the state tracker markdown files for:
- `writer-agent.ts` or equivalent agent file (prompt changes)
- Any frontend components modified (toast warnings, validation)
- System prompt documentation
- Configuration files (if any temperature or model changes)

Format for state tracker entries:
```
## [Date] — [Task Description]
- Changed: [file path]
- What: [brief description of change]
- Why: [reference to this implementation guide task #]
- Status: ✅ Complete
```

---

*End of Implementation Guide v2*
