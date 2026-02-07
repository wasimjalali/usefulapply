import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function extractCVData(text: string): Promise<any> {
  const prompt = `Extract structured CV information from the following text. Return ONLY valid JSON without markdown formatting.

Expected JSON structure:
{
  "personal": {
    "fullName": "",
    "email": "",
    "phone": "",
    "address": "",
    "city": "",
    "country": "",
    "linkedIn": "",
    "website": "",
    "github": ""
  },
  "summary": "",
  "experience": [
    {
      "company": "",
      "position": "",
      "location": "",
      "startDate": "YYYY-MM or Mon YYYY",
      "endDate": "YYYY-MM or Mon YYYY or present",
      "current": false,
      "bullets": [""]
    }
  ],
  "education": [
    {
      "institution": "",
      "degree": "",
      "field": "",
      "location": "",
      "startDate": "",
      "endDate": "",
      "grade": "",
      "highlights": [""]
    }
  ],
  "skills": [
    {
      "category": "",
      "skills": [""]
    }
  ],
  "certifications": [
    {
      "name": "",
      "issuer": "",
      "date": "",
      "credentialId": ""
    }
  ],
  "languages": [
    {
      "language": "",
      "proficiency": "Native|Fluent|Professional|Intermediate|Basic"
    }
  ],
  "projects": [
    {
      "name": "",
      "description": "",
      "technologies": [""],
      "url": "",
      "date": ""
    }
  ]
}

CV Text:
${text}

Return ONLY the JSON object, no other text:`;

  const response = await anthropic.messages.create({
    model: process.env.USE_FALLBACK_MODEL === 'true' ? 'claude-haiku-4-5' : 'claude-sonnet-4-5-20250929',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const textContent = response.content.find(block => block.type === 'text');
  const content = textContent?.type === 'text' ? textContent.text : null;
  if (content) {
    const jsonText = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(jsonText);
  }

  throw new Error('Failed to extract CV data');
}
