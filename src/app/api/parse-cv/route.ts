import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import { StructuredCV, createEmptyCV, withId } from '@/lib/types/cv-schema';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { detectCVLanguage, extractOriginalHeaders, generateLocalizedHeaders, splitIntoSections } from '@/lib/cv-parser/section-splitter';

export const runtime = 'nodejs';
export const maxDuration = 60;

// File size limit: 10 MB
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// Check if we have the required API keys
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;

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

    // Auth check: anonymous users get local-only parsing (no AI cost); authenticated users get AI parsing
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const isAuthenticated = !!user;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const region = (formData.get('region') as string) || 'EU';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // File size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.` },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Optional: Upload to Vercel Blob — authenticated users only, stored under their user ID
    let pdfUrl: string | undefined;
    if (hasBlobStorage && isAuthenticated && user) {
      try {
        const { put } = await import('@vercel/blob');
        const pdfBlob = await put(`originals/${user.id}/${uuidv4()}-${file.name}`, buffer, {
          access: 'public',
          contentType: 'application/pdf',
        });
        pdfUrl = pdfBlob.url;
      } catch (e) {
        console.warn('Blob storage not available, skipping upload');
      }
    }
    
    // Extract text from PDF
    let rawText = '';
    if (file.name.toLowerCase().endsWith('.pdf')) {
      try {
        const pdfData = await pdf(buffer);
        rawText = pdfData.text;
      } catch (e) {
        console.error('PDF parsing failed:', e);
        return NextResponse.json({ error: 'Failed to parse PDF file' }, { status: 400 });
      }
    } else {
      rawText = buffer.toString('utf-8');
    }
    
    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 });
    }
    
    // Parse CV - AI parsing for authenticated users only (prevents API cost abuse)
    let structuredCV: StructuredCV;
    let parserUsed: 'anthropic' | 'local' = 'local';
    const parseStartTime = Date.now();

    if (hasAnthropicKey && isAuthenticated) {
      try {
        structuredCV = await parseWithAnthropic(rawText, region as 'US' | 'EU');
        parserUsed = 'anthropic';
      } catch (e) {
        console.warn('[Parser] Anthropic parsing failed, using local parser:', e);
        structuredCV = parseLocally(rawText, region as 'US' | 'EU', file.name);
        parserUsed = 'local';
      }
    } else {
      // Anonymous users or no AI key — use local parsing (free)
      structuredCV = parseLocally(rawText, region as 'US' | 'EU', file.name);
      parserUsed = 'local';
    }
    
    const parseTime = Date.now() - parseStartTime;
    console.log(`[Parser] Completed using ${parserUsed} parser in ${parseTime}ms`);
    console.log(`[Parser] Extracted: ${structuredCV.experience.length} experiences, ${structuredCV.education.length} education entries, ${structuredCV.skills.length} skill categories`);
    
    structuredCV.sourceFileName = file.name;
    structuredCV.sourceFormat = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';

    // Detect CV language and generate localized strings (Present/Heute, GPA/Note, etc.)
    const detectedLang = detectCVLanguage(rawText);
    const { localizedStrings } = generateLocalizedHeaders(detectedLang);

    // Use the user's ORIGINAL section header text instead of generic localized headers
    const originalHeaders = extractOriginalHeaders(rawText);
    structuredCV.sectionHeaders = originalHeaders;
    structuredCV.localizedStrings = localizedStrings;
    structuredCV.settings.language = detectedLang;

    // Guard sections: only keep data for sections that actually exist in the CV text.
    // Prevents fabricating sections from scattered mentions (e.g., language names in bullets).
    const detectedSections = splitIntoSections(rawText);
    if (!detectedSections.has('PROJECTS')) {
      structuredCV.projects = undefined;
    }
    if (!detectedSections.has('LANGUAGES')) {
      structuredCV.languages = [];
    }
    if (!detectedSections.has('CERTIFICATIONS')) {
      structuredCV.certifications = [];
    }
    
    return NextResponse.json({
      success: true,
      structuredCV,
      originalPdf: {
        id: uuidv4(),
        url: pdfUrl,
        fileName: file.name,
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
 * Local CV parser - works without any external API
 */
function parseLocally(rawText: string, region: 'US' | 'EU', fileName: string): StructuredCV {
  const cv = createEmptyCV(region);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  
  // Extract email
  const emailMatch = rawText.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (emailMatch) cv.personal.email = emailMatch[0];
  
  // Extract phone
  const phoneMatch = rawText.match(/[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,4}[-\s\.]?[0-9]{1,9}/);
  if (phoneMatch) cv.personal.phone = phoneMatch[0];
  
  // Extract name from first few lines (skip common headers)
  const nameExclusions = ['resume', 'cv', 'curriculum', 'vitae', 'contact', 'email', 'phone', 'address', 'lebenslauf', 'bewerbung'];
  for (const line of lines.slice(0, 10)) {
    const lower = line.toLowerCase();
    if (nameExclusions.some(exc => lower.includes(exc))) continue;
    if (line.includes('@') || line.match(/\d{5,}/) || line.match(/http/i)) continue;
    // Skip lines that are clearly section headers
    if (/^(PROFILE|SUMMARY|EXPERIENCE|EDUCATION|SKILLS|PROFIL|BERUF)/i.test(line)) continue;

    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 5) {
      // Accept names with accented characters (À-ÿ) and ALL CAPS names
      const nameWords = words.filter(w => /^[A-ZÀ-Ý][a-zà-ÿ]+$/.test(w) || /^[A-ZÀ-Ý]{2,}$/.test(w));
      if (nameWords.length >= 2) {
        cv.personal.fullName = line;
        break;
      }
    }
  }
  // No email-based name fallback — better to leave blank than guess wrong
  
  // Extract summary (look for profile/summary section)
  const summaryMatch = rawText.match(/(?:profile|summary|objective|about)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|skills|work)|$)/i);
  if (summaryMatch && summaryMatch[1]) {
    cv.summary = summaryMatch[1].trim().split('\n').slice(0, 5).join(' ').substring(0, 500);
  }
  
  // Extract skills — preserve proficiency levels like "Python (Proficient)" or "Excel - Advanced"
  const skillsMatch = rawText.match(/(?:skills|competencies|expertise)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|languages|certifications)|$)/i);
  if (skillsMatch && skillsMatch[1]) {
    // Split on commas, semicolons, newlines, and bullets — but NOT dashes (which separate "Skill - Level")
    const rawItems = skillsMatch[1]
      .split(/[,;\n•·]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 80);

    // Normalize "Skill - Level" and "Skill: Level" to "Skill (Level)" format
    const proficiencyKeywords = /^(native|fluent|proficient|professional|intermediate|basic|beginner|advanced|fundamental|fundamentals|expert|good|excellent|working knowledge|verhandlungssicher|fließend|grundkenntnisse|gute kenntnisse|sehr gute kenntnisse|fortgeschritten)$/i;
    const skillItems = rawItems.map(item => {
      // Pattern: "Skill - Level" or "Skill – Level"
      const dashMatch = item.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        const [, skillPart, levelPart] = dashMatch;
        if (proficiencyKeywords.test(levelPart.trim())) {
          return `${skillPart.trim()} (${levelPart.trim()})`;
        }
      }
      // Pattern: "Skill: Level" (where Level is a known proficiency term)
      const colonMatch = item.match(/^(.+?):\s*(.+)$/);
      if (colonMatch) {
        const [, skillPart, levelPart] = colonMatch;
        if (proficiencyKeywords.test(levelPart.trim())) {
          return `${skillPart.trim()} (${levelPart.trim()})`;
        }
      }
      return item;
    }).filter(s => s.length > 1 && s.length < 80);

    if (skillItems.length > 0) {
      cv.skills = [withId({ category: 'Skills', skills: [...new Set(skillItems)].slice(0, 20) })];
    }
  }
  
  // Extract languages — includes both English and native-language names
  const knownLanguages = [
    'english', 'englisch', 'german', 'deutsch', 'french', 'français',
    'spanish', 'español', 'italian', 'italiano', 'portuguese', 'português',
    'dutch', 'niederländisch', 'russian', 'russisch', 'chinese', 'chinesisch',
    'mandarin', 'japanese', 'japanisch', 'korean', 'koreanisch', 'arabic', 'arabisch',
    'hindi', 'persian', 'persisch', 'farsi', 'dari', 'turkish', 'türkisch',
    'polish', 'polnisch', 'urdu', 'swedish', 'schwedisch', 'norwegian', 'norwegisch',
    'danish', 'dänisch', 'finnish', 'finnisch', 'greek', 'griechisch',
    'hebrew', 'hebräisch', 'czech', 'tschechisch', 'hungarian', 'ungarisch',
    'romanian', 'rumänisch', 'croatian', 'serbian', 'bulgarian', 'ukrainian',
    'vietnamese', 'thai', 'indonesian', 'malay', 'catalan', 'slovak',
  ];
  const proficiencyMap: Record<string, string> = {
    'native': 'Native', 'fluent': 'Fluent', 'professional': 'Professional',
    'intermediate': 'Intermediate', 'basic': 'Basic', 'b1': 'Intermediate',
    'b2': 'Professional', 'c1': 'Fluent', 'c2': 'Native', 'a1': 'Basic', 'a2': 'Basic',
    // German proficiency terms
    'muttersprache': 'Native', 'verhandlungssicher': 'Fluent',
    'fließend': 'Fluent', 'grundkenntnisse': 'Basic',
    'gute kenntnisse': 'Intermediate', 'sehr gute kenntnisse': 'Professional',
    // French proficiency terms
    'langue maternelle': 'Native', 'courant': 'Fluent', 'bilingue': 'Native',
    'notions': 'Basic', 'débutant': 'Basic', 'intermédiaire': 'Intermediate', 'avancé': 'Fluent',
  };
  // Deduplicate: map native-language names to English to avoid duplicates
  const langNameToEnglish: Record<string, string> = {
    'englisch': 'English', 'deutsch': 'German', 'français': 'French',
    'español': 'Spanish', 'italiano': 'Italian', 'português': 'Portuguese',
    'niederländisch': 'Dutch', 'russisch': 'Russian', 'chinesisch': 'Chinese',
    'japanisch': 'Japanese', 'koreanisch': 'Korean', 'arabisch': 'Arabic',
    'persisch': 'Persian', 'türkisch': 'Turkish', 'polnisch': 'Polish',
    'schwedisch': 'Swedish', 'norwegisch': 'Norwegian', 'dänisch': 'Danish',
    'finnisch': 'Finnish', 'griechisch': 'Greek', 'hebräisch': 'Hebrew',
    'tschechisch': 'Czech', 'ungarisch': 'Hungarian', 'rumänisch': 'Romanian',
  };
  const foundLangs = new Set<string>();

  for (const lang of knownLanguages) {
    const profTerms = 'native|fluent|professional|intermediate|basic|b1|b2|c1|c2|a1|a2|muttersprache|verhandlungssicher|fließend|grundkenntnisse|courant|bilingue';
    const pattern = new RegExp(`\\b(${lang})\\b[\\s\\-:()]*(?:(${profTerms}))?`, 'gi');
    const match = rawText.match(pattern);
    if (match) {
      // Normalize to English name and deduplicate
      const englishName = langNameToEnglish[lang.toLowerCase()] || (lang.charAt(0).toUpperCase() + lang.slice(1));
      if (foundLangs.has(englishName.toLowerCase())) continue;
      foundLangs.add(englishName.toLowerCase());

      const profMatch = match[0].match(new RegExp(`(${profTerms})`, 'i'));
      const profValue = profMatch ? (proficiencyMap[profMatch[1].toLowerCase()] || 'Professional') : 'Professional';
      cv.languages.push(withId({
        language: englishName,
        proficiency: profValue as 'Native' | 'Fluent' | 'Professional' | 'Intermediate' | 'Basic',
      }));
    }
  }
  
  return cv;
}

/**
 * Get the parsing prompt for AI
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
  ]
}
`;
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
  
  return cv;
}

/**
 * Parse CV using Anthropic
 */
async function parseWithAnthropic(rawText: string, region: 'US' | 'EU'): Promise<StructuredCV> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const anthropic = new Anthropic();
  
  const prompt = getParsingPrompt(rawText);

  const response = await anthropic.messages.create({
    model: process.env.USE_FALLBACK_MODEL === 'true' ? 'claude-haiku-4-5' : (process.env.USE_PREVIOUS_MODEL === 'true' ? 'claude-sonnet-4-5-20250929' : 'claude-sonnet-4-6'),
    max_tokens: 4096,
    temperature: 0.3,
    system: 'You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.',
    messages: [{ role: 'user', content: prompt }],
  });
  
  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');
  
  return parseAIResponse(content.text, region);
}
