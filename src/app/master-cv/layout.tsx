import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Master CV — Build Your Complete Career Profile',
  description:
    'Create a comprehensive Master CV with AI assistance. A Master CV captures your entire professional history so KarKo AI can generate perfectly tailored applications for every job.',
  alternates: { canonical: '/master-cv' },
  openGraph: {
    title: 'Master CV — Build Your Complete Career Profile | KarKo AI',
    description:
      'Create a comprehensive Master CV with AI. Capture your full professional history for perfectly tailored job applications.',
  },
};

export default function MasterCVLayout({ children }: { children: React.ReactNode }) {
  return children;
}
