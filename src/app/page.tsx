import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, Check } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { BrandIcon } from '@/components/marketing/BrandLogo';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { PricingAurora } from '@/components/marketing/PricingAurora';

import { BRAND } from '@/lib/brand';

export const metadata: Metadata = {
  title: {
    absolute: 'Useful Apply | Your entire job search, in one app',
  },
  description:
    'Useful Apply is the AI job application agent that replaces the seven tools job seekers stitch together. A daily job feed, a fit check before you spend anything, and a tailored CV, cover letter and emails in 90 seconds. Every word traces back to your real CV.',
  alternates: { canonical: '/' },
};

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || BRAND.url;

const HERO_IMAGE = {
  src: '/images/moments/kit-ready.webp',
  alt: 'The Useful Apply workspace with a finished application kit: the conversation on the left and the tailored CV on the right',
};

interface WorkflowStep {
  n: number;
  label: string;
  title: string;
  body: string;
  image?: { src: string; alt: string };
  kicker?: string;
  secondLine?: string;
  boldClose?: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    n: 1,
    label: 'Find',
    title: 'A shortlist, not a firehose',
    body: 'Every morning, up to 20 fresh roles ranked against your career profile. Matched on skills, seniority and direction, not keyword bingo. Nothing looks right today? Come back tomorrow.',
    image: {
      src: '/images/moments/daily-feed.webp',
      alt: "A job feed listing today's roles with match strength, salary and a check-fit button on each",
    },
  },
  {
    n: 2,
    label: 'Check the fit',
    title: 'Know before you apply.',
    body: "Run the ad against your real CV before you build anything. A clear read on the match and the reasoning behind it. If it's a pass, you lost nothing. If it's a go, you apply like it matters.",
    image: {
      src: '/images/moments/fit-result.webp',
      alt: 'A fit result for a Product Manager role: 76% match, the strengths that line up and the gaps',
    },
    kicker:
      "An auto-apply bot needs you to keep applying. Telling you when not to apply isn't in its business model. It's central to ours.",
  },
  {
    n: 3,
    label: 'Get the kit',
    title: 'The whole kit, built for this job',
    body: "Tailored CV, cover letter, application email and follow-up email. The ad decides what to emphasize, never what's true about you. Facts come from one place: your real CV.",
    secondLine: 'Most people never send a follow-up. Yours is already written.',
    image: {
      src: '/images/moments/kit-ats.webp',
      alt: 'The what-changed view of a tailored CV, showing each edit before and after with an ATS score',
    },
  },
  {
    n: 4,
    label: 'Review and send',
    title: 'Change anything by chatting',
    body: 'A tighter summary, a different first line, more weight on your last role. Watch it land in the live preview. Six ATS-friendly templates keep the layout clean.',
    boldClose: 'You review everything before it goes anywhere. Then you send it yourself.',
  },
  {
    n: 5,
    label: 'Track',
    title: 'Every application, remembered',
    body: 'Everything you send lands in the tracker. Status, documents and follow-ups in one place, with chat when you want to dig in.',
  },
];

interface LandingPlan {
  tier: 'free' | 'plus' | 'max';
  name: string;
  price: string;
  per?: string;
  features: string[];
  cta: string;
  href: string;
}

const LANDING_PLANS: LandingPlan[] = [
  {
    tier: 'free',
    name: 'Free',
    price: '$0',
    features: [
      '2 full applications a month',
      'Or 8 fit checks while you explore',
      'Top 5 roles a day in your feed',
    ],
    cta: 'Start free',
    href: '/dashboard',
  },
  {
    tier: 'plus',
    name: 'Plus',
    price: '$19.99',
    per: '/mo',
    features: [
      '25 full applications a month',
      'Fit checks and rewrites from the same allowance',
      'Top 20 roles a day in your feed',
    ],
    cta: 'Go Plus',
    href: '/pricing',
  },
  {
    tier: 'max',
    name: 'Max',
    price: '$79.99',
    per: '/mo',
    features: [
      '100 full applications a month',
      'Fit checks and rewrites from the same allowance',
      'Top 20 roles a day, built for an all-out search',
    ],
    cta: 'Go Max',
    href: '/pricing',
  },
];

// Comparison cells: true = gold check, string = text verdict, false = dash.
type CellValue = boolean | string;

const COMPARISON_ROWS: { feature: string; cells: [CellValue, CellValue, CellValue] }[] = [
  { feature: 'Fit check before you spend a minute', cells: [true, false, false] },
  { feature: 'Built to stay grounded, nothing added that isn\'t yours', cells: [true, false, false] },
  { feature: 'Remembers your CV and career profile', cells: [true, false, 'Varies'] },
  { feature: 'CV, cover letter, application email and follow-up as one kit', cells: [true, 'Prompt by prompt', false] },
  { feature: 'Edit by chatting, live document preview', cells: [true, false, false] },
  { feature: 'Daily ranked shortlist and tracker built in', cells: [true, false, 'Varies'] },
];

function ComparisonCell({ value }: { value: CellValue }) {
  if (value === true) return <Check aria-label="Yes" className="mx-auto h-4 w-4 text-gold-500" />;
  if (value === false) return <span className="text-sm text-warm-gray">&ndash;</span>;
  return <span className="text-xs text-warm-gray">{value}</span>;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-cream-100">
      {/* SoftwareApplication Schema (homepage only).
          Google requires aggregateRating or review for rich results.
          Add real review data here when available (e.g. from Trustpilot). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Useful Apply',
            applicationCategory: 'BusinessApplication',
            operatingSystem: 'Web',
            description:
              'AI-powered job application assistant with a daily job feed, fit analysis, tailored CVs, cover letters, emails, screening question answers, and application tracking.',
            url: SITE_URL,
            image: `${SITE_URL}/favicon-512x512.png`,
            featureList: [
              'Daily Job Feed',
              'AI CV Optimization',
              'Tailored Cover Letter Generation',
              'Professional Application Email Drafting',
              'Follow-Up Email Drafting',
              'AI Screening Question Answers',
              'Smart Fit Analysis',
              'Application Tracker',
              'ATS-Friendly Output',
              'Multi-Language Support',
              'Master CV Support',
            ],
            offers: [
              {
                '@type': 'Offer',
                name: 'Free',
                price: '0',
                priceCurrency: 'USD',
                description: '4 credits/month (~2 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Plus',
                price: '19.99',
                priceCurrency: 'USD',
                description: '50 credits/month (~25 applications)',
              },
              {
                '@type': 'Offer',
                name: 'Max',
                price: '79.99',
                priceCurrency: 'USD',
                description: '200 credits/month (~100 applications)',
              },
            ],
            creator: {
              '@type': 'Organization',
              name: 'Useful Apply',
              url: SITE_URL,
            },
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: '5.0',
              reviewCount: '2',
              bestRating: '5',
            },
            review: [
              {
                '@type': 'Review',
                author: {
                  '@type': 'Person',
                  name: 'Mohammad Shafiq',
                },
                datePublished: '2026-03-08',
                reviewBody:
                  'Useful Apply is a very useful AI tool for job applications. It helps create a professional CV in the European and USA format and also assists with writing strong cover letters. The platform is easy to use and saves a lot of time when preparing job applications. I would definitely recommend it to anyone who wants to improve their CV and apply for jobs more efficiently.',
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: '5',
                  bestRating: '5',
                },
              },
              {
                '@type': 'Review',
                author: {
                  '@type': 'Person',
                  name: 'Zaeem Jalali',
                },
                datePublished: '2026-03-04',
                reviewBody:
                  'If you are someone whose looking for jobs like me this is the best site for you. It saves so much time and energy for you. You can create targeted CV, Cover Letter and Email + follow up email in a matter of seconds for any Job application you want.',
                reviewRating: {
                  '@type': 'Rating',
                  ratingValue: '5',
                  bestRating: '5',
                },
              },
            ],
          }),
        }}
      />
      <Navbar />
      <main>
        {/* Aurora-backed first fold: hero + volume band share one backdrop,
            same treatment as the pricing page. */}
        <div className="relative overflow-hidden">
        <PricingAurora />
        {/* Hero: split, copy left, the finished-kit workspace right. */}
        <section className="relative px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-10 lg:flex-row lg:gap-16">
            <ScrollReveal className="w-full lg:w-[430px] lg:flex-shrink-0">
              <h1 className="text-[38px] font-semibold leading-[1.08] tracking-tight text-navy-800 sm:text-[46px] lg:text-[50px]">
                Everything you need to apply for a job. Nothing sent for you.
              </h1>
              <p className="mt-5 text-[17px] leading-relaxed text-warm-gray">
                Fit check first. Then a tailored CV, cover letter and emails, grounded in what you&apos;ve
                actually done and ready in about two minutes. You review, you send.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-lg bg-gold-400 px-7 text-[15px] font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer"
                >
                  Start free
                </Link>
                <Link
                  href="#what-you-get"
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-cream-200 bg-cream-50 px-7 text-[15px] font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
                >
                  See what you get
                </Link>
              </div>
              <p className="mt-4 text-sm text-warm-gray">
                Your first fit check is on us, no account needed.
              </p>
            </ScrollReveal>
            <ScrollReveal delay={150} className="w-full flex-1">
              <Image
                src={HERO_IMAGE.src}
                alt={HERO_IMAGE.alt}
                width={1440}
                height={900}
                priority
                quality={90}
                sizes="(max-width: 1023px) 100vw, 680px"
                className="w-full rounded-2xl border border-cream-200 shadow-sm"
              />
            </ScrollReveal>
          </div>
        </section>

        {/* Volume band. */}
        <section className="relative px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-[32px] font-semibold leading-[1.15] text-navy-800 md:text-[40px]">
                Everyone&apos;s applying more. It&apos;s working less.
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-charcoal">
                AI flooded recruiters with lookalike applications. Filters tightened, good people got buried.
                Useful Apply is the opposite of a bot. One job, one fit check, one application worth your name.
              </p>
            </div>
          </ScrollReveal>
        </section>
        </div>
        {/* /Aurora-backed first fold */}

        {/* Paste from anywhere: boards on the left, the kit on the right. */}
        <section className="bg-cream-100 px-4 py-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="mx-auto max-w-3xl text-center">
              <h2 className="text-[32px] font-semibold leading-[1.15] text-navy-800 md:text-[36px]">
                Bring a job ad from anywhere
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-warm-gray">
                See a role on any job board or careers page? Copy the description and paste it into the chat.
                Useful Apply checks the fit and builds the whole kit for that exact job.
              </p>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div className="mx-auto mt-10 flex max-w-5xl flex-col items-center gap-8 lg:flex-row lg:justify-center lg:gap-10">
              <div className="grid w-full max-w-md grid-cols-2 gap-3">
                {[
                  { name: 'LinkedIn', color: '#0A66C2' },
                  { name: 'Indeed', color: '#2557A7' },
                  { name: 'Glassdoor', color: '#0CAA41' },
                  { name: 'StepStone', color: '#204577' },
                  { name: 'Monster', color: '#6E46AE' },
                  { name: 'ZipRecruiter', color: '#1D8649' },
                ].map((board) => (
                  <div
                    key={board.name}
                    className="flex h-14 items-center justify-center rounded-2xl border border-cream-200 bg-cream-50 shadow-sm"
                  >
                    <span className="text-[17px] font-semibold" style={{ color: board.color }}>
                      {board.name}
                    </span>
                  </div>
                ))}
                <div className="col-span-2 flex h-10 items-center justify-center rounded-2xl border border-dashed border-cream-300 text-sm text-warm-gray">
                  and any careers page
                </div>
              </div>
              <div className="flex items-center justify-center lg:flex-col">
                <ArrowRight className="h-7 w-7 rotate-90 text-gold-500 lg:rotate-0" />
              </div>
              <div className="w-full max-w-md rounded-2xl border border-cream-200 bg-cream-50 p-7 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <BrandIcon size="sm" theme="light" />
                  <span className="text-[17px] font-semibold text-navy-800">Useful Apply</span>
                </div>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {['Fit check for that exact role', 'Tailored CV', 'Cover letter', 'Application email', 'Follow-up email'].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-[15px] text-charcoal">
                      <Check className="h-4 w-4 flex-shrink-0 text-gold-600" strokeWidth={2.5} />
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="mt-5 text-sm text-warm-gray">Paste the ad, review the kit, send it yourself.</p>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Workflow heading. */}
        <section id="what-you-get" className="scroll-mt-24 bg-cream-100 px-4 pb-2 pt-16 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-center text-[32px] font-semibold leading-[1.1] text-navy-800 md:text-[36px]">
              One job ad in. A full application out.
            </h2>
          </ScrollReveal>
        </section>

        {/* Five workflow steps, alternating splits, product shot dominant. */}
        {WORKFLOW_STEPS.map((step, i) => (
          <section key={step.n} className="bg-cream-100 px-4 py-10 sm:px-6 lg:px-8">
            <ScrollReveal>
              <div
                className={`mx-auto flex max-w-6xl flex-col gap-10 lg:flex-row lg:items-center lg:gap-16 ${
                  i % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className="w-full lg:w-[400px] lg:flex-shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-600 text-sm font-semibold text-white">
                      {step.n}
                    </span>
                    <span className="text-sm font-medium text-warm-gray">
                      {step.label}
                    </span>
                  </div>
                  <h3 className="mt-4 text-[28px] font-semibold leading-[1.15] text-navy-800">
                    {step.title}
                  </h3>
                  <p className="mt-4 text-[15px] leading-relaxed text-warm-gray">{step.body}</p>
                  {step.secondLine && (
                    <p className="mt-4 text-[15px] leading-relaxed text-warm-gray">{step.secondLine}</p>
                  )}
                  {step.boldClose && (
                    <p className="mt-4 text-[15px] font-semibold leading-relaxed text-navy-800">
                      {step.boldClose}
                    </p>
                  )}
                  {step.kicker && (
                    <div className="mt-6 rounded-2xl border border-cream-200 bg-cream-50 p-5 shadow-sm">
                      <p className="text-sm leading-relaxed text-charcoal">{step.kicker}</p>
                    </div>
                  )}
                </div>
                <div className="w-full flex-1">
                  {step.image ? (
                    <Image
                      src={step.image.src}
                      alt={step.image.alt}
                      width={1440}
                      height={900}
                      quality={90}
                      sizes="(max-width: 1023px) 100vw, 660px"
                      className="w-full rounded-2xl border border-cream-200 shadow-sm"
                    />
                  ) : (
                    <div className="flex aspect-[16/10] w-full items-center justify-center rounded-2xl border border-cream-200 bg-cream-50 shadow-sm">
                      <span className="text-sm text-warm-gray">Screenshot coming</span>
                    </div>
                  )}
                </div>
              </div>
            </ScrollReveal>
          </section>
        ))}

        {/* Founder note. */}
        <section className="bg-cream-100 px-4 py-6 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="mx-auto flex max-w-3xl items-start gap-6">
              <Image
                src="/wasim-founder.jpg"
                alt="Wasim Jalali, founder of Useful Apply"
                width={240}
                height={240}
                className="h-[120px] w-[120px] flex-shrink-0 rounded-2xl border border-cream-200 object-cover shadow-sm"
              />
              <div>
                <p className="text-[17px] leading-relaxed text-charcoal">
                  &ldquo;I built Useful Apply for my own search. Sixty-plus applications, every one written by
                  the product, five interviews, and the job I have now came from one of them.&rdquo;
                </p>
                <p className="mt-3 text-sm text-warm-gray">Wasim Jalali, founder</p>
              </div>
            </div>
          </ScrollReveal>
        </section>

        {/* Pricing: compact cards here, full detail on /pricing. */}
        <section className="bg-cream-100 px-4 py-14 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-center text-[32px] font-semibold leading-[1.1] text-navy-800 md:text-[36px]">
              Plans you can count
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-warm-gray">
              Plain units, published monthly prices. You always know what you&apos;re buying.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className="mx-auto mt-9 max-w-5xl">
              <div className="grid gap-4 md:grid-cols-3">
                {LANDING_PLANS.map((plan) => {
                  const isPlus = plan.tier === 'plus';
                  return (
                    <div
                      key={plan.tier}
                      className={`flex flex-col rounded-2xl border p-6 shadow-sm ${
                        isPlus ? 'border-gold-400' : 'border-cream-200'
                      } bg-cream-50`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-navy-800">{plan.name}</span>
                        {isPlus && (
                          <span className="rounded-full bg-gold-400 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white">
                            Most popular
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-[32px] font-semibold leading-none text-navy-900">
                        {plan.price}
                        {plan.per && (
                          <span className="ml-1 text-sm font-normal text-warm-gray">{plan.per}</span>
                        )}
                      </p>

                      <ul className="mb-6 mt-4 flex-1 space-y-2.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-charcoal">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-gold-500" />
                            {feature}
                          </li>
                        ))}
                      </ul>

                      {isPlus ? (
                        <Link
                          href={plan.href}
                          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-gold-400 text-sm font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-gold-500 cursor-pointer"
                        >
                          {plan.cta}
                        </Link>
                      ) : (
                        <Link
                          href={plan.href}
                          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-cream-200 bg-cream-50 text-sm font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white cursor-pointer"
                        >
                          {plan.cta}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 text-center text-sm text-warm-gray">
                Need more later? Top up with a credit pack for $19.99. Cancel anytime.
              </p>
              <p className="mt-2 text-center text-sm font-medium text-charcoal">
                Whichever plan you pick, nothing sends itself. You review, you send.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* Comparison table + the navy card. */}
        <section className="bg-cream-100 px-4 py-14 sm:px-6 lg:px-8">
          <ScrollReveal>
            <h2 className="text-center text-[32px] font-semibold leading-[1.1] text-navy-800 md:text-[36px]">
              Why not ChatGPT or a free tool?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[15px] leading-relaxed text-warm-gray">
              Same engine class. The difference is the grounding, the memory and the workflow around it.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className="mx-auto mt-9 max-w-4xl overflow-x-auto rounded-2xl border border-cream-200 bg-cream-50 shadow-sm">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-5" aria-hidden />
                    <th className="bg-gold-50 px-4 py-5 text-center text-sm font-semibold text-navy-800">
                      Useful Apply
                    </th>
                    <th className="px-4 py-5 text-center text-sm font-medium text-warm-gray">ChatGPT</th>
                    <th className="px-4 py-5 text-center text-sm font-medium text-warm-gray">
                      Autofill tools
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.feature} className="border-t border-cream-200">
                      <td className="px-6 py-4 text-sm leading-relaxed text-charcoal">{row.feature}</td>
                      <td className="bg-gold-50 px-4 py-4 text-center">
                        <ComparisonCell value={row.cells[0]} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ComparisonCell value={row.cells[1]} />
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ComparisonCell value={row.cells[2]} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ScrollReveal>
          <ScrollReveal delay={150}>
            <div className="mx-auto mt-8 max-w-4xl rounded-2xl bg-navy-700 p-8 md:p-10">
              <h3 className="text-xl font-semibold text-white md:text-2xl">We prepare, you send.</h3>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-navy-100">
                Useful Apply doesn&apos;t submit anything on your behalf. Not today, not ever. Every application
                waits for your review and your click. That&apos;s not a gap we plan to close. It&apos;s the whole
                point.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-4 sm:px-6 lg:px-8 bg-navy-700 relative overflow-hidden">
          <div className="absolute inset-0 dot-grid opacity-[0.04]" />
          <ScrollReveal>
          <div className="max-w-3xl mx-auto text-center relative">
            <h2 className="font-bold text-white text-[36px] md:text-[48px] leading-[1.1] mb-5">
              Your next interview is <span className="text-gold-400">90 seconds away.</span>
            </h2>
            <p className="text-[17px] text-navy-100 mb-9 max-w-xl mx-auto leading-relaxed">
              Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link
                href="/dashboard"
                className="cta-gold px-8 py-3.5 bg-gold-400 hover:bg-gold-500 text-white font-semibold rounded-lg shadow-sm flex items-center justify-center gap-2 text-base group"
              >
                Start free, no credit card
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                href="/pricing"
                className="px-8 py-3.5 border border-white/30 text-white font-semibold rounded-lg hover:bg-white/10 hover:border-white/50 transition-all duration-200 hover:-translate-y-0.5 flex items-center justify-center text-base"
              >
                View pricing
              </Link>
            </div>
          </div>
          </ScrollReveal>
        </section>
      </main>
      <Footer />
    </div>
  );
}
