'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { clearAnonymousCarryOver, prepareAnonymousCarryOver } from '@/lib/anonymous-generation';
import { GoogleMark } from '@/components/icons/GoogleMark';

interface GoogleSignInButtonProps {
  label: string;
  onError: (message: string) => void;
  /** Where to land after Google returns. Validated again in /auth/callback. */
  next?: string;
  /** Opened from an account wall: this browser's anonymous CV and fit check carry over into the account. */
  keepAnonymous?: boolean;
}

// "Continue with Google" button plus the "or" divider under it.
// Used on the login and signup pages above the email form.
export function GoogleSignInButton({ label, onError, next, keepAnonymous = false }: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    prepareAnonymousCarryOver(keepAnonymous);
    try {
      const { error } = await signInWithGoogle(next);
      if (error) {
        clearAnonymousCarryOver();
        onError(error.message);
        setIsLoading(false);
      }
    } catch {
      clearAnonymousCarryOver();
      onError('Google sign in did not start. Check your connection and try again.');
      setIsLoading(false);
    }
    // On success the browser navigates to Google, so leave the loading state on.
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isLoading}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-pill border border-border bg-surface text-[15px] font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin text-ink-muted" />
        ) : (
          <GoogleMark className="h-[18px] w-[18px]" />
        )}
        {label}
      </button>

      <div className="my-5 flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-ink-muted">or</span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </>
  );
}
