'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import { CheckEmailCard } from '@/components/auth/CheckEmailCard';
import { AuthField, AUTH_CARD, AUTH_SUBMIT } from '@/components/auth/parts';
import { sendPasswordResetEmail } from '@/lib/supabase';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [hasResent, setHasResent] = useState(false);

  const request = async () => {
    const { error } = await sendPasswordResetEmail(email);
    return error;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setIsLoading(true);

    const error = await request();

    setIsLoading(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setSent(true);
  };

  const handleResend = async () => {
    setIsResending(true);
    setEmailError(null);
    const error = await request();
    setIsResending(false);
    if (error) {
      setEmailError(error.message);
      return;
    }
    setHasResent(true);
  };

  if (sent) {
    return (
      <AuthShell linkLabel="Log in" linkHref="/auth/login">
        <CheckEmailCard
          email={email}
          onResend={handleResend}
          isResending={isResending}
          hasResent={hasResent}
          error={emailError}
          onStartOver={() => {
            setSent(false);
            setHasResent(false);
            setEmailError(null);
            setEmail('');
          }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell linkLabel="Log in" linkHref="/auth/login">
      <div className={AUTH_CARD}>
        <h1 className="text-2xl font-semibold text-ink">Reset your password</h1>
        <p className="mt-1.5 text-sm text-ink-muted">We&apos;ll email you a link. It works for 30 minutes.</p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <AuthField
            id="email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            placeholder="you@example.com"
            autoComplete="email"
            error={emailError}
          />
          <button type="submit" disabled={isLoading} className={`mt-1 ${AUTH_SUBMIT}`}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send the link'}
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
