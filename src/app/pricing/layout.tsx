import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Pricing — Plans & Credits',
  description:
    'Choose the right KarKo AI plan for your job search. Free, Plus ($29.99/mo), and Pro ($49.99/mo) plans with AI-powered CV optimization, cover letters, and application emails.',
  alternates: { canonical: '/pricing' },
};

export default function PricingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
