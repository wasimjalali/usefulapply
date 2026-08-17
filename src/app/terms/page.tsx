import type { Metadata } from 'next';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'Read the Useful Apply Terms of Service. Understand the rules, responsibilities and conditions for using our AI-powered job application assistant.',
  canonical: '/terms',
});

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-navy-600 mb-4">Terms of Service</h1>
          <p className="text-warm-gray mb-2">Last Updated: August 17, 2026</p>
          <p className="text-warm-gray mb-8">{BRAND.legalLine}.</p>

          <div className="prose prose-lg max-w-none text-charcoal space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">1. Acceptance of Terms</h2>
              <p className="text-warm-gray">
                By using {BRAND.name}, you agree to these terms. If you do not agree, please do not use our service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">2. Service Description</h2>
              <p className="text-warm-gray">
                {BRAND.name} is an AI-powered platform that helps generate:
              </p>
              <ul className="list-disc pl-6 text-warm-gray space-y-2 mt-4">
                <li>Optimized CVs/Resumes</li>
                <li>Cover letters</li>
                <li>Application emails</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">3. User Responsibilities</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Provide accurate information</li>
                <li>Do not submit false credentials</li>
                <li>You own your original CV content</li>
                <li>You are responsible for reviewing AI-generated content</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">4. AI-Generated Content</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>AI suggestions are aids, not guarantees</li>
                <li>Review all content before submitting to employers</li>
                <li>We are not responsible for hiring outcomes</li>
                <li>AI may occasionally produce errors, always verify</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">5. Intellectual Property</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>You retain ownership of your CV content</li>
                <li>We retain rights to our AI models and platform</li>
                <li>You grant us license to process your data for the service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">6. Prohibited Use</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Fraudulent applications</li>
                <li>Fake credentials or qualifications</li>
                <li>Automated scraping or abuse</li>
                <li>Sharing accounts</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">7. Account Termination</h2>
              <p className="text-warm-gray">
                We may terminate accounts that violate these terms without prior notice.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">8. Limitation of Liability</h2>
              <ul className="list-disc pl-6 text-warm-gray space-y-2">
                <li>Service provided &quot;as is&quot;</li>
                <li>Not liable for hiring decisions</li>
                <li>Maximum liability limited to fees paid</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">9. Dispute Resolution</h2>
              <p className="text-warm-gray">
                These terms are governed by the laws of Delaware, USA. Any disputes shall be resolved in the courts of Delaware.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">10. Changes to Terms</h2>
              <p className="text-warm-gray">
                We will provide 30-day notice for material changes to these terms via email.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">11. Contact</h2>
              <p className="text-warm-gray">
                Email: <a href="mailto:support@karkoai.com" className="text-navy-600 hover:underline">support@karkoai.com</a> {/* TODO(Task 7.1) */}
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
