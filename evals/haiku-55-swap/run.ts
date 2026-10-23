/**
 * Haiku 5.5 swap evals. One command per site, one for all.
 *
 *   npx tsx evals/haiku-55-swap/run.ts <site|all|check> [flags]
 *
 *   sites: language, tracker, screening, search-strategy, career-profile, ranking, chat
 *
 *   Paid arms (the orchestrator runs these, after W1-W4 are merged; ANTHROPIC_API_KEY must be exported,
 *   the harness never reads env files):
 *     npx wrangler dev -c evals/haiku-55-swap/wrangler.jsonc --port 8799        # the gpt-oss baseline's Workers AI proxy
 *     npx tsx evals/haiku-55-swap/run.ts language        --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts tracker         --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts screening       --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts search-strategy --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts career-profile  --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts ranking         --allow-anthropic-api --gptoss-url http://localhost:8799
 *     npx tsx evals/haiku-55-swap/run.ts chat            --allow-anthropic-api --gptoss-url http://localhost:8799   (needs the local D1, see sites/chat.ts)
 *     npx tsx evals/haiku-55-swap/run.ts all             --allow-anthropic-api --gptoss-url http://localhost:8799
 *   Optional, once before the ranking run: npx tsx evals/haiku-55-swap/run.ts ranking-labels --allow-anthropic-api
 *
 *   No network: add --dry to any site (builds every request the shipped code makes, answers with the
 *   case oracles, runs the graders, predicts cache behaviour, checks the output path), or run `check`
 *   (fixtures, graders, wire logic, decision rule; no model at all).
 *
 *   Key: export ANTHROPIC_API_KEY, or pass --key-from-dev-vars (reads only that key from the main checkout's .dev.vars).
 *   Flags: --arms haiku-low,haiku-high,gptoss   --runs N   --cases id,id   --limit N   --salt on|off
 *          --max-cost USD (default 5, per site)   --gap-ms N   --judge-concurrency N
 *   Results: evals/results/2026-10-22-haiku-55-swap/<site>/run-N.json (never overwritten; gzipped over 5 MB).
 *   The decision rule is in lib/core.ts (DECISION_RULE) and is printed into every result file.
 */
import { spawnSync } from 'node:child_process';
import { parseCli, SITE_IDS } from './lib/core';
import { loadAnthropicKey } from './lib/key';

import type { Site, SiteCase } from './lib/runner';

type AnySite = Site<SiteCase>;
type SiteLoader = () => Promise<{ site: AnySite }>;

/** Loaded after the harness hooks are installed, because the sites import src modules. */
const LOADERS: Record<string, SiteLoader> = {
  language: async () => ({ site: ((await import('./sites/language')).languageSite as unknown as AnySite) }),
  tracker: async () => ({ site: ((await import('./sites/tracker')).trackerSite as unknown as AnySite) }),
  screening: async () => ({ site: ((await import('./sites/screening')).screeningSite as unknown as AnySite) }),
  search_strategy: async () => ({ site: ((await import('./sites/search-strategy')).searchStrategySite as unknown as AnySite) }),
  career_profile: async () => ({ site: ((await import('./sites/career-profile')).careerProfileSite as unknown as AnySite) }),
  ranking: async () => ({ site: ((await import('./sites/ranking')).rankingSite as unknown as AnySite) }),
  chat: async () => ({ site: ((await import('./sites/chat')).chatSite as unknown as AnySite) }),
};
const ORDER = ['language', 'tracker', 'screening', 'search_strategy', 'career_profile', 'ranking', 'chat'];

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  if (cli.has('key-from-dev-vars')) loadAnthropicKey();
  const target = (cli.positional[0] ?? '').replace(/-/g, '_');
  if (!target) throw new Error('usage: run.ts <language|tracker|screening|search-strategy|career-profile|ranking|chat|all|check|ranking-labels> [flags]');

  const { installHarness } = await import('./lib/intercept');
  installHarness();
  const { optionsFromCli, runSite } = await import('./lib/runner');

  if (target === 'ranking_labels') {
    const { writeRankingLabels } = await import('./sites/ranking');
    await writeRankingLabels(cli.has('dry'), cli.has('allow-anthropic-api'));
    return;
  }

  if (target === 'check') {
    const { harnessSelfTest, wireRoundTrip } = await import('./lib/selftest');
    let bad = 0;
    const report = (name: string, problems: string[]) => {
      console.log(`${problems.length === 0 ? 'ok  ' : 'FAIL'} ${name}`);
      for (const p of problems) console.log(`       - ${p}`);
      if (problems.length > 0) bad += 1;
    };
    report('harness (wire logic, prices, decision rule)', harnessSelfTest());
    report('wire recorder against a local Anthropic stand-in', await wireRoundTrip());
    for (const id of ORDER) {
      const { site } = await LOADERS[id]();
      report(`${id} (${site.cases().length} cases)`, await site.selfTest());
    }
    if (bad > 0) process.exit(1);
    return;
  }

  if (target === 'all') {
    // One process per site: stubs, the frozen clock, module caches and the eval database never leak between sites.
    const rest = process.argv.slice(3);
    const failures: string[] = [];
    for (const id of ORDER) {
      console.log(`\n######## ${id}`);
      const child = spawnSync('npx', ['tsx', __filename, id.replace(/_/g, '-'), ...rest], { stdio: 'inherit' });
      if (child.status !== 0) failures.push(id);
    }
    if (failures.length > 0) {
      console.error(`\nFailed sites: ${failures.join(', ')}`);
      process.exit(1);
    }
    return;
  }

  if (!(SITE_IDS as readonly string[]).includes(target)) throw new Error(`unknown site "${target}"`);
  if (target === 'chat_ux') throw new Error('chat-ux has its own runner: npx tsx evals/chat-ux/run.ts chat-ux [flags]');
  const { site } = await LOADERS[target]();
  await runSite(site, optionsFromCli(cli, site));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
