import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — KarKo AI',
  description:
    'Sign in or create a free KarKo AI account. Get 10 free credits to generate AI-powered job applications, optimized CVs, and tailored cover letters.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
