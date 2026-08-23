import { Metadata } from 'next';
import { BRAND } from '@/lib/brand';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url;
const SITE_NAME = BRAND.name;
const DEFAULT_OG_IMAGE = '/opengraph-image.jpg';

export interface PageMetadataOptions {
  title: string;
  description: string;
  canonical: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  tags?: string[];
  noindex?: boolean;
}

/**
 * Build complete, consistent metadata for any page.
 * Ensures all required OpenGraph and Twitter fields are present.
 *
 * Usage:
 * ```ts
 * export async function generateMetadata(): Promise<Metadata> {
 *   return buildPageMetadata({
 *     title: 'Page Title',
 *     description: 'Page description',
 *     canonical: '/page-path',
 *   });
 * }
 * ```
 */
export function buildPageMetadata(options: PageMetadataOptions): Metadata {
  const {
    title,
    description,
    canonical,
    ogType = 'website',
    ogImage = DEFAULT_OG_IMAGE,
    publishedTime,
    modifiedTime,
    authors,
    tags,
    noindex = false,
  } = options;

  const canonicalUrl = canonical.startsWith('http') ? canonical : `${SITE_URL}${canonical}`;
  const imageUrl = ogImage.startsWith('http') ? ogImage : `${SITE_URL}${ogImage}`;

  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      type: ogType,
      title,
      description,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: 'en_US',
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };

  // Add article-specific fields
  if (ogType === 'article') {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: 'article',
      publishedTime,
      modifiedTime,
      authors,
      tags,
    };
  }

  // Add robots directive for non-indexable pages
  if (noindex) {
    metadata.robots = {
      index: false,
      follow: false,
    };
  }

  return metadata;
}
