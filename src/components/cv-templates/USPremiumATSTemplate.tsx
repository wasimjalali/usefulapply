/**
 * US Premium ATS Template
 * 
 * PREMIUM FEATURES:
 * - Optimized for ATS parsing (95%+ compatibility)
 * - Clean, professional typography
 * - Strategic keyword placement
 * - Quality score integration
 * - Print-optimized layout
 * 
 * CHARACTER LIMITS (2026 Standards):
 * - Headline: 120-220 chars
 * - Summary: 500-700 chars
 * - Skills: 12-20 skills
 * - Bullets: 75-160 chars each
 */

import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { sectionHeading, formatDateRange, formatSingleDate, uiText } from '@/lib/cv-templates/locale';
import { SkillGrid } from './shared';
import { Mail, Phone, MapPin, Linkedin, Globe, Github, Award } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
  qualityScore?: number;
  matchScore?: number;
  showScores?: boolean;
  photoUrl?: string;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

export function USPremiumATSTemplate({ data, template, qualityScore, matchScore, showScores = false, photoUrl, mode }: Props) {
  const { colors } = template;
  
  // 2026 Premium "Trust" Palette - Navy, clean, executive
  const premiumColors = {
    primary: '#0F3057',      // Deep Navy - Trust & Authority
    accent: '#0F3057',       // Same navy for consistency
    text: '#1A1A1A',         // Almost Black - softer than pure black
    textLight: '#4a5568',    // Muted grey for secondary text
    headerBg: '#FFFFFF',     // Clean white background
    border: '#0F3057',       // Navy borders
    highlight: '#f0f4f8',    // Very light blue-grey for skill pills
  };

  return (
    <div 
      className="cv-template us-premium-ats bg-white shadow-lg mx-auto print:shadow-none"
      style={{ 
        fontFamily: "'Arimo', 'Arial', 'Helvetica', sans-serif",  // 2026: Clean sans-serif body
        color: premiumColors.text,
        lineHeight: 1.2,  // 2026: Tighter line spacing (1.15-1.2)
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        ...rootBox(template.id, mode),
        fontVariantLigatures: 'none',
      }}
    >
      {/* Quality/Match Score Badge (only shown in preview, not print) */}
      {mode !== 'print' && showScores && (qualityScore || matchScore) && (
        <div className="print:hidden absolute top-4 right-4 flex gap-2">
          {matchScore && (
            <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
              <span className="text-xs font-medium text-blue-700">
                Match: {matchScore}%
              </span>
            </div>
          )}
          {qualityScore && (
            <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-full">
              <span className="text-xs font-medium text-green-700">
                Quality: {qualityScore}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Header - Clean, ATS-optimized with 2026 Navy theme */}
      <header style={{ paddingBottom: '16px', borderBottom: `2px solid ${premiumColors.primary}`, marginBottom: '20px' }}>
        <h1 
          style={{ 
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",  // 2026: Serif headers for authority
            fontSize: '28px',
            fontWeight: 'bold',
            letterSpacing: '-0.5px',
            marginBottom: '4px',
            color: premiumColors.primary,
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Headline */}
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '16px',
              fontWeight: 500,
              marginBottom: '16px',
              color: premiumColors.primary,
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}
        
        {/* Contact Info - Single line for ATS */}
        <div 
          style={{ 
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: '16px',
            rowGap: '4px',
            fontSize: '10pt',
            color: premiumColors.textLight,
          }}
        >
          {data.personal.email && (
            <a 
              href={`mailto:${data.personal.email}`} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Mail style={{ width: '14px', height: '14px' }} />
              <span>{data.personal.email}</span>
            </a>
          )}
          {data.personal.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Phone style={{ width: '14px', height: '14px' }} />
              <span>{data.personal.phone}</span>
            </span>
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <MapPin style={{ width: '14px', height: '14px' }} />
                <span>{parts.join(', ')}</span>
              </span>
            );
          })()}
          {data.personal.linkedIn && (
            <a 
              href={data.personal.linkedIn} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Linkedin style={{ width: '14px', height: '14px' }} />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a 
              href={data.personal.github} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Github style={{ width: '14px', height: '14px' }} />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a 
              href={data.personal.portfolio} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Globe style={{ width: '14px', height: '14px' }} />
              <span>Portfolio</span>
            </a>
          )}
          {data.personal.website && (
            <a 
              href={data.personal.website} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Globe style={{ width: '14px', height: '14px' }} />
              <span>Website</span>
            </a>
          )}
        </div>
      </header>

      <div style={{ marginTop: '20px' }}>
        {/* Professional Summary - Critical for ATS */}
        {data.summary && (
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'summary')}
            </h2>
            <p 
              style={{ 
                fontSize: '10pt',
                lineHeight: 1.5,
                color: premiumColors.text,
              }}
            >
              {data.summary}
            </p>
          </section>
        )}

        {/* Core Competencies / Skills - 2026: 3-Column Grid with Languages integrated */}
        {(data.skills.length > 0 || data.languages.length > 0) && (
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'skills')}
            </h2>
          <SkillGrid
            data={data}
            primary={premiumColors.primary}
            text={premiumColors.text}
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
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'experience')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data.experience.map((exp, idx) => (
                <div className="cv-entry" key={exp.id || idx}>
                  {/* Role Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <h3 
                      style={{ 
                        fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                        fontSize: '10.5pt',
                        fontWeight: 'bold',
                        color: premiumColors.text,
                      }}
                    >
                      {exp.position}
                    </h3>
                    <span 
                      style={{ 
                        fontSize: '10pt',
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        marginLeft: '16px',
                        color: premiumColors.textLight,
                      }}
                    >
                      {formatDateRange(data, exp)}
                    </span>
                  </div>
                  
                  {/* Company */}
                  <p 
                    style={{ 
                      fontSize: '10pt',
                      fontWeight: '500',
                      marginBottom: '8px',
                      color: premiumColors.accent,
                    }}
                  >
                    {exp.company}
                    {exp.location && (
                      <span style={{ color: premiumColors.textLight }}> | {exp.location}</span>
                    )}
                  </p>
                  
                  {/* Bullets - Explicit bullet characters for PDF compatibility */}
                  {exp.bullets.length > 0 && (
                    <div style={{ marginTop: '6px', marginLeft: '4px' }}>
                      {exp.bullets.map((bullet, bulletIdx) => (
                        <div 
                          key={bulletIdx} 
                          style={{ 
                            display: 'flex',
                            alignItems: 'flex-start',
                            breakInside: 'avoid',
                            gap: '8px',
                            fontSize: '10pt',
                            lineHeight: 1.4,
                            marginBottom: '4px',
                            color: premiumColors.text,
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
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'education')}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu, idx) => (
                <div className="cv-entry" key={edu.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 
                      style={{ 
                        fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                        fontSize: '10.5pt',
                        fontWeight: '600',
                        color: premiumColors.text,
                      }}
                    >
                      {edu.degree}
                      {edu.field && <span style={{ fontWeight: 'normal' }}> {uiText(data, 'degreeConnector')} {edu.field}</span>}
                    </h3>
                    <p 
                      style={{ 
                        fontSize: '10pt',
                        color: premiumColors.textLight,
                      }}
                    >
                      {edu.institution}
                      {edu.grade && <span> • {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span 
                      style={{ 
                        fontSize: '10pt',
                        whiteSpace: 'nowrap',
                        marginLeft: '16px',
                        color: premiumColors.textLight,
                      }}
                    >
                      {formatSingleDate(data, edu.endDate)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'certifications')}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '6px' }}>
              {data.certifications.map((cert, idx) => (
                <div 
                  key={cert.id || idx} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    fontSize: '10pt' 
                  }}
                >
                  <Award 
                    style={{ 
                      width: '14px', 
                      height: '14px', 
                      flexShrink: 0,
                      color: premiumColors.accent,
                    }}
                  />
                  <span style={{ color: premiumColors.text }}>
                    {cert.name}
                    {cert.issuer && (
                      <span style={{ color: premiumColors.textLight }}> ({cert.issuer})</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Languages section REMOVED - now integrated into Core Competencies grid above */}

        {/* Projects */}
        {data.projects && data.projects.length > 0 && (
          <section style={{ marginBottom: '16px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
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
                <div key={project.id} style={{ fontSize: '10pt', lineHeight: 1.5, color: premiumColors.textLight, marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '10pt', color: premiumColors.text }}>{project.name}</span>
                  {showDescription && <span>: {description}</span>}
                  {project.technologies && project.technologies.length > 0 && (
                    <span style={{ fontSize: '10pt', color: premiumColors.accent }}> ({project.technologies.join(', ')})</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {sectionHeading(data, 'additionalInfo')}
            </h2>
            <div style={{ fontSize: '10pt', color: premiumColors.text }}>
              {data.additionalInfo.map((item, idx) => (
                <span key={idx}>
                  {item}
                  {idx < data.additionalInfo!.length - 1 && ' • '}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Custom Sections (generic fallback for achievements, references, volunteer, publications, etc.) */}
        {data.customSections && data.customSections.length > 0 && data.customSections.map((section) => (
          <section key={section.id} style={{ marginBottom: '20px' }}>
            <h2
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '10.5pt',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              {section.title}
            </h2>
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
              {section.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '10pt', color: premiumColors.text, marginBottom: '3px', lineHeight: 1.5 }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
