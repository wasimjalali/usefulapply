/**
 * GPT-4o Web Search Integration
 * Alternative to Tavily - uses GPT-4o's native web search capability
 */

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface CompanyResearch {
  name: string;
  description: string;
  address: string;
  industry: string;
  culture: string[];
  techStack: string[];
  recentNews: string[];
  values: string[];
  size: string;
  founded: string;
  website: string;
}

/**
 * Research a company using GPT-4o with web search
 */
export async function researchCompanyWithGPT(companyName: string): Promise<CompanyResearch> {
  try {
    console.log(`[GPT Web Search] Researching company: ${companyName}`);
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a company research assistant. Search the web and provide accurate, up-to-date information about companies. Return only valid JSON.',
        },
        {
          role: 'user',
          content: `Research ${companyName} and provide the following information in JSON format:

{
  "name": "Company official name",
  "description": "Brief 1-2 sentence description of what the company does",
  "address": "Full headquarters address (street, city, state, zip)",
  "industry": "Primary industry/sector",
  "culture": ["3-5 key cultural aspects or values"],
  "techStack": ["5-8 main technologies they use"],
  "recentNews": ["3 recent news headlines from 2025-2026"],
  "values": ["3-5 company values or mission statements"],
  "size": "Number of employees (e.g., '10,000+', '500-1000')",
  "founded": "Year founded",
  "website": "Official website URL"
}

Search the web for current, accurate information. Focus on official sources, company websites, and recent news.`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from GPT-4o');
    }

    const research = JSON.parse(content) as CompanyResearch;
    console.log(`[GPT Web Search] Research complete for ${companyName}`);
    
    return research;
    
  } catch (error) {
    console.error('[GPT Web Search] Error:', error);
    // Return partial data on error
    return {
      name: companyName,
      description: '',
      address: '',
      industry: '',
      culture: [],
      techStack: [],
      recentNews: [],
      values: [],
      size: '',
      founded: '',
      website: '',
    };
  }
}

/**
 * Check if GPT-4o web search is configured
 */
export function isGPTWebSearchConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
