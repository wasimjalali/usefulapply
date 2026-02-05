/**
 * Session Cleanup Utilities
 * Handles expiration and cleanup of old sessions
 */

import { createClient } from '@supabase/supabase-js';

const SESSION_EXPIRY_DAYS = 30; // Sessions older than 30 days are considered expired

export interface CleanupResult {
  deletedCount: number;
  error?: string;
}

/**
 * Delete sessions older than specified days
 */
export async function cleanupExpiredSessions(
  userId: string,
  expiryDays: number = SESSION_EXPIRY_DAYS
): Promise<CleanupResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        deletedCount: 0,
        error: 'Supabase configuration missing',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() - expiryDays);

    // Delete old sessions
    const { data, error } = await supabase
      .from('application_sessions')
      .delete()
      .eq('user_id', userId)
      .lt('created_at', expiryDate.toISOString())
      .select('id');

    if (error) {
      return {
        deletedCount: 0,
        error: error.message,
      };
    }

    return {
      deletedCount: data?.length || 0,
    };
  } catch (error) {
    return {
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete all sessions for a user (for account deletion)
 */
export async function deleteAllUserSessions(userId: string): Promise<CleanupResult> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        deletedCount: 0,
        error: 'Supabase configuration missing',
      };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
      .from('application_sessions')
      .delete()
      .eq('user_id', userId)
      .select('id');

    if (error) {
      return {
        deletedCount: 0,
        error: error.message,
      };
    }

    return {
      deletedCount: data?.length || 0,
    };
  } catch (error) {
    return {
      deletedCount: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get count of sessions for a user
 */
export async function getSessionCount(userId: string): Promise<number> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return 0;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { count, error } = await supabase
      .from('application_sessions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) {
      console.error('Error getting session count:', error);
      return 0;
    }

    return count || 0;
  } catch (error) {
    console.error('Error getting session count:', error);
    return 0;
  }
}

/**
 * Schedule automatic cleanup (call this on user login or periodically)
 */
export async function scheduleSessionCleanup(userId: string): Promise<void> {
  // Run cleanup in background (don't await)
  cleanupExpiredSessions(userId).then(result => {
    if (result.deletedCount > 0) {
      console.log(`[Session Cleanup] Deleted ${result.deletedCount} expired sessions for user ${userId}`);
    }
  }).catch(error => {
    console.error('[Session Cleanup] Error:', error);
  });
}
