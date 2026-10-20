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
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function GermanATSTemplate({ data, template, photoUrl, mode }: Props) {
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
        ...rootBox(template.id, mode),
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
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '16px',
                fontSize: '10pt',
                color: germanColors.textLight,
              }}
            >
              {data.personal.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Mail style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                  <span>{data.personal.email}</span>
                </div>
              )}
              {data.personal.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Phone style={{ width: '12px', height: '12px', color: germanColors.primary }} />
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
                    <MapPin style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                    <span>{parts.join(', ')}</span>
                  </div>
                );
              })()}
              {data.personal.linkedIn && (
                <a href={data.personal.linkedIn} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
                  <Linkedin style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                  <span>LinkedIn</span>
                </a>
              )}
              {data.personal.github && (
                <a href={data.personal.github} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
                  <Github style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                  <span>GitHub</span>
                </a>
              )}
              {data.personal.portfolio && (
                <a href={data.personal.portfolio} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
                  <Globe style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                  <span>Portfolio</span>
                </a>
              )}
              {data.personal.website && (
                <a href={data.personal.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
                  <Globe style={{ width: '12px', height: '12px', color: germanColors.primary }} />
                  <span>{uiText(data, 'websiteLabel')}</span>
                </a>
              )}
            </div>
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
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
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
          <section style={{ marginBottom: '18px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
                <div className="cv-entry" key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                    <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: germanColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: germanColors.textLight }}>
                      {formatDateRange(data, exp)}
                    </span>
                  </div>
                  <p style={{ fontSize: '10pt', fontWeight: '600', marginBottom: '6px', color: germanColors.primary }}>
                    {exp.company}
                    {exp.location && <span style={{ color: germanColors.textLight }}> | {exp.location}</span>}
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
          <section style={{ marginBottom: '18px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
          <section style={{ marginBottom: '18px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
          <section style={{ marginBottom: '18px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
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
                letterSpacing: '1.5px',
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

        {/* Signature Line - German standard (controlled by data.signature.includeSignature) */}
        {data.signature?.includeSignature && (
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: `1px solid ${germanColors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <p style={{ fontSize: '10pt', color: germanColors.textLight, marginBottom: '4px' }}>
                  {data.signature?.city || (uiText(data, 'cityLabel'))}, {data.signature?.date || (uiText(data, 'dateLabel'))}
                </p>
                <div style={{ width: '120px', borderBottom: `1px solid ${germanColors.text}` }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10pt', color: germanColors.textLight, marginBottom: '4px' }}>
                  {uiText(data, 'signatureLabel')}
                </p>
                <div style={{ width: '150px', borderBottom: `1px solid ${germanColors.text}` }} />
              </div>
            </div>
          </div>
        )}
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
        {(data.skills.length > 0 || data.languages.length > 0) && (
          <div style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>
            {/* Grouped skills by category with Languages integrated - max 5 per category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.skills.map((group, groupIdx) => (
                <div key={groupIdx} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div 
                    style={{ 
                      fontSize: '10pt',
                      fontWeight: 'bold',
                      color: germanColors.text,
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
                          color: germanColors.text,
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
                      color: germanColors.text,
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
                          color: germanColors.text,
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
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {sectionHeading(data, 'certifications')}
            </h2>
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
          </div>
        )}
      </aside>
      </div>
    </div>
  );
}
