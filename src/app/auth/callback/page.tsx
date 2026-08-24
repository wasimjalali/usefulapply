'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authClient } from '@/auth/client';
import { getSafeNextPath } from '@/lib/auth/safe-next';
import { Loader2 } from 'lucide-react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMessage, setErrorMessage] = useState("We couldn't complete sign in.");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    const triggerPostConfirm = () => {
      fetch('/api/auth/post-confirm', {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => {
        // Non-blocking — welcome email is best-effort and must not gate the redirect.
      });
    };

    const handleCallback = async () => {
      try {
        const next = getSafeNextPath(searchParams.get('next'), '/dashboard');
        const providerError = searchParams.get('error');
        if (providerError) {
          setStatus('error');
          const desc = searchParams.get('error_description') ?? '';
          router.replace(
            `/auth/auth-code-error?error=${encodeURIComponent(providerError)}&error_description=${encodeURIComponent(desc)}`
          );
          return;
        }

        const { data } = await authClient.getSession();
        if (data?.user) {
          triggerPostConfirm();
          router.replace(next);
          return;
        }

        setStatus('error');
        router.replace(
          `/auth/auth-code-error?error=session_missing&error_description=${encodeURIComponent(
            "Your session couldn't be established. Please try the link again."
          )}`
        );
      } catch {
        setErrorMessage("We couldn't verify your session. Check your connection and try again.");
        setStatus('error');
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="mb-4 text-warm-gray">{errorMessage}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-10 rounded-full bg-navy-600 px-5 text-sm font-semibold text-white hover:bg-navy-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-navy-600 mx-auto mb-4" />
        <p className="text-warm-gray">Completing sign in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-navy-600 mx-auto mb-4" />
            <p className="text-warm-gray">Loading...</p>
          </div>
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
