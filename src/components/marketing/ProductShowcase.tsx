'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  src: string;
  alt: string;
};

const SLIDES: Slide[] = [
  {
    id: 'job-feed',
    eyebrow: 'Morning Job Feed',
    title: 'Jobs picked for you, daily',
    description:
      'Every morning Karko delivers hand-picked roles that fit your profile. No keyword wrangling, no job-board swamp.',
    src: '/screenshots/product-01-job-feed.webp',
    alt: 'Karko AI Smart Job Feed showing six hand-picked roles with match badges',
  },
  {
    id: 'fit-analysis',
    eyebrow: 'Fit Analysis',
    title: 'See why before you apply',
    description:
      'A quick read of your fit for each role. Strengths, gaps, and what to lead with in the cover letter.',
    src: '/screenshots/product-05-fit-analysis.webp',
    alt: 'Karko AI Fit Analysis panel showing strengths, gaps and a recommendation',
  },
  {
    id: 'cv',
    eyebrow: 'Optimized CV',
    title: 'ATS-ready in seconds',
    description:
      'Your CV tuned to the role. Skills reordered, keywords matched, ATS score visible at the top.',
    src: '/screenshots/product-02-cv-optimized.webp',
    alt: 'Karko AI Optimized CV with ATS score and template controls',
  },
  {
    id: 'email',
    eyebrow: 'Application Email',
    title: 'Ready to send',
    description:
      'Subject line, body, tone. Copy it, paste it, hit send. Follow-up email included.',
    src: '/screenshots/product-03-application-email.webp',
    alt: 'Karko AI application email with subject line and body ready to send',
  },
  {
    id: 'tracker',
    eyebrow: 'Tracker',
    title: 'Every application in one place',
    description:
      'Statuses, match scores, follow-up timers. One view of your whole search.',
    src: '/screenshots/product-04-tracker.webp',
    alt: 'Karko AI Application Tracker with match scores and status pills',
  },
];

export function ProductShowcase() {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: true,
    align: 'start',
    skipSnaps: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);

  const scrollTo = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);
  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelectedIndex(emblaApi.selectedScrollSnap());
    onSelect();
    emblaApi.on('select', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') scrollPrev();
      if (e.key === 'ArrowRight') scrollNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollPrev, scrollNext]);

  const current = SLIDES[selectedIndex];

  return (
    <div className="w-full">
      {/* Top bar: counter + chevrons */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs font-semibold text-warm-gray uppercase tracking-[0.08em]">
          {String(selectedIndex + 1).padStart(2, '0')} <span className="text-cream-300">/</span>{' '}
          {String(SLIDES.length).padStart(2, '0')} &nbsp;·&nbsp; {current.eyebrow}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={scrollPrev}
            aria-label="Previous slide"
            className="w-10 h-10 rounded-full border border-cream-200 bg-cream-50 text-navy-600 flex items-center justify-center hover:bg-cream-100 hover:border-cream-300 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={scrollNext}
            aria-label="Next slide"
            className="w-10 h-10 rounded-full border border-cream-200 bg-cream-50 text-navy-600 flex items-center justify-center hover:bg-cream-100 hover:border-cream-300 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Embla viewport */}
      <div className="overflow-hidden rounded-2xl" ref={emblaRef}>
        <div className="flex">
          {SLIDES.map((slide, i) => (
            <div
              key={slide.id}
              className="relative flex-[0_0_100%] min-w-0"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${SLIDES.length}`}
            >
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center px-1 lg:px-2">
                {/* LEFT: copy */}
                <div className="lg:col-span-4 order-2 lg:order-1">
                  <p className="text-xs font-semibold text-gold-500 uppercase tracking-[0.08em] mb-3">
                    {slide.eyebrow}
                  </p>
                  <h3 className="font-bold text-charcoal text-[28px] lg:text-[32px] leading-[1.15] mb-4">
                    {slide.title}
                  </h3>
                  <p className="text-warm-gray text-[17px] leading-relaxed max-w-md">
                    {slide.description}
                  </p>
                  <p className="mt-6 text-xs font-medium text-warm-gray">
                    Slide {i + 1} of {SLIDES.length}
                  </p>
                </div>

                {/* RIGHT: dominant screenshot frame */}
                <div className="lg:col-span-8 order-1 lg:order-2">
                  <div className="relative rounded-2xl border border-cream-200 shadow-lg bg-white overflow-hidden aspect-[16/10]">
                    <Image
                      src={slide.src}
                      alt={slide.alt}
                      fill
                      className="object-cover object-top"
                      sizes="(max-width: 1024px) 100vw, 66vw"
                      quality={90}
                      priority={i === 0}
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Dot nav */}
      <div className="mt-8 flex items-center justify-center gap-2">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            aria-current={selectedIndex === i}
            className={`h-2 rounded-full transition-all duration-200 ${
              selectedIndex === i
                ? 'w-8 bg-navy-600'
                : 'w-2 bg-cream-300 hover:bg-cream-400'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
