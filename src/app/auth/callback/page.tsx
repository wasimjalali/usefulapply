'use client';

import { useEffect, useState, Suspense, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/client';
import { getSafeNextPath } from '@/lib/auth/safe-next';
import { Loader2 } from 'lucide-react';

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    // Fire-and-forget: trigger the founder welcome + Day 3 schedule once we
    // know we have a confirmed session. Idempotent server-side via
    // profiles.welcome_sent_at, so safe to call on every callback hit.
    // Skip for password recovery — that is not a new signup.
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
      const next = getSafeNextPath(searchParams.get('next'), '/dashboard');
      const authType = searchParams.get('type');
      const isRecovery =
        authType === 'recovery' || next.startsWith('/auth/reset-password');

      // Flow 0: session already established by /auth/confirm (token_hash).
      // Only accept this path when confirm explicitly handed us off
      // (from_confirm=1) so a stale tab hitting /auth/callback alone
      // cannot masquerade as a fresh verification.
      if (searchParams.get('from_confirm') === '1') {
        const {
          data: { session: existing },
        } = await supabase.auth.getSession();
        if (existing) {
          if (!isRecovery) triggerPostConfirm();
          router.replace(next);
          return;
        }
        setStatus('error');
        router.replace(
          `/auth/auth-code-error?error=session_missing&error_description=${encodeURIComponent(
            'Your session could not be established. Please try the link again.'
          )}`
        );
        return;
      }

      // Flow 1: PKCE code exchange (OAuth, same-browser email links)
      // User-aware persistence cleanup happens in AuthProvider after Supabase
      // establishes the actual authenticated user.
      const code = searchParams.get('code');
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (!exchangeError) {
          if (!isRecovery) triggerPostConfirm();
          router.replace(next);
          return;
        }
        console.error('[auth/callback] exchangeCodeForSession:', exchangeError.message);
        setStatus('error');
        router.replace(
          `/auth/auth-code-error?error=exchange_failed&error_description=${encodeURIComponent(
            exchangeError.message
          )}`
        );
        return;
      }

      // Flow 2: token_hash handed to the client by mistake (prefer /auth/confirm)
      const tokenHash = searchParams.get('token_hash');
      const otpType = searchParams.get('type');
      if (tokenHash && otpType) {
        router.replace(
          `/auth/confirm?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(
            otpType
          )}&next=${encodeURIComponent(next)}`
        );
        return;
      }

      // Flow 3: Implicit flow — tokens in URL hash (legacy email templates)
      const hash = window.location.hash;
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const hashType = params.get('type');
        const hashIsRecovery = hashType === 'recovery' || isRecovery;

        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!sessionError) {
            if (!hashIsRecovery) triggerPostConfirm();
            const hashNext =
              hashIsRecovery && next === '/dashboard'
                ? '/auth/reset-password'
                : next;
            router.replace(hashNext);
            return;
          }
          console.error('[auth/callback] setSession:', sessionError.message);
          setStatus('error');
          router.replace(
            `/auth/auth-code-error?error=session_failed&error_description=${encodeURIComponent(
              sessionError.message
            )}`
          );
          return;
        }
      }

      // Provider error params (OAuth cancel, etc.)
      const providerError = searchParams.get('error');
      if (providerError) {
        setStatus('error');
        const desc = searchParams.get('error_description') ?? '';
        router.replace(
          `/auth/auth-code-error?error=${encodeURIComponent(providerError)}&error_description=${encodeURIComponent(desc)}`
        );
        return;
      }

      // No code or token found
      setStatus('error');
      router.replace('/auth/auth-code-error?error=missing_token');
    };

    handleCallback();
  }, [router, searchParams]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-cream-100 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-navy-600 mx-auto mb-4" />
          <p className="text-warm-gray">Redirecting...</p>
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
