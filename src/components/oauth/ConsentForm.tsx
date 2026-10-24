'use client';

import { useState } from 'react';
import { Coins, Eye, Loader2, Pencil } from 'lucide-react';
import { authClient } from '@/auth/client';
import { AUTH_CARD, AUTH_SUBMIT } from '@/components/auth/parts';
import { SCOPE_LABELS, type McpScope } from '@/lib/mcp/scopes';

const SCOPE_ICONS: Record<McpScope, typeof Eye> = {
  read: Eye,
  write: Pencil,
  spend: Coins,
};

interface ConsentFormProps {
  clientName: string;
  scopes: McpScope[];
  email: string;
  /** Host the user returns to, or a plain phrase for a loopback app. */
  destination: string;
}

/**
 * Approve or deny an MCP client. The signed query in the page URL is what ties
 * this click to the pending authorize request: the auth client attaches it to
 * the consent call, and the server redirects back to the client with a code
 * (approve) or an access_denied error (deny).
 */
export function ConsentForm({ clientName, scopes, email, destination }: ConsentFormProps) {
  const [pending, setPending] = useState<'approve' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = async (accept: boolean) => {
    setPending(accept ? 'approve' : 'deny');
    setError(null);
    try {
      const { data, error: consentError } = await authClient.oauth2.consent({ accept });
      if (consentError) {
        setError("We couldn't finish that. Go back to the app and try connecting again.");
        setPending(null);
        return;
      }
      const url = (data as { url?: string } | null)?.url;
      if (url) {
        window.location.assign(url);
        return;
      }
      setPending(null);
    } catch {
      setError("We couldn't finish that. Go back to the app and try connecting again.");
      setPending(null);
    }
  };

  return (
    <div className={AUTH_CARD}>
      <h1 className="text-2xl font-semibold text-ink">Allow {clientName} to use Useful Apply?</h1>
      <p className="mt-2 text-sm text-ink-muted">Signed in as {email}</p>
      <p className="mt-1 text-sm text-ink-muted">
        The app chose its own name. Approving sends you to {destination}.
      </p>

      <ul className="mt-6 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
        {scopes.map((scope) => {
          const Icon = SCOPE_ICONS[scope];
          return (
            <li key={scope} className="flex items-start gap-3 px-4 py-3.5">
              <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-accent-strong" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-ink-body">{SCOPE_LABELS[scope].title}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{SCOPE_LABELS[scope].detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => void answer(true)}
          disabled={pending !== null}
          className={AUTH_SUBMIT}
        >
          {pending === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Approve'}
        </button>
        <button
          type="button"
          onClick={() => void answer(false)}
          disabled={pending !== null}
          className="flex h-12 w-full items-center justify-center rounded-pill border border-border bg-surface text-[15px] font-semibold text-ink shadow-resting transition-colors duration-(--duration-base) hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {pending === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deny'}
        </button>
      </div>
    </div>
  );
}
