/**
 * Writes a rewritten section onto the tailored CV. Pure: a CV in, a CV out.
 * Shared by the browser (regenerate-client) and the server (the MCP
 * `rewrite_cv_section` tool), so both resolve the target the same way.
 *
 * Only the one field the rewrite targeted changes, so `analysis`,
 * `sectionHeaders` and `localizedStrings` survive by construction rather than
 * by reassembly.
 *
 * Returns null when the target is no longer on the CV. That is not an error
 * worth throwing: the section was deleted while the rewrite ran, and the
 * honest outcome is to leave the document alone.
 */

import type { TailoredCV } from './types';

/**
 * The rewrite targets the route accepts, mirroring CVSectionKind in
 * src/lib/agents/prompts/cv-prompt.ts. Exported as a value so a caller can
 * check a section name off the wire before it spends anything.
 */
export const CV_REWRITE_SECTIONS = [
  'summary',
  'experience_bullets',
  'project_description',
  'custom_section_items',
] as const;

export type CvRewriteSection = (typeof CV_REWRITE_SECTIONS)[number];

/**
 * The FIRST entry with this id, matching how `resolveCVSectionTarget` on the
 * server picks the entry it rewrites. Entry ids come from model-generated JSON
 * and nothing enforces that they are unique, which is why the structure tools
 * address items by a hash of their content instead. This path has to use the
 * id, because that is what the rewrite contract takes, so the least it can do
 * is resolve it the same way both ends do. Writing every match would rewrite a
 * role the user never named and destroy its bullets.
 */
function firstIndexById(list: Array<{ id: string }>, id: string | undefined): number {
  if (!id) return -1;
  return list.findIndex((entry) => entry.id === id);
}

export function applyRewrittenSection(
  cv: TailoredCV,
  kind: CvRewriteSection,
  id: string | undefined,
  content: string | string[],
): TailoredCV | null {
  if (kind === 'summary') {
    if (typeof content !== 'string') return null;
    return { ...cv, summary: content };
  }
  if (kind === 'experience_bullets') {
    if (!Array.isArray(content)) return null;
    const at = firstIndexById(cv.experience, id);
    if (at < 0) return null;
    const experience = [...cv.experience];
    experience[at] = { ...experience[at], bullets: content };
    return { ...cv, experience };
  }
  if (kind === 'project_description') {
    if (typeof content !== 'string' || !cv.projects) return null;
    const at = firstIndexById(cv.projects, id);
    if (at < 0) return null;
    const projects = [...cv.projects];
    projects[at] = { ...projects[at], description: content };
    return { ...cv, projects };
  }
  if (!Array.isArray(content) || !cv.customSections) return null;
  const at = firstIndexById(cv.customSections, id);
  if (at < 0) return null;
  const customSections = [...cv.customSections];
  customSections[at] = { ...customSections[at], items: content };
  return { ...cv, customSections };
}
