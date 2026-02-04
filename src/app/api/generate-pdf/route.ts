import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import type { StructuredCV, CVDate } from '@/lib/types/cv-schema';

// Create Supabase client for server-side usage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

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
  const pageWidth = isEU ? 595.28 : 612;
  const pageHeight = isEU ? 841.89 : 792;
  const margin = 50;
  const contentWidth = pageWidth - (margin * 2);
  
  const stats: RenderStats = {
    pages: 1,
    overflowedSections: [],
    warnings: [],
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
    ensureSpace(35);
    yPosition -= 12;
    
    page.drawLine({
      start: { x: margin, y: yPosition + 14 },
      end: { x: pageWidth - margin, y: yPosition + 14 },
      thickness: 0.5,
      color: rgb(0.85, 0.85, 0.85),
    });
    
    page.drawText(title.toUpperCase(), {
      x: margin,
      y: yPosition,
      size: 11,
      font: helveticaBold,
      color: primaryColor,
    });
    yPosition -= 20;
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
    size: 24,
    font: helveticaBold,
    color: primaryColor,
  });
  yPosition -= 30;
  
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
    size: 9,
    font: helvetica,
    color: lightColor,
  });
  yPosition -= 20;
  
  if (cv.summary) {
    drawSection('Professional Summary');
    drawText(cv.summary, helvetica, 10);
  }
  
  if (cv.experience.length > 0) {
    drawSection('Professional Experience');
    
    for (const exp of cv.experience) {
      ensureSpace(60);
      
      page.drawText(exp.position, {
        x: margin,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: textColor,
      });
      
      const dateStr = `${formatDate(exp.startDate)} – ${exp.current ? 'Present' : formatDate(exp.endDate)}`;
      const dateW = helvetica.widthOfTextAtSize(dateStr, 10);
      page.drawText(dateStr, {
        x: pageWidth - margin - dateW,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 14;
      
      const companyLine = exp.location ? `${exp.company}, ${exp.location}` : exp.company;
      page.drawText(companyLine, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 16;
      
      for (const bullet of exp.bullets) {
        drawText(`• ${bullet}`, helvetica, 10, textColor, 8);
      }
      
      yPosition -= 10;
    }
  }
  
  if (cv.education.length > 0) {
    drawSection('Education');
    
    for (const edu of cv.education) {
      ensureSpace(45);
      
      const degreeLine = edu.field ? `${edu.degree}, ${edu.field}` : edu.degree;
      page.drawText(degreeLine, {
        x: margin,
        y: yPosition,
        size: 11,
        font: helveticaBold,
        color: textColor,
      });
      
      if (edu.endDate) {
        const eduDate = formatDate(edu.endDate);
        const eduW = helvetica.widthOfTextAtSize(eduDate, 10);
        page.drawText(eduDate, {
          x: pageWidth - margin - eduW,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: lightColor,
        });
      }
      yPosition -= 14;
      
      const instLine = edu.location ? `${edu.institution}, ${edu.location}` : edu.institution;
      page.drawText(instLine, {
        x: margin,
        y: yPosition,
        size: 10,
        font: helvetica,
        color: lightColor,
      });
      yPosition -= 12;
      
      if (edu.grade) {
        page.drawText(`Grade: ${edu.grade}`, {
          x: margin,
          y: yPosition,
          size: 10,
          font: helvetica,
          color: textColor,
        });
        yPosition -= 12;
      }
      
      yPosition -= 8;
    }
  }
  
  if (cv.skills.length > 0) {
    drawSection('Skills');
    
    for (const cat of cv.skills) {
      const skillLine = `${cat.category}: ${cat.skills.join(', ')}`;
      drawText(skillLine, helvetica, 10);
      yPosition -= 2;
    }
  }
  
  if (cv.certifications.length > 0) {
    drawSection('Certifications');
    
    for (const cert of cv.certifications) {
      const certLine = cert.date 
        ? `• ${cert.name} – ${cert.issuer} (${formatDate(cert.date)})` 
        : `• ${cert.name} – ${cert.issuer}`;
      drawText(certLine, helvetica, 10);
    }
  }
  
  if (cv.languages.length > 0) {
    drawSection('Languages');
    
    const langLine = cv.languages
      .map(l => `${l.language} (${l.proficiency})${l.certification ? ` – ${l.certification}` : ''}`)
      .join(' | ');
    drawText(langLine, helvetica, 10);
  }
  
  const pdfBytes = await pdfDoc.save();
  
  return { pdfBytes, stats };
}
