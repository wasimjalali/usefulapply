import type { Metadata } from 'next';
import { LegalH2, LegalP, LegalShell } from '@/components/marketing/LegalShell';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BRAND } from '@/lib/brand';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = buildPageMetadata({
  title: 'Imprint (Impressum)',
  description:
    'Legal information (Impressum) for Useful Apply, operated by Karko AI Inc.',
  canonical: '/imprint',
});

const mailHref = `mailto:${LEGAL.email}`;

export default function ImprintPage() {
  return (
    <LegalShell title="Imprint (Impressum)">
      <section>
        <LegalH2>Company</LegalH2>
        <div className="text-warm-gray">
          <p className="font-semibold text-charcoal text-lg">{LEGAL.entity}</p>
          <p>Doing business as {LEGAL.dba}</p>
          <p>Delaware C-Corporation, United States</p>
          <p className="mt-4">
            {LEGAL.addressLines.map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
        </div>
      </section>

      <section>
        <LegalH2>Represented by</LegalH2>
        <LegalP>
          {LEGAL.director}, {LEGAL.directorTitle}
        </LegalP>
        <LegalP>
          Karko AI Inc. is a U.S. company. It is not entered in a German commercial register
          (Handelsregister) and it does not have a German VAT ID. There is no EU subsidiary.
        </LegalP>
      </section>

      <section>
        <LegalH2>Contact</LegalH2>
        <p className="text-warm-gray">
          Email:{' '}
          <a href={mailHref} className="text-navy-600 hover:underline">
            {LEGAL.email}
          </a>
          <br />
          Website:{' '}
          <a href={BRAND.url} className="text-navy-600 hover:underline">
            {BRAND.domain}
          </a>
        </p>
      </section>

      <section>
        <LegalH2>Responsible for content</LegalH2>
        <LegalP>
          {LEGAL.director}, {LEGAL.addressOneLine}
        </LegalP>
      </section>

      <section>
        <LegalH2>Disclaimer</LegalH2>
        <LegalP>
          Content on this website is provided for information. We work to keep it accurate but
          cannot guarantee it is complete or error-free. Links to third-party sites (including
          employer listings) are outside our control.
        </LegalP>
      </section>

      <section>
        <LegalH2>Copyright</LegalH2>
        <LegalP>
          © {new Date().getFullYear()} {LEGAL.entity} All rights reserved. &quot;{LEGAL.dba}&quot;
          is a brand of {LEGAL.entity}.
        </LegalP>
      </section>
    </LegalShell>
  );
}
