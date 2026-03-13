import { getSupabase } from './client';

// ============================================
// AVATAR STORAGE (avatars bucket)
// ============================================

/**
 * Upload a file to Supabase Storage
 */
export async function uploadAvatar(
  userId: string,
  file: File
): Promise<{ url: string | null; error: Error | null }> {
  const supabase = getSupabase();
  
  // Create a unique filename
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/avatar.${fileExt}`;
  
  try {
    // Delete existing avatar first (if any)
    await supabase.storage.from('avatars').remove([fileName]);
    
    // Upload new avatar
    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Upload error:', error);
      return { url: null, error: new Error(error.message) };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    return { url: urlData.publicUrl, error: null };
  } catch (err) {
    console.error('Upload exception:', err);
    return { url: null, error: err as Error };
  }
}

/**
 * Delete avatar from Supabase Storage
 */
export async function deleteAvatar(userId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    // List all files in user's folder
    const { data: files } = await supabase.storage
      .from('avatars')
      .list(userId);

    if (files && files.length > 0) {
      const filesToDelete = files.map(f => `${userId}/${f.name}`);
      await supabase.storage.from('avatars').remove(filesToDelete);
    }

    return { error: null };
  } catch (err) {
    console.error('Delete error:', err);
    return { error: err as Error };
  }
}

// ============================================
// PROFILE PHOTOS STORAGE (profile-photos bucket)
// For EU CV templates that include photos
// ============================================

/**
 * Upload a profile photo for CV (EU format)
 */
export async function uploadProfilePhoto(
  userId: string,
  file: File
): Promise<{ url: string | null; path: string | null; error: Error | null }> {
  const supabase = getSupabase();
  
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/profile.${fileExt}`;
  
  try {
    // Delete existing photo first
    await supabase.storage.from('profile-photos').remove([fileName]);
    
    // Upload new photo
    const { data, error } = await supabase.storage
      .from('profile-photos')
      .upload(fileName, file, {
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('Profile photo upload error:', error);
      return { url: null, path: null, error: new Error(error.message) };
    }

    // Get signed URL (private bucket)
    const { data: urlData } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(fileName, 60 * 60 * 24 * 7); // 7 days

    return { 
      url: urlData?.signedUrl || null, 
      path: data.path,
      error: null 
    };
  } catch (err) {
    console.error('Profile photo upload exception:', err);
    return { url: null, path: null, error: err as Error };
  }
}

/**
 * Get signed URL for profile photo
 */
export async function getProfilePhotoUrl(
  userId: string
): Promise<{ url: string | null; error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    // List files to find the profile photo
    const { data: files } = await supabase.storage
      .from('profile-photos')
      .list(userId);

    if (!files || files.length === 0) {
      return { url: null, error: null };
    }

    const profileFile = files.find(f => f.name.startsWith('profile.'));
    if (!profileFile) {
      return { url: null, error: null };
    }

    const { data: urlData } = await supabase.storage
      .from('profile-photos')
      .createSignedUrl(`${userId}/${profileFile.name}`, 60 * 60 * 24); // 24 hours

    return { url: urlData?.signedUrl || null, error: null };
  } catch (err) {
    console.error('Get profile photo error:', err);
    return { url: null, error: err as Error };
  }
}

/**
 * Delete profile photo
 */
export async function deleteProfilePhoto(userId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    const { data: files } = await supabase.storage
      .from('profile-photos')
      .list(userId);

    if (files && files.length > 0) {
      const filesToDelete = files.map(f => `${userId}/${f.name}`);
      await supabase.storage.from('profile-photos').remove(filesToDelete);
    }

    return { error: null };
  } catch (err) {
    console.error('Delete profile photo error:', err);
    return { error: err as Error };
  }
}

// ============================================
// GENERATED PDFs STORAGE (generated-pdfs bucket)
// For optimized CV PDFs
// ============================================

/**
 * Upload a generated PDF to Supabase Storage
 */
export async function uploadGeneratedPDF(
  userId: string,
  pdfBytes: Uint8Array,
  fileName: string
): Promise<{ url: string | null; path: string | null; error: Error | null }> {
  const supabase = getSupabase();
  
  const filePath = `${userId}/${fileName}`;
  
  try {
    // Upload PDF
    const { data, error } = await supabase.storage
      .from('generated-pdfs')
      .upload(filePath, pdfBytes, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      console.error('PDF upload error:', error);
      return { url: null, path: null, error: new Error(error.message) };
    }

    // Get signed URL (private bucket)
    const { data: urlData } = await supabase.storage
      .from('generated-pdfs')
      .createSignedUrl(filePath, 60 * 60 * 24 * 7); // 7 days

    return { 
      url: urlData?.signedUrl || null, 
      path: data.path,
      error: null 
    };
  } catch (err) {
    console.error('PDF upload exception:', err);
    return { url: null, path: null, error: err as Error };
  }
}

/**
 * Get signed URL for a generated PDF
 */
export async function getGeneratedPDFUrl(
  filePath: string
): Promise<{ url: string | null; error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    const { data: urlData } = await supabase.storage
      .from('generated-pdfs')
      .createSignedUrl(filePath, 60 * 60 * 24); // 24 hours

    return { url: urlData?.signedUrl || null, error: null };
  } catch (err) {
    console.error('Get PDF URL error:', err);
    return { url: null, error: err as Error };
  }
}

/**
 * List all generated PDFs for a user
 */
export async function listGeneratedPDFs(
  userId: string
): Promise<{ files: { name: string; created_at: string }[]; error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    const { data: files, error } = await supabase.storage
      .from('generated-pdfs')
      .list(userId, {
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      return { files: [], error: new Error(error.message) };
    }

    return { 
      files: files?.map(f => ({ name: f.name, created_at: f.created_at || '' })) || [],
      error: null 
    };
  } catch (err) {
    console.error('List PDFs error:', err);
    return { files: [], error: err as Error };
  }
}

/**
 * Delete a generated PDF
 */
export async function deleteGeneratedPDF(filePath: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    const { error } = await supabase.storage
      .from('generated-pdfs')
      .remove([filePath]);

    if (error) {
      return { error: new Error(error.message) };
    }

    return { error: null };
  } catch (err) {
    console.error('Delete PDF error:', err);
    return { error: err as Error };
  }
}
