'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getSafeNextPath } from '@/lib/auth/safe-next';
import { AuthShell } from '@/components/auth/AuthShell';
import { CheckEmailCard } from '@/components/auth/CheckEmailCard';
import { AuthField, AUTH_CARD, AUTH_SUBMIT } from '@/components/auth/parts';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';

const WRONG_PASSWORD = "That password doesn't match this email.";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  // A user with no kit lands on the guided line, which is what /dashboard shows.
  const next = getSafeNextPath(searchParams.get('next'), '/dashboard');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [hasResent, setHasResent] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resendOnly: true }),
      });
      if (res.ok) {
        setHasResent(true);
      } else {
        setFormError("We couldn't send that link. Try again in a minute.");
      }
    } catch {
      setFormError("We couldn't send that link. Try again in a minute.");
    } finally {
      setIsResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setFormError(null);
    setIsLoading(true);

    const { error } = await signIn(email, password);

    if (!error) {
      router.push(next);
      return;
    }

    setIsLoading(false);
    if (error.message === 'EMAIL_NOT_CONFIRMED') {
      setNeedsConfirmation(true);
      return;
    }
    if (/invalid|password|credential/i.test(error.message)) {
      setPasswordError(WRONG_PASSWORD);
      return;
    }
    setFormError("We couldn't sign you in. Try again in a moment.");
  };

  if (needsConfirmation) {
    return (
      <AuthShell linkLabel="Log in" linkHref="/auth/login">
        <CheckEmailCard
          email={email}
          onResend={handleResend}
          isResending={isResending}
          hasResent={hasResent}
          error={formError}
          onStartOver={() => {
            setNeedsConfirmation(false);
            setHasResent(false);
            setFormError(null);
            // "Wrong address?" means the address is what they want to change.
            setEmail('');
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell linkLabel="New here? Start free" linkHref="/dashboard">
      <div className={AUTH_CARD}>
        <h1 className="text-2xl font-semibold text-navy-800">Log in</h1>

        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

        <div className="mt-6">
          <GoogleSignInButton label="Continue with Google" onError={setFormError} next={next} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <div>
            <AuthField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
              error={passwordError}
            />
            <div className="mt-2 flex justify-end">
              <Link
                href="/auth/forgot-password"
                className="text-sm font-semibold text-navy-800 transition-colors duration-200 hover:text-navy-600 cursor-pointer"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className={`mt-1 ${AUTH_SUBMIT}`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log in'}
          </button>
        </form>
      </div>

      <p className="mt-5 text-center text-sm text-warm-gray">
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/signup"
          className="font-semibold text-navy-800 transition-colors duration-200 hover:text-navy-600 cursor-pointer"
        >
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream-100" />}>
      <LoginForm />
    </Suspense>
  );
}
