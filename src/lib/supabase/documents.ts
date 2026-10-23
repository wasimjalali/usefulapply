import {
  getDocumentByTypeAction,
  saveDocumentAction,
  deleteDocumentAction,
  deleteFileAction,
} from '@/db/actions';
import { toR2Key } from '@/storage/paths';

export type { Document } from '@/db/repos/documents';

export async function getDocumentByType(userId: string, type: 'primary_cv' | 'master_cv') {
  return getDocumentByTypeAction(userId, type);
}

export async function saveDocument(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  data: Parameters<typeof saveDocumentAction>[2],
) {
  const existing = await getDocumentByTypeAction(userId, type);
  const result = await saveDocumentAction(userId, type, data);
  // Only after the row points at the new file is the old object safe to remove.
  if (existing?.storage_path && data.storage_path && existing.storage_path !== data.storage_path) {
    const oldKey = toR2Key('cv-files', existing.storage_path);
    if (oldKey) {
      try {
        await deleteFileAction(oldKey);
      } catch (err) {
        console.error('[documents] failed to delete replaced CV file:', oldKey, err);
      }
    }
  }
  return result;
}

export async function deleteDocument(documentId: string) {
  const { authClient } = await import('@/auth/client');
  const { data: sessionData } = await authClient.getSession();
  if (!sessionData?.user) {
    return { error: new Error('Authentication required') };
  }
  const result = await deleteDocumentAction(sessionData.user.id, documentId);
  if (!result.error && result.storagePath) {
    const key = toR2Key('cv-files', result.storagePath);
    if (key) {
      try {
        await deleteFileAction(key);
      } catch (err) {
        console.error('[documents] failed to delete CV file for removed document:', key, err);
      }
    }
  }
  return { error: result.error };
}

export async function uploadCVFile(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  file: File,
): Promise<{ path: string | null; error: Error | null }> {
  void userId;
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', 'cv-files');
  form.append('subpath', type);
  try {
    const res = await fetch('/api/files/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { path: null, error: new Error(data.error || 'Upload failed') };
    }
    const data = (await res.json()) as { key?: string };
    if (!data.key) return { path: null, error: new Error('Upload failed') };
    return { path: data.key, error: null };
  } catch (err) {
    console.error('Upload error:', err);
    return { path: null, error: err as Error };
  }
}
