/**
 * Sonnet 4.6 vs Sonnet 5.5 eval runner. See evals/README.md.
 *
 *   npx tsx evals/run-eval.ts --arm sonnet46-api --allow-anthropic-api --out evals/results/2026-10-07-sonnet-eval
 *   npx tsx evals/run-eval.ts --arm sonnet55-low --allow-anthropic-api --inputs-from sonnet46-api --out <same dir>
 *   add --dry-run to build every request without any network call (no flag or key needed)
 *
 * Resumable (a finished case+rep is skipped), JSONL append, bounded concurrency.
 * Calls on owner cases are written under evals/private/ instead of --out.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ARMS } from './lib/arms';
import { bedrockAuthMode, loadEnv, setDryRun } from './lib/client';
import { loadCases, resolveCase } from './lib/cases';
import { installHooks, loadedPromptFiles } from './lib/hooks';
import * as shim from './lib/models-shim';
import type { CallRecord } from './lib/types';
import type { KitIntermediates } from './lib/pipeline';

const ROOT = path.resolve(__dirname, '..');

/** The 10 cases that get 3 repetitions for latency. */
export const LATENCY_CASES = ['own-01', 'own-06', 'own-11', 'own-13', 'syn-01', 'syn-04', 'syn-07', 'syn-10', 'syn-14', 'syn-15'];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const armName = arg('arm');
  if (!armName || !(armName in ARMS)) throw new Error(`--arm must be one of: ${Object.keys(ARMS).join(', ')}`);
  const arm = { ...ARMS[armName] };
  const dryRun = flag('dry-run');
  if (!dryRun && arm.requiresFlag && !process.argv.includes(arm.requiresFlag)) {
    throw new Error(`Arm ${armName} calls the paid Anthropic API and refuses to run without ${arm.requiresFlag} (or --dry-run to only build requests).`);
  }
  const inputsFrom = arg('inputs-from');
  if (inputsFrom && !(inputsFrom in ARMS)) throw new Error(`--inputs-from must be one of: ${Object.keys(ARMS).join(', ')}`);
  if (inputsFrom === armName) throw new Error('--inputs-from must name a different arm');
  const variant = arg('prompt-variant');
  if (variant) arm.promptVariant = variant;
  if (arm.promptVariant !== 'production' && !fs.existsSync(path.join(ROOT, 'evals', 'prompt-variants', arm.promptVariant))) {
    throw new Error(`Prompt variant folder evals/prompt-variants/${arm.promptVariant} does not exist`);
  }

  const casesFile = path.resolve(arg('cases') ?? path.join(ROOT, 'evals', 'dataset', 'cases.jsonl'));
  const outBase = path.resolve(arg('out') ?? path.join(ROOT, 'evals', 'results', '2026-10-07-sonnet-eval'));
  const concurrency = Number(arg('concurrency') ?? 4);
  const reps = (arg('reps') ?? '1').split(',').map(Number);
  const only = arg('only')?.split(',');
  const latencySet = flag('latency-set');

  loadEnv();
  setDryRun(dryRun);
  if (arm.provider === 'anthropic' && !dryRun && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (checked the environment, .env.local and .dev.vars)');
  if (arm.provider === 'bedrock' && !dryRun) {
    const mode = bedrockAuthMode();
    if (mode === 'none') throw new Error('No Bedrock credentials found in the environment or .env.local');
    console.log(`bedrock auth: ${mode}, region: ${process.env.AWS_REGION || 'us-east-1'}, model: ${arm.modelId}`);
  }

  installHooks(arm.promptVariant, shim);

  // Fixed-inputs runs get their own folder so they never mix with the end-to-end chain of the same arm.
  // --tag separates an extra variant of the same arm (e.g. 4.6 on the sonnet55 prompts) from its main folder.
  const tag = arg('tag');
  const baseName = tag ? `${arm.name}__${tag}` : arm.name;
  const dirName = inputsFrom ? `${baseName}__on-${inputsFrom}` : baseName;
  const publicDir = path.join(outBase, dirName);
  const privateDir = path.join(ROOT, 'evals', 'private', 'results', path.basename(outBase), dirName);
  const inputDirs = (origin: string) => path.join(origin === 'owner' ? path.join(ROOT, 'evals', 'private', 'results', path.basename(outBase)) : outBase, inputsFrom ?? '', 'intermediates');
  for (const d of [publicDir, privateDir]) fs.mkdirSync(path.join(d, 'intermediates'), { recursive: true });
  const dirFor = (origin: string) => (origin === 'owner' ? privateDir : publicDir);

  const rows = loadCases(casesFile).filter((c) => (only ? only.includes(c.id) : latencySet ? LATENCY_CASES.includes(c.id) : true));

  // Resume: skip case+rep combinations that already have a kit row.
  const done = new Set<string>();
  for (const dir of [publicDir, privateDir]) {
    const f = path.join(dir, 'kits.jsonl');
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      const k = JSON.parse(line) as { case_id: string; rep: number };
      done.add(`${k.case_id}|${k.rep}`);
    }
  }

  const jobs = rows.flatMap((c) => reps.map((rep) => ({ c, rep }))).filter((j) => !done.has(`${j.c.id}|${j.rep}`));
  console.log(`arm ${dirName}${dryRun ? ' (DRY RUN, no network)' : ''}: ${jobs.length} kits to run (${done.size} already done), concurrency ${concurrency}, prompt variant ${arm.promptVariant}`);

  const runId = crypto.randomUUID();
  const { runKit } = await import('./lib/pipeline');
  let next = 0;
  let finished = 0;
  const started = Date.now();

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= jobs.length) return;
      const { c: row, rep } = jobs[i];
      const resolved = resolveCase(row);
      const dir = dirFor(row.origin);
      const callsFile = path.join(dir, 'calls.jsonl');
      const ctx: shim.CallContext = {
        runId,
        caseId: row.id,
        rep,
        arm,
        concurrency,
        seq: { n: 0 },
        lastRaw: new Map(),
        record: (r: CallRecord) => fs.appendFileSync(callsFile, JSON.stringify(r) + '\n'),
      };
      const t0 = Date.now();
      try {
        let fixed: KitIntermediates | undefined;
        if (inputsFrom) {
          const f = path.join(inputDirs(row.origin), `${row.id}.rep${rep}.json`);
          if (!fs.existsSync(f)) throw new Error(`no ${inputsFrom} intermediates at ${path.relative(ROOT, f)}; run that arm first`);
          fixed = JSON.parse(fs.readFileSync(f, 'utf8')) as KitIntermediates;
          if (!fixed.applicant || !fixed.job) throw new Error(`${inputsFrom} intermediates for ${row.id} rep${rep} have no applicant or job (its kit aborted)`);
        }
        const { kit, intermediates } = await runKit(resolved, ctx, fixed);
        fs.writeFileSync(path.join(dir, 'intermediates', `${row.id}.rep${rep}.json`), JSON.stringify(intermediates, null, 1));
        fs.appendFileSync(path.join(dir, 'kits.jsonl'), JSON.stringify(kit) + '\n');
        finished++;
        console.log(`[${finished}/${jobs.length}] ${row.id} rep${rep} ${kit.status} ${((Date.now() - t0) / 1000).toFixed(0)}s calls=${kit.calls}${kit.failures.length ? ' failures=' + kit.failures.map((f) => f.step).join(',') : ''}`);
      } catch (error) {
        // Not marked done, so a rerun retries this kit. Its partial calls stay in calls.jsonl under this run_id.
        console.error(`KIT CRASH ${row.id} rep${rep}:`, (error as Error).message);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(jobs.length, 1)) }, worker));
  if (dryRun) printBuiltRequests(publicDir, privateDir);
  if (loadedPromptFiles.length) console.log('prompt variant files used:', loadedPromptFiles.join(', '));
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

/** Dry run: print the first built request body per task (long text truncated, no secrets exist in it). */
function printBuiltRequests(...dirs: string[]) {
  const seen = new Set<string>();
  for (const d of dirs) {
    const f = path.join(d, 'calls.jsonl');
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line) as CallRecord;
      if (seen.has(r.task)) continue;
      seen.add(r.task);
      const trunc = (v: unknown): unknown => (typeof v === 'string' ? (v.length > 160 ? `${v.slice(0, 160)}... [${v.length} chars]` : v) : Array.isArray(v) ? v.map(trunc) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trunc(x)])) : v);
      console.log(`--- built request, task ${r.task}`);
      console.log(JSON.stringify(trunc(r.request.body), null, 1));
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
