'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useUIStore } from '@/store/useUIStore';
import { Loader2 } from 'lucide-react';

/**
 * Redirect /applications to /dashboard with the tracker panel active.
 * Preserves bookmarks and links that point to the old standalone page.
 */
export default function ApplicationsRedirect() {
  const router = useRouter();

  useEffect(() => {
    useUIStore.getState().setActiveTab('tracker');
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-navy-600" />
    </div>
  );
}
