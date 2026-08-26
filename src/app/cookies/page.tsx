import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalH2, LegalH3, LegalList, LegalP, LegalShell } from '@/components/marketing/LegalShell';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = buildPageMetadata({
  title: 'Cookie Notice',
  description:
    'How Useful Apply uses cookies, local storage and similar technologies, including analytics and session replay.',
  canonical: '/cookies',
});

const mailHref = `mailto:${LEGAL.email}`;

export default function CookiesPage() {
  return (
    <LegalShell title="Cookie Notice">
      <section>
        <LegalP>
          This Cookie Notice explains how Karko AI Inc. (&quot;Useful Apply&quot;, &quot;we&quot;,
          &quot;us&quot; or &quot;our&quot;) uses cookies and similar technologies on
          usefulapply.com and in the logged-in product (the &quot;Sites&quot;). It supplements
          our{' '}
          <Link href="/privacy" className="text-navy-600 hover:underline">
            Privacy Policy
          </Link>
          .
        </LegalP>
      </section>

      <section>
        <LegalH2>What cookies are</LegalH2>
        <LegalP>
          Cookies are small files stored on your device. We also use similar tools such as local
          storage and pixels in some emails. Some cookies last only while your browser is open
          (session cookies). Others stay until they expire or you delete them (persistent
          cookies).
        </LegalP>
        <LegalP>
          First-party cookies are set by us. Third-party cookies are set by a provider (for
          example during Google sign-in or Stripe checkout) on their own domain.
        </LegalP>
      </section>

      <section>
        <LegalH2>What we use</LegalH2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left border-collapse text-warm-gray">
            <thead>
              <tr className="border-b border-cream-200">
                <th className="py-2 pr-3 font-semibold text-charcoal">Type</th>
                <th className="py-2 pr-3 font-semibold text-charcoal">Why</th>
                <th className="py-2 font-semibold text-charcoal">Who</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Essential</td>
                <td className="py-2 pr-3">
                  Keep you signed in (Better Auth session cookie{' '}
                  <code className="text-charcoal">usefulapply.session</code>), CSRF and security
                  checks. The Sites cannot log you in without these.
                </td>
                <td className="py-2">Useful Apply</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Analytics</td>
                <td className="py-2 pr-3">
                  Understand how the Sites are used, capture errors and record session replays
                  (clicks, scrolling and on-screen content, with form inputs masked). Served
                  through our <code className="text-charcoal">/ingest</code> proxy to PostHog in
                  the United States.
                </td>
                <td className="py-2">
                  <a href="https://posthog.com/privacy" className="text-navy-600 hover:underline">
                    PostHog
                  </a>
                </td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Functionality</td>
                <td className="py-2 pr-3">
                  Browser local storage holds drafts and UI state (for example CV editor and
                  session workspace) so your work survives a refresh.
                </td>
                <td className="py-2">Useful Apply (on-device)</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">Sign-in and payments</td>
                <td className="py-2 pr-3">
                  If you use Google sign-in or pay with Stripe, Google and Stripe set their own
                  cookies on their domains. We do not set advertising cookies and we do not run
                  an ad network.
                </td>
                <td className="py-2">
                  <a href="https://policies.google.com/privacy" className="text-navy-600 hover:underline">
                    Google
                  </a>
                  {', '}
                  <a href="https://stripe.com/privacy" className="text-navy-600 hover:underline">
                    Stripe
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <LegalH2>Other technologies</LegalH2>
        <LegalH3>Local storage</LegalH3>
        <LegalP>
          The product stores CV drafts and related workspace data in your browser so you can
          keep editing without an extra round trip. Clearing site data in your browser removes
          it from that device. Server copies remain in your account until you delete them.
        </LegalP>
        <LegalH3>Session replay</LegalH3>
        <LegalP>
          PostHog session replay helps us see where the product breaks. Recordings can include
          on-screen CV text. Typed input in form fields is masked. Admin pages are not recorded.
        </LegalP>
        <LegalH3>Email pixels</LegalH3>
        <LegalP>
          Some HTML emails may include a pixel so we can tell if the message was opened. You can
          block images in your email client.
        </LegalP>
        <LegalP>
          We do not use Flash cookies, mobile SDKs or advertising pixels. We do not have a
          native mobile app.
        </LegalP>
      </section>

      <section>
        <LegalH2>Your choices</LegalH2>
        <LegalList>
          <li>
            Essential cookies do not require consent. If you block them, you will not be able to
            stay signed in.
          </li>
          <li>
            Most browsers let you delete or block cookies and clear local storage. The Sites may
            not work properly if you block all cookies.
          </li>
          <li>
            To object to analytics or session replay, email{' '}
            <a href={mailHref} className="text-navy-600 hover:underline">
              {LEGAL.email}
            </a>
            {' '}or use your browser&apos;s tracking protections. We do not currently ship a
            cookie banner or preference dashboard. If the law where you live requires prior
            consent for analytics cookies, contact us and we will honor a documented opt-out.
          </li>
          <li>
            We do not use cookies for interest-based ads, so industry opt-out tools for ad
            networks do not change how the Sites themselves behave.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>Changes</LegalH2>
        <LegalP>
          We may update this notice when our technologies change. The date at the top is the
          latest version.
        </LegalP>
      </section>

      <section>
        <LegalH2>Questions</LegalH2>
        <LegalP>
          Email{' '}
          <a href={mailHref} className="text-navy-600 hover:underline">
            {LEGAL.email}
          </a>
          .
        </LegalP>
      </section>
    </LegalShell>
  );
}
