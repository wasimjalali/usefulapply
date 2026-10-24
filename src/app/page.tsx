import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowDown, Check } from 'lucide-react';
import Navbar from '@/components/marketing/Navbar';
import Footer from '@/components/marketing/Footer';
import { BrandIcon } from '@/components/BrandLogo';
import { ScrollReveal } from '@/components/marketing/ScrollReveal';
import { JobBoardMark, JOB_BOARD_NAMES } from '@/components/marketing/JobBoardMarks';

import { SEO_METADATA_BASE, SEO_SITE_URL, canonicalUrl } from '@/lib/seo/site-url';

export const metadata: Metadata = {
  metadataBase: SEO_METADATA_BASE,
  title: {
    absolute: 'Useful Apply | Your entire job search, in one app',
  },
  description:
    'Useful Apply is the AI job application agent that replaces the seven tools job seekers stitch together. A daily job feed, a fit check before you spend anything, and a tailored CV, cover letter and emails in 90 seconds. Every word traces back to your real CV.',
  alternates: { canonical: canonicalUrl('/') },
};

const SITE_URL = SEO_SITE_URL;

// Stills captured from the product demo at 120% UI zoom (?stills),
// full 16:9 dashboard, so the landing walkthrough shows the whole app.
const DEMO_MOMENTS = [
  {
    anchor: 'moment-find',
    title: 'Jobs ranked for you',
    body: 'Up to 25 a day, matched to your experience.',
    image: {
      src: '/images/demo/still-find.webp',
      alt: 'The full Useful Apply dashboard: sidebar, job-board chat and today\'s ranked roles',
      width: 4608,
      height: 2592,
    },
  },
  {
    anchor: 'moment-fit',
    title: 'Check the fit first',
    body: "What's strong, what's missing and whether it's worth applying.",
    image: {
      src: '/images/demo/still-fit.webp',
      alt: 'The full dashboard on a Good Fit result: 78% match in chat, CV preview on the right',
      width: 4608,
      height: 2592,
    },
  },
  {
    anchor: 'moment-kit',
    title: 'The application for this job',
    body: 'CV, cover letter, emails and screening answers. From your real CV.',
    image: {
      src: '/images/demo/still-application.webp',
      alt: 'The full dashboard with the tailored CV, ATS 91% and the template picker',
      width: 4608,
      height: 2592,
    },
  },
  {
    anchor: 'moment-track',
    title: 'Track every application',
    body: "What you've sent, what's gone quiet and what's due a follow-up.",
    image: {
      src: '/images/demo/still-track.webp',
      alt: 'The full dashboard on the tracker: six applications, match scores and the next action on each',
      width: 4608,
      height: 2592,
    },
  },
];

const KIT_OUTPUTS = [
  'Fit check for that exact role',
  'Tailored CV',
  'Cover letter',
  'Application email',
  'Follow-up email',
  'Answers to screening questions',
  'Application tracker',
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
      'Top 25 roles a day in your feed',
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
      'Top 25 roles a day, twice the search',
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
  { feature: 'CV, cover letter, application email and follow-up as one application', cells: [true, 'Prompt by prompt', false] },
  { feature: 'Edit by chatting, live document preview', cells: [true, false, false] },
  { feature: 'Daily ranked shortlist and tracker built in', cells: [true, false, 'Varies'] },
];

function ComparisonCell({ value }: { value: CellValue }) {
  if (value === true) return <Check aria-label="Yes" className="mx-auto h-4 w-4 text-accent-strong" />;
  if (value === false) return <span className="text-sm text-ink-muted">&ndash;</span>;
  return <span className="text-xs text-ink-muted">{value}</span>;
}

export default function Home() {
  return (
    <div className="min-h-screen bg-canvas">
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
              'Useful Apply is the AI job application agent: daily job feed, fit check, tailored CV, cover letter, emails, screening answers and tracker. Every word traces back to your real CV.',
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
        {/* First fold: the hero on the flat cream page background. */}
        <div className="relative overflow-hidden">
        {/* Hero: copy stacked over the demo, so the reel gets the full column width. */}
        <section className="relative px-4 pb-14 pt-16 sm:px-6 lg:px-8 lg:pt-24">
          <div className="mx-auto max-w-7xl">
            <ScrollReveal className="mx-auto max-w-3xl text-center">
              <h1 className="font-bold text-brand text-[40px] leading-[1.08] sm:text-[52px]">
                Find jobs, write tailored applications, track them.<br />
                <span className="text-accent-strong">All in one app.</span>
              </h1>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-muted">
                Check your fit first. Then get a tailored CV, cover letter, application email and
                answers to your screening questions, grounded in what you&apos;ve actually done.
                You review, you send.
              </p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-control bg-accent px-7 text-[15px] font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong cursor-pointer"
                >
                  Start free
                </Link>
                <Link
                  href="#demo"
                  className="inline-flex h-12 items-center justify-center rounded-control border border-border bg-surface px-7 text-[15px] font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised cursor-pointer"
                >
                  Watch the demo
                </Link>
              </div>
              <p className="mt-4 text-sm text-ink-muted">
                Your first fit check is on us, no account needed.
              </p>
            </ScrollReveal>
            {/* The product reel: the interactive 64-second demo, 16:9,
                running the full container width. Self-contained page with its
                own click-to-play gate, so one click starts it with sound. */}
            <ScrollReveal delay={150} className="mt-12 w-full">
              <div
                id="demo"
                className="relative aspect-video w-full scroll-mt-24 overflow-hidden rounded-card border border-border bg-surface-inverse-strong shadow-resting"
              >
                <iframe
                  src="/demo/useful-apply-reel.html"
                  title="Useful Apply product demo, 64 seconds"
                  loading="lazy"
                  className="absolute inset-0 h-full w-full border-0"
                />
              </div>
            </ScrollReveal>
          </div>
        </section>

        </div>
        {/* /first fold */}

        {/* Volume band: the problem, as a full-bleed navy mood beat straight
            after the demo. The three lines rise one after another on scroll
            progress, the gold punch line landing last. */}
        <section className="bg-surface-inverse-strong px-4 py-24 sm:px-6 lg:px-8 lg:py-36">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="scroll-rise text-[36px] font-semibold leading-[1.12] text-ink-inverse md:text-[48px]">
              Everyone&apos;s applying more.<br />
              It&apos;s working less.
            </h2>
            <p className="scroll-rise-late mx-auto mt-7 max-w-2xl text-[17px] leading-relaxed text-ink-inverse-tint">
              AI flooded recruiters with lookalike applications. Filters tightened, good people got buried.
              Useful Apply is the opposite of a bot.
            </p>
            <p className="scroll-rise-late mt-10 text-[19px] font-semibold text-accent md:text-[21px]">
              One job, one fit check, one application worth your name.
            </p>
          </div>
        </section>

        {/* Paste from anywhere: caption on top, the source-to-kit diagram
            underneath so the visual carries the section. */}
        <section className="overflow-x-clip bg-canvas px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-7xl">
            <ScrollReveal>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-[32px] font-semibold leading-[1.15] text-ink md:text-[36px]">
                  Bring a job ad from anywhere
                </h2>
                <p className="mt-4 text-[17px] leading-relaxed text-ink-muted">
                  Pick a role from your daily feed, or paste a job ad from any board or careers page.
                </p>
              </div>
            </ScrollReveal>
            <div className="mx-auto mt-12 max-w-5xl">
              <ScrollReveal delay={80}>
                <div className="stagger-rise grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="col-span-2 flex h-14 items-center justify-center gap-2.5 rounded-card border border-border bg-surface shadow-resting sm:col-span-3">
                    <BrandIcon size="sm" theme="light" />
                    <span className="text-[17px] font-semibold text-ink">Useful Apply job feed</span>
                  </div>
                  {JOB_BOARD_NAMES.map((name) => (
                    <div
                      key={name}
                      className="flex h-14 items-center justify-center rounded-card border border-border bg-surface shadow-resting"
                    >
                      <JobBoardMark name={name} />
                    </div>
                  ))}
                  <div className="col-span-2 flex h-10 items-center justify-center rounded-card border border-dashed border-border text-sm text-ink-muted sm:col-span-3">
                    and any careers page
                  </div>
                </div>
              </ScrollReveal>
              <div className="flex justify-center py-5" aria-hidden>
                <ArrowDown className="h-6 w-6 text-accent-strong" />
              </div>
              <div className="scroll-slide-from-bottom">
                <div className="rounded-card border border-border bg-surface p-7 shadow-resting md:p-8">
                  <div className="flex items-center gap-2.5">
                    <BrandIcon size="sm" theme="light" />
                    <span className="text-[17px] font-semibold text-ink">Useful Apply</span>
                  </div>
                  <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
                    {KIT_OUTPUTS.map((item) => (
                      <li key={item} className="flex items-center gap-2.5 text-[15px] text-ink-body">
                        <Check className="h-4 w-4 flex-shrink-0 text-ink-accent" strokeWidth={2.5} />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-sm text-ink-muted">Paste the ad, review the full application, send it yourself.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product walkthrough: four stacked slides. Each card sticks in
            the same viewport; the next one covers it as you scroll. The
            still is sized to its 16:9 frame; a shadow lifts it off the
            cream canvas. */}
        <section id="what-you-get" className="scroll-mt-24 bg-canvas pt-8 lg:pt-12">
          <div>
            {DEMO_MOMENTS.map((moment, index) => (
              <figure
                key={moment.title}
                id={moment.anchor}
                className={`walkthrough-card sticky top-[5.25rem] flex h-[calc(100svh-5.25rem)] flex-col bg-canvas ${
                  index > 0 ? 'border-t border-border' : ''
                }`}
                style={{ zIndex: index + 1 }}
              >
                <div className="mx-auto flex h-full w-full max-w-7xl flex-col px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
                  <figcaption className="mx-auto flex min-h-[6.5rem] w-full max-w-2xl shrink-0 flex-col justify-end text-center md:min-h-[7.25rem]">
                    <h2 className="text-[26px] font-semibold leading-[1.15] text-ink md:text-[32px]">
                      {moment.title}
                    </h2>
                    <p className="mt-3 text-[15px] leading-relaxed text-ink-muted md:text-[16px]">
                      {moment.body}
                    </p>
                  </figcaption>
                  <div className="mt-6 flex min-h-0 flex-1 items-center justify-center py-4">
                    <div className="walkthrough-still max-h-full max-w-full rounded-card bg-surface">
                      <Image
                        src={moment.image.src}
                        alt={moment.image.alt}
                        width={moment.image.width}
                        height={moment.image.height}
                        quality={95}
                        unoptimized
                        sizes="(max-width: 1280px) 100vw, 1280px"
                        className="block h-auto max-h-full w-auto max-w-full rounded-card"
                      />
                    </div>
                  </div>
                </div>
              </figure>
            ))}
          </div>
        </section>

        <section className="bg-canvas px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <ScrollReveal direction="none" duration={700}>
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-[32px] font-semibold leading-[1.15] text-ink md:text-[36px]">
                A companion, not an apply bot
              </h2>
              <p className="mt-5 text-[17px] leading-relaxed text-ink-body md:text-[18px]">
                Recruiters hate auto-apply. They can spot spray and pray, and they skip it.
              </p>
              <p className="mt-4 text-[17px] leading-relaxed text-ink-body md:text-[18px]">
                Useful Apply helps you pick the job, write a real application and send it yourself.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* Founder note: a quiet pull-quote beat between the walkthrough and
            pricing. Pure fade, no travel. */}
        <section className="bg-canvas px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <ScrollReveal direction="none" duration={600}>
            <figure className="mx-auto max-w-3xl text-center">
              <Image
                src="/wasim-founder.jpg"
                alt="Wasim Jalali, founder of Useful Apply"
                width={240}
                height={240}
                className="mx-auto h-[96px] w-[96px] rounded-card border border-border object-cover shadow-resting"
              />
              <blockquote className="mt-7 text-[20px] font-medium leading-snug text-ink md:text-[24px]">
                &ldquo;I built Useful Apply for my own search. Sixty-plus applications, every one written by
                the product, five interviews, and the job I have now came from one of them.&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-sm text-ink-muted">Wasim Jalali, founder</figcaption>
            </figure>
          </ScrollReveal>
        </section>

        {/* Pricing: compact cards here, full detail on /pricing. */}
        <section className="bg-canvas px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <ScrollReveal>
            <h2 className="text-center text-[32px] font-semibold leading-[1.1] text-ink md:text-[36px]">
              Plans you can count
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-center text-[15px] leading-relaxed text-ink-muted">
              Plain units, published monthly prices. You always know what you&apos;re buying.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className="mx-auto mt-9 max-w-5xl">
              <div className="stagger-rise grid gap-4 md:grid-cols-3">
                {LANDING_PLANS.map((plan) => {
                  const isPlus = plan.tier === 'plus';
                  return (
                    <div
                      key={plan.tier}
                      className={`flex flex-col rounded-card border p-6 shadow-resting ${
                        isPlus ? 'border-accent' : 'border-border'
                      } bg-surface`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-ink">{plan.name}</span>
                        {isPlus && (
                          <span className="rounded-pill bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                            Most popular
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-[32px] font-semibold leading-none text-ink-strong">
                        {plan.price}
                        {plan.per && (
                          <span className="ml-1 text-sm font-normal text-ink-muted">{plan.per}</span>
                        )}
                      </p>

                      <ul className="mb-6 mt-4 flex-1 space-y-2.5">
                        {plan.features.map((feature) => (
                          <li key={feature} className="flex items-start gap-2 text-sm text-ink-body">
                            <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-accent-strong" />
                            {feature}
                          </li>
                        ))}
                      </ul>

                      {isPlus ? (
                        <Link
                          href={plan.href}
                          className="inline-flex h-11 w-full items-center justify-center rounded-control bg-accent text-sm font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong cursor-pointer"
                        >
                          {plan.cta}
                        </Link>
                      ) : (
                        <Link
                          href={plan.href}
                          className="inline-flex h-11 w-full items-center justify-center rounded-control border border-border bg-surface text-sm font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised cursor-pointer"
                        >
                          {plan.cta}
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="mt-6 text-center text-sm text-ink-muted">
                Need more later? Top up with a credit pack for $19.99. Cancel anytime.
              </p>
              <p className="mt-2 text-center text-sm font-medium text-ink-body">
                Whichever plan you pick, nothing sends itself. You review, you send.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* Comparison table + the navy card. */}
        <section className="bg-canvas px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <ScrollReveal>
            <h2 className="text-center text-[32px] font-semibold leading-[1.1] text-ink md:text-[36px]">
              Why not ChatGPT or a free tool?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-[15px] leading-relaxed text-ink-muted">
              Same engine class. The difference is the grounding, the memory and the workflow around it.
            </p>
          </ScrollReveal>
          <ScrollReveal delay={100}>
            <div className="mx-auto mt-9 max-w-4xl overflow-x-auto rounded-card border border-border bg-surface shadow-resting">
              <table className="w-full min-w-[640px] border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-5" aria-hidden />
                    <th className="bg-accent-soft px-4 py-5 text-center text-sm font-semibold text-ink">
                      Useful Apply
                    </th>
                    <th className="px-4 py-5 text-center text-sm font-medium text-ink-muted">ChatGPT</th>
                    <th className="px-4 py-5 text-center text-sm font-medium text-ink-muted">
                      Autofill tools
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr key={row.feature} className="border-t border-border">
                      <td className="px-6 py-4 text-sm leading-relaxed text-ink-body">{row.feature}</td>
                      <td className="bg-accent-soft px-4 py-4 text-center">
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
            <div className="mx-auto mt-8 max-w-4xl rounded-card bg-surface-inverse-raised p-8 md:p-10">
              <h3 className="text-xl font-semibold text-ink-inverse md:text-2xl">We prepare, you send.</h3>
              <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-ink-inverse-tint">
                Useful Apply doesn&apos;t submit anything on your behalf. Not today, not ever. Every application
                waits for your review and your click. That&apos;s not a gap we plan to close. It&apos;s the whole
                point.
              </p>
            </div>
          </ScrollReveal>
        </section>

        {/* Final CTA: the oversized headline settles into place on scroll
            progress, then the subline and buttons rise behind it.
            overflow-clip, not overflow-hidden: hidden would make this section
            a scroll container and hijack the view() timeline of the
            scroll-settle headline inside it. */}
        <section className="relative overflow-clip bg-surface-inverse-raised px-4 py-28 sm:px-6 lg:px-8 lg:py-36">
          <div className="relative mx-auto max-w-3xl text-center">
            <div className="scroll-settle">
              <h2 className="text-[36px] font-bold leading-[1.1] text-ink-inverse md:text-[48px]">
                Your next interview is <span className="text-accent">90 seconds away.</span>
              </h2>
            </div>
            <ScrollReveal delay={150}>
              <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-ink-inverse-tint">
                Upload your CV. Pick a role from your feed. Send your first full application before your coffee gets cold.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/dashboard"
                  className="inline-flex h-12 items-center justify-center rounded-control bg-accent px-8 text-base font-semibold text-accent-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-accent-strong cursor-pointer"
                >
                  Start free
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-12 items-center justify-center rounded-control border border-ink-inverse/30 px-8 text-base font-semibold text-ink-inverse transition-colors duration-(--duration-base) hover:border-ink-inverse/50 hover:bg-ink-inverse/10 cursor-pointer"
                >
                  View pricing
                </Link>
              </div>
              <p className="mt-4 text-sm text-ink-inverse-muted">No credit card needed.</p>
            </ScrollReveal>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
