import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Master CV — Build Your Career Profile',
  description:
    'Create a comprehensive Master CV with AI. Capture your entire professional history so KarKo AI can generate tailored applications for every job.',
  alternates: { canonical: '/master-cv' },
  openGraph: {
    title: 'Master CV — Build Your Career Profile | KarKo AI',
    description:
      'Create a comprehensive Master CV with AI. Capture your full professional history for tailored job applications.',
    url: '/master-cv',
    siteName: 'KarKo AI',
    type: 'website',
  },
};

export default function MasterCVLayout({ children }: { children: React.ReactNode }) {
  return children;
}
