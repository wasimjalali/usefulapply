/**
 * Model-based randomized interleaving test for the browser/server sync
 * (src/lib/session-sync-engine.ts). Store level, no browser.
 *
 *   npm run test:sync                                   # 2000 seeds on the restructured engine, plus the deterministic cases
 *   npm run test:sync -- --seeds 500 --from 1000        # a different slice
 *   npm run test:sync -- --engine legacy                # the round-1 module (e2e/tools/legacy), kept to show the test fails on it
 *   npm run test:sync -- --seed 42 --verbose            # one seed, with its operation log
 *
 * It runs through tsx with e2e/tools/tsconfig.sync-fuzz.json, which maps the
 * server actions (@/lib/supabase) to a fake so the legacy module can be loaded.
 * Exit code 1 when any seed or case fails. Failing seeds are printed and, with
 * --out, written as JSON.
 */

import { writeFileSync } from 'node:fs';
import { CASES, runCase, type CaseResult } from './sync-fuzz/cases';
import { runSeed, type InvariantCode, type RunResult } from './sync-fuzz/driver';

interface Args {
  engine: 'new' | 'legacy';
  seeds: number;
  from: number;
  ops: number;
  seed?: number;
  verbose: boolean;
  out?: string;
  cases: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { engine: 'new', seeds: 2000, from: 1, ops: 60, verbose: false, cases: true };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i];
    if (flag === '--engine') args.engine = value() === 'legacy' ? 'legacy' : 'new';
    else if (flag === '--seeds') args.seeds = Number(value());
    else if (flag === '--from') args.from = Number(value());
    else if (flag === '--ops') args.ops = Number(value());
    else if (flag === '--seed') args.seed = Number(value());
    else if (flag === '--verbose') args.verbose = true;
    else if (flag === '--out') args.out = value();
    else if (flag === '--no-cases') args.cases = false;
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  // The engines log every failed request they handle; with thousands of injected failures that is noise.
  if (!args.verbose) console.error = () => undefined;
  const started = Date.now();
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
    const result = await runSeed(seed, { engine: args.engine, ops: args.ops, verbose: args.verbose });
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
      engine: args.engine, from, count, ops: args.ops, totals, byInvariant: byCode, byKind,
      failingSeeds: failures.map((failure) => failure.seed),
      failures: failures.slice(0, 200).map((failure) => ({ seed: failure.seed, violations: failure.violations })),
      cases: caseResults,
    }, null, 2)}\n`);
  }
  const casesFailed = caseResults.some((result) => result.violations.length > 0);
  process.exit(failures.length > 0 || casesFailed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
