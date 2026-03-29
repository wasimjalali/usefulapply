import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing | Plans & Credits',
  description:
    'KarKo AI plans: Free (5 apps/month), Plus $39.99/month (50 apps), Max $79.99/month (100 apps). AI CV optimization, cover letters, and emails.',
  alternates: { canonical: '/pricing' },
  openGraph: {
    title: 'Pricing | Plans & Credits',
    description:
      'Free, Plus ($39.99/mo), and Max ($79.99/mo) plans for AI-powered job applications.',
    url: '/pricing',
    siteName: 'KarKo AI',
    type: 'website',
  },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
