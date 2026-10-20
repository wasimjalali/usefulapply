/**
 * US Modern ATS Template
 *
 * Single column, so every parser reads it top to bottom: header, summary, experience, education,
 * skills, certifications, languages. The identity is the teal accent, the serif headings with a
 * rule, and a tinted skills block with a teal bar.
 *
 * CHARACTER LIMITS (2026 Standards - Design for MAXIMUM):
 * - Headline/Tagline: 120-220 chars (design for 220 max)
 * - Professional Summary: 500-700 chars / 70-110 words (design for 700 chars)
 * - Skills: 12-20 skills in 3-5 categories, 350-450 chars total (design for 20 skills)
 * - Experience Bullets: 4-6 per role, 75-160 chars each (design for 6 bullets × 160 chars)
 * - Education: 150-250 chars per degree (design for 250 chars)
 * - Certifications: 3-6 certs, 80-150 chars each (design for 6 certs)
 * - Languages: 2-4 languages, 40-80 chars each (design for 4 languages)
 */

import type { CSSProperties } from 'react';
import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { ContactRows, LanguageLine, SkillLines, stackGap } from './shared';
import { sectionHeading, formatDateRange, formatSingleDate, degreeText, uiText, type HeadingKey } from '@/lib/cv-templates/locale';

interface Props {
  data: CVData;
  template: CVTemplate;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

const modernColors = {
  primary: '#2C7A7B', // Teal accent
  text: '#1A1A1A', // Near-black for body
  textLight: '#4A5568', // Muted grey for secondary
  tint: '#F7FAFC', // Faint grey-blue for the skills block
  accent: '#2C7A7B', // Teal for highlights
};

function Heading({ text, marginBottom = 8 }: { text: string; marginBottom?: number }) {
  return (
    <h2
      style={{
        fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
        fontSize: '10.5pt',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        color: modernColors.primary,
        marginBottom: `calc(${marginBottom}px * var(--cv-d, 1))`,
        paddingBottom: 'calc(8px * var(--cv-d, 1))',
        borderBottom: `2px solid ${modernColors.primary}`,
      }}
    >
      {text}
    </h2>
  );
}

const SECTION: CSSProperties = { marginBottom: 'calc(16px * var(--cv-d, 1))' };

export function USModernATSTemplate({ data, template, mode }: Props) {
  const heading = (key: HeadingKey, marginBottom?: number) => <Heading text={sectionHeading(data, key)} marginBottom={marginBottom} />;

  return (
    <div
      className="cv-template"
      style={{
        backgroundColor: 'white',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arimo', 'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '10.5pt',
        lineHeight: 'calc(1.15 * var(--cv-ld, 1))',
        color: modernColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 'calc(20px * var(--cv-d, 1))', paddingBottom: 'calc(16px * var(--cv-d, 1))', borderBottom: `2px solid ${modernColors.primary}` }}>
        <h1
          style={{
            fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
            fontSize: '22px',
            fontWeight: 'bold',
            color: modernColors.primary,
            marginBottom: 'calc(4px * var(--cv-d, 1))',
          }}
        >
          {data.personal.fullName || 'Your Name'}
        </h1>
        {data.personal.currentTitle && (
          <p
            style={{
              fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
              fontSize: '10pt',
              fontWeight: '500',
              color: modernColors.textLight,
              marginBottom: 'calc(16px * var(--cv-d, 1))',
            }}
          >
            {data.personal.currentTitle}
          </p>
        )}
        <ContactRows data={data} iconSize={12} iconColor={modernColors.primary} iconGap={6} textColor={modernColors.textLight} columnGap={16} rowGap={4} />
      </header>

      {/* Summary */}
      {data.summary && (
        <section style={SECTION}>
          {heading('summary')}
          <p style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: modernColors.text }}>{data.summary}</p>
        </section>
      )}

      {/* Experience */}
      {data.experience.length > 0 && (
        <section style={SECTION}>
          {heading('experience', 12)}
          <div className="cv-stack" style={stackGap(16)}>
            {data.experience.map((exp) => (
              <div className={exp.bullets.length <= 3 ? 'cv-exp cv-exp-short' : 'cv-exp'} key={exp.id}>
                <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                  <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: modernColors.text }}>{exp.position}</h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: modernColors.textLight }}>{formatDateRange(data, exp)}</span>
                </div>
                <p className="cv-entry-head" style={{ fontSize: '10pt', fontWeight: '500', marginBottom: 'calc(6px * var(--cv-d, 1))', color: modernColors.primary }}>
                  {exp.company}
                  {exp.location && <span style={{ color: modernColors.textLight }}> | {exp.location}</span>}
                </p>
                {/* Explicit bullet characters for PDF compatibility */}
                {exp.bullets.length > 0 && (
                  <div className="cv-bullets" style={{ marginTop: 'calc(4px * var(--cv-d, 1))', marginLeft: '4px' }}>
                    {exp.bullets.map((bullet, idx) => (
                      <div
                        className="cv-bullet"
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          breakInside: 'avoid',
                          gap: 'calc(8px * var(--cv-d, 1))',
                          fontSize: '10pt',
                          lineHeight: 'calc(1.4 * var(--cv-ld, 1))',
                          marginBottom: 'calc(3px * var(--cv-d, 1))',
                          color: modernColors.text,
                        }}
                      >
                        <span style={{ flexShrink: 0, marginTop: 'calc(1px * var(--cv-d, 1))' }}>•</span>
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
        <section style={SECTION}>
          {heading('education')}
          <div className="cv-stack" style={stackGap(8)}>
            {data.education.map((edu) => (
              <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 style={{ fontSize: '10.5pt', fontWeight: '600', color: modernColors.text }}>
                    {degreeText(data, edu)}
                  </h3>
                  <p style={{ fontSize: '10pt', color: modernColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: modernColors.textLight }}>{formatSingleDate(data, edu.endDate)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills: a tinted block with a teal bar, one "Label: a, b, c" line per group */}
      {data.skills.length > 0 && (
        <section style={SECTION}>
          <SkillLines heading={heading('skills')} tint={{ background: modernColors.tint, bar: modernColors.primary }} data={data} primary={modernColors.primary} text={modernColors.text} gap={8} lineHeight={1.35} />
        </section>
      )}

      {/* Certifications */}
      {data.certifications.length > 0 && (
        <section style={SECTION}>
          {heading('certifications')}
          <div className="cv-stack" style={stackGap(4)}>
            {data.certifications.map((cert) => (
              <p className="cv-entry" key={cert.id} style={{ fontSize: '10pt', color: modernColors.text }}>
                <span style={{ fontWeight: '500' }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: modernColors.textLight }}> ({cert.issuer})</span>}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Languages */}
      {data.languages.length > 0 && (
        <section style={SECTION}>
          {heading('languages')}
          <LanguageLine data={data} text={modernColors.text} lineHeight={1.35} />
        </section>
      )}

      {/* Projects */}
      {data.projects && data.projects.length > 0 && (
        <section style={SECTION}>
          {heading('projects')}
          {/* One line per project keeps the section short; a description that just repeats the name is dropped. */}
          {data.projects.map((project) => {
            const description = project.description?.trim();
            const showDescription = Boolean(description && description.toLowerCase() !== project.name.trim().toLowerCase());
            return (
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: modernColors.textLight, marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                <span style={{ fontWeight: 600, fontSize: '10.5pt', color: modernColors.text }}>{project.name}</span>
                {showDescription && <span>: {description}</span>}
                {project.technologies && project.technologies.length > 0 && <span style={{ fontSize: '10pt', color: modernColors.primary }}> ({project.technologies.join(', ')})</span>}
              </div>
            );
          })}
        </section>
      )}

      {/* Additional Information */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={SECTION}>
          {heading('additionalInfo')}
          <p style={{ fontSize: '10pt', color: modernColors.text }}>{data.additionalInfo.join(' • ')}</p>
        </section>
      )}

      {/* Custom Sections (generic fallback) */}
      {data.customSections &&
        data.customSections.length > 0 &&
        data.customSections.map((section) => (
          <section key={section.id} style={SECTION}>
            <Heading text={section.title} />
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
              {section.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '10pt', color: modernColors.text, marginBottom: 'calc(3px * var(--cv-d, 1))', lineHeight: 'calc(1.5 * var(--cv-ld, 1))' }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
