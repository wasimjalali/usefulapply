import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import type { StructuredCV, WorkExperience } from '@/lib/types/cv-schema';
import type { CVEdit } from '@/store/useAppStore';

export const runtime = 'nodejs';
export const maxDuration = 60;

const anthropic = new Anthropic();

interface OptimizeRequest {
  cv: StructuredCV;
  jobDescription: string;
}

export async function POST(request: NextRequest) {
  try {
    const { cv, jobDescription }: OptimizeRequest = await request.json();
    
    const cvWithOriginals: StructuredCV = {
      ...cv,
      experience: cv.experience.map(exp => ({
        ...exp,
        _originalBullets: [...exp.bullets],
      })),
    };
    
    const prompt = `
Optimize this CV for the job description. Follow rules strictly.

CV:
${JSON.stringify(cvWithOriginals, null, 2)}

JOB DESCRIPTION:
${jobDescription}

RULES:
1. DO NOT invent skills, experiences, or qualifications
2. Rewrite bullets to:
   - Mirror keywords from job description
   - Quantify achievements where data exists
   - Use action verbs
3. Keep the same number of experiences and bullets
4. Return the EXACT experience IDs - do not change them

RETURN JSON ONLY:
{
  "matchScore": 75,
  "matchingSkills": ["skill1", "skill2"],
  "missingSkills": ["skill job wants but CV lacks"],
  "suggestions": ["suggestion 1"],
  "optimizedExperience": [
    {
      "id": "original-uuid-here",
      "bullets": ["optimized bullet 1", "optimized bullet 2"]
    }
  ],
  "optimizedSummary": "new summary or null if unchanged"
}
`;

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    
    const content = response.content[0];
    if (content.type !== 'text') throw new Error('Unexpected response');
    
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    
    const result = JSON.parse(jsonMatch[0]);
    
    const edits: CVEdit[] = [];
    
    const optimizedCV: StructuredCV = {
      ...cvWithOriginals,
      summary: result.optimizedSummary || cvWithOriginals.summary,
      experience: cvWithOriginals.experience.map(exp => {
        const opt = result.optimizedExperience?.find((o: any) => o.id === exp.id);
        
        if (opt && opt.bullets) {
          const originals = exp._originalBullets || exp.bullets;
          
          originals.forEach((orig: string, idx: number) => {
            const newBullet = opt.bullets[idx];
            if (orig !== newBullet && newBullet) {
              edits.push({
                id: `edit-${exp.id}-${idx}`,
                section: `${exp.company} - ${exp.position}`,
                field: `Bullet ${idx + 1}`,
                originalValue: orig,
                newValue: newBullet,
                reason: 'Optimized for job keywords and impact',
              });
            }
          });
          
          return {
            ...exp,
            bullets: opt.bullets,
            _originalBullets: originals,
          };
        }
        
        return exp;
      }),
    };
    
    if (result.optimizedSummary && result.optimizedSummary !== cvWithOriginals.summary) {
      edits.push({
        id: `edit-summary`,
        section: 'Professional Summary',
        field: 'Summary',
        originalValue: cvWithOriginals.summary || '',
        newValue: result.optimizedSummary,
        reason: 'Tailored to job requirements',
      });
    }
    
    return NextResponse.json({
      success: true,
      optimizedCV,
      edits,
      matchScore: result.matchScore,
      matchingSkills: result.matchingSkills || [],
      missingSkills: result.missingSkills || [],
      suggestions: result.suggestions || [],
    });
    
  } catch (error) {
    console.error('Optimize error:', error);
    return NextResponse.json(
      { error: 'Optimization failed' },
      { status: 500 }
    );
  }
}
