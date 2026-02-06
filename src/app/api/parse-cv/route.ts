import { NextRequest, NextResponse } from 'next/server';
import pdf from 'pdf-parse';
import { v4 as uuidv4 } from 'uuid';
import { StructuredCV, createEmptyCV, withId } from '@/lib/types/cv-schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Check if we have the required API keys
const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;
const hasBlobStorage = !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const region = (formData.get('region') as string) || 'EU';
    
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Optional: Upload to Vercel Blob if configured
    let pdfUrl: string | undefined;
    if (hasBlobStorage) {
      try {
        const { put } = await import('@vercel/blob');
        const pdfBlob = await put(`originals/${uuidv4()}-${file.name}`, buffer, {
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
    
    // Parse CV - try AI first, fall back to local parsing
    let structuredCV: StructuredCV;
    let parserUsed: 'anthropic' | 'local' = 'local';
    const parseStartTime = Date.now();
    
    if (hasAnthropicKey) {
      try {
        console.log('[Parser] Using Anthropic Claude for CV parsing');
        structuredCV = await parseWithAnthropic(rawText, region as 'US' | 'EU');
        parserUsed = 'anthropic';
      } catch (e) {
        console.warn('[Parser] Anthropic parsing failed, using local parser:', e);
        structuredCV = parseLocally(rawText, region as 'US' | 'EU', file.name);
        parserUsed = 'local';
      }
    } else {
      // No AI available - use local parsing
      console.log('[Parser] No AI API keys configured, using local parser');
      structuredCV = parseLocally(rawText, region as 'US' | 'EU', file.name);
      parserUsed = 'local';
    }
    
    const parseTime = Date.now() - parseStartTime;
    console.log(`[Parser] Completed using ${parserUsed} parser in ${parseTime}ms`);
    console.log(`[Parser] Extracted: ${structuredCV.experience.length} experiences, ${structuredCV.education.length} education entries, ${structuredCV.skills.length} skill categories`);
    
    structuredCV.sourceFileName = file.name;
    structuredCV.sourceFormat = file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx';
    
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
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse CV' },
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
  const nameExclusions = ['resume', 'cv', 'curriculum', 'vitae', 'contact', 'email', 'phone', 'address'];
  for (const line of lines.slice(0, 10)) {
    const lower = line.toLowerCase();
    if (nameExclusions.some(exc => lower.includes(exc))) continue;
    if (line.includes('@') || line.match(/\d{5,}/)) continue;
    
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      const capitalizedWords = words.filter(w => /^[A-Z][a-z]+$/.test(w));
      if (capitalizedWords.length >= 2) {
        cv.personal.fullName = line;
        break;
      }
    }
  }
  
  // Fallback: extract name from email
  if (!cv.personal.fullName && cv.personal.email) {
    const emailName = cv.personal.email.split('@')[0];
    const parts = emailName.split(/[._-]/).filter(p => p.length > 1);
    if (parts.length >= 2) {
      cv.personal.fullName = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
    }
  }
  
  // Extract summary (look for profile/summary section)
  const summaryMatch = rawText.match(/(?:profile|summary|objective|about)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|skills|work)|$)/i);
  if (summaryMatch && summaryMatch[1]) {
    cv.summary = summaryMatch[1].trim().split('\n').slice(0, 5).join(' ').substring(0, 500);
  }
  
  // Extract skills
  const skillsMatch = rawText.match(/(?:skills|competencies|expertise)[:\s]*\n?([\s\S]*?)(?=\n\s*(?:experience|education|languages|certifications)|$)/i);
  if (skillsMatch && skillsMatch[1]) {
    const skillItems = skillsMatch[1]
      .split(/[,;\n•·\-]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && s.length < 50);
    
    if (skillItems.length > 0) {
      cv.skills = [withId({ category: 'Skills', skills: [...new Set(skillItems)].slice(0, 20) })];
    }
  }
  
  // Extract languages
  const knownLanguages = ['english', 'german', 'french', 'spanish', 'italian', 'portuguese', 'dutch', 'russian', 'chinese', 'japanese', 'korean', 'arabic', 'hindi', 'persian', 'farsi', 'dari', 'turkish', 'polish', 'urdu'];
  const proficiencyMap: Record<string, string> = {
    'native': 'Native', 'fluent': 'Fluent', 'professional': 'Professional',
    'intermediate': 'Intermediate', 'basic': 'Basic', 'b1': 'Intermediate',
    'b2': 'Professional', 'c1': 'Fluent', 'c2': 'Native', 'a1': 'Basic', 'a2': 'Basic'
  };
  
  for (const lang of knownLanguages) {
    const pattern = new RegExp(`\\b(${lang})\\b[\\s\\-:()]*(?:(native|fluent|professional|intermediate|basic|b1|b2|c1|c2|a1|a2))?`, 'gi');
    const match = rawText.match(pattern);
    if (match) {
      const profMatch = match[0].match(/(native|fluent|professional|intermediate|basic|b1|b2|c1|c2|a1|a2)/i);
      const profValue = profMatch ? (proficiencyMap[profMatch[1].toLowerCase()] || 'Professional') : 'Professional';
      cv.languages.push(withId({
        language: lang.charAt(0).toUpperCase() + lang.slice(1),
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
5. Split skills into logical categories (e.g., "Programming", "Marketing", "Tools", etc.)
6. For German CVs, look for "Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen", etc.
7. Extract ALL sections present in the CV - do not skip any information
8. For "currentTitle": extract the job title/tagline shown prominently (e.g., "Senior Software Engineer")

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
    { "category": "string (e.g., 'Technical', 'Marketing', 'Languages')", "skills": ["string"] }
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
    model: 'claude-haiku-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });
  
  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');
  
  return parseAIResponse(content.text, region);
}
