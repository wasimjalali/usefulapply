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
  const { colors } = template;
  
  return (
    <div 
      className="cv-template us-professional bg-white shadow-lg mx-auto overflow-hidden print:shadow-none"
      style={{ 
        width: '8.5in',
        minHeight: '11in',
        fontFamily: template.fonts.body,
        color: colors.text,
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
      }}
    >
      {/* Dark Header with Gold Accent */}
      <header 
        className="px-8 py-6 text-white"
        style={{ backgroundColor: colors.headerBg }}
      >
        <h1 
          className="text-3xl font-bold tracking-wide mb-1"
          style={{ fontFamily: template.fonts.heading }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Tagline/Title */}
        {data.personal.currentTitle && (
          <p className="text-base font-medium opacity-90 mb-2">
            {data.personal.currentTitle}
          </p>
        )}
        
        <div 
          className="w-16 h-1 mb-4"
          style={{ backgroundColor: colors.accent }}
        />
        
        <div className="flex flex-wrap gap-4 text-sm opacity-90">
          {data.personal.email && (
            <span className="flex items-center gap-1.5">
              <Mail className="w-4 h-4" />
              {data.personal.email}
            </span>
          )}
          {data.personal.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-4 h-4" />
              {data.personal.phone}
            </span>
          )}
          {(data.personal.address || data.personal.city || data.personal.country) && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              {[data.personal.address, data.personal.city, data.personal.country].filter(Boolean).join(', ')}
            </span>
          )}
          {data.personal.linkedIn && (
            <span className="flex items-center gap-1.5">
              <Linkedin className="w-4 h-4" />
              LinkedIn
            </span>
          )}
          {data.personal.github && (
            <span className="flex items-center gap-1.5">
              <Github className="w-4 h-4" />
              GitHub
            </span>
          )}
          {data.personal.portfolio && (
            <span className="flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              Portfolio
            </span>
          )}
          {data.personal.website && (
            <span className="flex items-center gap-1.5">
              <Globe className="w-4 h-4" />
              Website
            </span>
          )}
        </div>
      </header>

      <div className="px-8 py-6 space-y-5">
        {/* Executive Summary */}
        {data.summary && (
          <section>
            <h2 
              className="text-lg font-bold mb-2 flex items-center gap-2"
              style={{ color: colors.primary, fontFamily: template.fonts.heading }}
            >
              <span 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              Executive Summary
            </h2>
            <p className="text-sm leading-relaxed pl-4" style={{ color: colors.secondary }}>
              {data.summary}
            </p>
          </section>
        )}

        {/* Professional Experience */}
        {data.experience.length > 0 && (
          <section>
            <h2 
              className="text-lg font-bold mb-3 flex items-center gap-2"
              style={{ color: colors.primary, fontFamily: template.fonts.heading }}
            >
              <span 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              Professional Experience
            </h2>
            <div className="space-y-4 pl-4">
              {data.experience.map((exp) => (
                <div key={exp.id} className="border-l-2 pl-4" style={{ borderColor: colors.accent }}>
                  <div className="flex justify-between items-start mb-1">
                    <div>
                      <h3 className="font-bold" style={{ color: colors.primary }}>
                        {exp.position}
                      </h3>
                      <p className="text-sm font-medium" style={{ color: colors.secondary }}>
                        {exp.company}
                        {exp.location && <span className="font-normal"> | {exp.location}</span>}
                      </p>
                    </div>
                    <span 
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: colors.headerBg, color: 'white' }}
                    >
                      {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                    </span>
                  </div>
                  {exp.bullets.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {exp.bullets.map((bullet, idx) => (
                        <li key={idx} className="text-sm flex gap-2" style={{ color: colors.text }}>
                          <span style={{ color: colors.accent }}>▸</span>
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Skills & Expertise */}
        {data.skills.length > 0 && (
          <section>
            <h2 
              className="text-lg font-bold mb-2 flex items-center gap-2"
              style={{ color: colors.primary, fontFamily: template.fonts.heading }}
            >
              <span 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              Skills & Expertise
            </h2>
            <div className="pl-4 flex flex-wrap gap-2">
              {data.skills.flatMap(group => group.items).map((skill, idx) => (
                <span 
                  key={idx}
                  className="px-3 py-1 text-xs font-medium rounded-full"
                  style={{ 
                    backgroundColor: `${colors.primary}10`,
                    color: colors.primary,
                    border: `1px solid ${colors.primary}30`,
                  }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <section>
            <h2 
              className="text-lg font-bold mb-2 flex items-center gap-2"
              style={{ color: colors.primary, fontFamily: template.fonts.heading }}
            >
              <span 
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              Education
            </h2>
            <div className="pl-4 space-y-2">
              {data.education.map((edu) => (
                <div key={edu.id} className="flex justify-between items-start">
                  <div>
                    <h3 className="font-semibold text-sm" style={{ color: colors.primary }}>
                      {edu.degree}{edu.field && ` in ${edu.field}`}
                    </h3>
                    <p className="text-sm" style={{ color: colors.textLight }}>
                      {edu.institution}
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

        <div className="grid grid-cols-2 gap-6">
          {/* Certifications */}
          {data.certifications.length > 0 && (
            <section>
              <h2 
                className="text-lg font-bold mb-2 flex items-center gap-2"
                style={{ color: colors.primary, fontFamily: template.fonts.heading }}
              >
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                />
                Certifications
              </h2>
              <ul className="pl-4 space-y-2">
                {data.certifications.map((cert) => (
                  <li key={cert.id} className="text-sm">
                    <div style={{ color: colors.text }}>{cert.name}</div>
                    {(cert.issuer || cert.date) && (
                      <div className="text-xs" style={{ color: colors.textLight }}>
                        {cert.issuer}{cert.issuer && cert.date ? ' • ' : ''}{cert.date}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Languages */}
          {data.languages.length > 0 && (
            <section>
              <h2 
                className="text-lg font-bold mb-2 flex items-center gap-2"
                style={{ color: colors.primary, fontFamily: template.fonts.heading }}
              >
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                />
                Languages
              </h2>
              <ul className="pl-4 space-y-1">
                {data.languages.map((lang, idx) => (
                  <li key={idx} className="text-sm">
                    <span style={{ color: colors.text }}>{lang.language}</span>
                    <span style={{ color: colors.textLight }}> – {lang.proficiency}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
