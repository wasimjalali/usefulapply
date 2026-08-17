import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In | Useful Apply',
  description:
    'Sign in or create a free Useful Apply account. Get 4 free credits each month to generate AI-powered job applications, optimized CVs, and tailored cover letters.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
