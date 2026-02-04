/**
 * Tavily Web Search Integration
 * Provides real-time web search for company research and industry trends
 */

import { tavily, TavilyClient } from '@tavily/core';

// Lazy initialization to ensure env vars are loaded
let tavilyClient: TavilyClient | null = null;

function getTavilyClient(): TavilyClient {
  if (!tavilyClient) {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      throw new Error('TAVILY_API_KEY is not configured');
    }
    console.log('[Tavily] Initializing client with API key:', apiKey.substring(0, 10) + '...');
    tavilyClient = tavily({ apiKey });
  }
  return tavilyClient;
}

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

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeAnswer?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

/**
 * Perform a web search using Tavily
 */
export async function searchWeb(options: TavilySearchOptions): Promise<{
  answer?: string;
  results: SearchResult[];
}> {
  const {
    query,
    searchDepth = 'basic',
    maxResults = 5,
    includeAnswer = true,
    includeDomains,
    excludeDomains,
  } = options;

  try {
    const client = getTavilyClient();
    const response = await client.search(query, {
      searchDepth,
      maxResults,
      includeAnswer,
      ...(includeDomains && { includeDomains }),
      ...(excludeDomains && { excludeDomains }),
    });

    return {
      answer: response.answer,
      results: response.results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
        score: r.score,
      })),
    };
  } catch (error) {
    console.error('Tavily search error:', error);
    throw new Error(`Tavily search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Research a company using multiple Tavily searches
 * Returns structured company information for cover letters and personalization
 */
export async function researchCompany(companyName: string): Promise<CompanyResearch> {
  try {
    // Run multiple searches in parallel for comprehensive info
    const [generalInfo, addressInfo, cultureInfo, techInfo, newsInfo] = await Promise.all([
      searchWeb({
        query: `${companyName} company overview industry size founded what does ${companyName} do`,
        searchDepth: 'advanced',
        maxResults: 5,
        includeAnswer: true,
      }),
      // Dedicated search for headquarters address
      searchWeb({
        query: `${companyName} headquarters office address location street city country`,
        searchDepth: 'advanced',
        maxResults: 5,
        includeAnswer: true,
      }),
      searchWeb({
        query: `${companyName} company culture values mission employee reviews glassdoor`,
        searchDepth: 'basic',
        maxResults: 3,
        includeAnswer: true,
      }),
      searchWeb({
        query: `${companyName} tech stack technology engineering blog developers`,
        searchDepth: 'basic',
        maxResults: 3,
      }),
      searchWeb({
        query: `${companyName} recent news announcements 2025 2026`,
        searchDepth: 'basic',
        maxResults: 3,
      }),
    ]);

    // Extract address with improved logic
    const extractedAddress = extractAddress(addressInfo.results, addressInfo.answer, companyName);

    // Combine all search results into a structured format
    return {
      name: companyName,
      description: generalInfo.answer || extractFromResults(generalInfo.results, 'description'),
      address: extractedAddress,
      industry: extractFromResults(generalInfo.results, 'industry'),
      culture: extractListFromResults(cultureInfo.results, 'culture'),
      techStack: extractListFromResults(techInfo.results, 'tech'),
      recentNews: newsInfo.results.slice(0, 3).map(r => r.title),
      values: extractListFromResults(cultureInfo.results, 'values'),
      size: extractFromResults(generalInfo.results, 'employees'),
      founded: extractFromResults(generalInfo.results, 'founded'),
      website: extractWebsite(generalInfo.results, companyName),
    };
  } catch (error) {
    console.error('Company research error:', error);
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
 * Search for industry-specific skills and trends
 */
export async function searchIndustryTrends(
  industry: string,
  jobTitle: string
): Promise<{
  inDemandSkills: string[];
  trends: string[];
  salaryRange: string;
}> {
  try {
    const response = await searchWeb({
      query: `${jobTitle} ${industry} required skills 2025 2026 job market trends salary`,
      searchDepth: 'advanced',
      maxResults: 5,
      includeAnswer: true,
    });

    return {
      inDemandSkills: extractListFromResults(response.results, 'skills'),
      trends: response.results.slice(0, 3).map(r => r.title),
      salaryRange: extractFromResults(response.results, 'salary'),
    };
  } catch (error) {
    console.error('Industry trends search error:', error);
    return {
      inDemandSkills: [],
      trends: [],
      salaryRange: '',
    };
  }
}

/**
 * Get company contact information for cover letters
 */
export async function getCompanyContactInfo(companyName: string): Promise<{
  address: string;
  hrEmail: string;
  phone: string;
}> {
  try {
    const response = await searchWeb({
      query: `${companyName} headquarters address contact HR email careers`,
      searchDepth: 'basic',
      maxResults: 3,
    });

    return {
      address: extractFromResults(response.results, 'address'),
      hrEmail: extractFromResults(response.results, 'email'),
      phone: extractFromResults(response.results, 'phone'),
    };
  } catch (error) {
    console.error('Contact info search error:', error);
    return {
      address: '',
      hrEmail: '',
      phone: '',
    };
  }
}

// Helper functions for basic extraction
function extractFromResults(results: SearchResult[], keyword: string): string {
  for (const result of results) {
    const content = result.content.toLowerCase();
    if (content.includes(keyword.toLowerCase())) {
      // Return a snippet around the keyword
      const index = content.indexOf(keyword.toLowerCase());
      const start = Math.max(0, index - 50);
      const end = Math.min(content.length, index + 150);
      return result.content.substring(start, end).trim();
    }
  }
  return '';
}

function extractListFromResults(results: SearchResult[], keyword: string): string[] {
  const items: string[] = [];
  for (const result of results) {
    if (result.content.toLowerCase().includes(keyword.toLowerCase())) {
      // Add the title as a potential item
      items.push(result.title);
    }
  }
  return items.slice(0, 5);
}

function extractWebsite(results: SearchResult[], companyName: string): string {
  for (const result of results) {
    const url = result.url.toLowerCase();
    const name = companyName.toLowerCase().replace(/\s+/g, '');
    if (url.includes(name) && !url.includes('linkedin') && !url.includes('glassdoor')) {
      return result.url;
    }
  }
  return '';
}

/**
 * Validate that an address is real (not a placeholder/fake)
 * Rejects common German placeholder addresses like "Musterstraße"
 */
function isValidAddress(address: string): boolean {
  if (!address || address.length < 5) return false;
  
  // Reject placeholder/fake addresses (German and English)
  const invalidPatterns = [
    /musterstra[ßs]e/i,        // "Example Street" in German
    /beispielstra[ßs]e/i,      // "Example Street" in German
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
  ];
  
  const isInvalid = invalidPatterns.some(pattern => pattern.test(address));
  
  if (isInvalid) {
    console.log(`[Tavily] Rejected placeholder address: "${address}"`);
    return false;
  }
  
  return true;
}

/**
 * Extract company address from search results with improved logic
 * CRITICAL: Returns EXACT text from search results - NO modification or interpretation
 * The address must pass through unchanged to prevent city name errors (e.g., Kastl ≠ Kastellaun)
 */
function extractAddress(results: SearchResult[], answer: string | undefined, companyName: string): string {
  // Priority 1: Look for structured address format in results (most reliable)
  // Pattern: "Street Number, Postal Code City" (German format)
  const germanAddressPattern = /([A-Za-zäöüÄÖÜß\s]+\s+\d+[a-z]?\s*,?\s*\d{4,5}\s+[A-Za-zäöüÄÖÜß\s-]+)/i;
  
  for (const result of results) {
    const match = result.content.match(germanAddressPattern);
    if (match && match[1]) {
      const address = match[1].trim();
      // Validate address is not a placeholder
      if (isValidAddress(address)) {
        console.log(`[Tavily] Found exact address: "${address}"`);
        return address;
      }
    }
  }

  // Priority 2: Look for "located at/in" with full address
  const locationWithAddressPatterns = [
    /(?:located|headquartered|office)\s+(?:at|in)\s+([A-Za-zäöüÄÖÜß0-9\s,.-]+\d{4,5}[A-Za-zäöüÄÖÜß\s,.-]*)/i,
    /corporate\s+office\s+(?:is\s+)?(?:located\s+)?(?:at|in)\s+([^.]+\d{4,5}[^.]*)/i,
  ];
  
  for (const result of results) {
    for (const pattern of locationWithAddressPatterns) {
      const match = result.content.match(pattern);
      if (match && match[1]) {
        const address = match[1].trim().replace(/[.,]$/, '');
        if (address.length > 10 && address.length < 150 && isValidAddress(address)) {
          console.log(`[Tavily] Found address from location pattern: "${address}"`);
          return address;
        }
      }
    }
  }

  // Priority 3: Extract from Tavily answer if it contains postal code (indicates real address)
  if (answer) {
    const postalMatch = answer.match(/([A-Za-zäöüÄÖÜß\s]+\s+\d+[a-z]?\s*,?\s*\d{4,5}\s+[A-Za-zäöüÄÖÜß\s-]+)/i);
    if (postalMatch && postalMatch[1]) {
      const address = postalMatch[1].trim();
      if (isValidAddress(address)) {
        console.log(`[Tavily] Found address from answer: "${address}"`);
        return address;
      }
    }
  }

  // Priority 4: Look for city + region/state (less specific but still useful)
  // ONLY return if it's an EXACT match from the text, not interpreted
  for (const result of results) {
    // Match patterns like "Kastl, Bavaria" or "84556 Kastl"
    const cityPatterns = [
      /(\d{4,5}\s+[A-Za-zäöüÄÖÜß]+)/i,  // Postal code + city
      /([A-Za-zäöüÄÖÜß]+,\s*(?:Bavaria|Bayern|Berlin|Hamburg|Hessen|NRW|Saxony|Sachsen)[A-Za-zäöüÄÖÜß\s-]*)/i,
    ];
    
    for (const pattern of cityPatterns) {
      const match = result.content.match(pattern);
      if (match && match[1]) {
        const location = match[1].trim();
        if (location.length > 3 && location.length < 100 && isValidAddress(location)) {
          console.log(`[Tavily] Found city/region: "${location}"`);
          return location;
        }
      }
    }
  }

  // If no reliable address found, return empty string
  // Better to omit than to guess
  console.log(`[Tavily] No reliable address found for ${companyName}`);
  return '';
}

/**
 * Extract address from text using common address patterns
 */
function extractAddressFromText(text: string): string {
  // Common address patterns
  const patterns = [
    // Full street address with number
    /(\d+\s+[A-Za-z0-9\s,]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Place|Pl|Court|Ct)[.,]?\s*[A-Za-z\s,]+(?:\d{5}(?:-\d{4})?)?)/i,
    // Address with city, state/country
    /([A-Za-z0-9\s]+,\s*[A-Za-z\s]+,\s*(?:[A-Z]{2}|[A-Za-z]+)\s*\d{5}(?:-\d{4})?)/i,
    // International format: City, Country
    /(?:headquarters?|office|located|based)\s+(?:in|at)\s+([A-Za-z\s]+,\s*[A-Za-z\s]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const address = match[1].trim();
      // Validate it looks like an address (has some length, contains letters)
      if (address.length > 5 && address.length < 200 && /[a-zA-Z]/.test(address)) {
        return address;
      }
    }
  }

  return '';
}

/**
 * Check if Tavily API is configured
 */
export function isTavilyConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}
