import type { ReactNode } from 'react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { LEGAL } from '@/lib/legal';

export function LegalShell({
  title,
  updated = LEGAL.updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <Navbar />
      <main>
        <section className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-4xl font-semibold text-brand mb-4">{title}</h1>
            <p className="text-ink-muted mb-2">Last updated: {updated}</p>
            <p className="text-ink-muted mb-8">{LEGAL.entityLine}</p>
            <div className="prose prose-lg max-w-none text-ink-body space-y-8">{children}</div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return <h2 className="text-2xl font-semibold text-brand mb-4">{children}</h2>;
}

export function LegalH3({ children }: { children: ReactNode }) {
  return <h3 className="text-xl font-medium text-ink-body mb-3 mt-6">{children}</h3>;
}

export function LegalP({ children }: { children: ReactNode }) {
  return <p className="text-ink-muted mb-4 last:mb-0">{children}</p>;
}

export function LegalList({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-6 text-ink-muted space-y-2 mb-4 last:mb-0">{children}</ul>;
}
