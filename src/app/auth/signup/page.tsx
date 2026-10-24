'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { CheckEmailCard } from '@/components/auth/CheckEmailCard';
import { AuthField, AUTH_CARD, AUTH_SUBMIT } from '@/components/auth/parts';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { KEEP_ANONYMOUS_PARAM, prepareAnonymousCarryOver } from '@/lib/anonymous-generation';

const MIN_PASSWORD = 8;

function SignUpForm() {
  const searchParams = useSearchParams();
  const planParam = searchParams.get('plan');
  const plan = planParam === 'plus' || planParam === 'max' ? planParam : undefined;
  const next = plan ? `/pricing?checkout=${plan}` : undefined;
  // Opened from an account wall: the CV and fit check in this browser come along into the account.
  const keepAnonymous = searchParams.get(KEEP_ANONYMOUS_PARAM) === '1';
  const loginParams = new URLSearchParams();
  if (next) loginParams.set('next', next);
  if (keepAnonymous) loginParams.set(KEEP_ANONYMOUS_PARAM, '1');
  const loginHref = loginParams.size > 0 ? `/auth/login?${loginParams.toString()}` : '/auth/login';
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [hasResent, setHasResent] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    setFormError(null);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resendOnly: true, plan }),
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

    if (password.length < MIN_PASSWORD) {
      setPasswordError(`Use at least ${MIN_PASSWORD} characters.`);
      return;
    }

    setIsLoading(true);
    prepareAnonymousCarryOver(keepAnonymous);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName, plan }),
      });
      if (res.ok) {
        setSent(true);
        return;
      }
      // The signup route returns one fixed string for every failure, on purpose,
      // so an existing address can't be told apart from a broken one. Point at
      // log in rather than guessing which it was.
      setFormError("We couldn't create that account. If you already have one, log in.");
    } catch {
      setFormError("We couldn't create that account. Try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell linkLabel="Log in" linkHref={loginHref}>
        <CheckEmailCard
          email={email}
          onResend={handleResend}
          isResending={isResending}
          hasResent={hasResent}
          error={formError}
          onStartOver={() => {
            setSent(false);
            setHasResent(false);
            setFormError(null);
            setEmail('');
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell linkLabel="Log in" linkHref={loginHref}>
      <div className={AUTH_CARD}>
        <h1 className="text-2xl font-semibold text-navy-800">Create your free account</h1>
        <p className="mt-1.5 text-sm text-warm-gray">4 credits a month, no card.</p>

        {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}

        <div className="mt-6">
          <GoogleSignInButton label="Continue with Google" onError={setFormError} next={next} keepAnonymous={keepAnonymous} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <AuthField
            id="name"
            label="Name"
            type="text"
            value={fullName}
            onChange={setFullName}
            placeholder="Your name"
            autoComplete="name"
          />
          <AuthField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
          />
          <AuthField
            id="password"
            label="Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder={`At least ${MIN_PASSWORD} characters`}
            autoComplete="new-password"
            error={passwordError}
          />

          <button type="submit" disabled={isLoading} className={`mt-1 ${AUTH_SUBMIT}`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-warm-gray">
          By continuing you agree to the{' '}
          <Link href="/terms" className="font-semibold text-navy-800 hover:text-navy-600 cursor-pointer">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="font-semibold text-navy-800 hover:text-navy-600 cursor-pointer">
            Privacy policy
          </Link>
          .
        </p>
      </div>

      <p className="mt-5 text-center text-sm text-warm-gray">
        Already have an account?{' '}
        <Link
          href={loginHref}
          className="font-semibold text-navy-800 transition-colors duration-200 hover:text-navy-600 cursor-pointer"
        >
          Log in
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignUpPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream-100" />}>
      <SignUpForm />
    </Suspense>
  );
}
