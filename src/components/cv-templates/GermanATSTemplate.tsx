'use client';

/**
 * German ATS Template (Lebenslauf)
 * 
 * German CV specifics:
 * - Photo placeholder (standard for German CVs)
 * - German section headers
 * - A4 size (210mm x 297mm)
 * - More formal structure
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

export function GermanATSTemplate({ data, template, photoUrl }: Props) {
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
        width: '210mm',
        minHeight: '297mm',
        backgroundColor: 'white',
        padding: '0.5in 0.75in',  // Professional standard: 0.5in top/bottom, 0.75in left/right
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '11px',
        lineHeight: 1.2,
        color: germanColors.text,
      }}
    >
      {/* FULL-WIDTH HEADER SECTION - ATS Optimized */}
      <header style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: `2px solid ${germanColors.primary}` }}>
        <h1 
          style={{ 
            fontFamily: "'Georgia', 'Times New Roman', serif",
            fontSize: '24px',
            fontWeight: 'bold',
            color: germanColors.primary,
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
              color: germanColors.textLight,
              marginBottom: '12px',
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
            fontSize: '11px',
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
              <span>Webseite</span>
            </a>
          )}
        </div>
      </header>

      {/* FULL-WIDTH PROFESSIONAL SUMMARY - Critical for ATS */}
      {data.summary && (
        <section style={{ marginBottom: '20px' }}>
          <h2 
            style={{ 
              fontFamily: "'Georgia', 'Times New Roman', serif",
              fontSize: '13px',
              fontWeight: 'bold',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: germanColors.primary,
              marginBottom: '6px',
              paddingBottom: '4px',
              borderBottom: `2px solid ${germanColors.primary}`,
            }}
          >
            {data.sectionHeaders?.summary || GERMAN_HEADERS.summary}
          </h2>
          <p style={{ fontSize: '12px', lineHeight: 1.5, color: germanColors.text }}>
            {data.summary}
          </p>
        </section>
      )}

      {/* TWO-COLUMN LAYOUT STARTS HERE */}
      <div
        style={{
          width: '100%',
          display: 'flex',
        }}
      >
      {/* Left Sidebar with Photo (Decorative) */}
      <aside 
        style={{ 
          width: '70mm',
          padding: '0 12px 0 0',  // Zero left padding (outer handles it), small right padding for gap
          backgroundColor: germanColors.headerBg,
          borderRight: `2px solid ${germanColors.primary}`,
          overflow: 'hidden', // Prevent text overflow to main column
        }}
      >
        {/* Photo - German CV standard: 4.5cm x 6cm (Decorative - ATS ignores images) */}
        <div 
          style={{ 
            width: '45mm',  // German standard: 4.5cm
            height: '60mm', // German standard: 6cm (3:4 portrait ratio)
            marginBottom: '15px', // Reduced spacing to move content up
            border: photoUrl ? '0.5px solid #d0d0d0' : `2px dashed ${germanColors.textLight}`, // Subtle professional border
            borderRadius: '2px', // Minimal rounding for professional look
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            backgroundColor: photoUrl ? 'transparent' : 'white',
          }}
        >
          {photoUrl ? (
            <img 
              src={photoUrl} 
              alt="Bewerbungsfoto" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: '8px' }}>
              <User style={{ width: '28px', height: '28px', color: germanColors.textLight, margin: '0 auto 6px' }} />
              <span style={{ fontSize: '9px', color: germanColors.textLight }}>{data.localizedStrings?.photoPlaceholder || 'Foto'}</span>
            </div>
          )}
        </div>

        {/* Core Competencies with Languages integrated - 2026 ATS Best Practice */}
        {(data.skills.length > 0 || data.languages.length > 0) && (
          <div style={{ marginBottom: '16px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '3px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {data.sectionHeaders?.skills || GERMAN_HEADERS.skills}
            </h2>
            {/* Grouped skills by category with Languages integrated - max 5 per category */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.skills.map((group, groupIdx) => (
                <div key={groupIdx} style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                  <div 
                    style={{ 
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: germanColors.text,
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
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: germanColors.text,
                      marginBottom: '4px',
                    }}
                  >
                    {data.sectionHeaders?.languages || GERMAN_HEADERS.languages}:
                  </div>
                  <div style={{ marginLeft: '8px' }}>
                    {data.languages.map((lang, idx) => (
                      <div 
                        key={idx} 
                        style={{ 
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '6px',
                          fontSize: '12px',
                          lineHeight: 1.3,
                          marginBottom: '2px',
                          color: germanColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0 }}>•</span>
                        <span style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}>
                          <strong>{lang.language}:</strong> {lang.proficiency}
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
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '12px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '3px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {data.sectionHeaders?.certifications || GERMAN_HEADERS.certifications}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              {data.certifications.map((cert) => (
                <div key={cert.id} style={{ fontSize: '12px' }}>
                  <div style={{ fontWeight: 'bold', color: germanColors.text }}>{cert.name}</div>
                  {cert.issuer && (
                    <div style={{ fontSize: '11px', color: germanColors.textLight }}>{cert.issuer}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '0 0 0 12px' }}>  {/* Zero right padding (outer handles it), small left padding for gap */}
        {/* Berufserfahrung */}
        {data.experience.length > 0 && (
          <section style={{ marginBottom: '18px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '13px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '10px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {data.sectionHeaders?.experience || GERMAN_HEADERS.experience}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {data.experience.map((exp) => (
                <div key={exp.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                    <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: germanColors.text }}>
                      {exp.position}
                    </h3>
                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: germanColors.textLight }}>
                      {exp.startDate} – {exp.current ? (data.localizedStrings?.present || 'Heute') : exp.endDate}
                    </span>
                  </div>
                  <p style={{ fontSize: '12px', fontWeight: '600', marginBottom: '6px', color: germanColors.primary }}>
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
                            gap: '8px',
                            fontSize: '12px',
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

        {/* Ausbildung */}
        {data.education.length > 0 && (
          <section style={{ marginBottom: '18px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '13px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {data.sectionHeaders?.education || GERMAN_HEADERS.education}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.education.map((edu) => (
                <div key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <div>
                    <h3 style={{ fontSize: '12px', fontWeight: '600', color: germanColors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p style={{ fontSize: '12px', color: germanColors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | {data.localizedStrings?.gradePrefix || 'Note:'} {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span style={{ fontSize: '12px', whiteSpace: 'nowrap', color: germanColors.textLight }}>
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
          <section style={{ marginBottom: '18px' }}>
            <h2 
              style={{ 
                fontFamily: "'Georgia', 'Times New Roman', serif",
                fontSize: '13px',
                fontWeight: 'bold',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: germanColors.primary,
                marginBottom: '6px',
                paddingBottom: '4px',
                borderBottom: `2px solid ${germanColors.primary}`,
              }}
            >
              {data.sectionHeaders?.additionalInfo || GERMAN_HEADERS.additionalInfo}
            </h2>
            <p style={{ fontSize: '12px', color: germanColors.text }}>
              {data.additionalInfo.join(' • ')}
            </p>
          </section>
        )}

        {/* Signature Line - German standard (controlled by data.signature.includeSignature) */}
        {data.signature?.includeSignature && (
          <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: `1px solid ${germanColors.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <p style={{ fontSize: '10px', color: germanColors.textLight, marginBottom: '4px' }}>
                  {data.signature?.city || 'Ort'}, {data.signature?.date || 'Datum'}
                </p>
                <div style={{ width: '120px', borderBottom: `1px solid ${germanColors.text}` }} />
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: '10px', color: germanColors.textLight, marginBottom: '4px' }}>
                  Unterschrift
                </p>
                <div style={{ width: '150px', borderBottom: `1px solid ${germanColors.text}` }} />
              </div>
            </div>
          </div>
        )}
      </main>
      </div>
    </div>
  );
}
