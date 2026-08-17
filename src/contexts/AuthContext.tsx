'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session, AuthError, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '@/lib/supabase/client';
import type { Profile } from '@/lib/supabase/types';
import { getOrCreateProfileAction, getProfileAction, updateProfileAction } from '@/db/actions';
import { useCVStore } from '@/store/useCVStore';
import { useSessionStore } from '@/store/useSessionStore';
import { useUIStore } from '@/store/useUIStore';
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
    localStorage.removeItem('session-store');
    localStorage.removeItem('cv-store');
  } catch (e) {
    console.error('[Auth] Failed to clear persist storage:', e);
  }
}

type SupabaseClientType = SupabaseClient<any, 'public', any>;

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  isLoading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signInWithGoogle: () => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = getSupabase() as SupabaseClientType;

  // Track the previous user ID to detect user switches on the same browser
  const prevUserIdRef = useRef<string | null>(null);

  // Fetch user profile from database, create if doesn't exist
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

  // Refresh profile data
  const refreshProfile = useCallback(async () => {
    if (user) {
      const profileData = await fetchProfile(user.id);
      setProfile(profileData);
    }
  }, [user, fetchProfile]);

  // Initialize auth state
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Auth timeout')), 10000)
        );
        
        // Get initial session with timeout
        const sessionPromise = supabase.auth.getSession();
        const { data: { session: initialSession } } = await Promise.race([
          sessionPromise,
          timeoutPromise
        ]) as Awaited<typeof sessionPromise>;
        
        if (initialSession) {
          // Only clear stores when switching between two different authenticated
          // users. When transitioning from anonymous (null) to first auth, keep
          // the data - the user may have uploaded a CV before signing up.
          const storedUserId = readAuthUserId();
          if (storedUserId && storedUserId !== initialSession.user.id) {
            clearPersistedStores();
          }
          writeAuthUserId(initialSession.user.id);
          prevUserIdRef.current = initialSession.user.id;

          setSession(initialSession);
          setUser(initialSession.user);
          // Fetch profile but don't block on it
          fetchProfile(initialSession.user.id)
            .then(profileData => setProfile(profileData))
            .catch(err => console.error('Profile fetch error:', err));
        } else {
          const storedUserId = readAuthUserId();
          if (storedUserId) {
            clearPersistedStores();
            clearAuthUserId();
          }
          prevUserIdRef.current = null;
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        // Detect user switch: clear stale persisted data before setting new user.
        // Skip clear when transitioning from anonymous (null) to first auth -
        // the user may have uploaded a CV before signing up.
        if (newSession?.user) {
          const prevId = prevUserIdRef.current || readAuthUserId();
          if (prevId && prevId !== newSession.user.id) {
            clearPersistedStores();
          }
          writeAuthUserId(newSession.user.id);
          prevUserIdRef.current = newSession.user.id;
        } else if (event === 'SIGNED_OUT') {
          prevUserIdRef.current = null;
          clearPersistedStores();
          clearAuthUserId();
        }

        setSession(newSession);
        setUser(newSession?.user ?? null);
        setIsLoading(false);

        if (newSession?.user) {
          // Identify user in PostHog
          posthog.identify(newSession.user.id, {
            email: newSession.user.email,
            created_at: newSession.user.created_at,
          });
          // Fetch profile in background, don't block
          fetchProfile(newSession.user.id)
            .then(profileData => {
              setProfile(profileData);
              if (profileData?.subscription_tier) {
                posthog.people.set({ plan: profileData.subscription_tier });
              }
            })
            .catch(err => console.error('Profile fetch error:', err));
        } else {
          posthog.reset();
          setProfile(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, fetchProfile]);

  // Sign up with email and password
  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error };
  };

  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Supabase returns a generic "Invalid credentials" message for unconfirmed
    // emails. Surface a clear, actionable message instead.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase error code not in AuthError type
    if (error && (error as any).code === 'email_not_confirmed') {
      return {
        error: {
          ...error,
          message: 'EMAIL_NOT_CONFIRMED',
        } as AuthError,
      };
    }

    return { error };
  };

  // Sign in with Google OAuth
  const signInWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    return { error };
  };

  // Sign out — clear all persisted state to prevent cross-user data leakage
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    clearPersistedStores();
    clearAuthUserId();
  };

  // Update user profile - optimistic update for better UX
  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) {
      return { error: new Error('No user logged in') };
    }

    // Optimistic update - update local state immediately
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
    profile,
    session,
    isLoading,
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
