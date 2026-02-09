import { BlogPost } from './types';

/**
 * Blog posts data store.
 * 
 * To add a new blog post:
 * 1. Add a new object to this array
 * 2. The sitemap, listing page, and RSS feed will automatically include it
 * 3. No other changes needed — the dynamic route handles rendering
 * 
 * Content uses Markdown format for rich text rendering.
 */
export const blogPosts: BlogPost[] = [
  // Blog posts will be added here
  // Example structure:
  // {
  //   slug: 'how-to-optimize-cv-for-ats',
  //   title: 'How to Optimize Your CV for ATS in 2026',
  //   description: 'Learn how Applicant Tracking Systems work and how to format your CV to pass ATS screening.',
  //   content: `Your markdown content here...`,
  //   author: { name: 'Wasim Jalali', role: 'Founder & CEO' },
  //   publishedAt: '2026-02-10',
  //   readingTime: 8,
  //   category: 'CV Writing',
  //   tags: ['ATS', 'CV optimization', 'resume tips'],
  //   featured: true,
  // },
];

export function getAllPosts(): BlogPost[] {
  return blogPosts
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
}

export function getPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}

export function getFeaturedPosts(): BlogPost[] {
  return getAllPosts().filter((post) => post.featured);
}

export function getPostsByCategory(category: string): BlogPost[] {
  return getAllPosts().filter((post) => post.category === category);
}

export function getAllCategories(): string[] {
  return [...new Set(blogPosts.map((post) => post.category))];
}

export function getAllTags(): string[] {
  return [...new Set(blogPosts.flatMap((post) => post.tags))];
}
