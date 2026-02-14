/**
 * Text Analysis Utilities — Action verbs, metric detection, keyword extraction
 * 
 * Extracted from types.ts for modularity.
 */

// Strong action verbs for experience bullets (avoid weak verbs)
export const STRONG_ACTION_VERBS = [
  'Achieved', 'Accelerated', 'Accomplished', 'Administered', 'Advanced',
  'Built', 'Boosted',
  'Captured', 'Championed', 'Consolidated', 'Converted', 'Coordinated', 'Created', 'Cultivated',
  'Decreased', 'Delivered', 'Designed', 'Developed', 'Directed', 'Drove',
  'Earned', 'Eliminated', 'Enabled', 'Engineered', 'Enhanced', 'Established', 'Exceeded', 'Executed', 'Expanded',
  'Facilitated', 'Formulated', 'Founded',
  'Generated', 'Grew',
  'Headed',
  'Implemented', 'Improved', 'Increased', 'Initiated', 'Innovated', 'Introduced',
  'Launched', 'Led', 'Leveraged',
  'Managed', 'Maximized', 'Mentored', 'Modernized',
  'Negotiated',
  'Optimized', 'Orchestrated', 'Outperformed', 'Overhauled',
  'Partnered', 'Pioneered', 'Produced', 'Propelled',
  'Raised', 'Reached', 'Realized', 'Reduced', 'Refined', 'Reorganized', 'Resolved', 'Restructured', 'Revamped', 'Revolutionized',
  'Saved', 'Scaled', 'Secured', 'Simplified', 'Spearheaded', 'Standardized', 'Streamlined', 'Strengthened', 'Surpassed',
  'Trained', 'Transformed', 'Tripled',
  'Unified', 'Upgraded',
  'Won',
] as const;

// Weak verbs to avoid
export const WEAK_VERBS_TO_AVOID = [
  'Assisted', 'Helped', 'Participated', 'Responsible for', 'Worked on', 'Was involved in',
  'Handled', 'Did', 'Made', 'Got', 'Tried', 'Attempted',
] as const;

// ============================================
// METRIC DETECTION
// ============================================

// Metric detection result
export interface MetricDetectionResult {
  hasPercentage: boolean;
  hasCurrency: boolean;
  hasCount: boolean;
  hasRatio: boolean;
  hasGrowthVerb: boolean;
  metricsFound: string[];
  isValid: boolean;
}

// Detect metrics in a bullet point
export function detectMetricsInBullet(bullet: string): MetricDetectionResult {
  const percentagePattern = /(\d+)%/g;
  const currencyPattern = /\$[\d,KMB]+|€[\d,KMB]+|£[\d,KMB]+/g;
  const countPattern = /\d+\s*(years?|months?|weeks?|days?|projects?|teams?|people?|clients?|users?|customers?)/gi;
  const ratioPattern = /\d+\.?\d*:\d+\.?\d*|ROAS|ROI|CTR|CVR/gi;
  const growthPattern = /growth|increase|decrease|improve|reduce|optimize|grew|raised|boosted|cut|saved/gi;
  
  const percentageMatches = bullet.match(percentagePattern) || [];
  const currencyMatches = bullet.match(currencyPattern) || [];
  const countMatches = bullet.match(countPattern) || [];
  
  const hasPercentage = percentageMatches.length > 0;
  const hasCurrency = currencyMatches.length > 0;
  const hasCount = countMatches.length > 0;
  const hasRatio = ratioPattern.test(bullet);
  const hasGrowthVerb = growthPattern.test(bullet);
  
  return {
    hasPercentage,
    hasCurrency,
    hasCount,
    hasRatio,
    hasGrowthVerb,
    metricsFound: [...percentageMatches, ...currencyMatches, ...countMatches],
    isValid: hasPercentage || hasCurrency || hasCount,
  };
}

// ============================================
// KEYWORD EXTRACTION & MATCHING
// ============================================

// Keyword match result
export interface KeywordMatchResult {
  jobKeywords: string[];
  matchedKeywords: number;
  totalKeywords: number;
  matchPercentage: number;
  recommendation: 'GOOD' | 'REVIEW - Add more keywords';
}

// Stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
  'shall', 'can', 'need', 'dare', 'ought', 'used', 'this', 'that', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'whom',
  'your', 'our', 'their', 'its', 'my', 'his', 'her', 'about', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again',
  'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'only', 'own', 'same',
  'than', 'too', 'very', 'just', 'also', 'now', 'well', 'work', 'working',
]);

// Extract keywords from text
export function extractKeywords(text: string, limit: number = 20): string[] {
  const words = text.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w) && w.length > 3);
  
  // Count word frequency
  const wordCount = new Map<string, number>();
  words.forEach(word => {
    wordCount.set(word, (wordCount.get(word) || 0) + 1);
  });
  
  // Sort by frequency and return top N unique words
  return [...wordCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

// Calculate keyword match between CV and job description
export function calculateKeywordMatch(cvContent: string, jobDescription: string): KeywordMatchResult {
  const jobKeywords = extractKeywords(jobDescription, 20);
  const cvText = cvContent.toLowerCase();
  
  let matchedCount = 0;
  jobKeywords.forEach(keyword => {
    if (cvText.includes(keyword)) {
      matchedCount++;
    }
  });
  
  const matchPercentage = jobKeywords.length > 0 
    ? (matchedCount / jobKeywords.length) * 100 
    : 0;
  
  return {
    jobKeywords,
    matchedKeywords: matchedCount,
    totalKeywords: jobKeywords.length,
    matchPercentage: Math.round(matchPercentage),
    recommendation: matchPercentage >= 70 ? 'GOOD' : 'REVIEW - Add more keywords',
  };
}
