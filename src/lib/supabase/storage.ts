import { deleteFileAction, deleteUserFilesAction, getProfileAction, listUserFilesAction, removeAvatarAction, setAvatarAction } from '@/db/actions';
import { fileDisplayUrl, toR2Key } from '@/storage/paths';

type FileBucket = 'cv-files' | 'generated-pdfs' | 'avatars' | 'profile-photos';

function asError(err: unknown, fallback: string): Error {
  return err instanceof Error ? err : new Error(fallback);
}

async function postUpload(
  file: File,
  bucket: FileBucket,
  subpath?: string,
): Promise<{ key: string | null; error: Error | null }> {
  const form = new FormData();
  form.append('file', file);
  form.append('bucket', bucket);
  if (subpath) form.append('subpath', subpath);
  try {
    const res = await fetch('/api/files/upload', { method: 'POST', body: form });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return { key: null, error: new Error(data.error || 'Upload failed') };
    }
    const data = (await res.json()) as { key?: string };
    if (!data.key) return { key: null, error: new Error('Upload failed') };
    return { key: data.key, error: null };
  } catch (err) {
    return { key: null, error: asError(err, 'Upload failed') };
  }
}

async function deleteOwnedPrefix(bucket: FileBucket, keepKey?: string): Promise<{ error: Error | null }> {
  try {
    await deleteUserFilesAction(bucket, keepKey);
    return { error: null };
  } catch (err) {
    return { error: asError(err, 'Delete failed') };
  }
}

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; key: string | null; error: Error | null }> {
  void userId;
  const result = await postUpload(file, 'avatars');
  if (result.error || !result.key) return { url: null, key: null, error: result.error };
  return { url: fileDisplayUrl(result.key), key: result.key, error: null };
}

/** Make an uploaded avatar the account photo. The server deletes only the avatar it replaces, so a photo set from elsewhere at the same time survives. */
export async function setAvatar(userId: string, key: string): Promise<{ error: Error | null }> {
  try {
    await setAvatarAction(userId, key);
    return { error: null };
  } catch (err) {
    return { error: asError(err, 'Failed to save the photo') };
  }
}

/**
 * Remove the account photo (and the legacy CV photo). The server unlinks it against the value it read and deletes
 * only that object, so a photo set from elsewhere at the same time survives. `incomplete`: unlinked, objects may remain.
 */
export async function deleteAvatar(userId: string): Promise<{ error: Error | null; incomplete: boolean }> {
  try {
    const complete = await removeAvatarAction(userId);
    return { error: null, incomplete: !complete };
  } catch (err) {
    return { error: asError(err, 'Failed to remove the photo'), incomplete: false };
  }
}

/**
 * The single profile photo: the account avatar (profiles.avatar_url). Falls
 * back to the legacy profile-photos bucket for users who uploaded a CV photo
 * before the two were consolidated.
 */
export async function getProfilePhotoUrl(
  userId: string,
): Promise<{ url: string | null; error: Error | null }> {
  try {
    const profile = await getProfileAction(userId);
    const avatarUrl = fileDisplayUrl(profile?.avatar_url);
    if (avatarUrl) return { url: avatarUrl, error: null };
    const keys = await listUserFilesAction('profile-photos');
    const key = keys[0];
    return { url: key ? fileDisplayUrl(key) : null, error: null };
  } catch (err) {
    return { url: null, error: asError(err, 'Failed to load profile photo') };
  }
}

/** Delete the legacy CV-photo objects along with the avatar so a removed photo stays removed. */
export async function deleteProfilePhoto(userId: string): Promise<{ error: Error | null }> {
  void userId;
  return deleteOwnedPrefix('profile-photos');
}

export async function uploadGeneratedPDF(
  userId: string,
  pdfBytes: Uint8Array,
  fileName: string,
): Promise<{ url: string | null; path: string | null; error: Error | null }> {
  void userId;
  const file = new File([pdfBytes as BlobPart], fileName, { type: 'application/pdf' });
  const result = await postUpload(file, 'generated-pdfs');
  if (result.error || !result.key) return { url: null, path: null, error: result.error };
  return { url: fileDisplayUrl(result.key), path: result.key, error: null };
}

/** `filePath` is a full R2 key or a legacy `<userId>/<file>` path. */
export async function getGeneratedPDFUrl(
  filePath: string,
): Promise<{ url: string | null; error: Error | null }> {
  const key = toR2Key('generated-pdfs', filePath);
  if (!key) return { url: null, error: new Error('Invalid file path') };
  return { url: fileDisplayUrl(key), error: null };
}

/** `name` is the path under the bucket (`<userId>/<file>`), usable with getGeneratedPDFUrl / deleteGeneratedPDF. */
export async function listGeneratedPDFs(
  userId: string,
): Promise<{ files: { name: string; created_at: string }[]; error: Error | null }> {
  void userId;
  try {
    const keys = await listUserFilesAction('generated-pdfs');
    return {
      files: keys.map((key) => ({ name: key.replace(/^generated-pdfs\//, ''), created_at: '' })),
      error: null,
    };
  } catch (err) {
    return { files: [], error: asError(err, 'Failed to list files') };
  }
}

export async function deleteGeneratedPDF(filePath: string): Promise<{ error: Error | null }> {
  const key = toR2Key('generated-pdfs', filePath);
  if (!key) return { error: new Error('Invalid file path') };
  try {
    await deleteFileAction(key);
    return { error: null };
  } catch (err) {
    return { error: asError(err, 'Delete failed') };
  }
}
