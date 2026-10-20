/**
 * Tailored CV service: read an application's tailored CV, and edit it with a
 * revision.
 *
 * The tailored CV lives in `application_sessions.generated_cv`: the CV
 * document plus the structured data embedded as `_optimizedCVData` (and the
 * screening state next to it). Every edit here reads the stored document,
 * changes it, and writes it back conditional on the revision the caller
 * loaded, so two writers cannot silently overwrite each other.
 */

import * as sessionsRepo from '@/db/repos/sessions';
import type { ApplicationSession as StoreSession } from '@/store/useSessionStore';
import { InvalidInputError, NotFoundError, RevisionConflict } from './errors';
import { updateApplicationFields } from './applications';
import { applyRecordedEdit, saveRecordedKitDocument } from './edit-history';
import { getKit, kitFromRow } from './kit';
import { nowIso } from '@/db/client';
import { isStructuredCoverLetter } from '@/lib/cover-letter/contract';
import { renderCoverLetterBody } from '@/lib/agents/cover-letter-structure';
import { headingOptions, isRenameableSectionKey, RENAMEABLE_SECTION_KEYS } from '@/lib/cv-parser/section-splitter';
import {
  buildListOutline,
  currentHeading,
  cvLanguage,
  handleForIndex,
  handleRefusal,
  isItemHidden,
  listHandles,
  nestedParent,
  resolveHandle,
  skillKey,
} from '@/lib/cv-structure/handles';
import { applyDelete, applyRenameHeading, applyReorder } from '@/lib/cv-structure/ops';
import { validateCvShape, validateEdit, validateNoNewBlanks } from '@/lib/cv-structure/validate';
import type { ListHandle, OutlineList, TailoredCV } from '@/lib/cv-structure/types';

type Json = Record<string, unknown>;
export type TailoredCvData = NonNullable<StoreSession['optimizedCVData']>;

export interface TailoredCv {
  applicationId: string;
  revision: number;
  /** The CV document (content, changes, optimizedFor) without the embedded structured data. */
  cv: StoreSession['generatedCV'];
  data: TailoredCvData | null;
  templateId: string | undefined;
}

function asRecord(value: unknown): Json | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : null;
}

export async function getTailoredCv(userId: string, sessionId: string): Promise<TailoredCv> {
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();
  const kit = kitFromRow(row);
  return {
    applicationId: row.id,
    revision: row.revision,
    cv: kit.cv,
    data: kit.optimizedCVData ?? null,
    templateId: kit.selectedTemplate,
  };
}

/**
 * Replace the structured CV data, keeping the CV document and everything else
 * embedded in generated_cv. Conditional on `expectedRevision`.
 */
export async function saveTailoredCvData(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  data: TailoredCvData,
): Promise<{ revision: number }> {
  const row = await sessionsRepo.getSession(userId, sessionId);
  if (!row) throw new NotFoundError();
  if (row.revision !== expectedRevision) throw new RevisionConflict(row.revision);
  // A row whose CV only lives in generated_artifacts (older builds, headless
  // runs) has no generated_cv to extend. Start from the CV document the reader
  // already shows for it, so the first edit does not mask that fallback with a
  // bare document and lose its content, changes and optimizedFor.
  const base = asRecord(row.generated_cv) ?? (kitFromRow(row).cv ? { ...(kitFromRow(row).cv as unknown as Json) } : {});
  const next = { ...base, _optimizedCVData: data };
  if (JSON.stringify(next).length > MAX_TAILORED_CV_CHARS) throw new InvalidInputError('That change makes the CV too large');
  // The value this replaces is kept (the last 10 versions), so the edit can be undone.
  return applyRecordedEdit(userId, sessionId, 'cv', { generated_cv: next }, { expectedRevision });
}

/** Same ceiling updateApplicationFields applies to one patch. */
const MAX_TAILORED_CV_CHARS = 3_000_000;

/**
 * Apply `mutate` to the stored structured CV and write the result. The
 * mutator gets a deep copy and returns the next value; throwing from it
 * abandons the edit. Conditional on `expectedRevision`.
 */
export async function editTailoredCv(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  mutate: (data: Json) => Json,
): Promise<{ revision: number }> {
  const current = await getTailoredCv(userId, sessionId);
  if (current.revision !== expectedRevision) throw new RevisionConflict(current.revision);
  if (!current.data) throw new InvalidInputError('This application has no tailored CV yet');
  const draft = JSON.parse(JSON.stringify(current.data)) as Json;
  const next = mutate(draft);
  return saveTailoredCvData(userId, sessionId, expectedRevision, next as unknown as TailoredCvData);
}

// ---------------------------------------------------------------------------
// Field and structure edits
// ---------------------------------------------------------------------------

/** A path like `summary`, `personal.fullName` or `experience.exp-1.bullets.2`. A segment can be an index or an item `id`. */
function resolveSegment(container: unknown, segment: string): string | number {
  if (Array.isArray(container)) {
    if (/^\d+$/.test(segment)) return Number(segment);
    const index = container.findIndex((item) => asRecord(item)?.id === segment);
    if (index === -1) throw new InvalidInputError(`No item "${segment}"`);
    return index;
  }
  return segment;
}

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

function setAtPath(root: Json, path: string, value: unknown): void {
  const segments = path.split('.').filter(Boolean);
  if (segments.length === 0) throw new InvalidInputError('A path is required');
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) throw new InvalidInputError('Invalid path');
  let cursor: unknown = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = resolveSegment(cursor, segments[i]);
    const next = (cursor as Record<string | number, unknown>)[key];
    if (next === undefined || next === null || typeof next !== 'object') {
      throw new InvalidInputError(`Nothing at "${segments.slice(0, i + 1).join('.')}"`);
    }
    cursor = next;
  }
  const last = resolveSegment(cursor, segments[segments.length - 1]);
  if (Array.isArray(cursor) && typeof last === 'number' && last >= cursor.length) {
    throw new InvalidInputError(`Nothing at "${path}"`);
  }
  (cursor as Record<string | number, unknown>)[last] = value;
}

const ITEM_SECTIONS = ['experience', 'education', 'certifications', 'projects', 'customSections', 'skills', 'languages'] as const;
export type CvItemSection = (typeof ITEM_SECTIONS)[number];

function itemList(data: Json, section: string): unknown[] {
  if (!(ITEM_SECTIONS as readonly string[]).includes(section)) throw new InvalidInputError(`Unknown section "${section}"`);
  const list = data[section];
  if (!Array.isArray(list)) throw new InvalidInputError(`This CV has no "${section}" section`);
  return list;
}

function itemKey(item: unknown): string | undefined {
  const record = asRecord(item);
  if (!record) return undefined;
  return typeof record.id === 'string' ? record.id : typeof record.category === 'string' ? record.category : typeof record.language === 'string' ? record.language : undefined;
}

/** Put the items of one section in the given order. Items not named keep their relative order at the end. */
export async function reorderCvItems(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  section: CvItemSection,
  order: string[],
): Promise<{ revision: number }> {
  return editTailoredCv(userId, sessionId, expectedRevision, (data) => {
    const list = itemList(data, section);
    const named: unknown[] = order.map((key) => {
      const item = list.find((candidate) => itemKey(candidate) === key);
      if (item === undefined) throw new InvalidInputError(`No item "${key}" in ${section}`);
      return item;
    });
    data[section] = [...named, ...list.filter((item) => !named.includes(item))];
    return data;
  });
}

export async function deleteCvItem(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  section: CvItemSection,
  key: string,
): Promise<{ revision: number }> {
  return editTailoredCv(userId, sessionId, expectedRevision, (data) => {
    const list = itemList(data, section);
    const index = list.findIndex((item) => itemKey(item) === key);
    if (index === -1) throw new InvalidInputError(`No item "${key}" in ${section}`);
    data[section] = list.filter((_, i) => i !== index);
    return data;
  });
}

const HEADING_KEYS = new Set(['summary', 'skills', 'experience', 'education', 'certifications', 'languages', 'contact', 'additionalInfo', 'projects']);

/** Rename a section heading (`sectionHeaders.<key>`). */
export async function renameCvHeading(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  heading: string,
  text: string,
): Promise<{ revision: number }> {
  if (!HEADING_KEYS.has(heading)) throw new InvalidInputError(`Unknown heading "${heading}"`);
  if (!text.trim() || text.length > 100) throw new InvalidInputError('A heading must be 1 to 100 characters');
  return editTailoredCv(userId, sessionId, expectedRevision, (data) => {
    const headers: Json = { ...(asRecord(data.sectionHeaders) ?? {}) };
    headers[heading] = text.trim();
    data.sectionHeaders = headers;
    return data;
  });
}

/** Choose the CV template this application renders with. */
export async function setCvTemplate(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  templateId: string,
): Promise<{ revision: number }> {
  if (!templateId.trim()) throw new InvalidInputError('A template is required');
  return updateApplicationFields(userId, sessionId, expectedRevision, { selected_template: templateId });
}

// ---------------------------------------------------------------------------
// Validated edits for the MCP tools: content fields, new items, visibility,
// and the handle-based structure operations (the same pure ops the chat uses)
// ---------------------------------------------------------------------------

/**
 * Run `build` against a copy of the stored CV and write what it returns. A
 * refusal is an `InvalidInputError` thrown from `build`; nothing is written.
 * Conditional on `expectedRevision`.
 */
async function editCvWith<T>(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  build: (cv: TailoredCV) => { cv: TailoredCV; result: T },
): Promise<{ revision: number; result: T }> {
  let result: T | undefined;
  const saved = await editTailoredCv(userId, sessionId, expectedRevision, (data) => {
    const built = build(data as unknown as TailoredCV);
    result = built.result;
    return built.cv as unknown as Json;
  });
  return { revision: saved.revision, result: result as T };
}

function refuse(message: string | null): void {
  if (message) throw new InvalidInputError(message);
}

const MAX_CV_FIELD_CHARS = 5_000;
const PERSONAL_FIELDS = ['fullName', 'email', 'phone', 'currentTitle', 'address', 'city', 'country', 'linkedIn', 'website', 'github', 'driverLicense'];
/** Scalar text fields per list, the only ones a content edit may set. */
const ITEM_TEXT_FIELDS: Record<string, string[]> = {
  experience: ['company', 'position', 'location', 'startDate', 'endDate'],
  education: ['institution', 'degree', 'field', 'location', 'startDate', 'endDate', 'grade'],
  skills: ['category'],
  languages: ['language', 'proficiency'],
  certifications: ['name', 'issuer', 'date'],
  projects: ['name', 'description', 'url'],
  customSections: ['title'],
};
/** The plain-text lists inside an item. */
const ITEM_TEXT_LISTS: Record<string, string[]> = {
  experience: ['bullets'],
  education: ['highlights'],
  skills: ['items'],
  projects: ['technologies'],
  customSections: ['items'],
};

/** Is this a path to a text field of the CV? Ids, flags, headings and hidden state are not editable here. */
export function isEditableCvPath(path: string): boolean {
  const parts = path.split('.');
  if (parts.some((part) => !part)) return false;
  if (parts.length === 1) return parts[0] === 'summary';
  if (parts[0] === 'personal') return parts.length === 2 && PERSONAL_FIELDS.includes(parts[1]);
  if (parts[0] === 'additionalInfo') return parts.length === 2 && /^\d+$/.test(parts[1]);
  // Own keys only: a path that starts with `constructor` or `__proto__` must read as "not editable", not reach an inherited member.
  if (parts.length === 3) return (Object.hasOwn(ITEM_TEXT_FIELDS, parts[0]) ? ITEM_TEXT_FIELDS[parts[0]] : []).includes(parts[2]);
  if (parts.length === 4) return (Object.hasOwn(ITEM_TEXT_LISTS, parts[0]) ? ITEM_TEXT_LISTS[parts[0]] : []).includes(parts[2]) && /^\d+$/.test(parts[3]);
  return false;
}

function getAtPath(root: Json, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split('.')) {
    if (cursor === undefined || cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string | number, unknown>)[resolveSegment(cursor, segment)];
  }
  return cursor;
}

export interface CvFieldChange {
  path: string;
  before: string | null;
  after: string;
}

/**
 * Set text fields on the tailored CV by path (see `isEditableCvPath`) and report each
 * field's before and after. The result is checked the way every structure edit is:
 * the CV keeps its shape and no blank line appears.
 */
export async function setCvFields(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  fields: Array<{ path: string; value: string }>,
): Promise<{ revision: number; changes: CvFieldChange[] }> {
  if (fields.length === 0) throw new InvalidInputError('No changes given');
  for (const field of fields) {
    if (!isEditableCvPath(field.path)) throw new InvalidInputError(`"${field.path}" is not a text field that can be edited`);
    if (typeof field.value !== 'string' || field.value.length > MAX_CV_FIELD_CHARS) {
      throw new InvalidInputError(`The value for "${field.path}" must be text of at most ${MAX_CV_FIELD_CHARS} characters`);
    }
  }
  const { revision, result } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    const before = JSON.parse(JSON.stringify(cv)) as TailoredCV;
    const changes: CvFieldChange[] = [];
    for (const field of fields) {
      const previous = getAtPath(cv as unknown as Json, field.path);
      if (typeof previous !== 'string' && previous !== undefined) {
        throw new InvalidInputError(`"${field.path}" is not a text field on this CV`);
      }
      setAtPath(cv as unknown as Json, field.path, field.value);
      changes.push({ path: field.path, before: previous ?? null, after: field.value });
    }
    refuse(validateCvShape(cv) || validateNoNewBlanks(before, cv));
    return { cv, result: changes.filter((change) => change.before !== change.after) };
  });
  return { revision, changes: result };
}

/** A new entry for one of the CV's lists. Ids are made here. */
export type NewCvItem =
  | { kind: 'experience'; company: string; position: string; location?: string; startDate: string; endDate?: string; current?: boolean; bullets: string[] }
  | { kind: 'education'; institution: string; degree: string; field?: string; location?: string; startDate?: string; endDate?: string; grade?: string; highlights?: string[] }
  | { kind: 'project'; name: string; description: string; technologies?: string[]; url?: string }
  | { kind: 'certification'; name: string; issuer: string; date?: string }
  | { kind: 'language'; language: string; proficiency: string }
  | { kind: 'skill_group'; category: string; items: string[] }
  | { kind: 'skill_item'; groupHandle: string; skill: string }
  | { kind: 'custom_section'; title: string; items: string[] };

function withoutKind<T extends { kind: string }>(item: T): Omit<T, 'kind'> {
  const { kind: _kind, ...rest } = item;
  void _kind;
  return rest;
}

/** Append one entry (or one skill to a group). Returns the handle the new entry has in the outline. */
export async function addCvItem(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  item: NewCvItem,
): Promise<{ revision: number; handle: string | null; list: string }> {
  const { revision, result } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    const before = JSON.parse(JSON.stringify(cv)) as TailoredCV;
    let next: TailoredCV;
    let list: string;
    let index: number;
    const id = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    switch (item.kind) {
      case 'experience':
        next = { ...cv, experience: [...cv.experience, { ...withoutKind(item), id: id('exp') }] };
        list = 'experience';
        index = cv.experience.length;
        break;
      case 'education':
        next = { ...cv, education: [...cv.education, { ...withoutKind(item), id: id('edu') }] };
        list = 'education';
        index = cv.education.length;
        break;
      case 'project':
        next = { ...cv, projects: [...(cv.projects ?? []), { ...withoutKind(item), id: id('proj') }] };
        list = 'projects';
        index = (cv.projects ?? []).length;
        break;
      case 'certification':
        next = { ...cv, certifications: [...cv.certifications, { ...withoutKind(item), id: id('cert') }] };
        list = 'certifications';
        index = cv.certifications.length;
        break;
      case 'language':
        next = { ...cv, languages: [...cv.languages, withoutKind(item)] };
        list = 'languages';
        index = cv.languages.length;
        break;
      case 'skill_group':
        next = { ...cv, skills: [...cv.skills, withoutKind(item)] };
        list = 'skills';
        index = cv.skills.length;
        break;
      case 'custom_section':
        next = { ...cv, customSections: [...(cv.customSections ?? []), { ...withoutKind(item), id: id('custom') }] };
        list = 'customSections';
        index = (cv.customSections ?? []).length;
        break;
      case 'skill_item': {
        const resolved = resolveHandle(cv, item.groupHandle);
        if (!resolved || resolved.list !== 'skills') {
          throw new InvalidInputError(handleRefusal(cv, item.groupHandle) ?? 'That is not a skill group handle on this CV. Read the outline again.');
        }
        const group = cv.skills[resolved.index];
        if (group.items.includes(item.skill)) throw new InvalidInputError('That skill is already in the group');
        const skills = cv.skills.slice();
        skills[resolved.index] = { ...group, items: [...group.items, item.skill] };
        next = { ...cv, skills };
        list = `skillitems:${skillKey(group)}`;
        index = group.items.length;
        break;
      }
    }
    refuse(validateCvShape(next) || validateNoNewBlanks(before, next));
    // A twin of an existing entry would make both unaddressable, so it is refused instead.
    const handles = listHandles(next, list);
    if (handles && handles[index]?.ambiguous) throw new InvalidInputError('An identical entry is already there');
    return { cv: next, result: { handle: handleForIndex(next, list, index), list } };
  });
  return { revision, ...result };
}

export type CvVisibilityTarget = { handle: string } | { section: NonNullable<TailoredCV['hiddenSections']>[number] };

function withHidden<E extends { hidden?: boolean }>(entry: E, hidden: boolean): E {
  const { hidden: _hidden, ...rest } = entry;
  void _hidden;
  return (hidden ? { ...rest, hidden: true } : rest) as E;
}

/** Hide or show an entry, a skill group, one skill or a whole section. Nothing is deleted. */
export async function setCvItemVisibility(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  target: CvVisibilityTarget,
  hidden: boolean,
): Promise<{ revision: number }> {
  const { revision } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    let next: TailoredCV;
    if ('section' in target) {
      const current = cv.hiddenSections ?? [];
      const sections = hidden
        ? Array.from(new Set([...current, target.section]))
        : current.filter((section) => section !== target.section);
      next = { ...cv, hiddenSections: sections.length > 0 ? sections : undefined };
    } else {
      const resolved = resolveHandle(cv, target.handle);
      if (!resolved) {
        throw new InvalidInputError(handleRefusal(cv, target.handle) ?? 'I cannot find that entry on the CV. Read the outline again and use one of its handles.');
      }
      const at = (i: number) => i === resolved.index;
      if (resolved.list.startsWith('skillitems:')) {
        const parent = nestedParent(cv, resolved.list);
        if (!parent.ok) throw new InvalidInputError('That skill is not addressable on this CV');
        const group = cv.skills[parent.index];
        const skill = group.items[resolved.index];
        const hiddenItems = hidden
          ? Array.from(new Set([...(group.hiddenItems ?? []), skill]))
          : (group.hiddenItems ?? []).filter((item) => item !== skill);
        const { hiddenItems: _old, ...rest } = group;
        void _old;
        const skills = cv.skills.slice();
        skills[parent.index] = hiddenItems.length > 0 ? { ...rest, hiddenItems } : rest;
        next = { ...cv, skills };
      } else if (resolved.list === 'experience') {
        next = { ...cv, experience: cv.experience.map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'education') {
        next = { ...cv, education: cv.education.map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'skills') {
        next = { ...cv, skills: cv.skills.map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'languages') {
        next = { ...cv, languages: cv.languages.map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'certifications') {
        next = { ...cv, certifications: cv.certifications.map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'projects') {
        next = { ...cv, projects: (cv.projects ?? []).map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else if (resolved.list === 'customSections') {
        next = { ...cv, customSections: (cv.customSections ?? []).map((entry, i) => (at(i) ? withHidden(entry, hidden) : entry)) };
      } else {
        throw new InvalidInputError('Only entries, skill groups, single skills and whole sections can be hidden. Hide the role or section instead.');
      }
    }
    refuse(validateEdit(cv, next));
    return { cv: next, result: null };
  });
  return { revision };
}

/** Put one list in the order of `order` (every handle of the list, once each). */
export async function reorderCvByHandles(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  list: string,
  order: string[],
): Promise<{ revision: number; listNow: OutlineList | null }> {
  const { revision, result } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    const applied = applyReorder(cv, list, order);
    if (!applied.ok) throw new InvalidInputError(applied.error);
    refuse(validateEdit(cv, applied.cv));
    return { cv: applied.cv, result: buildListOutline(applied.cv, list as ListHandle) };
  });
  return { revision, listNow: result };
}

/** Switch a section heading to one of the headings that section may use in the CV's language. */
export async function renameCvSectionHeading(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  section: string,
  heading: string,
): Promise<{ revision: number; from: string; to: string }> {
  if (!isRenameableSectionKey(section)) throw new InvalidInputError(`Only these section headings can be changed: ${RENAMEABLE_SECTION_KEYS.join(', ')}.`);
  const { revision, result } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    const lang = cvLanguage(cv);
    const applied = applyRenameHeading(cv, section, heading, headingOptions(section, lang), currentHeading(cv, section, lang));
    if (!applied.ok) throw new InvalidInputError(applied.error);
    refuse(validateEdit(cv, applied.cv, {
      removed: applied.from ? [applied.from] : [],
      added: [applied.to],
      renamedHeadingKey: section,
    }));
    return { cv: applied.cv, result: { from: applied.fromLabel, to: applied.to } };
  });
  return { revision, ...result };
}

/** Remove one entry by outline handle. A hidden entry is refused: it is not on the page, so show it first. */
export async function deleteCvItemByHandle(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  handle: string,
): Promise<{ revision: number; removed: string; list: string }> {
  const { revision, result } = await editCvWith(userId, sessionId, expectedRevision, (cv) => {
    const resolved = resolveHandle(cv, handle);
    if (!resolved) {
      throw new InvalidInputError(handleRefusal(cv, handle) ?? 'I cannot find that entry on the CV any more. Read the outline again and use one of its handles.');
    }
    if (isItemHidden(cv, resolved.list, resolved.index)) {
      throw new InvalidInputError('That entry is hidden from the CV, so it is not on the page or in the downloads. Show it with set_cv_item_visibility before removing it.');
    }
    const applied = applyDelete(cv, handle);
    if (!applied.ok) throw new InvalidInputError(applied.error);
    refuse(validateEdit(cv, applied.cv, { removed: applied.removed }));
    const removed = buildListOutline(cv, resolved.list)?.items[resolved.index]?.label ?? '<<entry>>';
    return { cv: applied.cv, result: { removed, list: resolved.list as string } };
  });
  return { revision, ...result };
}

// ---------------------------------------------------------------------------
// Document text
// ---------------------------------------------------------------------------

export type EditableDocument = 'cover_letter' | 'email' | 'follow_up_email';

export interface DocumentTextFields {
  subject?: string;
  salutation?: string;
  paragraphs?: string[];
  body?: string;
  closing?: string;
}

export interface DocumentFieldChange {
  field: string;
  before: string | string[] | null;
  after: string | string[];
}

const KIT_KEY = { cover_letter: 'coverLetter', email: 'email', follow_up_email: 'followUpEmail' } as const;

function sameText(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * Set the text of the cover letter, the application email or the follow-up with the given
 * words, keeping the stored document valid, and report each changed field's before and after.
 * A structured cover letter (written by the current writer) takes subject, salutation,
 * paragraphs and closing and has its `body` rebuilt from them; a letter without the structure
 * takes salutation, body and closing. Emails take subject and body. Recorded for undo.
 */
export async function editDocumentText(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  document: EditableDocument,
  fields: DocumentTextFields,
): Promise<{ revision: number; changes: DocumentFieldChange[] }> {
  const kit = await getKit(userId, sessionId);
  if (kit.revision !== expectedRevision) throw new RevisionConflict(kit.revision);
  const current = document === 'cover_letter' ? kit.coverLetter : document === 'email' ? kit.email : kit.followUpEmail;
  if (!current) throw new InvalidInputError('That document has not been generated yet');
  const stored = current as unknown as Json;

  let allowed: Array<keyof DocumentTextFields>;
  const next: Json = { ...stored };
  const structured = document === 'cover_letter' && isStructuredCoverLetter(stored.structured) ? stored.structured : null;
  if (document !== 'cover_letter') {
    allowed = ['subject', 'body'];
  } else if (structured) {
    allowed = ['subject', 'salutation', 'paragraphs', 'closing'];
  } else {
    const fullLetterInBody = !(stored.applicantAddress as { name?: string } | undefined)?.name && Boolean(stored.body);
    allowed = fullLetterInBody ? ['body'] : ['salutation', 'body', 'closing'];
    delete next.structured;
  }

  const given = (Object.keys(fields) as Array<keyof DocumentTextFields>).filter((key) => fields[key] !== undefined);
  if (given.length === 0) throw new InvalidInputError('No changes given');
  const refused = given.filter((key) => !allowed.includes(key));
  if (refused.length > 0) {
    throw new InvalidInputError(`This ${document.replace(/_/g, ' ')} takes ${allowed.join(', ')}. ${refused.join(', ')} cannot be set on it.`);
  }

  const changes: DocumentFieldChange[] = [];
  if (structured) {
    const nextStructured = { ...structured } as unknown as Json;
    for (const key of given) {
      const value = fields[key] as string | string[];
      if (!sameText(nextStructured[key], value)) changes.push({ field: key, before: nextStructured[key] as string | string[], after: value });
      nextStructured[key] = value;
      // The top-level copies, where the letter carries them, stay in step.
      if ((key === 'salutation' || key === 'closing') && typeof stored[key] === 'string' && stored[key]) next[key] = value;
    }
    if (!isStructuredCoverLetter(nextStructured)) {
      throw new InvalidInputError('The letter needs a subject, a salutation, a closing and at least one paragraph');
    }
    next.structured = nextStructured;
    next.body = renderCoverLetterBody(nextStructured);
  } else {
    for (const key of given) {
      const value = fields[key] as string;
      if (!sameText(next[key], value)) changes.push({ field: key, before: (next[key] as string | undefined) ?? null, after: value });
      next[key] = value;
    }
    if (typeof next.body === 'string' && !next.body.trim()) throw new InvalidInputError('The text cannot be empty');
  }
  if (changes.length === 0) throw new InvalidInputError('That is already the current text, so nothing changed');
  if (document === 'cover_letter') next.updatedAt = nowIso();

  const saved = await saveRecordedKitDocument(userId, sessionId, KIT_KEY[document], next, { expectedRevision });
  return { revision: saved.revision, changes };
}
