/**
 * Chat UX evals: German replies, reply length, the screening offer, unverified claims, and compaction in German.
 * 40 turns in 11 conversations through the real /api/chat route, its tools and a local D1. Haiku 5.5 at the shipped
 * chat effort (low) only. Cases: evals/chat-ux/fixtures/cases.ts. Site and graders: sites/chat-ux.ts, lib/checks.ts.
 * The lib is the 2026-10-22 harness's (evals/haiku-55-swap/lib), imported, not copied.
 *
 *   npx tsx evals/chat-ux/run.ts chat-ux --dry     No network, no key. Builds every request the route makes, answers with
 *                                                  each case's perfect script, runs the graders. Cases that need the
 *                                                  offer_screening_answers tool are reported "tool not registered,
 *                                                  skipped" on a build that lacks it.
 *   npx tsx evals/chat-ux/run.ts check             The harness and this site's self-tests, no model.
 *
 * BEFORE AND AFTER. The comparison is two runs of this harness on two commits, run in parallel by the orchestrator:
 * before = main, after = the feature branch. Each commit needs this folder (merge the eval commit into the "before"
 * worktree first; it only adds evals/chat-ux and small additions to evals/haiku-55-swap). In each worktree (own
 * checkout, own node_modules). The key comes from ANTHROPIC_API_KEY in the shell, or with --key-from-dev-vars from
 * the main checkout's secrets file, that one key only, in-process and never printed (approved by Wasim 2026-10-23):
 *
 *   cd <worktree: main + eval commit>  && npx tsx evals/chat-ux/run.ts chat-ux --allow-anthropic-api --key-from-dev-vars --runs 3
 *   cd <worktree: feature + eval commit> && npx tsx evals/chat-ux/run.ts chat-ux --allow-anthropic-api --key-from-dev-vars --runs 3
 *
 * Arms: haiku-low only (the default here; the shared harness would run all five arms otherwise). Other flags:
 * --runs N (default 3), --cases g01,g02 (a subset), --max-cost USD (stop after this much, default 5), --salt off
 * (share cache entries across runs, the steady state).
 *
 * Results: evals/results/2026-10-23-chat-ux/chat_ux/run-N.json in that worktree (never overwritten, gzipped over
 * 5 MB). The file records the git sha. Copy the two folders next to each other afterwards and name them before/after.
 *
 * COST. About $0.00036 per call at Haiku 5.5 low (2026-10-22 chat run). A turn is 1 to 3 calls (tool rounds), so the
 * 33 ordinary turns are about 33 x 1.6 x $0.00036 = $0.02 per run. The compaction turn sends about 80k input tokens
 * twice (the compaction, then the answer) at $0.10 per million, about $0.02. Total about $0.04 per run, $0.12 for
 * --runs 3 on one commit, about $0.25 for both commits. The cache is salted per (arm, run), so every run pays its own
 * cold start.
 */
import { parseCli } from '../haiku-55-swap/lib/core';
import { loadAnthropicKey } from '../haiku-55-swap/lib/key';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const cli = parseCli(argv);
  const target = (cli.positional[0] ?? '').replace(/-/g, '_');
  if (target !== 'chat_ux' && target !== 'check') throw new Error('usage: run.ts <chat-ux|check> [--dry] [--allow-anthropic-api] [--runs N] [--cases a,b] [--max-cost USD]');
  if (cli.has('key-from-dev-vars')) loadAnthropicKey();

  const { installHarness } = await import('../haiku-55-swap/lib/intercept');
  installHarness();
  const { optionsFromCli, runSite } = await import('../haiku-55-swap/lib/runner');
  const { chatUxSite } = await import('./sites/chat-ux');

  if (target === 'check') {
    const { harnessSelfTest, wireRoundTrip } = await import('../haiku-55-swap/lib/selftest');
    let bad = 0;
    const report = (name: string, problems: string[]) => {
      console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${name}`);
      for (const p of problems) console.log(`       - ${p}`);
      if (problems.length > 0) bad += 1;
    };
    report('harness (wire logic, prices, decision rule)', harnessSelfTest());
    report('wire recorder against a local Anthropic stand-in', await wireRoundTrip());
    report(`chat-ux (${chatUxSite.cases().length} cases)`, await chatUxSite.selfTest());
    if (bad > 0) process.exit(1);
    return;
  }

  // One arm unless the caller names others: Haiku 5.5 at the shipped chat effort.
  const rest = argv.filter((a, i) => !(i === 0 && a === cli.positional[0]));
  const withArms = cli.has('arms') ? rest : [...rest, '--arms', 'haiku-low'];
  await runSite(chatUxSite, optionsFromCli(parseCli(withArms), chatUxSite));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
