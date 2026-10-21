import { CVData, getTemplateById } from '@/lib/cv-templates/types';
import type { CvRenderMode } from '@/lib/cv-templates/print-spec';
import { visibleCvData } from '@/lib/cv-templates/hidden';
import { USPremiumATSTemplate } from './USPremiumATSTemplate';
import { USModernATSTemplate } from './USModernATSTemplate';
import { USProfessionalTemplate } from './USProfessionalTemplate';
import { GermanATSTemplate } from './GermanATSTemplate';
import { GermanClassicTemplate } from './GermanClassicTemplate';
import { ClassicGreenTemplate } from './ClassicGreenTemplate';

/**
 * The template switch with no client-only code, so the server can render it
 * with renderToStaticMarkup for the PDF export. The canvas wraps this in
 * ./index.tsx, which adds the screen-only behaviour.
 */

export interface CvTemplateSwitchProps {
  data: CVData;
  templateId: string;
  mode?: CvRenderMode;
}

export function CvTemplateSwitch({ data: fullData, templateId, mode }: CvTemplateSwitchProps) {
  // Hidden items stay in the CV and are skipped by the canvas and the exports alike.
  const data = visibleCvData(fullData);
  // Any id outside the catalog (legacy ids included) renders as Premium ATS.
  const template = getTemplateById(templateId) ?? getTemplateById('premium-ats');

  if (!template) {
    return <div className="p-8 text-center text-gray-500">Template not found: {templateId}</div>;
  }

  const photoUrl = data.personal?.photoUrl;

  switch (template.id) {
    case 'premium-ats':
      return <USPremiumATSTemplate data={data} template={template} photoUrl={photoUrl} mode={mode} />;
    case 'modern-professional':
      return <USModernATSTemplate data={data} template={template} mode={mode} />;
    case 'executive':
      return <USProfessionalTemplate data={data} template={template} mode={mode} />;
    case 'german-ats':
      return <GermanATSTemplate data={data} template={template} photoUrl={photoUrl} mode={mode} />;
    case 'german-classic':
      return <GermanClassicTemplate data={data} template={template} photoUrl={photoUrl} mode={mode} />;
    case 'classic-green':
      return <ClassicGreenTemplate data={data} template={template} mode={mode} />;
    default:
      return <USPremiumATSTemplate data={data} template={template} mode={mode} />;
  }
}
