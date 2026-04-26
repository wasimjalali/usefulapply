import { getSupabase } from './client';
import type { JobFeedGenerationStatus } from './types';

// Get untyped supabase client for tables not in generated types
const getUntypedSupabase = () => getSupabase() as any;

export interface ApplicationSession {
  id: string;
  user_id: string;
  job_title?: string;
  company?: string;
  job_description: string;
  job_url?: string;
  match_score?: number;
  matching_skills: string[];
  missing_skills: string[];
  suggestions: string[];
  requirements?: any;
  gaps?: any;
  generated_cv?: any;
  cover_letter?: any;
  email?: any;
  follow_up_email?: any;
  company_research?: any;
  company_address?: string;
  company_contact_person?: string;
  cv_edits: any[];
  optimized_pdf_path?: string;
  optimized_cv_text?: string;
  email_subject?: string;
  email_body?: string;
  selected_template?: string;
  status?: 'applied' | 'interview' | 'rejected' | 'accepted' | 'follow_up';
  cover_letter_language?: string;
  fit_assessment?: any;
  generation_completed?: boolean;
  generation_status?: JobFeedGenerationStatus;
  generation_error?: string;
  generation_started_at?: string;
  generation_completed_at?: string;
  generation_failed_at?: string;
  generation_cancelled_at?: string;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  actions?: any[];
  created_at: string;
}

/**
 * Get all sessions for a user
 */
export async function getSessions(userId: string): Promise<ApplicationSession[]> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('application_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching sessions:', error);
    return [];
  }

  return data as ApplicationSession[];
}

/**
 * Get a specific session
 * @param userId - When provided, adds user_id filter for defense-in-depth (RLS provides primary protection)
 */
export async function getSession(sessionId: string, userId?: string): Promise<ApplicationSession | null> {
  const supabase = getUntypedSupabase();

  let query = supabase
    .from('application_sessions')
    .select('*')
    .eq('id', sessionId);

  if (userId) query = query.eq('user_id', userId);

  const { data, error } = await query.single();

  if (error) {
    console.error('Error fetching session:', error);
    return null;
  }

  return data as ApplicationSession;
}

/**
 * Create a new session
 */
export async function createSession(
  userId: string,
  jobDescription: string
): Promise<{ session: ApplicationSession | null; error: Error | null }> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('application_sessions')
    .insert({
      user_id: userId,
      job_description: jobDescription,
      matching_skills: [],
      missing_skills: [],
      suggestions: [],
      cv_edits: [],
    })
    .select()
    .single();

  if (error) {
    return { session: null, error: new Error(error.message) };
  }

  return { session: data as ApplicationSession, error: null };
}

/**
 * Update a session
 * @param userId - When provided, adds user_id filter for defense-in-depth
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Omit<ApplicationSession, 'id' | 'user_id' | 'created_at'>>,
  userId?: string
): Promise<{ error: Error | null }> {
  const supabase = getUntypedSupabase();

  let query = supabase
    .from('application_sessions')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (userId) query = query.eq('user_id', userId);

  const { error } = await query;

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Delete a session
 * @param userId - When provided, adds user_id filter for defense-in-depth
 */
export async function deleteSession(sessionId: string, userId?: string): Promise<{ error: Error | null }> {
  const supabase = getUntypedSupabase();

  let query = supabase
    .from('application_sessions')
    .delete()
    .eq('id', sessionId);

  if (userId) query = query.eq('user_id', userId);

  const { error } = await query;

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Get chat messages for a session
 */
export async function getChatMessages(sessionId: string): Promise<ChatMessage[]> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error);
    return [];
  }

  return data as ChatMessage[];
}

/**
 * Add a chat message
 */
export async function addChatMessage(
  sessionId: string,
  userId: string,
  message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    actions?: any[];
  }
): Promise<{ message: ChatMessage | null; error: Error | null }> {
  const supabase = getUntypedSupabase();
  
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      role: message.role,
      content: message.content,
      actions: message.actions || [],
    })
    .select()
    .single();

  if (error) {
    return { message: null, error: new Error(error.message) };
  }

  return { message: data as ChatMessage, error: null };
}

/**
 * Delete all messages for a session
 */
export async function clearChatMessages(sessionId: string): Promise<{ error: Error | null }> {
  const supabase = getUntypedSupabase();
  
  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .eq('session_id', sessionId);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}
