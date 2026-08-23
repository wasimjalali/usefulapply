/* eslint-disable @typescript-eslint/no-explicit-any */
import { and, desc, eq } from 'drizzle-orm';
import { getDb, nowIso } from '../client';
import { documents } from '../schema';

export interface Document {
  id: string;
  user_id: string;
  type: 'primary_cv' | 'master_cv';
  file_name: string;
  file_type: 'pdf' | 'docx' | 'txt';
  file_size?: number | null;
  storage_path?: string | null;
  raw_text?: string | null;
  sections?: Record<string, string> | any;
  all_skills?: string[];
  all_experiences?: string[];
  all_education?: string[];
  structured_data?: any;
  created_at: string;
  updated_at: string;
}

export async function getDocuments(userId: string): Promise<Document[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(eq(documents.user_id, userId))
    .orderBy(desc(documents.created_at));
  return rows as Document[];
}

export async function getDocumentByType(
  userId: string,
  type: 'primary_cv' | 'master_cv',
): Promise<Document | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.user_id, userId), eq(documents.type, type)))
    .orderBy(desc(documents.updated_at))
    .limit(1);
  return (rows[0] as Document | undefined) ?? null;
}

export async function getDocumentById(userId: string, documentId: string): Promise<Document | null> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)))
    .limit(1);
  return (rows[0] as Document | undefined) ?? null;
}

export async function saveDocument(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  data: {
    file_name: string;
    file_type: 'pdf' | 'docx' | 'txt';
    file_size?: number;
    storage_path?: string;
    raw_text?: string;
    sections?: Record<string, string>;
    structured_data?: any;
    all_skills?: string[];
    all_experiences?: string[];
    all_education?: string[];
  },
): Promise<{ document: Document | null; error: Error | null }> {
  const existing = await getDocumentByType(userId, type);
  const db = await getDb();
  const now = nowIso();

  // Explicit column list: `data` can arrive from a server action, so never
  // spread it into a write where a stray id/user_id key could re-parent the row.
  const columns = {
    file_name: data.file_name,
    file_type: data.file_type,
    file_size: data.file_size,
    storage_path: data.storage_path,
    raw_text: data.raw_text,
    sections: data.sections,
    structured_data: data.structured_data as never,
    all_skills: data.all_skills,
    all_experiences: data.all_experiences,
    all_education: data.all_education,
  };

  if (existing) {
    await db
      .update(documents)
      .set({ ...columns, updated_at: now })
      .where(and(eq(documents.id, existing.id), eq(documents.user_id, userId)));
    const updated = await getDocumentById(userId, existing.id);
    return { document: updated, error: updated ? null : new Error('Failed to update document') };
  }

  const id = crypto.randomUUID();
  await db.insert(documents).values({
    ...columns,
    id,
    user_id: userId,
    type,
    created_at: now,
    updated_at: now,
  });
  const inserted = await getDocumentById(userId, id);
  return { document: inserted, error: inserted ? null : new Error('Failed to insert document') };
}

export async function deleteDocument(userId: string, documentId: string): Promise<{ error: Error | null; storagePath?: string | null }> {
  const existing = await getDocumentById(userId, documentId);
  if (!existing) {
    return { error: new Error('Document not found') };
  }
  const db = await getDb();
  await db.delete(documents).where(and(eq(documents.id, documentId), eq(documents.user_id, userId)));
  return { error: null, storagePath: existing.storage_path };
}

/**
 * Overwrite structured_data only. Deliberately does NOT bump updated_at:
 * the caller stores a UI overlay (_editedCVData), not a content change, and
 * a bumped updated_at would invalidate user_career_profiles.
 */
export async function updateDocumentStructuredData(
  userId: string,
  documentId: string,
  structuredData: any,
): Promise<void> {
  const db = await getDb();
  await db
    .update(documents)
    .set({ structured_data: structuredData })
    .where(and(eq(documents.id, documentId), eq(documents.user_id, userId)));
}
