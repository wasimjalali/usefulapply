/**
 * Model-based randomized interleaving test for the browser/server sync
 * (src/lib/session-sync-engine.ts). Store level, no browser.
 *
 *   npm run test:sync                                   # 2000 seeds on the restructured engine, plus the deterministic cases
 *   npm run test:sync -- --seeds 500 --from 1000        # a different slice
 *   npm run test:sync -- --engine round2                # the review-round-2 engine, glue and server model (e2e/tools/legacy)
 *   npm run test:sync -- --engine legacy                # the round-1 module (e2e/tools/legacy), kept to show the test fails on it
 *   npm run test:sync -- --seed 42 --verbose            # one seed, with its operation log
 *   npm run test:sync -- --only edit,save,poll,agent,workflow   # only these operations, to isolate one bug
 *
 * With SYNC_FUZZ_MUTATION set (by `python3 e2e/tools/sync-fuzz/mutations.py --apply <name> -- <command>`) the engine
 * under test was broken on purpose; the name is printed and recorded in the --out file.
 *
 * It runs through tsx with e2e/tools/tsconfig.sync-fuzz.json, which maps the
 * server actions (@/lib/supabase) to a fake so the legacy module can be loaded.
 * Exit code 1 when any seed or case fails, 2 on a bad flag or a crash of the
 * harness itself (the message is always printed). Failing seeds are printed
 * and, with --out, written as JSON.
 */

import { writeFileSync } from 'node:fs';
import { CASES, runCase, type CaseResult } from './sync-fuzz/cases';
import { emptyStats, OP_NAMES, runSeed, type InvariantCode, type RunResult } from './sync-fuzz/driver';

const realError = console.error.bind(console);

interface Args {
  engine: 'new' | 'round2' | 'legacy';
  seeds: number;
  from: number;
  ops: number;
  seed?: number;
  verbose: boolean;
  out?: string;
  cases: boolean;
  only?: string[];
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const args: Args = { engine: 'new', seeds: 2000, from: 1, ops: 60, verbose: false, cases: true };
  const number = (flag: string, raw: string | undefined, min: number): number => {
    const value = Number(raw);
    if (raw === undefined || raw.trim() === '' || !Number.isInteger(value) || value < min) {
      throw new UsageError(`${flag} needs a whole number of at least ${min}, got "${raw ?? ''}"`);
    }
    return value;
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--engine') {
      const name = value();
      if (name !== 'new' && name !== 'round2' && name !== 'legacy') throw new UsageError(`--engine is new, round2 or legacy, got "${name ?? ''}"`);
      args.engine = name;
    }
    else if (flag === '--seeds') args.seeds = number(flag, value(), 1);
    else if (flag === '--from') args.from = number(flag, value(), 0);
    else if (flag === '--ops') args.ops = number(flag, value(), 1);
    else if (flag === '--seed') args.seed = number(flag, value(), 0);
    else if (flag === '--verbose') args.verbose = true;
    else if (flag === '--out') {
      const path = value();
      if (!path) throw new UsageError('--out needs a file path');
      args.out = path;
    }
    else if (flag === '--only') {
      const names = (value() ?? '').split(',').filter(Boolean);
      const unknown = names.filter((name) => !(OP_NAMES as readonly string[]).includes(name));
      if (names.length === 0 || unknown.length > 0) throw new UsageError(`--only takes a comma list of ${OP_NAMES.join(', ')}; unknown: ${unknown.join(', ') || '(none given)'}`);
      args.only = names;
    }
    else if (flag === '--no-cases') args.cases = false;
    else throw new UsageError(`unknown flag ${flag}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // The engines log every failed request they handle; with thousands of injected failures that is noise.
  if (!args.verbose) console.error = () => undefined;
  const started = Date.now();
  // Set by `mutations.py --apply`: the engine in src/ was broken on purpose for this run. Say so in the output and the --out file.
  const mutation = process.env.SYNC_FUZZ_MUTATION;
  if (mutation) console.log(`mutation: ${mutation}`);
  const caseResults: CaseResult[] = [];
  if (args.cases && args.seed === undefined) {
    for (const def of CASES) caseResults.push(await runCase(def, args.engine));
    console.log(`\nDeterministic cases (${args.engine} engine)`);
    for (const result of caseResults) {
      console.log(`${result.violations.length === 0 ? 'PASS' : 'FAIL'}  ${result.name}`);
      for (const violation of result.violations) console.log(`      ${violation.code}: ${violation.message}`);
    }
  }

  const from = args.seed ?? args.from;
  const count = args.seed === undefined ? args.seeds : 1;
  const failures: RunResult[] = [];
  const totals: Record<string, number> = {};
  for (let seed = from; seed < from + count; seed++) {
    let result: RunResult;
    try {
      result = await runSeed(seed, { engine: args.engine, ops: args.ops, verbose: args.verbose, only: args.only });
    } catch (error) {
      // A crash inside the harness or the engine is a failure of that seed, never a quiet exit.
      const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
      realError(`seed ${seed} crashed: ${message}`);
      result = { seed, violations: [{ code: 'ERR', message: `the run crashed: ${message.split('\n')[0]}` }], stats: emptyStats() };
    }
    for (const [key, value] of Object.entries(result.stats)) totals[key] = (totals[key] ?? 0) + value;
    if (result.violations.length > 0) failures.push(result);
    if (args.verbose || (count > 50 && (seed - from + 1) % 500 === 0)) {
      console.log(`  ${seed - from + 1}/${count} seeds, ${failures.length} failing`);
    }
  }

  const byCode: Partial<Record<InvariantCode, number>> = {};
  for (const failure of failures) {
    for (const code of new Set(failure.violations.map((violation) => violation.code))) byCode[code] = (byCode[code] ?? 0) + 1;
  }
  console.log(`\n${count} seeds (${from}..${from + count - 1}), ${args.ops} operations each, ${args.engine} engine, ${((Date.now() - started) / 1000).toFixed(1)}s`);
  console.log('totals', JSON.stringify(totals));
  // Group the messages by what they say, ignoring which application, field, token or tab they name.
  const kind = (message: string) => message
    .replace(/t:[A-Z0-9]+;/g, 'T').replace(/app-\d+/g, 'APP').replace(/\b[AB]('s)?\b/g, 'TAB')
    .replace(/\.(jobTitle|company|jobDescription|selectedTemplate|coverLetter|email|followUpEmail)\b/g, '.FIELD')
    .replace(/\b(job_title|company|job_description|selected_template|cover_letter|email_subject|email_body|email|follow_up_email)\b/g, 'COLUMN')
    .replace(/revision \d+/g, 'revision N').replace(/ from \d+ to \d+/g, '').replace(/"[a-z]+"/g, '"OUTCOME"').replace(/\(.*\)$/, '').replace(/at \d+/g, 'at N');
  const byKind: Record<string, number> = {};
  for (const failure of failures) {
    for (const message of new Set(failure.violations.map((violation) => `${violation.code}: ${kind(violation.message)}`))) {
      byKind[message] = (byKind[message] ?? 0) + 1;
    }
  }
  console.log(`failing seeds: ${failures.length}${failures.length ? `  by invariant ${JSON.stringify(byCode)}` : ''}`);
  if (failures.length) {
    console.log('seeds per kind of violation:');
    for (const [message, count] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) console.log(`  ${String(count).padStart(5)}  ${message}`);
  }
  for (const failure of failures.slice(0, 25)) {
    console.log(`  seed ${failure.seed}`);
    for (const violation of failure.violations.slice(0, 3)) console.log(`      ${violation.code}: ${violation.message}`);
  }
  if (failures.length > 25) console.log(`  ... and ${failures.length - 25} more`);
  if (failures.length) {
    const list = failures.map((failure) => failure.seed);
    console.log(`seed list: ${list.slice(0, 100).join(',')}${list.length > 100 ? `, ... (${list.length} in all, see --out)` : ''}`);
  }

  if (args.out) {
    writeFileSync(args.out, `${JSON.stringify({
      engine: args.engine, ...(mutation ? { mutation } : {}), from, count, ops: args.ops, totals, byInvariant: byCode, byKind,
      failingSeeds: failures.map((failure) => failure.seed),
      failures: failures.slice(0, 200).map((failure) => ({ seed: failure.seed, violations: failure.violations })),
      cases: caseResults,
    }, null, 2)}\n`);
  }
  const casesFailed = caseResults.some((result) => result.violations.length > 0);
  process.exit(failures.length > 0 || casesFailed ? 1 : 0);
}

main().catch((error) => {
  realError(error instanceof UsageError ? `sync-fuzz: ${error.message}` : error);
  process.exit(2);
});
