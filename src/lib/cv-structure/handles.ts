/**
 * Content-derived handles for mechanical CV edits.
 *
 * A handle is `<kind>:<key>` where the key is a short hash of the item's own
 * content. No indices, and no reliance on the CV's own `id` fields (they are
 * model-generated at write time and nothing enforces that they are unique or
 * stable).
 *
 * THE GUARANTEE THIS SCHEME BUYS, and the whole reason for it:
 *
 *   A stale outline can only ever produce a FAILED resolution, never a WRONG
 *   one.
 *
 * After a reorder, every surviving handle is byte-identical, because no content
 * changed. After a delete, the deleted handle stops resolving and every other
 * handle is untouched. So a model holding an outline it read before an earlier
 * edit in the same turn can miss, but it cannot hit the wrong item. Index-based
 * addressing has exactly the opposite property: after one delete every index
 * past it silently points at its neighbour.
 *
 * Two items in one list with identical content hash to the same key. Those are
 * marked `ambiguous` and refuse to resolve, rather than being separated by an
 * index suffix, which would reintroduce positional addressing.
 *
 * AMBIGUITY IS CHECKED AT THE PARENT TOO, not only inside the list that was
 * resolved. A nested list handle is `bullets:<parentKey>`, and `expKey` is
 * company + position + start date, `skillKey` is the category alone,
 * `customKey` is the title alone. Two "Consultant, Self-employed, 2020-01"
 * rows, or two "Tools" skill groups, are ordinary CVs, and they produce one
 * parent key for two parents. Taking the FIRST match there would resolve a
 * child handle against the wrong parent and delete a bullet the user did not
 * point at, which is exactly the wrong-resolution the scheme above exists to
 * make impossible. So `nestedParent` counts matches and refuses on more than
 * one, and `buildOutline` never emits a nested list under an ambiguous parent.
 */

import {
  headingOptions,
  inferCvLanguageFromHeaders,
  RENAMEABLE_SECTION_KEYS,
  generateLocalizedHeaders,
  type CvHeaderLanguage,
} from '@/lib/cv-parser/section-splitter';
import { resolveHeading, type HeadingKey } from '@/lib/cv-templates/locale';
import type {
  CvOutline,
  ListHandle,
  OutlineItem,
  OutlineList,
  TailoredCV,
} from './types';

/** Labels are quoted back to the model, so they get the read-tools treatment. */
const MAX_LABEL_CHARS = 60;

export function normalize(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** FNV-1a, 32-bit, rendered as the low 6 hex digits. */
export function fnv1a6(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0').slice(-6);
}

function key(...parts: Array<string | null | undefined>): string {
  return fnv1a6(parts.map(normalize).join(' | '));
}

/** One line, no control characters or angle brackets, capped, wrapped as data. */
function label(value: string | null | undefined): string {
  const clean = (value ?? '')
    .replace(/[\u0000-\u001F\u007F<>]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const text = clean.length > MAX_LABEL_CHARS ? `${clean.slice(0, MAX_LABEL_CHARS)}...` : clean;
  return `<<${text || 'untitled'}>>`;
}

// ---------------------------------------------------------------------------
// Identity strings. One per kind, exactly as the design fixes them. Changing
// one of these invalidates every outline a client is currently holding, which
// is safe (a stale handle fails to resolve) but noisy, so do not churn them.
// ---------------------------------------------------------------------------

export function expKey(entry: { company?: string; position?: string; startDate?: string }): string {
  return key(entry.company, entry.position, entry.startDate);
}

export function eduKey(entry: { institution?: string; degree?: string; field?: string }): string {
  return key(entry.institution, entry.degree, entry.field);
}

export function skillKey(entry: { category?: string }): string {
  return key(entry.category);
}

export function langKey(entry: { language?: string }): string {
  return key(entry.language);
}

export function certKey(entry: { name?: string; issuer?: string }): string {
  return key(entry.name, entry.issuer);
}

export function projKey(entry: { name?: string }): string {
  return key(entry.name);
}

export function customKey(entry: { title?: string }): string {
  return key(entry.title);
}

/** A child string's key is scoped by its parent's key, so it cannot collide across parents. */
export function childKey(parentKey: string, text: string): string {
  return key(parentKey, text);
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

type NestedKind = 'bullets' | 'skillitems' | 'customitems';

/** Why a nested list handle does or does not have exactly one parent. */
export type NestedParent =
  | { ok: true; kind: NestedKind; index: number }
  | { ok: false; kind: NestedKind; reason: 'missing' | 'ambiguous' }
  | { ok: false; kind: null; reason: 'not_nested' };

/**
 * The single parent a nested list handle points at.
 *
 * Counting rather than `.find`: more than one parent with that key means the
 * handle addresses two different lists at once, and picking either would be a
 * wrong resolution rather than a failed one.
 */
export function nestedParent(cv: TailoredCV, list: string): NestedParent {
  const nested = splitNested(list);
  if (!nested) return { ok: false, kind: null, reason: 'not_nested' };
  const [parents, keyOf] = nested.kind === 'bullets'
    ? [(cv.experience ?? []) as unknown[], (entry: unknown) => expKey(entry as never)]
    : nested.kind === 'skillitems'
      ? [(cv.skills ?? []) as unknown[], (entry: unknown) => skillKey(entry as never)]
      : [(cv.customSections ?? []) as unknown[], (entry: unknown) => customKey(entry as never)];

  let index = -1;
  let matches = 0;
  for (let i = 0; i < parents.length; i += 1) {
    const parent = parents[i];
    if (!parent || typeof parent !== 'object') continue;
    if (keyOf(parent) !== nested.parentKey) continue;
    matches += 1;
    if (matches > 1) return { ok: false, kind: nested.kind, reason: 'ambiguous' };
    index = i;
  }
  if (matches !== 1) return { ok: false, kind: nested.kind, reason: 'missing' };
  return { ok: true, kind: nested.kind, index };
}

/**
 * Read one reorderable list off the CV. Returns null when the list handle is
 * not a list this CV has, which includes a nested list whose parent is gone
 * AND a nested list whose parent key matches two parents.
 */
export function readList(cv: TailoredCV, list: string): unknown[] | null {
  if (list === 'experience') return cv.experience ?? null;
  if (list === 'education') return cv.education ?? null;
  if (list === 'skills') return cv.skills ?? null;
  if (list === 'certifications') return cv.certifications ?? null;
  if (list === 'languages') return cv.languages ?? null;
  if (list === 'projects') return cv.projects ?? null;
  if (list === 'customSections') return cv.customSections ?? null;

  const parent = nestedParent(cv, list);
  if (!parent.ok) return null;
  if (parent.kind === 'bullets') return (cv.experience ?? [])[parent.index]?.bullets ?? null;
  if (parent.kind === 'skillitems') return (cv.skills ?? [])[parent.index]?.items ?? null;
  return (cv.customSections ?? [])[parent.index]?.items ?? null;
}

/**
 * Why a list handle does not address exactly one list on this CV, as a sentence
 * the user can act on, or null when it does.
 *
 * Without this an ambiguous parent reads back as "that is not a list I can
 * reorder", which sends the user looking for a typo in a handle that is
 * perfectly well formed. The fix is theirs to make in the canvas, so the
 * message has to name it.
 */
export function listRefusal(cv: TailoredCV, list: string): string | null {
  if (readList(cv, list) !== null) return null;
  const parent = nestedParent(cv, list);
  if (parent.ok || parent.reason !== 'ambiguous') return null;
  return parent.kind === 'bullets'
    ? 'Two roles on this CV have the same job title, employer and start date, so I cannot tell which one\'s bullets you mean. Change one of them in the CV canvas first, then ask me again.'
    : parent.kind === 'skillitems'
      ? 'Two skill groups on this CV have the same name, so I cannot tell which one you mean. Rename one of them in the CV canvas first, then ask me again.'
      : 'Two custom sections on this CV have the same title, so I cannot tell which one you mean. Rename one of them in the CV canvas first, then ask me again.';
}

function splitNested(
  list: string,
): { kind: 'bullets' | 'skillitems' | 'customitems'; parentKey: string } | null {
  const colon = list.indexOf(':');
  if (colon <= 0) return null;
  const kind = list.slice(0, colon);
  const parentKey = list.slice(colon + 1);
  if (!parentKey) return null;
  if (kind === 'bullets' || kind === 'skillitems' || kind === 'customitems') {
    return { kind, parentKey };
  }
  return null;
}

/**
 * Write one reorderable list back, cloning only the path down to it. Every
 * other object on the CV keeps its identity, which is what makes the
 * preserved-key deep-equality check cheap and exact.
 *
 * The replacement array must already be a permutation or a deletion of the
 * array `readList` returned; nothing here checks that. ops.ts builds it and
 * validate.ts proves it.
 */
export function writeList(cv: TailoredCV, list: string, next: unknown[]): TailoredCV | null {
  if (list === 'experience') return { ...cv, experience: next as TailoredCV['experience'] };
  if (list === 'education') return { ...cv, education: next as TailoredCV['education'] };
  if (list === 'skills') return { ...cv, skills: next as TailoredCV['skills'] };
  if (list === 'certifications') return { ...cv, certifications: next as TailoredCV['certifications'] };
  if (list === 'languages') return { ...cv, languages: next as TailoredCV['languages'] };
  if (list === 'projects') return { ...cv, projects: next as TailoredCV['projects'] };
  if (list === 'customSections') return { ...cv, customSections: next as TailoredCV['customSections'] };

  // Same single-parent rule as readList. A key that matches two parents is a
  // refusal here too, so a write can never land on a parent the read did not
  // come from.
  const parent = nestedParent(cv, list);
  if (!parent.ok) return null;
  const { index } = parent;

  if (parent.kind === 'bullets') {
    const experience = cv.experience ?? [];
    const updated = experience.slice();
    updated[index] = { ...experience[index], bullets: next as string[] };
    return { ...cv, experience: updated };
  }
  if (parent.kind === 'skillitems') {
    const skills = cv.skills ?? [];
    const updated = skills.slice();
    updated[index] = { ...skills[index], items: next as string[] };
    return { ...cv, skills: updated };
  }
  const sections = cv.customSections ?? [];
  const updated = sections.slice();
  updated[index] = { ...sections[index], items: next as string[] };
  return { ...cv, customSections: updated };
}

/** The handle for element `i` of a list, or null when the list is not addressable. */
export function handleForIndex(cv: TailoredCV, list: string, index: number): string | null {
  const items = readList(cv, list);
  if (!items || index < 0 || index >= items.length) return null;
  const entry = items[index] as Record<string, unknown>;
  // A top-level list holds objects and a nested list holds strings. An empty
  // slot in a top-level list would throw inside the key functions below, and a
  // throw out of here is a 500 on the chat turn rather than a refusal, so it
  // becomes a null the caller turns into "that list is not addressable".
  if (splitNested(list) === null && (!entry || typeof entry !== 'object')) return null;

  if (list === 'experience') return `exp:${expKey(entry as never)}`;
  if (list === 'education') return `edu:${eduKey(entry as never)}`;
  if (list === 'skills') return `skill:${skillKey(entry as never)}`;
  if (list === 'certifications') return `cert:${certKey(entry as never)}`;
  if (list === 'languages') return `lang:${langKey(entry as never)}`;
  if (list === 'projects') return `proj:${projKey(entry as never)}`;
  if (list === 'customSections') return `custom:${customKey(entry as never)}`;

  const nested = splitNested(list);
  if (!nested) return null;
  const text = items[index];
  // Every nested list is a list of plain strings. Anything else is a malformed
  // CV, and the caller turns a null here into a refusal rather than a guess.
  if (typeof text !== 'string') return null;
  const prefix = nested.kind === 'bullets'
    ? 'bullet'
    : nested.kind === 'skillitems' ? 'skillitem' : 'customitem';
  return `${prefix}:${nested.parentKey}:${childKey(nested.parentKey, text)}`;
}

/**
 * Every handle in one list, in list order, with duplicates flagged.
 *
 * A duplicated handle means two items whose addressing content is identical.
 * Both are marked and neither resolves, so no operation can act on either.
 */
export function listHandles(
  cv: TailoredCV,
  list: string,
): Array<{ handle: string; ambiguous: boolean }> | null {
  const items = readList(cv, list);
  if (!items) return null;
  const handles: string[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const handle = handleForIndex(cv, list, i);
    if (handle === null) return null;
    handles.push(handle);
  }
  const seen = new Map<string, number>();
  for (const handle of handles) seen.set(handle, (seen.get(handle) ?? 0) + 1);
  return handles.map((handle) => ({ handle, ambiguous: (seen.get(handle) ?? 0) > 1 }));
}

/** The list a handle belongs to, derived from its kind alone. */
export function listForHandle(handle: string): ListHandle | null {
  const parts = handle.split(':');
  if (parts.length === 2) {
    const [kind] = parts;
    if (kind === 'exp') return 'experience';
    if (kind === 'edu') return 'education';
    if (kind === 'skill') return 'skills';
    if (kind === 'cert') return 'certifications';
    if (kind === 'lang') return 'languages';
    if (kind === 'proj') return 'projects';
    if (kind === 'custom') return 'customSections';
    return null;
  }
  if (parts.length === 3) {
    const [kind, parentKey] = parts;
    if (!parentKey) return null;
    if (kind === 'bullet') return `bullets:${parentKey}`;
    if (kind === 'skillitem') return `skillitems:${parentKey}`;
    if (kind === 'customitem') return `customitems:${parentKey}`;
  }
  return null;
}

/**
 * Where a handle points today, resolved against the CV given.
 *
 * Returns null when it does not resolve: the item is gone, its content changed,
 * or it is one of two identical items and therefore not addressable. All three
 * are refusals, never a fallback to a neighbour.
 */
export function resolveHandle(
  cv: TailoredCV,
  handle: string,
): { list: ListHandle; index: number } | null {
  const list = listForHandle(handle);
  if (!list) return null;
  const handles = listHandles(cv, list);
  if (!handles) return null;
  const matches = handles
    .map((entry, index) => ({ ...entry, index }))
    .filter((entry) => entry.handle === handle);
  if (matches.length !== 1 || matches[0].ambiguous) return null;
  return { list, index: matches[0].index };
}

/**
 * Why a handle does not resolve, as a sentence the user can act on, or null
 * when it does.
 *
 * Two shapes of ambiguity end up here and they need different sentences: the
 * handle's PARENT matches two parents (two roles with the same title, employer
 * and start date), or the handle itself matches two entries in one list (two
 * identical bullets under one role). Both are the user's to fix in the canvas,
 * so both have to say what to fix rather than "I cannot find that".
 */
export function handleRefusal(cv: TailoredCV, handle: string): string | null {
  const list = listForHandle(handle);
  if (!list) return null;
  const nested = listRefusal(cv, list);
  if (nested) return nested;
  const handles = listHandles(cv, list);
  if (!handles) return null;
  const matches = handles.filter((entry) => entry.handle === handle);
  if (matches.length < 2) return null;
  return 'Two entries there read exactly the same, so I cannot tell which one you mean. Change the wording of one of them in the CV canvas first, then ask me again.';
}

// ---------------------------------------------------------------------------
// Outline
// ---------------------------------------------------------------------------

function itemLabel(cv: TailoredCV, list: string, index: number): string {
  const items = readList(cv, list) ?? [];
  const entry = items[index] as Record<string, unknown>;
  if (typeof entry === 'string') return label(entry);
  if (list === 'experience') {
    return label([entry.position, entry.company, entry.startDate].filter(Boolean).join(', '));
  }
  if (list === 'education') {
    return label([entry.degree, entry.field, entry.institution].filter(Boolean).join(', '));
  }
  if (list === 'skills') return label(String(entry.category ?? ''));
  if (list === 'certifications') {
    return label([entry.name, entry.issuer].filter(Boolean).join(', '));
  }
  if (list === 'languages') {
    return label([entry.language, entry.proficiency].filter(Boolean).join(', '));
  }
  if (list === 'projects') return label(String(entry.name ?? ''));
  if (list === 'customSections') return label(String(entry.title ?? ''));
  return label('');
}

/**
 * One list's items, ready to send to the model.
 *
 * Lists are NEVER truncated. A truncated list makes reorder's permutation check
 * unsatisfiable, because the model cannot name items it was not shown. Only the
 * label text is capped.
 */
/**
 * Is this entry hidden from the CV? Whole entries and skill groups carry
 * `hidden`, a single skill is listed in its group's `hiddenItems`, and the
 * bullets or items of a hidden role or section are hidden with it.
 */
export function isItemHidden(cv: TailoredCV, list: string, index: number): boolean {
  const items = readList(cv, list);
  if (!items) return false;
  const entry = items[index];
  if (entry && typeof entry === 'object') return (entry as { hidden?: boolean }).hidden === true;
  const parent = nestedParent(cv, list);
  if (!parent.ok) return false;
  if (parent.kind === 'skillitems') {
    const group = (cv.skills ?? [])[parent.index];
    return group?.hidden === true || (typeof entry === 'string' && (group?.hiddenItems ?? []).includes(entry));
  }
  if (parent.kind === 'bullets') return (cv.experience ?? [])[parent.index]?.hidden === true;
  return (cv.customSections ?? [])[parent.index]?.hidden === true;
}

export function buildListOutline(cv: TailoredCV, list: ListHandle): OutlineList | null {
  const handles = listHandles(cv, list);
  if (!handles) return null;
  const items: OutlineItem[] = handles.map((entry, index) => {
    const item: OutlineItem = { handle: entry.handle, label: itemLabel(cv, list, index) };
    if (entry.ambiguous) item.ambiguous = true;
    if (isItemHidden(cv, list, index)) item.hidden = true;
    // An ambiguous parent gets no pointer to its own nested list. That list
    // handle would name two lists at once, so it resolves to neither, and
    // offering it would only invite an edit that has to be refused.
    if (entry.ambiguous) return item;
    if (list === 'experience') {
      item.bullets = `bullets:${entry.handle.split(':')[1]}`;
    } else if (list === 'skills') {
      item.items = `skillitems:${entry.handle.split(':')[1]}`;
    } else if (list === 'customSections') {
      item.items = `customitems:${entry.handle.split(':')[1]}`;
    }
    return item;
  });
  return { list, items };
}

/** The language this CV's headings are written in. */
export function cvLanguage(cv: TailoredCV): CvHeaderLanguage {
  return inferCvLanguageFromHeaders(cv.sectionHeaders);
}

/**
 * The heading a section shows today, which is what the template renders: a
 * renamed heading as chosen, an unrenamed default normalized to the standard
 * ATS wording, and the localized default when nothing is stored.
 */
export function currentHeading(cv: TailoredCV, sectionKey: string, lang: CvHeaderLanguage): string {
  const stored = cv.sectionHeaders?.[sectionKey as keyof NonNullable<TailoredCV['sectionHeaders']>];
  if (typeof stored === 'string' && stored.trim()) {
    const locale = lang === 'de' ? 'de' : lang === 'en' ? 'en' : 'other';
    return resolveHeading({ provided: stored, renamed: cv.renamedHeadings?.includes(sectionKey), key: sectionKey as HeadingKey, locale });
  }
  return generateLocalizedHeaders(lang).sectionHeaders[sectionKey] ?? '';
}

/** The whole structure the model addresses, built fresh from the working copy. */
export function buildOutline(cv: TailoredCV): CvOutline {
  const lang = cvLanguage(cv);
  const lists: OutlineList[] = [];

  const push = (list: ListHandle) => {
    const outline = buildListOutline(cv, list);
    if (outline && outline.items.length > 0) lists.push(outline);
  };

  // Nested lists whose parent key matches two parents are skipped by `push`,
  // because buildListOutline returns null for them. Silence there would read as
  // a role with no bullets, so the reason is collected and sent alongside.
  const unaddressable: string[] = [];
  const noteRefusal = (list: string) => {
    const refusal = listRefusal(cv, list);
    if (refusal && !unaddressable.includes(refusal)) unaddressable.push(refusal);
  };

  push('experience');
  for (const entry of cv.experience ?? []) {
    push(`bullets:${expKey(entry)}`);
    noteRefusal(`bullets:${expKey(entry)}`);
  }
  push('education');
  push('skills');
  for (const entry of cv.skills ?? []) {
    push(`skillitems:${skillKey(entry)}`);
    noteRefusal(`skillitems:${skillKey(entry)}`);
  }
  push('certifications');
  push('languages');
  push('projects');
  push('customSections');
  for (const entry of cv.customSections ?? []) {
    push(`customitems:${customKey(entry)}`);
    noteRefusal(`customitems:${customKey(entry)}`);
  }

  const headings: Record<string, string> = {};
  const renameableAs: Record<string, string[]> = {};
  for (const sectionKey of RENAMEABLE_SECTION_KEYS) {
    headings[sectionKey] = label(currentHeading(cv, sectionKey, lang));
    renameableAs[sectionKey] = headingOptions(sectionKey, lang);
  }

  const outline: CvOutline = { lists, headings, renameable_as: renameableAs, language: lang };
  if (cv.hiddenSections && cv.hiddenSections.length > 0) outline.hidden_sections = [...cv.hiddenSections];
  if (unaddressable.length > 0) outline.unaddressable = unaddressable;
  return outline;
}

/**
 * How many addressable entries the outline carries.
 *
 * Lists are never truncated (see buildListOutline), so a CV with hundreds of
 * entries produces an outline that is sent to the model on every tool round.
 * The caller uses this to refuse the whole surface rather than to trim it,
 * because a trimmed list would make reorder's permutation check unsatisfiable.
 */
export function outlineItemCount(outline: CvOutline): number {
  return outline.lists.reduce((total, list) => total + list.items.length, 0);
}

/**
 * Above this a CV is not editable from the chat at all.
 *
 * Roughly 25 tokens an entry, up to three tool rounds, so this bounds the
 * outline at about 7,500 tokens a round. A CV with 300 addressable entries is
 * not a document anyone sends; the canvas is the right tool for it.
 */
export const MAX_OUTLINE_ITEMS = 300;
