import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing: AI Job Application Plans from $39.99/month',
  description:
    'Transparent pricing for AI job applications: Free (5 apps), Plus $39.99/mo (50 apps), Max $79.99/mo (100 apps). No hidden fees. Compare plans.',
  canonical: '/pricing',
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
