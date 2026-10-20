/**
 * US Modern ATS Template
 * 
 * CHARACTER LIMITS (2026 Standards - Design for MAXIMUM):
 * - Headline/Tagline: 120-220 chars (design for 220 max)
 * - Professional Summary: 500-700 chars / 70-110 words (design for 700 chars)
 * - Skills: 12-20 skills in 3-5 categories, 350-450 chars total (design for 20 skills)
 * - Experience Bullets: 4-6 per role, 75-160 chars each (design for 6 bullets × 160 chars)
 * - Education: 150-250 chars per degree (design for 250 chars)
 * - Certifications: 3-6 certs, 80-150 chars each (design for 6 certs)
 * - Languages: 2-4 languages, 40-80 chars each (design for 4 languages)
 * 
 * PAGE BUDGET: 2,400-3,200 chars page 1 | Total: 4,350-6,050 chars (2 pages)
 * ATS SCORE: 95%
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { ContactRows, LanguageLine, SideSection, SkillLines, skillsOverflowSidebar } from './shared';
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';


interface Props {
  data: CVData;
  template: CVTemplate;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function USModernATSTemplate({ data, template, mode }: Props) {
  const wideSkills = skillsOverflowSidebar(data);
  // 2026 Design Refresh: Modern Professional palette
  const modernColors = {
    primary: '#2C7A7B',      // Teal accent
    text: '#1A1A1A',         // Near-black for body
    textLight: '#4A5568',    // Muted grey for secondary
    sidebar: '#F7FAFC',      // Faint grey sidebar
    accent: '#2C7A7B',       // Teal for highlights
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
        fontSize: '10.5pt',
        lineHeight: 1.15,
        color: modernColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* FULL-WIDTH HEADER SECTION - ATS Optimized */}
      <header style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: `2px solid ${modernColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
            fontSize: '22px',
            fontWeight: 'bold',
            color: modernColors.primary,
            marginBottom: '4px',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Title */}
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10pt',
              fontWeight: '500',
              color: modernColors.textLight,
              marginBottom: '16px',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}

        {/* Contact Info - Inline for ATS */}
        <ContactRows data={data} iconSize={12} iconColor={modernColors.primary} iconGap={6} textColor={modernColors.textLight} columnGap={16} rowGap={4} />
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
              color: modernColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${modernColors.primary}`,
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 1.5, color: modernColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Many skills: full width above the columns, so a long list cannot leave sidebar-only pages. */}
      {wideSkills && data.skills.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>
            {/* Grouped skills by category - max 5 per category */}
            <SkillLines data={data} primary={modernColors.text} text={modernColors.text} gap={8} lineHeight={1.35} />
          </div>
        )}

      {/* TWO-COLUMN LAYOUT STARTS HERE */}
      <div
        style={{
          width: '100%',
          display: 'grid',
          gridTemplateColumns: '30% minmax(0, 1fr)',
        }}
      >
      {/* DOM order is main column first, so ATS parsers and screen readers read experience before the sidebar. Grid placement puts the sidebar on the left without changing the reading order. */}
      {/* Main Content - 70% */}
      <main style={{ gridColumn: 2, gridRow: 1, minWidth: 0, padding: '0 0 0 12px' }}>  {/* Zero right padding (outer handles it), small left padding for gap */}
        {/* Professional Experience */}
        {data.experience.length > 0 && (
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'experience')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data.experience.map((exp) => (
                <div className="cv-exp" key={exp.id}>
                  <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: modernColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: modernColors.textLight }}>
                      {formatDateRange(data, exp)}
                    </span>
                  </div>
                  <p className="cv-entry-head" style={{ fontSize: '10pt', fontWeight: '500', marginBottom: '6px', color: modernColors.primary }}>
                    {exp.company}
                    {exp.location && <span style={{ color: modernColors.textLight }}> | {exp.location}</span>}
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
                            color: modernColors.text,
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
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'education')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu) => (
                <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 style={{ fontSize: '10.5pt', fontWeight: '600', color: modernColors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p style={{ fontSize: '10pt', color: modernColors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: modernColors.textLight }}>
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
          <section style={{ marginBottom: '16px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
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
                <div key={project.id} style={{ fontSize: '10pt', lineHeight: 1.5, color: modernColors.textLight, marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '10.5pt', color: modernColors.text }}>{project.name}</span>
                  {showDescription && <span>: {description}</span>}
                  {project.technologies && project.technologies.length > 0 && (
                    <span style={{ fontSize: '10pt', color: modernColors.primary }}> ({project.technologies.join(', ')})</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'additionalInfo')}
            </h2>
            <p style={{ fontSize: '10pt', color: modernColors.text }}>
              {data.additionalInfo.join(' • ')}
            </p>
          </section>
        )}

        {/* Custom Sections (generic fallback) */}
        {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
          <section key={section.id} style={{ marginBottom: '20px' }}>
            <h2
              style={{
                fontSize: '10.5pt',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '10px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${modernColors.accent}`,
                color: modernColors.primary,
              }}
            >
              {section.title}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
              {section.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '10pt', color: modernColors.text, marginBottom: '3px', lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      {/* Left Sidebar - 30% */}
      <aside
        style={{
          gridColumn: 1,
          gridRow: 1,
          minWidth: 0,
          padding: '8px 12px 8px 10px',
          borderRight: `2px solid ${modernColors.primary}`,
          overflow: 'visible',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
        }}
      >
        {/* Core Competencies with Languages integrated - 2026 ATS Best Practice */}
        {!wideSkills && data.skills.length > 0 && (
          <SideSection marginBottom={24} heading={<h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>}>
            {/* Grouped skills by category - max 5 per category */}
            <SkillLines data={data} primary={modernColors.text} text={modernColors.text} gap={8} lineHeight={1.35} />
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
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'languages')}
            </h2>}>
            <LanguageLine data={data} text={modernColors.text} lineHeight={1.35} />
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
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'certifications')}
            </h2>} rows={data.certifications.map((cert, index) => (
                <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt', paddingBottom: index < data.certifications.length - 1 ? '6px' : 0 }}>
                  <div style={{ fontWeight: '500', color: modernColors.text }}>{cert.name}</div>
                  {cert.issuer && (
                    <div style={{ fontSize: '10pt', color: modernColors.textLight }}>{cert.issuer}</div>
                  )}
                </div>
              ))} />
        )}
      </aside>
      </div>
    </div>
  );
}
