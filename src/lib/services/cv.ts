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
import { kitFromRow } from './kit';

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
  return updateApplicationFields(userId, sessionId, expectedRevision, { generated_cv: next });
}

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

/** Set text or list fields on the tailored CV by path. */
export async function setCvFields(
  userId: string,
  sessionId: string,
  expectedRevision: number,
  fields: Array<{ path: string; value: unknown }>,
): Promise<{ revision: number }> {
  if (fields.length === 0) throw new InvalidInputError('No changes given');
  return editTailoredCv(userId, sessionId, expectedRevision, (data) => {
    for (const field of fields) setAtPath(data, field.path, field.value);
    return data;
  });
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
