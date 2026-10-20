/**
 * German ATS Template
 *
 * A4 two-column layout with photo support.
 * All section headers are language-agnostic — they come from
 * data.sectionHeaders (AI output) with English fallback defaults.
 * When the AI outputs German, headers will be German. When English, English.
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { ContactRows, LanguageLine, SideSection, SignatureBlock, SkillLines, skillsOverflowSidebar } from './shared';
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function GermanATSTemplate({ data, template, photoUrl, mode }: Props) {
  const wideSkills = skillsOverflowSidebar(data);
  // 2026 Design Refresh: German Lebenslauf palette
  const germanColors = {
    primary: '#1E3A5F',      // Refined slate blue - elegant & ATS-safe
    text: '#1A1A1A',         // Near-black for body
    textLight: '#4A5568',    // Muted grey for secondary
    accent: '#1E3A5F',       // Slate blue for highlights
    headerBg: '#F8F9FB',     // Subtle cool-grey sidebar background
    border: '#E2E8F0',       // Light border
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
        lineHeight: 1.2,
        color: germanColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* FULL-WIDTH HEADER SECTION - ATS Optimized, Photo Top-Right (German Standard) */}
      <header style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: `2px solid ${germanColors.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
          {/* Name + Contact (left side) */}
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '24px',
                fontWeight: 'bold',
                color: germanColors.primary,
                marginBottom: '4px',
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
                  color: germanColors.textLight,
                  marginBottom: '16px',
                }}
              >
                {data.personal.currentTitle}
              </p>
            )}

            {/* Contact Info - Inline for ATS */}
            <ContactRows data={data} iconSize={12} iconColor={germanColors.primary} iconGap={6} textColor={germanColors.textLight} columnGap={16} rowGap={4} />
            {/* Date of Birth & Nationality — standard for German CVs */}
            {(data.personal.dateOfBirth || data.personal.nationality) && (
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '16px',
                  fontSize: '10pt',
                  color: germanColors.textLight,
                  marginTop: '6px',
                }}
              >
                {data.personal.dateOfBirth && (
                  <span><strong style={{ color: germanColors.primary }}>{uiText(data, 'dateOfBirthLabel')}:</strong> {data.personal.dateOfBirth}</span>
                )}
                {data.personal.nationality && (
                  <span><strong style={{ color: germanColors.primary }}>{uiText(data, 'nationalityLabel')}:</strong> {data.personal.nationality}</span>
                )}
              </div>
            )}
          </div>

          {/* Photo — Top-right, German CV standard: 3.5cm x 4.7cm */}
          {photoUrl && (
            <div
              style={{
                width: '35mm',
                height: '47mm',
                flexShrink: 0,
                border: `0.5px solid #d0d0d0`,
                borderRadius: '2px',
                overflow: 'hidden',
              }}
            >
              <img
                src={photoUrl}
                alt="Profile Photo"
                style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'crisp-edges' }}
              />
            </div>
          )}
        </div>
      </header>

      {/* FULL-WIDTH PROFESSIONAL SUMMARY - Critical for ATS */}
      {data.summary && (
        <section style={{ marginBottom: '16px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: germanColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${germanColors.primary}`,
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 1.5, color: germanColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Many skills: full width above the columns, so a long list cannot leave sidebar-only pages. */}
      {wideSkills && data.skills.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>
            {/* Grouped skills by category with Languages integrated - max 5 per category */}
            <SkillLines data={data} primary={germanColors.text} text={germanColors.text} gap={8} lineHeight={1.35} />
          </div>
        )}

      {/* TWO-COLUMN LAYOUT STARTS HERE */}
      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '52mm minmax(0, 1fr)',
        }}
      >
      {/* DOM order is main column first, so ATS parsers and screen readers read experience before the sidebar. Grid placement puts the sidebar on the left without changing the reading order. */}
      {/* Main Content */}
      <main style={{ gridColumn: 2, gridRow: 1, minWidth: 0, padding: '0 0 0 12px' }}>  {/* Zero right padding (outer handles it), small left padding for gap */}
        {/* Experience */}
        {data.experience.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '10px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'experience')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.experience.map((exp) => (
                <div className="cv-exp" key={exp.id}>
                  <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                    <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: germanColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: germanColors.textLight }}>
                      {formatDateRange(data, exp)}
                    </span>
                  </div>
                  <p className="cv-entry-head" style={{ fontSize: '10pt', fontWeight: '600', marginBottom: '6px', color: germanColors.primary }}>
                    {exp.company}
                    {exp.location && <span style={{ color: germanColors.textLight }}> | {exp.location}</span>}
                  </p>
                  {/* Explicit bullet characters for PDF compatibility */}
                  {exp.bullets.length > 0 && (
                    <div className={exp.bullets.length <= 3 ? 'cv-bullets cv-bullets-short' : 'cv-bullets'} style={{ marginTop: '4px', marginLeft: '4px' }}>
                      {exp.bullets.map((bullet, idx) => (
                        <div className="cv-bullet"
                          key={idx} 
                          style={{ 
                            display: 'flex',
                            alignItems: 'flex-start',
                            breakInside: 'avoid',
                            gap: '8px',
                            fontSize: '10pt',
                            lineHeight: 1.4,
                            marginBottom: '3px',
                            color: germanColors.text,
                          }}
                        >
                          <span style={{ flexShrink: 0, marginTop: '1px' }}>•</span>
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
          <section style={{ marginBottom: '14px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'education')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu) => (
                <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 style={{ fontSize: '10pt', fontWeight: '600', color: germanColors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p style={{ fontSize: '10pt', color: germanColors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: germanColors.textLight }}>
                      {formatSingleDate(data, edu.endDate)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Projects */}
        {data.projects && data.projects.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
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
                <div key={project.id} style={{ fontSize: '10pt', lineHeight: 1.5, color: germanColors.textLight, marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '10pt', color: germanColors.text }}>{project.name}</span>
                  {showDescription && <span>: {description}</span>}
                  {project.technologies && project.technologies.length > 0 && (
                    <span style={{ fontSize: '10pt', color: germanColors.primary }}> ({project.technologies.join(', ')})</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section style={{ marginBottom: '14px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'additionalInfo')}
            </h2>
            <p style={{ fontSize: '10pt', color: germanColors.text }}>
              {data.additionalInfo.join(' • ')}
            </p>
          </section>
        )}

        {/* Custom Sections (generic fallback) */}
        {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
          <section key={section.id} style={{ marginBottom: '18px' }}>
            <h2
              style={{
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${germanColors.primary}`,
                color: germanColors.primary,
              }}
            >
              {section.title}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
              {section.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '10pt', color: germanColors.text, marginBottom: '3px', lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}

        <SignatureBlock data={data} color={germanColors.textLight} lineColor={germanColors.text} />
      </main>

      {/* Left Sidebar with Photo (Decorative) */}
      <aside
        style={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          padding: '0 12px 0 0',
          borderRight: `2px solid ${germanColors.primary}`,
          overflow: 'visible',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {/* Core Competencies with Languages integrated - 2026 ATS Best Practice */}
        {!wideSkills && data.skills.length > 0 && (
          <SideSection marginBottom={16} heading={<h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>}>
            {/* Grouped skills by category with Languages integrated - max 5 per category */}
            <SkillLines data={data} primary={germanColors.text} text={germanColors.text} gap={8} lineHeight={1.35} />
          </SideSection>
        )}

        {/* Certifications in Sidebar */}
        {data.languages.length > 0 && (
          <SideSection marginBottom={24} heading={<h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'languages')}
            </h2>}>
            <LanguageLine data={data} text={germanColors.text} lineHeight={1.35} />
          </SideSection>
        )}

        {data.certifications.length > 0 && (
          <SideSection marginBottom={0} heading={<h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'certifications')}
            </h2>}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {data.certifications.map((cert) => (
                <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                  <div style={{ fontWeight: 'bold', color: germanColors.text }}>{cert.name}</div>
                  {cert.issuer && (
                    <div style={{ fontSize: '10pt', color: germanColors.textLight }}>{cert.issuer}</div>
                  )}
                </div>
              ))}
            </div>
          </SideSection>
        )}
      </aside>
      </div>
    </div>
  );
}
