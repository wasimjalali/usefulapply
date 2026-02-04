import { NextRequest, NextResponse } from 'next/server';
import pdfParse from 'pdf-parse';
import { extractCVData } from '@/lib/cv-extractor';
import { StructuredCV, parseDate, withId } from '@/lib/types/cv-schema';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const region = formData.get('region') as 'US' | 'EU' || 'EU';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let extractedText = '';

    if (file.type === 'application/pdf') {
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text;
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
    }

    const rawCV = await extractCVData(extractedText);

    const structuredCV: StructuredCV = {
      id: uuidv4(),
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceFileName: file.name,
      sourceFormat: 'pdf',
      settings: {
        region,
        includePhoto: region === 'EU',
        pageSize: region === 'EU' ? 'a4' : 'letter',
        maxPages: region === 'EU' ? 2 : 1,
        language: region === 'EU' ? 'de' : 'en',
      },
      personal: rawCV.personal || {
        fullName: '',
        email: '',
        phone: '',
      },
      summary: rawCV.summary,
      experience: (rawCV.experience || []).map((exp: any) => 
        withId({
          ...exp,
          startDate: parseDate(exp.startDate || ''),
          endDate: exp.endDate ? parseDate(exp.endDate) : undefined,
          current: exp.current || false,
          _originalBullets: [...(exp.bullets || [])],
        })
      ),
      education: (rawCV.education || []).map((edu: any) =>
        withId({
          ...edu,
          startDate: edu.startDate ? parseDate(edu.startDate) : undefined,
          endDate: edu.endDate ? parseDate(edu.endDate) : undefined,
        })
      ),
      skills: (rawCV.skills || []).map((skill: any) => withId(skill)),
      certifications: (rawCV.certifications || []).map((cert: any) =>
        withId({
          ...cert,
          date: cert.date ? parseDate(cert.date) : undefined,
          expiryDate: cert.expiryDate ? parseDate(cert.expiryDate) : undefined,
        })
      ),
      languages: (rawCV.languages || []).map((lang: any) => withId(lang)),
      projects: (rawCV.projects || []).map((proj: any) =>
        withId({
          ...proj,
          date: proj.date ? parseDate(proj.date) : undefined,
        })
      ),
      additionalSections: (rawCV.additionalSections || []).map((section: any) => withId(section)),
    };

    return NextResponse.json({
      success: true,
      cv: structuredCV,
      metadata: {
        pageCount: 1,
        extractedTextLength: extractedText.length,
      },
    });
  } catch (error) {
    console.error('Parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse CV', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
