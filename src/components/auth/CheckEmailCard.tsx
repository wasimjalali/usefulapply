'use client';

import { useEffect } from 'react';
import { Mail } from 'lucide-react';
import { AUTH_CARD } from './parts';

interface CheckEmailCardProps {
  email: string;
  onResend: () => void;
  isResending: boolean;
  /** Set once the link has been sent again, so the line stops offering it twice. */
  hasResent: boolean;
  onStartOver: () => void;
  /** A failed resend says so here. The form's error slot is unmounted in this state. */
  error?: string | null;
}

/**
 * A4. Shown after a reset request and after sign-up verification. The route
 * behind it stays the same, so the title is set here rather than in metadata.
 */
export function CheckEmailCard({
  email,
  onResend,
  isResending,
  hasResent,
  onStartOver,
  error,
}: CheckEmailCardProps) {
  useEffect(() => {
    document.title = 'Check your email · Useful Apply';
  }, []);

  return (
    <>
      <div className={`${AUTH_CARD} text-center`}>
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold-100">
          <Mail className="h-6 w-6 text-gold-600" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold text-navy-800">Check your email</h1>
        <p className="mt-3 text-sm text-charcoal">
          We sent a link to <strong className="font-semibold text-navy-800">{email}</strong>. Open it on this
          device and you&apos;re back in.
        </p>
        <p className="mt-4 text-sm text-warm-gray">
          {hasResent ? (
            'Sent again. It can take a minute to land.'
          ) : (
            <>
              Nothing after a minute? Check spam, or{' '}
              <button
                type="button"
                onClick={onResend}
                disabled={isResending}
                className="font-semibold text-navy-600 transition-colors duration-200 hover:text-navy-800 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
              >
                {isResending ? 'sending it again' : 'send it again'}
              </button>
              .
            </>
          )}
        </p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <p className="mt-5 text-center text-sm text-warm-gray">
        Wrong address?{' '}
        <button
          type="button"
          onClick={onStartOver}
          className="font-semibold text-navy-800 transition-colors duration-200 hover:text-navy-600 cursor-pointer"
        >
          Start over
        </button>
      </p>
    </>
  );
}
