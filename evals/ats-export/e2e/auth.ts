import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, request as pwRequest } from '@playwright/test';
import { TEST_PASSWORD, userIdFor, verifyEmail } from './seed';

export const ORIGIN = 'http://localhost:8793';
export const STORAGE = join(tmpdir(), 'ua-e2e-storage.json');

/**
 * A signed-in request context for a throwaway account on the local dev server.
 * Sign-up and sign-in are rate limited (3 and 5 a minute), so each account is
 * created and signed in once per run.
 */
export async function signedInContext(email: string, name: string, storagePath?: string) {
  // An empty storage state: the config's signed-in session must not leak into this account.
  const api = await pwRequest.newContext({ baseURL: ORIGIN, storageState: { cookies: [], origins: [] } });
  let exists = true;
  try {
    userIdFor(email);
  } catch {
    exists = false;
  }
  if (!exists) {
    const signUp = await api.post('/api/auth/sign-up/email', { data: { email, password: TEST_PASSWORD, name }, headers: { origin: ORIGIN } });
    expect(signUp.status(), `sign-up as ${email}`).toBe(200);
  }
  verifyEmail(email);
  const signIn = await api.post('/api/auth/sign-in/email', { data: { email, password: TEST_PASSWORD }, headers: { origin: ORIGIN } });
  expect(signIn.ok(), `sign-in as ${email}`).toBeTruthy();
  if (storagePath) await api.storageState({ path: storagePath });
  return api;
}
