import Link from 'next/link';
import BrandLogo from '@/components/marketing/BrandLogo';
import TrustpilotLogo from '@/components/marketing/TrustpilotLogo';
import { getComparisons } from '@/lib/comparisons';
import { getAllPosts } from '@/lib/blog';

interface FooterLink {
  href: string;
  label: string;
}

const productLinks: FooterLink[] = [
  { href: '/#what-you-get', label: 'What you get' },
  { href: '/ai-job-application/application-tracker', label: 'Application Tracker' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/integrations', label: 'AI integrations' },
];

const companyLinks: FooterLink[] = [
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
  { href: '/auth/login', label: 'Log In' },
];

const legalLinks: FooterLink[] = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/cookies', label: 'Cookie Notice' },
  { href: '/imprint', label: 'Imprint' },
];

export default function Footer() {
  const comparisonLinks: FooterLink[] = getComparisons().map((comparison) => ({
    href: `/compare/${comparison.slug}`,
    label: `Useful Apply vs ${comparison.competitorName}`,
  }));

  const resourcesLinks: FooterLink[] = [
    ...comparisonLinks,
    { href: '/compare', label: 'All Comparisons' },
    { href: '/ai-job-application/free-no-signup-test', label: 'Free no-signup test' },
    { href: '/master-cv', label: 'Master CV Guide' },
  ];

  const recentBlogPosts = getAllPosts().slice(0, 5);

  return (
    <footer className="bg-gradient-to-b from-navy-600 to-navy-800 text-white relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-400/40 via-gold-500/60 to-gold-400/40" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Link columns (center) + blurb (right) */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-12 lg:gap-16">
          {/* Columns sit in the middle band */}
          <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10 md:gap-x-10">
            {/* Product */}
            <div>
              <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Product</h4>
              <ul className="space-y-3">
                {productLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Resources</h4>
              <ul className="space-y-3">
                {resourcesLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Blog */}
            <div>
              <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Blog</h4>
              <ul className="space-y-3">
                {recentBlogPosts.map((post) => (
                  <li key={post.slug}>
                    <Link href={`/blog/${post.slug}`} className="text-navy-200 hover:text-white text-sm transition-colors line-clamp-1">
                      {post.title.length > 50 ? `${post.title.slice(0, 50)}...` : post.title}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/blog"
                    className="text-teal-400 hover:text-teal-300 text-sm transition-colors inline-flex items-center gap-1"
                  >
                    View All Posts
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company & Legal */}
            <div>
              <div className="mb-8">
                <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Company</h4>
                <ul className="space-y-3">
                  {companyLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Legal</h4>
                <ul className="space-y-3">
                  {legalLinks.map((link) => (
                    <li key={link.href}>
                      <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Right blurb: tagline, email, contact, Trustpilot — single left edge */}
          <div className="lg:w-[280px] xl:w-[300px] shrink-0 flex flex-col items-start gap-4">
            <p className="text-sm text-white/90 leading-relaxed">
              Find jobs. Write applications. Track progress. All in one app.
            </p>
            <a
              href="mailto:support@usefulapply.com"
              className="text-sm text-navy-200 hover:text-white transition-colors duration-200"
            >
              support@usefulapply.com
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center h-9 px-3.5 text-sm text-cream-100/90 border border-white/20 rounded-lg hover:border-white/40 hover:text-white transition-colors duration-200"
            >
              Contact
            </Link>
            <TrustpilotLogo />
          </div>
        </div>

        {/* Large brand logo — same full/wide variant as the footer brand mark, scaled up */}
        <div className="mt-16 md:mt-20 lg:mt-24 mb-2">
          {/* Reserve layout space for CSS scale (xl logo is 64px tall) */}
          <div className="flex justify-center items-start h-[106px] sm:h-[128px] md:h-[160px] lg:h-[192px]">
            <Link
              href="/"
              aria-label="Useful Apply home"
              className="inline-flex origin-top scale-[1.65] sm:scale-[2] md:scale-[2.5] lg:scale-[3] transition-opacity hover:opacity-90"
            >
              <BrandLogo variant="full" size="xl" theme="dark" />
            </Link>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-navy-500/30 mt-8 md:mt-10 pt-6">
          <p className="text-navy-300 text-sm">
            © {new Date().getFullYear()} Useful Apply. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
