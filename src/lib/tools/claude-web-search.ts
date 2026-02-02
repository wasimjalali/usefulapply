/**
 * Claude Web Search for Company Research
 * 
 * Replaces Tavily web search with Claude's native web search capability
 * for more accurate company information and addresses.
 */

import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface CompanyResearch {
  name: string;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  country: string;
  description: string | null;
  industry: string | null;
  website: string | null;
  employeeCount: string | null;
  founded: string | null;
  values?: string[];
  culture?: string[];
}

/**
 * Search for company information using Claude's web search
 */
export async function searchCompanyInfo(companyName: string): Promise<CompanyResearch> {
  console.log('[ClaudeWebSearch] Searching for company:', companyName);
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools: [
        {
          type: 'web_search' as any,
          name: 'web_search',
        }
      ],
      messages: [
        {
          role: 'user',
          content: `Search for company information about "${companyName}" in Germany.

I need:
1. Official company address (street, postal code, city)
2. Brief description of what the company does
3. Industry/sector
4. Website URL
5. Approximate employee count (if available)
6. Company values or mission (if available)

IMPORTANT:
- Only provide VERIFIED information from official sources
- If you cannot find the real address, return null for address fields - do NOT make up an address
- Prefer information from the company's official website, LinkedIn, or business registries
- Do NOT use placeholder addresses like "Musterstraße" or "123 Example Street"

Return the information in this exact JSON format:
{
  "name": "Company Name",
  "address": "Street and number" or null,
  "city": "City" or null,
  "postalCode": "12345" or null,
  "country": "Germany",
  "description": "What the company does",
  "industry": "Industry sector",
  "website": "https://..." or null,
  "employeeCount": "50-200" or null,
  "founded": "2015" or null,
  "values": ["value1", "value2"] or null,
  "culture": ["culture point 1"] or null
}

If information is not found, use null for that field.`
        }
      ]
    });

    // Extract the text response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      console.log('[ClaudeWebSearch] No text response from Claude');
      return getDefaultCompanyResearch(companyName);
    }

    // Parse the JSON from the response
    const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log('[ClaudeWebSearch] Could not parse JSON from response:', textContent.text.substring(0, 200));
      return getDefaultCompanyResearch(companyName);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    
    // Validate address is not a placeholder
    if (parsed.address && isPlaceholderAddress(parsed.address)) {
      console.log('[ClaudeWebSearch] Detected placeholder address, setting to null:', parsed.address);
      parsed.address = null;
    }

    const result: CompanyResearch = {
      name: parsed.name || companyName,
      address: parsed.address || null,
      city: parsed.city || null,
      postalCode: parsed.postalCode || null,
      country: parsed.country || 'Germany',
      description: parsed.description || null,
      industry: parsed.industry || null,
      website: parsed.website || null,
      employeeCount: parsed.employeeCount || null,
      founded: parsed.founded || null,
      values: parsed.values || undefined,
      culture: parsed.culture || undefined,
    };

    console.log('[ClaudeWebSearch] Research result:', {
      name: result.name,
      hasAddress: !!result.address,
      city: result.city,
      industry: result.industry,
    });

    return result;

  } catch (error) {
    console.error('[ClaudeWebSearch] Error:', error);
    return getDefaultCompanyResearch(companyName);
  }
}

/**
 * Check if an address is a placeholder/fake address
 */
function isPlaceholderAddress(address: string): boolean {
  if (!address || address.length < 5) return true;
  
  const placeholders = [
    /musterstra[ßs]e/i,        // German "Example Street"
    /beispielstra[ßs]e/i,      // German "Example Street"
    /teststra[ßs]e/i,          // "Test Street"
    /musterweg/i,              // "Example Way"
    /beispielweg/i,            // "Example Way"
    /^123\s/,                  // Starts with 123 (common placeholder)
    /test.*street/i,           // Test street
    /placeholder/i,            // Placeholder
    /example.*street/i,        // Example street
    /sample.*address/i,        // Sample address
    /^street\s+\d+$/i,         // Generic "Street 123"
    /^address.*unknown/i,      // Address unknown
    /nicht.*verfügbar/i,       // Not available (German)
    /not.*available/i,         // Not available
    /^n\/?a$/i,                // N/A
    /xxx/i,                    // XXX placeholder
    /dummy/i,                  // Dummy
  ];
  
  return placeholders.some(pattern => pattern.test(address));
}

/**
 * Return default research object when search fails
 */
function getDefaultCompanyResearch(companyName: string): CompanyResearch {
  return {
    name: companyName,
    address: null,
    city: null,
    postalCode: null,
    country: 'Germany',
    description: null,
    industry: null,
    website: null,
    employeeCount: null,
    founded: null,
  };
}

/**
 * Format company address for cover letter
 * Returns null if no valid address information is available
 */
export function formatCompanyAddress(research: CompanyResearch): string | null {
  if (!research.address && !research.city) {
    return null; // Don't include address block at all
  }
  
  const parts: string[] = [];
  
  if (research.address) {
    parts.push(research.address);
  }
  
  if (research.postalCode && research.city) {
    parts.push(`${research.postalCode} ${research.city}`);
  } else if (research.city) {
    parts.push(research.city);
  }
  
  if (parts.length > 0 && research.country) {
    parts.push(research.country);
  }
  
  return parts.length > 0 ? parts.join('\n') : null;
}

/**
 * Get a formatted address string for single-line display
 */
export function formatCompanyAddressOneLine(research: CompanyResearch): string {
  if (!research.address && !research.city) {
    return research.country || 'Germany';
  }
  
  const parts: string[] = [];
  
  if (research.address) {
    parts.push(research.address);
  }
  
  if (research.postalCode && research.city) {
    parts.push(`${research.postalCode} ${research.city}`);
  } else if (research.city) {
    parts.push(research.city);
  }
  
  if (research.country) {
    parts.push(research.country);
  }
  
  return parts.join(', ');
}
