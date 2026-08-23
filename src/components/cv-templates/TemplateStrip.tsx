'use client';

import { useState } from 'react';
import Image from 'next/image';
import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';

interface TemplateStripProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
}

const PREVIEW_IMAGES: Record<string, string> = {
  'premium-ats': '/templates/premium-ats.png',
  'modern-professional': '/templates/modern-professional.png',
  'executive': '/templates/executive.png',
  'german-ats': '/templates/german-ats.png',
  'german-classic': '/templates/german-classic.png',
  'classic-green': '/templates/classic-green.png',
};

/** Short "best for" tag per template. Empty string means no tag. */
const BEST_FOR: Record<string, string> = {
  'premium-ats': 'Recommended',
  'modern-professional': 'Tech & startups',
  'executive': 'Senior roles',
  'german-ats': 'DACH & NL',
  'german-classic': 'One column',
  'classic-green': '',
};

function cleanName(name: string): string {
  // Definitions carry a star on the default template; the strip shows the tag instead.
  return name.replace(/^[^\w]+/, '').trim();
}

/**
 * Instant placeholder: a tiny document sketch in the template's primary and
 * accent colours. The real preview image fades in behind it when it loads.
 */
function Thumb({ templateId, primary, accent, selected }: { templateId: string; primary: string; accent: string; selected: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const src = PREVIEW_IMAGES[templateId];
  return (
    <div
      className={`relative h-[106px] w-[82px] overflow-hidden rounded-lg bg-white ${
        selected ? 'ring-2 ring-gold-400 shadow-sm' : 'border border-cream-200 shadow-sm'
      }`}
    >
      <div className={`flex h-full w-full flex-col gap-1 px-2 py-2.5 transition-opacity duration-300 ${loaded ? 'opacity-0' : 'opacity-100'}`}>
        <span className="block h-1 w-[34px] rounded-[1px]" style={{ background: primary }} />
        <span className="mb-0.5 block h-0.5 w-[46px] rounded-[1px]" style={{ background: accent }} />
        {Array.from({ length: 8 }, (_, i) => (
          <span key={i} className="block h-0.5 rounded-[1px] bg-cream-400" style={{ width: 64 - (i % 3) * 6 }} />
        ))}
      </div>
      {src && (
        <Image
          src={src}
          alt=""
          fill
          sizes="82px"
          quality={60}
          className={`object-cover object-top transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

export function TemplateStrip({ selectedTemplateId, onSelect }: TemplateStripProps) {
  return (
    <div className="flex items-start gap-0 overflow-x-auto scrollbar-hide border-b border-cream-200 bg-cream-50 px-5 pb-3 pt-4" role="listbox" aria-label="CV templates">
      {CV_TEMPLATE_DEFINITIONS.map((template) => {
        const selected = template.id === selectedTemplateId;
        const tag = BEST_FOR[template.id] ?? '';
        return (
          <button
            key={template.id}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => onSelect(template.id)}
            className="flex w-[100px] flex-shrink-0 flex-col items-center gap-2 rounded-lg px-1 py-1 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/50"
          >
            <Thumb
              templateId={template.id}
              primary={template.colors.primary}
              accent={template.colors.accent}
              selected={selected}
            />
            <span className={`text-center text-[11px] leading-tight ${selected ? 'font-semibold text-navy-800' : 'font-medium text-charcoal'}`}>
              {cleanName(template.name)}
            </span>
            {tag ? (
              <span className="inline-flex h-[18px] items-center whitespace-nowrap rounded-full bg-gold-100 px-2 text-[10px] font-semibold text-gold-700">
                {tag}
              </span>
            ) : (
              <span className="h-[18px]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
