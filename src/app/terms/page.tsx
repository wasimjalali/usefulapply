import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalH2, LegalH3, LegalList, LegalP, LegalShell } from '@/components/marketing/LegalShell';
import { buildPageMetadata } from '@/lib/seo/metadata';
import { BRAND } from '@/lib/brand';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = buildPageMetadata({
  title: 'Terms of Service',
  description:
    'Useful Apply Terms of Service. Rules for using the AI job application platform operated by Karko AI Inc.',
  canonical: '/terms',
});

const mailHref = `mailto:${LEGAL.email}`;

export default function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <section>
        <LegalP>
          These Terms of Service (&quot;Terms&quot;) govern your use of usefulapply.com and the
          Useful Apply product (the &quot;Service&quot;). The Service is operated by Karko AI
          Inc. (&quot;Company,&quot; &quot;we,&quot; &quot;us&quot; or &quot;our&quot;), a
          Delaware corporation doing business as {LEGAL.dba}.
        </LegalP>
        <LegalP>
          By creating an account, clicking agree or using the Service, you accept these Terms.
          If you do not agree, do not use the Service. Additional rules posted in the product
          (for example pricing and credit costs) are part of these Terms.
        </LegalP>
        <LegalP>
          Your use is also covered by our{' '}
          <Link href="/privacy" className="text-navy-600 hover:underline">
            Privacy Policy
          </Link>
          {' and '}
          <Link href="/cookies" className="text-navy-600 hover:underline">
            Cookie Notice
          </Link>
          . If those documents conflict with these Terms on personal-data processing, the
          Privacy Policy controls for that topic.
        </LegalP>
      </section>

      <section>
        <LegalH2>1. Eligibility and accounts</LegalH2>
        <LegalP>
          You must be at least 16 years old and able to form a binding contract. If you use the
          Service for an organization, you confirm you have authority to bind it.
        </LegalP>
        <LegalList>
          <li>Keep your registration information accurate.</li>
          <li>Keep your password and login to yourself. You are responsible for activity on your account.</li>
          <li>Tell us promptly if you think someone else used your account.</li>
          <li>
            You may delete your account in Settings. If a paid plan would keep charging, cancel
            the subscription first.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>2. The Service</LegalH2>
        <LegalP>
          Useful Apply helps job seekers find roles, assess fit and draft application materials.
          Depending on your plan, that can include a job feed, fit analysis, tailored CVs, cover
          letters, application emails, follow-up emails, screening-question drafts, in-product
          chat and an application tracker.
        </LegalP>
        <LegalP>
          We may change, suspend or discontinue features. We do not promise that the Service
          will be uninterrupted or error-free. We have no obligation to provide a particular
          level of support beyond what we publish, though you can always write to {LEGAL.email}.
        </LegalP>

        <LegalH3>Credits and subscriptions</LegalH3>
        <LegalList>
          <li>
            Paid plans and credit packs are billed by Stripe. Prices are shown at checkout and
            on the pricing page.
          </li>
          <li>
            Credits are consumed when you run billed actions (for example fit analysis or a full
            application kit). Unused monthly credits reset each billing cycle. Add-on credits
            roll over while a paid subscription stays active.
          </li>
          <li>
            You can upgrade immediately. Downgrades and cancellations take effect at the end of
            the current billing period, unless Stripe or the law requires otherwise.
          </li>
          <li>
            Fees are generally non-refundable once a billing period or credit pack is paid,
            except where we must refund under applicable law or Stripe reverses a charge.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>3. Your content and AI output</LegalH2>
        <LegalList>
          <li>
            You retain ownership of the CV, job descriptions and other materials you submit
            (&quot;User Content&quot;).
          </li>
          <li>
            You grant us a worldwide, non-exclusive license to host, process and display User
            Content only as needed to provide, secure and improve the Service for you.
          </li>
          <li>
            Drafts the Service generates for you are yours to use in your own job search. We do
            not claim ownership of that output. We keep the rights in our software, prompts,
            models configuration, templates and branding.
          </li>
          <li>
            You are responsible for reviewing every draft before you send it to an employer.
            The Service is an aid. It does not guarantee interviews, offers or ATS scores. AI
            can be wrong. Do not submit credentials or facts that are not true.
          </li>
          <li>
            If you send us feedback, you give us a royalty-free license to use it to improve the
            Service, without naming you.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>4. License and restrictions</LegalH2>
        <LegalP>
          We grant you a limited, non-exclusive, non-transferable, revocable license to use the
          Service for your own job search (or, if you are an organization, for that
          organization&apos;s internal recruiting-support use that we have agreed to). You may
          not:
        </LegalP>
        <LegalList>
          <li>Sell, rent, scrape or commercially resell the Service or its output as a competing product.</li>
          <li>Reverse engineer the Service except where the law allows it.</li>
          <li>Bypass usage limits, share logins or create accounts in bulk to evade credits.</li>
          <li>Upload malware or attempt to probe or disrupt our systems.</li>
          <li>Use the Service for fraudulent applications or fake qualifications.</li>
          <li>Use the Service to generate content about other people without a right to do so.</li>
        </LegalList>
      </section>

      <section>
        <LegalH2>5. Third-party services</LegalH2>
        <LegalP>
          The Service depends on providers such as Cloudflare, Anthropic, Amazon Bedrock, Stripe,
          PostHog, Google (optional sign-in) and SerpAPI. Job links lead to employer or job-board sites
          we do not control. Their terms apply to those sites. We are not responsible for
          third-party content, listings or hiring processes.
        </LegalP>
      </section>

      <section>
        <LegalH2>6. Disclaimers</LegalH2>
        <LegalP>
          THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE.&quot; TO THE FULLEST
          EXTENT PERMITTED BY LAW, WE DISCLAIM WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
          PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT OUTPUT WILL BE
          ERROR-FREE, THAT A PARTICULAR EMPLOYER WILL ACCEPT IT, OR THAT THE SERVICE WILL BE
          SECURE OR UNINTERRUPTED. WHERE THE LAW REQUIRES A WARRANTY, IT IS LIMITED TO 90 DAYS
          FROM YOUR FIRST USE OF THE AFFECTED FEATURE.
        </LegalP>
      </section>

      <section>
        <LegalH2>7. Limitation of liability</LegalH2>
        <LegalP>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW: (A) WE AND OUR SUPPLIERS WILL NOT BE LIABLE
          FOR LOST PROFITS, LOST DATA, LOST OPPORTUNITIES (INCLUDING JOBS OR OFFERS), OR ANY
          INDIRECT, CONSEQUENTIAL, INCIDENTAL, SPECIAL, EXEMPLARY OR PUNITIVE DAMAGES; AND (B)
          OUR TOTAL LIABILITY FOR ANY CLAIM ARISING OUT OF THESE TERMS OR THE SERVICE IS CAPPED
          AT THE GREATER OF $50 USD AND THE AMOUNTS YOU PAID US IN THE SIX MONTHS BEFORE THE
          CLAIM. MULTIPLE CLAIMS DO NOT RAISE THE CAP. SOME PLACES DO NOT ALLOW THESE LIMITS.
          IN THOSE PLACES, OUR LIABILITY IS LIMITED TO THE MAXIMUM PERMITTED BY LAW.
        </LegalP>
      </section>

      <section>
        <LegalH2>8. Indemnity</LegalH2>
        <LegalP>
          You will defend and indemnify Karko AI Inc. and its officers and agents against claims
          and reasonable legal fees arising from your User Content, your use of the Service, or
          your violation of these Terms or the law, except to the extent we caused the claim.
        </LegalP>
      </section>

      <section>
        <LegalH2>9. Suspension and termination</LegalH2>
        <LegalP>
          These Terms apply while you use the Service. We may suspend or close an account that
          we reasonably believe violates these Terms, creates risk or is unused. You may stop
          using the Service at any time. Sections 3 through 14 survive termination.
        </LegalP>
      </section>

      <section>
        <LegalH2>10. Changes</LegalH2>
        <LegalP>
          We may update these Terms. For material changes we will give at least 30 days&apos;
          notice by email (if we have your address) or a prominent notice in the Service. If you
          do not agree, stop using the Service before the change takes effect.
        </LegalP>
      </section>

      <section>
        <LegalH2>11. Governing law</LegalH2>
        <LegalP>
          These Terms are governed by the laws of the State of Delaware, without regard to
          conflict-of-law rules. Subject to any rights you have as a consumer in your country of
          residence, the {LEGAL.courts} have exclusive jurisdiction. Either party may still seek
          injunctive relief to protect intellectual property, or file an individual claim in
          small-claims court where that court has power.
        </LegalP>
        <LegalP>
          These Terms do not require arbitration. If a later version adds dispute-resolution
          rules, we will call that out as a material change.
        </LegalP>
      </section>

      <section>
        <LegalH2>12. General</LegalH2>
        <LegalList>
          <li>
            These Terms, the Privacy Policy, the Cookie Notice and any plan-specific terms are
            the entire agreement for the Service.
          </li>
          <li>If a provision is unenforceable, the rest still applies.</li>
          <li>A failure to enforce a provision is not a waiver.</li>
          <li>You may not assign these Terms without our consent. We may assign them in a sale or reorganization.</li>
          <li>
            You agree not to use the Service in violation of U.S. export rules.
          </li>
          <li>
            By using the Service you consent to receive notices electronically, including by
            email and in-product messages.
          </li>
        </LegalList>
      </section>

      <section>
        <LegalH2>13. California consumer notice</LegalH2>
        <LegalP>
          Under California Civil Code section 1789.3, California users may contact the Complaint
          Assistance Unit of the Division of Consumer Services of the California Department of
          Consumer Affairs, 1625 N. Market Blvd., Suite N-112, Sacramento, CA 95834, or (800)
          952-5210. To complain about the Service, email {LEGAL.email} or write to{' '}
          {LEGAL.addressOneLine}. Privacy rights are described in the Privacy Policy. Residents
          of other U.S. states may also have rights under their state privacy laws. See the
          Privacy Policy.
        </LegalP>
      </section>

      <section>
        <LegalH2>14. Contact</LegalH2>
        <LegalP>
          Email:{' '}
          <a href={mailHref} className="text-navy-600 hover:underline">
            {LEGAL.email}
          </a>
        </LegalP>
        <LegalP>Mail: {LEGAL.addressOneLine}</LegalP>
      </section>

      <p className="text-sm text-warm-gray">{BRAND.legalLine}.</p>
    </LegalShell>
  );
}
