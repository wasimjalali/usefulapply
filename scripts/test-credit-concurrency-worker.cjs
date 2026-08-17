/* eslint-disable @typescript-eslint/no-require-imports */
'use strict';
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');

const [dbPath, userId, amountRaw] = process.argv.slice(2);
const amount = Number(amountRaw);
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

let ok = false;
for (let attempt = 0; attempt < 8; attempt++) {
  const row = db.prepare(
    'SELECT monthly_credits, rollover_credits, addon_credits, version FROM user_credits WHERE user_id = ?',
  ).get(userId);
  if (!row) break;
  const total = row.monthly_credits + row.rollover_credits + row.addon_credits;
  if (total < amount) break;
  let remaining = amount;
  let monthly = row.monthly_credits;
  let rollover = row.rollover_credits;
  let addon = row.addon_credits;
  const take = (bucket) => {
    const d = Math.min(remaining, bucket);
    remaining -= d;
    return bucket - d;
  };
  monthly = take(monthly);
  rollover = take(rollover);
  addon = take(addon);
  const info = db.prepare(`
    UPDATE user_credits
    SET monthly_credits = ?, rollover_credits = ?, addon_credits = ?,
        version = version + 1, updated_at = ?
    WHERE user_id = ? AND version = ?
      AND (monthly_credits + rollover_credits + addon_credits) >= ?
  `).run(monthly, rollover, addon, new Date().toISOString(), userId, row.version, amount);
  if (info.changes === 1) {
    db.prepare(`
      INSERT INTO credit_transactions (
        id, user_id, amount, transaction_type, session_id, description, metadata,
        balance_before, balance_after, created_at
      ) VALUES (?, ?, ?, 'full_application', NULL, 'concurrency test', '{}', ?, ?, ?)
    `).run(randomUUID(), userId, -amount, total, monthly + rollover + addon, new Date().toISOString());
    ok = true;
    break;
  }
}
db.close();
process.stdout.write(ok ? '1' : '0');
