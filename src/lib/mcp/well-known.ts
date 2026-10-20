import { getAuth } from '@/auth/server';
import { isMcpEnabled } from '@/lib/mcp/config';

/**
 * Better Auth's OAuth provider answers its discovery documents from the auth
 * handler's request hook, but the handler only sees /api/auth/* on its own.
 * The well-known routes live at the site root (RFC 8414 / RFC 9728 put them
 * there, with the issuer or resource path appended), so these Next routes hand
 * the request to the handler unchanged.
 */
export async function serveWellKnown(request: Request): Promise<Response> {
  // The authorization server is off with /mcp: nothing to discover.
  if (!isMcpEnabled()) return new Response('Not Found', { status: 404 });
  const auth = await getAuth();
  return auth.handler(request);
}
