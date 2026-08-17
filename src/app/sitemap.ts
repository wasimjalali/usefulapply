import { MetadataRoute } from 'next';
import { getAllPosts } from '@/lib/blog';
import { getComparisons } from '@/lib/comparisons';
import { BRAND } from '@/lib/brand';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.url;

export default function sitemap(): MetadataRoute.Sitemap {
  const blogPosts = getAllPosts();
  const comparisons = getComparisons();

  const blogEntries: MetadataRoute.Sitemap = blogPosts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt || post.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const comparisonEntries: MetadataRoute.Sitemap = comparisons.map((comparison) => ({
    url: `${SITE_URL}/compare/${comparison.slug}`,
    lastModified: new Date(comparison.updatedAt || comparison.publishedAt),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/master-cv`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/features`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // GEO Pages - AI Job Application
    {
      url: `${SITE_URL}/ai-job-application`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/ai-job-application/90-second-application-package`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/free-no-signup-test`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/ats-optimization`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/zero-fabrication`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/integrations-workday-greenhouse-lever`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/pricing-credits`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/cover-letter-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/follow-up-email-generator`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/application-tracker`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/ai-job-application/screening-question-answers`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    // Master CV Template
    {
      url: `${SITE_URL}/master-cv-template`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/compare`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    ...blogEntries,
    ...comparisonEntries,
    {
      url: `${SITE_URL}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/imprint`,
      lastModified: new Date(),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
  ];
}
