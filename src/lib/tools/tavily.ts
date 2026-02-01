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
    const [generalInfo, cultureInfo, techInfo, newsInfo] = await Promise.all([
      searchWeb({
        query: `${companyName} company overview headquarters address industry size founded`,
        searchDepth: 'advanced',
        maxResults: 5,
      }),
      searchWeb({
        query: `${companyName} company culture values mission employee reviews glassdoor`,
        searchDepth: 'basic',
        maxResults: 3,
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

    // Combine all search results into a structured format
    // The actual extraction will be done by the AI model
    return {
      name: companyName,
      description: generalInfo.answer || extractFromResults(generalInfo.results, 'description'),
      address: extractFromResults(generalInfo.results, 'address'),
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
 * Check if Tavily API is configured
 */
export function isTavilyConfigured(): boolean {
  return !!process.env.TAVILY_API_KEY;
}
