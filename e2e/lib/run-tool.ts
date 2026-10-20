import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { REPO_ROOT } from './env';

const run = promisify(execFile);

/** Run an e2e tool script with tsx and return the JSON after its `__RESULT__` marker. */
export async function runTool<T>(script: string, args: string[], env: Record<string, string> = {}): Promise<T> {
  const { stdout } = await run('npx', ['tsx', script, ...args], {
    cwd: REPO_ROOT,
    env: { ...process.env, ...env, CI: '1' },
    maxBuffer: 32 * 1024 * 1024,
    timeout: 170_000,
  });
  const line = stdout.split('\n').reverse().find((candidate) => candidate.startsWith('__RESULT__'));
  if (!line) throw new Error(`No result from ${script}:\n${stdout.slice(-2000)}`);
  return JSON.parse(line.slice('__RESULT__'.length)) as T;
}
