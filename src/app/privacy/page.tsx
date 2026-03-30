import type { Metadata } from 'next';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { buildPageMetadata } from '@/lib/seo/metadata';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'KarKo AI Privacy Policy. Learn how we handle your data, protect your CV information, and ensure GDPR compliance.',
  canonical: '/privacy',
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-navy-600 mb-4">Privacy Policy</h1>
          <p className="text-warm-gray mb-8">Last Updated: February 3, 2026</p>

          <div className="prose prose-lg max-w-none text-charcoal space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">1. Introduction</h2>
              <p className="text-warm-gray">
                Karko AI operates an AI-powered job application platform. 
                This policy explains how we collect, use, and protect your personal data.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">2. Data We Collect</h2>
              
              <h3 className="text-xl font-medium text-charcoal mb-3">2.1 Account Information</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Email address</li>
                <li>Password (encrypted)</li>
                <li>Name</li>
              </ul>

              <h3 className="text-xl font-medium text-charcoal mb-3 mt-6">2.2 Application Data</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>CV/Resume content</li>
                <li>Job descriptions you submit</li>
                <li>Generated cover letters and emails</li>
                <li>Application history</li>
              </ul>

              <h3 className="text-xl font-medium text-charcoal mb-3 mt-6">2.3 Technical Data</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>IP address</li>
                <li>Browser type</li>
                <li>Device information</li>
                <li>Usage analytics</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">3. How We Use Your Data</h2>
              
              <h3 className="text-xl font-medium text-charcoal mb-3">3.1 Core Service</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Generate personalized CVs, cover letters, and emails</li>
                <li>Store your application history</li>
                <li>Improve AI matching accuracy</li>
              </ul>

              <h3 className="text-xl font-medium text-charcoal mb-3 mt-6">3.2 AI Processing</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Your CV and job descriptions are processed by AI models (Anthropic Claude)</li>
                <li>We do NOT sell your data to third parties</li>
                <li>AI providers may process data per their terms (see Section 7)</li>
              </ul>

              <h3 className="text-xl font-medium text-charcoal mb-3 mt-6">3.3 Service Improvement</h3>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Aggregate analytics (anonymized)</li>
                <li>Bug fixing and performance optimization</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">4. Data Storage and Security</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Data stored in Supabase (encrypted at rest)</li>
                <li>HTTPS encryption for all transfers</li>
                <li>Regular security audits</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">5. Your Rights</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Access your data</li>
                <li>Delete your account and all data</li>
                <li>Export your data</li>
                <li>Withdraw consent</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">6. Data Retention</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Active accounts: Data retained while account exists</li>
                <li>Deleted accounts: Data permanently removed within 30 days</li>
                <li>Backups: Purged within 90 days</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">7. Third-Party Services</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Supabase (database)</li>
                <li>Anthropic Claude API (AI processing)</li>
                <li>Stripe (payments, if applicable)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">8. Cookies</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Essential cookies for authentication</li>
                <li>Analytics cookies (opt-out available)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">9. Children&apos;s Privacy</h2>
              <p className="text-warm-gray">
                Service not intended for users under 16.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">10. Changes to This Policy</h2>
              <p className="text-warm-gray">
                We will notify users of material changes via email.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">11. Contact</h2>
              <p className="text-warm-gray">
                Email: <a href="mailto:wasim@karkoai.com" className="text-navy-600 hover:underline">wasim@karkoai.com</a>
              </p>
              <p className="text-warm-gray mt-2">
                Address: Karko AI Inc, 1207 Delaware Ave #412, Wilmington, DE 19806, USA
              </p>
            </section>
          </div>
        </div>
      </section>
      </main>
      <Footer />
    </div>
  );
}
