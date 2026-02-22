'use client';

/**
 * German Classic Template (Deutsch Klassisch)
 * 
 * SINGLE-COLUMN layout with photo support — better ATS compatibility
 * than the two-column GermanATSTemplate while retaining all German CV features:
 * - Photo placeholder (standard for German CVs)
 * - German section headers (i18n-aware)
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
import { Mail, Phone, MapPin, Linkedin, Globe, Github, User } from 'lucide-react';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
}

// German section header translations
const GERMAN_HEADERS = {
  summary: 'Berufliches Profil',
  skills: 'Kernkompetenzen',
  experience: 'Berufserfahrung',
  education: 'Ausbildung',
  certifications: 'Zertifizierungen',
  languages: 'Sprachkenntnisse',
  additionalInfo: 'Weitere Informationen',
};

export function GermanClassicTemplate({ data, template, photoUrl }: Props) {
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
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: 'white',
        padding: '0.5in 0.75in',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '11px',
        lineHeight: 1.2,
        color: classicColors.text,
      }}
    >
      {/* HEADER WITH PHOTO — Single-column, ATS-optimized */}
      <header style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: `2px solid ${classicColors.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
          {/* Photo — German CV standard: 4.5cm x 6cm */}
          <div 
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
            }}
          >
            {photoUrl ? (
              <img 
                src={photoUrl} 
                alt="Bewerbungsfoto" 
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: '6px' }}>
                <User style={{ width: '24px', height: '24px', color: classicColors.photoBorder, margin: '0 auto 4px' }} />
                <span style={{ fontSize: '8px', color: classicColors.textLight }}>{data.localizedStrings?.photoPlaceholder || 'Foto'}</span>
              </div>
            )}
          </div>

          {/* Name + Contact */}
          <div style={{ flex: 1 }}>
            <h1 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '24px',
                fontWeight: 'bold',
                color: classicColors.primary,
                marginBottom: '4px',
              }}
            >
              {data.personal.fullName || 'Ihr Name'}
            </h1>
            {data.personal.currentTitle && (
              <p 
                style={{ 
                  fontFamily: "'Georgia', 'Times New Roman', serif",
                  fontSize: '13px',
                  fontWeight: '600',
                  color: classicColors.textLight,
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
                gap: '14px',
                fontSize: '11px',
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
                  <span>Webseite</span>
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* PROFESSIONAL SUMMARY */}
      {data.summary && (
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.summary || GERMAN_HEADERS.summary}
          </h2>
          <p style={{ fontSize: '11px', lineHeight: 1.5, color: classicColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* CORE COMPETENCIES — 3-Column Grid with Languages */}
      {(data.skills.length > 0 || data.languages.length > 0) && (
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '8px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.skills || GERMAN_HEADERS.skills}
          </h2>
          <div 
            style={{ 
              display: 'flex', 
              flexWrap: 'wrap', 
              justifyContent: 'flex-start', 
              gap: '16px',
            }}
          >
            {data.skills.slice(0, 4).map((group, groupIdx) => (
              <div key={groupIdx} style={{ flex: '1', minWidth: '28%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: classicColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '4px', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
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
                        gap: '5px',
                        fontSize: '11px',
                        lineHeight: 1.3,
                        marginBottom: '2px',
                        color: classicColors.text,
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
              <div style={{ flex: '1', minWidth: '28%', maxWidth: '32%' }}>
                <h4 
                  style={{ 
                    color: classicColors.primary, 
                    fontWeight: 700, 
                    fontSize: '10px', 
                    marginBottom: '4px', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                >
                  {data.sectionHeaders?.languages || GERMAN_HEADERS.languages}
                </h4>
                <div style={{ margin: 0 }}>
                  {data.languages.map((lang, idx) => (
                    <div 
                      key={idx} 
                      style={{ 
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '5px',
                        fontSize: '11px',
                        lineHeight: 1.3,
                        marginBottom: '2px',
                        color: classicColors.text,
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
          
          {/* Additional skill categories (5th+) */}
          {data.skills.length > 4 && (
            <div 
              style={{ 
                display: 'flex', 
                flexWrap: 'wrap', 
                justifyContent: 'flex-start', 
                gap: '16px',
                marginTop: '10px',
              }}
            >
              {data.skills.slice(4, 7).map((group, groupIdx) => (
                <div key={groupIdx} style={{ flex: '1', minWidth: '28%', maxWidth: '32%' }}>
                  <h4 
                    style={{ 
                      color: classicColors.primary, 
                      fontWeight: 700, 
                      fontSize: '10px', 
                      marginBottom: '4px', 
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
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
                          gap: '5px',
                          fontSize: '11px',
                          lineHeight: 1.3,
                          marginBottom: '2px',
                          color: classicColors.text,
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
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '10px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.experience || GERMAN_HEADERS.experience}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {data.experience.map((exp) => (
              <div key={exp.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <h3 style={{ fontSize: '12px', fontWeight: 'bold', color: classicColors.text }}>
                    {exp.position}
                  </h3>
                  <span style={{ fontSize: '11px', whiteSpace: 'nowrap', color: classicColors.textLight }}>
                    {exp.startDate} – {exp.current ? (data.localizedStrings?.present || 'Heute') : exp.endDate}
                  </span>
                </div>
                <p style={{ fontSize: '11px', fontWeight: '600', marginBottom: '5px', color: classicColors.primary }}>
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
                          gap: '7px',
                          fontSize: '11px',
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
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.education || GERMAN_HEADERS.education}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.education.map((edu) => (
              <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 style={{ fontSize: '12px', fontWeight: '600', color: classicColors.text }}>
                    {edu.degree}{edu.field && `, ${edu.field}`}
                  </h3>
                  <p style={{ fontSize: '11px', color: classicColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {data.localizedStrings?.gradePrefix || 'Note:'} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && (
                  <span style={{ fontSize: '11px', whiteSpace: 'nowrap', color: classicColors.textLight }}>
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
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.certifications || GERMAN_HEADERS.certifications}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '20px', rowGap: '4px' }}>
            {data.certifications.map((cert) => (
              <div key={cert.id} style={{ fontSize: '11px' }}>
                <span style={{ fontWeight: '500', color: classicColors.text }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: classicColors.textLight }}> ({cert.issuer})</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ADDITIONAL INFORMATION */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={{ marginBottom: '18px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: classicColors.primary,
              marginBottom: '6px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${classicColors.primary}`,
            }}
          >
            {data.sectionHeaders?.additionalInfo || GERMAN_HEADERS.additionalInfo}
          </h2>
          <p style={{ fontSize: '11px', color: classicColors.text }}>
            {data.additionalInfo.join(' • ')}
          </p>
        </section>
      )}

      {/* SIGNATURE LINE — German standard */}
      {data.signature?.includeSignature && (
        <div style={{ marginTop: '36px', paddingTop: '16px', borderTop: `1px solid ${classicColors.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <p style={{ fontSize: '10px', color: classicColors.textLight, marginBottom: '4px' }}>
                {data.signature?.city || 'Ort'}, {data.signature?.date || 'Datum'}
              </p>
              <div style={{ width: '120px', borderBottom: `1px solid ${classicColors.text}` }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '10px', color: classicColors.textLight, marginBottom: '4px' }}>
                Unterschrift
              </p>
              <div style={{ width: '150px', borderBottom: `1px solid ${classicColors.text}` }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
