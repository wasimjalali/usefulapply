import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documents — Upload Your CV',
  description:
    'Upload your CV and certifications to get started with KarKo AI. Supports PDF and DOCX formats for instant AI-powered job application optimization.',
  alternates: { canonical: '/documents' },
};

export default function DocumentsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
