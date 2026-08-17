import { MetadataRoute } from 'next';
import { BRAND } from '@/lib/brand';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || BRAND.url;

export default function robots(): MetadataRoute.Robots {
  const appRoutes = ['/api/', '/dashboard/', '/documents/', '/settings/'];

  return {
    rules: [
      // Default: allow public pages, block app routes
      // Auth pages are public utilities (noindex set at page level)
      {
        userAgent: '*',
        allow: '/',
        disallow: appRoutes,
      },
      // OpenAI crawlers
      {
        userAgent: 'GPTBot',
        allow: ['/', '/about', '/pricing', '/master-cv', '/contact'],
        disallow: appRoutes,
      },
      {
        userAgent: 'ChatGPT-User',
        allow: '/',
        disallow: appRoutes,
      },
      // Google AI (Gemini)
      {
        userAgent: 'Google-Extended',
        allow: '/',
        disallow: appRoutes,
      },
      // Anthropic (Claude)
      {
        userAgent: 'anthropic-ai',
        allow: '/',
        disallow: appRoutes,
      },
      {
        userAgent: 'ClaudeBot',
        allow: '/',
        disallow: appRoutes,
      },
      // Perplexity AI
      {
        userAgent: 'PerplexityBot',
        allow: '/',
        disallow: appRoutes,
      },
      // Cohere AI
      {
        userAgent: 'cohere-ai',
        allow: '/',
        disallow: appRoutes,
      },
      // Meta AI
      {
        userAgent: 'Meta-ExternalAgent',
        allow: '/',
        disallow: appRoutes,
      },
      // Microsoft/Bing AI
      {
        userAgent: 'Bingbot',
        allow: '/',
        disallow: appRoutes,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
