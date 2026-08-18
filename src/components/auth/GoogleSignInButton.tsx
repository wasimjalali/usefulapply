'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

interface GoogleSignInButtonProps {
  label: string;
  onError: (message: string) => void;
}

// "Continue with Google" button plus the "or" divider under it.
// Used on the login and signup pages above the email form.
export function GoogleSignInButton({ label, onError }: GoogleSignInButtonProps) {
  const { signInWithGoogle } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const handleClick = async () => {
    setIsLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      onError(error.message);
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
        className="w-full flex items-center justify-center gap-3 px-4 py-2.5 bg-white border border-cream-300 rounded-lg hover:bg-cream-50 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin text-warm-gray" />
        ) : (
          <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.55 5.55 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87z" />
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24z" />
            <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A12 12 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09z" />
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
          </svg>
        )}
        <span className="font-medium text-charcoal">{label}</span>
      </button>

      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-cream-300" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-3 bg-cream-50 text-warm-gray">or</span>
        </div>
      </div>
    </>
  );
}
