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
  const { colors } = template;
  
  return (
    <div 
      className="cv-template eu-german-ats bg-white shadow-lg mx-auto print:shadow-none"
      style={{ 
        width: '210mm',
        minHeight: '297mm',
        fontFamily: template.fonts.body,
        color: colors.text,
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
      }}
    >
      {/* Header with Photo */}
      <header 
        className="py-6"
        style={{ backgroundColor: colors.headerBg }}
      >
        <div className="px-10 flex justify-between items-start">
          {/* Personal Info */}
          <div className="flex-1">
            <h1 
              className="text-2xl font-bold mb-1"
              style={{ color: colors.primary }}
            >
              {data.personal.fullName || 'Ihr Name'}
            </h1>
          
            {/* Professional Title */}
            {data.personal.currentTitle && (
              <p 
                className="text-sm font-medium mb-3"
                style={{ color: colors.textLight }}
              >
                {data.personal.currentTitle}
              </p>
            )}
            
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: colors.textLight }}>
              {data.personal.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {data.personal.email}
                </span>
              )}
              {data.personal.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {data.personal.phone}
                </span>
              )}
              {(data.personal.address || data.personal.city || data.personal.country) && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {[data.personal.address, data.personal.city, data.personal.country].filter(Boolean).join(', ')}
                </span>
              )}
              {data.personal.linkedIn && (
                <span className="flex items-center gap-1">
                  <Linkedin className="w-3.5 h-3.5" />
                  LinkedIn
                </span>
              )}
              {data.personal.github && (
                <span className="flex items-center gap-1">
                  <Github className="w-3.5 h-3.5" />
                  GitHub
                </span>
              )}
              {data.personal.website && (
                <span className="flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5" />
                  Website
                </span>
              )}
            </div>
          </div>
          
          {/* Photo Placeholder - German CV standard: 45mm x 55mm */}
          <div 
            className="flex-shrink-0 ml-6 flex items-center justify-center border-2 border-dashed rounded"
            style={{ 
              width: '45mm', 
              height: '55mm',
              borderColor: colors.textLight,
              backgroundColor: photoUrl ? 'transparent' : colors.headerBg,
            }}
          >
            {photoUrl ? (
              <img 
                src={photoUrl} 
                alt="Bewerbungsfoto" 
                className="w-full h-full object-cover rounded"
              />
            ) : (
              <div className="text-center p-2">
                <User className="w-8 h-8 mx-auto mb-1" style={{ color: colors.textLight }} />
                <span className="text-xs" style={{ color: colors.textLight }}>
                  Foto
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="px-8 py-5 space-y-4">
        {/* Berufliches Profil (Professional Summary) */}
        {data.summary && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.summary}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: colors.secondary }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Kernkompetenzen (Core Competencies) */}
        {data.skills.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.skills}
            </h2>
            {/* Check if skills have categories - render categorized or flat */}
            {data.skills.some(group => group.category && group.category.trim()) ? (
              /* Categorized skills rendering */
              <div className="space-y-2">
                {data.skills.map((group, groupIdx) => (
                  <div key={groupIdx}>
                    {group.category && group.category.trim() && (
                      <h4 
                        className="text-xs font-semibold mb-1"
                        style={{ color: colors.text }}
                      >
                        {group.category}
                      </h4>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((skill, skillIdx) => (
                        <span 
                          key={skillIdx}
                          className="px-2 py-0.5 text-xs rounded"
                          style={{ 
                            backgroundColor: colors.headerBg,
                            color: colors.text,
                          }}
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Flat skills rendering (fallback) */
              <div className="flex flex-wrap gap-2">
                {data.skills.flatMap(group => group.items).map((skill, idx) => (
                  <span 
                    key={idx}
                    className="px-2 py-0.5 text-xs rounded"
                    style={{ 
                      backgroundColor: colors.headerBg,
                      color: colors.text,
                    }}
                  >
                    {skill}
                  </span>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Berufserfahrung (Professional Experience) */}
        {data.experience.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.experience}
            </h2>
            <div className="space-y-4">
              {data.experience.map((exp) => (
                <div key={exp.id} className="experience-item">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-sm" style={{ color: colors.text }}>
                        {exp.position}
                      </h3>
                      <p className="text-sm" style={{ color: colors.accent }}>
                        {exp.company}
                        {exp.location && <span style={{ color: colors.textLight }}> | {exp.location}</span>}
                      </p>
                    </div>
                    <span className="text-xs whitespace-nowrap" style={{ color: colors.textLight }}>
                      {exp.startDate} – {exp.current ? 'Heute' : exp.endDate}
                    </span>
                  </div>
                  {exp.bullets.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {exp.bullets.map((bullet, idx) => (
                        <li key={idx} className="text-sm pl-4 relative" style={{ color: colors.secondary }}>
                          <span className="absolute left-0">•</span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Ausbildung (Education) */}
        {data.education.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.education}
            </h2>
            <div className="space-y-2">
              {data.education.map((edu) => (
                <div key={edu.id} className="education-item flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p className="text-sm" style={{ color: colors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | Note: {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span className="text-xs" style={{ color: colors.textLight }}>
                      {edu.endDate}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Zertifizierungen (Certifications) */}
        {data.certifications.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.certifications}
            </h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {data.certifications.map((cert) => (
                <div key={cert.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.accent }} />
                    <span style={{ color: colors.text }}>{cert.name}</span>
                  </div>
                  {(cert.issuer || cert.date) && (
                    <div className="text-xs ml-3.5" style={{ color: colors.textLight }}>
                      {cert.issuer}{cert.issuer && cert.date ? ' • ' : ''}{cert.date}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Sprachkenntnisse (Languages) */}
        {data.languages.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.languages}
            </h2>
            <div className="flex gap-4 text-sm">
              {data.languages.map((lang, idx) => (
                <span key={idx}>
                  <span style={{ color: colors.text }}>{lang.language}</span>
                  <span style={{ color: colors.textLight }}> ({lang.proficiency})</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Weitere Informationen (Additional Information) */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              {GERMAN_HEADERS.additionalInfo}
            </h2>
            <div className="text-sm" style={{ color: colors.text }}>
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
    </div>
  );
}
