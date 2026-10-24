import { authClient } from '@/auth/client';
import type { SubscriptionTier } from '@/db/types';
import { getSubscriptionAction } from '@/db/actions';

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
  created_at: string;
  updated_at: string;
}

/**
 * Get user's subscription
 */
export async function getSubscription(userId: string): Promise<Subscription | null> {
  try {
    return await getSubscriptionAction(userId) as Subscription | null;
  } catch (e) {
    console.warn('getSubscription: unexpected error (non-fatal):', e);
    return null;
  }
}

/**
 * Change user password
 */
export async function changePassword(
  newPassword: string,
  currentPassword?: string,
): Promise<{ error: Error | null }> {
  if (!currentPassword) {
    return { error: new Error('Current password is required.') };
  }
  const { error } = await authClient.changePassword({
    newPassword,
    currentPassword,
    revokeOtherSessions: true,
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
