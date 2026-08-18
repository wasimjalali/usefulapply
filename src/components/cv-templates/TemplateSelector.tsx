'use client';

import { useRef, useState } from 'react';
import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import Image from 'next/image';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  defaultTemplateId?: string;
  onSetDefault?: (templateId: string) => void;
}

const TEMPLATE_PREVIEW_IMAGES: Record<string, string> = {
  'premium-ats': '/templates/premium-ats.png',
  'modern-professional': '/templates/modern-professional.png',
  'executive': '/templates/executive.png',
  'german-ats': '/templates/german-ats.png',
  'german-classic': '/templates/german-classic.png',
  'classic-green': '/templates/classic-green.png',
};

const getTemplateRecommendation = (templateId: string) => {
  switch (templateId) {
    case 'premium-ats': return 'Recommended for most jobs';
    case 'modern-professional': return 'Best for tech & startups';
    case 'executive': return 'Best for senior roles';
    case 'german-ats': return 'Photo · A4 · EU market';
    case 'german-classic': return 'Photo · A4 · Single-column';
    case 'classic-green': return 'Fresh design, all industries';
    default: return '';
  }
};

const getRecommendationStyle = (templateId: string) => {
  switch (templateId) {
    case 'premium-ats': return 'bg-gold-50/90 text-gold-700 border border-gold-200';
    case 'modern-professional': return 'bg-sky-50/90 text-sky-700 border border-sky-200';
    case 'executive': return 'bg-amber-50/90 text-amber-700 border border-amber-200';
    case 'german-ats': return 'bg-navy-50/90 text-navy-600 border border-navy-100';
    case 'german-classic': return 'bg-gray-50/90 text-gray-600 border border-gray-200';
    case 'classic-green': return 'bg-emerald-50/90 text-emerald-700 border border-emerald-200';
    default: return 'bg-cream-100/90 text-warm-gray';
  }
};

function TemplatePreviewImage({ src, alt }: { src?: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative w-full bg-cream-100 overflow-hidden" style={{ aspectRatio: '0.77' }}>
      <div className="absolute inset-0 bg-cream-100" />
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes="220px"
          className={`object-cover object-top transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          quality={60}
          onLoad={() => setLoaded(true)}
        />
      ) : (
        <div className="w-full h-full bg-cream-100 flex items-center justify-center">
          <span className="text-xs text-warm-gray">Preview</span>
        </div>
      )}
    </div>
  );
}

export function TemplateSelector({ selectedTemplateId, onSelect, defaultTemplateId, onSetDefault }: TemplateSelectorProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCard = (direction: -1 | 1) => {
    const node = scrollerRef.current;
    if (!node) return;
    const cardWidth = node.firstElementChild instanceof HTMLElement
      ? node.firstElementChild.getBoundingClientRect().width + 16
      : 220;
    node.scrollBy({ left: direction * cardWidth, behavior: 'smooth' });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-charcoal">Choose Template</span>
        <span className="text-[10px] text-warm-gray">ATS-Optimized &middot; 6 Templates</span>
      </div>

      <div className="relative">
        <button
          type="button"
          onClick={() => scrollByCard(-1)}
          aria-label="Previous templates"
          className="absolute left-0 top-1/2 z-10 -translate-y-1/2 -translate-x-1 rounded-full border border-cream-200 bg-white p-1.5 text-navy-700 shadow-sm hover:bg-cream-50 cursor-pointer"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => scrollByCard(1)}
          aria-label="Next templates"
          className="absolute right-0 top-1/2 z-10 -translate-y-1/2 translate-x-1 rounded-full border border-cream-200 bg-white p-1.5 text-navy-700 shadow-sm hover:bg-cream-50 cursor-pointer"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

      <div ref={scrollerRef} className="flex gap-4 overflow-x-auto pb-1 snap-x snap-mandatory">
        {CV_TEMPLATE_DEFINITIONS.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          const recommendation = getTemplateRecommendation(template.id);
          const isDefault = template.id === (defaultTemplateId || 'premium-ats');
          const recStyle = getRecommendationStyle(template.id);
          const previewSrc = TEMPLATE_PREVIEW_IMAGES[template.id];

          return (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={`relative w-[46%] min-w-[46%] snap-start rounded-xl border-2 transition-all text-left cursor-pointer group overflow-hidden shrink-0 ${
                isSelected
                  ? 'border-gold-400 ring-2 ring-gold-100 shadow-lg'
                  : 'border-cream-200 hover:border-navy-200 hover:shadow-md'
              }`}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-6 h-6 bg-gold-500 rounded-full flex items-center justify-center shadow-md z-20">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </div>
              )}

              {/* Default Badge */}
              {isDefault && !isSelected && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-gold-50/95 text-gold-600 text-[10px] font-semibold rounded-md border border-gold-200 z-20 backdrop-blur-sm">
                  DEFAULT
                </div>
              )}

              <TemplatePreviewImage src={previewSrc} alt={`${template.name} template preview`} />

              {/* Info bar below image */}
              <div className="px-3 py-2.5 bg-white">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-charcoal truncate">
                    {template.name}
                  </h4>
                  {recommendation && (
                    <span className={`px-2 py-0.5 text-[9px] font-medium rounded-md whitespace-nowrap flex-shrink-0 ${recStyle}`}>
                      {recommendation}
                    </span>
                  )}
                </div>

                {/* Set as Default / Default indicator */}
                {onSetDefault && !isDefault && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSetDefault(template.id);
                    }}
                    className="mt-1.5 w-full text-[10px] font-medium text-warm-gray hover:text-gold-600 hover:bg-gold-50 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    Set as Default
                  </button>
                )}
                {isDefault && (
                  <div className="mt-1.5 w-full text-[10px] font-medium text-gold-600 py-1 text-center">
                    Your Default
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}
