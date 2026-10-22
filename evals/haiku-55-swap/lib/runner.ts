/**
 * Generic site runner: arms x runs x cases, in the order real traffic would send them, then the
 * judge pass, the summary, the decision rule and the result file.
 *
 * Order. For each run, for each arm, for each sequence ("group": one user's turns, in order) the
 * cases go one after another, so the cached prefix a case writes is the one the next case reads, as
 * in production. Each (arm, run) gets its own cache salt (see intercept.ts), so an arm never reads
 * another arm's or another run's entries: every arm and run pays its own cold start. `--salt off`
 * removes the salt to measure the steady state instead (arms then share entries, so compare only
 * quality and latency across arms in that mode).
 */
import { execFileSync } from 'node:child_process';
import { accessSync, constants, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ARMS,
  DECISION_RULE,
  RESULTS_ROOT,
  armById,
  decide,
  nextRunPath,
  sleep,
  summarizeArm,
  writeRun,
  type Arm,
  type ArmId,
  type CallRecord,
  type CaseOutcome,
  type Cli,
  type SiteId,
} from './core';
import { mapLimit, judgeOnce, type JudgeSpec } from './judge';
import { scopeStore, type Oracle, type Scope } from './intercept';

export interface SiteCase {
  id: string;
  /** One user's turns share a group and run in array order. */
  group: string;
}

export interface CaseResult {
  output: unknown;
  pass: boolean;
  failures: string[];
  hard: string[];
  metrics: Record<string, number>;
}

export interface RunCtx {
  arm: Arm;
  run: number;
  dry: boolean;
}

export interface JudgePlan<C> {
  spec: JudgeSpec;
  /** Whether this outcome needs a judge call (usually: the deterministic checks passed and there is text to judge). */
  wants(outcome: CaseOutcome, c: C): boolean;
  prompt(outcome: CaseOutcome, c: C): string;
  /** What the dry run returns instead of calling the judge. */
  canned: unknown;
  /** Folds the verdict into the outcome (set pass, failures, metrics). */
  apply(verdict: unknown, outcome: CaseOutcome, c: C): void;
}

export interface Site<C extends SiteCase> {
  id: SiteId;
  title: string;
  /** The exact command line for this site, shown in the result header. */
  command: string;
  runsDefault: number;
  /** One sentence: what a passing case is. Written into the result file next to the decision rule. */
  passRule: string;
  /** Hard-constraint metrics that must be zero for an arm to qualify, whatever gpt-oss did. */
  absoluteHard: string[];
  cases(): C[];
  /** Fixture, grader and request-shape problems found without any model. Empty = fine. */
  selfTest(): Promise<string[]> | string[];
  oracle(c: C): Oracle;
  /** Once per process, before the first case (the chat site opens the local D1 here). */
  setup?(ctx: { dry: boolean }): Promise<void>;
  teardown?(): Promise<void>;
  run(c: C, ctx: RunCtx): Promise<CaseResult>;
  judge?: JudgePlan<C>;
}

export interface RunOptions {
  dry: boolean;
  arms: Arm[];
  runs: number;
  limit: number | null;
  only: string[] | null;
  salt: boolean;
  gptossUrl: string | null;
  maxCostUsd: number;
  gapMs: number;
  judgeConcurrency: number;
}

export function optionsFromCli(cli: Cli, site: { runsDefault: number }): RunOptions {
  const dry = cli.has('dry');
  if (!dry && !cli.has('allow-anthropic-api')) {
    throw new Error('This run spends money on the Anthropic API (and Workers AI for the baseline). Pass --allow-anthropic-api, or --dry for a network-free run.');
  }
  const armIds = cli.list('arms') ?? (dry && cli.has('limit') ? ['haiku-low'] : ARMS.map((a) => a.id));
  const arms = armIds.map(armById);
  const gptossUrl = cli.get('gptoss-url') ?? null;
  if (!dry && arms.some((a) => a.kind === 'gptoss') && !gptossUrl) {
    throw new Error('The gptoss arm needs --gptoss-url (npx wrangler dev -c evals/haiku-55-swap/wrangler.jsonc --port 8799, then --gptoss-url http://localhost:8799).');
  }
  const salt = cli.get('salt') ?? 'on';
  if (salt !== 'on' && salt !== 'off') throw new Error('--salt takes on or off');
  return {
    dry,
    arms,
    runs: cli.num('runs', dry ? 1 : site.runsDefault),
    limit: cli.has('limit') ? cli.num('limit', 1) : null,
    only: cli.list('cases') ?? null,
    salt: salt === 'on',
    gptossUrl,
    maxCostUsd: cli.num('max-cost', 5),
    gapMs: cli.num('gap-ms', 0),
    judgeConcurrency: cli.num('judge-concurrency', 4),
  };
}

function gitSha(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function groupsOf<C extends SiteCase>(cases: C[]): Array<{ group: string; cases: C[] }> {
  const order: string[] = [];
  const map = new Map<string, C[]>();
  for (const c of cases) {
    if (!map.has(c.group)) {
      map.set(c.group, []);
      order.push(c.group);
    }
    map.get(c.group)!.push(c);
  }
  return order.map((group) => ({ group, cases: map.get(group)! }));
}

const trimCall = (c: CallRecord) => c;

export async function runSite<C extends SiteCase>(site: Site<C>, options: RunOptions): Promise<{ file: string; summaries: ReturnType<typeof summarizeArm>[]; winner: ArmId | null }> {
  const problems = await site.selfTest();
  if (problems.length > 0) throw new Error(`${site.id}: self-test failed:\n  - ${problems.join('\n  - ')}`);

  let cases = site.cases();
  if (options.only) cases = cases.filter((c) => options.only!.includes(c.id));
  if (options.limit !== null) cases = cases.slice(0, options.limit);
  if (cases.length === 0) throw new Error(`${site.id}: no cases selected`);
  const caseById = new Map(cases.map((c) => [c.id, c]));

  // Output path check up front: a run that would fail to write must fail before it spends anything.
  if (options.dry) {
    accessSync(RESULTS_ROOT, constants.W_OK);
  } else {
    mkdirSync(join(RESULTS_ROOT, site.id), { recursive: true });
    accessSync(join(RESULTS_ROOT, site.id), constants.W_OK);
  }
  const wouldWrite = nextRunPath(site.id);

  await site.setup?.({ dry: options.dry });
  const started = new Date().toISOString();
  const outcomes: CaseOutcome[] = [];
  let spent = 0;
  let aborted: string | null = null;
  const nonce = Date.now().toString(36);
  const groups = groupsOf(cases);

  try {
    outer: for (let run = 1; run <= options.runs; run += 1) {
      for (const arm of options.arms) {
        const salt = options.salt ? `${site.id}-${arm.id}-r${run}-${nonce}` : null;
        for (const { group, cases: groupCases } of groups) {
          for (const c of groupCases) {
            const scope: Scope = {
              site: site.id, arm, run, caseId: c.id, group, dry: options.dry, salt,
              calls: [], seq: { n: 0 }, oracle: site.oracle(c), gptossUrl: options.gptossUrl ?? undefined, countTokens: 0,
            };
            const t0 = performance.now();
            const outcome: CaseOutcome = { caseId: c.id, group, run, arm: arm.id, pass: false, failures: [], hard: [], metrics: {}, output: null, latencyMs: 0, calls: scope.calls, error: null };
            try {
              const result = await scopeStore.run(scope, () => site.run(c, { arm, run, dry: options.dry }));
              Object.assign(outcome, { output: result.output, pass: result.pass, failures: result.failures, hard: result.hard, metrics: result.metrics });
            } catch (error) {
              outcome.error = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
              outcome.failures = [`threw: ${outcome.error}`];
            }
            outcome.latencyMs = Math.round(performance.now() - t0);
            outcomes.push(outcome);
            spent += scope.calls.reduce((a, k) => a + k.costUsd, 0);
            console.log(`${site.id} ${arm.id} r${run} ${group}/${c.id} ${outcome.pass ? 'PASS' : `FAIL (${outcome.failures.join('; ').slice(0, 140)})`} ${outcome.latencyMs}ms`);
            if (spent > options.maxCostUsd) {
              aborted = `spent $${spent.toFixed(4)} over --max-cost ${options.maxCostUsd}`;
              break outer;
            }
            if (options.gapMs > 0) await sleep(options.gapMs);
          }
        }
      }
    }
  } finally {
    await site.teardown?.();
  }

  // Judge pass: after every arm has run, so judging never delays or warms anything being measured.
  let judgeCalls = 0;
  let judgeCost = 0;
  let judgeRequestShown = false;
  if (site.judge) {
    const plan = site.judge;
    const pending = outcomes.filter((o) => !o.error && plan.wants(o, caseById.get(o.caseId)!));
    await mapLimit(pending, options.judgeConcurrency, async (o) => {
      const c = caseById.get(o.caseId)!;
      const prompt = plan.prompt(o, c);
      if (options.dry && !judgeRequestShown) {
        judgeRequestShown = true;
        console.log(`[dry] ${site.id} judge request: system ${plan.spec.rubric.length} chars, user ${prompt.length} chars`);
      }
      let verdict: Awaited<ReturnType<typeof judgeOnce>>;
      try {
        verdict = await judgeOnce(plan.spec, prompt, { dry: options.dry, canned: plan.canned });
      } catch (error) {
        // A judge failure must never lose the paid run: the case counts as an error and the run is still written.
        o.error = `judge: ${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
        o.pass = false;
        o.failures = [...o.failures, `judge failed: ${o.error}`];
        return;
      }
      judgeCalls += 1;
      judgeCost += verdict.costUsd;
      plan.apply(verdict.verdict, o, c);
    });
  }

  const summaries = options.arms.map((a) => summarizeArm(a.id, outcomes));
  const decision = decide(summaries, site.absoluteHard, { aborted });

  // Cache hygiene: within one (arm, run, group) every call should share the cached prefix, byte for byte.
  const prefixDrift: Array<{ arm: string; run: number; group: string; distinctPrefixes: number }> = [];
  for (const arm of options.arms) {
    for (let run = 1; run <= options.runs; run += 1) {
      for (const { group } of groups) {
        const hashes = new Set(
          outcomes.filter((o) => o.arm === arm.id && o.run === run && o.group === group).flatMap((o) => o.calls.map((k) => k.request.prefixHash)).filter((h): h is string => h !== null),
        );
        if (hashes.size > 1) prefixDrift.push({ arm: arm.id, run, group, distinctPrefixes: hashes.size });
      }
    }
  }

  const result = {
    site: site.id,
    title: site.title,
    date: started,
    mode: options.dry ? 'dry (no network, oracle replies, predicted cache numbers)' : 'live',
    command: `npx tsx ${process.argv.slice(1).join(' ')}`,
    gitSha: gitSha(),
    node: process.version,
    settings: {
      arms: options.arms.map((a) => a.id),
      runs: options.runs,
      cases: cases.length,
      casesOrder: groups.map((g) => ({ group: g.group, cases: g.cases.map((c) => c.id) })),
      cacheSalt: options.salt ? 'per (arm, run)' : 'off',
      maxCostUsd: options.maxCostUsd,
      gapMs: options.gapMs,
      aborted,
    },
    passRule: site.passRule,
    decisionRule: DECISION_RULE,
    absoluteHard: site.absoluteHard,
    summary: summaries,
    decision,
    prefixDrift,
    judge: { model: site.judge ? 'claude-opus-5-5 (high effort, clean)' : null, calls: judgeCalls, costUsd: Number(judgeCost.toFixed(5)) },
    totalCostUsd: Number((summaries.reduce((a, s) => a + s.cost.totalUsd, 0) + judgeCost).toFixed(5)),
    outcomes: outcomes.map((o) => ({ ...o, calls: o.calls.map(trimCall) })),
  };

  let file: string;
  if (options.dry) {
    const dir = join(tmpdir(), 'haiku-55-swap-dry', site.id);
    mkdirSync(dir, { recursive: true });
    file = join(dir, `dry-${nonce}.json`);
    writeFileSync(file, `${JSON.stringify(result, null, 2)}\n`);
    console.log(`[dry] would write ${wouldWrite.path} (run-${wouldWrite.n}); wrote the dry result to ${file}`);
  } else {
    file = writeRun(site.id, result);
    console.log(`wrote ${file}`);
  }
  printSummary(site.id, summaries, decision.winner, aborted, decision.undecidedReason);
  if (decision.winnerBelowBaseline) console.log(`  FLAG ${site.id}: the winner has more primary failures than gpt-oss; decide by hand.`);
  return { file, summaries, winner: decision.winner };
}

export function printSummary(site: string, summaries: ReturnType<typeof summarizeArm>[], winner: ArmId | null, aborted: string | null, undecidedReason: string | null = null): void {
  const f = (x: number | null, d = 0) => (x === null ? '-' : x.toFixed(d));
  console.log(`\n== ${site} ==${aborted ? `  ABORTED: ${aborted}` : ''}`);
  console.log('arm                 pass        hard                     p50/p95 call ms   $/call    hit%  warm%');
  for (const s of summaries) {
    const hard = Object.entries(s.hard).map(([k, v]) => `${k}:${v}`).join(',') || '0';
    console.log(
      `${s.arm.padEnd(19)} ${`${s.pass}/${s.n}`.padEnd(11)} ${hard.padEnd(24)} ${`${f(s.latencyMs.callP50)}/${f(s.latencyMs.callP95)}`.padEnd(17)} ${f(s.cost.perCallUsd, 5).padEnd(9)} ${f(s.cache.hitRate === null ? null : s.cache.hitRate * 100)}   ${f(s.cache.warmHitRate === null ? null : s.cache.warmHitRate * 100)}`,
    );
  }
  console.log(`decision (rule fixed before running): ${winner ?? `undecided${undecidedReason ? ` (${undecidedReason})` : ''}`}`);
}
