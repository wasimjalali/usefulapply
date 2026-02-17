'use client';

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
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
}

export function USProfessionalTemplate({ data, template }: Props) {
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
        width: '8.5in',
        minHeight: '11in',
        fontFamily: "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '12px',
        lineHeight: 1.15,
        color: executiveColors.text,
        backgroundColor: 'white',
        padding: '0.5in 0.75in', // Professional standard: 0.5in top/bottom, 0.75in left/right
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
      }}
    >
      {/* Header - Name and Contact */}
      <header style={{ marginBottom: '24px', paddingBottom: '16px', borderBottom: `2px solid ${executiveColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Georgia', 'Times New Roman', serif",
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
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: '600',
              color: executiveColors.textLight,
              marginBottom: '12px',
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
            fontSize: '12px',
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
            marginBottom: '24px',
            padding: '16px 20px',
            backgroundColor: executiveColors.summaryBg,
            borderLeft: `3px solid ${executiveColors.primary}`,
          }}
        >
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
            }}
          >
            {data.sectionHeaders?.summary || 'EXECUTIVE SUMMARY'}
          </h2>
          <p style={{ fontSize: '12px', lineHeight: 1.5, color: executiveColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* Core Competencies - 2026: 3-Column Grid with Languages integrated */}
      {(data.skills.length > 0 || data.languages.length > 0) && (
        <section style={{ marginBottom: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '12px',
              paddingBottom: '6px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {data.sectionHeaders?.skills || 'CORE COMPETENCIES'}
          </h2>
          {/* 2026 Premium: 3-Column Grid Layout - Max 5 categories + Languages */}
          <div 
            style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'flex-start', 
              gap: '20px',
            }}
          >
            {/* First row: 2 skill categories + Languages */}
            {data.skills.slice(0, 2).map((group, groupIdx) => (
              <div key={groupIdx} style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: executiveColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '6px', 
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
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
                        marginBottom: '3px',
                        color: executiveColors.text,
                      }}
                    >
                      <span style={{ flexShrink: 0 }}>•</span>
                      <span>{skill}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            
            {/* Languages Column - Integrated into first row */}
            {data.languages.length > 0 && (
              <div style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: executiveColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '6px', 
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
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
                        marginBottom: '3px',
                        color: executiveColors.text,
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
          
          {/* Second row: Additional skill categories (3rd-5th) - 3-column layout */}
          {data.skills.length > 2 && (
            <div 
              style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                justifyContent: 'flex-start', 
                gap: '20px',
                marginTop: '12px',
              }}
            >
              {data.skills.slice(2, 5).map((group, groupIdx) => (
                <div key={groupIdx} style={{ flex: '1', minWidth: '30%', maxWidth: '32%' }}>
                  <h4 
                    style={{ 
                      color: executiveColors.primary, 
                      fontWeight: 700, 
                      fontSize: '10px', 
                      marginBottom: '6px', 
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
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
                          marginBottom: '3px',
                          color: executiveColors.text,
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

      {/* Professional Experience */}
      {data.experience.length > 0 && (
        <section style={{ marginBottom: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '14px',
              paddingBottom: '6px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {data.sectionHeaders?.experience || 'PROFESSIONAL EXPERIENCE'}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {data.experience.map((exp) => (
              <div key={exp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                  <h3 
                    style={{ 
                      fontFamily: "'Georgia', 'Times New Roman', serif",
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: executiveColors.text,
                    }}
                  >
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: executiveColors.textLight }}>
                    {exp.startDate} – {exp.current ? (data.localizedStrings?.present || 'Present') : exp.endDate}
                  </span>
                </div>
                <p 
                  style={{ 
                    fontSize: '12px',
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
                          gap: '8px',
                          fontSize: '12px',
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
        <section style={{ marginBottom: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '14px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '6px',
              borderBottom: `2px solid ${executiveColors.primary}`,
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
                      color: executiveColors.text,
                    }}
                  >
                    {edu.degree}{edu.field && ` ${data.localizedStrings?.degreeConnector || 'in'} ${edu.field}`}
                  </h3>
                  <p style={{ fontSize: '12px', color: executiveColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {data.localizedStrings?.gradePrefix || 'GPA:'} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: executiveColors.textLight }}>
                    {edu.endDate}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Certifications - Languages section REMOVED (now integrated into Core Competencies grid) */}
      {data.certifications.length > 0 && (
        <section style={{ marginBottom: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {data.sectionHeaders?.certifications || 'CERTIFICATIONS'}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '4px' }}>
            {data.certifications.map((cert) => (
              <div key={cert.id} style={{ fontSize: '12px' }}>
                <span style={{ fontWeight: '500', color: executiveColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: executiveColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Additional Information */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginTop: '24px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: executiveColors.primary,
              marginBottom: '8px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${executiveColors.primary}`,
            }}
          >
            {data.sectionHeaders?.additionalInfo || 'ADDITIONAL INFORMATION'}
          </h2>
          <p style={{ fontSize: '12px', color: executiveColors.text }}>
            {data.additionalInfo.join(' • ')}
          </p>
        </section>
      )}
    </div>
  );
}
