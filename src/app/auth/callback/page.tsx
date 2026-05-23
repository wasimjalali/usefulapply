'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { Loader2 } from 'lucide-react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fire-and-forget: trigger the founder welcome + Day 3 schedule once we
    // know we have a confirmed session. Idempotent server-side via
    // profiles.welcome_sent_at, so safe to call on every callback hit.
    const triggerPostConfirm = () => {
      fetch('/api/auth/post-confirm', {
        method: 'POST',
        credentials: 'same-origin',
      }).catch(() => {
        // Non-blocking — welcome email is best-effort and must not gate the redirect.
      });
    };

    const handleCallback = async () => {
      const supabase = getSupabase();

      // Flow 1: PKCE code exchange (OAuth, client-side signUp)
      // User-aware persistence cleanup happens in AuthProvider after Supabase
      // establishes the actual authenticated user.
      const code = searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          triggerPostConfirm();
          const next = searchParams.get('next') ?? '/dashboard';
          router.replace(next);
          return;
        }
        setError(exchangeError.message);
        return;
      }

      // Flow 2: Implicit flow — tokens in URL hash (email confirmation via generateLink)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!sessionError) {
            triggerPostConfirm();
            router.replace('/dashboard');
            return;
          }
          setError(sessionError.message);
          return;
        }
      }

      // No code or token found
      router.replace('/auth/auth-code-error');
    };

    handleCallback();
  }, [router, searchParams]);

  if (error) {
    router.replace('/auth/auth-code-error');
    return null;
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
