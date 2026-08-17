import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Master CV — Build Your Career Profile',
  description:
    'Create a comprehensive Master CV with AI. Capture your entire professional history so Useful Apply can generate tailored applications for every job.',
  canonical: '/master-cv',
});

export default function MasterCVLayout({ children }: { children: React.ReactNode }) {
  return children;
}
