import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Pricing | Plans & Credits',
  description:
    'KarKo AI plans: Free (5 apps/month), Plus $39.99/month (50 apps), Max $79.99/month (100 apps). AI CV optimization, cover letters, and emails.',
  canonical: '/pricing',
});

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
