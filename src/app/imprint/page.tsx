import type { Metadata } from 'next';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';

export const metadata: Metadata = {
  title: 'Imprint (Impressum)',
  description:
    'Legal information and company details for KarKo AI. Impressum as required by German law.',
  alternates: { canonical: '/imprint' },
};

export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />

      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-navy-600 mb-8">Imprint (Impressum)</h1>

          <div className="prose prose-lg max-w-none text-charcoal space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Company Information</h2>
              <div className="text-warm-gray">
                <p className="font-semibold text-charcoal text-lg">Karko AI Inc</p>
                <p className="mt-4">
                  1207 Delaware Ave #412<br />
                  Wilmington, DE 19806<br />
                  USA
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Contact</h2>
              <p className="text-warm-gray">
                Email: <a href="mailto:wasim@karkoai.com" className="text-navy-600 hover:underline">wasim@karkoai.com</a><br />
                Website: <a href="https://www.karkoai.com" className="text-navy-600 hover:underline">www.karkoai.com</a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Responsible for Content</h2>
              <p className="text-warm-gray">
                Karko AI Inc
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Disclaimer</h2>
              <p className="text-warm-gray">
                The content on this website is provided for informational purposes. 
                We strive for accuracy but cannot guarantee error-free content.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Copyright</h2>
              <p className="text-warm-gray">
                © 2026 Karko AI Inc. All rights reserved.
              </p>
            </section>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
