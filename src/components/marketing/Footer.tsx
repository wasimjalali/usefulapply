import Link from 'next/link';
import KarkoLogo from '@/components/KarkoLogo';
import TrustpilotLogo from '@/components/marketing/TrustpilotLogo';

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-navy-600 to-navy-800 text-white relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center mb-4">
              <KarkoLogo variant="full" size="lg" theme="dark" />
            </Link>
            <p className="text-lg font-semibold text-white/90 mb-2">
              One Click. Complete Job Application. Under 90 Seconds.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/pricing" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/master-cv" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Master CV
                </Link>
              </li>
              <li>
                <Link href="/dashboard" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Try It Free
                </Link>
              </li>
              <li>
                <Link href="/auth/login" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Log In
                </Link>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className="text-navy-200 hover:text-white text-sm transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/blog" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Blog
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Legal</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/privacy" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link href="/imprint" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Imprint
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-navy-500/50 mt-12 pt-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <p className="text-navy-300 text-sm">
              © {new Date().getFullYear()} KarKo AI. All rights reserved.
            </p>
            
            {/* Trustpilot Review Link */}
            <TrustpilotLogo />
            
            <a href="mailto:wasim@karkoai.com" className="text-navy-300 text-sm hover:text-white transition-colors">
              wasim@karkoai.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
