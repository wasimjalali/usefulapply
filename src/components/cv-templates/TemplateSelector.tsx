'use client';

import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';
import { Check, FileText, Sparkles, Briefcase, Star, Globe } from 'lucide-react';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
}

/**
 * Template Selector - 4 Templates (3 English + 1 German)
 */
export function TemplateSelector({ selectedTemplateId, onSelect }: TemplateSelectorProps) {
  const getTemplateIcon = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return Star;
      case 'modern-professional': return Sparkles;
      case 'executive': return Briefcase;
      case 'german-ats': return Globe;
      default: return FileText;
    }
  };

  const getTemplateRecommendation = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return 'Recommended for most jobs';
      case 'modern-professional': return 'Best for tech & startups';
      case 'executive': return 'Best for senior roles';
      case 'german-ats': return 'For German job market';
      default: return '';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-warm-gray">Choose Template</span>
        <span className="text-[10px] text-warm-gray">ATS-Optimized • English/Global</span>
      </div>

      {/* Template Grid - 3 templates in a row */}
      <div className="grid grid-cols-3 gap-3">
        {CV_TEMPLATE_DEFINITIONS.map((template) => {
          const Icon = getTemplateIcon(template.id);
          const isSelected = selectedTemplateId === template.id;
          const recommendation = getTemplateRecommendation(template.id);
          const isPremium = template.id === 'premium-ats';
          
          return (
            <button
              key={template.id}
              onClick={() => onSelect(template.id)}
              className={`relative p-3 rounded-lg border-2 transition-all text-left ${
                isSelected 
                  ? 'border-navy-500 bg-navy-50 ring-2 ring-navy-200' 
                  : 'border-cream-200 bg-white hover:border-cream-400'
              }`}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 bg-navy-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              
              {/* Premium Badge */}
              {isPremium && !isSelected && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-medium rounded">
                  DEFAULT
                </div>
              )}
              
              {/* Template Preview */}
              <div 
                className={`w-full h-16 rounded mb-2 flex items-center justify-center ${
                  isPremium ? 'bg-navy-600' : 
                  template.id === 'modern-professional' ? 'bg-sky-500' : 'bg-amber-600'
                }`}
              >
                <Icon className="w-6 h-6 text-white" />
              </div>
              
              {/* Template Info */}
              <h4 className="text-sm font-medium text-charcoal truncate">
                {template.name}
              </h4>
              <p className="text-[10px] text-warm-gray mt-0.5 line-clamp-2">
                {template.description}
              </p>
              
              {/* Recommendation Tag */}
              {recommendation && (
                <div className="mt-2">
                  <span className="px-1.5 py-0.5 text-[9px] rounded bg-green-50 text-green-700">
                    {recommendation}
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
