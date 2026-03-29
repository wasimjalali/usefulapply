import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact Us',
  description:
    'Get in touch with the KarKo AI team. We\'d love to hear your feedback, answer questions, or help you get started with AI-powered job applications.',
  alternates: { canonical: '/contact' },
  openGraph: {
    title: 'Contact Us',
    description:
      'Get in touch with the KarKo AI team for feedback, questions, or help getting started.',
    url: '/contact',
    siteName: 'KarKo AI',
    type: 'website',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
