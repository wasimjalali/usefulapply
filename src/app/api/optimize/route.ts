import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { StructuredCV, WorkExperience } from '@/lib/types/cv-schema';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { cv, jobDescription, targetRole } = await request.json();

    if (!cv) {
      return NextResponse.json({ error: 'CV data required' }, { status: 400 });
    }

    const prompt = `You are a professional CV optimization expert. Given this CV and job description, optimize the experience section bullets to better match the role.

TARGET ROLE: ${targetRole || 'Not specified'}

JOB DESCRIPTION:
${jobDescription || 'Not provided'}

CURRENT CV EXPERIENCE:
${JSON.stringify(cv.experience, null, 2)}

Instructions:
1. Keep all facts accurate - DO NOT invent experience
2. Reorder and rephrase bullets to highlight relevant skills
3. Use action verbs and quantify achievements where possible
4. Keep bullets concise (1-2 lines each)
5. Return ONLY a JSON array of experience objects with optimized bullets
6. Preserve the original structure with id, company, position, dates, etc.
7. Return model-provided diffs by including a "_diff" field showing changes

Return format:
[
  {
    "id": "uuid",
    "company": "...",
    "position": "...",
    "bullets": ["optimized bullet 1", "optimized bullet 2"],
    "_diff": {
      "added": ["new optimized bullets"],
      "removed": ["original bullets that were changed"],
      "modified": [{"from": "old", "to": "new"}]
    }
  }
]`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = message.content[0];
    if (content.type === 'text') {
      const jsonText = content.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
      const optimizedExperience = JSON.parse(jsonText);

      const optimizedCV: StructuredCV = {
        ...cv,
        experience: optimizedExperience,
        updatedAt: new Date().toISOString(),
        version: cv.version + 1,
      };

      return NextResponse.json({
        success: true,
        cv: optimizedCV,
        diffs: optimizedExperience.map((exp: WorkExperience & { _diff?: any }) => ({
          experienceId: exp.id,
          changes: exp._diff || { added: [], removed: [], modified: [] },
        })),
      });
    }

    throw new Error('Failed to optimize CV');
  } catch (error) {
    console.error('Optimization error:', error);
    return NextResponse.json(
      { error: 'Failed to optimize CV', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
