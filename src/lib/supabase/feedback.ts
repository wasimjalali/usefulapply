import { getSupabase } from './client';

// Get untyped supabase client for tables not in generated types
const getUntypedSupabase = () => getSupabase() as any;

export interface MessageFeedback {
  id: string;
  user_id: string;
  session_id?: string;
  message_id: string;
  feedback_type: 'positive' | 'negative';
  feedback_text?: string;
  message_content?: string;
  created_at: string;
}

/**
 * Submit feedback for a message
 */
export async function submitMessageFeedback(
  userId: string,
  messageId: string,
  feedbackType: 'positive' | 'negative',
  options?: {
    sessionId?: string;
    messageContent?: string;
    feedbackText?: string;
  }
): Promise<{ feedback: MessageFeedback | null; error: Error | null }> {
  const supabase = getUntypedSupabase();

  // Check if feedback already exists for this message
  const { data: existing } = await supabase
    .from('message_feedback')
    .select('id, feedback_type')
    .eq('user_id', userId)
    .eq('message_id', messageId)
    .single();

  if (existing) {
    // Update existing feedback if type changed
    if (existing.feedback_type !== feedbackType) {
      const { data, error } = await supabase
        .from('message_feedback')
        .update({ feedback_type: feedbackType })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) {
        return { feedback: null, error: new Error(error.message) };
      }
      return { feedback: data as MessageFeedback, error: null };
    }
    // Same feedback type - remove it (toggle off)
    const { error } = await supabase
      .from('message_feedback')
      .delete()
      .eq('id', existing.id);

    if (error) {
      return { feedback: null, error: new Error(error.message) };
    }
    return { feedback: null, error: null }; // Feedback removed
  }

  // Insert new feedback
  const { data, error } = await supabase
    .from('message_feedback')
    .insert({
      user_id: userId,
      message_id: messageId,
      feedback_type: feedbackType,
      session_id: options?.sessionId,
      message_content: options?.messageContent,
      feedback_text: options?.feedbackText,
    })
    .select()
    .single();

  if (error) {
    return { feedback: null, error: new Error(error.message) };
  }

  return { feedback: data as MessageFeedback, error: null };
}

/**
 * Get feedback for messages in a session
 */
export async function getSessionFeedback(
  userId: string,
  sessionId: string
): Promise<{ feedbacks: MessageFeedback[]; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('message_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId);

  if (error) {
    return { feedbacks: [], error: new Error(error.message) };
  }

  return { feedbacks: data as MessageFeedback[], error: null };
}

/**
 * Get feedback for a specific message
 */
export async function getMessageFeedback(
  userId: string,
  messageId: string
): Promise<{ feedback: MessageFeedback | null; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('message_feedback')
    .select('*')
    .eq('user_id', userId)
    .eq('message_id', messageId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return { feedback: null, error: null }; // No rows
    return { feedback: null, error: new Error(error.message) };
  }

  return { feedback: data as MessageFeedback, error: null };
}
