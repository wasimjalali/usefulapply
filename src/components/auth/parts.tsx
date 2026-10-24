'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** The one card per auth page: white document surface on the cream canvas. */
export const AUTH_CARD = 'rounded-card border border-border bg-surface-raised p-8 shadow-resting';

/** The one gold action per auth surface. */
export const AUTH_SUBMIT =
  'flex h-12 w-full items-center justify-center rounded-pill bg-accent text-[15px] font-semibold text-accent-ink transition-colors duration-(--duration-base) hover:bg-accent-strong disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed';

interface AuthFieldProps {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  autoComplete: string;
  /** One sentence under the field. Auth errors never become toasts. */
  error?: string | null;
}

export function AuthField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  error,
}: AuthFieldProps) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label
        htmlFor={id}
        className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-body"
      >
        {label}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={isPassword && reveal ? 'text' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          // ph-no-capture keeps the value out of session replay. rrweb's default
          // masking is keyed on the live input type, so revealing the password
          // (type becomes "text") would otherwise record it in clear.
          className={`h-11 w-full rounded-control border bg-surface-raised px-3.5 text-sm text-ink-body placeholder:text-ink-muted focus:outline-none ${
            isPassword ? 'ph-no-capture pr-11' : ''
          } ${error ? 'border-border-danger-strong focus:border-danger-muted' : 'border-border focus:border-border-accent'}`}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted transition-colors duration-(--duration-base) hover:text-ink-body cursor-pointer"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
