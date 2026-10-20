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
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { SkillGrid } from './shared';
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';

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
        lineHeight: 1.15,
        color: executiveColors.text,
        backgroundColor: 'white',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        ...rootBox(template.id, mode),
        fontVariantLigatures: 'none',
      }}
    >
      {/* Header - Name and Contact */}
      <header style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: `2px solid ${executiveColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
            fontSize: '28px',
            fontWeight: 'bold',
            color: executiveColors.primary,
            marginBottom: '4px',
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
              marginBottom: '16px',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}

        {/* Contact Info - Single line */}
        <div 
          style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '16px',
            fontSize: '10pt',
            color: executiveColors.textLight,
          }}
        >
          {data.personal.email && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Mail style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
              <span>{data.personal.email}</span>
            </div>
          )}
          {data.personal.phone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
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
                <MapPin style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
                <span>{parts.join(', ')}</span>
              </div>
            );
          })()}
          {data.personal.linkedIn && (
            <a href={data.personal.linkedIn} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Linkedin style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a href={data.personal.github} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Github style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a href={data.personal.portfolio} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Globe style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
              <span>Portfolio</span>
            </a>
          )}
          {data.personal.website && (
            <a href={data.personal.website} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'inherit', textDecoration: 'none' }}>
              <Globe style={{ width: '12px', height: '12px', color: executiveColors.primary }} />
              <span>Website</span>
            </a>
          )}
        </div>
      </header>

      {/* Executive Summary - Shaded box */}
      {data.summary && (
        <section 
          style={{ 
            marginBottom: '18px',
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
              marginBottom: '8px',
            }}
          >
            {sectionHeading(data, 'summary')}
          </h2>
          <p style={{ fontSize: '10pt', lineHeight: 1.5, color: executiveColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Core Competencies - 2026: 3-Column Grid with Languages integrated */}
      {(data.skills.length > 0 || data.languages.length > 0) && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '12px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'skills')}
          </h2>
          <SkillGrid
            data={data}
            primary={executiveColors.primary}
            text={executiveColors.text}
            columnGap={20}
            rowGap={12}
            labelMarginBottom={6}
            labelLetterSpacing="0.4px"
            itemGap={3}
            bulletGap={6}
            lineHeight={1.4}
            languagesAfter={2}
          />
        </section>
      )}

      {/* Professional Experience */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '14px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'experience')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {data.experience.map((exp) => (
              <div className="cv-entry" key={exp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
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
                <p 
                  style={{ 
                    fontSize: '10pt',
                    fontWeight: '500',
                    marginBottom: '8px',
                    color: executiveColors.primary,
                  }}
                >
                  {exp.company}
                  {exp.location && <span style={{ color: executiveColors.textLight }}> | {exp.location}</span>}
                </p>
                {/* Explicit bullet characters for PDF compatibility */}
                {exp.bullets.length > 0 && (
                  <div style={{ marginTop: '6px', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: '8px',
                          fontSize: '10pt',
                          lineHeight: 1.5,
                          marginBottom: '4px',
                          color: executiveColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0, marginTop: '2px' }}>•</span>
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
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'education')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
        <section style={{ marginBottom: '14px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {sectionHeading(data, 'certifications')}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '4px' }}>
            {data.certifications.map((cert) => (
              <div className="cv-entry" key={cert.id} style={{ fontSize: '10pt' }}>
                <span style={{ fontWeight: '500', color: executiveColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: executiveColors.textLight }}> ({cert.issuer})</span>}
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
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
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
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 1.5, color: executiveColors.textLight, marginBottom: '4px' }}>
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
        <section style={{ marginTop: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
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
        <section key={section.id} style={{ marginTop: '24px' }}>
          <h2
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10.5pt',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {section.title}
          </h2>
          <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
            {section.items.map((item, idx) => (
              <li key={idx} style={{ fontSize: '10pt', color: executiveColors.text, marginBottom: '3px', lineHeight: 1.5 }}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
