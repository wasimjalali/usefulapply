import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In — KarKo AI',
  description:
    'Sign in or create a free KarKo AI account. Get 40 free credits to generate AI-powered job applications, optimized CVs, and tailored cover letters.',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
