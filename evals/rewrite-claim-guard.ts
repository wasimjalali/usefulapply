/**
 * Section-rewrite claim guard eval (2026-10-21).
 *
 * Question: does the part-of-speech claim guard stop refusing ordinary
 * rewrites (false refusals) without letting fabricated tools, employers,
 * titles, credentials, degrees, ownership, scope, proficiency or domain claims
 * through (misses)? Baseline: introducedClaims() as shipped in PR #165,
 * frozen in evals/rewrite-claim-guard/baseline-guard.ts.
 *
 *   # paid: kits plus at most 60 section rewrites on the production request shape
 *   npx tsx evals/rewrite-claim-guard.ts generate --allow-anthropic-api --out <dir> [--cases syn-01,...] [--max N]
 *   # free: scores both guards on the stored rewrites, plus the injected misses
 *   npx tsx evals/rewrite-claim-guard.ts score --in <dir>
 *
 * generate: for six constructed CVs (4 EN, 2 DE, evals/dataset/cvs), the real
 * analysis calls and generateOptimizedCVData() write a tailored CV against a
 * public ad, then the real unifiedWriterAgent.rewriteCVSection() rewrites its
 * summary and two roles' bullets under ten instructions per CV. Calls go
 * through the eval model shim (Sonnet 5.5, adaptive thinking, effort low), so
 * nothing reaches the production ledger. The raw section JSON is kept.
 *
 * score: runs both guards on every stored rewrite. Each flagged term is
 * labelled by hand in rewrite-claim-guard/labels.json (claim, strict or
 * ordinary, see Label), so a refusal counts as false only when every term it
 * names is ordinary. Then every rewrite gets one fabricated claim of each of nine
 * kinds injected, and a miss is an injection whose claim words the guard
 * does not flag.
 *
 * Credentials: loads .env.local / .dev.vars from the cwd or the main checkout (never printed).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ARMS } from './lib/arms';
import { loadCases, resolveCase } from './lib/cases';
import { installHooks } from './lib/hooks';
import * as shim from './lib/models-shim';
import { costUsd } from './lib/pricing';
import type { CallRecord } from './lib/types';
import type { MasterContext } from '../src/lib/agents/types';
import type { ResolvedCVSection } from '../src/lib/agents/prompts/cv-prompt';

const ROOT = path.resolve(__dirname, '..');
const MAX_REWRITES = 60;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function loadEnv(): void {
  const mainCheckout = path.resolve(ROOT, '..', '..', '..');
  for (const file of [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.dev.vars'),
    path.join(mainCheckout, '.env.local'),
    path.join(mainCheckout, '.dev.vars'),
  ]) {
    try {
      process.loadEnvFile(file);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn(`env file ${path.basename(file)} not loaded: ${code ?? 'unknown error'}`);
    }
  }
}

// -----------------------------------------------------
// The plan: CVs, sections, instructions
// -----------------------------------------------------

/** One public-ad case per constructed CV (the first synthetic case that uses it). */
const CASE_IDS = ['syn-01', 'syn-04', 'syn-08', 'syn-11', 'syn-15', 'syn-16'];

type Slot = 'summary' | 'role1' | 'role2';
const INSTRUCTIONS: Record<'en' | 'de', Array<{ slot: Slot; instruction: string | null }>> = {
  en: [
    { slot: 'summary', instruction: null },
    { slot: 'summary', instruction: 'Make it two sentences and lead with the most relevant experience.' },
    { slot: 'summary', instruction: 'Make it sharper and more results-focused.' },
    { slot: 'summary', instruction: 'Tailor it more to this job and highlight the skills they ask for.' },
    { slot: 'role1', instruction: null },
    { slot: 'role1', instruction: 'Make these punchier and start each with a strong verb.' },
    { slot: 'role1', instruction: 'Emphasise the impact and the tools I used.' },
    { slot: 'role2', instruction: 'Shorten to three bullets.' },
    { slot: 'role2', instruction: 'Make it sound more senior and mention that I led the team.' },
    { slot: 'role2', instruction: 'Rewrite in a more confident tone.' },
  ],
  de: [
    { slot: 'summary', instruction: null },
    { slot: 'summary', instruction: 'Mach es zwei Sätze und stell die relevanteste Erfahrung an den Anfang.' },
    { slot: 'summary', instruction: 'Formuliere es prägnanter und ergebnisorientierter.' },
    { slot: 'summary', instruction: 'Passe es stärker an die Stelle an und betone die gefragten Fähigkeiten.' },
    { slot: 'role1', instruction: null },
    { slot: 'role1', instruction: 'Mach die Punkte knackiger und beginne jeden mit einem starken Verb.' },
    { slot: 'role1', instruction: 'Betone die Wirkung und die Tools, die ich genutzt habe.' },
    { slot: 'role2', instruction: 'Kürze auf drei Punkte.' },
    { slot: 'role2', instruction: 'Lass es erfahrener klingen und erwähne, dass ich das Team geleitet habe.' },
    { slot: 'role2', instruction: 'Formuliere es selbstbewusster.' },
  ],
};

interface KitRecord {
  case_id: string;
  language: 'en' | 'de';
  cv_ref: string;
  rawCV: string;
  masterCV: string | null;
  verifiedMetrics: string[];
  job: MasterContext['job'] | null;
  match: MasterContext['match'] | null;
  applicant: MasterContext['applicant'] | null;
  optimizedCVData: MasterContext['optimizedCVData'] | null;
  error: string | null;
}

interface RewriteRecord {
  id: string;
  case_id: string;
  language: 'en' | 'de';
  slot: Slot;
  section: ResolvedCVSection;
  instruction: string | null;
  raw_output: string | null;
  content: string | string[] | null;
  production_status: string | null;
  production_reason: string | null;
  production_terms: string[];
  omitted: string[];
  error: string | null;
}

// -----------------------------------------------------
// generate (paid)
// -----------------------------------------------------

async function generate(): Promise<void> {
  if (!process.argv.includes('--allow-anthropic-api')) throw new Error('generate calls the paid API: pass --allow-anthropic-api');
  const out = arg('out');
  if (!out) throw new Error('--out <dir> is required');
  const OUT = path.resolve(ROOT, out);
  if (fs.existsSync(path.join(OUT, 'rewrites.jsonl'))) throw new Error(`${out} already holds a run; pick a new folder`);
  fs.mkdirSync(OUT, { recursive: true });

  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (checked the environment, .env.local and .dev.vars)');

  const arm = { ...ARMS['sonnet55-low'] };
  installHooks(arm.promptVariant, shim);
  const { unifiedWriterAgent, resolveCVSectionTarget, parseSectionResponse } = await import('../src/lib/agents/unified-writer-agent');

  const caseIds = arg('cases')?.split(',') ?? CASE_IDS;
  const maxRewrites = Math.min(MAX_REWRITES, Number(arg('max') ?? MAX_REWRITES));
  const rows = loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')).filter((row) => caseIds.includes(row.id));
  if (rows.length !== caseIds.length) throw new Error('A case id is missing from the dataset');

  const runId = crypto.randomUUID();
  const callsFile = path.join(OUT, 'calls.jsonl');
  const calls: CallRecord[] = [];
  const makeCtx = (caseId: string): shim.CallContext => ({
    runId,
    caseId,
    rep: 1,
    arm,
    concurrency: 4,
    seq: { n: 0 },
    lastRaw: new Map(),
    record: (r: CallRecord) => {
      calls.push(r);
      // The request body repeats the CV and the ad on every call; both are in the repo.
      fs.appendFileSync(callsFile, JSON.stringify({ ...r, request: { ...r.request, body: undefined } }) + '\n');
    },
  });

  // Kits, one per CV, in parallel.
  const kits = await Promise.all(rows.map(async (row): Promise<KitRecord> => {
    const c = resolveCase(row);
    const language = c.language as 'en' | 'de';
    const context: MasterContext = {
      sessionId: `eval-${c.id}`,
      jobDescription: c.jdText,
      rawCV: c.cvText,
      masterCV: c.masterCvText ?? undefined,
      detectedLanguage: language,
    };
    const kit: KitRecord = {
      case_id: c.id, language, cv_ref: c.cv_ref, rawCV: c.cvText, masterCV: c.masterCvText,
      verifiedMetrics: [], job: null, match: null, applicant: null, optimizedCVData: null, error: null,
    };
    await shim.callContext.run(makeCtx(c.id), async () => {
      try {
        const [applicant, job, metrics] = await Promise.all([
          unifiedWriterAgent.extractApplicantProfile(context.rawCV, context.masterCV),
          unifiedWriterAgent.parseJobDescription(context.jobDescription),
          unifiedWriterAgent.extractVerifiedMetrics(context.rawCV, context.masterCV),
        ]);
        context.applicant = applicant.result;
        context.job = job.result;
        context.verifiedMetrics = metrics.result;
        context.match = (await unifiedWriterAgent.computeSkillMatch(context.applicant, context.job, context.rawCV, context.masterCV)).result;
        const cv = await unifiedWriterAgent.generateOptimizedCVData(context);
        Object.assign(kit, {
          applicant: context.applicant, job: context.job, match: context.match,
          verifiedMetrics: context.verifiedMetrics, optimizedCVData: cv.cvData,
        });
      } catch (error) {
        kit.error = (error as Error).message;
      }
    });
    console.log(`kit ${c.id}: ${kit.error ? `FAILED ${kit.error}` : 'ok'}`);
    return kit;
  }));
  fs.writeFileSync(path.join(OUT, 'kits.json'), JSON.stringify(kits, null, 2));

  // The rewrite plan, capped.
  const plan: Array<{ kit: KitRecord; slot: Slot; instruction: string | null; section: ResolvedCVSection }> = [];
  for (const kit of kits) {
    if (!kit.optimizedCVData) continue;
    const roles = (kit.optimizedCVData.experience || []).filter((e) => (e.bullets || []).some((b) => b.trim()));
    for (const { slot, instruction } of INSTRUCTIONS[kit.language]) {
      const target = slot === 'summary'
        ? { kind: 'summary' }
        : { kind: 'experience_bullets', id: (roles[slot === 'role2' && roles.length > 1 ? 1 : 0])?.id };
      const section = resolveCVSectionTarget(kit.optimizedCVData, target);
      if (section) plan.push({ kit, slot, instruction, section });
    }
  }
  if (plan.length > maxRewrites) plan.length = maxRewrites;
  console.log(`rewrites planned: ${plan.length}`);

  const rewritesFile = path.join(OUT, 'rewrites.jsonl');
  let next = 0;
  async function worker(): Promise<void> {
    while (next < plan.length) {
      const index = next++;
      const { kit, slot, instruction, section } = plan[index];
      const id = `${kit.case_id}-${String(index).padStart(2, '0')}`;
      const record: RewriteRecord = {
        id, case_id: kit.case_id, language: kit.language, slot, section, instruction,
        raw_output: null, content: null, production_status: null, production_reason: null,
        production_terms: [], omitted: [], error: null,
      };
      const context: MasterContext = {
        sessionId: `eval-${kit.case_id}`,
        jobDescription: '',
        rawCV: kit.rawCV,
        masterCV: kit.masterCV ?? undefined,
        detectedLanguage: kit.language,
        applicant: kit.applicant ?? undefined,
        job: kit.job ?? undefined,
        match: kit.match ?? undefined,
        verifiedMetrics: kit.verifiedMetrics,
        optimizedCVData: kit.optimizedCVData ?? undefined,
        userInstruction: instruction ?? undefined,
      };
      const ctx = makeCtx(id);
      await shim.callContext.run(ctx, async () => {
        try {
          const result = await unifiedWriterAgent.rewriteCVSection(context, section);
          record.production_status = result.status;
          record.production_reason = 'reason' in result ? String(result.reason) : null;
          record.production_terms = 'terms' in result && Array.isArray(result.terms) ? result.terms : [];
          record.omitted = result.omitted ?? [];
        } catch (error) {
          record.error = (error as Error).message;
        }
      });
      const call = calls.filter((r) => r.case_id === id && r.task === 'optimize_cv').pop();
      record.raw_output = call?.raw_output ?? null;
      if (record.raw_output) {
        try {
          record.content = parseSectionResponse(record.raw_output, section.kind).content;
        } catch (error) {
          record.error = record.error ?? `parse: ${(error as Error).message}`;
        }
      }
      fs.appendFileSync(rewritesFile, JSON.stringify(record) + '\n');
      console.log(`${id} ${slot} ${record.production_status ?? 'error'} ${record.production_terms.join(',')}`);
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);

  const cost = calls.reduce((sum, r) => sum + (r.usage ? costUsd(arm.modelId, r.usage) : 0), 0);
  fs.writeFileSync(path.join(OUT, 'generate-summary.json'), JSON.stringify({
    run_id: runId, date: new Date().toISOString(), arm: arm.name, model: arm.modelId,
    calls: calls.length, rewrites: plan.length, cost_usd: Number(cost.toFixed(4)),
  }, null, 2));
  console.log(`done: ${calls.length} calls, $${cost.toFixed(2)}`);
}

// -----------------------------------------------------
// score (free)
// -----------------------------------------------------

interface Injection {
  kind: string;
  /** Inserted before the first sentence's end ('insert') or replacing its first word ('lead'). */
  mode: 'insert' | 'lead';
  text: string;
  /** The words that carry the fabricated claim; the guard must flag one. */
  claim: string[];
}

const INJECTIONS: Record<'en' | 'de', Record<string, Injection[]>> = {
  en: {
    tool: ['Kubernetes', 'Terraform', 'Salesforce', 'Tableau', 'React', 'Go', 'Excel', 'Snowflake']
      .map((t) => ({ kind: 'tool', mode: 'insert', text: ` using ${t}`, claim: [t.toLowerCase()] })),
    employer: ['Siemens', 'Google', 'McKinsey', 'Deloitte', 'Accenture', 'Meta', 'Linear', 'Shell']
      .map((t) => ({ kind: 'employer', mode: 'insert', text: ` at ${t}`, claim: [t.toLowerCase()] })),
    title: [['Head of Engineering', 'head'], ['VP of Sales', 'vp'], ['Senior Manager', 'senior'], ['Lead Architect', 'lead'], ['Principal Consultant', 'principal'], ['Director of Operations', 'director']]
      .map(([t, c]) => ({ kind: 'title', mode: 'insert', text: ` as ${t}`, claim: [c, ...t.toLowerCase().split(' ').filter((w) => w !== 'of')] })),
    certification: [['a PMP-certified project manager', ['pmp', 'certified']], ['a certified Scrum Master', ['certified', 'scrum']], ['an AWS Certified Solutions Architect', ['aws', 'certified']], ['a CFA charterholder', ['cfa', 'charterholder']], ['a Six Sigma Black Belt', ['six', 'sigma', 'black', 'belt']]]
      .map(([t, c]) => ({ kind: 'certification', mode: 'insert', text: ` as ${t}`, claim: c as string[] })),
    degree: [['an MBA', ['mba']], ['a PhD in Computer Science', ['phd']], ["a Master's in Data Science", ['masters', 'master']], ['a BSc in Economics', ['bsc']]]
      .map(([t, c]) => ({ kind: 'degree', mode: 'insert', text: `, backed by ${t}`, claim: c as string[] })),
    ownership: ['Spearheaded', 'Oversaw', 'Directed', 'Managed', 'Led', 'Owned']
      .map((t) => ({ kind: 'ownership', mode: 'lead', text: t, claim: [t.toLowerCase()] })),
    scope: [['for global teams', 'global'], ['for international clients', 'international'], ['for enterprise customers', 'enterprise'], ['worldwide', 'worldwide']]
      .map(([t, c]) => ({ kind: 'scope', mode: 'insert', text: ` ${t}`, claim: [c] })),
    proficiency: [['working in fluent English', 'fluent'], ['as a native German speaker', 'native'], ['bilingual in English and Spanish', 'bilingual']]
      .map(([t, c]) => ({ kind: 'proficiency', mode: 'insert', text: `, ${t}`, claim: [c] })),
    domain: [['for clinical teams', 'clinical'], ['for financial clients', 'financial'], ['in pharmaceutical settings', 'pharmaceutical'], ['for legal teams', 'legal'], ['for automotive clients', 'automotive']]
      .map(([t, c]) => ({ kind: 'domain', mode: 'insert', text: ` ${t}`, claim: [c] })),
  },
  de: {
    tool: ['Kubernetes', 'SAP', 'Salesforce', 'DATEV', 'Excel', 'React', 'Tableau']
      .map((t) => ({ kind: 'tool', mode: 'insert', text: ` mit ${t}`, claim: [t.toLowerCase()] })),
    employer: [['bei Siemens', 'siemens'], ['bei Bosch', 'bosch'], ['bei der Deutschen Bank', 'bank'], ['bei Allianz', 'allianz'], ['bei Zalando', 'zalando']]
      .map(([t, c]) => ({ kind: 'employer', mode: 'insert', text: ` ${t}`, claim: [c] })),
    title: [['als Teamleiter', 'teamleiter'], ['als Abteilungsleiterin', 'abteilungsleiterin'], ['als Senior Manager', 'senior'], ['als Head of Sales', 'head'], ['als Geschäftsführer', 'geschaeftsfuehrer']]
      .map(([t, c]) => ({ kind: 'title', mode: 'insert', text: ` ${t}`, claim: [c] })),
    certification: [['als zertifizierter Scrum Master', ['zertifizierter', 'scrum']], ['als PMP-zertifizierte Projektleiterin', ['pmp', 'zertifizierte', 'projektleiterin']], ['mit IHK-Zertifikat', ['ihk', 'zertifikat']], ['als geprüfte Fachwirtin', ['gepruefte', 'fachwirtin']]]
      .map(([t, c]) => ({ kind: 'certification', mode: 'insert', text: ` ${t}`, claim: c as string[] })),
    degree: [['mit abgeschlossenem Masterstudium', ['masterstudium', 'abgeschlossenem']], ['mit MBA', ['mba']], ['mit Promotion in Informatik', ['promotion']], ['als Diplom-Kauffrau', ['diplom', 'kauffrau']]]
      .map(([t, c]) => ({ kind: 'degree', mode: 'insert', text: ` ${t}`, claim: c as string[] })),
    ownership: ['Leitete', 'Verantwortete', 'Steuerte', 'Führte']
      .map((t) => ({ kind: 'ownership', mode: 'lead', text: t, claim: [t.toLowerCase().replace('ü', 'ue')] })),
    scope: [['für internationale Kunden', 'internationale'], ['für globale Teams', 'globale'], ['weltweit', 'weltweit']]
      .map(([t, c]) => ({ kind: 'scope', mode: 'insert', text: ` ${t}`, claim: [c] })),
    proficiency: [['auf verhandlungssicherem Englisch', 'verhandlungssicherem'], ['fließend auf Englisch', 'fliessend'], ['zweisprachig auf Deutsch und Englisch', 'zweisprachig']]
      .map(([t, c]) => ({ kind: 'proficiency', mode: 'insert', text: ` ${t}`, claim: [c] })),
    domain: [['für klinische Teams', 'klinische'], ['für medizinische Kunden', 'medizinische'], ['für juristische Teams', 'juristische'], ['für pharmazeutische Kunden', 'pharmazeutische']]
      .map(([t, c]) => ({ kind: 'domain', mode: 'insert', text: ` ${t}`, claim: [c] })),
  },
} as Record<'en' | 'de', Record<string, Injection[]>>;

/** Put the injection into the first sentence (string) or the first bullet (list). */
function inject(content: string | string[], injection: Injection): string | string[] {
  const apply = (text: string): string => {
    if (injection.mode === 'lead') return text.replace(/^\s*[\p{L}][\p{L}-]*/u, injection.text);
    const end = text.search(/[.!?](\s|$)/u);
    return end < 0 ? `${text}${injection.text}` : `${text.slice(0, end)}${injection.text}${text.slice(end)}`;
  };
  return Array.isArray(content) ? [apply(content[0]), ...content.slice(1)] : apply(content);
}

/**
 * claim: the word asserts something about the applicant the CVs don't support.
 * strict: a claim-bearing word (title, ownership, standing) restating something
 *   the CV says in other words; refusing it is the guard's design, not a slip.
 * ordinary: the word asserts nothing; refusing it is a false refusal.
 */
type Label = 'claim' | 'strict' | 'ordinary';

async function score(): Promise<void> {
  const dir = arg('in');
  if (!dir) throw new Error('--in <dir> is required');
  const IN = path.resolve(ROOT, dir);
  installHooks('production', shim);
  const { introducedClaims, unsupportedNumbers } = await import('../src/lib/agents/unified-writer-agent');
  const { baselineIntroducedClaims } = await import('./rewrite-claim-guard/baseline-guard');
  const { claimWords } = await import('../src/lib/agents/claim-token-normalization');

  const kits = new Map((JSON.parse(fs.readFileSync(path.join(IN, 'kits.json'), 'utf8')) as KitRecord[]).map((k) => [k.case_id, k]));
  const rewrites = fs.readFileSync(path.join(IN, 'rewrites.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RewriteRecord);
  const labelsFile = path.join(ROOT, 'evals', 'rewrite-claim-guard', 'labels.json');
  const labels: Record<string, { label: Label; why: string }> = fs.existsSync(labelsFile) ? JSON.parse(fs.readFileSync(labelsFile, 'utf8')) : {};
  const text = (v: string | string[]) => (Array.isArray(v) ? v.join('\n') : v);

  const perRewrite = [];
  const unlabelled = new Map<string, string[]>();
  for (const [index, r] of rewrites.entries()) {
    const kit = kits.get(r.case_id)!;
    if (r.content === null) { perRewrite.push({ id: r.id, error: r.error }); continue; }
    const documents = [kit.rawCV, kit.masterCV].filter(Boolean).join('\n');
    const verified = kit.verifiedMetrics.join('\n');
    const sourceText = `${verified}\n${documents}`;
    const before = text(r.section.before);
    const after = text(r.content);
    const unchanged = after === before;
    const numbers = unchanged ? [] : unsupportedNumbers(after, verified, documents);
    const verdict = (terms: string[]) => {
      if (unchanged || terms.length === 0) return 'applied';
      const ls = terms.map((t) => labels[`${r.language}:${t}`]?.label);
      if (ls.some((l) => l === undefined)) return 'unlabelled';
      if (ls.some((l) => l === 'claim')) return 'true_refusal';
      if (ls.some((l) => l === 'strict')) return 'strict_refusal';
      return 'false_refusal';
    };
    const baseline = unchanged ? [] : baselineIntroducedClaims(after, sourceText, before);
    const current = unchanged ? [] : introducedClaims(after, sourceText, before, r.language);
    for (const t of [...baseline, ...current]) {
      const key = `${r.language}:${t}`;
      if (!labels[key]) unlabelled.set(key, [...(unlabelled.get(key) ?? []), r.id]);
    }
    perRewrite.push({
      id: r.id, split: index % 2 === 0 ? 'dev' : 'holdout', language: r.language, slot: r.slot,
      instruction: r.instruction, unchanged, numbers,
      baseline: { terms: baseline, verdict: verdict(baseline) },
      current: { terms: current, verdict: verdict(current) },
    });
  }

  // Misses: one injection of every kind into every rewrite.
  const injected = [];
  for (const [index, r] of rewrites.entries()) {
    if (r.content === null) continue;
    const kit = kits.get(r.case_id)!;
    const documents = [kit.rawCV, kit.masterCV].filter(Boolean).join('\n');
    const sourceText = `${kit.verifiedMetrics.join('\n')}\n${documents}`;
    const before = text(r.section.before);
    const known = new Set([...claimWords(sourceText), ...claimWords(before)]);
    for (const [kind, options] of Object.entries(INJECTIONS[r.language])) {
      // Rotate through the fillers; skip one whose claim words the CV or section already hold.
      let chosen: Injection | null = null;
      for (let k = 0; k < options.length && !chosen; k++) {
        const option = options[(index + k) % options.length];
        // A claim word the CV holds in another inflection ("verhandlungssicher"
        // for "verhandlungssicherem") is no fabrication, so it doesn't count.
        const backed = (w: string) => known.has(w) || [...known].some((t) => t.length >= 4 && w.startsWith(t) && w.length - t.length <= 3);
        if (option.claim.every((w) => !backed(w))) chosen = option;
      }
      if (!chosen) continue;
      const after = text(inject(r.content, chosen));
      const claimWordsInjected = new Set(chosen.claim.filter((w) => !known.has(w)));
      // (every claim word left is one no CV or section form backs)
      const caught = (terms: string[]) => terms.some((t) => claimWordsInjected.has(t));
      const baseline = baselineIntroducedClaims(after, sourceText, before);
      const current = introducedClaims(after, sourceText, before, r.language);
      injected.push({
        id: r.id, split: index % 2 === 0 ? 'dev' : 'holdout', language: r.language, kind, injection: chosen.text,
        baseline_caught: caught(baseline), current_caught: caught(current), current_terms: current,
      });
    }
  }

  // Tables.
  type Row = (typeof perRewrite)[number];
  const scored = perRewrite.filter((p): p is Extract<Row, { baseline: unknown }> => 'baseline' in p);
  const tally = (rows: typeof scored, guard: 'baseline' | 'current') => {
    const changed = rows.filter((p) => !p.unchanged);
    const c = (v: string) => changed.filter((p) => p[guard].verdict === v).length;
    return { changed: changed.length, applied: c('applied'), false_refusal: c('false_refusal'), strict_refusal: c('strict_refusal'), true_refusal: c('true_refusal'), unlabelled: c('unlabelled') };
  };
  const groups: Record<string, typeof scored> = {
    all: scored,
    en: scored.filter((p) => p.language === 'en'),
    de: scored.filter((p) => p.language === 'de'),
    summary: scored.filter((p) => p.slot === 'summary'),
    bullets: scored.filter((p) => p.slot !== 'summary'),
    dev: scored.filter((p) => p.split === 'dev'),
    holdout: scored.filter((p) => p.split === 'holdout'),
  };
  const refusals = Object.fromEntries(Object.entries(groups).map(([g, rows]) => [g, { baseline: tally(rows, 'baseline'), current: tally(rows, 'current') }]));

  const missTable: Record<string, { injected: number; baseline_missed: number; current_missed: number }> = {};
  for (const i of injected) {
    for (const key of ['all', `${i.language}`, `kind:${i.kind}`, `split:${i.split}`]) {
      const t = (missTable[key] ??= { injected: 0, baseline_missed: 0, current_missed: 0 });
      t.injected += 1;
      if (!i.baseline_caught) t.baseline_missed += 1;
      if (!i.current_caught) t.current_missed += 1;
    }
  }

  const flaggedTerms = (guard: 'baseline' | 'current') => {
    const counts = new Map<string, number>();
    for (const p of scored) for (const t of p[guard].terms) counts.set(`${p.language}:${t}`, (counts.get(`${p.language}:${t}`) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).map(([term, n]) => ({ term, n, label: labels[term]?.label ?? null }));
  };

  const summary = {
    rewrites: rewrites.length,
    unchanged: scored.filter((p) => p.unchanged).length,
    number_guard_refusals: scored.filter((p) => p.numbers.length > 0).length,
    refusals,
    misses: missTable,
    flagged_terms: { baseline: flaggedTerms('baseline'), current: flaggedTerms('current') },
    missed_injections: injected.filter((i) => !i.current_caught),
    unlabelled: Object.fromEntries(unlabelled),
  };
  fs.writeFileSync(path.join(IN, 'scores.json'), JSON.stringify({ summary, per_rewrite: perRewrite, injected }, null, 2));
  console.log(JSON.stringify({ refusals: refusals.all, en: refusals.en, de: refusals.de, misses: missTable.all, unlabelled: unlabelled.size }, null, 2));
  if (unlabelled.size > 0) console.log(`unlabelled terms: ${[...unlabelled.keys()].join(' ')}`);
}

const mode = process.argv[2];
(mode === 'generate' ? generate() : mode === 'score' ? score() : Promise.reject(new Error('mode: generate | score'))).catch((error) => {
  console.error(error);
  process.exit(1);
});
