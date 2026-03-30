import Link from 'next/link';
import KarkoLogo from '@/components/KarkoLogo';
import TrustpilotLogo from '@/components/marketing/TrustpilotLogo';
import { getComparisons } from '@/lib/comparisons';

interface FooterLink {
  href: string;
  label: string;
}

const toolsAndFeaturesLinks: FooterLink[] = [
  { href: '/features', label: 'All Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/master-cv', label: 'CV Builder (Master CV)' },
  { href: '/ai-job-application/ats-optimization', label: 'ATS Optimization' },
  { href: '/ai-job-application/cover-letter-generator', label: 'Cover Letter Generation' },
  { href: '/ai-job-application/90-second-application-package', label: 'Application Email Generation' },
  { href: '/ai-job-application/follow-up-email-generator', label: 'Follow-Up Email Generation' },
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

  const compareAndBlogLinks: FooterLink[] = [
    ...comparisonLinks,
    { href: '/blog', label: 'Blog' },
  ];

  return (
    <footer className="bg-gradient-to-b from-navy-600 to-navy-800 text-white relative">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-gold-400/40 via-gold-500/60 to-gold-400/40" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-12 gap-8 md:gap-6">
          {/* Brand */}
          <div className="md:col-span-2 lg:col-span-4">
            <Link href="/" className="flex items-center mb-3">
              <KarkoLogo variant="full" size="lg" theme="dark" />
            </Link>
            <p className="text-sm text-white/90 leading-relaxed max-w-[320px] mb-5">
              Get your complete job application package in 90 seconds.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-gradient-to-r from-gold-400 to-gold-500 text-white rounded-xl hover:from-gold-500 hover:to-gold-600 transition-all shadow-sm hover:shadow-md"
            >
              Try It Free - 5 Applications, No Credit Card
            </Link>
          </div>

          {/* Tools & Features */}
          <div className="lg:col-span-2">
            <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Tools & Features</h4>
            <ul className="space-y-3">
              {toolsAndFeaturesLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Compare + Blog */}
          <div className="lg:col-span-2">
            <h4 className="font-semibold text-gold-400 text-xs uppercase tracking-widest mb-4">Compare + Blog</h4>
            <ul className="space-y-3">
              {compareAndBlogLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-navy-200 hover:text-white text-sm transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div className="lg:col-span-2">
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

          {/* Legal */}
          <div className="lg:col-span-2">
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

        {/* Bottom */}
        <div className="border-t border-navy-500/30 mt-10 pt-6">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
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
