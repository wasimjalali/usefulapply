'use client';

import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';
import { Check } from 'lucide-react';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  defaultTemplateId?: string;
  onSetDefault?: (templateId: string) => void;
}

/**
 * Mini CV preview thumbnail — shows realistic document layout structure per template.
 * Pure CSS shapes: colored header bars, text lines, section blocks, photo placeholders.
 */
function TemplateThumbnail({ templateId, colors }: { templateId: string; colors: { primary: string; accent: string; headerBg: string } }) {
  const line = (w: string, opacity = 0.35) => (
    <div className="rounded-full" style={{ height: 2, width: w, backgroundColor: colors.primary, opacity }} />
  );
  const sectionTitle = (w: string) => (
    <div className="rounded-full mb-0.5" style={{ height: 2.5, width: w, backgroundColor: colors.accent, opacity: 0.7 }} />
  );
  const gap = <div className="h-1" />;

  // Premium ATS — single column, subtle header, skills bar, experience blocks
  if (templateId === 'premium-ats') {
    return (
      <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-0.5">
        {/* Header area */}
        <div className="rounded px-1 py-1.5" style={{ backgroundColor: colors.headerBg }}>
          <div className="rounded-full mb-0.5" style={{ height: 3.5, width: '60%', backgroundColor: colors.primary, opacity: 0.8 }} />
          <div className="flex gap-1">
            {line('30%', 0.25)}
            {line('25%', 0.25)}
          </div>
        </div>
        {gap}
        {/* Summary */}
        {line('95%', 0.2)}
        {line('80%', 0.2)}
        {gap}
        {/* Skills */}
        {sectionTitle('25%')}
        <div className="flex gap-0.5 flex-wrap">
          {['18%', '22%', '16%', '20%', '14%'].map((w, i) => (
            <div key={i} className="rounded-full" style={{ height: 3, width: w, backgroundColor: colors.accent, opacity: 0.15 }} />
          ))}
        </div>
        {gap}
        {/* Experience */}
        {sectionTitle('30%')}
        {line('70%', 0.3)}
        {line('90%', 0.15)}
        {line('85%', 0.15)}
        {gap}
        {line('65%', 0.3)}
        {line('88%', 0.15)}
        {line('75%', 0.15)}
      </div>
    );
  }

  // Modern Professional — single column, sky-blue accent line, tech-clean
  if (templateId === 'modern-professional') {
    return (
      <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-0.5">
        {/* Name with accent underline */}
        <div className="rounded-full" style={{ height: 4, width: '55%', backgroundColor: colors.primary, opacity: 0.8 }} />
        <div className="rounded-full" style={{ height: 1.5, width: '40%', backgroundColor: colors.accent, opacity: 0.6 }} />
        <div className="flex gap-1 mt-0.5">
          {line('22%', 0.2)}
          {line('28%', 0.2)}
          {line('18%', 0.2)}
        </div>
        {gap}
        {/* Skills grid */}
        {sectionTitle('22%')}
        <div className="grid grid-cols-3 gap-0.5">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="rounded-sm" style={{ height: 3, backgroundColor: colors.accent, opacity: 0.12 }} />
          ))}
        </div>
        {gap}
        {/* Experience */}
        {sectionTitle('30%')}
        {line('65%', 0.3)}
        {line('92%', 0.15)}
        {line('88%', 0.15)}
        {gap}
        {sectionTitle('28%')}
        {line('60%', 0.3)}
        {line('90%', 0.15)}
      </div>
    );
  }

  // Executive — dark header block, gold accent, serif feel, achievement-focused
  if (templateId === 'executive') {
    return (
      <div className="w-full h-full bg-white rounded flex flex-col">
        {/* Dark executive header */}
        <div className="rounded-t px-2 py-2" style={{ backgroundColor: colors.primary }}>
          <div className="rounded-full mb-0.5" style={{ height: 4, width: '50%', backgroundColor: '#fff', opacity: 0.9 }} />
          <div className="rounded-full" style={{ height: 2, width: '35%', backgroundColor: colors.accent, opacity: 0.8 }} />
        </div>
        <div className="flex-1 p-2 flex flex-col gap-0.5">
          {/* Summary */}
          {line('95%', 0.2)}
          {line('88%', 0.2)}
          {line('70%', 0.2)}
          {gap}
          {/* Experience with gold accent */}
          <div className="rounded-full mb-0.5" style={{ height: 2.5, width: '30%', backgroundColor: colors.accent, opacity: 0.7 }} />
          <div className="rounded-full" style={{ height: 1, width: '100%', backgroundColor: colors.accent, opacity: 0.15 }} />
          {line('60%', 0.35)}
          {line('92%', 0.15)}
          {line('85%', 0.15)}
          {gap}
          {line('55%', 0.35)}
          {line('90%', 0.15)}
          {line('80%', 0.15)}
        </div>
      </div>
    );
  }

  // German ATS — two-column layout with photo placeholder on the right
  if (templateId === 'german-ats') {
    return (
      <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-0.5">
        {/* Header with photo */}
        <div className="flex gap-1.5">
          <div className="flex-1">
            <div className="rounded-full mb-0.5" style={{ height: 3.5, width: '80%', backgroundColor: colors.primary, opacity: 0.8 }} />
            <div className="rounded-full" style={{ height: 2, width: '60%', backgroundColor: colors.primary, opacity: 0.3 }} />
            {line('50%', 0.2)}
          </div>
          {/* Photo placeholder */}
          <div className="w-7 h-8 rounded-sm flex-shrink-0" style={{ backgroundColor: colors.primary, opacity: 0.12 }}>
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: colors.primary, opacity: 0.25 }} />
            </div>
          </div>
        </div>
        {gap}
        {/* Two-column content */}
        <div className="flex gap-1.5 flex-1">
          <div className="flex-1 flex flex-col gap-0.5">
            {sectionTitle('40%')}
            {line('90%', 0.15)}
            {line('85%', 0.15)}
            {line('75%', 0.15)}
            {gap}
            {sectionTitle('45%')}
            {line('88%', 0.15)}
            {line('92%', 0.15)}
          </div>
          <div className="w-[35%] flex flex-col gap-0.5">
            {sectionTitle('60%')}
            {line('90%', 0.15)}
            {line('80%', 0.15)}
            {gap}
            {sectionTitle('55%')}
            {line('85%', 0.15)}
            {line('75%', 0.15)}
          </div>
        </div>
      </div>
    );
  }

  // German Classic — single column with photo, charcoal, clean serif feel
  if (templateId === 'german-classic') {
    return (
      <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-0.5">
        {/* Header with photo centered */}
        <div className="flex items-start gap-1.5">
          {/* Photo placeholder */}
          <div className="w-6 h-7 rounded-sm flex-shrink-0" style={{ backgroundColor: colors.primary, opacity: 0.12 }}>
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors.primary, opacity: 0.25 }} />
            </div>
          </div>
          <div className="flex-1">
            <div className="rounded-full mb-0.5" style={{ height: 3.5, width: '70%', backgroundColor: colors.primary, opacity: 0.8 }} />
            <div className="flex gap-0.5">
              {line('35%', 0.25)}
              {line('30%', 0.25)}
            </div>
          </div>
        </div>
        {gap}
        {/* Sections with separator lines */}
        {sectionTitle('28%')}
        <div className="rounded-full" style={{ height: 0.5, width: '100%', backgroundColor: colors.primary, opacity: 0.1 }} />
        {line('90%', 0.15)}
        {line('85%', 0.15)}
        {gap}
        {sectionTitle('32%')}
        <div className="rounded-full" style={{ height: 0.5, width: '100%', backgroundColor: colors.primary, opacity: 0.1 }} />
        {line('65%', 0.3)}
        {line('92%', 0.15)}
        {line('80%', 0.15)}
        {gap}
        {sectionTitle('25%')}
        <div className="rounded-full" style={{ height: 0.5, width: '100%', backgroundColor: colors.primary, opacity: 0.1 }} />
        {line('55%', 0.3)}
        {line('88%', 0.15)}
      </div>
    );
  }

  // Classic Green — single column, green accent bars, serif headings
  if (templateId === 'classic-green') {
    return (
      <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-0.5">
        {/* Header with green underline */}
        <div className="rounded-full" style={{ height: 4, width: '50%', backgroundColor: colors.primary, opacity: 0.8 }} />
        <div className="rounded-full" style={{ height: 1.5, width: '100%', backgroundColor: colors.accent, opacity: 0.25 }} />
        <div className="flex gap-1 mt-0.5">
          {line('25%', 0.2)}
          {line('22%', 0.2)}
        </div>
        {gap}
        {/* Summary */}
        {line('95%', 0.18)}
        {line('82%', 0.18)}
        {gap}
        {/* Experience with green section bars */}
        <div className="flex items-center gap-1 mb-0.5">
          <div className="rounded-full" style={{ height: 2.5, width: '30%', backgroundColor: colors.accent, opacity: 0.7 }} />
          <div className="flex-1 rounded-full" style={{ height: 0.5, backgroundColor: colors.accent, opacity: 0.2 }} />
        </div>
        {line('60%', 0.3)}
        {line('92%', 0.15)}
        {line('85%', 0.15)}
        {gap}
        <div className="flex items-center gap-1 mb-0.5">
          <div className="rounded-full" style={{ height: 2.5, width: '28%', backgroundColor: colors.accent, opacity: 0.7 }} />
          <div className="flex-1 rounded-full" style={{ height: 0.5, backgroundColor: colors.accent, opacity: 0.2 }} />
        </div>
        {line('55%', 0.3)}
        {line('90%', 0.15)}
      </div>
    );
  }

  // Fallback
  return (
    <div className="w-full h-full bg-white rounded p-2 flex flex-col gap-1">
      <div className="rounded-full" style={{ height: 4, width: '50%', backgroundColor: colors.primary, opacity: 0.6 }} />
      {line('90%', 0.2)}
      {line('80%', 0.2)}
    </div>
  );
}

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
    case 'premium-ats': return 'bg-gold-50 text-gold-700 border border-gold-200';
    case 'modern-professional': return 'bg-sky-50 text-sky-700 border border-sky-200';
    case 'executive': return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'german-ats': return 'bg-navy-50 text-navy-600 border border-navy-100';
    case 'german-classic': return 'bg-gray-50 text-gray-600 border border-gray-200';
    case 'classic-green': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    default: return 'bg-cream-100 text-warm-gray';
  }
};

/**
 * Template Selector - 6 Templates (4 English + 2 German)
 */
export function TemplateSelector({ selectedTemplateId, onSelect, defaultTemplateId, onSetDefault }: TemplateSelectorProps) {
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-charcoal">Choose Template</span>
        <span className="text-[10px] text-warm-gray">ATS-Optimized &middot; 6 Templates</span>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CV_TEMPLATE_DEFINITIONS.map((template) => {
          const isSelected = selectedTemplateId === template.id;
          const recommendation = getTemplateRecommendation(template.id);
          const isDefault = template.id === (defaultTemplateId || 'premium-ats');
          const recStyle = getRecommendationStyle(template.id);

          return (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={`relative p-3 rounded-xl border-2 transition-all text-left cursor-pointer group ${
                isSelected
                  ? 'border-gold-400 bg-white ring-2 ring-gold-100 shadow-md'
                  : 'border-cream-200 bg-white hover:border-navy-200 hover:shadow-sm'
              }`}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-gold-500 rounded-full flex items-center justify-center shadow-sm z-10">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}

              {/* Default Badge */}
              {isDefault && !isSelected && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gold-50 text-gold-600 text-[9px] font-semibold rounded-md border border-gold-200 z-10">
                  DEFAULT
                </div>
              )}

              {/* CV Preview Thumbnail */}
              <div className={`w-full h-24 rounded-lg mb-3 border transition-all overflow-hidden ${
                isSelected ? 'border-gold-200 shadow-sm' : 'border-cream-200 group-hover:border-navy-100 group-hover:shadow-sm'
              }`} style={{ backgroundColor: '#f8f9fb' }}>
                <TemplateThumbnail
                  templateId={template.id}
                  colors={template.colors}
                />
              </div>

              {/* Template Info */}
              <h4 className="text-sm font-semibold text-charcoal truncate">
                {template.name}
              </h4>
              <p className="text-[10px] text-warm-gray mt-0.5 line-clamp-2 leading-relaxed">
                {template.description}
              </p>

              {/* Recommendation Tag */}
              {recommendation && (
                <div className="mt-2">
                  <span className={`px-2 py-0.5 text-[9px] font-medium rounded-md ${recStyle}`}>
                    {recommendation}
                  </span>
                </div>
              )}

              {/* Set as Default */}
              {onSetDefault && !isDefault && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDefault(template.id);
                  }}
                  className="mt-2 w-full text-[10px] font-medium text-warm-gray hover:text-gold-600 hover:bg-gold-50 py-1 rounded-md transition-colors cursor-pointer"
                >
                  Set as Default
                </button>
              )}
              {isDefault && (
                <div className="mt-2 w-full text-[10px] font-medium text-gold-600 py-1 text-center">
                  Your Default
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
