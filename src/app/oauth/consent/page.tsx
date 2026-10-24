import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { verifyOAuthQueryParams } from '@better-auth/oauth-provider';
import { getAuth } from '@/auth/server';
import { AuthShell } from '@/components/auth/AuthShell';
import { AUTH_CARD } from '@/components/auth/parts';
import { ConsentForm } from '@/components/oauth/ConsentForm';
import { MCP_SCOPES, type McpScope } from '@/lib/mcp/scopes';

export const metadata: Metadata = {
  title: 'Connect an app',
  robots: { index: false, follow: false },
};

// Always rendered per request: it reads the session and a signed query.
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function Problem({ message }: { message: string }) {
  return (
    <AuthShell linkLabel="Dashboard" linkHref="/dashboard">
      <div className={AUTH_CARD}>
        <h1 className="text-2xl font-semibold text-ink">This request can&apos;t continue</h1>
        <p className="mt-3 text-sm text-ink-muted">{message}</p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block text-sm font-semibold text-ink hover:text-brand cursor-pointer"
        >
          Go to the dashboard
        </Link>
      </div>
    </AuthShell>
  );
}

/**
 * Where approval sends the user back to, from the signed redirect_uri. The
 * client's name is whatever it called itself, so the destination is the part
 * that cannot be faked: a loopback address means an app on this computer.
 */
function describeDestination(redirectUri: string | null): string {
  try {
    const { hostname, protocol } = new URL(redirectUri ?? '');
    if (protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
      return 'a desktop app on this computer';
    }
    return hostname;
  } catch {
    return 'the app';
  }
}

export default async function ConsentPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.append(key, value);
  }

  const auth = await getAuth();
  const { secret } = await auth.$context;
  // Signature and expiry only. The server checks the client, the session and the scopes again on approval.
  if (!(await verifyOAuthQueryParams(query.toString(), secret))) {
    return <Problem message="This link expired. Go back to the app and connect again." />;
  }

  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const clientId = query.get('client_id');
  if (!session?.user || !clientId) {
    return <Problem message="Your session ended. Go back to the app and connect again." />;
  }

  let clientName = 'This app';
  try {
    const client = (await auth.api.getOAuthClientPublic({
      query: { client_id: clientId },
      headers: requestHeaders,
    })) as { client_name?: string | null } | null;
    if (client?.client_name?.trim()) clientName = client.client_name.trim().slice(0, 80);
  } catch {
    return <Problem message="We don't recognize that app. Go back to it and connect again." />;
  }

  const requested = new Set((query.get('scope') ?? '').split(/\s+/).filter(Boolean));
  const scopes = MCP_SCOPES.filter((scope): scope is McpScope => requested.has(scope));
  if (scopes.length === 0) {
    return <Problem message="That app didn't ask for any access we can grant." />;
  }

  return (
    <AuthShell linkLabel="Dashboard" linkHref="/dashboard">
      <ConsentForm
        clientName={clientName}
        scopes={scopes}
        email={session.user.email}
        destination={describeDestination(query.get('redirect_uri'))}
      />
    </AuthShell>
  );
}
