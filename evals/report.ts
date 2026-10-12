/**
 * Aggregate report for the write-up. Numbers only: no document text, quotes or judge reasons,
 * so owner-case content cannot appear in it.
 *
 *   npx tsx evals/report.ts --run evals/results/2026-10-12-sonnet-eval [--mode chain|fixed]
 *
 * mode chain : arms sonnet46-api, sonnet55-low, sonnet55-medium (each ran the whole kit itself)
 * mode fixed : B arms are the folders sonnet55-*__on-sonnet46-api (writing tasks on arm A's analysis)
 * Writes <run>/report-<mode>.json and <run>/report-<mode>.md.
 */
import fs from 'node:fs';
import path from 'node:path';
import { costUsd } from './lib/pricing';
import { DOC_TYPES, ROOT, groupPairs, loadVerdictRows, readJsonl, type DocType, type ResolvedPair } from './lib/judge-common';
import type { CallRecord, EvalTask } from './lib/types';

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const TASKS: EvalTask[] = ['parse_cv', 'extract_applicant', 'parse_job', 'skill_matching', 'extract_metrics', 'fit_assessment', 'optimize_cv', 'write_cover_letter', 'write_email', 'write_follow_up_email'];
const FAB_IDS = ['F1', 'F2', 'F3', 'F5'];

const f1 = (n: number | null | undefined, d = 1) => (n === null || n === undefined || Number.isNaN(n) ? 'n/a' : n.toFixed(d));
const sec = (ms: number | null | undefined) => (ms === null || ms === undefined || Number.isNaN(ms) ? 'n/a' : (ms / 1000).toFixed(1));
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

interface Det {
  scored_kits_rep1: number;
  failure_counts_rep1: Record<string, { kits: number; findings: number }>;
  stats: { kits: { total: number; complete: number; partial: number; aborted: number }; kit_latency_clean_concurrency1: { n: number; kit_ms_p50: number; kit_ms_p95: number }; perTask: Array<{ task: string; clean_n: number; clean_latency_ms_p50: number; clean_latency_ms_p95: number }> };
}

function armStats(runDir: string, dir: string) {
  const pub = path.join(runDir, dir);
  const priv = path.join(ROOT, 'evals', 'private', 'results', path.basename(runDir), dir);
  const detFile = path.join(pub, 'deterministic.json');
  const det = fs.existsSync(detFile) ? (JSON.parse(fs.readFileSync(detFile, 'utf8')) as Det) : null;
  const calls = [...readJsonl<CallRecord>(path.join(pub, 'calls.jsonl')), ...readJsonl<CallRecord>(path.join(priv, 'calls.jsonl'))];
  const q = calls.filter((c) => c.rep === 1);
  const kits = new Map<string, { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }>();
  for (const c of q) {
    if (!c.ok || !c.usage) continue;
    const k = `${c.case_id}|${c.run_id}`;
    const e = kits.get(k) ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
    e.input += c.usage.input;
    e.output += c.usage.output;
    e.cacheRead += c.usage.cacheRead;
    e.cacheWrite += c.usage.cacheWrite;
    e.cost += costUsd(c.request.model, c.usage);
    kits.set(k, e);
  }
  const ks = [...kits.values()];
  const failedFab = det ? FAB_IDS.reduce((s, id) => s + (det.failure_counts_rep1[id]?.findings ?? 0), 0) : null;
  return {
    dir,
    deterministic_present: det !== null,
    kits_scored: det?.scored_kits_rep1 ?? 0,
    deterministic_fabrication_findings_per_kit: det && det.scored_kits_rep1 ? failedFab! / det.scored_kits_rep1 : null,
    deterministic_failure_counts: Object.fromEntries(Object.entries(det?.failure_counts_rep1 ?? {}).map(([id, v]) => [id, v.kits])),
    latency_clean_kit: det?.stats.kit_latency_clean_concurrency1 ?? null,
    latency_clean_per_task: det?.stats.perTask.map((t) => ({ task: t.task, n: t.clean_n, p50_ms: t.clean_latency_ms_p50, p95_ms: t.clean_latency_ms_p95 })) ?? [],
    tokens_per_kit: { input: mean(ks.map((k) => k.input)), output: mean(ks.map((k) => k.output)), cache_read: mean(ks.map((k) => k.cacheRead)), cache_write: mean(ks.map((k) => k.cacheWrite)) },
    cost_usd_per_kit: mean(ks.map((k) => k.cost)),
    calls: q.length,
    refusal_rate: q.length ? q.filter((c) => c.stop_reason === 'refusal').length / q.length : null,
    truncation_rate: q.length ? q.filter((c) => c.stop_reason === 'max_tokens').length / q.length : null,
    failed_call_rate: q.length ? q.filter((c) => !c.ok).length / q.length : null,
  };
}

function compare(runDir: string, a: string, b: string) {
  const pairs: ResolvedPair[] = groupPairs(loadVerdictRows(runDir, a, b));
  const byType = Object.fromEntries(
    DOC_TYPES.map((t) => {
      const ps = pairs.filter((p) => p.doc_type === t);
      return [t, { n: ps.length, a_wins: ps.filter((p) => p.winner === 'a').length, ties: ps.filter((p) => p.winner === 'tie').length, b_wins: ps.filter((p) => p.winner === 'b').length, passes_disagreed: ps.filter((p) => p.passes_disagreed).length }];
    }),
  ) as Record<DocType, { n: number; a_wins: number; ties: number; b_wins: number; passes_disagreed: number }>;
  const cases = new Set(pairs.map((p) => p.case_id));
  const fab = (side: 'a' | 'b') => pairs.reduce((s, p) => s + p.fabrications[side], 0);
  return { a, b, judged_pairs: pairs.length, judged_kits: cases.size, by_doc_type: byType, judge_fabrications_per_kit: { a: cases.size ? fab('a') / cases.size : null, b: cases.size ? fab('b') / cases.size : null } };
}

function main() {
  const run = arg('run');
  if (!run) throw new Error('usage: --run <results dir> [--mode chain|fixed]');
  const runDir = path.resolve(run);
  const mode = arg('mode') ?? 'chain';
  if (!['chain', 'fixed'].includes(mode)) throw new Error('--mode must be chain or fixed');
  const sfx = mode === 'fixed' ? '__on-sonnet46-api' : '';
  const dirs = { 'sonnet-4.6': 'sonnet46-api', '5.5-low': `sonnet55-low${sfx}`, '5.5-medium': `sonnet55-medium${sfx}` };
  const arms = Object.fromEntries(Object.entries(dirs).map(([label, d]) => [label, armStats(runDir, d)]));
  const comparisons = [
    { name: '4.6 vs 5.5-low', ...compare(runDir, dirs['sonnet-4.6'], dirs['5.5-low']) },
    { name: '4.6 vs 5.5-medium', ...compare(runDir, dirs['sonnet-4.6'], dirs['5.5-medium']) },
    { name: '5.5-low vs 5.5-medium', ...compare(runDir, dirs['5.5-low'], dirs['5.5-medium']) },
  ];
  const report = { run: path.basename(runDir), mode, note: mode === 'fixed' ? 'B arms ran only the writing tasks on arm A analysis; their cost, tokens and latency cover those tasks (plus parse_cv), not the full kit.' : 'Every arm ran the whole kit itself.', arms, comparisons };
  fs.writeFileSync(path.join(runDir, `report-${mode}.json`), JSON.stringify(report, null, 1));

  const L: string[] = [`### Report (${mode} mode)`, '', report.note, ''];
  for (const c of comparisons) {
    L.push(`#### ${c.name} (first named arm wins = "win"; ${c.judged_kits} kits judged)`, '', '| Document | Win | Tie | Loss | Passes disagreed |', '|---|---|---|---|---|');
    for (const t of DOC_TYPES) {
      const r = c.by_doc_type[t];
      L.push(`| ${t} | ${r.a_wins} | ${r.ties} | ${r.b_wins} | ${r.passes_disagreed} of ${r.n} |`);
    }
    L.push('');
  }
  const labels = Object.keys(arms);
  const row = (name: string, f: (a: ReturnType<typeof armStats>) => string) => `| ${name} | ${labels.map((l) => f(arms[l])).join(' | ')} |`;
  L.push('#### Per arm', '', `| Metric | ${labels.join(' | ')} |`, `|---|${labels.map(() => '---').join('|')}|`);
  L.push(row('Kits scored', (a) => String(a.kits_scored)));
  L.push(row('Deterministic fabrication findings per kit (F1 F2 F3 F5)', (a) => f1(a.deterministic_fabrication_findings_per_kit, 2)));
  const ids = [...new Set(labels.flatMap((l) => Object.keys(arms[l].deterministic_failure_counts)))].sort();
  for (const id of ids) L.push(row(`Kits with ${id}`, (a) => String(a.deterministic_failure_counts[id] ?? 0)));
  L.push(row('Input tokens per kit', (a) => f1(a.tokens_per_kit.input, 0)));
  L.push(row('Output tokens per kit', (a) => f1(a.tokens_per_kit.output, 0)));
  L.push(row('Cost per kit (USD)', (a) => f1(a.cost_usd_per_kit, 3)));
  L.push(row('Kit latency p50 / p95 (s, latency reps)', (a) => (a.latency_clean_kit ? `${sec(a.latency_clean_kit.kit_ms_p50)} / ${sec(a.latency_clean_kit.kit_ms_p95)} (n=${a.latency_clean_kit.n})` : 'n/a')));
  L.push(row('Refusal rate (calls)', (a) => f1(a.refusal_rate === null ? null : a.refusal_rate * 100, 2) + '%'));
  L.push(row('Truncation rate (calls)', (a) => f1(a.truncation_rate === null ? null : a.truncation_rate * 100, 2) + '%'));
  L.push(row('Failed call rate', (a) => f1(a.failed_call_rate === null ? null : a.failed_call_rate * 100, 2) + '%'));
  L.push('', '#### Judge fabrications per kit (quoted by the judge, larger count of the two passes)', '', '| Comparison | First arm | Second arm |', '|---|---|---|');
  for (const c of comparisons) L.push(`| ${c.name} | ${f1(c.judge_fabrications_per_kit.a, 2)} | ${f1(c.judge_fabrications_per_kit.b, 2)} |`);
  L.push('', '#### Latency per task, p50 / p95 in seconds (latency reps only)', '', `| Task | ${labels.join(' | ')} |`, `|---|${labels.map(() => '---').join('|')}|`);
  for (const t of TASKS) {
    L.push(`| ${t} | ${labels.map((l) => { const x = arms[l].latency_clean_per_task.find((y) => y.task === t); return x && x.n ? `${sec(x.p50_ms)} / ${sec(x.p95_ms)}` : 'n/a'; }).join(' | ')} |`);
  }
  fs.writeFileSync(path.join(runDir, `report-${mode}.md`), L.join('\n') + '\n');
  console.log(L.join('\n'));
}

main();
