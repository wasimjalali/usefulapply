/**
 * The proofs that run before any mechanical edit is written.
 *
 * The content-conservation post-condition is the most important rule here and
 * it is a hard assertion, never a warning. Every leaf string on the CV is
 * counted before and after:
 *
 *   reorder        the multiset is identical
 *   delete         the multiset is the old one minus exactly the leaves of the
 *                  deleted item, and nothing else
 *   rename_heading the multiset is identical except the one heading, whose new
 *                  value came from a closed enum
 *
 * That turns "no operation may introduce a character of new prose" from a
 * prompt instruction into a property of the code. A model that returns a
 * cleverly reworded bullet in a reorder payload does not get a reworded bullet
 * written; it gets a refusal, because reorder rebuilds the array from the
 * ELEMENT REFERENCES it already held and never reads text out of the payload
 * at all. The conservation check is the second lock on the same door.
 *
 * The structural rules below are not style preferences. Each one is grounded in
 * what the six templates do with the object: they call .length and .map on the
 * five core arrays without guarding, and they gate every section on length > 0,
 * so an undefined array throws in render (the canvas blanks and the PDF
 * captures the blank) and an emptied array silently removes a whole heading.
 */

import { customKey, expKey, skillKey } from './handles';
import type { TailoredCV } from './types';

/** Keys an edit must never touch. The machine-checked version of CVPanel.onSave. */
const PRESERVED_KEYS = ['analysis', 'localizedStrings', 'personal', 'summary', 'additionalInfo'] as const;

export type Multiset = Map<string, number>;

/**
 * Every leaf string anywhere on the CV, counted.
 *
 * A generic deep walk on purpose: naming the fields would mean this check
 * silently stops covering any field added later, and the whole value of the
 * assertion is that it covers everything.
 */
export function leafMultiset(value: unknown, into: Multiset = new Map()): Multiset {
  if (typeof value === 'string') {
    into.set(value, (into.get(value) ?? 0) + 1);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) leafMultiset(item, into);
    return into;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) leafMultiset(item, into);
    return into;
  }
  return into;
}

function multisetOf(values: string[]): Multiset {
  const map: Multiset = new Map();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return map;
}

/**
 * Did the edit conserve content?
 *
 * `removed` is the exact list of leaf strings the operation is allowed to drop,
 * `added` the exact list it is allowed to introduce (only ever a heading from
 * the rename enum). Anything else, in either direction, is a refusal.
 */
export function assertConserved(
  before: TailoredCV,
  after: TailoredCV,
  removed: string[] = [],
  added: string[] = [],
): string | null {
  const beforeCounts = leafMultiset(before);
  const afterCounts = leafMultiset(after);
  const removedCounts = multisetOf(removed);
  const addedCounts = multisetOf(added);

  const keys = new Set<string>([...beforeCounts.keys(), ...afterCounts.keys()]);
  for (const leaf of keys) {
    const expected = (beforeCounts.get(leaf) ?? 0)
      - (removedCounts.get(leaf) ?? 0)
      + (addedCounts.get(leaf) ?? 0);
    const actual = afterCounts.get(leaf) ?? 0;
    if (expected !== actual) {
      // The leaf itself is the user's own CV text, so it is never echoed back
      // into a reply. The count mismatch is the whole finding.
      return 'That edit would have changed the wording, not just the order. Nothing was changed.';
    }
  }
  return null;
}

/**
 * Structural stability: what the templates need to be true to render at all.
 *
 * THIS FUNCTION MUST NEVER THROW. It is the only structural gate the chat route
 * puts in front of client-supplied CV JSON (`acceptTailoredCv`), so a throw here
 * is not a rejected CV, it is a 500 on the whole chat turn plus a PostHog
 * exception per request, when the correct outcome is to drop the CV and let the
 * conversation carry on. Every element is therefore treated as unknown and
 * checked before it is dereferenced, whatever the declared types promise: the
 * value arrives from `JSON.parse` and the types describe the happy path, not
 * what a client actually sent.
 */
export function validateCvShape(cv: TailoredCV): string | null {
  const arrays: Array<[string, unknown]> = [
    ['experience', cv.experience],
    ['education', cv.education],
    ['skills', cv.skills],
    ['languages', cv.languages],
    ['certifications', cv.certifications],
  ];
  for (const [name, value] of arrays) {
    if (!Array.isArray(value)) {
      return `That edit would have left ${name} missing, which breaks the CV canvas and the PDF. Nothing was changed.`;
    }
  }
  if (cv.projects !== undefined && !Array.isArray(cv.projects)) {
    return 'That edit would have left projects malformed. Nothing was changed.';
  }
  if (cv.customSections !== undefined && !Array.isArray(cv.customSections)) {
    return 'That edit would have left the custom sections malformed. Nothing was changed.';
  }
  if (cv.additionalInfo !== undefined && !Array.isArray(cv.additionalInfo)) {
    return 'That edit would have left the extra information malformed. Nothing was changed.';
  }

  for (const role of cv.experience as unknown[]) {
    if (!role || typeof role !== 'object') {
      return 'That edit would have left an empty slot where a role should be, which breaks the CV canvas. Nothing was changed.';
    }
    const bullets = (role as { bullets?: unknown }).bullets;
    if (!Array.isArray(bullets)) {
      return 'That edit would have left a role with no bullet list, which breaks the CV canvas. Nothing was changed.';
    }
    if (bullets.some((bullet) => typeof bullet !== 'string')) {
      return 'That edit would have left a bullet that is not text. Nothing was changed.';
    }
  }
  for (const group of cv.skills as unknown[]) {
    if (!group || typeof group !== 'object') {
      return 'That edit would have left an empty slot where a skills group should be. Nothing was changed.';
    }
    const items = (group as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return 'That edit would have left a skills group with no items list. Nothing was changed.';
    }
    if (items.some((item) => typeof item !== 'string')) {
      return 'That edit would have left a skill that is not text. Nothing was changed.';
    }
  }
  // All six templates gate a custom section on `customSections.length > 0` and
  // then call `section.items.map(...)` with no guard of their own, exactly like
  // the two loops above. No mechanical operation can produce a section without
  // items, but this is also the only structural gate in front of client JSON,
  // so it has to cover what the templates dereference.
  for (const section of (cv.customSections ?? []) as unknown[]) {
    if (!section || typeof section !== 'object') {
      return 'That edit would have left an empty slot where a custom section should be. Nothing was changed.';
    }
    const items = (section as { items?: unknown }).items;
    if (!Array.isArray(items)) {
      return 'That edit would have left a custom section with no items list, which breaks the CV canvas. Nothing was changed.';
    }
    if (items.some((item) => typeof item !== 'string')) {
      return 'That edit would have left a custom section entry that is not text. Nothing was changed.';
    }
  }
  if (!cv.personal || typeof cv.personal.fullName !== 'string' || !cv.personal.fullName.trim()) {
    return 'That edit would have removed the name from the CV. Nothing was changed.';
  }
  return null;
}

/** How many blank strings a CV carries where the templates render text. */
function blankCount(cv: TailoredCV): number {
  let blanks = 0;
  for (const role of cv.experience) {
    for (const bullet of role.bullets ?? []) if (!String(bullet).trim()) blanks += 1;
  }
  for (const group of cv.skills) {
    for (const item of group.items ?? []) if (!String(item).trim()) blanks += 1;
  }
  for (const heading of Object.values(cv.sectionHeaders ?? {})) {
    if (heading !== undefined && !String(heading).trim()) blanks += 1;
  }
  return blanks;
}

/**
 * An edit may never ADD a blank where a template renders text.
 *
 * Relative to the pre-image on purpose. A CV that already carries a blank bullet
 * from a canvas edit is still a CV the user is allowed to reorder, and an
 * absolute gate here would lock them out of the whole feature over a cosmetic
 * flaw no operation here caused.
 *
 * A blank heading in particular is unreachable while rename_heading picks from a
 * closed enum. Asserted anyway: an empty string falls straight through the
 * template's `||` to the English default, which reads to the user as a bug
 * rather than as the edit they asked for.
 */
export function validateNoNewBlanks(before: TailoredCV, after: TailoredCV): string | null {
  return blankCount(after) > blankCount(before)
    ? 'That edit would have left a blank line on the CV. Nothing was changed.'
    : null;
}

/**
 * Nothing a user can see may be emptied out from under them.
 *
 * Every template gates its sections on `length > 0`, so deleting the last
 * certification does not remove a certification, it removes the Certifications
 * heading from all six templates. Same for the last bullet on a role and the
 * last item in a skills group. Relative to the pre-image on purpose: a CV that
 * already had an empty list keeps it, and only the edit is judged.
 */
export function validateNoEmptying(before: TailoredCV, after: TailoredCV): string | null {
  const lists: Array<[string, unknown[] | undefined, string]> = [
    ['experience', after.experience, 'That would leave no work experience on the CV, so the whole section would disappear. Delete something smaller, or say you want the section gone.'],
    ['education', after.education, 'That would leave no education on the CV, so the whole section would disappear.'],
    ['skills', after.skills, 'That would leave no skills on the CV, so the whole section would disappear.'],
    ['languages', after.languages, 'That would leave no languages on the CV, so the whole section would disappear.'],
    ['certifications', after.certifications, 'That would leave no certifications on the CV, so the whole section would disappear.'],
    ['projects', after.projects, 'That would leave no projects on the CV, so the whole section would disappear.'],
    ['customSections', after.customSections, 'That would leave that custom section list empty, so it would disappear from the CV.'],
  ];
  for (const [name, list, message] of lists) {
    const previous = (before as unknown as Record<string, unknown[] | undefined>)[name];
    if (Array.isArray(previous) && previous.length > 0 && Array.isArray(list) && list.length === 0) {
      return message;
    }
  }

  // Matched by content key, not by the CV's own id fields: an id is written by
  // the model at generation time and nothing enforces that it is unique. No
  // operation can change a parent's identity fields, so the key is stable
  // across exactly the edits this runs after.
  for (const role of after.experience) {
    if (Array.isArray(role.bullets) && role.bullets.length === 0) {
      const had = before.experience.some(
        (entry) => expKey(entry) === expKey(role) && Array.isArray(entry.bullets) && entry.bullets.length > 0,
      );
      if (had) {
        return 'That is the last bullet on that role, and a role with nothing under it is a role worth dropping. Say if you want the whole role gone instead.';
      }
    }
  }
  for (const group of after.skills) {
    if (Array.isArray(group.items) && group.items.length === 0) {
      const had = before.skills.some(
        (entry) => skillKey(entry) === skillKey(group) && Array.isArray(entry.items) && entry.items.length > 0,
      );
      if (had) {
        return 'That is the last skill in that group. Delete the whole group instead if that is what you meant.';
      }
    }
  }
  for (const section of after.customSections ?? []) {
    if (Array.isArray(section.items) && section.items.length === 0) {
      const had = (before.customSections ?? []).some(
        (entry) => customKey(entry) === customKey(section) && Array.isArray(entry.items) && entry.items.length > 0,
      );
      if (had) {
        return 'That is the last item in that section. Delete the whole section instead if that is what you meant.';
      }
    }
  }
  return null;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>;
    const right = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if (!deepEqual(left[key], right[key])) return false;
    }
    return true;
  }
  return false;
}

/**
 * The keys a mechanical edit may never touch, checked by deep equality.
 *
 * `sectionHeaders` is in this set too, except for the single key a
 * rename_heading is allowed to change.
 */
export function assertPreservedKeys(
  before: TailoredCV,
  after: TailoredCV,
  renamedHeadingKey?: string,
): string | null {
  for (const key of PRESERVED_KEYS) {
    if (!deepEqual(before[key], after[key])) {
      return `That edit would have changed ${key}, which a structure edit never touches. Nothing was changed.`;
    }
  }
  const beforeHeadings = { ...(before.sectionHeaders ?? {}) } as Record<string, unknown>;
  const afterHeadings = { ...(after.sectionHeaders ?? {}) } as Record<string, unknown>;
  if (renamedHeadingKey) {
    delete beforeHeadings[renamedHeadingKey];
    delete afterHeadings[renamedHeadingKey];
  }
  if (!deepEqual(beforeHeadings, afterHeadings)) {
    return 'That edit would have changed a heading it was not asked to change. Nothing was changed.';
  }
  return null;
}

/** Every check, in one call. Returns a refusal message or null. */
export function validateEdit(
  before: TailoredCV,
  after: TailoredCV,
  opts: { removed?: string[]; added?: string[]; renamedHeadingKey?: string } = {},
): string | null {
  return validateCvShape(after)
    ?? assertConserved(before, after, opts.removed ?? [], opts.added ?? [])
    ?? assertPreservedKeys(before, after, opts.renamedHeadingKey)
    ?? validateNoEmptying(before, after)
    ?? validateNoNewBlanks(before, after);
}

/**
 * A content digest of the whole CV, used to prove the client is applying the
 * edit to the same document the server computed it from.
 *
 * Object keys are sorted before hashing, because the store rebuilds the CV by
 * spread in several places and key order is not stable across those paths.
 */
export function cvStructureDigest(cv: unknown): string {
  return hash(stableStringify(cv));
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function hash(value: string): string {
  // Two independently seeded FNV-1a passes, concatenated. One 32-bit hash over a
  // whole CV is short enough that an accidental collision is worth ruling out,
  // and this costs nothing.
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
