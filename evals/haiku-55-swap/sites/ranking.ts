/**
 * Site: feed ranking (src/lib/job-feed/, the shipped ranker: llm-ranking.ts after the swap, workers-ai-ranking.ts before it).
 *
 *   npx tsx evals/haiku-55-swap/run.ts ranking-labels --allow-anthropic-api      (optional, once: Opus labels, about $5)
 *   npx tsx evals/haiku-55-swap/run.ts ranking --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 3]
 *   npx tsx evals/haiku-55-swap/run.ts ranking --dry
 *
 * 12 sets: 6 fictional profiles x 2 lists of 40 postings (10 real public ads, 30 synthetic by recipe; see
 * fixtures/ranking.ts). Three runs. The ranker is called as the feed calls it: settings, career profile,
 * candidates, visible cap, years of experience, negative and excluded terms.
 *
 * Primary metric, fixed before running: a case passes when ALL of these hold:
 *   - the ranker returned a valid LLM ranking (status completed_llm, not the deterministic fallback)
 *   - zero hard-constraint violations in its top 10 (wrong country, work mode, employment type, pay
 *     below the floor, no sponsorship) - this one is also the site's absolute hard metric
 *   - the model's own list covered at least 60% of the candidates
 *   - NDCG@10 against the reference is at least 0.70 (gains 2^relevance - 1)
 *   - it surfaced no more than the visible cap
 * The reference is the Opus 5.5 labels in fixtures/ranking-labels.json when the file exists, otherwise
 * the relevance designed into the fixtures. NDCG against both is reported when labels exist.
 * Sequence: one group per profile, its two lists in order; the 16k system prompt is shared by all of them.
 */
import { writeFileSync, existsSync } from 'node:fs';
import { setCloudflareEnv, runBackend } from '../../lib/hooks';
import { judgeOnce, mapLimit } from '../lib/judge';
import { currentScope, type Oracle } from '../lib/intercept';
import { LABELS_FILE, RANKING_SETS, hardViolations, designedRelevance, loadLabels, ndcgAt, rankingInputs, referenceRelevance, type Labels, type RankingSet } from '../fixtures/ranking';
import { buildProfile, buildSettings } from '../fixtures/personas';
import { generationContext } from '../lib/util';
import type { Site } from '../lib/runner';

export const NDCG_FLOOR = 0.7;
export const COVERAGE_FLOOR = 0.6;

type Ranker = (params: Record<string, unknown>) => Promise<{ status: string; items: Array<{ canonicalJobId: string; rank: number; fitLabel: string }>; errorMessage: string | null }>;

async function loadRanker(): Promise<Ranker> {
  const specs = ['../../../src/lib/job-feed/llm-ranking', '../../../src/lib/job-feed/workers-ai-ranking'];
  for (const spec of specs) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(spec)) as Record<string, unknown>;
    } catch (error) {
      if (error instanceof Error && /Cannot find module|Could not resolve|ERR_MODULE_NOT_FOUND/.test(error.message) && error.message.includes(spec.split('/').pop() as string)) continue;
      throw error;
    }
    const names = Object.keys(mod).filter((k) => /^rankWith/.test(k) && typeof mod[k] === 'function');
    if (names.length !== 1) throw new Error(`${spec} exports ${names.length} rankWith* functions (${names.join(', ')}); the ranking site needs exactly one`);
    return mod[names[0]] as Ranker;
  }
  throw new Error(`no ranker module found (${specs.join(', ')})`);
}

let ranker: Ranker | null = null;

function oracleReply(set: RankingSet): string {
  const ref = referenceRelevance(set, null);
  const dupIds = new Set(set.jobs.filter((j) => j.dupOf).map((j) => j.id));
  const ordered = set.jobs.filter((j) => !dupIds.has(j.id) && ref[j.id] >= 2).sort((a, b) => ref[b.id] - ref[a.id]).slice(0, set.visibleCap);
  const surfaced = new Map(ordered.map((j, i) => [j.id, i + 1]));
  return JSON.stringify({
    items: set.jobs.map((j) => ({
      jobId: j.id,
      decision: surfaced.has(j.id) ? (ref[j.id] === 3 ? 'strong' : 'good') : 'skip',
      rank: surfaced.get(j.id) ?? null,
      reason: surfaced.has(j.id) ? 'Role and level fit the profile.' : 'Not a fit.',
      companyDisplay: null,
    })),
  });
}

export const rankingSite: Site<RankingSet> = {
  id: 'ranking',
  title: 'Feed ranking, 12 sets of 40 postings',
  command: 'npx tsx evals/haiku-55-swap/run.ts ranking --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 3,
  passRule:
    'A valid LLM ranking (not the fallback), zero hard-constraint violations in the top 10, coverage at least 60%, NDCG@10 at least 0.70, surfaced no more than the cap.',
  absoluteHard: ['hard_in_top10'],
  cases: () => RANKING_SETS,
  async setup() {
    setCloudflareEnv({ AI: { run: (_model: string, input: unknown) => runBackend('workers-ai-binding', input) } });
    ranker = await loadRanker();
  },
  selfTest() {
    const problems: string[] = [];
    if (RANKING_SETS.length !== 12) problems.push(`expected 12 sets, found ${RANKING_SETS.length}`);
    const labels = loadLabels();
    for (const set of RANKING_SETS) {
      if (set.jobs.length !== 40) problems.push(`${set.id}: ${set.jobs.length} jobs, need 40`);
      if (new Set(set.jobs.map((j) => j.id)).size !== set.jobs.length) problems.push(`${set.id}: duplicate job ids`);
      const ref = referenceRelevance(set, labels);
      const rel3 = set.jobs.filter((j) => ref[j.id] === 3).length;
      const hard = set.jobs.filter((j) => hardViolations(set.persona, j).length > 0).length;
      if (rel3 < 2) problems.push(`${set.id}: only ${rel3} top-relevance postings, need 2`);
      if (hard < 3) problems.push(`${set.id}: only ${hard} hard-constraint postings, need 3`);
      const ideal = [...set.jobs].sort((a, b) => ref[b.id] - ref[a.id]).map((j) => j.id);
      if (Math.abs(ndcgAt(10, ideal, ref) - 1) > 1e-9) problems.push(`${set.id}: NDCG of the ideal order is not 1`);
      const worst = [...set.jobs].sort((a, b) => ref[a.id] - ref[b.id]).map((j) => j.id);
      if (ndcgAt(10, worst, ref) > 0.5) problems.push(`${set.id}: NDCG of the worst order is above 0.5`);
      if (set.jobs.some((j) => /@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/i.test(j.description) && !j.source.startsWith('public:'))) problems.push(`${set.id}: a synthetic posting carries a non-example.com address`);
      for (const j of set.jobs) {
        if (labels?.[set.id] && labels[set.id][j.id] === undefined) problems.push(`${set.id}: label missing for ${j.id}`);
      }
    }
    return problems;
  },
  oracle: (set): Oracle => () => ({ text: oracleReply(set) }),
  async run(set) {
    if (!ranker) throw new Error('ranker not loaded');
    const labels = loadLabels();
    const ref = referenceRelevance(set, labels);
    const designed = referenceRelevance(set, null);
    const inputs = rankingInputs(set);
    const res = await ranker({ ...inputs, generationContext: generationContext('job_feed', 'job_feed_ranking') });

    const byId = new Map(set.jobs.map((j) => [j.id, j]));
    const surfaced = [...res.items].sort((a, b) => a.rank - b.rank);
    const ids = surfaced.map((i) => i.canonicalJobId);
    const top10 = ids.slice(0, 10);
    const hard = top10.flatMap((id) => hardViolations(set.persona, byId.get(id)!)).map(() => 'hard_in_top10');
    const dups = top10.filter((id) => byId.get(id)?.dupOf && top10.includes(byId.get(id)!.dupOf!)).length;

    // Coverage: how much of the candidate list the model's own JSON answered for.
    const scope = currentScope();
    const text = [...scope.calls].reverse().find((c) => c.response?.text)?.response?.text ?? '';
    let covered = 0;
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      const parsed = JSON.parse(text.slice(start, end + 1)) as { items?: Array<{ jobId?: string }> };
      covered = new Set((parsed.items ?? []).map((i) => i.jobId).filter((id): id is string => typeof id === 'string' && byId.has(id))).size;
    } catch {
      covered = 0;
    }
    const coverage = covered / set.jobs.length;
    const ndcg = ndcgAt(10, ids, ref);

    const failures: string[] = [];
    if (res.status !== 'completed_llm') failures.push(`status ${res.status}${res.errorMessage ? `: ${res.errorMessage.slice(0, 120)}` : ''}`);
    if (hard.length > 0) failures.push(`${hard.length} hard-constraint violation(s) in the top 10`);
    if (coverage < COVERAGE_FLOOR) failures.push(`coverage ${(coverage * 100).toFixed(0)}% under ${COVERAGE_FLOOR * 100}%`);
    if (ndcg < NDCG_FLOOR) failures.push(`NDCG@10 ${ndcg.toFixed(2)} under ${NDCG_FLOOR}`);
    if (surfaced.length > set.visibleCap) failures.push(`surfaced ${surfaced.length}, cap ${set.visibleCap}`);

    return {
      output: {
        status: res.status,
        surfaced: surfaced.map((i) => ({ id: i.canonicalJobId, rank: i.rank, fit: i.fitLabel, rel: ref[i.canonicalJobId], slot: byId.get(i.canonicalJobId)?.slot, hard: hardViolations(set.persona, byId.get(i.canonicalJobId)!) })),
        coverage,
        referenceFrom: labels ? 'opus labels' : 'designed relevance',
      },
      pass: failures.length === 0,
      failures,
      hard,
      metrics: { ndcg10: ndcg, ...(labels ? { ndcg10Designed: ndcgAt(10, ids, designed) } : {}), coverage, duplicatesTop10: dups, surfaced: surfaced.length, top10Hard: hard.length },
    };
  },
};

// ---------------------------------------------------------------------------
// Opus labels (optional, one paid call per set)
// ---------------------------------------------------------------------------

const LABEL_RUBRIC = `You label job postings for one job seeker, to build a ranking reference. You get the seeker's inferred profile, their feed settings, and a list of postings.

Give each posting a relevance from 0 to 3:
3 = apply today: the role matches what they target, the level fits, their skills cover most of the requirements, and every constraint they set is met
2 = good with a minor gap: a clearly adjacent role or a small skills or level gap, constraints met
1 = a stretch: weak match on role, level or skills, but not excluded by a constraint
0 = not suitable: a different domain or role, a level two or more steps away, or it breaks a constraint the seeker set (country or region they do not target, work mode they excluded, an employment type they did not list, stated pay under their minimum, no visa sponsorship when they need it)

Judge from the posting text and the stated fields, not the title alone. Two postings that are the same job cross-posted by one company: give the better-sourced one its relevance and the copy 0. Return one entry per posting with its jobId.`;

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    labels: { type: 'array', items: { type: 'object', properties: { jobId: { type: 'string' }, relevance: { type: 'integer', minimum: 0, maximum: 3 }, reason: { type: 'string' } }, required: ['jobId', 'relevance', 'reason'], additionalProperties: false } },
  },
  required: ['labels'],
  additionalProperties: false,
};

export async function writeRankingLabels(dry: boolean, allowed: boolean): Promise<void> {
  if (!dry && !allowed) throw new Error('ranking-labels spends money on Opus 5.5 (about $5). Pass --allow-anthropic-api, or --dry.');
  if (existsSync(LABELS_FILE) && !dry) throw new Error(`${LABELS_FILE} exists. Labels are a fixture: delete it on purpose to relabel, never overwrite.`);
  const spec = { name: 'ranking-labels', rubric: LABEL_RUBRIC, schema: LABEL_SCHEMA };
  let cost = 0;
  const labels: Labels = {};
  await mapLimit(RANKING_SETS, 3, async (set) => {
    const prompt = [
      `<profile>\n${JSON.stringify(buildProfile(set.persona), null, 2)}\n</profile>`,
      `<settings>\n${JSON.stringify(buildSettings(set.persona), null, 2)}\n</settings>`,
      `<postings>\n${JSON.stringify(set.jobs.map((j) => ({ jobId: j.id, title: j.title, company: j.company, location: j.location, workMode: j.workMode, employmentType: j.employmentType, salary: j.salaryText, description: j.description.slice(0, 2500) })), null, 1)}\n</postings>`,
    ].join('\n\n');
    const canned = { labels: set.jobs.map((j) => ({ jobId: j.id, relevance: designedRelevance(set.persona, j), reason: 'dry run' })) };
    const out = await judgeOnce<{ labels: Array<{ jobId: string; relevance: number }> }>(spec, prompt, { dry, canned });
    cost += out.costUsd;
    const map: Record<string, number> = {};
    for (const l of out.verdict.labels) map[l.jobId] = l.relevance;
    const missing = set.jobs.filter((j) => map[j.id] === undefined);
    if (missing.length > 0) throw new Error(`${set.id}: judge skipped ${missing.length} postings`);
    labels[set.id] = map;
    console.log(`${set.id}: ${set.jobs.length} labelled (${dry ? 'dry' : `$${out.costUsd.toFixed(3)}`}), prompt ${prompt.length} chars`);
  });
  if (dry) {
    console.log(`[dry] would write ${LABELS_FILE} with ${Object.keys(labels).length} sets`);
    return;
  }
  writeFileSync(LABELS_FILE, `${JSON.stringify(labels, null, 1)}\n`, { flag: 'wx' });
  console.log(`wrote ${LABELS_FILE}, judge cost $${cost.toFixed(3)}. Commit it with the run that used it.`);
}
