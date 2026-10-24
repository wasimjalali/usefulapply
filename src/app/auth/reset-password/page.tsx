'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { authClient } from '@/auth/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { AuthField, AUTH_CARD, AUTH_SUBMIT } from '@/components/auth/parts';

type PageState = 'ready' | 'success' | 'invalid';

const MIN_PASSWORD = 8;

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read the token once, then take it out of the address bar. While it sits in
  // the URL it is a live credential in browser history, in the referrer of any
  // outbound request, and in every analytics event the page emits.
  const [token] = useState(() => searchParams.get('token'));
  const [pageState, setPageState] = useState<PageState>(token ? 'ready' : 'invalid');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;
    if (!window.location.search) return;
    window.history.replaceState(null, '', window.location.pathname);
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setConfirmError(null);
    setFormError(null);

    if (!token) {
      setPageState('invalid');
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setConfirmError("That doesn't match the password above.");
      return;
    }

    setIsLoading(true);
    const { error } = await authClient.resetPassword({ newPassword: password, token });

    if (error) {
      setIsLoading(false);
      // A token that exists but is spent or past its 30 minutes comes back as an
      // error here, not as a missing token, so this is the only place the
      // expired card can be reached from. Without it the user retypes forever.
      const code = 'code' in error ? String(error.code) : '';
      const message = error.message ?? '';
      if (/token|expired|invalid/i.test(`${code} ${message}`)) {
        setPageState('invalid');
        return;
      }
      setFormError("We couldn't update that password. Try again.");
      return;
    }

    setPageState('success');
    setTimeout(() => router.push('/auth/login'), 2000);
  };

  if (pageState === 'invalid') {
    return (
      <AuthShell linkLabel="Log in" linkHref="/auth/login">
        <div className={AUTH_CARD}>
          <h1 className="text-2xl font-semibold text-ink">This link has expired</h1>
          <p className="mt-3 text-sm text-ink-body">
            Reset links work for 30 minutes. Ask for a new one and open it on this device.
          </p>
          <Link href="/auth/forgot-password" className={`mt-6 ${AUTH_SUBMIT}`}>
            Send a new link
          </Link>
        </div>

        <p className="mt-5 text-center text-sm">
          <Link
            href="/auth/login"
            className="font-semibold text-ink transition-colors duration-(--duration-base) hover:text-brand cursor-pointer"
          >
            Back to log in
          </Link>
        </p>
      </AuthShell>
    );
  }

  if (pageState === 'success') {
    return (
      <AuthShell linkLabel="Log in" linkHref="/auth/login">
        <div className={`${AUTH_CARD} text-center`}>
          <h1 className="text-2xl font-semibold text-ink">Password updated</h1>
          <p className="mt-3 text-sm text-ink-body">Taking you to the log in page.</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell linkLabel="Log in" linkHref="/auth/login">
      <div className={AUTH_CARD}>
        <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>

        {formError && <p className="mt-3 text-sm text-danger">{formError}</p>}

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <AuthField
            id="password"
            label="New password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            autoComplete="new-password"
            error={passwordError}
          />
          <AuthField
            id="confirmPassword"
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="Type it again"
            autoComplete="new-password"
            error={confirmError}
          />
          <button type="submit" disabled={isLoading} className={`mt-1 ${AUTH_SUBMIT}`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm">
        <Link
          href="/auth/login"
          className="font-semibold text-ink transition-colors duration-(--duration-base) hover:text-brand cursor-pointer"
        >
          Back to log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-canvas" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
