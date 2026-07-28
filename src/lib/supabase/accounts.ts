import { getSupabase } from './client';
import type { SubscriptionTier } from './types';

// Get untyped supabase client for tables not in generated types
const getUntypedSupabase = () => getSupabase() as any;

export interface ConnectedAccount {
  id: string;
  user_id: string;
  provider: 'google' | 'linkedin' | 'github';
  provider_user_id: string;
  provider_email?: string;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  tier: SubscriptionTier;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  stripe_price_id?: string;
  current_period_start?: string;
  current_period_end?: string;
  cancel_at_period_end: boolean;
  applications_used: number;
  applications_limit: number;
  created_at: string;
  updated_at: string;
}

/**
 * Get user's connected accounts
 */
export async function getConnectedAccounts(userId: string): Promise<ConnectedAccount[]> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('Error fetching connected accounts:', error);
    return [];
  }

  return data as ConnectedAccount[];
}

/**
 * Disconnect an OAuth account
 */
export async function disconnectAccount(
  userId: string,
  provider: 'google' | 'linkedin' | 'github'
): Promise<{ error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { error } = await supabase
    .from('connected_accounts')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Get user's subscription
 */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  try {
    const supabase = getUntypedSupabase();

    // Use maybeSingle() to avoid 406 HTTP errors when no subscription exists.
    // Most users have no row here — the app uses user_credits for plan management.
    const { data, error } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle();

    if (error) {
      // Table missing or other schema issue — fail gracefully
      return null;
    }

    return data as Subscription | null;
  } catch (e) {
    console.warn('getSubscription: unexpected error (non-fatal):', e);
    return null;
  }
}

/**
 * Create a free subscription for new users
 */
export async function createFreeSubscription(userId: string): Promise<{ subscription: Subscription | null; error: Error | null }> {
  const supabase = getUntypedSupabase();

  const { data, error } = await supabase
    .from('subscriptions')
    .insert({
      user_id: userId,
      tier: 'free',
      status: 'active',
      applications_used: 0,
      applications_limit: 5,
    })
    .select()
    .single();

  if (error) {
    return { subscription: null, error: new Error(error.message) };
  }

  return { subscription: data as Subscription, error: null };
}

/**
 * Check if user can create more applications
 * Note: Now using credit system instead of applications_used counter
 */
export async function canCreateApplication(userId: string): Promise<boolean> {
  const subscription = await getSubscription(userId);
  
  if (!subscription) {
    // No subscription = free tier with default limits
    return true; // Allow for now, will create subscription on first use
  }

  // Paid plans have full application access; free plans keep the legacy limit.
  if (subscription.tier === 'plus' || subscription.tier === 'max') {
    return true;
  }

  // Free tier has limits
  return subscription.applications_used < subscription.applications_limit;
}

/**
 * Change user password
 */
export async function changePassword(newPassword: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Send password reset email via server route.
 * Uses admin generateLink + token_hash (not client PKCE) so the link works
 * when opened on a different device/browser than the one that requested it.
 */
export async function sendPasswordResetEmail(email: string): Promise<{ error: Error | null }> {
  try {
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        error: new Error(data.error || 'Failed to send reset email. Please try again.'),
      };
    }

    return { error: null };
  } catch {
    return { error: new Error('Failed to send reset email. Please try again.') };
  }
}

/**
 * Connect OAuth provider (Google/LinkedIn)
 * This initiates the OAuth flow
 */
export async function connectOAuthProvider(
  provider: 'google' | 'linkedin_oidc'
): Promise<{ error: Error | null }> {
  const supabase = getSupabase();

  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback?type=link`,
      scopes: provider === 'google' ? 'email profile' : 'r_liteprofile r_emailaddress',
    },
  });

  if (error) {
    return { error: new Error(error.message) };
  }

  return { error: null };
}

/**
 * Delete user account and all associated data
 * This deletes:
 * - User profile
 * - All documents (CVs)
 * - All application sessions
 * - Connected accounts
 * - Subscription
 * - Storage files (avatars, profile photos, generated PDFs)
 */
export async function deleteUserAccount(userId: string): Promise<{ error: Error | null }> {
  const supabase = getSupabase();
  
  try {
    // Delete from storage buckets first
    const buckets = ['avatars', 'profile-photos', 'generated-pdfs', 'cv-uploads'];
    for (const bucket of buckets) {
      try {
        const { data: files } = await supabase.storage.from(bucket).list(userId);
        if (files && files.length > 0) {
          const filePaths = files.map(f => `${userId}/${f.name}`);
          await supabase.storage.from(bucket).remove(filePaths);
        }
      } catch (e) {
        console.warn(`Could not delete from bucket ${bucket}:`, e);
      }
    }

    // Delete from database tables (order matters due to foreign keys)
    // Most tables use `user_id` as the FK column, but `profiles` uses `id`.
    // `contact_submissions` has no user FK — it's a public form (skip it).
    const tablesWithUserId = [
      'chat_messages',
      'application_sessions',
      'documents',
      'connected_accounts',
      'user_credits',
      'credit_transactions',
      'subscriptions',
      'message_feedback',
    ];

    for (const table of tablesWithUserId) {
      try {
        const { error } = await (supabase as any)
          .from(table)
          .delete()
          .eq('user_id', userId);

        if (error && error.code !== 'PGRST116') {
          console.warn(`Error deleting from ${table}:`, error.message);
        }
      } catch (e) {
        console.warn(`Could not delete from table ${table}:`, e);
      }
    }

    // profiles table uses `id` (not `user_id`) as the primary key
    try {
      const { error } = await (supabase as any)
        .from('profiles')
        .delete()
        .eq('id', userId);

      if (error && error.code !== 'PGRST116') {
        console.warn('Error deleting from profiles:', error.message);
      }
    } catch (e) {
      console.warn('Could not delete from profiles:', e);
    }

    // Finally sign out the user (this doesn't delete auth.users but ends the session)
    await supabase.auth.signOut();

    return { error: null };
  } catch (err) {
    console.error('Error deleting account:', err);
    return { error: err as Error };
  }
}
