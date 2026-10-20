'use client';

import { CVData, CVTemplate, CV_TEMPLATE_DEFINITIONS, getTemplateById } from '@/lib/cv-templates/types';
import { USPremiumATSTemplate } from './USPremiumATSTemplate';
import { GermanATSTemplate } from './GermanATSTemplate';
import { GermanClassicTemplate } from './GermanClassicTemplate';
import { ClassicGreenTemplate } from './ClassicGreenTemplate';
import { CvTemplateSwitch } from './render';

export { CV_TEMPLATE_DEFINITIONS, getTemplateById };
export type { CVData, CVTemplate };

// Export premium template for direct use
export { USPremiumATSTemplate, GermanATSTemplate, GermanClassicTemplate, ClassicGreenTemplate };

interface CVTemplateRendererProps {
  data: CVData;
  templateId: string;
}

/**
 * CV Template Renderer, the canvas side. The template switch itself lives in
 * ./render so the server can render the same components for the PDF export.
 * 1. premium-ats - Default, best for most applications
 * 2. modern-professional - Tech/startups
 * 3. executive - Senior roles
 * 4. german-ats - German market (two-column with photo)
 * 5. german-classic - German market (single-column with photo)
 * 6. classic-green - English market, forest green accent
 */
export function CVTemplateRenderer({ data, templateId }: CVTemplateRendererProps) {
  return <CvTemplateSwitch data={data} templateId={templateId} />;
}
