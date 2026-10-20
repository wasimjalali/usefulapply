/**
 * German Classic Template
 *
 * SINGLE-COLUMN layout with photo support — better ATS compatibility.
 * All section headers are language-agnostic — they come from
 * data.sectionHeaders (AI output) with English fallback defaults.
 * - Photo placeholder (standard for EU CVs)
 * - A4 size (210mm x 297mm)
 * - Signature line support
 * - CEFR language levels
 * 
 * COLOR: Charcoal/Anthracite #374151 — neutral, professional, distinct from
 * the slate-blue German ATS template
 * 
 * ATS COMPLIANCE (2026):
 * - Fonts: Arial (body) + Georgia (headers) — system fonts, 10/10 ATS
 * - Body: 11px, Headers: 13px, Name: 24px — within recommended ranges
 * - Single-column layout — maximum ATS parseability
 * - Standard bullet points (•)
 * - No tables, text boxes, or skill bars
 * - Margins: 0.5in top/bottom, 0.75in left/right
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { formatBirthDate } from '@/lib/cv-templates/birthdate';
import { ContactRows, LanguageLine, SignatureBlock, SkillLines, stackGap } from './shared';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function GermanClassicTemplate({ data, template, photoUrl, mode }: Props) {
  // 2026 Design: Charcoal/Anthracite palette — professional & neutral
  const classicColors = {
    primary: '#374151',      // Charcoal — neutral, professional
    text: '#1A1A1A',         // Near-black for body
    textLight: '#4B5563',    // Medium grey for secondary
    accent: '#374151',       // Charcoal for highlights
    border: '#D1D5DB',       // Light grey border
    photoBorder: '#9CA3AF',  // Medium grey for photo border
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
        color: classicColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* HEADER WITH PHOTO — Single-column, ATS-optimized, Photo Top-Right (German Standard) */}
      <header style={{ marginBottom: 'calc(20px * var(--cv-d, 1))', paddingBottom: 'calc(16px * var(--cv-d, 1))', borderBottom: `2px solid ${classicColors.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'calc(20px * var(--cv-d, 1))' }}>
          {/* Name + Contact */}
          <div style={{ flex: 1 }}>
            <h1 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '24px',
                fontWeight: 'bold',
                color: classicColors.primary,
                marginBottom: 'calc(4px * var(--cv-d, 1))',
              }}
            >
              {data.personal.fullName || 'Your Name'}
            </h1>
            {data.personal.currentTitle && (
              <p 
                style={{ 
                  fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                  fontSize: '10.5pt',
                  fontWeight: '600',
                  color: classicColors.textLight,
                  marginBottom: 'calc(16px * var(--cv-d, 1))',
                }}
              >
                {data.personal.currentTitle}
              </p>
            )}

            {/* Contact Info — Inline for ATS */}
            <ContactRows data={data} iconSize={11} iconColor={classicColors.primary} iconGap={5} textColor={classicColors.textLight} columnGap={14} rowGap={4} />
            {/* Date of Birth & Nationality — standard for German CVs */}
            {(data.personal.dateOfBirth || data.personal.nationality) && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 'calc(14px * var(--cv-d, 1))',
                  fontSize: '10pt',
                  color: classicColors.textLight,
                  marginTop: 'calc(6px * var(--cv-d, 1))',
                }}
              >
                {data.personal.dateOfBirth && (
                  <span><strong style={{ color: classicColors.primary }}>{uiText(data, 'dateOfBirthLabel')}:</strong> {formatBirthDate(data)}</span>
                )}
                {data.personal.nationality && (
                  <span><strong style={{ color: classicColors.primary }}>{uiText(data, 'nationalityLabel')}:</strong> {data.personal.nationality}</span>
                )}
              </div>
            )}
          </div>

          {/* Photo, top right, German CV standard 3.5 x 4.7 cm. With no photo nothing is drawn, on screen
              as in the PDF, so the header does not move. The canvas toolbar offers "Add photo". */}
          {photoUrl && (
            <div
              style={{
                width: '35mm',
                height: '47mm',
                flexShrink: 0,
                border: `0.5px solid ${classicColors.photoBorder}`,
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
        </div>
      </header>

      {/* PROFESSIONAL SUMMARY */}
      {data.summary && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: classicColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* CORE COMPETENCIES — 3-Column Grid with Languages */}
      {data.skills.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'skills')}
          </h2>
          <SkillLines data={data} primary={classicColors.primary} text={classicColors.text} gap={6} lineHeight={1.3} />
        </section>
      )}

      {/* PROFESSIONAL EXPERIENCE */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(10px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'experience')}
          </h2>
          <div className="cv-stack" style={stackGap(14)}>
            {data.experience.map((exp) => (
              <div className="cv-exp" key={exp.id}>
                <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'calc(2px * var(--cv-d, 1))' }}>
                  <h3 style={{ fontSize: '10pt', fontWeight: 'bold', color: classicColors.text }}>
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: classicColors.textLight }}>
                    {formatDateRange(data, exp)}
                  </span>
                </div>
                <p className="cv-entry-head" style={{ fontSize: '10pt', fontWeight: '600', marginBottom: 'calc(5px * var(--cv-d, 1))', color: classicColors.primary }}>
                  {exp.company}
                  {exp.location && <span style={{ color: classicColors.textLight }}> | {exp.location}</span>}
                </p>
                {exp.bullets.length > 0 && (
                  <div className="cv-bullets" style={{ marginTop: 'calc(3px * var(--cv-d, 1))', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div className="cv-bullet"
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: 'calc(7px * var(--cv-d, 1))',
                          fontSize: '10pt',
                          lineHeight: 'calc(1.4 * var(--cv-ld, 1))',
                          marginBottom: 'calc(2px * var(--cv-d, 1))',
                          color: classicColors.text,
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
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'education')}
          </h2>
          <div className="cv-stack" style={stackGap(8)}>
            {data.education.map((edu) => (
              <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 style={{ fontSize: '10pt', fontWeight: '600', color: classicColors.text }}>
                    {edu.degree}{edu.field && `, ${edu.field}`}
                  </h3>
                  <p style={{ fontSize: '10pt', color: classicColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: classicColors.textLight }}>
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
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'certifications')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '20px', rowGap: 'calc(4px * var(--cv-d, 1))' }}>
            {data.certifications.map((cert) => (
              <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                <span style={{ fontWeight: '500', color: classicColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: classicColors.textLight }}> ({cert.issuer})</span>}
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
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'languages')}
          </h2>
          <LanguageLine data={data} text={classicColors.text} lineHeight={1.4} />
        </section>
      )}

      {/* PROJECTS */}
      {data.projects && data.projects.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
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
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: classicColors.textLight, marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                <span style={{ fontWeight: 600, fontSize: '10pt', color: classicColors.text }}>{project.name}</span>
                {showDescription && <span>: {description}</span>}
                {project.technologies && project.technologies.length > 0 && (
                  <span style={{ fontSize: '10pt', color: classicColors.primary }}> ({project.technologies.join(', ')})</span>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* ADDITIONAL INFORMATION */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginBottom: 'calc(14px * var(--cv-d, 1))' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: 'calc(6px * var(--cv-d, 1))',
              paddingBottom: 'calc(8px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'additionalInfo')}
          </h2>
          <p style={{ fontSize: '10pt', color: classicColors.text }}>
            {data.additionalInfo.join(' • ')}
          </p>
        </section>
      )}

      {/* Custom Sections (generic fallback) */}
      {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
        <section key={section.id} style={{ marginBottom: 'calc(18px * var(--cv-d, 1))' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: 'calc(8px * var(--cv-d, 1))',
              paddingBottom: 'calc(6px * var(--cv-d, 1))',
              borderBottom: `2px solid ${classicColors.primary}`,
              color: classicColors.primary,
            }}
          >
            {section.title}
          </h2>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
            {section.items.map((item, idx) => (
              <li key={idx} style={{ fontSize: '10pt', color: classicColors.text, marginBottom: 'calc(3px * var(--cv-d, 1))', lineHeight: 'calc(1.5 * var(--cv-ld, 1))' }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <SignatureBlock data={data} color={classicColors.textLight} lineColor={classicColors.text} />
    </div>
  );
}
