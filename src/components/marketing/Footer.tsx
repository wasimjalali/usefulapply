import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-navy-600 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <img src="/karko-ai.png" alt="KarKo AI" className="h-24 w-auto" />
            </Link>
            <p className="text-navy-200 text-sm">
              AI-powered job applications that get you noticed. Save hours, land more interviews.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-semibold text-white mb-4">Product</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/pricing" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/auth/signup" className="text-navy-200 hover:text-white text-sm transition-colors">
                  Get Started
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
            <h4 className="font-semibold text-white mb-4">Company</h4>
            <ul className="space-y-2">
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
            <h4 className="font-semibold text-white mb-4">Legal</h4>
            <ul className="space-y-2">
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
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-navy-500 mt-8 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-navy-200 text-sm">
            © {new Date().getFullYear()} KarKo AI. All rights reserved.
          </p>
          <p className="text-navy-300 text-xs">
            Made with care for job seekers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
