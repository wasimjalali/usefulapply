import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard — AI Job Application Generator',
  description:
    'Generate tailored job applications with KarKo AI. Paste a job description and get an optimized CV, cover letter, and email in under 90 seconds.',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
