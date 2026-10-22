/** Network-free checks of the harness's own wire logic. `run.ts check` runs these with every site's self-test. */
import { ARMS, armById, costUsd, decide, summarizeArm, type CaseOutcome, type CallRecord } from './core';
import { applyArm, usageFromWire, wirePrefixHashes } from './intercept';

export function harnessSelfTest(): string[] {
  const problems: string[] = [];
  const must = (ok: boolean, what: string) => { if (!ok) problems.push(what); };

  const body = {
    model: 'claude-haiku-5-5',
    max_tokens: 1000,
    system: [{ type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: 'STABLE', cache_control: { type: 'ephemeral' } }],
    tools: [{ name: 't', description: 'd', input_schema: { type: 'object' } }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }] }],
    thinking: { type: 'disabled' },
    output_config: { format: { type: 'json_schema', schema: {} } },
  };
  const nothink = applyArm(body, armById('haiku-low-nothink'), 'S1');
  must(nothink.output_config?.effort === 'low' && nothink.thinking?.type === 'disabled', 'low-nothink must send effort low and thinking disabled');
  must(nothink.output_config?.format !== undefined, 'applyArm must keep output_config.format');
  const high = applyArm(body, armById('haiku-high'), 'S1');
  must(high.output_config?.effort === 'high' && high.thinking === undefined, 'a thinking arm must send effort high and drop thinking:disabled');
  must(Array.isArray(high.system) && String((high.system[0] as { text: string }).text).startsWith('[eval cache salt S1]'), 'salt must lead the first system block');
  const a = wirePrefixHashes(applyArm(body, armById('haiku-low'), 'S1'));
  const b = wirePrefixHashes(applyArm(body, armById('haiku-medium'), 'S1'));
  const c = wirePrefixHashes(applyArm(body, armById('haiku-low'), 'S2'));
  must(a.first === b.first && a.stable === b.stable, 'effort must not change the prefix hash within a salt');
  must(a.first !== c.first, 'a different salt must change the prefix hash');
  must(a.markers === 3, `expected 3 cache markers, found ${a.markers}`);

  const compaction = usageFromWire({ input_tokens: 0, output_tokens: 0, iterations: [{ input_tokens: 2782, output_tokens: 1069 }] });
  must(compaction.input === 2782 && compaction.output === 1069, 'usage must fall back to iterations when the top level reads zero');
  const split = usageFromWire({ input_tokens: 5, output_tokens: 9, cache_creation_input_tokens: 300, cache_read_input_tokens: 700, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } });
  must(split.cacheWrite5m === 100 && split.cacheWrite1h === 200 && split.cacheRead === 700, 'usage must split the cache write by TTL');

  const haiku = armById('haiku-low');
  const near = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  must(near(costUsd(haiku, { input: 90_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }), 0.009), '90k uncached input tokens must cost $0.009 at the base tier');
  must(near(costUsd(haiku, { input: 0, output: 0, cacheRead: 90_000, cacheWrite5m: 0, cacheWrite1h: 0 }), 0.0009), '90k cache read tokens must cost $0.0009');
  must(near(costUsd(haiku, { input: 0, output: 1_000_000, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }), 0.5), '1M output tokens must cost $0.50');
  must(near(costUsd(haiku, { input: 200_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 }), 0.1), 'a call over 100k input tokens must be priced at the higher tier ($0.50 per million)');

  // Decision rule on a constructed case: low is within one failure of high and has no hard violations.
  const mk = (arm: CaseOutcome['arm'], passes: number, total: number, hard: string[] = []): CaseOutcome[] =>
    Array.from({ length: total }, (_, i) => ({ caseId: `c${i}`, group: 'g', run: 1, arm, pass: i < passes, failures: [], hard: i < passes ? [] : hard, metrics: {}, output: null, latencyMs: 10, calls: [] as CallRecord[], error: null }));
  const outcomes = [...mk('haiku-low-nothink', 8, 10, ['x']), ...mk('haiku-low', 9, 10), ...mk('haiku-medium', 10, 10), ...mk('haiku-high', 10, 10), ...mk('gptoss', 9, 10)];
  const verdict = decide(ARMS.map((arm) => summarizeArm(arm.id, outcomes)), []);
  must(verdict.winner === 'haiku-low', `decision rule picked ${verdict.winner}, expected haiku-low (low-nothink has a hard violation, low is within one failure)`);
  return problems;
}

/**
 * The live Haiku path without the real API: a local server answers /v1/messages like Anthropic does, the
 * SDK talks to it through the wire recorder, and we check what the server received (arm applied, salt
 * set) and what the harness recorded (usage split, latency, tool calls).
 */
export async function wireRoundTrip(): Promise<string[]> {
  const problems: string[] = [];
  const { createServer } = await import('node:http');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const { scopeStore } = await import('./intercept');
  const received: Array<Record<string, unknown>> = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.setHeader('request-id', 'req_selftest');
      if (req.url?.endsWith('/count_tokens')) {
        res.end(JSON.stringify({ input_tokens: 123 }));
        return;
      }
      received.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>);
      res.end(JSON.stringify({
        id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'tool_use',
        content: [{ type: 'text', text: 'hello' }, { type: 'tool_use', id: 'tu_1', name: 'get_credits', input: {} }],
        usage: { input_tokens: 40, output_tokens: 12, cache_read_input_tokens: 2000, cache_creation_input_tokens: 300, cache_creation: { ephemeral_5m_input_tokens: 100, ephemeral_1h_input_tokens: 200 } },
      }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no server address');
    const client = new Anthropic({ apiKey: 'selftest', baseURL: `http://127.0.0.1:${address.port}`, maxRetries: 0 });
    const calls: CallRecord[] = [];
    const scope = { site: 'language' as const, arm: armById('haiku-low-nothink'), run: 1, caseId: 'x', group: 'g', dry: false, salt: 'SALT1', calls, seq: { n: 0 }, countTokens: 0 };
    await scopeStore.run(scope, async () => {
      await client.messages.countTokens({ model: 'claude-haiku-5-5', messages: [{ role: 'user', content: 'hi' }] });
      await client.messages.create({ model: 'claude-haiku-5-5', max_tokens: 100, system: [{ type: 'text', text: 'STATIC', cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: 'hi' }], thinking: { type: 'adaptive' }, output_config: { effort: 'high' } } as never);
    });
    const body = received[0] as { output_config?: { effort?: string }; thinking?: { type?: string }; system?: Array<{ text: string }> } | undefined;
    if (!body) return ['the local server received no /v1/messages request'];
    if (body.output_config?.effort !== 'low') problems.push(`server saw effort ${body.output_config?.effort}, expected low (arm low-nothink)`);
    if (body.thinking?.type !== 'disabled') problems.push(`server saw thinking ${body.thinking?.type}, expected disabled`);
    if (!body.system?.[0]?.text.startsWith('[eval cache salt SALT1]')) problems.push('the salt did not reach the server');
    const rec = calls[0];
    if (!rec) return [...problems, 'the wire recorder recorded no call'];
    if (rec.usage?.cacheRead !== 2000 || rec.usage.cacheWrite5m !== 100 || rec.usage.cacheWrite1h !== 200 || rec.usage.input !== 40) problems.push(`usage recorded as ${JSON.stringify(rec.usage)}`);
    if (rec.response?.toolCalls[0]?.name !== 'get_credits') problems.push('the tool call was not recorded');
    if (rec.countTokensCalls !== 1) problems.push(`count_tokens calls recorded: ${rec.countTokensCalls}, expected 1`);
    if (rec.request.effort !== 'low' || rec.request.thinking !== 'disabled' || !rec.request.salted) problems.push(`request summary ${JSON.stringify(rec.request)}`);
    if (rec.response?.requestId !== 'req_selftest') problems.push('request id not recorded');
    if (!(rec.costUsd > 0)) problems.push('cost not computed');
  } finally {
    server.close();
  }
  return problems;
}
