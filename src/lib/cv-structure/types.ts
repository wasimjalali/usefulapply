/**
 * Shared types for mechanical CV structure edits.
 *
 * `TailoredCV` is typed on the store's `optimizedCVData`, NOT on `CVData` from
 * `@/lib/cv-templates/types`. The two are near-duplicates and `buildCvData()`
 * maps between them, so picking the wrong one would compile and then write the
 * wrong shape into the session. The store type is what `CVPanel.onSave` writes
 * and what `useSupabaseSync` persists, so it is the one an edit has to produce.
 *
 * The import is type-only on purpose: `useSessionStore` reaches for
 * `localStorage` at module scope, and these functions run on the server too.
 */

import type { ApplicationSession } from '@/store/useSessionStore';

export type TailoredCV = NonNullable<ApplicationSession['optimizedCVData']>;

export type ExperienceEntry = TailoredCV['experience'][number];
export type EducationEntry = TailoredCV['education'][number];
export type SkillGroup = TailoredCV['skills'][number];
export type LanguageEntry = TailoredCV['languages'][number];
export type CertificationEntry = TailoredCV['certifications'][number];
export type ProjectEntry = NonNullable<TailoredCV['projects']>[number];
export type CustomSectionEntry = NonNullable<TailoredCV['customSections']>[number];

/**
 * The kinds of thing an operation can address. A handle is `<kind>:<key>`,
 * where the key is a hash of the item's own content (see handles.ts).
 *
 * `bullet`, `skillitem` and `customitem` are scoped by their parent's key, so
 * the same bullet text under two different roles is two different handles.
 */
export type HandleKind =
  | 'exp'
  | 'edu'
  | 'skill'
  | 'lang'
  | 'cert'
  | 'proj'
  | 'custom'
  | `bullet:${string}`
  | `skillitem:${string}`
  | `customitem:${string}`;

/**
 * A reorderable list. Closed set: nothing outside this can be reordered, and
 * `reorder` is the only way anything moves.
 *
 * Deliberately absent: `additionalInfo` (every template renders it as one
 * dot-joined line, so its order is invisible) and any cross-section move
 * (moving a certification into skills reshapes an object into a string, which
 * is a rewrite, not a move).
 */
export type ListHandle =
  | 'experience'
  | 'education'
  | 'skills'
  | 'certifications'
  | 'languages'
  | 'projects'
  | 'customSections'
  | `bullets:${string}`
  | `skillitems:${string}`
  | `customitems:${string}`;

export interface OutlineItem {
  handle: string;
  /** Flattened, control-stripped, capped and wrapped in << >>, read as data. */
  label: string;
  /**
   * Two items in one list hash to the same key (identical content), so neither
   * can be addressed without guessing which one was meant. Marked, never
   * disambiguated with an index: an index suffix would smuggle positional
   * addressing back in through the side door.
   */
  ambiguous?: true;
  /** For an experience row: the handle of its own bullet list. */
  bullets?: ListHandle;
  /** For a skill group or custom section: the handle of its own item list. */
  items?: ListHandle;
}

export interface OutlineList {
  list: ListHandle;
  items: OutlineItem[];
}

export interface CvOutline {
  lists: OutlineList[];
  /** Current heading text per renameable section key. */
  headings: Record<string, string>;
  /** The closed set of headings each section may be renamed to, in this CV's language. */
  renameable_as: Record<string, string[]>;
  language: string;
  /**
   * Parts of the CV no handle can reach, and what the user has to do about it.
   * Two roles with the same title, employer and start date share one parent
   * key, so neither one's bullets can be addressed without guessing. The list
   * is omitted entirely when everything is addressable.
   */
  unaddressable?: string[];
}

export type OpResult =
  | { ok: true; cv: TailoredCV }
  | { ok: false; error: string };
