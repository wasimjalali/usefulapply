import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import type { StructuredCV, CVDate } from '@/lib/types/cv-schema';

// Create Supabase client for server-side usage
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export const runtime = 'nodejs';
export const maxDuration = 30;

interface GeneratePDFRequest {
  cv: StructuredCV;
  templateId: string;
  userId?: string; // Optional user ID for authenticated uploads
}

interface RenderStats {
  pages: number;
  overflowedSections: string[];
  warnings: string[];
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { cv, templateId, userId }: GeneratePDFRequest = await request.json();
    
    if (!cv || !cv.personal?.fullName) {
      return NextResponse.json(
        { error: 'Invalid CV data' },
        { status: 400 }
      );
    }
    
    const { pdfBytes, stats } = await generatePDF(cv, templateId || 'default');
    
    const fileName = `cv-${cv.id}-${Date.now()}.pdf`;
    
    // Upload to Supabase Storage (generated-pdfs bucket)
    const filePath = userId ? `${userId}/${fileName}` : `anonymous/${fileName}`;
    
    const { data, error: uploadError } = await supabase.storage
      .from('generated-pdfs')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('Supabase upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload PDF: ' + uploadError.message },
        { status: 500 }
      );
    }

    // Get signed URL for the uploaded PDF (valid for 7 days)
    const { data: urlData } = await supabase.storage
      .from('generated-pdfs')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days
    
    return NextResponse.json({
      success: true,
      url: urlData?.signedUrl || null,
      path: data.path,
      fileName,
      stats,
    });
    
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate PDF' },
      { status: 500 }
    );
  }
}

async function generatePDF(
  cv: StructuredCV,
  templateId: string
): Promise<{ pdfBytes: Uint8Array; stats: RenderStats }> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  const isEU = cv.settings.region === 'EU';
  const pageWidth = isEU ? 595.28 : 612;   // A4 or US Letter
  const pageHeight = isEU ? 841.89 : 792;
  const margin = 66; // 66pt margins (2026 Standard - ~0.92in)
  const contentWidth = pageWidth - (margin * 2);
  
  const stats: RenderStats = {
    pages: 1,
    overflowedSections: [],
    warnings: [],
  };
  
  // 2026 Professional CV Font Standards (HR-optimized for readability)
  // Industry standard: 10-12pt body, 12-14pt headers, 16-20pt name
  const FONT_SIZES = {
    name: 20,           // Professional name header (16-20pt standard)
    sectionHeader: 12,  // Section headers (12-14pt standard)
    jobTitle: 11,       // Job/degree titles (slightly larger than body)
    body: 10.5,         // Body text, bullets, skills (10-11pt is ideal for readability)
    small: 9,           // Dates, secondary info
  };
  
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let yPosition = pageHeight - margin;
  
  const primaryColor = rgb(0.12, 0.23, 0.37);
  const textColor = rgb(0.1, 0.1, 0.1);
  const lightColor = rgb(0.4, 0.4, 0.4);
  
  const ensureSpace = (needed: number): PDFPage => {
    if (yPosition - needed < margin) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      yPosition = pageHeight - margin;
      stats.pages++;
      
      if (stats.pages > cv.settings.maxPages) {
        stats.warnings.push(`Content exceeds ${cv.settings.maxPages} page limit`);
      }
    }
    return page;
  };
  
  const wrapText = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) <= maxW) {
        line = test;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  
  const drawText = (
    text: string,
    font: PDFFont,
    size: number,
    color = textColor,
    indent = 0
  ) => {
    const lines = wrapText(text, font, size, contentWidth - indent);
    for (const line of lines) {
      ensureSpace(size + 4);
      page.drawText(line, {
        x: margin + indent,
        y: yPosition,
        size,
        font,
        color,
      });
      yPosition -= size + 4;
    }
  };
  
  const drawSection = (title: string) => {
    ensureSpace(40);
    yPosition -= 12; // margin before section header
    
    page.drawLine({
      start: { x: margin, y: yPosition + 12 },
      end: { x: pageWidth - margin, y: yPosition + 12 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    
    page.drawText(title.toUpperCase(), {
      x: margin,
      y: yPosition,
      size: FONT_SIZES.sectionHeader, // 11pt section headers (matches 14px CSS)
      font: helveticaBold,
      color: primaryColor,
    });
    yPosition -= 18;
  };
  
  const formatDate = (date?: CVDate): string => {
    if (!date) return '';
    if (date.normalized === 'present') return 'Present';
    if (date.normalized) {
      const [year, month] = date.normalized.split('-');
      if (!month) return year;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[parseInt(month) - 1]} ${year}`;
    }
    return date.raw;
  };
  
  page.drawText(cv.personal.fullName, {
    x: margin,
    y: yPosition,
    size: FONT_SIZES.name, // 20pt name header (professional standard)
    font: helveticaBold,
    color: primaryColor,
  });
  yPosition -= 26;
  
  const contact = [
    cv.personal.email,
    cv.personal.phone,
    cv.personal.city && cv.personal.country 
      ? `${cv.personal.city}, ${cv.personal.country}` 
      : cv.personal.city || cv.personal.country,
    cv.personal.linkedIn?.replace('https://www.linkedin.com/in/', 'linkedin.com/in/'),
  ].filter(Boolean).join(' | ');
  
  page.drawText(contact, {
    x: margin,
    y: yPosition,
    size: FONT_SIZES.body, // 9pt contact info (matches 12px CSS)
    font: helvetica,
    color: lightColor,
  });
  yPosition -= 16;
  
  if (cv.summary) {
    drawSection('Professional Summary');
    drawText(cv.summary, helvetica, FONT_SIZES.body); // 9pt body text (matches 12px CSS)
  }
  
  if (cv.experience.length > 0) {
    drawSection('Professional Experience');
    
    for (const exp of cv.experience) {
      ensureSpace(50);
      
      page.drawText(exp.position, {
        x: margin,
        y: yPosition,
        size: FONT_SIZES.jobTitle, // 10pt job title (matches 13px CSS)
        font: helveticaBold,
        color: textColor,
      });
      
      const dateStr = `${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}`;
      const dateW = helvetica.widthOfTextAtSize(dateStr, FONT_SIZES.small);
      page.drawText(dateStr, {
        x: pageWidth - margin - dateW,
        y: yPosition,
        size: FONT_SIZES.small, // 8pt dates
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 12;
      
      const companyLine = exp.location ? `${exp.company}, ${exp.location}` : exp.company;
      page.drawText(companyLine, {
        x: margin,
        y: yPosition,
        size: FONT_SIZES.body, // 9pt company info
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 14;
      
      for (const bullet of exp.bullets) {
        drawText(`• ${bullet}`, helvetica, FONT_SIZES.body, textColor, 8); // 9pt bullets (matches 12px CSS)
      }
      
      yPosition -= 8;
    }
  }
  
  if (cv.education.length > 0) {
    drawSection('Education');
    
    for (const edu of cv.education) {
      ensureSpace(40);
      
      const degreeLine = edu.field ? `${edu.degree}, ${edu.field}` : edu.degree;
      page.drawText(degreeLine, {
        x: margin,
        y: yPosition,
        size: FONT_SIZES.jobTitle, // 10pt degree title (matches 13px CSS)
        font: helveticaBold,
        color: textColor,
      });
      
      if (edu.endDate) {
        const eduDate = formatDate(edu.endDate);
        const eduW = helvetica.widthOfTextAtSize(eduDate, FONT_SIZES.small);
        page.drawText(eduDate, {
          x: pageWidth - margin - eduW,
          y: yPosition,
          size: FONT_SIZES.small, // 8pt dates
          font: helvetica,
          color: lightColor,
        });
      }
      yPosition -= 12;
      
      const instLine = edu.location ? `${edu.institution}, ${edu.location}` : edu.institution;
      page.drawText(instLine, {
        x: margin,
        y: yPosition,
        size: FONT_SIZES.body, // 9pt institution
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 10;
      
      if (edu.grade) {
        page.drawText(`Grade: ${edu.grade}`, {
          x: margin,
          y: yPosition,
          size: FONT_SIZES.body, // 9pt grade
          font: helvetica,
          color: textColor,
        });
        yPosition -= 10;
      }
      
      yPosition -= 6;
    }
  }
  
  if (cv.skills.length > 0) {
    drawSection('Skills');
    
    for (const cat of cv.skills) {
      const skillLine = `${cat.category}: ${cat.skills.join(', ')}`;
      drawText(skillLine, helvetica, FONT_SIZES.body); // 9pt skills (matches 12px CSS)
      yPosition -= 2;
    }
  }
  
  if (cv.certifications.length > 0) {
    drawSection('Certifications');
    
    for (const cert of cv.certifications) {
      const certLine = cert.date 
        ? `• ${cert.name} – ${cert.issuer} (${formatDate(cert.date)})` 
        : `• ${cert.name} – ${cert.issuer}`;
      drawText(certLine, helvetica, FONT_SIZES.body); // 9pt certifications (matches 12px CSS)
    }
  }
  
  if (cv.languages.length > 0) {
    drawSection('Languages');
    
    const langLine = cv.languages
      .map(l => `${l.language} (${l.proficiency})${l.certification ? ` – ${l.certification}` : ''}`)
      .join(' | ');
    drawText(langLine, helvetica, FONT_SIZES.body); // 9pt languages (matches 12px CSS)
  }
  
  const pdfBytes = await pdfDoc.save();
  
  return { pdfBytes, stats };
}
