'use client';

import { DocumentsPanel } from '@/components/DocumentsPanel';

export default function DocumentsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-cream-50 via-cream-100 to-cream-50">
      <DocumentsPanel mode="standalone" />
    </div>
  );
}
