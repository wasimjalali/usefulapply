import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (content) {
    const jsonText = content.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(jsonText);
  }

  throw new Error('Failed to extract CV data');
}
