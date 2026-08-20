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
  // The session resolves over the network, so the CTA would flash "Try it
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
      <div className="rounded-2xl border border-cream-200 bg-cream-50 px-4 shadow-sm sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" onClick={handleLogoClick} className="flex items-center">
            <BrandLogo variant="full" size="sm" theme="light" />
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-charcoal transition-colors duration-200 hover:text-navy-600"
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
                className="inline-flex h-10 items-center gap-1.5 rounded-full border border-cream-200 bg-white px-5 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-cream-100"
              >
                Open app
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/auth/login"
                  className="text-sm font-medium text-charcoal transition-colors duration-200 hover:text-navy-600"
                >
                  Log in
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex h-10 items-center rounded-full bg-gold-400 px-5 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500"
                >
                  Try it free
                </Link>
              </>
            )}
          </nav>

          <button
            className="p-2 text-charcoal md:hidden cursor-pointer"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-cream-200 py-4 md:hidden">
            <nav className="flex flex-col gap-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-charcoal transition-colors duration-200 hover:text-navy-600"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 border-t border-cream-200 pt-4">
                {isSignedIn ? (
                  <Link
                    href="/dashboard"
                    className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border border-cream-200 bg-white text-sm font-semibold text-navy-800 shadow-sm"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Open app
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/auth/login"
                      className="text-sm font-medium text-charcoal transition-colors duration-200 hover:text-navy-600"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Log in
                    </Link>
                    <Link
                      href="/dashboard"
                      className="inline-flex h-11 items-center justify-center rounded-full bg-gold-400 text-sm font-semibold text-white shadow-sm"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Try it free
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
