'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ArrowUpRight } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { hasStoredAuthHint, useAuth } from '@/contexts/AuthContext';

// Only pages and anchors that exist. Contact and the legal pages stay in
// the footer.
const NAV_LINKS = [
  { href: '/#what-you-get', label: 'What you get' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
];

const subscribeToNothing = () => () => {};
const getServerHint = () => null;

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, isLoading } = useAuth();
  // The session resolves over the network, so the CTA would flash "Start
  // free" at a signed-in visitor before flipping. The localStorage hint is
  // synchronous: right after hydration the CTA already knows which way to
  // lean, and the resolved session settles it. The server snapshot is null,
  // "not decided yet", which renders a neutral placeholder for that first
  // frame only. The store never emits; this is a synchronous client read.
  const hint = useSyncExternalStore<boolean | null>(subscribeToNothing, hasStoredAuthHint, getServerHint);
  const isSignedIn: boolean | null = user ? true : isLoading ? hint : false;

  // Close the mobile menu on a route change (e.g. browser back/forward).
  // Adjusted during render rather than in an effect, so it costs no extra pass.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileMenuOpen(false);
  }

  const handleLogoClick = (e: React.MouseEvent) => {
    if (pathname === '/') {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <header className="sticky top-3 z-50 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="rounded-card border border-border bg-surface px-4 shadow-resting sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" onClick={handleLogoClick} className="flex items-center">
            <BrandLogo variant="full" size="sm" theme="light" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-body transition-colors duration-(--duration-base) hover:text-brand"
              >
                {link.label}
              </Link>
            ))}

            {isSignedIn === null ? (
              /* Neutral for the first frame, until the stored hint is read. */
              <span aria-hidden className="h-10 w-[120px]" />
            ) : isSignedIn ? (
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center gap-1.5 rounded-pill border border-border bg-surface-raised px-5 text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-canvas"
              >
                Open app
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-ink-body transition-colors duration-(--duration-base) hover:text-brand"
                >
                  Log in
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center rounded-pill bg-accent px-5 text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong"
                >
                  Start free
                </Link>
              </>
            )}
          </nav>

          <button
            className="p-2 text-ink-body md:hidden cursor-pointer"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-border py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-ink-body transition-colors duration-(--duration-base) hover:text-brand"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                {isSignedIn ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-pill border border-border bg-surface-raised text-sm font-semibold text-ink shadow-resting"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Open app
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      className="text-sm font-medium text-ink-body transition-colors duration-(--duration-base) hover:text-brand"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log in
                    </Link>
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center justify-center rounded-pill bg-accent text-sm font-semibold text-accent-ink shadow-resting"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Start free
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
