import type { ReactNode } from 'react';
import type { CVData } from '@/lib/cv-templates/types';
import { sectionHeading } from '@/lib/cv-templates/locale';

/**
 * The skills and languages grid the single-column templates share. Every skill
 * group and every skill renders: the old templates cut groups to 5 and items to
 * 5 without a word, so what the user downloaded could miss skills. The grid
 * wraps instead, three columns wide.
 */

interface SkillGridProps {
  data: CVData;
  primary: string;
  text: string;
  columnGap: number;
  rowGap: number;
  labelMarginBottom: number;
  labelLetterSpacing: string;
  itemGap: number;
  bulletGap: number;
  lineHeight: number;
  /** Languages sit after this many skill groups. Omit to put them last. */
  languagesAfter?: number;
}

export function SkillGrid({
  data,
  primary,
  text,
  columnGap,
  rowGap,
  labelMarginBottom,
  labelLetterSpacing,
  itemGap,
  bulletGap,
  lineHeight,
  languagesAfter,
}: SkillGridProps) {
  const cells: Array<{ key: string; label: string; items: ReactNode[] }> = data.skills.map((group, index) => ({
    key: `skill-${index}`,
    label: group.category,
    items: group.items.map((skill) => skill),
  }));

  if (data.languages.length > 0) {
    const languageCell = {
      key: 'languages',
      label: sectionHeading(data, 'languages'),
      items: data.languages.map((lang) => (
        <span key={lang.language}>
          <strong>{lang.language}{lang.proficiency ? ':' : ''}</strong>{lang.proficiency ? ` ${lang.proficiency}` : ''}
        </span>
      )),
    };
    const at = languagesAfter === undefined ? cells.length : Math.min(languagesAfter, cells.length);
    cells.splice(at, 0, languageCell);
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        columnGap: `${columnGap}px`,
        rowGap: `${rowGap}px`,
      }}
    >
      {cells.map((cell) => (
        <div key={cell.key} style={{ breakInside: 'avoid', minWidth: 0 }}>
          <h4
            style={{
              color: primary,
              fontWeight: 700,
              fontSize: '10pt',
              marginBottom: `${labelMarginBottom}px`,
              letterSpacing: labelLetterSpacing,
              breakAfter: 'avoid',
            }}
          >
            {/* Bold, mixed case, with a colon. An all-caps bold line reads as a section
                title to simple parsers, which then split the Skills section apart. */}
            {cell.label}:
          </h4>
          <div style={{ margin: 0 }}>
            {cell.items.map((item, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: `${bulletGap}px`,
                  fontSize: '10pt',
                  lineHeight,
                  marginBottom: `${itemGap}px`,
                  color: text,
                  breakInside: 'avoid',
                  overflowWrap: 'break-word',
                }}
              >
                <span style={{ flexShrink: 0 }}>•</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
