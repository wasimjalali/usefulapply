/**
 * Screening logistics eval: the shipped screening prompt (buildScreeningPrompt
 * from src) against gpt-oss-120b on Workers AI, through the local proxy in
 * worker.ts. Same input shape as callWorkersAI for screening: a system message,
 * the user's questions, temperature 0.4, max_tokens 8000.
 *
 *   npx wrangler dev -c evals/screening-logistics/wrangler.jsonc --port 8799
 *   npx tsx evals/screening-logistics/run.ts --url http://localhost:8799 --runs 5 --label <label>
 *
 * Writes <out>/<label>.json (every raw response) and prints the pass counts.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildScreeningPrompt } from '../../src/lib/services/screening';
import { CASES, type EvalCase } from './fixtures';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const URL_BASE = args.get('url') ?? 'http://localhost:8799';
const RUNS = Number(args.get('runs') ?? 5);
const LABEL = args.get('label') ?? 'run';
const OUT = args.get('out') ?? 'evals/results/2026-10-22-screening-logistics';
const ONLY = args.get('cases')?.split(',');

const TEMPERATURE = 0.4;
const MAX_TOKENS = 8000;
const PRICE_IN = 0.35 / 1_000_000;
const PRICE_OUT = 0.75 / 1_000_000;

interface Usage { prompt_tokens?: number; completion_tokens?: number }
interface ProxyReply {
  latencyMs: number;
  result: { choices?: Array<{ message?: { content?: string | null; reasoning_content?: string | null } }>; response?: string; usage?: Usage };
}

/** Same reading as workersAiText in src/lib/models/workers-ai.ts. */
function replyText(result: ProxyReply['result']): string {
  const fromChoices = result.choices?.[0]?.message?.content;
  if (typeof fromChoices === 'string' && fromChoices.length > 0) return fromChoices;
  return typeof result.response === 'string' ? result.response : '';
}

/** The answer text inside the first block, without the repeated question. */
function answerOf(reply: string): string | null {
  const match = /---ANSWER_START---([\s\S]*?)---ANSWER_END---/.exec(reply);
  if (!match) return null;
  return match[1].split('\n').filter((line) => !/^\s*\*\*Q:/.test(line)).join('\n').trim();
}

function grade(id: EvalCase['id'], answer: string): string[] {
  const failures: string[] = [];
  const must = (re: RegExp, why: string) => { if (!re.test(answer)) failures.push(why); };
  const never = (re: RegExp, why: string) => { if (re.test(answer)) failures.push(why); };
  switch (id) {
    case 'a':
      must(/sofort/i, 'does not say sofort');
      never(/kündigungsfrist/i, 'asserts a Kündigungsfrist');
      break;
    case 'b':
      must(/nach Ablauf meiner Kündigungsfrist/i, 'not the standard wording');
      never(/sofort|umgehend|kurzfristig|unverzüglich/i, 'claims a quick start');
      never(/\d/, 'carries a date or number');
      break;
    case 'c':
      // Any hyphen: the model writes a non-breaking one (U+2011) in "3-month".
      must(/\b(3|three)[\s\-\u2010\u2011]?months?\b/i, 'does not mention 3 months');
      never(/immediately|right away|no notice/i, 'claims an immediate start');
      break;
    case 'd':
      never(/\d/, 'carries a figure');
      never(/[£€$]|\bGBP\b|\bEUR\b/i, 'carries a currency');
      break;
  }
  return failures;
}

async function callModel(system: string, question: string): Promise<ProxyReply> {
  const res = await fetch(URL_BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'system', content: system }, { role: 'user', content: question }],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
    }),
  });
  if (!res.ok) throw new Error(`proxy answered ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as ProxyReply;
}

async function main() {
  const cases = CASES.filter((c) => !ONLY || ONLY.includes(c.id));
  const records: unknown[] = [];
  const prompts: Record<string, { chars: number; primaryCVChars: number; masterCVChars: number; system: string }> = {};
  let tokensIn = 0;
  let tokensOut = 0;
  const summary: Record<string, { pass: number; runs: number }> = {};

  for (const c of cases) {
    const system = buildScreeningPrompt(c.context);
    prompts[c.id] = {
      chars: system.length,
      primaryCVChars: c.context.primaryCV?.length ?? 0,
      masterCVChars: c.context.masterCV?.length ?? 0,
      system,
    };
    summary[c.id] = { pass: 0, runs: 0 };
    for (let run = 1; run <= RUNS; run++) {
      const reply = await callModel(system, c.question);
      const text = replyText(reply.result);
      const answer = answerOf(text);
      const failures = answer === null ? ['no answer block'] : grade(c.id, answer);
      const usage = reply.result.usage ?? {};
      tokensIn += usage.prompt_tokens ?? 0;
      tokensOut += usage.completion_tokens ?? 0;
      summary[c.id].runs++;
      if (failures.length === 0) summary[c.id].pass++;
      records.push({ case: c.id, run, question: c.question, answer, pass: failures.length === 0, failures, latencyMs: reply.latencyMs, usage, raw: reply.result });
      console.log(`${c.id}#${run} ${failures.length === 0 ? 'PASS' : `FAIL (${failures.join('; ')})`} | ${(answer ?? text).replace(/\s+/g, ' ').slice(0, 160)}`);
    }
  }

  const cost = tokensIn * PRICE_IN + tokensOut * PRICE_OUT;
  const result = {
    label: LABEL,
    date: new Date().toISOString(),
    model: '@cf/openai/gpt-oss-120b',
    settings: { temperature: TEMPERATURE, max_tokens: MAX_TOKENS, runsPerCase: RUNS, reasoning: 'model default (medium)' },
    summary,
    tokens: { input: tokensIn, output: tokensOut },
    costUsd: Number(cost.toFixed(5)),
    cases: cases.map((c) => ({ id: c.id, title: c.title, question: c.question, expect: c.expect })),
    prompts,
    records,
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${LABEL}.json`), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ summary, tokens: result.tokens, costUsd: result.costUsd }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
