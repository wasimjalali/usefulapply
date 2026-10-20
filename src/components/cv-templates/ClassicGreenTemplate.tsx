/**
 * Classic Green Template
 * 
 * SINGLE-COLUMN layout for US/UK/Canada English-speaking markets.
 * Distinctive Forest Green accent color — professional for all industries
 * including finance, consulting, healthcare, sustainability, and tech.
 * 
 * COLOR: Forest Green #2D6A4F — professional, calming, distinctive from
 * existing navy/teal/burgundy/slate-blue templates. Excellent contrast on white.
 * 
 * DESIGN DIFFERENTIATORS:
 * - Subtle left-border accent on summary section (not shaded box)
 * - Thinner 1.5px section dividers (vs 2px in other templates)
 * - Slightly wider letter-spacing on section headers for elegance
 * - Skills displayed as inline comma-separated (space-efficient)
 * 
 * ATS COMPLIANCE (2026):
 * - Fonts: Arial (body) + Georgia (headers) — system fonts, 10/10 ATS
 * - Body: 12px, Headers: 14px, Name: 26px — within recommended ranges
 * - Single-column layout — maximum ATS parseability
 * - Standard bullet points (•)
 * - No tables, text boxes, or skill bars
 * - Margins: 0.5in top/bottom, 0.75in left/right
 * - Colors: dark enough for 4.5:1+ contrast ratio on white
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { sectionHeading, formatDateRange, formatSingleDate, degreeText, uiText } from '@/lib/cv-templates/locale';
import { ContactRows, LanguageLine, SkillLines, stackGap } from './shared';

interface Props {
  data: CVData;
  template: CVTemplate;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function ClassicGreenTemplate({ data, template, mode }: Props) {
  // 2026 Design: Forest Green palette — professional & distinctive
  const greenColors = {
    primary: '#2D6A4F',      // Forest Green — calm, professional
    text: '#1A1A1A',         // Near-black for body
    textLight: '#4B5563',    // Medium grey for secondary
    accent: '#2D6A4F',       // Forest Green for highlights
    summaryBorder: '#2D6A4F', // Left border on summary
    border: '#D1D5DB',       // Light grey border
    skillBg: '#ECFDF5',      // Very light green tint for skill pills
  };

  return (
    <div 
      className="cv-template"
      style={{ 
        backgroundColor: 'white',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arimo', 'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '10pt',
        lineHeight: 'calc(1.2 * var(--cv-ld, 1))',
        color: greenColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* HEADER — Clean, ATS-optimized */}
      <header style={{ marginBottom: 'calc(20px * var(--cv-d, 1))', paddingBottom: 'calc(14px * var(--cv-d, 1))', borderBottom: `1.5px solid ${greenColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
            fontSize: '26px',
            fontWeight: 'bold',
            color: greenColors.primary,
            marginBottom: 'calc(4px * var(--cv-d, 1))',
            letterSpacing: '-0.3px',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: '500',
              color: greenColors.textLight,
              marginBottom: 'calc(16px * var(--cv-d, 1))',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}

        {/* Contact Info — Inline for ATS */}
        <ContactRows data={data} iconSize={12} iconColor={greenColors.primary} iconGap={5} textColor={greenColors.textLight} columnGap={16} rowGap={4} />
      </header>

      {/* PROFESSIONAL SUMMARY — Left-border accent */}
      {data.summary && (
        <section 
          style={{ 
            marginBottom: 'calc(20px * var(--cv-d, 1))',
            paddingLeft: '14px',
            borderLeft: `3px solid ${greenColors.summaryBorder}`,
          }}
        >
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: greenColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* CORE COMPETENCIES — 3-Column Grid with Languages */}
      {data.skills.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          
          <SkillLines heading={<h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(10px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {sectionHeading(data, 'skills')}
          </h2>} data={data} primary={greenColors.primary} text={greenColors.text} gap={6} lineHeight={1.4} />
        </section>
      )}

      {/* PROFESSIONAL EXPERIENCE */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(10px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {sectionHeading(data, 'experience')}
          </h2>
          <div className="cv-stack" style={stackGap(16)}>
            {data.experience.map((exp) => (
              <div className={exp.bullets.length <= 3 ? 'cv-exp cv-exp-short' : 'cv-exp'} key={exp.id}>
                <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'calc(3px * var(--cv-d, 1))' }}>
                  <h3 
                    style={{ 
                      fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                      fontSize: '10.5pt',
                      fontWeight: 'bold',
                      color: greenColors.text,
                    }}
                  >
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: greenColors.textLight, marginLeft: '16px' }}>
                    {formatDateRange(data, exp)}
                  </span>
                </div>
                <p className="cv-entry-head" 
                  style={{ 
                    fontSize: '10pt',
                    fontWeight: '500',
                    marginBottom: 'calc(6px * var(--cv-d, 1))',
                    color: greenColors.accent,
                  }}
                >
                  {exp.company}
                  {exp.location && <span style={{ color: greenColors.textLight }}> | {exp.location}</span>}
                </p>
                {exp.bullets.length > 0 && (
                  <div className="cv-bullets" style={{ marginTop: 'calc(4px * var(--cv-d, 1))', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div className="cv-bullet"
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: 'calc(8px * var(--cv-d, 1))',
                          fontSize: '10pt',
                          lineHeight: 'calc(1.4 * var(--cv-ld, 1))',
                          marginBottom: 'calc(3px * var(--cv-d, 1))',
                          color: greenColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0, marginTop: 'calc(1px * var(--cv-d, 1))' }}>•</span>
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

      {/* EDUCATION */}
      {data.education.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
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
                      color: greenColors.text,
                    }}
                  >
                    {edu.degree}
                    {edu.field && <span style={{ fontWeight: 'normal' }}>{degreeText(data, edu).slice(edu.degree.trim().length)}</span>}
                  </h3>
                  <p style={{ fontSize: '10pt', color: greenColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', marginLeft: '16px', color: greenColors.textLight }}>
                    {formatSingleDate(data, edu.endDate)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CERTIFICATIONS */}
      {data.certifications.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {sectionHeading(data, 'certifications')}
          </h2>
          <div className="cv-stack" style={stackGap(4)}>
            {data.certifications.map((cert) => (
              <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                <span style={{ fontWeight: '500', color: greenColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: greenColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.languages.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {sectionHeading(data, 'languages')}
          </h2>
          <LanguageLine data={data} text={greenColors.text} lineHeight={1.4} />
        </section>
      )}

      {/* PROJECTS */}
      {data.projects && data.projects.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
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
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: greenColors.textLight, marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                <span style={{ fontWeight: 600, color: greenColors.text }}>{project.name}</span>
                {showDescription && <span>: {description}</span>}
                {project.technologies && project.technologies.length > 0 && (
                  <span style={{ fontSize: '10pt', color: greenColors.accent }}> ({project.technologies.join(', ')})</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ADDITIONAL INFORMATION */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: greenColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {sectionHeading(data, 'additionalInfo')}
          </h2>
          <div style={{ fontSize: '10pt', color: greenColors.text }}>
            {data.additionalInfo.map((item, idx) => (
              <span key={idx}>
                {item}
                {idx < data.additionalInfo!.length - 1 && ' • '}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Custom Sections (generic fallback) */}
      {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
        <section key={section.id} style={{ marginBottom: 'calc(20px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(6px * var(--cv-d, 1))',
              borderBottom: `1.5px solid ${greenColors.primary}`,
              color: greenColors.primary,
            }}
          >
            {section.title}
          </h2>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
            {section.items.map((item, idx) => (
              <li key={idx} style={{ fontSize: '10pt', color: greenColors.text, marginBottom: 'calc(3px * var(--cv-d, 1))', lineHeight: 'calc(1.5 * var(--cv-ld, 1))' }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
