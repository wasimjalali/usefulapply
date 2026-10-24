import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, GitCompare } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { getComparisons } from '@/lib/comparisons';

import { SEO_SITE_URL } from '@/lib/seo/site-url';

const SITE_URL = SEO_SITE_URL;

export const metadata: Metadata = buildPageMetadata({
  title: 'Useful Apply vs Resume Builders: Side-by-Side Comparisons',
  description:
    "How Useful Apply compares to Teal, Jobscan, Rezi, Kickresume, Enhancv, and Resume.io. Tailored applications grounded in your real CV vs traditional resume builders. See which one fits your job search.",
  canonical: '/compare',
});

export default function CompareHubPage() {
  const comparisons = getComparisons();

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Useful Apply Competitor Comparisons',
    description:
      'Side-by-side comparisons between Useful Apply and resume builders, ATS scanners, and application trackers.',
    itemListElement: comparisons.map((comparison, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${SITE_URL}/compare/${comparison.slug}`,
      name: `Useful Apply vs ${comparison.competitorName}`,
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
    <div className="min-h-screen bg-canvas">
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
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface rounded-pill text-sm text-ink-body mb-6 shadow-resting border border-border">
                <GitCompare className="w-4 h-4 text-accent-strong" />
                <span className="font-medium">Compare</span>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={150}>
              <h1 className="font-semibold text-brand text-[44px] sm:text-[52px] lg:text-[56px] leading-[1.05] tracking-tight mb-5">
                Useful Apply vs <span className="text-accent-strong">the alternatives.</span>
              </h1>
            </ScrollReveal>
            <ScrollReveal delay={300}>
              <p className="text-lg lg:text-xl text-ink-muted max-w-2xl mx-auto leading-relaxed">
                Most tools format a resume. Useful Apply runs the full job search loop. See how Useful Apply stacks up against the resume builders, ATS scanners, and trackers you might already use.
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
                    className="group block h-full bg-surface border border-border rounded-card p-6 shadow-resting hover:shadow-elevated transition-shadow duration-(--duration-base) ease-standard"
                  >
                    <div className="flex items-center gap-2 mb-4">
                      <span className="font-semibold text-brand text-base">Useful Apply</span>
                      <span className="text-ink-muted text-xs uppercase tracking-widest">vs</span>
                      <span className="font-semibold text-ink-body text-base">
                        {comparison.competitorName}
                      </span>
                    </div>
                    <p className="text-ink-muted text-sm leading-relaxed mb-5 line-clamp-4">
                      {comparison.description}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-accent group-hover:text-accent-soft-ink transition-colors">
                      Read the comparison
                      <ArrowRight className="w-4 h-4 transition-transform duration-(--duration-base) group-hover:translate-x-1" />
                    </span>
                  </Link>
                </ScrollReveal>
              ))}
            </div>

            <div className="mt-16 bg-surface border border-border rounded-card p-8 sm:p-10 text-center shadow-resting">
              <h2 className="font-semibold text-brand text-[28px] md:text-[32px] leading-[1.15] mb-3">
                Not sure which one fits?
              </h2>
              <p className="text-ink-muted max-w-xl mx-auto mb-6">
                Try Useful Apply free for 2 applications. No credit card, no commitment. If a resume builder fits your workflow better, you can tell in 90 seconds.
              </p>
              <Link
                href="/dashboard"
                className="inline-flex items-center px-6 py-3 bg-accent hover:bg-accent-strong text-accent-ink font-semibold rounded-control shadow-resting hover:shadow-elevated transition-shadow duration-(--duration-base) ease-standard"
              >
                Start free
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
