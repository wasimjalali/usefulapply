import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-navy-600 mb-4">Terms of Service</h1>
          <p className="text-warm-gray mb-8">Last Updated: February 3, 2026</p>

          <div className="prose prose-lg max-w-none text-charcoal space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">1. Acceptance of Terms</h2>
              <p className="text-warm-gray">
                By using Karko AI, you agree to these terms. If you do not agree, please do not use our service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">2. Service Description</h2>
              <p className="text-warm-gray">
                Karko AI is an AI-powered platform that helps generate:
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
                <li>AI may occasionally produce errors — always verify</li>
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
                These terms are governed by the laws of Wyoming, USA. Any disputes shall be resolved in the courts of Wyoming.
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
                Email: <a href="mailto:legal@karko.ai" className="text-navy-600 hover:underline">legal@karko.ai</a>
              </p>
              <p className="text-warm-gray mt-2">
                Address: ISRAR Group LLC, 30 N Gould St Ste N, Sheridan, WY 82801, USA
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
