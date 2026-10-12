/**
 * Blind pairwise judge: Claude Opus 5.5 compares two arms per document type on the same case.
 * Each pair is judged twice with positions swapped (seeded); a disagreement counts as a tie.
 *
 *   npx tsx evals/judge.ts --run evals/results/2026-10-07-sonnet-eval \
 *     --a sonnet46-api --b sonnet55-low --allow-anthropic-api [--types cv,fit] [--only syn-01] [--seed 1] [--concurrency 4]
 *   add --dry-run to build and print one judge request without network or the guard flag.
 *
 * --a/--b are arm folder names under --run (for fixed-input B arms: sonnet55-low__on-sonnet46-api).
 * Resumable JSONL. Synthetic verdicts go to <run>/judge/, owner-case verdicts to evals/private/results/<run>/judge/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { callAnthropicMessages, loadEnv, setDryRun } from './lib/client';
import { loadCases, resolveCase } from './lib/cases';
import { costUsd } from './lib/pricing';
import {
  DOC_TYPES,
  JUDGE_MODEL,
  RUBRIC,
  VERDICT_SCHEMA,
  docText,
  judgeFiles,
  judgeUserPrompt,
  loadIntermediates,
  readJsonl,
  seededBit,
  validateVerdict,
  winnerArm,
  type DocType,
  type VerdictRow,
} from './lib/judge-common';

const ROOT = path.resolve(__dirname, '..');
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (n: string) => process.argv.includes(`--${n}`);

export function buildJudgeParams(userPrompt: string): Record<string, unknown> {
  return {
    model: JUDGE_MODEL,
    max_tokens: 16000,
    system: RUBRIC,
    messages: [{ role: 'user', content: userPrompt }],
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: VERDICT_SCHEMA } },
  };
}

async function main() {
  const dryRun = flag('dry-run');
  if (!dryRun && !flag('allow-anthropic-api')) throw new Error('judge.ts calls the paid Anthropic API and refuses to run without --allow-anthropic-api (or --dry-run).');
  const run = arg('run');
  const a = arg('a');
  const b = arg('b');
  if (!run || !a || !b) throw new Error('usage: --run <results dir> --a <arm folder> --b <arm folder>');
  const runDir = path.resolve(run);
  const seed = arg('seed') ?? 'judge-1';
  const rep = Number(arg('rep') ?? 1);
  const concurrency = Number(arg('concurrency') ?? 4);
  const types = (arg('types')?.split(',') ?? [...DOC_TYPES]) as DocType[];
  const only = arg('only')?.split(',');
  loadEnv();
  setDryRun(dryRun);
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  const files = judgeFiles(runDir, a, b);
  fs.mkdirSync(path.dirname(files.pub), { recursive: true });
  fs.mkdirSync(path.dirname(files.priv), { recursive: true });
  const done = new Set([...readJsonl<VerdictRow>(files.pub), ...readJsonl<VerdictRow>(files.priv)].map((r) => r.key));

  const cases = loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')).filter((c) => !only || only.includes(c.id));
  interface Job {
    row: VerdictRow;
    prompt: string | null;
  }
  const jobs: Job[] = [];
  for (const cr of cases) {
    const ia = loadIntermediates(runDir, a, cr.origin, cr.id, rep);
    const ib = loadIntermediates(runDir, b, cr.origin, cr.id, rep);
    if (!ia || !ib) continue;
    const c = resolveCase(cr);
    for (const t of types) {
      const da = docText(ia, t);
      const db = docText(ib, t);
      for (const pass of [1, 2] as const) {
        const key = `${cr.id}|${rep}|${t}|${pass}`;
        if (done.has(key)) continue;
        const first = seededBit(seed, cr.id, rep, t) === 0 ? 'a' : 'b';
        const output1_is = pass === 1 ? first : first === 'a' ? 'b' : 'a';
        const row: VerdictRow = { key, case_id: cr.id, origin: cr.origin, language: cr.language, doc_type: t, arm_a: a, arm_b: b, rep, pass, output1_is, auto: null, verdict: null, winner_arm: 'tie', usage: null, cost_usd: 0, latency_ms: 0, stop_reason: null };
        if (!da || !db) {
          // A missing document is a failure of that arm; no judge call needed.
          row.auto = !da && !db ? 'both_missing' : !da ? 'a_missing' : 'b_missing';
          row.winner_arm = !da && !db ? 'tie' : !da ? 'b' : 'a';
          jobs.push({ row, prompt: null });
          continue;
        }
        const [o1, o2] = output1_is === 'a' ? [da, db] : [db, da];
        jobs.push({ row, prompt: judgeUserPrompt({ docType: t, language: cr.language, jd: c.jdText, cv: c.cvText, masterCv: c.masterCvText, output1: o1, output2: o2 }) });
      }
    }
  }
  console.log(`judge ${a} vs ${b}: ${jobs.length} passes to run (${done.size} done), ${jobs.filter((j) => j.prompt).length} need the judge, concurrency ${concurrency}${dryRun ? ' (DRY RUN)' : ''}`);

  if (dryRun) {
    const j = jobs.find((x) => x.prompt);
    if (!j) {
      console.log('no judgeable pair found (run the arms first)');
      return;
    }
    const params = buildJudgeParams(j.prompt!);
    const trunc = (s: string) => (s.length > 300 ? `${s.slice(0, 300)}... [${s.length} chars]` : s);
    console.log(JSON.stringify({ ...params, system: trunc(params.system as string), messages: [{ role: 'user', content: trunc(j.prompt!) }] }, null, 1));
    return;
  }

  let next = 0;
  let spent = 0;
  let fin = 0;
  const sink = (row: VerdictRow) => fs.appendFileSync(row.origin === 'owner' ? files.priv : files.pub, JSON.stringify(row) + '\n');
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      const { row, prompt } = jobs[i];
      if (prompt) {
        const t0 = Date.now();
        try {
          const r = await callAnthropicMessages(buildJudgeParams(prompt));
          row.stop_reason = r.stopReason;
          row.usage = { input: r.usage.input, output: r.usage.output, cacheWrite: r.usage.cacheWrite, cacheRead: r.usage.cacheRead };
          row.cost_usd = costUsd(JUDGE_MODEL, row.usage);
          row.latency_ms = Date.now() - t0;
          spent += row.cost_usd;
          if (r.stopReason !== 'end_turn') throw new Error(`stop_reason ${r.stopReason}`);
          row.verdict = validateVerdict(JSON.parse(r.text));
          row.winner_arm = winnerArm(row.verdict, row.output1_is);
        } catch (error) {
          // Not written, so a rerun retries it.
          console.error(`JUDGE FAIL ${row.key}: ${(error as Error).message}`);
          continue;
        }
      }
      sink(row);
      fin++;
      if (fin % 10 === 0) console.log(`${fin}/${jobs.length} judge cost so far $${spent.toFixed(2)}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(jobs.length, 1)) }, worker));
  console.log(`done ${fin}/${jobs.length}, judge cost $${spent.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
