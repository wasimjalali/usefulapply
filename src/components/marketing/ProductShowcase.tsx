'use client';

import { useState } from 'react';
import Image from 'next/image';
import { FileText, Mail, MailCheck, Target, BarChart3, ClipboardList, X } from 'lucide-react';

const FEATURES = [
  {
    id: 'cv',
    label: 'Tailored CV',
    icon: FileText,
    src: '/screenshots/showcase-cv.jpg',
    width: 4096,
    height: 2964,
    alt: 'KarKo AI tailored CV panel showing ATS-optimized resume',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
  },
  {
    id: 'cover-letter',
    label: 'Cover Letter',
    icon: Target,
    src: '/screenshots/showcase-cover-letter.jpg',
    width: 4096,
    height: 2960,
    alt: 'KarKo AI personalized cover letter tailored to the company',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
  },
  {
    id: 'email',
    label: 'Application Email',
    icon: Mail,
    src: '/screenshots/showcase-email.jpg',
    width: 4096,
    height: 2948,
    alt: 'KarKo AI professional application email ready to send',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
  },
  {
    id: 'follow-up',
    label: 'Follow-Up Email',
    icon: MailCheck,
    src: '/screenshots/showcase-follow-up.jpg',
    width: 1888,
    height: 1356,
    alt: 'KarKo AI follow-up email with a different achievement highlighted',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
  },
  {
    id: 'tracker',
    label: 'Application Tracker',
    icon: ClipboardList,
    src: '/screenshots/showcase-tracker.jpg',
    width: 1896,
    height: 1374,
    alt: 'KarKo AI application tracker with match scores and status tracking',
    accent: 'from-navy-600 to-navy-700',
    accentLight: 'from-navy-50 to-navy-100',
    iconColor: 'text-navy-600',
  },
  {
    id: 'ats-score',
    label: 'ATS Score',
    icon: BarChart3,
    src: '/screenshots/showcase-ats-score.jpg',
    width: 2854,
    height: 1380,
    alt: 'KarKo AI ATS compatibility score and optimization report',
    accent: 'from-gold-400 to-gold-500',
    accentLight: 'from-gold-50 to-gold-100',
    iconColor: 'text-gold-500',
  },
];

export function ProductShowcase() {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {FEATURES.map((feature) => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.id}
              onClick={() => setExpanded(feature.id)}
              className="group relative bg-white rounded-2xl border border-cream-200 shadow-sm hover:shadow-xl hover:border-gold-300/50 transition-all duration-300 overflow-hidden text-left cursor-pointer"
            >
              <div className={`h-1 bg-gradient-to-r ${feature.accent}`} />

              {/* Screenshot preview */}
              <div className="relative overflow-hidden bg-cream-50">
                <Image
                  src={feature.src}
                  alt={feature.alt}
                  width={feature.width}
                  height={feature.height}
                  className="w-full h-auto group-hover:scale-[1.03] transition-transform duration-500"
                  quality={85}
                  sizes="(max-width: 640px) 100vw, 50vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>

              {/* Label */}
              <div className="px-5 py-4 flex items-center gap-3">
                <div className={`w-9 h-9 bg-gradient-to-br ${feature.accentLight} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`w-4.5 h-4.5 ${feature.iconColor}`} />
                </div>
                <span className="text-sm font-semibold text-navy-600 group-hover:text-gold-600 transition-colors">{feature.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Lightbox */}
      {expanded && (() => {
        const feature = FEATURES.find((f) => f.id === expanded)!;
        const Icon = feature.icon;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 bg-navy-900/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setExpanded(null)}
          >
            <div
              className="relative bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className={`h-1 bg-gradient-to-r ${feature.accent}`} />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 bg-gradient-to-br ${feature.accentLight} rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${feature.iconColor}`} />
                  </div>
                  <span className="text-lg font-bold text-navy-600">{feature.label}</span>
                </div>
                <button
                  onClick={() => setExpanded(null)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-warm-gray hover:bg-cream-100 hover:text-navy-600 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Full image */}
              <div className="overflow-auto max-h-[calc(90vh-80px)]">
                <Image
                  src={feature.src}
                  alt={feature.alt}
                  width={feature.width}
                  height={feature.height}
                  className="w-full h-auto"
                  quality={95}
                  sizes="(max-width: 1280px) 100vw, 1280px"
                  priority
                />
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
