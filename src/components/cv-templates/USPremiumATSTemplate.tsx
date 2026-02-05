'use client';

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
import { Mail, Phone, MapPin, Linkedin, Globe, Github, Award } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
  qualityScore?: number;
  matchScore?: number;
  showScores?: boolean;
  photoUrl?: string;
}

export function USPremiumATSTemplate({ 
  data, 
  template, 
  qualityScore,
  matchScore,
  showScores = false,
  photoUrl,
}: Props) {
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
        width: '8.5in',
        minHeight: '11in',
        fontFamily: "'Arial', 'Helvetica', sans-serif",  // 2026: Clean sans-serif body
        color: premiumColors.text,
        lineHeight: 1.2,  // 2026: Tighter line spacing (1.15-1.2)
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        padding: '0.4in 0.6in',  // Template portion: combines with browser margin for 0.5in top/bottom, 0.75in left/right
      }}
    >
      {/* Quality/Match Score Badge (only shown in preview, not print) */}
      {showScores && (qualityScore || matchScore) && (
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
            fontFamily: "'Georgia', 'Times New Roman', serif",  // 2026: Serif headers for authority
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
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '16px',
              fontWeight: 500,
              marginBottom: '12px',
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
            fontSize: '12px',
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
          {(data.personal.address || data.personal.city || data.personal.country) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin style={{ width: '14px', height: '14px' }} />
              <span>{[data.personal.address, data.personal.city, data.personal.country].filter(Boolean).join(', ')}</span>
            </span>
          )}
          {data.personal.linkedIn && (
            <a 
              href={data.personal.linkedIn} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Linkedin style={{ width: '14px', height: '14px' }} />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a 
              href={data.personal.github} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Github style={{ width: '14px', height: '14px' }} />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a 
              href={data.personal.portfolio} 
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: premiumColors.textLight, textDecoration: 'none' }}
            >
              <Globe style={{ width: '14px', height: '14px' }} />
              <span>Portfolio</span>
            </a>
          )}
        </div>
      </header>

      <div style={{ marginTop: '20px' }}>
        {/* Professional Summary - Critical for ATS */}
        {data.summary && (
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              PROFESSIONAL SUMMARY
            </h2>
            <p 
              style={{ 
                fontSize: '12px',
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
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '12px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              CORE COMPETENCIES
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
                      color: premiumColors.primary, 
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
                          color: premiumColors.text,
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
                      color: premiumColors.primary, 
                      fontWeight: 700, 
                      fontSize: '10px', 
                      marginBottom: '6px', 
                      textTransform: 'uppercase',
                      letterSpacing: '1px',
                    }}
                  >
                    LANGUAGES
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
                          color: premiumColors.text,
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
                        color: premiumColors.primary, 
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
                            color: premiumColors.text,
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
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              PROFESSIONAL EXPERIENCE
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data.experience.map((exp, idx) => (
                <div key={exp.id || idx} style={{ position: 'relative' }}>
                  {/* Role Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <h3 
                      style={{ 
                        fontFamily: "'Georgia', 'Times New Roman', serif",
                        fontSize: '13px',
                        fontWeight: 'bold',
                        color: premiumColors.text,
                      }}
                    >
                      {exp.position}
                    </h3>
                    <span 
                      style={{ 
                        fontSize: '12px',
                        fontWeight: '500',
                        whiteSpace: 'nowrap',
                        marginLeft: '16px',
                        color: premiumColors.textLight,
                      }}
                    >
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                    </span>
                  </div>
                  
                  {/* Company */}
                  <p 
                    style={{ 
                      fontSize: '12px',
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
                            gap: '8px',
                            fontSize: '12px',
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
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              EDUCATION
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu, idx) => (
                <div key={edu.id || idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 
                      style={{ 
                        fontFamily: "'Georgia', 'Times New Roman', serif",
                        fontSize: '13px',
                        fontWeight: '600',
                        color: premiumColors.text,
                      }}
                    >
                      {edu.degree}
                      {edu.field && <span style={{ fontWeight: 'normal' }}> in {edu.field}</span>}
                    </h3>
                    <p 
                      style={{ 
                        fontSize: '12px',
                        color: premiumColors.textLight,
                      }}
                    >
                      {edu.institution}
                      {edu.grade && <span> • GPA: {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span 
                      style={{ 
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        marginLeft: '16px',
                        color: premiumColors.textLight,
                      }}
                    >
                      {edu.endDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              CERTIFICATIONS
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '24px', rowGap: '6px' }}>
              {data.certifications.map((cert, idx) => (
                <div 
                  key={cert.id || idx} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px', 
                    fontSize: '12px' 
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

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                marginBottom: '8px',
                paddingBottom: '6px',
                borderBottom: `2px solid ${premiumColors.primary}`,
                color: premiumColors.primary,
              }}
            >
              ADDITIONAL INFORMATION
            </h2>
            <div style={{ fontSize: '12px', color: premiumColors.text }}>
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

      {/* Print footer with page number */}
      <div className="hidden print:block fixed bottom-4 right-8 text-xs text-gray-400">
        Page 1 of 1
      </div>
    </div>
  );
}
