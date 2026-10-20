import { createAuthClient } from 'better-auth/react';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
  // Adds the signed OAuth query to sign-in and consent calls made from a page
  // that was opened by /oauth2/authorize (an MCP client sent the user here),
  // so signing in continues that request. It does nothing on any other page.
  plugins: [oauthProviderClient()],
});

export const { signIn, signUp, signOut, useSession } = authClient;
