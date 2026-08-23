import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { pricingFAQs } from '@/lib/marketing/pricing-faqs';

import { BRAND } from '@/lib/brand';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url;

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing: AI Job Application Plans from $19.99/month',
  description:
    'Transparent pricing for AI job applications: Free (2 apps), Plus $19.99/mo (25 apps), Max $79.99/mo (100 apps). No hidden fees. Compare plans.',
  canonical: '/pricing',
});

const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: pricingFAQs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
    { '@type': 'ListItem', position: 2, name: 'Pricing', item: `${SITE_URL}/pricing` },
  ],
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
