import { getAuth } from '@/auth/server';

/**
 * Better Auth's OAuth provider answers its discovery documents from the auth
 * handler's request hook, but the handler only sees /api/auth/* on its own.
 * The well-known routes live at the site root (RFC 8414 / RFC 9728 put them
 * there, with the issuer or resource path appended), so these Next routes hand
 * the request to the handler unchanged.
 */
export async function serveWellKnown(request: Request): Promise<Response> {
  const auth = await getAuth();
  return auth.handler(request);
}
