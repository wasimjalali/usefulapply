'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { consumeAnonymousCarryOver } from '@/lib/anonymous-generation';
import { authClient } from '@/auth/client';
import type { Profile } from '@/lib/supabase/types';
import { getOrCreateProfileAction, getProfileAction, updateProfileAction } from '@/db/actions';
import { detectTimezone } from '@/lib/utils/format-date';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
import { useFeedStore } from '@/store/useFeedStore';
import { useTrackerStore } from '@/store/useTrackerStore';
import posthog from 'posthog-js';

const AUTH_USER_ID_STORAGE_KEY = 'usefulapply-auth-user-id';
const AUTH_USER_ID_STORAGE_KEY_OLD = 'karko-auth-user-id';

function readAuthUserId(): string | null {
  const next = localStorage.getItem(AUTH_USER_ID_STORAGE_KEY);
  if (next) return next;
  const prev = localStorage.getItem(AUTH_USER_ID_STORAGE_KEY_OLD);
  if (prev) {
    localStorage.setItem(AUTH_USER_ID_STORAGE_KEY, prev);
    return prev;
  }
  return null;
}

function writeAuthUserId(userId: string) {
  localStorage.setItem(AUTH_USER_ID_STORAGE_KEY, userId);
}

/**
 * Synchronous "was signed in last time" hint for first-paint decisions.
 * The session itself resolves over the network; this lets the landing CTA
 * pick the right label a frame after mount instead of flashing the
 * signed-out default at a signed-in user.
 */
export function hasStoredAuthHint(): boolean {
  try {
    return Boolean(readAuthUserId());
  } catch {
    return false;
  }
}

function clearAuthUserId() {
  localStorage.removeItem(AUTH_USER_ID_STORAGE_KEY);
  localStorage.removeItem(AUTH_USER_ID_STORAGE_KEY_OLD);
}

/**
 * Clear all persisted Zustand stores to prevent cross-user data leakage.
 * Called on sign-out AND when the authenticated user changes (e.g. new user
 * signs in on the same browser without the previous user signing out first).
 */
function clearPersistedStores() {
  try {
    useCVStore.getState().resetCVData();
    useSessionStore.getState().resetSessionData();
    useUIStore.getState().resetUI();
    useFeedStore.getState().resetFeed();
    useTrackerStore.getState().reset();
    localStorage.removeItem('session-store');
    localStorage.removeItem('cv-store');
    localStorage.removeItem('usefulapply_resume_intent');
    localStorage.removeItem('usefulapply-default-template');
    localStorage.removeItem('karko-default-template');
  } catch (e) {
    console.error('[Auth] Failed to clear persist storage:', e);
  }
}

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  createdAt: Date;
  image?: string | null;
  created_at: string;
};

export type AuthSession = {
  id: string;
  userId: string;
  expiresAt: Date;
};

export type AuthError = { message: string };

interface AuthContextType {
  user: AuthUser | null;
  profile: Profile | null;
  session: AuthSession | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: (next?: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data: sessionData, isPending } = authClient.useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  // Better Auth refetches the session on window refocus and republishes
  // isPending: true while it runs. Only the first resolution counts as
  // loading; a refocus refetch must not unmount the app into a spinner
  // (it wipes component-local state like the guided line's step and job).
  const [sessionResolved, setSessionResolved] = useState(false);
  if (!isPending && !sessionResolved) setSessionResolved(true);

  // Memoised on scalar fields, not on the session objects: Better Auth's
  // atom republishes a new object on every background refetch (its dedupe
  // does not treat equal Dates as equal), so an object dep would re-fire the
  // effect below on every window refocus. Scalars keep `user` stable until
  // something actually changes.
  const rawUser = sessionData?.user;
  const rawSession = sessionData?.session;
  const uId = rawUser?.id ?? null;
  const uEmail = rawUser?.email ?? '';
  const uName = rawUser?.name ?? '';
  const uVerified = rawUser?.emailVerified ?? false;
  const uImage = rawUser?.image ?? null;
  const uCreatedMs = rawUser ? new Date(rawUser.createdAt).getTime() : 0;
  const user = useMemo<AuthUser | null>(() => {
    if (!uId) return null;
    const createdAt = new Date(uCreatedMs);
    return {
      id: uId,
      email: uEmail,
      name: uName,
      emailVerified: uVerified,
      createdAt,
      image: uImage,
      created_at: createdAt.toISOString(),
    };
  }, [uId, uEmail, uName, uVerified, uImage, uCreatedMs]);

  const sId = rawSession?.id ?? null;
  const sUserId = rawSession?.userId ?? '';
  const sExpiresMs = rawSession ? new Date(rawSession.expiresAt).getTime() : 0;
  const session = useMemo<AuthSession | null>(
    () => (sId ? { id: sId, userId: sUserId, expiresAt: new Date(sExpiresMs) } : null),
    [sId, sUserId, sExpiresMs],
  );

  const fetchProfile = useCallback(async (userId: string) => {
    try {
      const existing = await getProfileAction(userId);
      if (existing) return existing;
      return await getOrCreateProfileAction(userId);
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  useEffect(() => {
    if (isPending) return;

    if (user) {
      const prevId = prevUserIdRef.current || readAuthUserId();
      // Anonymous data (CV, fit check) carries over only when the guided
      // line's sign-up card marked the hand-off. Any other first sign-in on a
      // browser that never held a user drops it, so a stranger's CV can't
      // become this account's primary CV via useSupabaseSync.
      const carryOver = consumeAnonymousCarryOver();
      if ((prevId && prevId !== user.id) || (!prevId && !carryOver)) {
        clearPersistedStores();
      }
      writeAuthUserId(user.id);
      prevUserIdRef.current = user.id;

      posthog.identify(user.id, {
        email: user.email,
        created_at: user.created_at,
      });
      fetchProfile(user.id)
        .then((profileData) => {
          setProfile(profileData);
          if (profileData?.subscription_tier) {
            posthog.people.set({ plan: profileData.subscription_tier });
          }
          // PREFERENCES shows the detected zone but only writes it when the
          // user changes the dropdown, and it is already on their own zone, so
          // nobody ever does. The column stayed null for every account, which
          // left the reminder sweep judging "tomorrow" in UTC and every date
          // in the app on the browser's guess. Save it once, here, because the
          // server cannot detect it and most users never open settings.
          if (profileData && !profileData.timezone) {
            const detected = detectTimezone();
            if (detected) {
              setProfile({ ...profileData, timezone: detected } as Profile);
              updateProfileAction(user.id, { timezone: detected } as Partial<Profile>)
                .catch((err) => console.error('Timezone save error:', err));
            }
          }
        })
        .catch((err) => console.error('Profile fetch error:', err));
    } else {
      const storedUserId = readAuthUserId();
      if (storedUserId || prevUserIdRef.current) {
        clearPersistedStores();
        clearAuthUserId();
        posthog.reset();
      }
      prevUserIdRef.current = null;
    }
  }, [user, isPending, fetchProfile]);

  const signUp = async (email: string, password: string, fullName?: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        return { error: { message: data.error || 'Failed to create account. Please try again.' } };
      }
      return { error: null };
    } catch {
      return { error: { message: 'Failed to create account. Please try again.' } };
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await authClient.signIn.email({
      email,
      password,
      callbackURL: '/auth/callback',
    });
    if (!error) return { error: null };

    const code = 'code' in error ? String(error.code) : '';
    const message = error.message || '';
    if (
      code === 'EMAIL_NOT_VERIFIED'
      || /not verified|verify your email|email_not_verified/i.test(message)
    ) {
      return { error: { message: 'EMAIL_NOT_CONFIRMED' } };
    }
    return { error: { message: message || 'Invalid email or password.' } };
  };

  const signInWithGoogle = async (next?: string) => {
    // /auth/callback re-validates `next` with getSafeNextPath before it routes.
    const callbackURL = next ? `/auth/callback?next=${encodeURIComponent(next)}` : '/auth/callback';
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL,
    });
    if (error) {
      return { error: { message: error.message || 'Google sign-in failed.' } };
    }
    return { error: null };
  };

  const signOut = async () => {
    await authClient.signOut();
    setProfile(null);
    clearPersistedStores();
    clearAuthUserId();
    prevUserIdRef.current = null;
    posthog.reset();
  };

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { error: new Error('No user logged in') };
    }

    if (profile) {
      setProfile({ ...profile, ...updates } as Profile);
    }

    try {
      await updateProfileAction(user.id, updates);
      return { error: null };
    } catch (error) {
      await refreshProfile();
      return { error: error instanceof Error ? error : new Error('Failed to update profile') };
    }
  };

  const value: AuthContextType = {
    user,
    profile: user ? profile : null,
    session,
    isLoading: isPending && !sessionResolved,
    signUp,
    signIn,
    signInWithGoogle,
    signOut,
    updateProfile,
    refreshProfile,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
