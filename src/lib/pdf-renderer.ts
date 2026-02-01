import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { StructuredCV, CVDate } from './types/cv-schema';

const PAGE_SIZES = {
  a4: { width: 595, height: 842 },
  letter: { width: 612, height: 792 },
};

const MARGINS = {
  top: 50,
  bottom: 50,
  left: 50,
  right: 50,
};

function formatDate(date?: CVDate): string {
  if (!date || !date.raw) return '';
  if (date.normalized === 'present') return 'Present';
  return date.raw;
}

export async function generatePDF(cv: StructuredCV): Promise<{ 
  pdfBytes: Uint8Array; 
  pageCount: number;
  metadata: {
    region: string;
    pageSize: string;
  };
}> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize = PAGE_SIZES[cv.settings.pageSize];
  const maxWidth = pageSize.width - MARGINS.left - MARGINS.right;

  let page = pdfDoc.addPage([pageSize.width, pageSize.height]);
  let yPosition = pageSize.height - MARGINS.top;

  const drawText = (
    text: string,
    fontSize: number,
    isBold: boolean = false,
    options: { color?: [number, number, number]; indent?: number } = {}
  ) => {
    const currentFont = isBold ? fontBold : font;
    const lines = wrapText(text, maxWidth - (options.indent || 0), fontSize, currentFont);
    
    for (const line of lines) {
      if (yPosition < MARGINS.bottom + 20) {
        if (pdfDoc.getPageCount() >= cv.settings.maxPages) {
          return false;
        }
        page = pdfDoc.addPage([pageSize.width, pageSize.height]);
        yPosition = pageSize.height - MARGINS.top;
      }

      page.drawText(line, {
        x: MARGINS.left + (options.indent || 0),
        y: yPosition,
        size: fontSize,
        font: currentFont,
        color: rgb(...(options.color || [0, 0, 0])),
      });

      yPosition -= fontSize + 4;
    }
    
    return true;
  };

  const addSpace = (space: number = 10) => {
    yPosition -= space;
  };

  drawText(cv.personal.fullName, 18, true);
  addSpace(5);

  const contactInfo = [
    cv.personal.email,
    cv.personal.phone,
    cv.personal.city,
    cv.personal.linkedIn,
  ].filter(Boolean).join(' • ');

  drawText(contactInfo, 10);
  addSpace(15);

  if (cv.summary) {
    drawText('PROFESSIONAL SUMMARY', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);
    drawText(cv.summary, 10);
    addSpace(15);
  }

  if (cv.experience.length > 0) {
    drawText('EXPERIENCE', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);

    for (const exp of cv.experience) {
      if (yPosition < MARGINS.bottom + 100 && pdfDoc.getPageCount() >= cv.settings.maxPages) {
        break;
      }

      drawText(exp.position, 11, true);
      const dateRange = `${formatDate(exp.startDate)} - ${exp.current ? 'Present' : formatDate(exp.endDate)}`;
      drawText(`${exp.company} • ${dateRange}`, 10, false, { color: [0.3, 0.3, 0.3] });
      addSpace(3);

      for (const bullet of exp.bullets) {
        if (yPosition < MARGINS.bottom + 40 && pdfDoc.getPageCount() >= cv.settings.maxPages) {
          break;
        }
        drawText(`• ${bullet}`, 9, false, { indent: 10 });
      }

      addSpace(10);
    }
  }

  if (cv.education.length > 0) {
    drawText('EDUCATION', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);

    for (const edu of cv.education) {
      drawText(edu.degree + (edu.field ? ` in ${edu.field}` : ''), 11, true);
      const dateRange = edu.endDate ? formatDate(edu.endDate) : '';
      drawText(`${edu.institution} • ${dateRange}`, 10, false, { color: [0.3, 0.3, 0.3] });
      if (edu.grade) {
        drawText(`Grade: ${edu.grade}`, 9);
      }
      addSpace(8);
    }
  }

  if (cv.skills.length > 0) {
    addSpace(5);
    drawText('SKILLS', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);

    for (const skillCat of cv.skills) {
      drawText(`${skillCat.category}: ${skillCat.skills.join(', ')}`, 9);
      addSpace(5);
    }
  }

  if (cv.certifications && cv.certifications.length > 0) {
    addSpace(5);
    drawText('CERTIFICATIONS', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);

    for (const cert of cv.certifications) {
      drawText(`${cert.name} - ${cert.issuer}`, 9);
      if (cert.date) {
        drawText(formatDate(cert.date), 8, false, { color: [0.4, 0.4, 0.4] });
      }
      addSpace(5);
    }
  }

  if (cv.languages && cv.languages.length > 0) {
    addSpace(5);
    drawText('LANGUAGES', 12, true, { color: [0.2, 0.2, 0.2] });
    addSpace(5);
    
    const langText = cv.languages.map(l => `${l.language} (${l.proficiency})`).join(', ');
    drawText(langText, 9);
  }

  const pdfBytes = await pdfDoc.save();

  return {
    pdfBytes,
    pageCount: pdfDoc.getPageCount(),
    metadata: {
      region: cv.settings.region,
      pageSize: cv.settings.pageSize,
    },
  };
}

function wrapText(text: string, maxWidth: number, fontSize: number, font: any): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}
