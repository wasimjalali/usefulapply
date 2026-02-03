'use client';

import { CVData, CVTemplate, CV_TEMPLATE_DEFINITIONS, getTemplateById } from '@/lib/cv-templates/types';
import { USPremiumATSTemplate } from './USPremiumATSTemplate';
import { USModernATSTemplate } from './USModernATSTemplate';
import { USProfessionalTemplate } from './USProfessionalTemplate';
import { GermanATSTemplate } from './GermanATSTemplate';

export { CV_TEMPLATE_DEFINITIONS, getTemplateById };
export type { CVData, CVTemplate };

// Export premium template for direct use
export { USPremiumATSTemplate, GermanATSTemplate };

interface CVTemplateRendererProps {
  data: CVData;
  templateId: string;
}

/**
 * CV Template Renderer - Consolidated to 3 Premium Templates
 * 1. premium-ats - Default, best for most applications
 * 2. modern-professional - Tech/startups
 * 3. executive - Senior roles
 */
export function CVTemplateRenderer({ data, templateId }: CVTemplateRendererProps) {
  const template = getTemplateById(templateId);
  
  if (!template) {
    // Fallback to premium-ats if template not found
    const defaultTemplate = getTemplateById('premium-ats');
    if (defaultTemplate) {
      return <USPremiumATSTemplate data={data} template={defaultTemplate} />;
    }
    return (
      <div className="p-8 text-center text-gray-500">
        Template not found: {templateId}
      </div>
    );
  }
  
  // Map template IDs to components (4 templates)
  switch (templateId) {
    case 'premium-ats':
      return <USPremiumATSTemplate data={data} template={template} />;
    
    case 'modern-professional':
      return <USModernATSTemplate data={data} template={template} />;
    
    case 'executive':
      return <USProfessionalTemplate data={data} template={template} />;
    
    case 'german-ats':
      return <GermanATSTemplate data={data} template={template} />;
    
    // Legacy template ID fallbacks (for existing users)
    case 'us-premium-ats':
    case 'us-ats-maximizer':
    case 'us-modern-ats':
    case 'us-technical':
    case 'us-classic':
    case 'eu-premium-ats':
    case 'eu-modern-ats':
    case 'eu-classic':
    case 'eu-german-ats':
    case 'eu-german-professional':
      return <USPremiumATSTemplate data={data} template={template} />;
    
    case 'us-executive':
    case 'eu-sidebar':
    case 'us-professional':
    case 'eu-professional':
      return <USProfessionalTemplate data={data} template={template} />;
    
    default:
      return <USPremiumATSTemplate data={data} template={template} />;
  }
}
