export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  content: string;
  author: {
    name: string;
    role: string;
  };
  publishedAt: string;
  updatedAt?: string;
  readingTime: number;
  category: BlogCategory;
  tags: string[];
  featured?: boolean;
  ogImage?: string;
}

export type BlogCategory =
  | 'Career Tips'
  | 'AI & Technology'
  | 'Job Search'
  | 'CV Writing'
  | 'Cover Letters'
  | 'Interview Prep'
  | 'Product Updates';

export const CATEGORY_COLORS: Record<BlogCategory, { bg: string; text: string; border: string }> = {
  'Career Tips': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  'AI & Technology': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  'Job Search': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  'CV Writing': { bg: 'bg-gold-50', text: 'text-gold-700', border: 'border-gold-200' },
  'Cover Letters': { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  'Interview Prep': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'Product Updates': { bg: 'bg-navy-50', text: 'text-navy-700', border: 'border-navy-200' },
};
