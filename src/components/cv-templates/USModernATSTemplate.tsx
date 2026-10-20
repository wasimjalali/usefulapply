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
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';


interface Props {
  data: CVData;
  template: CVTemplate;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function USModernATSTemplate({ data, template, mode }: Props) {
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
        ...rootBox(template.id, mode),
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
        <div 
          style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '16px',
            fontSize: '10pt',
            color: modernColors.textLight,
          }}
        >
          {data.personal.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>{data.personal.email}</span>
            </div>
          )}
          {data.personal.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>{data.personal.phone}</span>
            </div>
          )}
          {(data.personal.address || data.personal.city || data.personal.country) && (() => {
            const parts: string[] = [];
            if (data.personal.address) {
              parts.push(data.personal.address);
              if (data.personal.city && !data.personal.address.toLowerCase().includes(data.personal.city.toLowerCase())) parts.push(data.personal.city);
              if (data.personal.country && !data.personal.address.toLowerCase().includes(data.personal.country.toLowerCase())) parts.push(data.personal.country);
            } else {
              if (data.personal.city) parts.push(data.personal.city);
              if (data.personal.country) parts.push(data.personal.country);
            }
            return (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>{parts.join(', ')}</span>
              </div>
            );
          })()}
          {data.personal.linkedIn && (
            <a href={data.personal.linkedIn} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Linkedin style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a href={data.personal.github} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Github style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a href={data.personal.portfolio} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Globe style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>Portfolio</span>
            </a>
          )}
          {data.personal.website && (
            <a href={data.personal.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Globe style={{ width: '12px', height: '12px', color: modernColors.primary }} />
              <span>Website</span>
            </a>
          )}
        </div>
      </header>

      {/* FULL-WIDTH PROFESSIONAL SUMMARY - Critical for ATS */}
      {data.summary && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
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
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
                <div className="cv-entry" key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: modernColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: modernColors.textLight }}>
                      {formatDateRange(data, exp)}
                    </span>
                  </div>
                  <p style={{ fontSize: '10pt', fontWeight: '500', marginBottom: '6px', color: modernColors.primary }}>
                    {exp.company}
                    {exp.location && <span style={{ color: modernColors.textLight }}> | {exp.location}</span>}
                  </p>
                  {/* Explicit bullet characters for PDF compatibility */}
                  {exp.bullets.length > 0 && (
                    <div style={{ marginTop: '4px', marginLeft: '4px' }}>
                      {exp.bullets.map((bullet, idx) => (
                        <div 
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
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
          <section style={{ marginBottom: '20px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
                letterSpacing: '1px',
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
                letterSpacing: '1.5px',
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
        {(data.skills.length > 0 || data.languages.length > 0) && (
          <div style={{ marginBottom: '24px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>
            {/* Grouped skills by category - max 5 per category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.skills.map((group, groupIdx) => (
                <div key={groupIdx} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div 
                    style={{ 
                      fontSize: '10pt',
                      fontWeight: 'bold',
                      color: modernColors.text,
                      marginBottom: '4px',
                    }}
                  >
                    {group.category}:
                  </div>
                  <div style={{ marginLeft: '8px' }}>
                    {group.items.map((skill, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: '6px',
                          fontSize: '10pt',
                          lineHeight: 1.3,
                          marginBottom: '2px',
                          color: modernColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>•</span>
                        <span style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>{skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Languages as final category within Core Competencies */}
              {data.languages.length > 0 && (
                <div style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div 
                    style={{ 
                      fontSize: '10pt',
                      fontWeight: 'bold',
                      color: modernColors.text,
                      marginBottom: '4px',
                    }}
                  >
                    {sectionHeading(data, 'languages')}:
                  </div>
                  <div style={{ marginLeft: '8px' }}>
                    {data.languages.map((lang, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: '6px',
                          fontSize: '10pt',
                          lineHeight: 1.3,
                          marginBottom: '2px',
                          color: modernColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>•</span>
                        <span style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                          <strong>{lang.language}{lang.proficiency ? ':' : ''}</strong>{lang.proficiency ? ` ${lang.proficiency}` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Certifications in Sidebar */}
        {data.certifications.length > 0 && (
          <div>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              {sectionHeading(data, 'certifications')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.certifications.map((cert) => (
                <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                  <div style={{ fontWeight: '500', color: modernColors.text }}>{cert.name}</div>
                  {cert.issuer && (
                    <div style={{ fontSize: '10pt', color: modernColors.textLight }}>{cert.issuer}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}
