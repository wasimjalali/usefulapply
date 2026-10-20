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
}

/**
 * Approve or deny an MCP client. The signed query in the page URL is what ties
 * this click to the pending authorize request: the auth client attaches it to
 * the consent call, and the server redirects back to the client with a code
 * (approve) or an access_denied error (deny).
 */
export function ConsentForm({ clientName, scopes, email }: ConsentFormProps) {
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
      <h1 className="text-2xl font-semibold text-navy-800">Allow {clientName} to use Useful Apply?</h1>
      <p className="mt-2 text-sm text-warm-gray">Signed in as {email}</p>

      <ul className="mt-6 divide-y divide-cream-200 overflow-hidden rounded-2xl border border-cream-200 bg-cream-50">
        {scopes.map((scope) => {
          const Icon = SCOPE_ICONS[scope];
          return (
            <li key={scope} className="flex items-start gap-3 px-4 py-3.5">
              <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-500" aria-hidden="true" />
              <div>
                <p className="text-sm font-semibold text-charcoal">{SCOPE_LABELS[scope].title}</p>
                <p className="mt-0.5 text-xs text-warm-gray">{SCOPE_LABELS[scope].detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

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
          className="flex h-12 w-full items-center justify-center rounded-full border border-cream-200 bg-cream-50 text-[15px] font-semibold text-navy-800 shadow-sm transition-colors duration-200 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
        >
          {pending === 'deny' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Deny'}
        </button>
      </div>
    </div>
  );
}
