import type { Metadata } from 'next';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BRAND } from '@/lib/brand';

export const metadata: Metadata = buildPageMetadata({
  title: 'Imprint (Impressum)',
  description:
    'Legal information and company details for Useful Apply. Impressum as required by German law.',
  canonical: '/imprint',
});

export default function ImprintPage() {
  return (
    <div className="min-h-screen bg-cream-100">
      <Navbar />
      <main>
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-navy-600 mb-8">Imprint (Impressum)</h1>

          <div className="prose prose-lg max-w-none text-charcoal space-y-8">
            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Company Information</h2>
              <div className="text-warm-gray">
                <p className="font-semibold text-charcoal text-lg">{BRAND.legalLine}</p>
                <p className="mt-4">
                  Karko AI Inc<br />
                  1207 Delaware Ave #412<br />
                  Wilmington, DE 19806<br />
                  USA
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-navy-600 mb-4">Contact</h2>
              <p className="text-warm-gray">
                Email: <a href="mailto:support@karkoai.com" className="text-navy-600 hover:underline">support@karkoai.com</a>{/* TODO(Task 7.1) */}<br />
                Website: <a href={BRAND.url} className="text-navy-600 hover:underline">{BRAND.domain}</a>
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
      </main>
      <Footer />
    </div>
  );
}
