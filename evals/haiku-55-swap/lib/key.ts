import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

/**
 * --key-from-dev-vars: read ANTHROPIC_API_KEY (and nothing else) from the main checkout's .dev.vars into
 * this process. The value is never printed. Only that key, so the eval never picks up the Bedrock failover
 * credentials and every arm runs on the direct API. Approved for eval runs by Wasim (2026-10-23).
 */
export function loadAnthropicKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: __dirname, encoding: 'utf8' });
  if (common.status !== 0) throw new Error('git rev-parse failed: run from inside the Useful Apply checkout');
  const mainCheckout = path.dirname(common.stdout.trim());
  const file = path.join(mainCheckout, '.dev.vars');
  const parsed = parseEnv(readFileSync(file, 'utf8'));
  if (!parsed.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not in the main checkout .dev.vars');
  process.env.ANTHROPIC_API_KEY = parsed.ANTHROPIC_API_KEY;
}
