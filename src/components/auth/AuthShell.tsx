'use client';

import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';

interface AuthShellProps {
  /** The one quiet text link in the top right. */
  linkLabel: string;
  linkHref: string;
  children: React.ReactNode;
}

/**
 * The frame every auth page sits in: the guided line's header (wordmark back to
 * the marketing home, one quiet text link) over a cream canvas with a single
 * 440 px column for the card and the line under it.
 */
export function AuthShell({ linkLabel, linkHref, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-[52px] flex-shrink-0 items-center border-b border-border bg-surface px-5">
        <Link href="/" aria-label="Useful Apply home" className="cursor-pointer">
          <BrandLogo variant="full" size="xs" theme="light" />
        </Link>
        <div className="flex-1" />
        <Link
          href={linkHref}
          className="px-2.5 text-sm font-medium text-brand transition-colors duration-(--duration-base) hover:text-ink cursor-pointer"
        >
          {linkLabel}
        </Link>
      </header>

      <main className="flex flex-1 justify-center px-4 pb-16 pt-[88px]">
        <div className="w-full max-w-[504px]">{children}</div>
      </main>
    </div>
  );
}
