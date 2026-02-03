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
import { SmartTooltip } from '@/components/ui/SmartTooltip';

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
  
  // Premium color palette
  const premiumColors = {
    primary: colors.primary || '#1a365d',
    accent: colors.accent || '#2b6cb0',
    text: colors.text || '#1a202c',
    textLight: colors.textLight || '#4a5568',
    headerBg: colors.headerBg || '#f7fafc',
    border: '#e2e8f0',
    highlight: '#ebf8ff',
  };

  const getInsight = (sectionId: string) => {
    return data.annotations?.find(a => a.section_id === sectionId)?.insight;
  };

  return (
    <div 
      className="cv-template us-premium-ats bg-white shadow-lg mx-auto print:shadow-none"
      style={{ 
        width: '8.5in',
        minHeight: '11in',
        fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
        color: premiumColors.text,
        lineHeight: 1.5,
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
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

      {/* Header - Clean, ATS-optimized */}
      <header className="px-10 py-6 border-b-2" style={{ borderColor: premiumColors.primary }}>
        <h1 
          className="text-3xl font-bold tracking-tight mb-1"
          style={{ color: premiumColors.primary }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        
        {/* Professional Headline */}
        {data.personal.currentTitle && (
          <p 
            className="text-lg font-medium mb-4"
            style={{ color: premiumColors.accent }}
          >
            {data.personal.currentTitle}
          </p>
        )}
        
        {/* Contact Info - Single line for ATS */}
        <div 
          className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          style={{ color: premiumColors.textLight }}
        >
          {data.personal.email && (
            <a href={`mailto:${data.personal.email}`} className="flex items-center gap-1.5 hover:text-blue-600">
              <Mail className="w-4 h-4" />
              <span>{data.personal.email}</span>
            </a>
          )}
          {data.personal.phone && (
            <span className="flex items-center gap-1.5">
              <Phone className="w-4 h-4" />
              <span>{data.personal.phone}</span>
            </span>
          )}
          {(data.personal.address || data.personal.city || data.personal.country) && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />
              <span>{[data.personal.address, data.personal.city, data.personal.country].filter(Boolean).join(', ')}</span>
            </span>
          )}
          {data.personal.linkedIn && (
            <a href={data.personal.linkedIn} className="flex items-center gap-1.5 hover:text-blue-600">
              <Linkedin className="w-4 h-4" />
              <span>LinkedIn</span>
            </a>
          )}
          {data.personal.github && (
            <a href={data.personal.github} className="flex items-center gap-1.5 hover:text-blue-600">
              <Github className="w-4 h-4" />
              <span>GitHub</span>
            </a>
          )}
          {data.personal.portfolio && (
            <a href={data.personal.portfolio} className="flex items-center gap-1.5 hover:text-blue-600">
              <Globe className="w-4 h-4" />
              <span>Portfolio</span>
            </a>
          )}
        </div>
      </header>

      <div className="px-10 py-6 space-y-5">
        {/* Professional Summary - Critical for ATS */}
        {data.summary && (
          <SmartTooltip insight={getInsight('summary')}>
            <section>
              <h2 
                className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
                style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
              >
                Professional Summary
              </h2>
              <p 
                className="text-sm leading-relaxed"
                style={{ color: premiumColors.text }}
              >
                {data.summary}
              </p>
            </section>
          </SmartTooltip>
        )}

        {/* Core Competencies / Skills - High placement for ATS keyword scanning */}
        {data.skills.length > 0 && (
          <SmartTooltip insight={getInsight('skills')}>
            <section>
              <h2 
                className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
                style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
              >
                Core Competencies
              </h2>
            {/* Check if skills have categories - render categorized or flat */}
            {data.skills.some(group => group.category && group.category.trim()) ? (
              /* Categorized skills rendering */
              <div className="space-y-3">
                {data.skills.map((group, groupIdx) => (
                  <div key={groupIdx} className="skill-category">
                    {group.category && group.category.trim() && (
                      <h4 
                        className="text-xs font-semibold mb-1.5"
                        style={{ color: premiumColors.text }}
                      >
                        {group.category}
                      </h4>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((skill, skillIdx) => (
                        <span 
                          key={skillIdx}
                          className="px-2 py-0.5 text-xs font-medium rounded"
                          style={{ 
                            backgroundColor: premiumColors.highlight,
                            color: premiumColors.primary,
                            border: `1px solid ${premiumColors.border}`,
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
                {data.skills.flatMap((group, groupIdx) => 
                  group.items.map((skill, skillIdx) => (
                    <span 
                      key={`${groupIdx}-${skillIdx}`}
                      className="px-2.5 py-1 text-xs font-medium rounded"
                      style={{ 
                        backgroundColor: premiumColors.highlight,
                        color: premiumColors.primary,
                        border: `1px solid ${premiumColors.border}`,
                      }}
                    >
                      {skill}
                    </span>
                  ))
                )}
              </div>
            )}
            </section>
          </SmartTooltip>
        )}

        {/* Professional Experience */}
        {data.experience.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
              style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
            >
              Professional Experience
            </h2>
            <div className="space-y-4">
              {data.experience.map((exp, idx) => (
                <SmartTooltip key={exp.id || idx} insight={getInsight(exp.id || `experience_${idx}`)}>
                  <div className="relative">
                    {/* Role Header */}
                    <div className="flex justify-between items-baseline mb-1">
                      <h3 
                        className="text-base font-bold"
                        style={{ color: premiumColors.text }}
                      >
                        {exp.position}
                      </h3>
                      <span 
                        className="text-sm font-medium whitespace-nowrap ml-4"
                        style={{ color: premiumColors.textLight }}
                      >
                        {exp.startDate} – {exp.current ? 'Present' : exp.endDate}
                      </span>
                    </div>
                    
                    {/* Company */}
                    <p 
                      className="text-sm font-medium mb-2"
                      style={{ color: premiumColors.accent }}
                    >
                      {exp.company}
                      {exp.location && (
                        <span style={{ color: premiumColors.textLight }}> | {exp.location}</span>
                      )}
                    </p>
                    
                    {/* Bullets - Optimized for ATS */}
                    {exp.bullets.length > 0 && (
                      <ul className="space-y-1">
                        {exp.bullets.map((bullet, bulletIdx) => (
                          <li 
                            key={bulletIdx} 
                            className="text-sm pl-5 relative"
                            style={{ color: premiumColors.text }}
                          >
                            <span 
                              className="absolute left-0 top-2 w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: premiumColors.accent }}
                            />
                            {bullet}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </SmartTooltip>
              ))}
            </div>
          </section>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
              style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
            >
              Education
            </h2>
            <div className="space-y-2">
              {data.education.map((edu, idx) => (
                <div key={edu.id || idx} className="flex justify-between items-baseline">
                  <div>
                    <h3 
                      className="text-sm font-semibold"
                      style={{ color: premiumColors.text }}
                    >
                      {edu.degree}
                      {edu.field && <span className="font-normal"> in {edu.field}</span>}
                    </h3>
                    <p 
                      className="text-sm"
                      style={{ color: premiumColors.textLight }}
                    >
                      {edu.institution}
                      {edu.grade && <span> • GPA: {edu.grade}</span>}
                    </p>
                  </div>
                  {edu.endDate && (
                    <span 
                      className="text-sm whitespace-nowrap ml-4"
                      style={{ color: premiumColors.textLight }}
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
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
              style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
            >
              Certifications
            </h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {data.certifications.map((cert, idx) => (
                <div 
                  key={cert.id || idx} 
                  className="flex items-center gap-2 text-sm"
                >
                  <Award 
                    className="w-3.5 h-3.5 flex-shrink-0"
                    style={{ color: premiumColors.accent }}
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

        {/* Languages */}
        {data.languages.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
              style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
            >
              Languages
            </h2>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {data.languages.map((lang, idx) => (
                <span key={idx}>
                  <span 
                    className="font-medium"
                    style={{ color: premiumColors.text }}
                  >
                    {lang.language}
                  </span>
                  <span style={{ color: premiumColors.textLight }}>
                    {' '}— {lang.proficiency}
                  </span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Additional Information */}
        {data.additionalInfo && data.additionalInfo.length > 0 && (
          <section>
            <h2 
              className="text-sm font-bold uppercase tracking-widest mb-3 pb-1 border-b"
              style={{ color: premiumColors.primary, borderColor: premiumColors.border }}
            >
              Additional Information
            </h2>
            <div className="text-sm" style={{ color: premiumColors.text }}>
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
