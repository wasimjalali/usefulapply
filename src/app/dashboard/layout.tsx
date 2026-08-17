import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — AI Job Application Generator',
  description:
    'Generate tailored job applications with Useful Apply. Paste a job description and get an optimized CV, cover letter, and email in under 90 seconds.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
