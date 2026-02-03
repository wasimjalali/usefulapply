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
  const { colors } = template;
  
  return (
    <div 
      className="cv-template us-modern-ats bg-white shadow-lg mx-auto print:shadow-none"
      style={{ 
        width: '8.5in',
        minHeight: '11in',
        fontFamily: template.fonts.body,
        color: colors.text,
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
      }}
    >
      {/* Header - Clean ATS-friendly design with full-width background */}
      <header 
        className="py-5"
        style={{ backgroundColor: colors.headerBg }}
      >
        <div className="px-10">
          <h1 
            className="text-2xl font-bold mb-1"
            style={{ color: colors.primary }}
          >
            {data.personal.fullName || 'Your Name'}
          </h1>
        
        {/* Professional Tagline/Title */}
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
          {data.personal.portfolio && (
            <span className="flex items-center gap-1">
              <Globe className="w-3.5 h-3.5" />
              Portfolio
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
      </header>

      <div className="px-8 py-5 space-y-4">
        {/* Summary - Important for ATS */}
        {data.summary && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Professional Summary
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: colors.secondary }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Skills - Placed high for ATS keyword scanning */}
        {data.skills.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Core Competencies
            </h2>
            {/* Check if skills have categories - render categorized or flat */}
            {data.skills.some(group => group.category && group.category.trim()) ? (
              // Categorized skills rendering
              <div className="space-y-2">
                {data.skills.map((group, groupIdx) => (
                  <div key={groupIdx} className="skill-category">
                    {group.category && group.category.trim() && (
                      <h4 className="text-xs font-semibold mb-1" style={{ color: colors.text }}>
                        {group.category}
                      </h4>
                    )}
                    <div className="flex flex-wrap gap-2">
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
              // Flat skills rendering (fallback)
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

        {/* Experience */}
        {data.experience.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-3"
              style={{ color: colors.primary }}
            >
              Professional Experience
            </h2>
            <div className="space-y-4">
              {data.experience.map((exp) => (
                <div key={exp.id}>
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
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
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

        {/* Education */}
        {data.education.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Education
            </h2>
            <div className="space-y-2">
              {data.education.map((edu) => (
                <div key={edu.id} className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: colors.text }}>
                      {edu.degree}{edu.field && `, ${edu.field}`}
                    </h3>
                    <p className="text-sm" style={{ color: colors.textLight }}>
                      {edu.institution}
                      {edu.grade && <span> | GPA: {edu.grade}</span>}
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

        {/* Certifications */}
        {data.certifications.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Certifications
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

        {/* Languages */}
        {data.languages.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Languages
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

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-wider mb-2"
              style={{ color: colors.primary }}
            >
              Additional Information
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
