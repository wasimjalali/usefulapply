import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { StructuredCV, createEmptyCV, withId } from '@/lib/types/cv-schema';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { detectCVLanguage, extractOriginalHeaders, generateLocalizedHeaders } from '@/lib/cv-parser/section-splitter';
import { callAnthropic, parseDocumentAsCV } from '@/lib/models/anthropic';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 300;

// File size limits
const MAX_FILE_SIZE_DIRECT = 4.5 * 1024 * 1024;  // Direct upload (Vercel body limit)
const MAX_FILE_SIZE_STORAGE = 10 * 1024 * 1024;   // Storage-first upload (no body limit)

// Accepted file extensions
const ACCEPTED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

// Check if we have the required API keys (Bedrock OR direct Anthropic)
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasBedrockKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) || !!process.env.AWS_BEARER_TOKEN_BEDROCK;
const hasAICapability = hasAnthropicKey || hasBedrockKeys;

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    const rateLimitResult = checkRateLimit(`parse-cv:${clientIP}`, RATE_LIMITS['parse-cv']);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment.' },
        { status: 429 }
      );
    }

    // Auth check: determines rate limiting (anonymous = 5/24h IP limit, authenticated = unlimited)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;

    // Two input modes:
    // 1) FormData with 'file' field — direct upload (≤ 4.5 MB, Vercel body limit)
    // 2) JSON with 'storagePath' + 'fileName' — storage-first (up to 10 MB)
    let buffer: Buffer = undefined!;
    let originalFileName = '';
    let fileExt: string;
    let region = 'EU';

    let documentType: 'primary_cv' | 'master_cv' = 'primary_cv';
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Mode 2: Storage-first — file already uploaded to Supabase Storage
      if (!isAuthenticated) {
        return NextResponse.json({ error: 'Authentication required for storage-based parsing.' }, { status: 401 });
      }

      const body = await request.json();
      const { storagePath, fileName } = body;
      region = body.region || 'EU';
      if (body.documentType === 'master_cv') documentType = 'master_cv';

      if (!storagePath || !fileName) {
        return NextResponse.json({ error: 'Missing storagePath or fileName.' }, { status: 400 });
      }

      originalFileName = fileName;
      fileExt = '.' + (fileName.toLowerCase().split('.').pop() || '');

      if (!ACCEPTED_EXTENSIONS.includes(fileExt)) {
        return NextResponse.json(
          { error: `Unsupported file type "${fileExt}". Accepted formats: PDF, DOCX, TXT, MD.` },
          { status: 400 }
        );
      }

      console.log(`[Parser] Storage-first mode: ${fileName}, path: ${storagePath}`);

      // Download from Supabase Storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('cv-files')
        .download(storagePath);

      if (downloadError || !fileData) {
        console.error('[Parser] Failed to download from storage:', downloadError);
        return NextResponse.json({ error: 'Failed to download file from storage.' }, { status: 400 });
      }

      buffer = Buffer.from(await fileData.arrayBuffer());

      if (buffer.length > MAX_FILE_SIZE_STORAGE) {
        return NextResponse.json(
          { error: `File is too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.` },
          { status: 400 }
        );
      }
    } else {
      // Mode 1: Direct FormData upload (original path)
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch (e) {
        console.error('[Parser] Failed to parse form data:', e);
        return NextResponse.json(
          { error: 'Failed to read upload. The file may be too large (max 4.5 MB). For larger files, try from the Documents page.' },
          { status: 400 }
        );
      }

      const file = formData.get('file') as File;
      region = (formData.get('region') as string) || 'EU';
      if ((formData.get('documentType') as string) === 'master_cv') documentType = 'master_cv';

      if (!file || !(file instanceof File) || file.size === 0) {
        console.error('[Parser] No valid file in form data. Keys:', [...formData.keys()]);
        return NextResponse.json({ error: 'No file provided. Please select a PDF, DOCX, TXT, or MD file.' }, { status: 400 });
      }

      originalFileName = file.name;
      fileExt = '.' + (originalFileName.toLowerCase().split('.').pop() || '');

      if (!ACCEPTED_EXTENSIONS.includes(fileExt)) {
        return NextResponse.json(
          { error: `Unsupported file type "${fileExt}". Accepted formats: PDF, DOCX, TXT, MD.` },
          { status: 400 }
        );
      }

      console.log(`[Parser] Direct upload: ${originalFileName}, size: ${(file.size / 1024).toFixed(1)} KB`);

      if (file.size > MAX_FILE_SIZE_DIRECT) {
        return NextResponse.json(
          { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum for direct upload: 4.5 MB. For larger files, use the Documents page.` },
          { status: 400 }
        );
      }

      try {
        buffer = Buffer.from(await file.arrayBuffer());
      } catch (e) {
        console.error('[Parser] Failed to read file buffer:', e);
        return NextResponse.json({ error: 'Failed to read file contents. Please try again.' }, { status: 400 });
      }
    }

    // Buffer integrity check
    if (buffer.length === 0) {
      return NextResponse.json({ error: 'File appears to be empty. Please try uploading again.' }, { status: 400 });
    }

    // IP-based rate limiting for anonymous users (5 parses per 24h rolling window)
    if (!isAuthenticated) {
      try {
        const admin = createAdminClient();
        const { data, error: rpcError } = await admin.rpc(
          'check_anon_parse_limit' as never,
          { p_ip: clientIP } as never
        ) as unknown as {
          data: { allowed: boolean; current_count: number }[] | null;
          error: { message: string } | null;
        };
        if (rpcError) {
          console.error('[Parser] Rate limit RPC error:', rpcError.message);
          // Fail open — don't block users if the rate limit check itself fails
        } else if (data && data.length > 0 && !data[0].allowed) {
          return NextResponse.json(
            { error: "You've reached the free parse limit. Sign up free to get unlimited CV uploads." },
            { status: 429 }
          );
        }
      } catch (e) {
        console.error('[Parser] Rate limit check failed:', e);
        // Fail open
      }
    }

    if (!hasAICapability) {
      return NextResponse.json(
        { error: 'CV parsing is temporarily unavailable. Please try again later.' },
        { status: 503 }
      );
    }

    // Parse CV using AI
    let rawText = '';
    let structuredCV: StructuredCV;
    const parserUsed = 'ai';
    const parseStartTime = Date.now();

    console.log(`[Parser] Starting: file=${originalFileName}, ext=${fileExt}, size=${buffer.length}, mode=${contentType.includes('application/json') ? 'storage' : 'direct'}, documentType=${documentType}`);

    if (fileExt === '.pdf') {
      // One-step: send PDF directly to Claude as a document block — no local text extraction needed.
      // Claude reads the PDF natively, producing accurate structured data even for broken-font PDFs.
      try {
        // visual mode = primary CV (1-2 pages) → full page-as-image rendering via citations: enabled
        // text mode   = master CV (3-8 pages) → text-extraction-only (cheaper)
        const jsonContent = await parseDocumentAsCV({
          buffer,
          docFormat: 'pdf',
          prompt: getDocumentParsingPrompt(),
          systemPrompt: 'You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.',
          maxTokens: 8192,
          temperature: 0.3,
          visualMode: documentType !== 'master_cv',
        });
        structuredCV = parseAIResponse(jsonContent, region as 'US' | 'EU');
        rawText = reconstructRawText(structuredCV);
        console.log(`[Parser] PDF direct parse complete: ${rawText.length} chars reconstructed`);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[Parser] PDF direct parse failed:', errMsg);
        return NextResponse.json(
          { error: 'Failed to parse CV. Please try again or use a different file format.' },
          { status: 500 }
        );
      }
    } else {
      // DOCX/TXT/MD: extract text first, then parse with AI
      if (fileExt === '.docx') {
        rawText = extractTextFromDOCX(buffer);
      } else {
        rawText = buffer.toString('utf-8');
      }

      if (!rawText || rawText.trim().length < 50) {
        return NextResponse.json(
          { error: 'Could not extract text from file. The file may be empty or corrupted.' },
          { status: 400 }
        );
      }

      // Cap text length to avoid AI timeout — 30K chars ≈ 9K tokens, keeps parsing under 60s
      const MAX_AI_TEXT_LENGTH = 30000;
      const textForAI = rawText.length > MAX_AI_TEXT_LENGTH
        ? rawText.substring(0, MAX_AI_TEXT_LENGTH) + '\n\n[... truncated for parsing efficiency ...]'
        : rawText;
      if (rawText.length > MAX_AI_TEXT_LENGTH) {
        console.log(`[Parser] Text truncated for AI: ${rawText.length} → ${MAX_AI_TEXT_LENGTH} chars`);
      }

      try {
        structuredCV = await parseWithAI(textForAI, region as 'US' | 'EU');
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        console.error('[Parser] AI parsing failed:', errMsg);
        return NextResponse.json(
          { error: 'Failed to parse CV. Please try again or use a different file format.' },
          { status: 500 }
        );
      }
    }

    // Track anonymous AI parse usage separately for cost monitoring
    if (!isAuthenticated) {
      const posthog = getPostHogServer();
      posthog.capture({
        distinctId: `anon-ip:${clientIP}`,
        event: 'anonymous_cv_parse',
        properties: {
          file_type: fileExt,
          text_length: rawText.length,
          parse_time_ms: Date.now() - parseStartTime,
        },
      });
    }

    const parseTime = Date.now() - parseStartTime;
    console.log(`[Parser] Completed using ${parserUsed} parser in ${parseTime}ms`);
    console.log(`[Parser] Extracted: ${structuredCV.experience.length} exp, ${structuredCV.education.length} edu, ${structuredCV.skills.length} skills, ${structuredCV.languages.length} langs, ${structuredCV.certifications.length} certs, ${structuredCV.projects?.length || 0} projects, ${structuredCV.additionalSections?.length || 0} additional sections`);

    structuredCV.sourceFileName = originalFileName;
    structuredCV.sourceFormat = fileExt === '.pdf' ? 'pdf' : fileExt === '.docx' ? 'docx' : 'txt';

    // Detect CV language and generate localized strings (Present/Heute, GPA/Note, etc.)
    const detectedLang = detectCVLanguage(rawText);
    const { localizedStrings } = generateLocalizedHeaders(detectedLang);

    // Use the user's ORIGINAL section header text instead of generic localized headers
    const originalHeaders = extractOriginalHeaders(rawText);
    structuredCV.sectionHeaders = originalHeaders;
    structuredCV.localizedStrings = localizedStrings;
    structuredCV.settings.language = detectedLang;

    return NextResponse.json({
      success: true,
      structuredCV,
      originalPdf: {
        id: uuidv4(),
        url: undefined,
        fileName: originalFileName,
        size: buffer.length,
      },
      rawText,
      metadata: {
        parserUsed,
        parseTime,
        region,
        textLength: rawText.length,
      },
    });

  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(error as Error, 'server_error', {
      endpoint: '/api/parse-cv',
      method: 'POST',
    });
    await posthog.flush();
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse CV' },
      { status: 500 }
    );
  }
}

/**
 * Extract text from DOCX — parses XML from ZIP archive
 */
function extractTextFromDOCX(buffer: Buffer): string {
  const rawBuffer = buffer.toString('utf-8');
  // Extract text between XML <w:t> tags in the document.xml inside the ZIP
  const xmlTextParts: string[] = [];
  const xmlTagPattern = /<w:t[^>]*>([^<]+)<\/w:t>/g;
  let match;
  while ((match = xmlTagPattern.exec(rawBuffer)) !== null) {
    xmlTextParts.push(match[1]);
  }
  if (xmlTextParts.length > 0) {
    const text = xmlTextParts.join(' ').replace(/\s+/g, ' ').trim();
    console.log(`[Parser] DOCX text extracted via XML tags: ${text.length} chars`);
    return text;
  }
  // Fallback: strip non-printable chars
  const text = rawBuffer.replace(/[^\x20-\x7E\n\r\t\u00C0-\u024F]/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`[Parser] DOCX text extracted via fallback: ${text.length} chars`);
  return text;
}

/**
 * Parse CV using AI with text input (for DOCX/TXT/MD)
 */
async function parseWithAI(rawText: string, region: 'US' | 'EU'): Promise<StructuredCV> {
  const prompt = getParsingPrompt(rawText);

  const response = await callAnthropic({
    prompt,
    systemPrompt: 'You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.',
    temperature: 0.3,
    maxTokens: 8192,  // Master CVs with 10+ years of experience can exceed 4096 tokens of JSON output
    jsonMode: true,
  });

  console.log(`[Parser] AI response: ${response.usage.outputTokens} output tokens, ${response.content.length} chars`);
  return parseAIResponse(response.content, region);
}

/**
 * Get the parsing prompt for text-based CV input (DOCX/TXT/MD)
 */
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
9. PROJECTS: Only extract projects if the CV has a DEDICATED "Projects" section header (e.g., "Projects", "Projekte", "Projets", "Key Projects"). Do NOT extract projects from experience bullets or other sections. If no explicit Projects section exists, return an empty array for "projects".
10. ADDITIONAL SECTIONS: Extract any remaining sections like "Additional Information", "Volunteer Experience", "Awards", "Interests", "Hobbies", "References", "Publications", etc. Group each under its original section title with bullet items. If none exist, return an empty array for "additionalSections".
5. Split skills into logical categories (e.g., "Programming", "Marketing", "Tools", etc.)
6. SKILL PROFICIENCY LEVELS: If a skill has a proficiency level, qualifier, or descriptor attached (e.g., "Python (Proficient)", "Excel - Advanced", "SQL: Fundamentals", "Photoshop, Basic"), you MUST preserve it in the output as "SkillName (Level)". If a skill has NO level attached, output just the skill name. NEVER invent or guess proficiency levels — only preserve what is explicitly written.
7. For German CVs, look for "Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen", etc.
8. Extract ALL sections present in the CV - do not skip any information
9. For "currentTitle": extract the job title/tagline shown prominently (e.g., "Senior Software Engineer")

Return ONLY valid JSON with this structure:
{
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
    { "language": "string", "proficiency": "Native|Fluent|Professional|Intermediate|Basic", "certification": "string|null" }
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

/**
 * Get the parsing prompt for document-based CV input (PDF sent as a document content block).
 * Same JSON schema as getParsingPrompt but without the embedded CV text — Claude reads the PDF directly.
 */
function getDocumentParsingPrompt(): string {
  return `
Parse the attached CV/resume document and extract structured data. Be precise and don't invent information.

RULES:
1. Extract EXACTLY what's written - no assumptions or invented data
2. For dates, preserve the original format in "raw" and try to normalize to "YYYY-MM"
3. If a date is ambiguous (just "2022"), mark confidence as "medium"
4. If something is missing, use null or empty arrays - do NOT invent
5. PROJECTS: Only extract projects if the CV has a DEDICATED "Projects" section header (e.g., "Projects", "Projekte", "Projets", "Key Projects"). Do NOT extract projects from experience bullets or other sections. If no explicit Projects section exists, return an empty array for "projects".
6. ADDITIONAL SECTIONS: Extract any remaining sections like "Additional Information", "Volunteer Experience", "Awards", "Interests", "Hobbies", "References", "Publications", etc. Group each under its original section title with bullet items. If none exist, return an empty array for "additionalSections".
7. Split skills into logical categories (e.g., "Programming", "Marketing", "Tools", etc.)
8. SKILL PROFICIENCY LEVELS: If a skill has a proficiency level, qualifier, or descriptor attached (e.g., "Python (Proficient)", "Excel - Advanced", "SQL: Fundamentals", "Photoshop, Basic"), you MUST preserve it in the output as "SkillName (Level)". If a skill has NO level attached, output just the skill name. NEVER invent or guess proficiency levels — only preserve what is explicitly written.
9. For German CVs, look for "Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen", etc.
10. Extract ALL sections present in the CV - do not skip any information
11. For "currentTitle": extract the job title/tagline shown prominently (e.g., "Senior Software Engineer")

Return ONLY valid JSON with this structure:
{
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
    { "language": "string", "proficiency": "Native|Fluent|Professional|Intermediate|Basic", "certification": "string|null" }
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

/**
 * Reconstruct raw text from StructuredCV for backward compatibility with the agent context-builder.
 * The agent uses rawText as a source of facts — this serializes all CV sections into a readable format.
 */
function reconstructRawText(cv: StructuredCV): string {
  const lines: string[] = [];
  const { personal, summary, experience, education, skills, languages, certifications, projects, additionalSections } = cv;

  // Personal info
  if (personal.fullName) lines.push(personal.fullName);
  if (personal.currentTitle) lines.push(personal.currentTitle);
  const contactParts = [personal.email, personal.phone, personal.linkedIn, personal.website, personal.github].filter(Boolean);
  if (contactParts.length) lines.push(contactParts.join(' | '));
  const locationParts = [personal.address, personal.city, personal.country, personal.postalCode].filter(Boolean);
  if (locationParts.length) lines.push(locationParts.join(', '));
  if (personal.dateOfBirth) lines.push(`Date of Birth: ${personal.dateOfBirth}`);
  if (personal.nationality) lines.push(`Nationality: ${personal.nationality}`);

  // Summary
  if (summary) {
    lines.push('');
    lines.push('SUMMARY');
    lines.push(summary);
  }

  // Experience
  if (experience.length) {
    lines.push('');
    lines.push('EXPERIENCE');
    for (const exp of experience) {
      const dateRange = [exp.startDate?.raw, exp.current ? 'Present' : exp.endDate?.raw].filter(Boolean).join(' – ');
      lines.push(`${exp.position} at ${exp.company}${exp.location ? ` – ${exp.location}` : ''} (${dateRange})`);
      for (const bullet of exp.bullets || []) {
        lines.push(`- ${bullet}`);
      }
    }
  }

  // Education
  if (education.length) {
    lines.push('');
    lines.push('EDUCATION');
    for (const edu of education) {
      const dateRange = [edu.startDate?.raw, edu.endDate?.raw].filter(Boolean).join(' – ');
      const degree = [edu.degree, edu.field].filter(Boolean).join(' in ');
      lines.push(`${degree}, ${edu.institution}${edu.location ? ` – ${edu.location}` : ''} (${dateRange})`);
      if (edu.grade) lines.push(`Grade: ${edu.grade}`);
    }
  }

  // Skills
  if (skills.length) {
    lines.push('');
    lines.push('SKILLS');
    for (const cat of skills) {
      lines.push(`${cat.category}: ${cat.skills.join(', ')}`);
    }
  }

  // Languages
  if (languages.length) {
    lines.push('');
    lines.push('LANGUAGES');
    for (const lang of languages) {
      lines.push(`${lang.language}: ${lang.proficiency}${lang.certification ? ` (${lang.certification})` : ''}`);
    }
  }

  // Certifications
  if (certifications.length) {
    lines.push('');
    lines.push('CERTIFICATIONS');
    for (const cert of certifications) {
      lines.push(`${cert.name} – ${cert.issuer}${cert.date ? ` (${cert.date.raw})` : ''}`);
    }
  }

  // Projects
  if (projects && projects.length) {
    lines.push('');
    lines.push('PROJECTS');
    for (const proj of projects) {
      lines.push(proj.name);
      if (proj.description) lines.push(proj.description);
      if (proj.technologies?.length) lines.push(`Technologies: ${proj.technologies.join(', ')}`);
      if (proj.url) lines.push(`URL: ${proj.url}`);
    }
  }

  // Additional sections
  if (additionalSections && additionalSections.length) {
    for (const section of additionalSections) {
      lines.push('');
      lines.push(section.title.toUpperCase());
      for (const item of section.items || []) {
        lines.push(`- ${item}`);
      }
    }
  }

  return lines.join('\n').trim();
}

/**
 * Parse AI response into StructuredCV
 */
function parseAIResponse(content: string, region: 'US' | 'EU'): StructuredCV {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in response');

  const parsed = JSON.parse(jsonMatch[0]);
  const cv = createEmptyCV(region);

  // Map ALL personal info fields
  cv.personal = {
    fullName: parsed.personal?.fullName || '',
    email: parsed.personal?.email || '',
    phone: parsed.personal?.phone || '',
    currentTitle: parsed.personal?.currentTitle, // Job title/tagline
    address: parsed.personal?.address,
    city: parsed.personal?.city,
    country: parsed.personal?.country,
    postalCode: parsed.personal?.postalCode,
    dateOfBirth: parsed.personal?.dateOfBirth, // Important for EU CVs
    nationality: parsed.personal?.nationality, // Important for EU CVs
    linkedIn: parsed.personal?.linkedIn,
    website: parsed.personal?.website,
    github: parsed.personal?.github,
    photoUrl: parsed.personal?.photoUrl,
  };

  cv.summary = parsed.summary;

  // Map experience with ALL fields
  cv.experience = (parsed.experience || []).map((exp: any) => withId({
    company: exp.company || '',
    position: exp.position || '',
    location: exp.location,
    startDate: exp.startDate || { raw: '', confidence: 'low' },
    endDate: exp.endDate,
    current: exp.current || false,
    bullets: exp.bullets || [],
  }));

  // Map education with ALL fields including startDate
  cv.education = (parsed.education || []).map((edu: any) => withId({
    institution: edu.institution || '',
    degree: edu.degree || '',
    field: edu.field,
    location: edu.location,
    startDate: edu.startDate,
    endDate: edu.endDate,
    grade: edu.grade,
    highlights: edu.highlights || [],
  }));

  // Map skills - ensure proper categorization
  cv.skills = (parsed.skills || []).map((cat: any) => withId({
    category: cat.category || 'Skills',
    skills: Array.isArray(cat.skills) ? cat.skills : [],
  }));

  // Map certifications
  cv.certifications = (parsed.certifications || []).map((cert: any) => withId({
    name: cert.name || '',
    issuer: cert.issuer || '',
    date: cert.date,
  }));

  // Map languages
  cv.languages = (parsed.languages || []).map((lang: any) => withId({
    language: lang.language || '',
    proficiency: lang.proficiency || 'Professional',
    certification: lang.certification,
  }));

  // Map projects if present
  cv.projects = (parsed.projects || []).map((proj: any) => withId({
    name: proj.name || '',
    description: proj.description || '',
    technologies: proj.technologies || [],
    url: proj.url,
  }));

  // Map additional sections (volunteer, awards, interests, references, etc.)
  if (parsed.additionalSections && Array.isArray(parsed.additionalSections) && parsed.additionalSections.length > 0) {
    cv.additionalSections = parsed.additionalSections.map((section: any) => withId({
      title: section.title || 'Additional Information',
      items: Array.isArray(section.items) ? section.items.filter(Boolean) : [],
    }));
  }

  return cv;
}
