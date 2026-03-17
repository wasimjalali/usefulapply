import { getSupabase } from './client';

// Get untyped supabase client for tables not in generated types
const getUntypedSupabase = () => getSupabase() as any;

export interface Document {
  id: string;
  user_id: string;
  type: 'primary_cv' | 'master_cv';
  file_name: string;
  file_type: 'pdf' | 'docx' | 'txt';
  file_size?: number;
  storage_path?: string;
  raw_text?: string;
  sections?: Record<string, string>;
  all_skills?: string[];
  all_experiences?: string[];
  all_education?: string[];
  structured_data?: any;
  created_at: string;
  updated_at: string;
}

/**
 * Get user's documents
 */
export async function getDocuments(userId: string): Promise<Document[]> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching documents:', error);
    return [];
  }

  return data as Document[];
}

/**
 * Get a specific document by type
 */
export async function getDocumentByType(
  userId: string, 
  type: 'primary_cv' | 'master_cv'
): Promise<Document | null> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Error fetching document:', error);
    return null;
  }

  // Return first result or null (avoids 406 error from .single() when no rows)
  return (data && data.length > 0) ? data[0] as Document : null;
}

/**
 * Save or update a document
 */
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
  }
): Promise<{ document: Document | null; error: Error | null }> {
  const supabase = getUntypedSupabase();
  
  // Check if document of this type already exists
  const existing = await getDocumentByType(userId, type);
  
  if (existing) {
    // Update existing
    const { data: updated, error } = await supabase
      .from('documents')
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      return { document: null, error: new Error(error.message) };
    }
    return { document: updated as Document, error: null };
  } else {
    // Insert new
    const { data: inserted, error } = await supabase
      .from('documents')
      .insert({
        user_id: userId,
        type,
        ...data,
      })
      .select()
      .single();

    if (error) {
      return { document: null, error: new Error(error.message) };
    }
    return { document: inserted as Document, error: null };
  }
}

/**
 * Delete a document
 */
export async function deleteDocument(documentId: string): Promise<{ error: Error | null }> {
  const supabase = getUntypedSupabase();
  
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', documentId);

  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}

/**
 * Upload CV file to storage
 */
export async function uploadCVFile(
  userId: string,
  type: 'primary_cv' | 'master_cv',
  file: File
): Promise<{ path: string | null; error: Error | null }> {
  const supabase = getUntypedSupabase();
  
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
