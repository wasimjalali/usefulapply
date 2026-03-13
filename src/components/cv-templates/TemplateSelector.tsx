'use client';

import { CV_TEMPLATE_DEFINITIONS } from '@/lib/cv-templates/types';
import { Check, FileText, Sparkles, Briefcase, Star, Globe, Leaf, User } from 'lucide-react';

interface TemplateSelectorProps {
  selectedTemplateId: string;
  onSelect: (templateId: string) => void;
  defaultTemplateId?: string;
  onSetDefault?: (templateId: string) => void;
}

/**
 * Template Selector - 6 Templates (4 English + 2 German)
 */
export function TemplateSelector({ selectedTemplateId, onSelect, defaultTemplateId, onSetDefault }: TemplateSelectorProps) {
  const getTemplateIcon = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return Star;
      case 'modern-professional': return Sparkles;
      case 'executive': return Briefcase;
      case 'german-ats': return Globe;
      case 'german-classic': return User;
      case 'classic-green': return Leaf;
      default: return FileText;
    }
  };

  const getTemplateRecommendation = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return 'Recommended for most jobs';
      case 'modern-professional': return 'Best for tech & startups';
      case 'executive': return 'Best for senior roles';
      case 'german-ats': return 'For German job market';
      case 'german-classic': return 'German CV, single-column';
      case 'classic-green': return 'Fresh design, all industries';
      default: return '';
    }
  };

  const getTemplateGradient = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return 'bg-gradient-to-br from-navy-600 to-navy-800';
      case 'modern-professional': return 'bg-gradient-to-br from-navy-500 to-navy-700';
      case 'executive': return 'bg-gradient-to-br from-navy-700 to-navy-900';
      case 'german-ats': return 'bg-gradient-to-br from-navy-600 to-navy-700';
      case 'german-classic': return 'bg-gradient-to-br from-gray-600 to-gray-800';
      case 'classic-green': return 'bg-gradient-to-br from-emerald-600 to-emerald-800';
      default: return 'bg-gradient-to-br from-navy-500 to-navy-700';
    }
  };

  const getRecommendationStyle = (templateId: string) => {
    switch (templateId) {
      case 'premium-ats': return 'bg-gold-50 text-gold-700 border border-gold-200';
      case 'modern-professional': return 'bg-navy-50 text-navy-600 border border-navy-100';
      case 'executive': return 'bg-navy-50 text-navy-600 border border-navy-100';
      case 'german-ats': return 'bg-navy-50 text-navy-600 border border-navy-100';
      case 'german-classic': return 'bg-gray-50 text-gray-600 border border-gray-200';
      case 'classic-green': return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
      default: return 'bg-cream-100 text-warm-gray';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-charcoal">Choose Template</span>
        <span className="text-[10px] text-warm-gray">ATS-Optimized • 6 Templates</span>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {CV_TEMPLATE_DEFINITIONS.map((template) => {
          const Icon = getTemplateIcon(template.id);
          const isSelected = selectedTemplateId === template.id;
          const recommendation = getTemplateRecommendation(template.id);
          const isDefault = template.id === (defaultTemplateId || 'premium-ats');
          const gradient = getTemplateGradient(template.id);
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
                <div className="absolute top-2 right-2 w-5 h-5 bg-gold-500 rounded-full flex items-center justify-center shadow-sm">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
              
              {/* Default Badge */}
              {isDefault && !isSelected && (
                <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-gold-50 text-gold-600 text-[9px] font-semibold rounded-md border border-gold-200">
                  DEFAULT
                </div>
              )}
              
              {/* Template Preview */}
              <div 
                className={`w-full h-16 rounded-lg mb-3 flex items-center justify-center ${gradient} group-hover:opacity-90 transition-opacity`}
              >
                <Icon className={`w-6 h-6 ${isDefault ? 'text-gold-300' : 'text-white/90'}`} />
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
                  ✓ Your Default
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
