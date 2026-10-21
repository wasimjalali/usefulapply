import { execFileSync } from 'node:child_process';
import { REPO_ROOT } from './env';
import { openLocalD1 } from './sqlite';
import { creditsOf } from './user';

/**
 * Reads and seeds for the MCP specs, straight against the local D1 file and the local KV the preview
 * shares. Local only: nothing here ever points at --remote. The tools under test never get a shortcut;
 * this is for the "nothing changed" assertions and for putting an account into a state (a plan, a low
 * daily limit, a quota counter near its ceiling) that the product reaches over days.
 */

function withDb<T>(fn: (db: ReturnType<typeof openLocalD1>) => T): T {
  const db = openLocalD1();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

export interface LedgerRow {
  amount: number;
  transaction_type: string;
  transaction_kind: string | null;
  description: string | null;
  balance_after: number;
}

/** Every credit transaction of a user, oldest first. */
export function ledger(userId: string): LedgerRow[] {
  return withDb((db) =>
    db.prepare('SELECT amount, transaction_type, transaction_kind, description, balance_after FROM credit_transactions WHERE user_id = ? ORDER BY rowid').all(userId) as LedgerRow[],
  );
}

/** What the user was charged in total since the account's starting grant: spends are negative rows, refunds and releases positive. */
export function netCharged(userId: string): number {
  const rows = ledger(userId).filter((row) => row.transaction_kind !== 'grant');
  // + 0 turns -0 into 0, so a nothing-charged account compares equal to 0.
  return Math.round(-rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100 + 0;
}

export interface ReservationRow {
  amount: number;
  status: string;
  action: string;
  idempotency_key: string;
}

export function reservations(userId: string): ReservationRow[] {
  return withDb((db) =>
    db.prepare('SELECT amount, status, action, idempotency_key FROM credit_reservations WHERE user_id = ? ORDER BY rowid').all(userId) as ReservationRow[],
  );
}

export interface OperationRow {
  id: string;
  kind: string;
  status: string;
  attempt: number;
  error_code: string | null;
  session_id: string | null;
  idempotency_key: string;
}

export function operations(userId: string): OperationRow[] {
  return withDb((db) =>
    db.prepare('SELECT id, kind, status, attempt, error_code, session_id, idempotency_key FROM agent_operations WHERE user_id = ? ORDER BY rowid').all(userId) as OperationRow[],
  );
}

export function setOperationStatus(operationId: string, fields: Record<string, string | number | null>): void {
  withDb((db) => {
    const names = Object.keys(fields);
    db.prepare(`UPDATE agent_operations SET ${names.map((name) => `${name} = ?`).join(', ')} WHERE id = ?`).run(...names.map((name) => fields[name]), operationId);
  });
}

/** Every column of every application of a user, parsed, so a test can say "nothing changed" with one equality. */
export function applicationRows(userId: string): Array<Record<string, unknown>> {
  return withDb((db) => {
    const rows = db.prepare('SELECT * FROM application_sessions WHERE user_id = ? ORDER BY created_at, id').all(userId) as Array<Record<string, unknown>>;
    return rows.map((row) => {
      const out: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        if (key === 'updated_at') continue; // bumps on any write, including a read-through
        out[key] = typeof value === 'string' && /^[[{]/.test(value) ? safeParse(value) : value;
      }
      return out;
    });
  });
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function applicationCount(userId: string): number {
  return withDb((db) => (db.prepare('SELECT COUNT(*) AS n FROM application_sessions WHERE user_id = ?').get(userId) as { n: number }).n);
}

export function documentRows(userId: string): Array<{ type: string; file_name: string; raw_text: string | null }> {
  return withDb((db) =>
    db.prepare('SELECT type, file_name, raw_text FROM documents WHERE user_id = ? ORDER BY type').all(userId) as Array<{ type: string; file_name: string; raw_text: string | null }>,
  );
}

export function profileRow(userId: string): Record<string, unknown> {
  return withDb((db) => db.prepare('SELECT * FROM profiles WHERE id = ?').get(userId) as Record<string, unknown>);
}

/** Put the account on a paid plan, the way the screening gate reads it. */
export function setPlan(userId: string, tier: 'free' | 'plus' | 'max'): void {
  withDb((db) => {
    db.prepare('UPDATE profiles SET subscription_tier = ? WHERE id = ?').run(tier, userId);
    db.prepare('UPDATE user_credits SET plan_tier = ?, version = version + 1 WHERE user_id = ?').run(tier, userId);
  });
}

/** The daily agent credit limit the account owner sets under Connected apps. */
export function setDailyLimit(userId: string, limit: number): void {
  withDb((db) => db.prepare('UPDATE profiles SET mcp_daily_credit_limit = ? WHERE id = ?').run(limit, userId));
}

export function setBalance(userId: string, balance: { monthly: number; rollover?: number; addon?: number }): void {
  withDb((db) =>
    db.prepare('UPDATE user_credits SET monthly_credits = ?, rollover_credits = ?, addon_credits = ?, version = version + 1 WHERE user_id = ?')
      .run(balance.monthly, balance.rollover ?? 0, balance.addon ?? 0, userId),
  );
}

// ---------------------------------------------------------------------------
// The daily quota counters (KV CONTEXT_CACHE, see src/lib/mcp/quotas.ts)
// ---------------------------------------------------------------------------

export function quotaKey(tool: 'save_cv' | 'draft_screening_answers' | 'export_documents', userId: string): string {
  return `mcp-quota:${tool}:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

function wrangler(args: string[]): string {
  return execFileSync('npx', ['wrangler', 'kv', 'key', ...args, '--binding', 'CONTEXT_CACHE', '--local'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** Seed a quota counter in the preview's local KV. The tool reads it on its next call. */
export function seedQuota(tool: 'save_cv' | 'draft_screening_answers' | 'export_documents', userId: string, used: number): void {
  wrangler(['put', quotaKey(tool, userId), String(used), '--ttl', '3600']);
}

export function readQuota(tool: 'save_cv' | 'draft_screening_answers' | 'export_documents', userId: string): number {
  try {
    // A missing key is not an error to wrangler: it prints "Value not found".
    const value = wrangler(['get', quotaKey(tool, userId)]).trim();
    return /^\d+$/.test(value) ? Number(value) : 0;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// "Nothing changed"
// ---------------------------------------------------------------------------

/** Everything a tool could write for a user, in one value: two snapshots that are equal mean nothing changed. */
export function accountSnapshot(userId: string): Record<string, unknown> {
  const profile = { ...profileRow(userId) };
  delete profile.updated_at;
  return {
    applications: applicationRows(userId),
    documents: documentRows(userId),
    credits: creditsOf(userId),
    ledger: ledger(userId),
    reservations: reservations(userId),
    operations: operations(userId),
    profile,
  };
}
