import Link from 'next/link';
import Image from 'next/image';

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-navy-600 to-navy-800 text-white relative">
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-gold-400 via-gold-500 to-gold-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-1 mb-4">
              <Image src="/karko-ai.png" alt="KarKo AI" width={80} height={80} className="h-20 w-auto" />
              <span className="text-gold-400 font-bold text-2xl leading-none">AI</span>
            </Link>
            <p className="text-navy-200 text-sm leading-relaxed">
              AI-powered job applications that get you noticed. Save 45+ minutes per application and land more interviews.
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
                <Link href="/auth/signup" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Get Started Free
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
        <div className="border-t border-navy-500/50 mt-12 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-navy-300 text-sm">
            © {new Date().getFullYear()} KarKo AI. All rights reserved.
          </p>
          <p className="text-navy-400 text-xs">
            Built by a job seeker, for job seekers.
          </p>
        </div>
      </div>
    </footer>
  );
}
