/**
 * parse_cv prompt: a vendored copy of getParsingPrompt() from src/app/api/parse-cv/route.ts.
 *
 * The route keeps the function private and imports next/server and auth, so it cannot be
 * imported. assertParseCvPromptMatchesRoute() compares this copy with the route source
 * (whitespace-normalised string comparison) and throws on drift. The call parameters are
 * asserted the same way.
 */
import fs from "node:fs";
import path from "node:path";

const ROUTE = path.resolve(__dirname, "..", "..", "src", "app", "api", "parse-cv", "route.ts");

export const PARSE_CV_SYSTEM =
  "You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.";
export const PARSE_CV_TEMPERATURE = 0.3;
export const PARSE_CV_MAX_TOKENS = 8192;
const MAX_AI_TEXT_LENGTH = 30000;

// ---- vendored copy, do not edit by hand: it must equal the route ----
function getParsingPrompt(rawText: string): string {
  return `
Extract structured data from this CV/resume text. Be precise and don't invent information.

CV TEXT:
${rawText}

RULES:
1. Extract EXACTLY what's written - no assumptions or invented data
2. For dates, preserve the original format in "raw" and try to normalize to "YYYY-MM"
3. If a date is ambiguous (just "2022"), mark confidence as "medium"
4. If something is missing, use null or empty arrays - do NOT invent
5. DOCUMENT LANGUAGE: Return the source document's primary natural language as exactly one of: en, de, fr, es, pt, it, nl. Return null only if the document language cannot be determined. Use pt for either Portuguese variant.
6. SECTION HEADERS: Return the original source text for recognised section headers. Use only these keys: summary, skills, experience, education, certifications, languages, contact, additionalInfo, projects. Omit unavailable keys. Never translate or invent a header. Never return the same heading for two keys: if one source heading covers two sections (e.g. "Certifications & Languages"), split the content into both arrays and omit that heading for both keys.
7. PROJECTS: Only extract projects if the CV has a DEDICATED "Projects" section header (e.g., "Projects", "Projekte", "Projets", "Key Projects"). Do NOT extract projects from experience bullets or other sections. If no explicit Projects section exists, return an empty array for "projects".
8. ADDITIONAL SECTIONS: Extract any remaining sections like "Additional Information", "Volunteer Experience", "Awards", "Interests", "Hobbies", "References", "Publications", etc. Group each under its original section title with bullet items. Never reuse a heading you returned in "sectionHeaders" as an additional section title: leftover facts from a combined section (work authorization, driver's license, relocation) go under "Additional Information". If none exist, return an empty array for "additionalSections".
9. Split skills into logical categories (e.g., "Programming", "Marketing", "Tools", etc.)
10. SKILL PROFICIENCY LEVELS: If a skill has a proficiency level, qualifier, or descriptor attached (e.g., "Python (Proficient)", "Excel - Advanced", "SQL: Fundamentals", "Photoshop, Basic"), you MUST preserve it in the output as "SkillName (Level)". If a skill has NO level attached, output just the skill name. NEVER invent or guess proficiency levels - only preserve what is explicitly written.
11. For German CVs, look for "Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen", etc.
12. Extract ALL sections present in the CV - do not skip any information
13. For "currentTitle": extract the job title/tagline shown prominently (e.g., "Senior Software Engineer")

Return ONLY valid JSON with this structure:
{
  "documentLanguage": "en|de|fr|es|pt|it|nl|null",
  "sectionHeaders": {
    "summary": "string|null", "skills": "string|null", "experience": "string|null", "education": "string|null", "certifications": "string|null", "languages": "string|null", "contact": "string|null", "additionalInfo": "string|null", "projects": "string|null"
  },
  "personal": {
    "fullName": "string",
    "email": "string",
    "phone": "string",
    "currentTitle": "string|null (job title/tagline shown on CV, e.g., 'Marketing Manager')",
    "address": "string|null",
    "city": "string|null",
    "country": "string|null",
    "postalCode": "string|null",
    "dateOfBirth": "string|null (format as found, e.g., '15.03.1990')",
    "nationality": "string|null",
    "linkedIn": "string|null",
    "website": "string|null",
    "github": "string|null"
  },
  "summary": "string|null (professional summary/profile/objective section)",
  "experience": [
    {
      "company": "string",
      "position": "string",
      "location": "string|null",
      "startDate": { "raw": "string", "normalized": "YYYY-MM|null", "confidence": "high|medium|low" },
      "endDate": { "raw": "string|present", "normalized": "YYYY-MM|present|null", "confidence": "high|medium|low" },
      "current": true/false,
      "bullets": ["string (each achievement/responsibility as separate item)"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "field": "string|null (field of study)",
      "location": "string|null",
      "startDate": { "raw": "string", "normalized": "YYYY|null", "confidence": "high|medium|low" },
      "endDate": { "raw": "string", "normalized": "YYYY|null", "confidence": "high|medium|low" },
      "grade": "string|null (GPA, honors, etc.)"
    }
  ],
  "skills": [
    { "category": "string (e.g., 'Technical', 'Marketing', 'Languages')", "skills": ["string - preserve proficiency levels as 'SkillName (Level)' if present in source"] }
  ],
  "certifications": [
    { "name": "string", "issuer": "string", "date": { "raw": "string", "normalized": "string|null", "confidence": "string" } | null }
  ],
  "languages": [
    { "language": "string", "proficiency": "string|null, preserve the exact source value such as B2, C1 or Native", "certification": "string|null" }
  ],
  "projects": [
    { "name": "string", "description": "string", "technologies": ["string"], "url": "string|null" }
  ],
  "additionalSections": [
    { "title": "string (section header, e.g., 'Volunteer Experience', 'Awards', 'Interests', 'References')", "items": ["string (each item/bullet as separate entry)"] }
  ]
}
`;
}

// ---- end vendored copy ----

const normalise = (s: string) => s.replace(/\s+/g, " ").trim();

export function assertParseCvPromptMatchesRoute(): void {
  const src = fs.readFileSync(ROUTE, "utf8");
  const routeFn = src.match(/function getParsingPrompt\(rawText: string\): string \{[\s\S]*?\n\}\n(?=\n\/\*\*)/);
  if (!routeFn) throw new Error("getParsingPrompt not found in parse-cv route; update evals/lib/parse-cv.ts");
  const vendored = fs.readFileSync(__filename, "utf8").match(/function getParsingPrompt\(rawText: string\): string \{[\s\S]*?\n\}\n(?=\n\/\/ ---- end vendored)/);
  if (!vendored) throw new Error("vendored getParsingPrompt not found in evals/lib/parse-cv.ts");
  if (normalise(routeFn[0]) !== normalise(vendored[0])) {
    throw new Error("evals/lib/parse-cv.ts getParsingPrompt differs from src/app/api/parse-cv/route.ts. Re-vendor it before running the eval.");
  }
  for (const needle of [PARSE_CV_SYSTEM, "temperature: 0.3", "maxTokens: 8192", "jsonMode: true", "MAX_AI_TEXT_LENGTH = 30000"]) {
    if (!src.includes(needle)) throw new Error(`parse-cv route no longer contains "${needle}"; update evals/lib/parse-cv.ts`);
  }
}

/** prepareTextForAI() from the route, then the prompt. */
export function buildParseCvPrompt(rawText: string): string {
  const text =
    rawText.length <= MAX_AI_TEXT_LENGTH
      ? rawText
      : rawText.substring(0, MAX_AI_TEXT_LENGTH) + "\n\n[... truncated for parsing efficiency ...]";
  return getParsingPrompt(text);
}
