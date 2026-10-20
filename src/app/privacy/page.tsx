import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalH2, LegalH3, LegalList, LegalP, LegalShell } from '@/components/marketing/LegalShell';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BRAND } from '@/lib/brand';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = buildPageMetadata({
  title: 'Privacy Policy',
  description:
    'Useful Apply Privacy Policy. How Karko AI Inc. collects, uses and protects personal information, including CV content, across the US, UK and EEA.',
  canonical: '/privacy',
});

const mailHref = `mailto:${LEGAL.email}`;

export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <section>
        <LegalP>
          Karko AI Inc. (&quot;{LEGAL.dba}&quot;, &quot;we&quot;, &quot;us&quot; or &quot;our&quot;)
          operates an AI-powered job application platform. This Privacy Policy describes how we
          process personal information through usefulapply.com, the logged-in product, our
          marketing pages and related emails (together, the &quot;Service&quot;).
        </LegalP>
        <LegalP>
          Useful Apply was previously known as Karko AI. This policy covers both names.
        </LegalP>
        <LegalP>
          If you are in the European Economic Area or the United Kingdom, please also read the
          Notice to European users below.
        </LegalP>
      </section>

      <section>
        <LegalH2>1. Personal information we collect</LegalH2>
        <LegalH3>Information you provide</LegalH3>
        <LegalList>
          <li>
            <strong className="text-charcoal">Account data:</strong> name, email address and a
            hashed password if you sign up with email.
          </li>
          <li>
            <strong className="text-charcoal">Google account data:</strong> if you continue with
            Google, we receive the name, email and profile image Google makes available to us.
          </li>
          <li>
            <strong className="text-charcoal">Career and application data:</strong> CVs and
            resumes you upload or paste, profile photos you add to a CV, job descriptions, job
            search preferences, career-profile answers, application tracker entries, chat
            messages and any screening-question answers you submit.
          </li>
          <li>
            <strong className="text-charcoal">Generated content:</strong> tailored CVs, cover
            letters, application emails, follow-up emails and related drafts we create for you.
          </li>
          <li>
            <strong className="text-charcoal">Communications:</strong> messages you send through
            the contact form or to {LEGAL.email}.
          </li>
          <li>
            <strong className="text-charcoal">Transactional data:</strong> plan, credit balance
            and purchase history. We do not store full payment-card numbers. Stripe collects
            those directly.
          </li>
        </LegalList>
        <LegalP>
          Please do not upload government ID numbers, bank-account numbers or other sensitive
          data we do not need. If a CV you upload contains that information, we will process it
          as part of the file you submitted.
        </LegalP>

        <LegalH3>Information from other sources</LegalH3>
        <LegalList>
          <li>Google, when you choose to sign in with Google.</li>
          <li>Stripe, for payment status, invoices and subscription state.</li>
          <li>
            Public job listings returned by our search provider (SerpAPI / Google Jobs) in
            response to queries we build from your career profile and search settings. Those
            listings are about employers, not about you.
          </li>
        </LegalList>

        <LegalH3>Information collected automatically</LegalH3>
        <LegalList>
          <li>
            Device and log data such as IP address, browser type, device type, language and
            approximate location derived from IP.
          </li>
          <li>
            Usage data such as pages viewed, buttons clicked, feature use, referral URL and
            timestamps.
          </li>
          <li>
            For visitors who try a generation without an account, a hash of the IP address so we
            can apply the anonymous-use limit.
          </li>
        </LegalList>
        <LegalP>
          We do not collect precise GPS location and we do not have a mobile app.
        </LegalP>
      </section>

      <section>
        <LegalH2>2. Cookies, analytics and AI processing</LegalH2>
        <LegalP>
          Cookies and similar technologies are described in our{' '}
          <Link href="/cookies" className="text-navy-600 hover:underline">
            Cookie Notice
          </Link>
          .
        </LegalP>
        <LegalP>
          Your CV, job descriptions, chat prompts and related content are processed by AI
          providers so we can generate application materials, rank roles, synthesize a career
          profile and run in-product chat. Today that includes Claude via the Anthropic API (with
          Amazon Bedrock as a fallback) and Cloudflare Workers AI. Those providers
          process the content you submit in order to return a result. We do not use your CV or
          application materials to train our own models. We instruct providers not to use that
          content to train their general models, subject to each provider&apos;s published terms.
        </LegalP>
        <LegalP>
          We use PostHog for product analytics, error tracking and session replay. Session
          replay records how you use the Service (clicks, mouse movement, scrolling and
          on-screen content). Input fields are masked in recordings. We do this to find bugs and
          improve the product, not to sell a profile of you.
        </LegalP>
      </section>

      <section>
        <LegalH2>3. How we use personal information</LegalH2>
        <LegalList>
          <li>Create and secure your account, including email verification and password reset.</li>
          <li>
            Provide the Service: parse CVs, run fit analysis, generate application materials,
            power chat, build a job feed, track applications and manage credits.
          </li>
          <li>Process subscriptions, credit packs and related billing through Stripe.</li>
          <li>
            Send service emails (security, receipts, account deletion confirmations) and
            founder onboarding emails (a welcome message and a short check-in). You can ask us
            to stop non-essential emails at any time.
          </li>
          <li>Respond to support requests and contact-form messages.</li>
          <li>Measure usage, fix bugs, prevent abuse and improve the Service.</li>
          <li>Comply with law, enforce our Terms and protect users, the Service and our rights.</li>
          <li>
            Create aggregated or de-identified statistics that no longer identify you. We do not
            try to re-identify that data except to test that the de-identification worked.
          </li>
        </LegalList>
        <LegalP>
          We do not sell your personal information. We do not use it for interest-based
          advertising. We do not run automated decisions that produce legal or similarly
          significant effects. Fit scores and ranked jobs are informational. You decide whether
          to apply.
        </LegalP>
      </section>

      <section>
        <LegalH2>4. How we share personal information</LegalH2>
        <LegalP>
          We share personal information with the companies that help us run the Service:
        </LegalP>
        <LegalList>
          <li>
            <strong className="text-charcoal">Cloudflare</strong> (hosting, database, file
            storage, cache, email delivery and Workers AI).
          </li>
          <li>
            <strong className="text-charcoal">Anthropic</strong> (Claude via the Anthropic API, for
            writing, parsing and fit analysis).
          </li>
          <li>
            <strong className="text-charcoal">Amazon Web Services / Amazon Bedrock</strong> (Claude
            as a fallback for writing, parsing and fit analysis).
          </li>
          <li>
            <strong className="text-charcoal">Stripe</strong> (payments). See{' '}
            <a href="https://stripe.com/privacy" className="text-navy-600 hover:underline">
              Stripe&apos;s privacy policy
            </a>
            .
          </li>
          <li>
            <strong className="text-charcoal">PostHog</strong> (analytics, errors and session
            replay).
          </li>
          <li>
            <strong className="text-charcoal">Google</strong> (optional sign-in).
          </li>
          <li>
            <strong className="text-charcoal">SerpAPI</strong> (job-search queries derived from
            your search settings, not your full CV file).
          </li>
        </LegalList>
        <LegalP>
          We may also share information with professional advisors, with authorities when the
          law requires it, or with a buyer or successor if we are involved in a merger, financing
          or sale of assets. We do not share your CV with other users or with employers. You
          choose what to send to an employer.
        </LegalP>
      </section>

      <section>
        <LegalH2>5. Retention</LegalH2>
        <LegalList>
          <li>Account and application data: kept while your account is open.</li>
          <li>
            After you confirm account deletion: we delete stored account data and files,
            generally within 30 days.
          </li>
          <li>Backups and logs: purged within 90 days where reasonably practicable.</li>
          <li>
            Billing records: kept as long as tax and accounting rules require.
          </li>
          <li>
            Anonymous-use IP hashes: used to enforce the free-generation limit for about 30
            days.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>6. Your choices</LegalH2>
        <LegalList>
          <li>
            You can review and update account details in Settings.
          </li>
          <li>
            You can request access, correction, a copy of your data or deletion by emailing{' '}
            <a href={mailHref} className="text-navy-600 hover:underline">
              {LEGAL.email}
            </a>
            . You can also start account deletion in Settings. If a subscription would keep
            billing after deletion, cancel it first.
          </li>
          <li>
            You can opt out of founder check-in and similar non-essential emails by replying or
            emailing us. Transactional mail (security, billing, deletion confirmations) will
            continue.
          </li>
          <li>
            Cookie and recording controls are described in the{' '}
            <Link href="/cookies" className="text-navy-600 hover:underline">
              Cookie Notice
            </Link>
            .
          </li>
          <li>
            Some browsers send a &quot;Do Not Track&quot; signal. We do not respond to it at this
            time.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>7. Security</LegalH2>
        <LegalP>
          We use HTTPS, store files and database content with encryption at rest on Cloudflare,
          hash passwords and restrict access to production systems. No internet service is
          completely secure. Please use a strong unique password and keep your login to
          yourself.
        </LegalP>
      </section>

      <section>
        <LegalH2>8. International transfers</LegalH2>
        <LegalP>
          Karko AI Inc. is a Delaware corporation. The Service is hosted in the United States
          and our providers also process data in the United States and other countries. Privacy
          laws there may differ from the laws where you live. See the Notice to European users
          for more on transfers out of Europe.
        </LegalP>
      </section>

      <section>
        <LegalH2>9. Children</LegalH2>
        <LegalP>
          The Service is not intended for anyone under 16. We do not knowingly collect personal
          information from children under 16. If you believe we have, contact us and we will
          delete it.
        </LegalP>
      </section>

      <section>
        <LegalH2>10. Other sites</LegalH2>
        <LegalP>
          The Service may link to employer career pages, Trustpilot, payment pages and other
          third-party sites. Their privacy practices are their own. Job listings come from
          public sources and may be incomplete or out of date.
        </LegalP>
      </section>

      <section>
        <LegalH2>11. Changes</LegalH2>
        <LegalP>
          We may update this policy. We will change the date at the top and, for material
          changes, notify you by email when we have an address on file, or by a notice in the
          Service. Continued use after the effective date means the updated policy applies to
          that later use.
        </LegalP>
      </section>

      <section>
        <LegalH2>12. Contact</LegalH2>
        <LegalP>
          Email:{' '}
          <a href={mailHref} className="text-navy-600 hover:underline">
            {LEGAL.email}
          </a>
        </LegalP>
        <LegalP>
          Mail: {LEGAL.addressOneLine}
        </LegalP>
        <LegalP>
          We do not currently publish a phone number or maintain a separate EU or UK
          representative. Contact us directly at the email above.
        </LegalP>
      </section>

      <section>
        <LegalH2>13. State privacy rights notice (United States)</LegalH2>
        <LegalP>
          Some U.S. state laws give residents rights to know, access, correct, delete and opt
          out of certain processing, and to appeal a refusal. Those rights are not absolute. We
          may need to verify your identity before we act. You may use an authorized agent where
          the law allows. We will not discriminate against you for exercising these rights.
        </LegalP>
        <LegalP>
          We do not sell personal information for money. We do not share personal information
          for cross-context behavioral advertising. We do not process personal information for
          targeted advertising. We do not use sensitive personal information to infer
          characteristics about you. We do not have actual knowledge that we collect, sell or
          share the personal information of consumers under 16.
        </LegalP>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm text-left border-collapse text-warm-gray">
            <thead>
              <tr className="border-b border-cream-200">
                <th className="py-2 pr-3 font-semibold text-charcoal">Category</th>
                <th className="py-2 pr-3 font-semibold text-charcoal">Examples</th>
                <th className="py-2 font-semibold text-charcoal">Disclosed to</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Identifiers</td>
                <td className="py-2 pr-3">Name, email, IP, cookie IDs, Google account ID</td>
                <td className="py-2">Service providers listed above</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Customer records</td>
                <td className="py-2 pr-3">Account profile, support messages</td>
                <td className="py-2">Cloudflare, email delivery</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Commercial information</td>
                <td className="py-2 pr-3">Plan, credits, purchase history</td>
                <td className="py-2">Stripe, Cloudflare</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Internet activity</td>
                <td className="py-2 pr-3">Pages viewed, feature use, session replay</td>
                <td className="py-2">PostHog, Cloudflare</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Approximate geolocation</td>
                <td className="py-2 pr-3">IP-based region; job-search locations you enter</td>
                <td className="py-2">Cloudflare, PostHog, SerpAPI (search location only)</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Professional information</td>
                <td className="py-2 pr-3">CV content, work history, job preferences</td>
                <td className="py-2">AI providers, Cloudflare storage</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">Inferences</td>
                <td className="py-2 pr-3">Career profile, fit notes, ranked roles</td>
                <td className="py-2">AI providers, stored on Cloudflare</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LegalP>
          We do not sell or share any of the categories above for advertising. To exercise
          state privacy rights, email{' '}
          <a href={mailHref} className="text-navy-600 hover:underline">
            {LEGAL.email}
          </a>
          . Nevada residents may use the same address to opt out of any future sale of covered
          information (we do not sell it today). California residents may send a &quot;Shine
          the Light&quot; request to the same address. We do not disclose personal information
          to third parties for their own direct marketing.
        </LegalP>
      </section>

      <section>
        <LegalH2>14. Notice to European users</LegalH2>
        <LegalP>
          This section applies to individuals in the EEA and the UK. &quot;Personal
          information&quot; includes &quot;personal data&quot; under the GDPR and UK GDPR.
          Karko AI Inc. is the controller. Contact details are in section 12. We have not
          appointed a separate data protection officer.
        </LegalP>

        <LegalH3>Legal bases</LegalH3>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm text-left border-collapse text-warm-gray">
            <thead>
              <tr className="border-b border-cream-200">
                <th className="py-2 pr-3 font-semibold text-charcoal">Purpose</th>
                <th className="py-2 font-semibold text-charcoal">Legal basis</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Account, generations, job feed, tracker, credits</td>
                <td className="py-2">Contract (our Terms)</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Payments via Stripe</td>
                <td className="py-2">Contract</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Security, fraud and abuse prevention</td>
                <td className="py-2">Legitimate interests and, where required, legal obligation</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Product analytics and session replay</td>
                <td className="py-2">
                  Legitimate interests in running a reliable product. Where consent is required
                  for non-essential cookies, we rely on consent.
                </td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Welcome and check-in emails</td>
                <td className="py-2">
                  Legitimate interests in onboarding new users, or consent where the law requires
                  it
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">Legal compliance and defending claims</td>
                <td className="py-2">Legal obligation and legitimate interests</td>
              </tr>
            </tbody>
          </table>
        </div>

        <LegalH3>Your GDPR rights</LegalH3>
        <LegalP>
          You may request access, correction, deletion, restriction, objection (including to
          processing based on legitimate interests or to direct marketing) and portability, and
          you may withdraw consent where we rely on it. Email {LEGAL.email}. We may need to
          verify your identity. You also have the right to lodge a complaint with your local
          supervisory authority. In the UK that is the Information Commissioner&apos;s Office
          (ico.org.uk).
        </LegalP>

        <LegalH3>Transfers outside Europe</LegalH3>
        <LegalP>
          Using the Service means your personal data is processed in the United States. The U.S.
          is not treated as offering an equivalent GDPR adequacy regime on its own. Where we
          share data with providers outside Europe, we rely on their standard contractual
          clauses or comparable transfer tools where they offer them, and on limited GDPR
          derogations where those tools do not apply and the transfer is still necessary to
          provide the Service you requested. You can ask us for more detail at {LEGAL.email}.
        </LegalP>
      </section>

      <section>
        <LegalH2>15. AI assistant integrations (MCP)</LegalH2>
        <LegalP>
          You can connect an AI assistant, such as Claude, ChatGPT, Claude Code or Cursor, to
          your Useful Apply account. This section covers that connection. The rest of this policy
          applies as well.
        </LegalP>

        <LegalH3>What an assistant can read and write</LegalH3>
        <LegalP>
          What your assistant can do depends on the scopes you grant: read, write and spend. It
          can read, change and delete your account details, profile and photo, CVs,
          applications, kit documents, job feed and settings. It can see your credit balance and
          history. With the spend scope, it can use your credits.
        </LegalP>

        <LegalH3>Consent and access</LegalH3>
        <LegalP>
          An assistant gets access only through OAuth, after you sign in and approve the scopes
          on our consent screen. Access tokens are short-lived. A daily agent credit limit caps the
          credits assistants can spend. You can change it in Connected apps.
        </LegalP>

        <LegalH3>Revoking access</LegalH3>
        <LegalP>
          Open Settings, then Connected apps, and remove the app. Access stops within a minute.
          Removing the connection inside your assistant may not revoke it on our side. To be
          sure, remove it in Connected apps. Deleting your account revokes every connection.
        </LegalP>

        <LegalH3>AI provider processing</LegalH3>
        <LegalP>
          We receive only what your assistant sends to a tool, such as a job description or an
          edit. We don&apos;t receive the rest of your conversation. The assistant&apos;s provider
          (for example Anthropic or OpenAI) processes the content
          your assistant retrieves from Useful Apply and the conversation you have with it. That
          processing is governed by the provider&apos;s own terms and privacy policy, not ours.
          Only connect an assistant whose provider you&apos;re comfortable sharing your CV and
          application data with.
        </LegalP>

        <LegalH3>Exports and PDF rendering</LegalH3>
        <LegalP>
          When an assistant exports a document, we store the file in Cloudflare R2 for up to 30
          days and give you a signed download link. Anyone with the link can open the file until
          it expires. We delete the files sooner if you delete your account. Cloudflare Browser
          Run turns your documents into PDFs.
        </LegalP>

        <LegalH3>Usage analytics</LegalH3>
        <LegalP>
          For integration usage we record which tool ran, which assistant app called it, how long it took and whether
          it worked. We don&apos;t record document content in these analytics.
        </LegalP>

        <LegalH3>Summary</LegalH3>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-sm text-left border-collapse text-warm-gray">
            <thead>
              <tr className="border-b border-cream-200">
                <th className="py-2 pr-3 font-semibold text-charcoal">Data</th>
                <th className="py-2 pr-3 font-semibold text-charcoal">Purpose</th>
                <th className="py-2 pr-3 font-semibold text-charcoal">Recipients</th>
                <th className="py-2 pr-3 font-semibold text-charcoal">Retention</th>
                <th className="py-2 font-semibold text-charcoal">Your controls</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Account, credits and settings</td>
                <td className="py-2 pr-3">Let your assistant act on your account</td>
                <td className="py-2 pr-3">Your assistant&apos;s provider, Cloudflare</td>
                <td className="py-2 pr-3">While your account is open</td>
                <td className="py-2">Scopes, daily credit limit, revoke in Connected apps</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">CVs, applications and kit documents</td>
                <td className="py-2 pr-3">Read, edit and generate application materials</td>
                <td className="py-2 pr-3">Your assistant&apos;s provider, AI providers listed above, Cloudflare</td>
                <td className="py-2 pr-3">While your account is open</td>
                <td className="py-2">Grant read only, revoke, delete items or your account</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Job feed and career profile</td>
                <td className="py-2 pr-3">Show and manage your feed</td>
                <td className="py-2 pr-3">Your assistant&apos;s provider, Cloudflare</td>
                <td className="py-2 pr-3">While your account is open</td>
                <td className="py-2">Feed settings, withdraw feed consent, revoke</td>
              </tr>
              <tr className="border-b border-cream-200 align-top">
                <td className="py-2 pr-3">Export files</td>
                <td className="py-2 pr-3">Give you PDF, Word and text files</td>
                <td className="py-2 pr-3">Cloudflare (R2 and Browser Run)</td>
                <td className="py-2 pr-3">30 days, or until account deletion</td>
                <td className="py-2">Delete your account</td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-3">Tool used, assistant app, duration and outcome</td>
                <td className="py-2 pr-3">Reliability, abuse prevention and improvement</td>
                <td className="py-2 pr-3">Cloudflare, PostHog</td>
                <td className="py-2 pr-3">Kept like other product analytics (see section 2).</td>
                <td className="py-2">Email {LEGAL.email}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <LegalP>
          More on how to connect an assistant is on our{' '}
          <Link href="/integrations" className="text-navy-600 hover:underline">
            integrations page
          </Link>
          .
        </LegalP>
      </section>

      <p className="text-sm text-warm-gray">
        Related: {' '}
        <Link href="/terms" className="text-navy-600 hover:underline">
          Terms of Service
        </Link>
        {', '}
        <Link href="/cookies" className="text-navy-600 hover:underline">
          Cookie Notice
        </Link>
        {' and '}
        <Link href="/imprint" className="text-navy-600 hover:underline">
          Imprint
        </Link>
        . {BRAND.legalLine}.
      </p>
    </LegalShell>
  );
}
