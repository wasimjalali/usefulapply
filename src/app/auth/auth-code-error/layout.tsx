import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In Error',
};

export default function AuthCodeErrorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
