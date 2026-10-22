/**
 * The judge: Claude Opus 5.5 at high effort, run clean. No user rules, no skills, no tools, no
 * project context: a bare Messages API call with the rubric as the system prompt and the item as the
 * only user turn. The prompt never names the arm or the model under test.
 *
 * Needs ANTHROPIC_API_KEY in the environment. The harness never loads env files.
 */
import { costUsd as priceUsd } from '../../lib/pricing';
import { JUDGE_MODEL } from '../../lib/judge-common';
import { sleep } from './core';

export interface JudgeSpec {
  name: string;
  rubric: string;
  /** JSON Schema of the verdict (output_config.format). */
  schema: Record<string, unknown>;
}

export interface JudgeResult<V> {
  verdict: V;
  costUsd: number;
  latencyMs: number;
}

export function buildJudgeParams(spec: JudgeSpec, userPrompt: string): Record<string, unknown> {
  return {
    model: JUDGE_MODEL,
    max_tokens: 16000,
    system: spec.rubric,
    messages: [{ role: 'user', content: userPrompt }],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: spec.schema } },
  };
}

interface MessagesReply {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

export async function judgeOnce<V>(spec: JudgeSpec, userPrompt: string, options: { dry: boolean; canned: V }): Promise<JudgeResult<V>> {
  const params = buildJudgeParams(spec, userPrompt);
  if (options.dry) return { verdict: options.canned, costUsd: 0, latencyMs: 0 };
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set (the harness does not read env files)');

  for (let attempt = 1; ; attempt += 1) {
    const started = performance.now();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(params),
    });
    const text = await res.text();
    if (!res.ok) {
      if ([408, 409, 429, 500, 502, 503, 504, 529].includes(res.status) && attempt <= 3) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      throw new Error(`judge ${spec.name} failed: HTTP ${res.status} ${text.slice(0, 300)}`);
    }
    const json = JSON.parse(text) as MessagesReply;
    const out = (json.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    if (!out) throw new Error(`judge ${spec.name} returned no text`);
    const u = json.usage ?? {};
    return {
      verdict: JSON.parse(out) as V,
      costUsd: priceUsd(JUDGE_MODEL, { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0 }),
      latencyMs: Math.round(performance.now() - started),
    };
  }
}

/** Runs fn over items with a fixed concurrency, keeping order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
