import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { getComparisonBySlug, getComparisons } from '@/lib/comparisons';
import { ComparisonHero } from '@/components/comparisons/ComparisonHero';
import { ComparisonDeepDive } from '@/components/comparisons/ComparisonDeepDive';
import { ComparisonFeatures } from '@/components/comparisons/ComparisonFeatures';
import { ComparisonUseCases } from '@/components/comparisons/ComparisonUseCases';
import { ComparisonFAQ } from '@/components/comparisons/ComparisonFAQ';

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

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

  return {
    title: comparison.title,
    description: comparison.description,
    alternates: { canonical: `/compare/${comparison.slug}` },
    openGraph: {
      type: 'article',
      title: comparison.title,
      description: comparison.description,
      url: `${SITE_URL}/compare/${comparison.slug}`,
      siteName: 'KarKo AI',
      publishedTime: comparison.publishedAt,
      modifiedTime: comparison.updatedAt || comparison.publishedAt,
      images: comparison.ogImage
        ? [{ url: comparison.ogImage, width: 1200, height: 630, alt: comparison.title }]
        : [{ url: '/karko-ai.png', width: 1200, height: 630, alt: comparison.title }],
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

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

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
    <div className="min-h-screen bg-cream-100">
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
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm text-warm-gray hover:text-navy-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Blog
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
            <h2 className="font-bold text-navy-600 text-[32px] leading-[1.1] mb-10 text-center">Detailed overview.</h2>
            <div className="grid lg:grid-cols-2 gap-8">
              <ComparisonDeepDive tool={comparison.karkoOverview} isKarko={true} />
              <ComparisonDeepDive tool={comparison.competitorOverview} isKarko={false} />
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
            <div className="bg-navy-700 rounded-2xl p-10 text-white text-center">
              <h2 className="font-bold text-white text-[28px] leading-[1.1] mb-4">The verdict.</h2>
              <p className="text-navy-200 mb-6 leading-relaxed">{comparison.verdict}</p>
              <Link
                href={comparison.ctaHref || '/dashboard'}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm transition-colors"
              >
                {comparison.ctaText}
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
