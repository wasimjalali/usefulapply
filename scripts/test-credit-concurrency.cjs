/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
/**
 * 20-way concurrent deduct against a local D1 sqlite file.
 * Uses the same OCC SQL as src/db/repos/credits.ts.
 *
 * Run: node scripts/test-credit-concurrency.cjs
 */
const { spawn } = require('node:child_process');
const { existsSync, readdirSync } = require('node:fs');
const { join } = require('node:path');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');

const STARTING_BALANCE = 20;
const WORKERS = 20;
const DEDUCT = 1;

function findLocalD1() {
  if (process.argv[2]) return process.argv[2];
  const dir = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  if (files.length === 0) {
    throw new Error('No local D1 sqlite file found. Apply migrations first.');
  }
  return join(dir, files[0]);
}

function runWorker(dbPath, userId, amount) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(process.cwd(), 'scripts/test-credit-concurrency-worker.cjs'), dbPath, userId, String(amount)],
      { stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let out = '';
    child.stdout.on('data', (chunk) => { out += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) resolve(false);
      else resolve(out.trim() === '1');
    });
  });
}

async function main() {
  const dbPath = findLocalD1();
  if (!existsSync(dbPath)) {
    throw new Error(`D1 file missing: ${dbPath}`);
  }
  const userId = '00000000-0000-4000-8000-0000000000cc';
  const setup = new Database(dbPath);
  setup.pragma('journal_mode = WAL');
  setup.prepare('DELETE FROM credit_transactions WHERE user_id = ?').run(userId);
  setup.prepare('DELETE FROM user_credits WHERE user_id = ?').run(userId);
  setup.prepare('DELETE FROM profiles WHERE id = ?').run(userId);
  const now = new Date().toISOString();
  setup.prepare(`
    INSERT INTO profiles (id, email, job_searches_reset_at, created_at, updated_at)
    VALUES (?, 'concurrency@test.local', ?, ?, ?)
  `).run(userId, now, now, now);
  setup.prepare(`
    INSERT INTO user_credits (
      id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at
    ) VALUES (?, ?, ?, 0, 0, 'free', 0, ?, ?)
  `).run(randomUUID(), userId, STARTING_BALANCE, now, now);
  setup.close();

  const results = await Promise.all(
    Array.from({ length: WORKERS }, () => runWorker(dbPath, userId, DEDUCT)),
  );

  const verify = new Database(dbPath, { readonly: true });
  const final = verify.prepare(
    'SELECT monthly_credits, rollover_credits, addon_credits, version FROM user_credits WHERE user_id = ?',
  ).get(userId);
  const txCount = verify.prepare(
    'SELECT COUNT(*) as n FROM credit_transactions WHERE user_id = ?',
  ).get(userId).n;
  verify.close();

  const total = final.monthly_credits + final.rollover_credits + final.addon_credits;
  const successes = results.filter(Boolean).length;
  const pass = total === 0 && successes === WORKERS && txCount === WORKERS && final.version === WORKERS;

  console.log(JSON.stringify({
    dbPath,
    successes,
    failures: WORKERS - successes,
    startingBalance: STARTING_BALANCE,
    finalBalance: total,
    version: final.version,
    ledgerRows: txCount,
    pass,
  }, null, 2));

  if (!pass) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
