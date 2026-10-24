import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { getComparisonBySlug, getComparisons } from '@/lib/comparisons';
import { ComparisonHero } from '@/components/comparisons/ComparisonHero';
import { ComparisonDeepDive } from '@/components/comparisons/ComparisonDeepDive';
import { ComparisonFeatures } from '@/components/comparisons/ComparisonFeatures';
import { ComparisonUseCases } from '@/components/comparisons/ComparisonUseCases';
import { ComparisonFAQ } from '@/components/comparisons/ComparisonFAQ';

import { SEO_METADATA_BASE, SEO_SITE_URL, canonicalUrl } from '@/lib/seo/site-url';

interface ComparisonPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const comparisons = getComparisons();
  return comparisons.map((comparison) => ({ slug: comparison.slug }));
}

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);

  if (!comparison) {
    return { title: 'Comparison Not Found' };
  }

  return {
    metadataBase: SEO_METADATA_BASE,
    title: comparison.title,
    description: comparison.description,
    alternates: { canonical: canonicalUrl(`/compare/${comparison.slug}`) },
    openGraph: {
      type: 'article',
      title: comparison.title,
      description: comparison.description,
      url: canonicalUrl(`/compare/${comparison.slug}`),
      siteName: 'Useful Apply',
      publishedTime: comparison.publishedAt,
      modifiedTime: comparison.updatedAt || comparison.publishedAt,
      images: comparison.ogImage
        ? [{ url: comparison.ogImage, width: 1200, height: 630, alt: comparison.title }]
        : [{ url: '/favicon-512x512.png', width: 1200, height: 630, alt: comparison.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: comparison.title,
      description: comparison.description,
    },
  };
}

export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const { slug } = await params;
  const comparison = getComparisonBySlug(slug);

  if (!comparison) {
    notFound();
  }

  const SITE_URL = SEO_SITE_URL;

  // JSON-LD schemas
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/compare` },
      {
        '@type': 'ListItem',
        position: 3,
        name: comparison.title,
        item: `${SITE_URL}/compare/${comparison.slug}`,
      },
    ],
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: comparison.faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* JSON-LD schemas */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <Navbar />
      <main>
        {/* Back link */}
        <div className="pt-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <Link
              href="/compare"
              className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Comparisons
            </Link>
          </div>
        </div>

        {/* Hero with summary table */}
        <ComparisonHero
          h1={comparison.h1}
          description={comparison.description}
          summaryTable={comparison.summaryTable}
          competitorName={comparison.competitorName}
        />

        {/* Tool Deep Dives */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            <h2 className="font-bold text-brand text-[32px] leading-[1.1] mb-10 text-center">Detailed overview.</h2>
            <div className="grid lg:grid-cols-2 gap-8">
              <ComparisonDeepDive tool={comparison.brandOverview} isBrand={true} />
              <ComparisonDeepDive tool={comparison.competitorOverview} isBrand={false} />
            </div>
          </div>
        </section>

        {/* Feature-by-Feature Comparison */}
        {comparison.features.length > 0 && (
          <ComparisonFeatures features={comparison.features} competitorName={comparison.competitorName} />
        )}

        {/* Use Case Recommendations */}
        {comparison.useCases.length > 0 && (
          <ComparisonUseCases useCases={comparison.useCases} />
        )}

        {/* FAQ */}
        {comparison.faq.length > 0 && (
          <ComparisonFAQ faq={comparison.faq} />
        )}

        {/* Verdict & CTA */}
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto">
            <div className="bg-surface-inverse-raised rounded-card p-10 text-ink-inverse text-center">
              <h2 className="font-bold text-ink-inverse text-[28px] leading-[1.1] mb-4">The verdict.</h2>
              <p className="text-ink-inverse-muted mb-6 leading-relaxed">{comparison.verdict}</p>
              <Link
                href={comparison.ctaHref || '/dashboard'}
                className="inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control shadow-resting transition-colors"
              >
                {comparison.ctaText}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
