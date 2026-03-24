import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { StructuredCV, createEmptyCV, withId } from '@/lib/types/cv-schema';
import { getPostHogServer } from '@/lib/posthog-server';
import { checkRateLimit, getClientIP, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { createClient } from '@/lib/supabase/server';
import { detectCVLanguage, extractOriginalHeaders, generateLocalizedHeaders, splitIntoSections } from '@/lib/cv-parser/section-splitter';
import { callAnthropic, extractDocumentText } from '@/lib/models/anthropic';

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

/**
 * Check if extracted text is actually readable (not garbage from broken font encoding).
 * PDFs with custom fonts can produce 200+ chars of symbols like §!Ýû that pass length checks.
 */
function isReadableText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 50) return false;
  // Sample the first 500 chars to check quality
  const sample = trimmed.substring(0, 500);
  // Count alphanumeric + common accented Latin characters
  const readable = sample.match(/[a-zA-Z0-9À-ÿ]/g)?.length || 0;
  const ratio = readable / sample.length;
  // Readable CV text should be at least 30% alphanumeric
  return ratio >= 0.3;
}

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

    // Two input modes:
    // 1) FormData with 'file' field — direct upload (≤ 4.5 MB, Vercel body limit)
    // 2) JSON with 'storagePath' + 'fileName' — storage-first (up to 10 MB)
    let buffer: Buffer = undefined!;
    let originalFileName = '';
    let fileExt: string;
    let region = 'EU';

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      // Mode 2: Storage-first — file already uploaded to Supabase Storage
      if (!isAuthenticated) {
        return NextResponse.json({ error: 'Authentication required for storage-based parsing.' }, { status: 401 });
      }

      const body = await request.json();
      const { storagePath, fileName } = body;
      region = body.region || 'EU';

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

    // Original PDFs are already stored securely in Supabase Storage (storage-first path).
    // No public blob upload — CVs contain sensitive personal data.

    // Extract text based on file type
    console.log(`[Parser] Starting extraction: file=${originalFileName}, ext=${fileExt}, bufferSize=${buffer.length}, mode=${contentType.includes('application/json') ? 'storage' : 'direct'}`);
    let rawText = '';
    if (fileExt === '.pdf') {
      rawText = await extractTextFromPDF(buffer);
    } else if (fileExt === '.docx') {
      rawText = extractTextFromDOCX(buffer);
    } else {
      rawText = buffer.toString('utf-8');
    }

    // If local extraction got insufficient or unreadable text, try AI document understanding for PDFs
    if ((!rawText || !isReadableText(rawText)) && fileExt === '.pdf') {
      const reason = !rawText || rawText.trim().length < 50 ? 'insufficient text' : 'unreadable text (broken font encoding)';
      console.log(`[Parser] ${reason} from local extraction (${rawText?.trim().length || 0} chars), trying AI document understanding...`);

      if (hasAICapability && isAuthenticated) {
        try {
          rawText = await extractDocumentText(buffer);
          console.log(`[Parser] AI document extraction: ${rawText.length} chars`);
        } catch (e) {
          console.error('[Parser] AI document extraction failed:', e);
        }
      }
    }

    if (!rawText || !isReadableText(rawText)) {
      console.error(`[Parser] All text extraction methods failed. Final length: ${rawText?.trim().length || 0} chars, readable: ${rawText ? isReadableText(rawText) : false}`);
      return NextResponse.json(
        { error: 'Could not extract text from file. The file may be image-based (scanned), use custom fonts, or be empty. Please try uploading a text-based PDF, or use TXT/MD format instead.' },
        { status: 400 }
      );
    }

    // Cap text length to avoid AI timeout — 20K chars ≈ 6K tokens, keeps parsing under 40s
    const MAX_AI_TEXT_LENGTH = 20000;
    const textForAI = rawText.length > MAX_AI_TEXT_LENGTH
      ? rawText.substring(0, MAX_AI_TEXT_LENGTH) + '\n\n[... truncated for parsing efficiency ...]'
      : rawText;
    if (rawText.length > MAX_AI_TEXT_LENGTH) {
      console.log(`[Parser] Text truncated for AI: ${rawText.length} → ${MAX_AI_TEXT_LENGTH} chars`);
    }

    // Parse CV - AI parsing for authenticated users only (prevents API cost abuse)
    let structuredCV: StructuredCV;
    let parserUsed: 'ai' | 'local' = 'local';
    const parseStartTime = Date.now();

    if (hasAICapability && isAuthenticated) {
      try {
        structuredCV = await parseWithAI(textForAI, region as 'US' | 'EU');
        parserUsed = 'ai';
      } catch (e) {
        console.warn('[Parser] AI parsing failed, using local parser:', e);
        structuredCV = parseLocally(rawText, region as 'US' | 'EU', originalFileName);
        parserUsed = 'local';
      }
    } else {
      structuredCV = parseLocally(rawText, region as 'US' | 'EU', originalFileName);
      parserUsed = 'local';
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

    // Guard sections: only keep data for sections that actually exist in the CV text.
    // Only apply to local parser — the AI parser is reliable and the AI-extracted rawText
    // may format section headers differently than what splitIntoSections expects.
    const detectedSections = splitIntoSections(rawText);
    if (parserUsed === 'local') {
      // Local parser can fabricate languages from scattered mentions (e.g., "Python" as a language)
      if (!detectedSections.has('LANGUAGES')) {
        structuredCV.languages = [];
      }
      if (!detectedSections.has('CERTIFICATIONS')) {
        structuredCV.certifications = [];
      }
      if (!detectedSections.has('PROJECTS')) {
        structuredCV.projects = undefined;
      }
    }

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
 * Extract text from PDF using pdfjs-dist (Mozilla's official PDF.js).
 * Falls back to binary PDF text extraction if pdfjs-dist fails.
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // Approach 1: pdfjs-dist (full parser — handles all PDF features)
  try {
    // Polyfill browser APIs that pdfjs-dist v5.x requires at module load time.
    // Only needed for rendering (not text extraction), but the module won't load without them.
    installPDFJSPolyfills();

    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    console.log('[Parser] pdfjs-dist loaded successfully');

    // pdfjs-dist requires Uint8Array, not Node.js Buffer
    const data = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const doc = await pdfjsLib.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
    }).promise;

    let fullText = '';
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let lastY: number | undefined;
      let lastX: number | undefined;
      let pageText = '';
      for (const item of content.items) {
        if ('str' in item) {
          const textItem = item as { str: string; transform: number[]; width?: number; hasEOL?: boolean };
          const currentY = textItem.transform[5];
          const currentX = textItem.transform[4];

          if (lastY !== undefined && Math.abs(lastY - currentY) > 1) {
            // Different line — add newline
            pageText += '\n';
          } else if (lastX !== undefined && textItem.str.length > 0 && pageText.length > 0) {
            // Same line — add space if there's a gap between items
            const gap = currentX - lastX;
            if (gap > 2 && !pageText.endsWith(' ') && !textItem.str.startsWith(' ')) {
              pageText += ' ';
            }
          }

          pageText += textItem.str;

          if (textItem.hasEOL) {
            pageText += '\n';
          }

          lastY = currentY;
          // Track end X position for space detection
          lastX = currentX + (textItem.width || textItem.str.length * 5);
        }
      }
      fullText += (i > 1 ? '\n\n' : '') + pageText;
    }

    doc.destroy();
    console.log(`[Parser] pdfjs-dist extracted: ${fullText.length} chars from ${doc.numPages} pages`);
    if (fullText.trim().length >= 50 && isReadableText(fullText)) {
      return fullText;
    }
    console.log(`[Parser] pdfjs-dist text ${fullText.trim().length < 50 ? 'insufficient' : 'unreadable (broken font encoding)'}, trying binary fallback...`);
  } catch (e) {
    console.error('[Parser] pdfjs-dist failed:', (e as Error).message);
    console.error('[Parser] Stack:', (e as Error).stack?.split('\n').slice(0, 3).join('\n'));
  }

  // Approach 2: Binary PDF text extraction (no dependencies — works everywhere)
  // Decompresses FlateDecode streams and extracts text from PDF operators
  try {
    const text = extractTextFromPDFBinary(buffer);
    if (text.trim().length >= 50 && isReadableText(text)) {
      console.log(`[Parser] Binary fallback extracted: ${text.length} chars`);
      return text;
    }
    console.log(`[Parser] Binary fallback ${text.trim().length < 50 ? `got only ${text.trim().length} chars` : 'text unreadable (broken font encoding)'}`);
  } catch (e) {
    console.error('[Parser] Binary fallback failed:', (e as Error).message);
  }

  return '';
}

/**
 * Extract text from PDF binary data without any external library.
 * Decompresses FlateDecode streams and extracts text from Tj/TJ operators.
 * Handles both parenthesized strings (text) and hex strings <hex>.
 */
/** Install minimal polyfills for pdfjs-dist v5.x in Node.js serverless */
function installPDFJSPolyfills() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // eslint-disable-next-line @typescript-eslint/no-extraneous-class
    const DM = function DOMMatrix(this: Record<string, number>, init?: string | number[]) {
      // 4x4 identity matrix defaults
      this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
      this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
      this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
      this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
      // Alias properties (a-f for 2D transforms)
      this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
      this.is2D = 1;
      if (Array.isArray(init) && init.length === 6) {
        this.a = this.m11 = init[0]; this.b = this.m12 = init[1];
        this.c = this.m21 = init[2]; this.d = this.m22 = init[3];
        this.e = this.m41 = init[4]; this.f = this.m42 = init[5];
      }
    } as unknown as typeof globalThis.DOMMatrix;
    // Static methods
    (DM as any).fromMatrix = () => new (DM as any)();
    (DM as any).fromFloat64Array = (a: Float64Array) => new (DM as any)(Array.from(a));
    (DM as any).fromFloat32Array = (a: Float32Array) => new (DM as any)(Array.from(a));
    // Instance methods — pdfjs-dist calls these during text extraction for glyph positioning
    const proto = (DM as any).prototype;
    proto.multiply = function (other: any) { return new (DM as any)(); };
    proto.inverse = function () { return new (DM as any)(); };
    proto.translate = function () { return new (DM as any)(); };
    proto.scale = function () { return new (DM as any)(); };
    proto.rotate = function () { return new (DM as any)(); };
    proto.rotateAxisAngle = function () { return new (DM as any)(); };
    proto.transformPoint = function (p: any) { return p || { x: 0, y: 0, z: 0, w: 1 }; };
    proto.toFloat64Array = function () { return new Float64Array(16); };
    proto.toString = function () { return 'matrix(1, 0, 0, 1, 0, 0)'; };
    globalThis.DOMMatrix = DM;
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = function Path2D() {} as unknown as typeof globalThis.Path2D;
    const p = globalThis.Path2D.prototype as unknown as Record<string, () => void>;
    p.addPath = p.closePath = p.moveTo = p.lineTo = p.bezierCurveTo = p.rect = p.arc = p.ellipse = function () {};
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = function ImageData(this: { width: number; height: number; data: Uint8ClampedArray }, w: number, h: number) {
      this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4);
    } as unknown as typeof globalThis.ImageData;
  }
}

function extractTextFromPDFBinary(buffer: Buffer): string {
  const zlib = require('zlib') as typeof import('zlib');
  const texts: string[] = [];

  // Find and decompress all streams
  let pos = 0;
  while (pos < buffer.length) {
    // Find "stream\n" or "stream\r\n"
    let streamStart = buffer.indexOf('stream\n', pos);
    let headerLen = 7;
    if (streamStart === -1) {
      streamStart = buffer.indexOf('stream\r\n', pos);
      headerLen = 8;
      if (streamStart === -1) break;
    }
    pos = streamStart + headerLen;

    const endStream = buffer.indexOf('endstream', pos);
    if (endStream === -1) break;

    // Trim trailing whitespace from stream data
    let endPos = endStream;
    while (endPos > pos && (buffer[endPos - 1] === 0x0a || buffer[endPos - 1] === 0x0d)) endPos--;
    const streamData = buffer.subarray(pos, endPos);

    let decoded: string;
    try {
      const inflated = zlib.inflateSync(streamData);
      decoded = inflated.toString('latin1');
    } catch {
      decoded = streamData.toString('latin1');
    }

    // Extract text between BT...ET blocks (text objects)
    const btBlocks = decoded.matchAll(/BT\s*([\s\S]*?)\s*ET/g);
    for (const block of btBlocks) {
      const content = block[1];

      // Hex strings: <4A6F686E...> Tj
      const hexTj = content.matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g);
      for (const m of hexTj) {
        texts.push(decodeHexString(m[1]));
      }

      // Parenthesized strings: (text) Tj
      const parenTj = content.matchAll(/\(([^)]*)\)\s*Tj/g);
      for (const m of parenTj) {
        texts.push(decodePDFString(m[1]));
      }

      // TJ arrays: [<hex> num <hex> ...] TJ or [(text) num ...] TJ
      const tjArrays = content.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
      for (const m of tjArrays) {
        const parts: string[] = [];
        // Match both hex and paren strings in the array
        const items = m[1].matchAll(/<([0-9A-Fa-f\s]+)>|\(([^)]*)\)/g);
        for (const item of items) {
          if (item[1]) parts.push(decodeHexString(item[1]));
          else if (item[2]) parts.push(decodePDFString(item[2]));
        }
        if (parts.length > 0) texts.push(parts.join(''));
      }
    }

    pos = endStream + 9;
  }

  // Deduplicate: binary extraction processes ALL streams (page content + form XObjects)
  // which can contain the same text twice. Remove consecutive duplicate lines.
  const rawResult = texts.join('\n').replace(/\r/g, '\n');
  const lines = rawResult.split('\n');
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      // Preserve blank lines for structure but collapse multiples
      if (deduped.length > 0 && deduped[deduped.length - 1] !== '') {
        deduped.push('');
      }
      continue;
    }
    // Skip exact duplicate lines (handles doubled streams)
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    deduped.push(line);
  }
  return deduped.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Decode hex-encoded PDF string: "4A6F686E" → "John" */
function decodeHexString(hex: string): string {
  const clean = hex.replace(/\s/g, '');
  let result = '';
  for (let i = 0; i < clean.length; i += 2) {
    result += String.fromCharCode(parseInt(clean.substring(i, i + 2), 16));
  }
  return result;
}

/** Decode PDF escape sequences in parenthesized strings */
function decodePDFString(s: string): string {
  return s
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\')
    .replace(/\\([()])/g, '$1')
    .replace(/\\(\d{1,3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
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
 * Parse CV using AI (supports both Bedrock and direct Anthropic API)
 */
async function parseWithAI(rawText: string, region: 'US' | 'EU'): Promise<StructuredCV> {
  const prompt = getParsingPrompt(rawText);

  const response = await callAnthropic({
    prompt,
    systemPrompt: 'You are a precise CV parser. Extract factual information only. Return valid JSON. Do not infer or fabricate any information not explicitly present in the source document.',
    temperature: 0.3,
    maxTokens: 4096,
    jsonMode: true,
  });

  return parseAIResponse(response.content, region);
}

/**
 * Local CV parser - works without any external API
 */
function parseLocally(rawText: string, region: 'US' | 'EU', fileName: string): StructuredCV {
  const cv = createEmptyCV(region);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // Use section splitter for projects and additional info
  const sections = splitIntoSections(rawText);

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

  // Extract projects from dedicated section
  const projectsContent = sections.get('PROJECTS');
  if (projectsContent) {
    const projLines = projectsContent.split('\n').map((l: string) => l.trim()).filter(Boolean);
    let currentProj: { name: string; bullets: string[] } | null = null;
    const projects: typeof cv.projects = [];
    for (const line of projLines) {
      if (line.startsWith('•') || line.startsWith('-') || line.startsWith('*')) {
        if (currentProj) currentProj.bullets.push(line.replace(/^[•\-\*]\s*/, '').trim());
      } else if (line.length > 0 && line.length < 150) {
        if (currentProj && currentProj.name) {
          projects!.push(withId({ name: currentProj.name, description: currentProj.bullets.join(' '), technologies: [] as string[] }));
        }
        currentProj = { name: line, bullets: [] };
      }
    }
    if (currentProj && currentProj.name) {
      projects!.push(withId({ name: currentProj.name, description: currentProj.bullets.join(' '), technologies: [] as string[] }));
    }
    if (projects!.length > 0) cv.projects = projects;
  }

  // Extract additional info and custom sections
  const allAdditionalSections: typeof cv.additionalSections = [];

  // True "Additional Information" catch-all
  const additionalContent = sections.get('ADDITIONAL INFORMATION');
  if (additionalContent) {
    const items = additionalContent
      .split(/[•\n]/)
      .map((i: string) => i.trim())
      .filter((i: string) => i.length > 2 && i.length < 200)
      .filter((i: string) => !i.match(/^additional\s+information$/i));
    const unique = [...new Set(items)];
    if (unique.length > 0) {
      allAdditionalSections.push(withId({ title: 'Additional Information', items: unique }));
    }
  }

  // Extract other non-canonical sections (achievements, volunteer, publications, etc.)
  const canonicalKeys = new Set(['SUMMARY', 'EXPERIENCE', 'EDUCATION', 'SKILLS', 'LANGUAGES', 'CERTIFICATIONS', 'PROJECTS', 'ADDITIONAL INFORMATION']);
  const customTitles: Record<string, string> = {
    'ACHIEVEMENTS': 'Selected Achievements', 'VOLUNTEER': 'Volunteer Experience',
    'PUBLICATIONS': 'Publications', 'REFERENCES': 'References',
    'INTERESTS': 'Interests', 'TEACHING': 'Teaching Experience',
    'RESEARCH': 'Research', 'COURSEWORK': 'Relevant Coursework',
    'PORTFOLIO': 'Portfolio',
  };
  for (const [key, content] of sections) {
    if (canonicalKeys.has(key) || !content || content.trim().length < 3) continue;
    const title = customTitles[key] || key.charAt(0) + key.slice(1).toLowerCase();
    const items = content.split(/[•\n]/).map((i: string) => i.trim()).filter((i: string) => i.length > 2 && i.length < 500);
    if (items.length > 0) {
      allAdditionalSections.push(withId({ title, items: [...new Set(items)] }));
    }
  }

  if (allAdditionalSections.length > 0) {
    cv.additionalSections = allAdditionalSections;
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
