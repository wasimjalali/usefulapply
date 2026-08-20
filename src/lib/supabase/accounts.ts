import { authClient } from '@/auth/client';
import type { SubscriptionTier } from './types';
import {
  getConnectedAccountsAction,
  disconnectAccountAction,
  getSubscriptionAction,
} from '@/db/actions';

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
  return getConnectedAccountsAction(userId) as Promise<ConnectedAccount[]>;
}

/**
 * Disconnect an OAuth account
 */
export async function disconnectAccount(
  userId: string,
  provider: 'google' | 'linkedin' | 'github'
): Promise<{ error: Error | null }> {
  return disconnectAccountAction(userId, provider);
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
 * Create a free subscription for new users
 */
export async function createFreeSubscription(userId: string): Promise<{ subscription: Subscription | null; error: Error | null }> {
  const { createFreeSubscription: create } = await import('@/db/repos/subscriptions');
  return create(userId) as Promise<{ subscription: Subscription | null; error: Error | null }>;
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

/**
 * Connect OAuth provider (Google/LinkedIn)
 * This initiates the OAuth flow
 */
export async function connectOAuthProvider(
  provider: 'google' | 'linkedin_oidc'
): Promise<{ error: Error | null }> {
  if (provider !== 'google') {
    return { error: new Error('Only Google is supported right now.') };
  }
  const { error } = await authClient.signIn.social({
    provider: 'google',
    callbackURL: '/auth/callback?type=link',
  });
  if (error) {
    return { error: new Error(error.message) };
  }
  return { error: null };
}

