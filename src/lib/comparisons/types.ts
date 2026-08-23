/**
 * Type definitions for competitor comparison pages
 */

export interface ComparisonTool {
  name: string;
  slug: string;
  description: string;
  pricing: string;
  pros: string[];
  cons: string[];
  bestFor: string;
  rating?: number;
  url?: string;
  keyFeatures?: string[];
}

export interface SummaryTableRow {
  feature: string;
  brandValue: string | boolean;
  competitorValue: string | boolean;
  brandWins?: boolean;
}

export interface FeatureComparison {
  title: string;
  description: string;
  brandDetails: string;
  competitorDetails: string;
  winner: 'brand' | 'competitor' | 'tie';
  reasoning: string;
}

export interface UseCase {
  title: string;
  description: string;
  recommendedTool: string;
  reasoning: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface ComparisonData {
  slug: string;
  title: string;
  description: string;
  h1: string;
  publishedAt: string;
  updatedAt?: string;
  competitorName: string;
  competitorSlug: string;

  // Overview sections
  brandOverview: ComparisonTool;
  competitorOverview: ComparisonTool;

  // Comparison content
  summaryTable: SummaryTableRow[];
  features: FeatureComparison[];
  useCases: UseCase[];
  faq: FAQ[];

  // SEO
  verdict: string;
  ctaText: string;
  ctaHref?: string;
  ogImage?: string;
  tags?: string[];
}
