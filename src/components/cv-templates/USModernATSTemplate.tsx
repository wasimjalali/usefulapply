'use client';

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
import { Mail, Phone, MapPin, Linkedin, Globe, Github } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
}

export function USModernATSTemplate({ data, template }: Props) {
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
      style={{ 
        width: '8.5in',
        minHeight: '11in',
        fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
        fontSize: '13px',
        lineHeight: 1.15,
        color: modernColors.text,
        backgroundColor: 'white',
        display: 'flex',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
      }}
    >
      {/* Left Sidebar - 30% */}
      <aside 
        style={{ 
          width: '30%',
          padding: '36px 18px',
          backgroundColor: modernColors.sidebar,
          overflow: 'hidden', // Prevent text overflow to main column
        }}
      >
        {/* Name in sidebar */}
        <h1 
          style={{ 
            fontFamily: "'Roboto', 'Helvetica Neue', Arial, sans-serif",
            fontSize: '22px',
            fontWeight: 'bold',
            color: modernColors.primary,
            marginBottom: '8px',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Title */}
        {data.personal.currentTitle && (
          <p 
            style={{ 
              fontSize: '12px',
              fontWeight: '500',
              color: modernColors.textLight,
              marginBottom: '20px',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}
        
        {/* Contact Info */}
        <div style={{ marginBottom: '24px' }}>
          <h2 
            style={{ 
              fontSize: '11px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: modernColors.primary,
              marginBottom: '8px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${modernColors.primary}`,
            }}
          >
            CONTACT
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
            {data.personal.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: modernColors.text }}>
                <Mail style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>{data.personal.email}</span>
              </div>
            )}
            {data.personal.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: modernColors.text }}>
                <Phone style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>{data.personal.phone}</span>
              </div>
            )}
            {(data.personal.city || data.personal.country) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: modernColors.text }}>
                <MapPin style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>{[data.personal.city, data.personal.country].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {data.personal.linkedIn && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: modernColors.text }}>
                <Linkedin style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>LinkedIn</span>
              </div>
            )}
            {data.personal.github && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: modernColors.text }}>
                <Github style={{ width: '12px', height: '12px', color: modernColors.primary }} />
                <span>GitHub</span>
              </div>
            )}
          </div>
        </div>

        {/* Skills in Sidebar - Grouped by category */}
        {data.skills.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 
              style={{ 
                fontSize: '13px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              KEY SKILLS
            </h2>
            {/* Grouped skills by category - max 5 per category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {data.skills.map((group, groupIdx) => (
                <div key={groupIdx} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div 
                    style={{ 
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: modernColors.text,
                      marginBottom: '4px',
                    }}
                  >
                    {group.category}:
                  </div>
                  <div style={{ marginLeft: '8px' }}>
                    {group.items.slice(0, 5).map((skill, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          fontSize: '12px',
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
            </div>
          </div>
        )}

        {/* Languages in Sidebar */}
        {data.languages.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <h2 
              style={{ 
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              LANGUAGES
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {data.languages.map((lang, idx) => (
                <div key={idx} style={{ fontSize: '12px' }}>
                  <span style={{ fontWeight: '500', color: modernColors.text }}>{lang.language}</span>
                  <span style={{ color: modernColors.textLight }}> — {lang.proficiency}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Certifications in Sidebar */}
        {data.certifications.length > 0 && (
          <div>
            <h2 
              style={{ 
                fontSize: '11px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              CERTIFICATIONS
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.certifications.map((cert) => (
                <div key={cert.id} style={{ fontSize: '11px' }}>
                  <div style={{ fontWeight: '500', color: modernColors.text }}>{cert.name}</div>
                  {cert.issuer && (
                    <div style={{ fontSize: '10px', color: modernColors.textLight }}>{cert.issuer}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content - 70% */}
      <main style={{ width: '70%', padding: '36px 28px' }}>
        {/* Professional Summary */}
        {data.summary && (
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              PROFESSIONAL SUMMARY
            </h2>
            <p style={{ fontSize: '12px', lineHeight: 1.5, color: modernColors.text }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Professional Experience */}
        {data.experience.length > 0 && (
          <section style={{ marginBottom: '20px' }}>
            <h2 
              style={{ 
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '12px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              PROFESSIONAL EXPERIENCE
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {data.experience.map((exp) => (
                <div key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: modernColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: modernColors.textLight }}>
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: modernColors.primary }}>
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
                            gap: '8px',
                            fontSize: '12px',
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
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              EDUCATION
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu) => (
                <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 style={{ fontSize: '13px', fontWeight: '600', color: modernColors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p style={{ fontSize: '12px', color: modernColors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | GPA: {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: modernColors.textLight }}>
                      {edu.endDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section>
            <h2 
              style={{ 
                fontSize: '14px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: modernColors.primary,
                marginBottom: '8px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${modernColors.primary}`,
              }}
            >
              ADDITIONAL INFORMATION
            </h2>
            <p style={{ fontSize: '12px', color: modernColors.text }}>
              {data.additionalInfo.join(' • ')}
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
