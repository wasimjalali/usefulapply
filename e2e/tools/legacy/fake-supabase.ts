/**
 * Stands in for `@/lib/supabase` when sync-fuzz.ts runs the round-1 module
 * (e2e/tools/legacy/session-sync.round1.ts) against its fake server. The
 * harness installs the three actions on globalThis before the module is used.
 */

import type { StoredSessionRow } from '@/lib/session-row-mapping';

interface LegacyActions {
  getSession(sessionId: string, userId?: string): Promise<StoredSessionRow | null>;
  saveApplicationEdits(
    sessionId: string,
    expectedRevision: number,
    patch: Record<string, unknown>,
    userId?: string,
  ): Promise<
    | { ok: true; revision: number }
    | { ok: false; reason: 'conflict'; currentRevision: number | null }
    | { ok: false; reason: 'not_found' }
    | { ok: false; reason: 'invalid'; message: string; field?: string }
  >;
  getApplicationRevision(sessionId: string, userId?: string): Promise<{ revision: number } | null>;
}

const actions = () => (globalThis as unknown as { __legacyActions: LegacyActions }).__legacyActions;

export const getSession = (sessionId: string, userId?: string) => actions().getSession(sessionId, userId);
export const saveApplicationEdits = (
  sessionId: string,
  expectedRevision: number,
  patch: Record<string, unknown>,
  userId?: string,
) => actions().saveApplicationEdits(sessionId, expectedRevision, patch, userId);
export const getApplicationRevision = (sessionId: string, userId?: string) =>
  actions().getApplicationRevision(sessionId, userId);
