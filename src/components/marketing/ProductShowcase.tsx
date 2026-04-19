'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, FileText, Mail, MailCheck, Target, BarChart3, ClipboardList } from 'lucide-react';

const SLIDES = [
  {
    id: 'cv',
    label: 'Tailored CV',
    icon: FileText,
    src: '/screenshots/showcase-cv.jpg',
    width: 4096,
    height: 2964,
    alt: 'KarKo AI tailored CV panel showing ATS-optimized resume',
  },
  {
    id: 'cover-letter',
    label: 'Cover Letter',
    icon: Target,
    src: '/screenshots/showcase-cover-letter.jpg',
    width: 4096,
    height: 2960,
    alt: 'KarKo AI personalized cover letter tailored to the company',
  },
  {
    id: 'email',
    label: 'Application Email',
    icon: Mail,
    src: '/screenshots/showcase-email.jpg',
    width: 4096,
    height: 2948,
    alt: 'KarKo AI professional application email ready to send',
  },
  {
    id: 'follow-up',
    label: 'Follow-Up Email',
    icon: MailCheck,
    src: '/screenshots/showcase-follow-up.jpg',
    width: 1888,
    height: 1356,
    alt: 'KarKo AI follow-up email with a different achievement highlighted',
  },
  {
    id: 'tracker',
    label: 'Application Tracker',
    icon: ClipboardList,
    src: '/screenshots/showcase-tracker.jpg',
    width: 1896,
    height: 1374,
    alt: 'KarKo AI application tracker with match scores and status tracking',
  },
  {
    id: 'ats-score',
    label: 'ATS Score',
    icon: BarChart3,
    src: '/screenshots/showcase-ats-score.jpg',
    width: 2854,
    height: 1380,
    alt: 'KarKo AI ATS compatibility score and optimization report',
  },
];

export function ProductShowcase() {
  const [active, setActive] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % SLIDES.length);
  }, []);

  const prev = useCallback(() => {
    setActive((prev) => (prev - 1 + SLIDES.length) % SLIDES.length);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(next, 5000);
    return () => clearInterval(timer);
  }, [isPaused, next]);

  const slide = SLIDES[active];

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Navigation pills */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-8">
        {SLIDES.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === active;
          return (
            <button
              key={s.id}
              onClick={() => setActive(i)}
              className={`
                inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-300 cursor-pointer
                ${isActive
                  ? 'bg-navy-600 text-white shadow-lg shadow-navy-600/20 scale-105'
                  : 'bg-white text-warm-gray border border-cream-200 hover:border-gold-300 hover:text-navy-600 hover:shadow-sm'
                }
              `}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-gold-400' : ''}`} />
              <span className="hidden sm:inline">{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Screenshot display */}
      <div className="relative max-w-5xl mx-auto group">
        {/* Arrow buttons */}
        <button
          onClick={prev}
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border border-cream-200 flex items-center justify-center text-navy-600 hover:bg-white hover:scale-110 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
          aria-label="Previous screenshot"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={next}
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/90 backdrop-blur-sm shadow-lg border border-cream-200 flex items-center justify-center text-navy-600 hover:bg-white hover:scale-110 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
          aria-label="Next screenshot"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Browser frame */}
        <div className="browser-frame">
          <div className="browser-frame-bar">
            <div className="browser-dot bg-[#FF5F57]" />
            <div className="browser-dot bg-[#FFBD2E]" />
            <div className="browser-dot bg-[#28C840]" />
            <div className="flex-1 mx-4">
              <div className="bg-white/80 rounded-md px-3 py-1 text-xs text-warm-gray text-center max-w-xs mx-auto border border-cream-200">
                {slide.label}
              </div>
            </div>
          </div>

          {/* Image container with crossfade */}
          <div className="relative overflow-hidden bg-cream-50">
            {SLIDES.map((s, i) => (
              <div
                key={s.id}
                className={`transition-opacity duration-500 ${
                  i === active ? 'opacity-100 relative' : 'opacity-0 absolute inset-0'
                }`}
              >
                <Image
                  src={s.src}
                  alt={s.alt}
                  width={s.width}
                  height={s.height}
                  className="w-full h-auto"
                  quality={90}
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  priority={i === 0}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Active label on mobile */}
        <div className="sm:hidden mt-4 text-center">
          <span className="text-sm font-semibold text-navy-600">{slide.label}</span>
          <span className="text-sm text-warm-gray ml-2">{active + 1} / {SLIDES.length}</span>
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 mt-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            className={`rounded-full transition-all duration-300 cursor-pointer ${
              i === active
                ? 'w-8 h-2 bg-gold-400'
                : 'w-2 h-2 bg-cream-300 hover:bg-cream-400'
            }`}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}
