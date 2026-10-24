'use client';

import { Download, Loader2 } from 'lucide-react';
import { useSessionStore } from '@/store/useSessionStore';
import { sessionHasKit } from '@/components/shell/application-status';
import { useUIStore } from '@/store/useUIStore';

/** The one outlined "Download all" on the kit tab row. The work happens in KitExportHost. */
export function KitDownloadAll() {
  const hasKit = useSessionStore((s) => sessionHasKit(s.currentSession));
  const requestKitDownload = useUIStore((s) => s.requestKitDownload);
  const busy = useUIStore((s) => s.kitDownloadBusy);

  if (!hasKit) return null;

  return (
    <button
      type="button"
      onClick={requestKitDownload}
      disabled={busy}
      className="inline-flex h-10 flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border border-border bg-surface px-4 text-sm font-semibold text-ink shadow-resting hover:bg-surface-raised transition-colors duration-(--duration-base) cursor-pointer disabled:cursor-wait"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      Download all
    </button>
  );
}
