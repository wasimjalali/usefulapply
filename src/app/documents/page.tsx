'use client';

import { DocumentsPanel } from '@/components/DocumentsPanel';

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <DocumentsPanel mode="standalone" />
    </div>
  );
}
