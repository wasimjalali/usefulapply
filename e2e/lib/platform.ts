import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AnyD1Database } from 'drizzle-orm/d1';
import { D1_DATABASE_ID, FAKE_ANTHROPIC_URL, REPO_ROOT } from './env';

/**
 * The product's own server code (services, repos, the queue runner) running in
 * this test process against a real local D1, the same way scripts/verify-kit-isolation.ts
 * does: wrangler's getPlatformProxy supplies the D1 binding and the Cloudflare
 * context global that `getCloudflareContext()` reads. No database is mocked.
 */

export interface FakeQueue {
  /** Kit messages are `{ operationId }`, job feed run messages `{ kind: 'job_feed_run', userId, runId }`. */
  messages: Array<Record<string, unknown>>;
  send(message: Record<string, unknown>): Promise<void>;
  /** Make the next `send` fail, to test the enqueue failure path. */
  failNext: boolean;
}

export function createFakeQueue(): FakeQueue {
  const queue: FakeQueue = {
    messages: [],
    failNext: false,
    async send(message) {
      if (queue.failNext) {
        queue.failNext = false;
        throw new Error('queue unavailable');
      }
      queue.messages.push(message);
    },
  };
  return queue;
}

export interface Platform {
  db: AnyD1Database;
  queue: FakeQueue;
  dispose(): Promise<void>;
}

function writeConfig(dir: string): string {
  const configPath = join(dir, 'wrangler.json');
  writeFileSync(configPath, JSON.stringify({
    name: 'data-integrity-e2e',
    compatibility_date: '2026-08-17',
    compatibility_flags: ['nodejs_compat'],
    d1_databases: [{
      binding: 'DB',
      database_name: 'usefulapply-db',
      database_id: D1_DATABASE_ID,
      migrations_dir: join(REPO_ROOT, 'migrations', 'd1'),
    }],
    // A local bucket, for the services that read photos or write exports.
    r2_buckets: [{ binding: 'FILES', bucket_name: 'usefulapply-files' }],
  }, null, 2));
  return configPath;
}

/** Model settings for in-process runs: the real SDK, pointed at the scripted fake. Must be set before the agents are imported. */
export function pointModelAtFake(): void {
  process.env.ANTHROPIC_API_KEY = 'e2e-stub-key';
  process.env.ANTHROPIC_BASE_URL = FAKE_ANTHROPIC_URL;
}

/**
 * Open a platform over `persistV3`, a wrangler state dir (its `v3` folder).
 * Pass the preview's own `.wrangler/state/v3` to share its D1, or a fresh dir
 * from `freshStateDir()` for an isolated one.
 */
export async function openPlatform(persistV3: string): Promise<Platform> {
  const work = mkdtempSync(join(tmpdir(), 'di-e2e-'));
  const configPath = writeConfig(work);
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<{ DB: AnyD1Database }>({ configPath, persist: { path: persistV3 } });
  const queue = createFakeQueue();
  (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] = {
    env: { ...proxy.env, AGENT_GENERATION_QUEUE: queue },
    cf: proxy.cf,
    ctx: proxy.ctx,
  };
  return { db: proxy.env.DB, queue, dispose: () => proxy.dispose() };
}

/** A new, empty, migrated local D1 in a temp dir. Local only. */
export function freshStateDir(): string {
  const work = mkdtempSync(join(tmpdir(), 'di-e2e-state-'));
  const persistTo = join(work, 'state');
  mkdirSync(persistTo, { recursive: true });
  const configPath = writeConfig(work);
  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'usefulapply-db', '--local', '--config', configPath, '--persist-to', persistTo], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CI: '1' },
  });
  return join(persistTo, 'v3');
}
