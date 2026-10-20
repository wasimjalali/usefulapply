/**
 * Non-destructive hide. With the old per-template caps gone, a CV that runs
 * long used to lose skills silently. Now nothing is dropped unless the user
 * chooses it: an item, skill group, skill or whole section can be hidden, the
 * content stays in the CV, and the canvas and every export skip it.
 *
 * The flags live in the CV JSON itself, so no migration is needed.
 */

import type { CVData } from './types';

export type HideableSection =
  | 'summary'
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'projects'
  | 'additionalInfo';

export function isSectionHidden(data: Pick<CVData, 'hiddenSections'>, section: HideableSection): boolean {
  return data.hiddenSections?.includes(section) ?? false;
}

/** The CV as a reader should see it: hidden things removed, everything else untouched. */
export function visibleCvData(data: CVData): CVData {
  const hide = (section: HideableSection) => isSectionHidden(data, section);

  const skills = hide('skills')
    ? []
    : data.skills
        .filter((group) => !group.hidden)
        .map((group) => {
          const hiddenItems = group.hiddenItems;
          if (!hiddenItems || hiddenItems.length === 0) return group;
          return { ...group, items: group.items.filter((item) => !hiddenItems.includes(item)) };
        })
        .filter((group) => group.items.length > 0);

  const projects = hide('projects') ? undefined : data.projects?.filter((project) => !project.hidden);
  const customSections = data.customSections?.filter((section) => !section.hidden);

  return {
    ...data,
    summary: hide('summary') ? undefined : data.summary,
    experience: hide('experience') ? [] : data.experience.filter((entry) => !entry.hidden),
    education: hide('education') ? [] : data.education.filter((entry) => !entry.hidden),
    skills,
    languages: hide('languages') ? [] : data.languages.filter((entry) => !entry.hidden),
    certifications: hide('certifications') ? [] : data.certifications.filter((entry) => !entry.hidden),
    projects: projects && projects.length > 0 ? projects : undefined,
    additionalInfo: hide('additionalInfo') ? undefined : data.additionalInfo,
    customSections: customSections && customSections.length > 0 ? customSections : undefined,
  };
}
