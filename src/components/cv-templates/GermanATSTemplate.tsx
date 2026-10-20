/**
 * German ATS Template
 *
 * Single column with photo support, so every parser reads it top to bottom: header with the photo
 * top right, Profil, Berufserfahrung, Ausbildung, Kenntnisse, Sprachen, Zertifikate (the order
 * German Lebensläufe use and ATS parsers expect). The identity is the slate blue, the serif headings
 * with a rule and the header with the photo.
 * All section headers are language-agnostic: they come from data.sectionHeaders (AI output) with
 * standard defaults for the CV's language.
 */

import type { CSSProperties } from 'react';
import { CVData, CVTemplate } from '@/lib/cv-templates/types';
import { rootBox, type CvRenderMode } from '@/lib/cv-templates/print-spec';
import { cvPaper } from '@/lib/cv-templates/paper';
import { ContactRows, LanguageLine, SignatureBlock, SkillLines, stackGap } from './shared';
import { sectionHeading, formatDateRange, formatSingleDate, degreeText, labelColon, uiText, type HeadingKey } from '@/lib/cv-templates/locale';
import { formatBirthDate } from '@/lib/cv-templates/birthdate';

interface Props {
  data: CVData;
  template: CVTemplate;
  photoUrl?: string;
  /** `print` hides edit affordances and drops the page box so the export owns the margins. */
  mode?: CvRenderMode;
}

const germanColors = {
  primary: '#1E3A5F', // Refined slate blue - elegant & ATS-safe
  text: '#1A1A1A', // Near-black for body
  textLight: '#4A5568', // Muted grey for secondary
  accent: '#1E3A5F', // Slate blue for highlights
};

function Heading({ text, marginBottom = 6 }: { text: string; marginBottom?: number }) {
  return (
    <h2
      style={{
        fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
        fontSize: '10.5pt',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        letterSpacing: '0.4px',
        color: germanColors.primary,
        marginBottom: `calc(${marginBottom}px * var(--cv-d, 1))`,
        paddingBottom: 'calc(8px * var(--cv-d, 1))',
        borderBottom: `2px solid ${germanColors.primary}`,
      }}
    >
      {text}
    </h2>
  );
}

const SECTION: CSSProperties = { marginBottom: 'calc(14px * var(--cv-d, 1))' };

export function GermanATSTemplate({ data, template, photoUrl, mode }: Props) {
  const heading = (key: HeadingKey, marginBottom?: number) => <Heading text={sectionHeading(data, key)} marginBottom={marginBottom} />;

  return (
    <div
      className="cv-template"
      style={{
        backgroundColor: 'white',
        pageBreakAfter: 'auto',
        pageBreakInside: 'auto',
        fontFamily: "'Arimo', 'Arial', 'Helvetica Neue', 'Helvetica', sans-serif",
        fontSize: '10pt',
        lineHeight: 'calc(1.2 * var(--cv-ld, 1))',
        color: germanColors.text,
        ...rootBox(template.id, mode, cvPaper(data)),
        fontVariantLigatures: 'none',
      }}
    >
      {/* Header: name and contact on the left, photo top right (German standard) */}
      <header style={{ marginBottom: 'calc(20px * var(--cv-d, 1))', paddingBottom: 'calc(16px * var(--cv-d, 1))', borderBottom: `2px solid ${germanColors.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'calc(20px * var(--cv-d, 1))' }}>
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                fontSize: '24px',
                fontWeight: 'bold',
                color: germanColors.primary,
                marginBottom: 'calc(4px * var(--cv-d, 1))',
              }}
            >
              {data.personal.fullName || 'Your Name'}
            </h1>
            {data.personal.currentTitle && (
              <p
                style={{
                  fontFamily: "'Gelasio', 'Georgia', 'Times New Roman', serif",
                  fontSize: '10.5pt',
                  fontWeight: '600',
                  color: germanColors.textLight,
                  marginBottom: 'calc(16px * var(--cv-d, 1))',
                }}
              >
                {data.personal.currentTitle}
              </p>
            )}
            <ContactRows data={data} iconSize={12} iconColor={germanColors.primary} iconGap={6} textColor={germanColors.textLight} columnGap={16} rowGap={4} />
            {/* Date of birth and nationality: standard for German CVs */}
            {(data.personal.dateOfBirth || data.personal.nationality) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'calc(16px * var(--cv-d, 1))', fontSize: '10pt', color: germanColors.textLight, marginTop: 'calc(6px * var(--cv-d, 1))' }}>
                {data.personal.dateOfBirth && (
                  <span>
                    <strong style={{ color: germanColors.primary }}>{uiText(data, 'dateOfBirthLabel')}{labelColon(data)}</strong> {formatBirthDate(data)}
                  </span>
                )}
                {data.personal.nationality && (
                  <span>
                    <strong style={{ color: germanColors.primary }}>{uiText(data, 'nationalityLabel')}{labelColon(data)}</strong> {data.personal.nationality}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Photo: top right, German CV standard 3.5 cm x 4.7 cm */}
          {photoUrl && (
            <div style={{ width: '35mm', height: '47mm', flexShrink: 0, border: '0.5px solid #d0d0d0', borderRadius: '2px', overflow: 'hidden' }}>
              <img src={photoUrl} alt="Profile Photo" style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'crisp-edges' }} />
            </div>
          )}
        </div>
      </header>

      {/* Profil */}
      {data.summary && (
        <section style={{ marginBottom: 'calc(16px * var(--cv-d, 1))' }}>
          {heading('summary')}
          <p style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: germanColors.text }}>{data.summary}</p>
        </section>
      )}

      {/* Berufserfahrung */}
      {data.experience.length > 0 && (
        <section style={SECTION}>
          {heading('experience', 10)}
          <div className="cv-stack" style={stackGap(14)}>
            {data.experience.map((exp) => (
              <div className={exp.bullets.length <= 3 ? 'cv-exp cv-exp-short' : 'cv-exp'} key={exp.id}>
                <div className="cv-entry-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'calc(2px * var(--cv-d, 1))' }}>
                  <h3 style={{ fontSize: '10.5pt', fontWeight: 'bold', color: germanColors.text }}>{exp.position}</h3>
                  <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: germanColors.textLight }}>{formatDateRange(data, exp)}</span>
                </div>
                <p className="cv-entry-head" style={{ fontSize: '10pt', fontWeight: '600', marginBottom: 'calc(6px * var(--cv-d, 1))', color: germanColors.primary }}>
                  {exp.company}
                  {exp.location && <span style={{ color: germanColors.textLight }}> | {exp.location}</span>}
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
                          color: germanColors.text,
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

      {/* Ausbildung */}
      {data.education.length > 0 && (
        <section style={SECTION}>
          {heading('education')}
          <div className="cv-stack" style={stackGap(8)}>
            {data.education.map((edu) => (
              <div className="cv-entry" key={edu.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div>
                  <h3 style={{ fontSize: '10pt', fontWeight: '600', color: germanColors.text }}>
                    {degreeText(data, edu)}
                  </h3>
                  <p style={{ fontSize: '10pt', color: germanColors.textLight }}>
                    {edu.institution}
                    {edu.grade && <span> | {uiText(data, 'gradePrefix')} {edu.grade}</span>}
                  </p>
                </div>
                {edu.endDate && <span style={{ fontSize: '10pt', whiteSpace: 'nowrap', color: germanColors.textLight }}>{formatSingleDate(data, edu.endDate)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kenntnisse: one "Label: a, b, c" line per group */}
      {data.skills.length > 0 && (
        <section style={SECTION}>
          <SkillLines heading={heading('skills')} data={data} primary={germanColors.text} text={germanColors.text} gap={8} lineHeight={1.35} />
        </section>
      )}

      {/* Sprachen */}
      {data.languages.length > 0 && (
        <section style={SECTION}>
          {heading('languages')}
          <LanguageLine data={data} text={germanColors.text} lineHeight={1.35} />
        </section>
      )}

      {/* Zertifikate */}
      {data.certifications.length > 0 && (
        <section style={SECTION}>
          {heading('certifications')}
          <div className="cv-stack" style={stackGap(4)}>
            {data.certifications.map((cert) => (
              <p className="cv-entry" key={cert.id} style={{ fontSize: '10pt', color: germanColors.text }}>
                <span style={{ fontWeight: 'bold' }}>{cert.name}</span>
                {cert.issuer && <span style={{ color: germanColors.textLight }}> ({cert.issuer})</span>}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Projekte */}
      {data.projects && data.projects.length > 0 && (
        <section style={SECTION}>
          {heading('projects')}
          {/* One line per project keeps the section short; a description that just repeats the name is dropped. */}
          {data.projects.map((project) => {
            const description = project.description?.trim();
            const showDescription = Boolean(description && description.toLowerCase() !== project.name.trim().toLowerCase());
            return (
              <div key={project.id} style={{ fontSize: '10pt', lineHeight: 'calc(1.5 * var(--cv-ld, 1))', color: germanColors.textLight, marginBottom: 'calc(4px * var(--cv-d, 1))' }}>
                <span style={{ fontWeight: 600, fontSize: '10pt', color: germanColors.text }}>{project.name}</span>
                {showDescription && <span>: {description}</span>}
                {project.technologies && project.technologies.length > 0 && <span style={{ fontSize: '10pt', color: germanColors.primary }}> ({project.technologies.join(', ')})</span>}
              </div>
            );
          })}
        </section>
      )}

      {/* Weitere Angaben */}
      {data.additionalInfo && data.additionalInfo.length > 0 && (
        <section style={SECTION}>
          {heading('additionalInfo')}
          <p style={{ fontSize: '10pt', color: germanColors.text }}>{data.additionalInfo.join(' • ')}</p>
        </section>
      )}

      {/* Custom Sections (generic fallback) */}
      {data.customSections &&
        data.customSections.length > 0 &&
        data.customSections.map((section) => (
          <section key={section.id} style={{ marginBottom: 'calc(18px * var(--cv-d, 1))' }}>
            <Heading text={section.title} marginBottom={8} />
            <ul style={{ listStyleType: 'disc', paddingLeft: '18px', margin: 0 }}>
              {section.items.map((item, idx) => (
                <li key={idx} style={{ fontSize: '10pt', color: germanColors.text, marginBottom: 'calc(3px * var(--cv-d, 1))', lineHeight: 'calc(1.5 * var(--cv-ld, 1))' }}>
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}

      {/* The signature spans the full content width */}
      <SignatureBlock data={data} color={germanColors.textLight} lineColor={germanColors.text} />
    </div>
  );
}
