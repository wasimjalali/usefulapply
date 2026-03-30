---
paths:
  - "src/lib/agents/**/*.ts"
  - "src/lib/agents/prompts/**/*.ts"
---

# Agent & Prompt Rules (Anti-Hallucination)

## Source of Truth

Every skill, metric, and claim in generated CVs and cover letters must trace to the Primary CV or Master CV. The Job Description (JD) is for keyword matching only — NEVER a source of facts about the applicant.

## Hard Rules

- Never invent skills, experiences, certifications, or metrics not found in the user's CV
- Never upgrade or exaggerate existing qualifications (e.g., "familiar with" does not become "expert in")
- Always preserve the applicant's actual job titles, company names, and dates
- If the JD mentions a skill the applicant lacks, omit it — do not fabricate it
- Quantitative claims (percentages, dollar amounts, team sizes) must come directly from the CV

## Prompt File Locations

- `src/lib/agents/prompts/cv-prompt.ts` — CV optimization prompt
- `src/lib/agents/prompts/cover-letter-prompt.ts` — Cover letter prompt
- `src/lib/agents/prompts/email-prompts.ts` — Application & follow-up email prompts
- `src/lib/agents/prompts/fit-assessment-prompt.ts` — Fit analysis prompt

Do not weaken or remove anti-hallucination guards in any prompt file.
