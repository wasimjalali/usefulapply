/**
 * US Professional Template (Executive Impact)
 * Used for: us-executive (C-Suite, VPs, Directors)
 * 
 * CHARACTER LIMITS (2026 Standards - Design for MAXIMUM):
 * - Headline/Tagline: 150-180 chars (design for 180 max)
 * - Professional Summary: 600-800 chars / 80-120 words (design for 800 chars)
 * - Skills: 12-20 skills in 3-5 categories, 300-400 chars total (design for 20 skills)
 * - Experience Bullets: 5-8 per role, 80-180 chars each (design for 8 bullets × 180 chars)
 * - Education: 150-250 chars per degree (design for 250 chars)
 * - Certifications: 3-6 certs, 80-150 chars each (design for 6 certs)
 * - Languages: 2-4 languages, 40-80 chars each (design for 4 languages)
 * 
 * PAGE BUDGET: 2,800-3,700 chars page 1 | Total: 5,500-7,700 chars (2+ pages)
 * ATS SCORE: 90%
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { ContactRows, LanguageLine, SkillLines, stackGap } from './shared';

interface Props {
  data: CVData;
  template: CVTemplate;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function USProfessionalTemplate({ data, template, mode }: Props) {
  // 2026 Design Refresh: Executive palette
  const executiveColors = {
    primary: '#702459',      // Burgundy accent
    text: '#1A1A1A',         // Near-black for body
    textLight: '#4A5568',    // Muted grey for secondary
    accent: '#702459',       // Burgundy for highlights
    summaryBg: '#FAF5F7',    // Light pink-tinted background for summary
    border: '#702459',       // Burgundy borders
  };
  
  return (
    <div 
      className="cv-template"
      style={{ 
        fontFamily: "'Arimo', 'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '10pt',
        lineHeight: 'calc(1.15 * var(--cv-ld, 1))',
        color: executiveColors.text,
        backgroundColor: 'white',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* Header - Name and Contact */}
      <header style={{ marginBottom: 'calc(18px * var(--cv-d, 1))', paddingBottom: 'calc(16px * var(--cv-d, 1))', borderBottom: `2px solid ${executiveColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
            fontSize: '28px',
            fontWeight: 'bold',
            color: executiveColors.primary,
            marginBottom: 'calc(4px * var(--cv-d, 1))',
            letterSpacing: '0.5px',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Title */}
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: '600',
              color: executiveColors.textLight,
              marginBottom: 'calc(16px * var(--cv-d, 1))',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}

        {/* Contact Info - Single line */}
        <ContactRows data={data} iconSize={12} iconColor={executiveColors.primary} iconGap={6} textColor={executiveColors.textLight} columnGap={16} rowGap={4} />
      </header>

      {/* Executive Summary - Shaded box */}
      {data.summary && (
        <section 
          style={{ 
            marginBottom: 'calc(18px * var(--cv-d, 1))',
            padding: '16px 20px',
            backgroundColor: executiveColors.summaryBg,
            borderLeft: `3px solid ${executiveColors.primary}`,
          }}
        >
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: executiveColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Core Competencies - 2026: 3-Column Grid with Languages integrated */}
      {data.skills.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(12px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'skills')}
          </h2>
          <SkillLines data={data} primary={executiveColors.primary} text={executiveColors.text} gap={6} lineHeight={1.4} />
        </section>
      )}

      {/* Professional Experience */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(14px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'experience')}
          </h2>
          <div className="cv-stack" style={stackGap(18)}>
            {data.experience.map((exp) => (
              <div className="cv-exp" key={exp.id}>
                <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                  <h3 
                    style={{ 
                      fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                      fontSize: '10.5pt',
                      fontWeight: 'bold',
                      color: executiveColors.text,
                    }}
                  >
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: executiveColors.textLight }}>
                    {formatDateRange(data, exp)}
                  </span>
                </div>
                <p className="cv-entry-head" 
                  style={{ 
                    fontSize: '10pt',
                    fontWeight: '500',
                    marginBottom: 'calc(8px * var(--cv-d, 1))',
                    color: executiveColors.primary,
                  }}
                >
                  {exp.company}
                  {exp.location && <span style={{ color: executiveColors.textLight }}> | {exp.location}</span>}
                </p>
                {/* Explicit bullet characters for PDF compatibility */}
                {exp.bullets.length > 0 && (
                  <div className="cv-bullets" style={{ marginTop: 'calc(6px * var(--cv-d, 1))', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div className="cv-bullet"
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: 'calc(8px * var(--cv-d, 1))',
                          fontSize: '10pt',
                          lineHeight: 'calc(1.5 * var(--cv-ld, 1))',
                          marginBottom: 'calc(4px * var(--cv-d, 1))',
                          color: executiveColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0, marginTop: 'calc(2px * var(--cv-d, 1))' }}>•</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {data.education.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'education')}
          </h2>
          <div className="cv-stack" style={stackGap(8)}>
            {data.education.map((edu) => (
              <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 
                    style={{ 
                      fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                      fontSize: '10.5pt',
                      fontWeight: '600',
                      color: executiveColors.text,
                    }}
                  >
                    {edu.degree}{edu.field && ` ${uiText(data, 'degreeConnector')} ${edu.field}`}
                  </h3>
                  <p style={{ fontSize: '10pt', color: executiveColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: executiveColors.textLight }}>
                    {formatSingleDate(data, edu.endDate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications - Languages section REMOVED (now integrated into Core Competencies grid) */}
      {data.certifications.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'certifications')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: 'calc(4px * var(--cv-d, 1))' }}>
            {data.certifications.map((cert) => (
              <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                <span style={{ fontWeight: '500', color: executiveColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: executiveColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.languages.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'languages')}
          </h2>
          <LanguageLine data={data} text={executiveColors.text} lineHeight={1.4} />
        </section>
      )}

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'projects')}
          </h2>
          {/* One line per project keeps the section short; a description
              that just repeats the name is dropped. */}
          {data.projects.map((project) => {
            const description = project.description?.trim();
            const showDescription = Boolean(description && description.toLowerCase() !== project.name.trim().toLowerCase());
            return (
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: executiveColors.textLight, marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                <span style={{ fontWeight: 600, color: executiveColors.text }}>{project.name}</span>
                {showDescription && <span>: {description}</span>}
                {project.technologies && project.technologies.length > 0 && (
                  <span style={{ fontSize: '10pt', color: executiveColors.primary }}> ({project.technologies.join(', ')})</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Additional Information */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginTop: 'calc(24px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'additionalInfo')}
          </h2>
          <p style={{ fontSize: '10pt', color: executiveColors.text }}>
            {data.additionalInfo.join(' • ')}
          </p>
        </section>
      )}

      {/* Custom Sections (generic fallback) */}
      {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
        <section key={section.id} style={{ marginTop: 'calc(24px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 'calc(10px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {section.title}
          </h2>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
            {section.items.map((item, idx) => (
              <li key={idx} style={{ fontSize: '10pt', color: executiveColors.text, marginBottom: 'calc(3px * var(--cv-d, 1))', lineHeight: 'calc(1.5 * var(--cv-ld, 1))' }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
