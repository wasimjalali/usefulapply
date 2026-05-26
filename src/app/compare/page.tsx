import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, GitCompare } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { getComparisons } from '@/lib/comparisons';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.karkoai.com';

export const metadata: Metadata = buildPageMetadata({
  title: 'Karko AI vs Resume Builders: Side-by-Side Comparisons',
  description:
    "How Karko AI compares to Teal, Jobscan, Rezi, Kickresume, Enhancv, and Resume.io. Tailored applications grounded in your real CV vs traditional resume builders. See which one fits your job search.",
  canonical: '/compare',
});

export default function CompareHubPage() {
  const comparisons = getComparisons();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Karko AI Competitor Comparisons',
    description:
      'Side-by-side comparisons between Karko AI and resume builders, ATS scanners, and application trackers.',
    itemListElement: comparisons.map((comparison, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${SITE_URL}/compare/${comparison.slug}`,
      name: `Karko AI vs ${comparison.competitorName}`,
    })),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
      { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/compare` },
    ],
  };

  return (
    <div className="min-h-screen bg-cream-100">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <Navbar />
      <main>
        <section className="pt-20 pb-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto text-center">
            <ScrollReveal delay={0} direction="down" distance={20}>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-cream-50 rounded-full text-sm text-charcoal mb-6 shadow-sm border border-cream-200">
                <GitCompare className="w-4 h-4 text-gold-500" />
                <span className="font-medium">Compare</span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="font-serif font-semibold text-navy-600 text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-5">
                Karko AI vs <span className="text-gold-500">the alternatives.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-lg lg:text-xl text-warm-gray max-w-2xl mx-auto leading-relaxed">
                Most tools format a resume. Karko runs the full job search loop. See how Karko stacks up against the resume builders, ATS scanners, and trackers you might already use.
              </p>
            </ScrollReveal>
          </div>
        </section>

        <section className="pb-24 px-4 sm:px-6 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {comparisons.map((comparison, i) => (
                <ScrollReveal key={comparison.slug} delay={i * 80}>
                  <Link
                    href={`/compare/${comparison.slug}`}
                    className="group block h-full bg-cream-50 border border-cream-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gold-300 transition-all duration-200"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-semibold text-navy-600 text-base">Karko AI</span>
                      <span className="text-warm-gray text-xs uppercase tracking-widest">vs</span>
                      <span className="font-semibold text-charcoal text-base">
                        {comparison.competitorName}
                      </span>
                    </div>
                    <p className="text-warm-gray text-sm leading-relaxed mb-5 line-clamp-4">
                      {comparison.description}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-gold-600 group-hover:text-gold-700 transition-colors">
                      Read the comparison
                      <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
                    </span>
                  </Link>
                </ScrollReveal>
              ))}
            </div>

            <div className="mt-16 bg-cream-50 border border-cream-200 rounded-2xl p-8 sm:p-10 text-center shadow-sm">
              <h2 className="font-serif font-semibold text-navy-600 text-[28px] md:text-[32px] leading-[1.15] mb-3">
                Not sure which one fits?
              </h2>
              <p className="text-warm-gray max-w-xl mx-auto mb-6">
                Try Karko free for 2 applications. No credit card, no commitment. If a resume builder fits your workflow better, you can tell in 90 seconds.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-0.5"
              >
                Start free, no credit card
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
