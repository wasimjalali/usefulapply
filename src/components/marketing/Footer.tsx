import Link from 'next/link';
import KarkoLogo from '@/components/KarkoLogo';
import TrustpilotLogo from '@/components/marketing/TrustpilotLogo';
import { getComparisons } from '@/lib/comparisons';
import { getAllPosts } from '@/lib/blog';

interface FooterLink {
  href: string;
  label: string;
}

const productLinks: FooterLink[] = [
  { href: '/features', label: 'Features' },
  { href: '/features#smart-job-feed', label: 'Smart Job Feed' },
  { href: '/#how-it-works', label: 'How It Works' },
  { href: '/ai-job-application/application-tracker', label: 'Application Tracker' },
  { href: '/pricing', label: 'Pricing' },
];

const companyLinks: FooterLink[] = [
  { href: '/about', label: 'About Us' },
  { href: '/contact', label: 'Contact' },
  { href: '/auth/login', label: 'Log In' },
];

const legalLinks: FooterLink[] = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/imprint', label: 'Imprint' },
];

export default function Footer() {
  const comparisonLinks: FooterLink[] = getComparisons().map((comparison) => ({
    href: `/compare/${comparison.slug}`,
    label: `Karko AI vs ${comparison.competitorName}`,
  }));

  const resourcesLinks: FooterLink[] = [
    ...comparisonLinks,
    { href: '/compare', label: 'All Comparisons' },
    { href: '/ai-job-application/free-no-signup-test', label: 'Try Free, No Sign-Up' },
    { href: '/master-cv', label: 'Master CV Guide' },
  ];

  const recentBlogPosts = getAllPosts().slice(0, 5);

  return (
    <footer className="bg-gradient-to-b from-navy-600 to-navy-800 text-white relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-400/40 via-gold-500/60 to-gold-400/40" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-12 gap-8 md:gap-6">
          {/* Brand */}
          <div className="md:col-span-2 lg:col-span-4">
            <Link href="/" className="flex items-center mb-3">
              <KarkoLogo variant="full" size="lg" theme="dark" />
            </Link>
            <p className="text-sm text-white/90 leading-relaxed max-w-[320px] mb-5">
              Find jobs. Write applications. Track progress. All in one app.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-gold-400 hover:bg-gold-500 text-white rounded-xl transition-all shadow-sm hover:shadow-md"
            >
              Start free, no credit card
            </Link>
          </div>

          {/* Product */}
          <div className="lg:col-span-2">
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
          <div className="lg:col-span-2">
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
          <div className="lg:col-span-2">
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
          <div className="lg:col-span-2">
            {/* Company Section */}
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

            {/* Legal Section */}
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

        {/* Bottom */}
        <div className="border-t border-navy-500/30 mt-12 pt-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <p className="text-navy-300 text-sm">
              © {new Date().getFullYear()} KarKo AI. All rights reserved.
            </p>

            {/* Trustpilot Review Link */}
            <TrustpilotLogo />

            <a href="mailto:support@karkoai.com" className="text-navy-300 text-sm hover:text-white transition-colors">
              support@karkoai.com
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
