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
  /**
   * Manual ranking override for the blog index page. Lower number = higher on the page.
   * Used to pin product-launch / high-value posts to the top. Posts without a priority
   * sort by publishedAt desc after all prioritized posts.
   */
   priority?: number;
  ogImage?: string;
  cta?: {
    heading?: string;
    description?: string;
    text: string;
    href?: string;
  };
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
  'Career Tips': { bg: 'bg-tag-blue-soft', text: 'text-tag-blue-ink', border: 'border-tag-blue-line' },
  'AI & Technology': { bg: 'bg-tag-purple-soft', text: 'text-tag-purple-ink', border: 'border-tag-purple-line' },
  'Job Search': { bg: 'bg-tag-green-soft', text: 'text-tag-green-ink', border: 'border-tag-green-line' },
  'CV Writing': { bg: 'bg-accent-soft', text: 'text-accent-soft-ink', border: 'border-border-accent-soft' },
  'Cover Letters': { bg: 'bg-tag-rose-soft', text: 'text-tag-rose-ink', border: 'border-tag-rose-line' },
  'Interview Prep': { bg: 'bg-tag-orange-soft', text: 'text-tag-orange-ink', border: 'border-tag-orange-line' },
  'Product Updates': { bg: 'bg-brand-soft', text: 'text-brand-strong', border: 'border-border-brand-soft' },
};
