'use client';

import Image from 'next/image';

type Panel = {
  id: string;
  eyebrow: string;
  title: string;
  titleAccent?: string;
  description: string;
  image: string;
  imageAlt: string;
};

const PANELS: Panel[] = [
  {
    id: 'job-feed',
    eyebrow: 'Smart Job Feed',
    title: 'Up to 25 hand-picked jobs,',
    titleAccent: 'delivered daily to your feed.',
    description:
      "While you sleep, Karko searches the web and picks roles that actually fit you. Open the app in the morning to a feed of jobs worth applying to. No keyword juggling, no job-board swamp.",
    image: '/screenshots/01b-job-feed-left-only.webp',
    imageAlt: 'Karko Smart Job Feed with six hand-picked roles and match scores',
  },
  {
    id: 'application-kit',
    eyebrow: 'Application Kit',
    title: 'A complete application package,',
    titleAccent: 'in 90 seconds.',
    description:
      'Tailored CV, cover letter, application email and follow-up email. Personalized to you and the role, generated in one click, ready to send.',
    image: '/screenshots/03-application-kit-generated.webp',
    imageAlt: 'Karko Application Kit showing tailored CV with Cover Letter and Email tabs',
  },
  {
    id: 'tracker',
    eyebrow: 'Application Tracker',
    title: 'Track every application and its status,',
    titleAccent: 'in one place.',
    description:
      'Statuses, match scores, follow-up timers and company context. One view of your whole search, so nothing falls through the cracks.',
    image: '/screenshots/11-job-feed-empty-upsell.webp',
    imageAlt: 'Karko Application Tracker with match scores and status pills',
  },
];

export function PlatformScrollStack() {
  return (
    <section className="bg-cream-50 pt-14 lg:pt-16 pb-0">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center">
          <p className="text-xs font-semibold text-gold-600 uppercase tracking-[0.12em] mb-3">
            The Platform
          </p>
          <h2 className="font-bold text-navy-600 text-[32px] md:text-[44px] lg:text-[52px] leading-[1.08] max-w-3xl mx-auto">
            All in one platform for job seekers.
          </h2>
          <p className="mt-4 text-warm-gray text-lg max-w-xl mx-auto">
            Three panels. One flow. Find roles, apply in 90 seconds, track everything.
          </p>
        </div>
      </div>

      {/* Scroll stack: each panel sticks to the top of the viewport and
          the next slides up over it. */}
      <div className="relative mt-6 lg:mt-8">
        {PANELS.map((panel, i) => (
          <div
            key={panel.id}
            className="sticky top-20 lg:top-24 min-h-screen flex items-start justify-center pt-4 lg:pt-6 px-3 sm:px-4 lg:px-5"
            style={{ zIndex: i + 1 }}
          >
            <div
              className={`w-full max-w-[1440px] mx-auto rounded-[24px] border border-cream-200 shadow-lg bg-cream-50 overflow-hidden ${
                i === 0 ? 'lg:mt-0' : ''
              }`}
            >
              <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-center p-5 sm:p-6 lg:p-8">
                {/* LEFT: copy (narrower) */}
                <div className="lg:col-span-4 order-2 lg:order-1">
                  <p className="inline-flex items-center text-[10px] font-bold text-gold-600 uppercase tracking-[0.14em] mb-3 px-2.5 py-1 rounded-full bg-gold-50 border border-gold-200">
                    0{i + 1} &nbsp;·&nbsp; {panel.eyebrow}
                  </p>
                  <h3 className="font-bold text-navy-600 text-[22px] md:text-[26px] lg:text-[28px] leading-[1.15] mb-3">
                    {panel.title}{' '}
                    {panel.titleAccent && (
                      <span className="text-gold-500">{panel.titleAccent}</span>
                    )}
                  </h3>
                  <p className="text-warm-gray text-[14px] lg:text-[15px] leading-relaxed max-w-sm">
                    {panel.description}
                  </p>
                </div>

                {/* RIGHT: product shot (dominant) */}
                <div className="lg:col-span-8 order-1 lg:order-2">
                  <div className="relative rounded-2xl border border-cream-200 shadow-md bg-white overflow-hidden">
                    <Image
                      src={panel.image}
                      alt={panel.imageAlt}
                      width={1920}
                      height={1200}
                      className="w-full h-auto"
                      quality={92}
                      sizes="(max-width: 1024px) 100vw, 66vw"
                      priority={i === 0}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Trailing spacer so the last panel has a full screen of scroll room */}
        <div className="h-[50vh]" aria-hidden="true" />
      </div>
    </section>
  );
}
