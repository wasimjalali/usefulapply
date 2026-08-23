import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Contact Us',
  description:
    'Get in touch with the Useful Apply team. We\'d love to hear your feedback, answer questions, or help you get started with AI-powered job applications.',
  canonical: '/contact',
});

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
