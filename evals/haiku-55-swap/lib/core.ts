/**
 * Shared types, arms, prices, statistics and the decision rule for the Haiku 5.5 swap evals.
 *
 * The decision rule below is FIXED BEFORE ANY PAID RUN (plan section 3, 2026-10-22). Do not tune it
 * after seeing numbers; if it is wrong, write a new dated rule and say why in the write-up.
 */
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';

export const REPO_ROOT = resolve(__dirname, '..', '..', '..');
export const RESULTS_ROOT = join(REPO_ROOT, 'evals', 'results', '2026-10-22-haiku-55-swap');

export const SITE_IDS = ['screening', 'chat', 'tracker', 'language', 'ranking', 'search_strategy', 'career_profile'] as const;
export type SiteId = (typeof SITE_IDS)[number];

// ---------------------------------------------------------------------------
// Arms
// ---------------------------------------------------------------------------

export type HaikuEffortId = 'low-nothink' | 'low' | 'medium' | 'high';
export type ArmId = `haiku-${HaikuEffortId}` | 'gptoss';

export interface Arm {
  id: ArmId;
  kind: 'haiku' | 'gptoss';
  /** Haiku only. 'low-nothink' = effort low with `thinking: {type: 'disabled'}`. */
  effort?: HaikuEffortId;
  /** Order for "lowest effort first". gpt-oss has none. */
  rank: number;
}

export const ARMS: Arm[] = [
  { id: 'haiku-low-nothink', kind: 'haiku', effort: 'low-nothink', rank: 0 },
  { id: 'haiku-low', kind: 'haiku', effort: 'low', rank: 1 },
  { id: 'haiku-medium', kind: 'haiku', effort: 'medium', rank: 2 },
  { id: 'haiku-high', kind: 'haiku', effort: 'high', rank: 3 },
  { id: 'gptoss', kind: 'gptoss', rank: 99 },
];

export function armById(id: string): Arm {
  const arm = ARMS.find((a) => a.id === id);
  if (!arm) throw new Error(`Unknown arm "${id}". Arms: ${ARMS.map((a) => a.id).join(', ')}`);
  return arm;
}

/** The wire value of output_config.effort for an arm. */
export function wireEffort(arm: Arm): 'low' | 'medium' | 'high' {
  if (arm.kind !== 'haiku' || !arm.effort) throw new Error(`${arm.id} has no effort`);
  return arm.effort === 'low-nothink' ? 'low' : arm.effort;
}

// ---------------------------------------------------------------------------
// Prices, USD per million tokens
// ---------------------------------------------------------------------------

export interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
}

/** claude-haiku-5-5, prompts up to 100k tokens (docs, 2026-10-22). Over 100k the harness flags the call and prices the higher tier. */
const HAIKU_PRICE = { in: 0.1, out: 0.5, write5m: 0.125, write1h: 0.2, read: 0.01 };
/** Over the 100k tier: input 0.50, output 2.50, 5m write 0.625, read 0.05. The 1h write is assumed 2x input (not published in the plan). */
const HAIKU_PRICE_OVER = { in: 0.5, out: 2.5, write5m: 0.625, write1h: 1.0, read: 0.05 };
const GPTOSS_PRICE = { in: 0.35, out: 0.75 };

export const HARNESS_INPUT_BUDGET = 100_000;

export function inputTotal(u: Usage): number {
  return u.input + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h;
}

export function costUsd(arm: Arm, u: Usage): number {
  if (arm.kind === 'gptoss') return ((u.input + u.cacheRead) * GPTOSS_PRICE.in + u.output * GPTOSS_PRICE.out) / 1e6;
  const p = inputTotal(u) > HARNESS_INPUT_BUDGET ? HAIKU_PRICE_OVER : HAIKU_PRICE;
  return (u.input * p.in + u.output * p.out + u.cacheWrite5m * p.write5m + u.cacheWrite1h * p.write1h + u.cacheRead * p.read) / 1e6;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface CallRecord {
  seq: number;
  site: SiteId;
  arm: ArmId;
  run: number;
  caseId: string;
  backend: 'haiku-live' | 'gptoss' | 'dry';
  request: {
    model: string;
    effort: string | null;
    thinking: string | null;
    maxTokens: number | null;
    systemChars: number;
    stableChars: number;
    tools: number;
    messages: number;
    jsonSchema: boolean;
    cacheMarkers: number;
    /** Hash of everything before the first cache marker (tools + static system). Equal hashes = byte-identical cached prefix. */
    prefixHash: string | null;
    /** Hash of everything before the last cache marker. */
    stablePrefixHash: string | null;
    estInputTokens: number;
    salted: boolean;
  };
  response: { text: string; stopReason: string | null; requestId: string | null; toolCalls: Array<{ name: string; input: unknown }> } | null;
  usage: Usage | null;
  inputTotal: number;
  latencyMs: number;
  costUsd: number;
  over100k: boolean;
  countTokensCalls: number;
  error: string | null;
}

export interface CaseOutcome {
  caseId: string;
  group: string;
  run: number;
  arm: ArmId;
  pass: boolean;
  /** Human-readable reasons for a miss. */
  failures: string[];
  /** Names of hard-constraint violations (one entry per violation). Counted per name in the summary. */
  hard: string[];
  /** Numeric site metrics, averaged per arm (NDCG@10, judge score, ...). */
  metrics: Record<string, number>;
  /** What the shipped code returned, trimmed to what a reviewer needs. */
  output: unknown;
  latencyMs: number;
  calls: CallRecord[];
  error: string | null;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

/** Wilson score interval, 95%. */
export function wilson(pass: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const phat = pass / n;
  const denom = 1 + (z * z) / n;
  const centre = (phat + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((phat * (1 - phat)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

const mean = (xs: number[]) => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const round = (x: number | null, d = 4) => (x === null ? null : Number(x.toFixed(d)));

export interface ArmSummary {
  arm: ArmId;
  n: number;
  pass: number;
  failures: number;
  passRate: number;
  ci95: [number, number];
  hard: Record<string, number>;
  metrics: Record<string, number | null>;
  latencyMs: { callP50: number | null; callP95: number | null; caseP50: number | null; caseP95: number | null };
  cost: { perCallUsd: number | null; perCaseUsd: number | null; totalUsd: number };
  calls: number;
  errors: number;
  over100kCalls: number;
  cache: {
    read: number;
    write5m: number;
    write1h: number;
    uncachedInput: number;
    /** read / (read + writes + uncached input). */
    hitRate: number | null;
    /** Same, over calls after the first call of each (run, group) sequence: what warm traffic sees. */
    warmHitRate: number | null;
  };
}

export function summarizeArm(arm: ArmId, outcomes: CaseOutcome[]): ArmSummary {
  const mine = outcomes.filter((o) => o.arm === arm);
  const calls = mine.flatMap((o) => o.calls);
  const okCalls = calls.filter((c) => c.usage);
  const hard: Record<string, number> = {};
  for (const o of mine) for (const h of o.hard) hard[h] = (hard[h] ?? 0) + 1;
  const metricKeys = new Set(mine.flatMap((o) => Object.keys(o.metrics)));
  const metrics: Record<string, number | null> = {};
  for (const k of metricKeys) metrics[k] = round(mean(mine.filter((o) => k in o.metrics).map((o) => o.metrics[k])));
  const sum = (f: (c: CallRecord) => number) => okCalls.reduce((a, c) => a + f(c), 0);
  const read = sum((c) => c.usage!.cacheRead);
  const w5 = sum((c) => c.usage!.cacheWrite5m);
  const w1 = sum((c) => c.usage!.cacheWrite1h);
  const uncached = sum((c) => c.usage!.input);
  const rate = (r: number, w: number, u: number) => (r + w + u === 0 ? null : round(r / (r + w + u)));

  // Warm hit rate: skip the first call of every (run, group) sequence, which has to write.
  const firstSeen = new Set<string>();
  let wr = 0;
  let ww = 0;
  let wu = 0;
  for (const o of mine) {
    for (const c of o.calls) {
      if (!c.usage) continue;
      const key = `${o.run}|${o.group}`;
      if (!firstSeen.has(key)) {
        firstSeen.add(key);
        continue;
      }
      wr += c.usage.cacheRead;
      ww += c.usage.cacheWrite5m + c.usage.cacheWrite1h;
      wu += c.usage.input;
    }
  }
  const total = sum((c) => c.costUsd);
  const [lo, hi] = wilson(mine.filter((o) => o.pass).length, mine.length);
  return {
    arm,
    n: mine.length,
    pass: mine.filter((o) => o.pass).length,
    failures: mine.filter((o) => !o.pass).length,
    passRate: round(mine.length === 0 ? 0 : mine.filter((o) => o.pass).length / mine.length) ?? 0,
    ci95: [round(lo) ?? 0, round(hi) ?? 1],
    hard,
    metrics,
    latencyMs: {
      callP50: percentile(okCalls.map((c) => c.latencyMs), 50),
      callP95: percentile(okCalls.map((c) => c.latencyMs), 95),
      caseP50: percentile(mine.map((o) => o.latencyMs), 50),
      caseP95: percentile(mine.map((o) => o.latencyMs), 95),
    },
    cost: { perCallUsd: round(okCalls.length ? total / okCalls.length : null, 6), perCaseUsd: round(mine.length ? total / mine.length : null, 6), totalUsd: round(total, 5) ?? 0 },
    calls: calls.length,
    errors: mine.filter((o) => o.error).length,
    over100kCalls: calls.filter((c) => c.over100k).length,
    cache: { read, write5m: w5, write1h: w1, uncachedInput: uncached, hitRate: rate(read, w5 + w1, uncached), warmHitRate: rate(wr, ww, wu) },
  };
}

// ---------------------------------------------------------------------------
// Decision rule (fixed before running)
// ---------------------------------------------------------------------------

export const DECISION_RULE = [
  'Per site, pick the lowest-effort Haiku arm (order: low-nothink, low, medium, high) that satisfies ALL of:',
  '1. Primary metric: its case failures are at most one more than the best Haiku arm (counting every case of every run). The 95% Wilson intervals are reported but do not qualify an arm (tightened before any paid run, 2026-10-22: at these sample sizes overlapping intervals admit several extra failures).',
  '2. Hard constraints: for every hard-constraint metric it has no more violations than the gpt-oss arm, and zero violations for the metrics a site lists as absolute (ranking: hard-constraint violations in the top 10 must be 0, and hard_in_surfaced (every surfaced item) is held to the gpt-oss count; every site: no call over the 100k input budget).',
  '3. It produced no errors (a thrown error, an empty reply, a budget stop) that the best Haiku arm did not also produce.',
  'Tie-break between arms of the same effort rank: lower p50 per-call latency. If no arm qualifies the site is undecided and the orchestrator decides by hand.',
  'A run that aborted (the --max-cost stop) or whose arms ran unequal case counts is undecided, whatever the numbers (added 2026-10-22 after review: an arm cut short has fewer chances to fail).',
  'gpt-oss is a baseline only: it is never a candidate. A winner with more primary failures than gpt-oss is flagged for the orchestrator. Cache hit rate and cost are reported but do not enter the rule.',
].join('\n');

export interface DecisionRow {
  arm: ArmId;
  eligible: boolean;
  reasons: string[];
}

export interface Decision {
  winner: ArmId | null;
  rows: DecisionRow[];
  winnerBelowBaseline: boolean;
  /** Why no winner was picked although arms ran (an aborted run, unequal case counts), or null. */
  undecidedReason: string | null;
}

/**
 * `run.aborted` is the runner's abort reason (the --max-cost stop), or null. An aborted run or arms with
 * unequal case counts are undecided: arms that ran fewer cases would look better on failure counts.
 */
export function decide(summaries: ArmSummary[], absoluteHard: string[], run: { aborted: string | null } = { aborted: null }): Decision {
  const haiku = summaries.filter((s) => armById(s.arm).kind === 'haiku');
  const baseline = summaries.find((s) => s.arm === 'gptoss') ?? null;
  if (haiku.length === 0) return { winner: null, rows: [], winnerBelowBaseline: false, undecidedReason: 'no Haiku arm ran' };
  const best = haiku.reduce((a, b) => (b.failures < a.failures || (b.failures === a.failures && b.passRate > a.passRate) ? b : a));
  const bestErrors = best.errors;
  const rows: DecisionRow[] = haiku.map((s) => {
    const reasons: string[] = [];
    if (s.failures > best.failures + 1) {
      reasons.push(`primary: ${s.failures} failures vs best ${best.failures} (${best.arm})`);
    }
    const names = new Set([...Object.keys(s.hard), ...(baseline ? Object.keys(baseline.hard) : []), ...absoluteHard]);
    for (const name of names) {
      const mine = s.hard[name] ?? 0;
      const limit = absoluteHard.includes(name) ? 0 : baseline ? (baseline.hard[name] ?? 0) : 0;
      if (mine > limit) reasons.push(`hard "${name}": ${mine} violations, allowed ${limit}`);
    }
    if (s.over100kCalls > 0) reasons.push(`${s.over100kCalls} call(s) over the 100k input budget`);
    if (s.errors > bestErrors) reasons.push(`errors: ${s.errors} vs best arm's ${bestErrors}`);
    return { arm: s.arm, eligible: reasons.length === 0, reasons };
  });
  const eligible = rows
    .filter((r) => r.eligible)
    .map((r) => ({ r, s: haiku.find((s) => s.arm === r.arm)!, rank: armById(r.arm).rank }))
    .sort((a, b) => a.rank - b.rank || (a.s.latencyMs.callP50 ?? Infinity) - (b.s.latencyMs.callP50 ?? Infinity));
  const counts = new Set(summaries.map((s) => s.n));
  const undecidedReason = run.aborted
    ? `run aborted (${run.aborted}): the arms did not all run every case`
    : counts.size > 1
      ? `arms ran unequal case counts (${summaries.map((s) => `${s.arm} ${s.n}`).join(', ')})`
      : null;
  if (undecidedReason) return { winner: null, rows, winnerBelowBaseline: false, undecidedReason };
  const winner = eligible[0]?.s ?? null;
  const winnerBelowBaseline = Boolean(winner && baseline && winner.failures > baseline.failures);
  return { winner: winner?.arm ?? null, rows, winnerBelowBaseline, undecidedReason: winner ? null : 'no arm qualified' };
}

// ---------------------------------------------------------------------------
// CLI and output
// ---------------------------------------------------------------------------

export interface Cli {
  positional: string[];
  get(name: string): string | undefined;
  has(name: string): boolean;
  num(name: string, fallback: number): number;
  list(name: string): string[] | undefined;
}

/** `--flag value` and bare `--flag`. A bare flag is one that is last or followed by another `--flag`. */
export function parseCli(argv: string[]): Cli {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      positional.push(a);
      continue;
    }
    const name = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) flags.set(name, 'true');
    else {
      flags.set(name, next);
      i += 1;
    }
  }
  return {
    positional,
    get: (n) => flags.get(n),
    has: (n) => flags.has(n),
    num: (n, f) => {
      const v = flags.get(n);
      if (v === undefined) return f;
      const x = Number(v);
      if (!Number.isFinite(x)) throw new Error(`--${n} needs a number, got "${v}"`);
      return x;
    },
    list: (n) => flags.get(n)?.split(',').map((s) => s.trim()).filter(Boolean),
  };
}

/** The next free results/<site>/run-N path. Never overwrites: the file is created exclusively. */
export function nextRunPath(site: string, root: string = RESULTS_ROOT): { path: string; n: number } {
  const dir = join(root, site);
  const taken = existsSync(dir)
    ? readdirSync(dir).map((f) => /^run-(\d+)\.json(\.gz)?$/.exec(f)?.[1]).filter((x): x is string => Boolean(x)).map(Number)
    : [];
  return { n: Math.max(0, ...taken) + 1, path: join(dir, `run-${Math.max(0, ...taken) + 1}.json`) };
}

const GZIP_OVER_BYTES = 5 * 1024 * 1024;

/** Writes run-N.json, or run-N.json.gz when the JSON is over 5 MB. Throws if the path exists. */
export function writeRun(site: string, result: unknown, root: string = RESULTS_ROOT): string {
  const { path } = nextRunPath(site, root);
  mkdirSync(join(root, site), { recursive: true });
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const big = Buffer.byteLength(json) > GZIP_OVER_BYTES;
  const target = big ? `${path}.gz` : path;
  const fd = openSync(target, 'wx');
  try {
    writeFileSync(fd, big ? gzipSync(json) : json);
  } finally {
    closeSync(fd);
  }
  return target;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
