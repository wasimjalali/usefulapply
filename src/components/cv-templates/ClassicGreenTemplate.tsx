'use client';

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
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
}

export function ClassicGreenTemplate({ data, template }: Props) {
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
        width: '8.5in',
        minHeight: '11in',
        backgroundColor: 'white',
        padding: '0.5in 0.75in',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '12px',
        lineHeight: 1.2,
        color: greenColors.text,
      }}
    >
      {/* HEADER — Clean, ATS-optimized */}
      <header style={{ marginBottom: '20px', paddingBottom: '14px', borderBottom: `1.5px solid ${greenColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: '26px',
            fontWeight: 'bold',
            color: greenColors.primary,
            marginBottom: '4px',
            letterSpacing: '-0.3px',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: '500',
              color: greenColors.textLight,
              marginBottom: '10px',
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
            columnGap: '16px',
            rowGap: '4px',
            fontSize: '12px',
            color: greenColors.textLight,
          }}
        >
          {data.personal.email && (
            <a 
              href={`mailto:${data.personal.email}`} 
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: greenColors.textLight, textDecoration: 'none' }}
            >
              <Mail style={{ width: '12px', height: '12px', color: greenColors.primary }} />
              <span>{data.personal.email}</span>
            </a>
          )}
          {data.personal.phone && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <Phone style={{ width: '12px', height: '12px', color: greenColors.primary }} />
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
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <MapPin style={{ width: '12px', height: '12px', color: greenColors.primary }} />
                <span>{parts.join(', ')}</span>
              </span>
            );
          })()}
          {data.personal.linkedIn && (
            <a 
              href={data.personal.linkedIn} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: greenColors.textLight, textDecoration: 'none' }}
            >
              <Linkedin style={{ width: '12px', height: '12px', color: greenColors.primary }} />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a 
              href={data.personal.github} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: greenColors.textLight, textDecoration: 'none' }}
            >
              <Github style={{ width: '12px', height: '12px', color: greenColors.primary }} />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a 
              href={data.personal.portfolio} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: greenColors.textLight, textDecoration: 'none' }}
            >
              <Globe style={{ width: '12px', height: '12px', color: greenColors.primary }} />
              <span>Portfolio</span>
            </a>
          )}
          {data.personal.website && (
            <a 
              href={data.personal.website} 
              target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '5px', color: greenColors.textLight, textDecoration: 'none' }}
            >
              <Globe style={{ width: '12px', height: '12px', color: greenColors.primary }} />
              <span>Website</span>
            </a>
          )}
        </div>
      </header>

      {/* PROFESSIONAL SUMMARY — Left-border accent */}
      {data.summary && (
        <section 
          style={{ 
            marginBottom: '20px',
            paddingLeft: '14px',
            borderLeft: `3px solid ${greenColors.summaryBorder}`,
          }}
        >
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '6px',
            }}
          >
            {data.sectionHeaders?.summary || 'PROFESSIONAL SUMMARY'}
          </h2>
          <p style={{ fontSize: '12px', lineHeight: 1.5, color: greenColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* CORE COMPETENCIES — 3-Column Grid with Languages */}
      {(data.skills.length > 0 || data.languages.length > 0) && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {data.sectionHeaders?.skills || 'CORE COMPETENCIES'}
          </h2>
          <div 
            style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'flex-start', 
              gap: '18px',
            }}
          >
            {data.skills.slice(0, 2).map((group, groupIdx) => (
              <div key={groupIdx} style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: greenColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '5px', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                  }}
                >
                  {group.category}
                </h4>
                <div style={{ margin: 0 }}>
                  {group.items.slice(0, 5).map((skill, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        fontSize: '12px',
                        lineHeight: 1.4,
                        marginBottom: '2px',
                        color: greenColors.text,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>•</span>
                      <span>{skill}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Languages Column */}
            {data.languages.length > 0 && (
              <div style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: greenColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '5px', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.8px',
                  }}
                >
                  {data.sectionHeaders?.languages || 'LANGUAGES'}
                </h4>
                <div style={{ margin: 0 }}>
                  {data.languages.map((lang, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '6px',
                        fontSize: '12px',
                        lineHeight: 1.4,
                        marginBottom: '2px',
                        color: greenColors.text,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>•</span>
                      <span>
                        <strong>{lang.language}:</strong> {lang.proficiency}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Additional skill categories (3rd-5th) */}
          {data.skills.length > 2 && (
            <div 
              style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                justifyContent: 'flex-start', 
                gap: '18px',
                marginTop: '10px',
              }}
            >
              {data.skills.slice(2, 5).map((group, groupIdx) => (
                <div key={groupIdx} style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                  <h4 
                    style={{ 
                      color: greenColors.primary, 
                      fontWeight: 700, 
                      fontSize: '10px', 
                      marginBottom: '5px', 
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                    }}
                  >
                    {group.category}
                  </h4>
                  <div style={{ margin: 0 }}>
                    {group.items.slice(0, 5).map((skill, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          fontSize: '12px',
                          lineHeight: 1.4,
                          marginBottom: '2px',
                          color: greenColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>•</span>
                        <span>{skill}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* PROFESSIONAL EXPERIENCE */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '10px',
              paddingBottom: '8px',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {data.sectionHeaders?.experience || 'PROFESSIONAL EXPERIENCE'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {data.experience.map((exp) => (
              <div key={exp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
                  <h3 
                    style={{ 
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: greenColors.text,
                    }}
                  >
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: greenColors.textLight, marginLeft: '16px' }}>
                    {exp.startDate} – {exp.current ? (data.localizedStrings?.present || 'Present') : exp.endDate}
                  </span>
                </div>
                <p 
                  style={{ 
                    fontSize: '12px',
                    fontWeight: '500',
                    marginBottom: '6px',
                    color: greenColors.accent,
                  }}
                >
                  {exp.company}
                  {exp.location && <span style={{ color: greenColors.textLight }}> | {exp.location}</span>}
                </p>
                {exp.bullets.length > 0 && (
                  <div style={{ marginTop: '4px', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          fontSize: '12px',
                          lineHeight: 1.4,
                          marginBottom: '3px',
                          color: greenColors.text,
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
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {data.sectionHeaders?.education || 'EDUCATION'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.education.map((edu) => (
              <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 
                    style={{ 
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      fontSize: '13px',
                      fontWeight: '600',
                      color: greenColors.text,
                    }}
                  >
                    {edu.degree}
                    {edu.field && <span style={{ fontWeight: 'normal' }}> {data.localizedStrings?.degreeConnector || 'in'} {edu.field}</span>}
                  </h3>
                  <p style={{ fontSize: '12px', color: greenColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {data.localizedStrings?.gradePrefix || 'GPA:'} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap', marginLeft: '16px', color: greenColors.textLight }}>
                    {edu.endDate}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* CERTIFICATIONS */}
      {data.certifications.length > 0 && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {data.sectionHeaders?.certifications || 'CERTIFICATIONS'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '4px' }}>
            {data.certifications.map((cert) => (
              <div key={cert.id} style={{ fontSize: '12px' }}>
                <span style={{ fontWeight: '500', color: greenColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: greenColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ADDITIONAL INFORMATION */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: greenColors.primary,
              marginBottom: '8px',
              paddingBottom: '8px',
              borderBottom: `1.5px solid ${greenColors.primary}`,
            }}
          >
            {data.sectionHeaders?.additionalInfo || 'ADDITIONAL INFORMATION'}
          </h2>
          <div style={{ fontSize: '12px', color: greenColors.text }}>
            {data.additionalInfo.map((item, idx) => (
              <span key={idx}>
                {item}
                {idx < data.additionalInfo!.length - 1 && ' • '}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
