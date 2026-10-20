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
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { SkillGrid } from './shared';
import { Mail, Phone, MapPin, Linkedin, Globe, Github, User } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
  /** Screen only: opens the place where the photo is set, when none is set yet. */
  onPhotoPlaceholderClick?: () => void;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function GermanClassicTemplate({ data, template, photoUrl, mode, onPhotoPlaceholderClick }: Props) {
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
        lineHeight: 1.2,
        color: classicColors.text,
        ...rootBox(template.id, mode),
        fontVariantLigatures: 'none',
      }}
    >
      {/* HEADER WITH PHOTO — Single-column, ATS-optimized, Photo Top-Right (German Standard) */}
      <header style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: `2px solid ${classicColors.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
          {/* Name + Contact */}
          <div style={{ flex: 1 }}>
            <h1 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '24px',
                fontWeight: 'bold',
                color: classicColors.primary,
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
                  color: classicColors.textLight,
                  marginBottom: '16px',
                }}
              >
                {data.personal.currentTitle}
              </p>
            )}

            {/* Contact Info — Inline for ATS */}
            <div 
              style={{ 
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: '14px',
                fontSize: '10pt',
                color: classicColors.textLight,
              }}
            >
              {data.personal.email && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Mail style={{ width: '11px', height: '11px', color: classicColors.primary }} />
                  <span>{data.personal.email}</span>
                </div>
              )}
              {data.personal.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Phone style={{ width: '11px', height: '11px', color: classicColors.primary }} />
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <MapPin style={{ width: '11px', height: '11px', color: classicColors.primary }} />
                    <span>{parts.join(', ')}</span>
                  </div>
                );
              })()}
              {data.personal.linkedIn && (
                <a href={data.personal.linkedIn} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'inherit', textDecoration: 'none' }}>
                  <Linkedin style={{ width: '11px', height: '11px', color: classicColors.primary }} />
                  <span>LinkedIn</span>
                </a>
              )}
              {data.personal.github && (
                <a href={data.personal.github} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'inherit', textDecoration: 'none' }}>
                  <Github style={{ width: '11px', height: '11px', color: classicColors.primary }} />
                  <span>GitHub</span>
                </a>
              )}
              {data.personal.portfolio && (
                <a href={data.personal.portfolio} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'inherit', textDecoration: 'none' }}>
                  <Globe style={{ width: '11px', height: '11px', color: classicColors.primary }} />
                  <span>Portfolio</span>
                </a>
              )}
              {data.personal.website && (
                <a href={data.personal.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'inherit', textDecoration: 'none' }}>
                  <Globe style={{ width: '11px', height: '11px', color: classicColors.primary }} />
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
                  gap: '14px',
                  fontSize: '10pt',
                  color: classicColors.textLight,
                  marginTop: '6px',
                }}
              >
                {data.personal.dateOfBirth && (
                  <span><strong style={{ color: classicColors.primary }}>{uiText(data, 'dateOfBirthLabel')}:</strong> {data.personal.dateOfBirth}</span>
                )}
                {data.personal.nationality && (
                  <span><strong style={{ color: classicColors.primary }}>{uiText(data, 'nationalityLabel')}:</strong> {data.personal.nationality}</span>
                )}
              </div>
            )}
          </div>

          {/* Photo — Top-right, German CV standard: 3.5cm x 4.7cm. On screen, the empty
              placeholder points at Settings, where the photo lives. The export never
              prints a placeholder and never depends on the settings store. */}
          {(photoUrl || mode !== 'print') && (
            <div
              onClick={photoUrl || mode === 'print' ? undefined : onPhotoPlaceholderClick}
              title={photoUrl || mode === 'print' ? undefined : 'Add your photo in Settings'}
              style={{
                width: '35mm',
                height: '47mm',
                flexShrink: 0,
                border: photoUrl ? `0.5px solid ${classicColors.photoBorder}` : `2px dashed ${classicColors.photoBorder}`,
                borderRadius: '2px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                backgroundColor: photoUrl ? 'transparent' : '#F9FAFB',
                cursor: photoUrl ? undefined : 'pointer',
              }}
            >
              {photoUrl ? (
                <img
                  src={photoUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: '6px' }}>
                  <User style={{ width: '24px', height: '24px', color: classicColors.photoBorder, margin: '0 auto 4px' }} />
                  <span style={{ fontSize: '8px', color: classicColors.textLight }}>{uiText(data, 'photoPlaceholder')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* PROFESSIONAL SUMMARY */}
      {data.summary && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 1.5, color: classicColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* CORE COMPETENCIES — 3-Column Grid with Languages */}
      {(data.skills.length > 0 || data.languages.length > 0) && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'skills')}
          </h2>
          <SkillGrid
            data={data}
            primary={classicColors.primary}
            text={classicColors.text}
            columnGap={16}
            rowGap={16}
            labelMarginBottom={4}
            labelLetterSpacing="0.5px"
            itemGap={2}
            bulletGap={5}
            lineHeight={1.3}
          />
        </section>
      )}

      {/* PROFESSIONAL EXPERIENCE */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'experience')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data.experience.map((exp) => (
              <div className="cv-entry" key={exp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <h3 style={{ fontSize: '10pt', fontWeight: 'bold', color: classicColors.text }}>
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: classicColors.textLight }}>
                    {formatDateRange(data, exp)}
                  </span>
                </div>
                <p style={{ fontSize: '10pt', fontWeight: '600', marginBottom: '5px', color: classicColors.primary }}>
                  {exp.company}
                  {exp.location && <span style={{ color: classicColors.textLight }}> | {exp.location}</span>}
                </p>
                {exp.bullets.length > 0 && (
                  <div style={{ marginTop: '3px', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: '7px',
                          fontSize: '10pt',
                          lineHeight: 1.4,
                          marginBottom: '2px',
                          color: classicColors.text,
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

      {/* EDUCATION */}
      {data.education.length > 0 && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'education')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {sectionHeading(data, 'certifications')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '20px', rowGap: '4px' }}>
            {data.certifications.map((cert) => (
              <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                <span style={{ fontWeight: '500', color: classicColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: classicColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* PROJECTS */}
      {data.projects && data.projects.length > 0 && (
        <section style={{ marginBottom: '14px' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
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
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 1.5, color: classicColors.textLight, marginBottom: '4px' }}>
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
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '8px',
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
        <section key={section.id} style={{ marginBottom: '18px' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '8px',
              paddingBottom: '6px',
              borderBottom: `2px solid ${classicColors.primary}`,
              color: classicColors.primary,
            }}
          >
            {section.title}
          </h2>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
            {section.items.map((item, idx) => (
              <li key={idx} style={{ fontSize: '10pt', color: classicColors.text, marginBottom: '3px', lineHeight: 1.5 }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* SIGNATURE LINE — German standard */}
      {data.signature?.includeSignature && (
        <div style={{ marginTop: '36px', paddingTop: '16px', borderTop: `1px solid ${classicColors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: '10pt', color: classicColors.textLight, marginBottom: '4px' }}>
                {data.signature?.city || (uiText(data, 'cityLabel'))}, {data.signature?.date || (uiText(data, 'dateLabel'))}
              </p>
              <div style={{ width: '120px', borderBottom: `1px solid ${classicColors.text}` }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '10pt', color: classicColors.textLight, marginBottom: '4px' }}>
                {uiText(data, 'signatureLabel')}
              </p>
              <div style={{ width: '150px', borderBottom: `1px solid ${classicColors.text}` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
