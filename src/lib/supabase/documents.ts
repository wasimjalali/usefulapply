import { getSupabase } from './client';
import {
  getDocumentsAction,
  getDocumentByTypeAction,
  saveDocumentAction,
  deleteDocumentAction,
} from '@/db/actions';

export type { Document } from '@/db/repos/documents';

export async function getDocuments(userId: string) {
  return getDocumentsAction(userId);
}

export async function getDocumentByType(userId: string, type: 'primary_cv' | 'master_cv') {
  return getDocumentByTypeAction(userId, type);
}

export async function saveDocument(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  data: Parameters<typeof saveDocumentAction>[2],
) {
  const supabase = getSupabase();
  const existing = await getDocumentByTypeAction(userId, type);
  if (existing?.storage_path && data.storage_path && existing.storage_path !== data.storage_path) {
    await supabase.storage.from('cv-files').remove([existing.storage_path]);
  }
  return saveDocumentAction(userId, type, data);
}

export async function deleteDocument(documentId: string) {
  const supabase = getSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: new Error('Authentication required') };
  }
  const result = await deleteDocumentAction(user.id, documentId);
  if (!result.error && result.storagePath) {
    await supabase.storage.from('cv-files').remove([result.storagePath]);
  }
  return { error: result.error };
}

export async function uploadCVFile(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  file: File,
): Promise<{ path: string | null; error: Error | null }> {
  const supabase = getSupabase();
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${type}/${Date.now()}.${fileExt}`;
  const { data, error } = await supabase.storage
    .from('cv-files')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: true,
    });
  if (error) {
    console.error('Upload error:', error);
    return { path: null, error: new Error(error.message) };
  }
  return { path: data.path, error: null };
}
