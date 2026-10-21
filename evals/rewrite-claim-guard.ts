/**
 * Section-rewrite claim guard eval (2026-10-21).
 *
 * Question: does a change to the claim guard stop refusing ordinary rewrites
 * (false refusals) without letting fabricated tools, employers, titles,
 * credentials, degrees, ownership, scope, proficiency or domain claims through
 * (misses)? Baseline: introducedClaims() as on origin/main (PR #165), frozen in
 * evals/rewrite-claim-guard/baseline-guard.ts with its own copy of main's
 * normalisation. Round 1 and 2 scored the part-of-speech lexicon of PR #170
 * (rejected); round 3 scores the narrow fix that shipped (isNeutral stem match
 * plus closed-class grammar words, claim-grammar-words.ts).
 *
 *   # paid: kits plus at most 60 section rewrites on the production request shape
 *   npx tsx evals/rewrite-claim-guard.ts generate --allow-anthropic-api --out <dir> [--cases syn-01,...] [--max N]
 *   # free: scores both guards on the stored rewrites, plus the injected misses
 *   npx tsx evals/rewrite-claim-guard.ts score --in <dir> [--scores scores-round2.json] [--guard <unified-writer-agent.ts>]
 *   (--guard scores another build of the guard as "current", e.g. an older commit checked out elsewhere)
 *   # paid: the model claim check on the stored rewrites, injections, probes, a held-out sample and adversarial cases
 *   npx tsx evals/rewrite-claim-guard.ts model-check --out <dir> [--plan | --allow-anthropic-api] [--budget 12] [--seed N]
 *   (see modelCheck() below; write-up evals/results/2026-10-21-rewrite-claim-model-check.md)
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
 * does not flag. Round 2 adds the held-out set (rewrite-claim-guard/heldout.ts):
 * every held-out item in every rewrite of its language and in synthetic list
 * sections built from the kits' skills and languages, plus a per-brand check
 * of lowercase product names (the residual).
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
  /**
   * insert: before the first sentence's end. lead: replaces its first word.
   * prefix: a new first sentence or bullet. newline: a new last line or item.
   * prepend: a word put before the first word.
   */
  mode: 'insert' | 'lead' | 'prefix' | 'newline' | 'prepend';
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
  if (injection.mode === 'prefix') return Array.isArray(content) ? [injection.text, ...content] : `${injection.text} ${content}`;
  if (injection.mode === 'newline') return Array.isArray(content) ? [...content, injection.text] : `${content}\n${injection.text}`;
  const apply = (text: string): string => {
    if (injection.mode === 'prepend') return `${injection.text} ${text.trimStart()}`;
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
  const guardModule = arg('guard') ? path.resolve(process.cwd(), arg('guard')!) : '../src/lib/agents/unified-writer-agent';
  const { introducedClaims, unsupportedNumbers } = (await import(guardModule)) as typeof import('../src/lib/agents/unified-writer-agent');
  const { baselineIntroducedClaims } = await import('./rewrite-claim-guard/baseline-guard');
  const { claimWords } = await import('../src/lib/agents/claim-token-normalization');
  const { HELD_OUT, LOWERCASE_BRANDS } = await import('./rewrite-claim-guard/heldout');
  const { PROBES } = await import('./rewrite-claim-guard/probes');
  const { grammarWords } = await import('../src/lib/agents/claim-grammar-words');
  // Every word the baseline flags and the guard under test does not, in any context scored below.
  const newlyFreed = new Map<string, { language: string; count: number; where: Set<string> }>();
  const noteFreed = (baseline: string[], current: string[], language: 'en' | 'de', where: string) => {
    for (const term of baseline) {
      if (current.includes(term)) continue;
      const key = `${language}:${term}`;
      const entry = newlyFreed.get(key) ?? { language, count: 0, where: new Set<string>() };
      entry.count += 1;
      entry.where.add(where);
      newlyFreed.set(key, entry);
    }
  };
  const scoresName = arg('scores') ?? 'scores.json';

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
    const current = unchanged ? [] : introducedClaims(after, sourceText, before, r.language, r.section.kind);
    noteFreed(baseline, current, r.language, 'stored rewrites');
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
      const current = introducedClaims(after, sourceText, before, r.language, r.section.kind);
      noteFreed(baseline, current, r.language, 'injections');
      injected.push({
        id: r.id, split: index % 2 === 0 ? 'dev' : 'holdout', language: r.language, kind, injection: chosen.text,
        baseline_caught: caught(baseline), current_caught: caught(current), current_terms: current,
      });
    }
  }

  // Held out: every item into every section of its language, the stored
  // rewrites plus synthetic list sections (skills and languages) from the kits.
  const sections: Array<{ id: string; language: 'en' | 'de'; kind: ResolvedCVSection['kind']; before: string | string[]; content: string | string[]; sourceText: string }> = [];
  for (const r of rewrites) {
    if (r.content === null) continue;
    const kit = kits.get(r.case_id)!;
    const sourceText = `${kit.verifiedMetrics.join('\n')}\n${[kit.rawCV, kit.masterCV].filter(Boolean).join('\n')}`;
    sections.push({ id: r.id, language: r.language, kind: r.section.kind, before: r.section.before, content: r.content, sourceText });
  }
  for (const kit of kits.values()) {
    const cv = kit.optimizedCVData as unknown as { skills?: Array<{ category: string; items: string[] }>; languages?: Array<{ language: string; proficiency?: string }> } | null;
    const sourceText = `${kit.verifiedMetrics.join('\n')}\n${[kit.rawCV, kit.masterCV].filter(Boolean).join('\n')}`;
    const lists = [
      ...(cv?.skills ?? []).map((group, i) => ({ id: `${kit.case_id}-skills${i}`, items: group.items })),
      { id: `${kit.case_id}-languages`, items: (cv?.languages ?? []).map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language)) },
    ];
    for (const list of lists) {
      if (list.items.length === 0) continue;
      sections.push({ id: list.id, language: kit.language, kind: 'custom_section_items', before: list.items, content: list.items, sourceText });
    }
  }
  const heldOut = [];
  for (const section of sections) {
    const known = new Set([...claimWords(section.sourceText), ...claimWords(text(section.before))]);
    for (const item of HELD_OUT[section.language]) {
      // Skip an item the CV or the section already backs: that's no fabrication.
      if (item.claim.some((w) => known.has(w))) continue;
      const after = text(inject(section.content, item));
      const caught = (terms: string[]) => terms.some((t) => item.claim.includes(t));
      const baseline = baselineIntroducedClaims(after, section.sourceText, text(section.before));
      const current = introducedClaims(after, section.sourceText, text(section.before), section.language, section.kind);
      noteFreed(baseline, current, section.language, 'held-out');
      heldOut.push({
        id: section.id, language: section.language, section_kind: section.kind, kind: item.kind, injection: item.text,
        baseline_caught: caught(baseline), current_caught: caught(current), current_terms: current,
      });
    }
  }
  const heldOutTable: Record<string, { injected: number; baseline_missed: number; current_missed: number; new_misses: number }> = {};
  for (const h of heldOut) {
    for (const key of ['all', h.language, `kind:${h.kind}`, `${h.language}:${h.kind}`, `section:${h.section_kind}`]) {
      const t = (heldOutTable[key] ??= { injected: 0, baseline_missed: 0, current_missed: 0, new_misses: 0 });
      t.injected += 1;
      if (!h.baseline_caught) t.baseline_missed += 1;
      if (!h.current_caught) t.current_missed += 1;
      if (h.baseline_caught && !h.current_caught) t.new_misses += 1;
    }
  }
  const newHeldOutMisses = heldOut.filter((h) => h.baseline_caught && !h.current_caught);

  // The residual: each lowercase brand name, mid-sentence, in one English sentence.
  const brandCheck = (brand: string) => {
    const before = 'Built agents for clients.';
    const after = `Built agents for clients using ${brand}.`;
    return {
      brand,
      baseline_caught: baselineIntroducedClaims(after, 'Built agents for clients.', before).includes(brand),
      current_caught: introducedClaims(after, 'Built agents for clients.', before, 'en', 'summary').includes(brand),
    };
  };
  const brands = [...new Set(LOWERCASE_BRANDS)].map(brandCheck);

  // Reviewer probes (PR #170): each is a claim origin/main refuses; none may pass now.
  const probes = PROBES.map((p) => {
    const baseline = baselineIntroducedClaims(p.after, p.source, p.before);
    const current = introducedClaims(p.after, p.source, p.before, p.language, p.kind);
    noteFreed(baseline, current, p.language, 'probes');
    return {
      id: p.id, from: p.from, language: p.language, kind: p.kind, after: p.after,
      baseline_caught: baseline.some((t) => p.claim.includes(t)),
      current_caught: current.some((t) => p.claim.includes(t)),
      current_terms: current,
    };
  });
  const probeSummary = {
    total: probes.length,
    refused_by_baseline: probes.filter((p) => p.baseline_caught).length,
    not_refused_by_baseline: probes.filter((p) => !p.baseline_caught).map((p) => ({ id: p.id, after: p.after })),
    refused_by_current: probes.filter((p) => p.current_caught).length,
    new_misses: probes.filter((p) => p.baseline_caught && !p.current_caught).map((p) => ({ id: p.id, after: p.after, terms: p.current_terms })),
  };

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
    new_missed_injections: injected.filter((i) => i.baseline_caught && !i.current_caught),
    held_out: heldOutTable,
    new_held_out_misses: newHeldOutMisses,
    held_out_misses: heldOut.filter((h) => !h.current_caught),
    lowercase_brands: {
      checked: brands.length,
      baseline_missed: brands.filter((b) => !b.baseline_caught).map((b) => b.brand),
      current_missed: brands.filter((b) => !b.current_caught).map((b) => b.brand),
      new_misses: brands.filter((b) => b.baseline_caught && !b.current_caught).map((b) => b.brand),
    },
    probes: probeSummary,
    newly_freed: [...newlyFreed]
      .map(([key, v]) => ({ word: key, count: v.count, where: [...v.where].sort(), rule: grammarWords(v.language as 'en' | 'de').has(key.slice(3)) ? 'grammar word' : 'stem match' }))
      .sort((a, b) => b.count - a.count || (a.word < b.word ? -1 : 1)),
    unlabelled: Object.fromEntries(unlabelled),
  };
  fs.writeFileSync(path.join(IN, scoresName), JSON.stringify({ summary, per_rewrite: perRewrite, injected, held_out: heldOut, probes }, null, 2));
  console.log(JSON.stringify({
    refusals: refusals.all, en: refusals.en, de: refusals.de, misses: missTable.all,
    new_misses: summary.new_missed_injections.length, held_out: heldOutTable.all,
    lowercase_brands: { checked: brands.length, new_misses: summary.lowercase_brands.new_misses },
    probes: { total: probeSummary.total, refused_by_baseline: probeSummary.refused_by_baseline, refused_by_current: probeSummary.refused_by_current, new_misses: probeSummary.new_misses.length },
    newly_freed: summary.newly_freed.map((f) => `${f.word}(${f.count},${f.rule})`).join(' '),
    unlabelled: unlabelled.size,
  }, null, 2));
  if (unlabelled.size > 0) console.log(`unlabelled terms: ${[...unlabelled.keys()].join(' ')}`);
}

// -----------------------------------------------------
// model-check (paid): the model claim check (2026-10-21)
// -----------------------------------------------------

/** Seeded PRNG (mulberry32), so the held-out sample is reproducible. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface CheckCase {
  set: 'injections' | 'probes' | 'heldout' | 'adversarial';
  id: string;
  language: 'en' | 'de';
  kind: ResolvedCVSection['kind'];
  group: string;
  text: string;
  primaryCV: string;
  masterCV: string;
  sourceText: string;
  before: string;
  after: string;
  claim: string[];
}

/**
 * Scores the model claim check (checkRewriteClaims in unified-writer-agent.ts)
 * with real calls on the eval shim (Sonnet 5.5, adaptive thinking, effort low).
 *
 *   npx tsx evals/rewrite-claim-guard.ts model-check --in <run dir> --out <dir> [--plan] [--allow-anthropic-api]
 *     [--budget 12] [--seed 20261021] [--heldout-sample 600] [--limit N]
 *
 * --plan counts the model calls each set needs, free. Without it, calls are
 * made and the run stops before the budget would be passed.
 *
 * Stored rewrites: the production path exactly (a word refused without the
 * model refuses with no call). Misses: claim level, stricter than production.
 * For every case main (the word guard) catches, the claim is caught when a
 * claim word is refused without the model, or the model is asked about every
 * judged word of the text (even where production would not ask, because
 * another word already refuses) and refuses a claim word main flagged.
 */
async function modelCheck(): Promise<void> {
  const IN = path.resolve(ROOT, arg('in') ?? 'evals/results/2026-10-21-rewrite-claim-guard/run');
  const out = arg('out');
  if (!out) throw new Error('--out <dir> is required');
  const OUT = path.resolve(ROOT, out);
  const planOnly = process.argv.includes('--plan');
  if (!planOnly && !process.argv.includes('--allow-anthropic-api')) throw new Error('model-check calls the paid API: pass --allow-anthropic-api (or --plan)');
  const budget = Number(arg('budget') ?? 12);
  const seed = Number(arg('seed') ?? 20261021);
  const sampleSize = Number(arg('heldout-sample') ?? 600);
  const limit = arg('limit') ? Number(arg('limit')) : Infinity;
  fs.mkdirSync(OUT, { recursive: true });

  loadEnv();
  if (!planOnly && !process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  const arm = { ...ARMS['sonnet55-low'] };
  installHooks(arm.promptVariant, shim);
  const agent = (await import('../src/lib/agents/unified-writer-agent')) as typeof import('../src/lib/agents/unified-writer-agent');
  const { introducedClaims, unsupportedNumbers, splitIntroducedClaims, verifyJudgedClaims } = agent;
  const { claimWords } = await import('../src/lib/agents/claim-token-normalization');
  const { HELD_OUT } = await import('./rewrite-claim-guard/heldout');
  const { PROBES } = await import('./rewrite-claim-guard/probes');
  const { ADVERSARIAL } = await import('./rewrite-claim-guard/adversarial');

  const kits = new Map((JSON.parse(fs.readFileSync(path.join(IN, 'kits.json'), 'utf8')) as KitRecord[]).map((k) => [k.case_id, k]));
  const rewrites = fs.readFileSync(path.join(IN, 'rewrites.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as RewriteRecord);
  const labels: Record<string, { label: Label; why: string }> = JSON.parse(fs.readFileSync(path.join(ROOT, 'evals', 'rewrite-claim-guard', 'labels.json'), 'utf8'));
  const text = (v: string | string[]) => (Array.isArray(v) ? v.join('\n') : v);
  const kitSource = (kit: KitRecord) => ({
    primaryCV: kit.rawCV,
    masterCV: kit.masterCV ?? '',
    sourceText: `${kit.verifiedMetrics.join('\n')}\n${[kit.rawCV, kit.masterCV].filter(Boolean).join('\n')}`,
  });

  // ---- The cases -----------------------------------------------------------
  const cases: CheckCase[] = [];
  // Original injections: the same rotation and filter as score().
  for (const [index, r] of rewrites.entries()) {
    if (r.content === null) continue;
    const kit = kits.get(r.case_id)!;
    const src = kitSource(kit);
    const before = text(r.section.before);
    const known = new Set([...claimWords(src.sourceText), ...claimWords(before)]);
    for (const [kind, options] of Object.entries(INJECTIONS[r.language])) {
      let chosen: Injection | null = null;
      for (let k = 0; k < options.length && !chosen; k++) {
        const option = options[(index + k) % options.length];
        const backed = (w: string) => known.has(w) || [...known].some((t) => t.length >= 4 && w.startsWith(t) && w.length - t.length <= 3);
        if (option.claim.every((w) => !backed(w))) chosen = option;
      }
      if (!chosen) continue;
      cases.push({
        set: 'injections', id: `${r.id}:${kind}`, language: r.language, kind: r.section.kind, group: kind, text: chosen.text,
        ...src, before, after: text(inject(r.content, chosen)), claim: chosen.claim.filter((w) => !known.has(w)),
      });
    }
  }
  for (const p of PROBES) {
    cases.push({
      set: 'probes', id: p.id, language: p.language, kind: p.kind, group: p.from, text: p.after,
      primaryCV: p.source, masterCV: '', sourceText: p.source, before: p.before, after: p.after, claim: p.claim,
    });
  }
  // Held out: the score() population, then a stratified sample (language x kind) of the ones main catches.
  const heldPopulation: CheckCase[] = [];
  const sections: Array<{ id: string; language: 'en' | 'de'; kind: ResolvedCVSection['kind']; before: string | string[]; content: string | string[]; kit: KitRecord }> = [];
  for (const r of rewrites) {
    if (r.content === null) continue;
    sections.push({ id: r.id, language: r.language, kind: r.section.kind, before: r.section.before, content: r.content, kit: kits.get(r.case_id)! });
  }
  for (const kit of kits.values()) {
    const cv = kit.optimizedCVData as unknown as { skills?: Array<{ category: string; items: string[] }>; languages?: Array<{ language: string; proficiency?: string }> } | null;
    const lists = [
      ...(cv?.skills ?? []).map((group, i) => ({ id: `${kit.case_id}-skills${i}`, items: group.items })),
      { id: `${kit.case_id}-languages`, items: (cv?.languages ?? []).map((l) => (l.proficiency ? `${l.language} (${l.proficiency})` : l.language)) },
    ];
    for (const list of lists) {
      if (list.items.length === 0) continue;
      sections.push({ id: list.id, language: kit.language, kind: 'custom_section_items', before: list.items, content: list.items, kit });
    }
  }
  for (const section of sections) {
    const src = kitSource(section.kit);
    const before = text(section.before);
    const known = new Set([...claimWords(src.sourceText), ...claimWords(before)]);
    for (const [i, item] of HELD_OUT[section.language].entries()) {
      if (item.claim.some((w) => known.has(w))) continue;
      heldPopulation.push({
        set: 'heldout', id: `${section.id}:${i}`, language: section.language, kind: section.kind, group: item.kind, text: item.text,
        ...src, before, after: text(inject(section.content, item)), claim: item.claim,
      });
    }
  }
  const mainCatches = (c: CheckCase) => introducedClaims(c.after, c.sourceText, c.before, c.language, c.kind).some((t) => c.claim.includes(t));
  const heldCaught = heldPopulation.filter(mainCatches);
  const strata = new Map<string, CheckCase[]>();
  for (const c of heldCaught) {
    const key = `${c.language}:${c.group}`;
    strata.set(key, [...(strata.get(key) ?? []), c]);
  }
  const random = prng(seed);
  const shuffle = <T>(list: T[]): T[] => {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  // Proportional allocation with a floor of 20 per stratum (or the whole stratum).
  const strataKeys = [...strata.keys()].sort();
  const quota = new Map(strataKeys.map((k) => [k, Math.min(strata.get(k)!.length, Math.max(20, Math.round((sampleSize * strata.get(k)!.length) / heldCaught.length)))]));
  const heldSample = strataKeys.flatMap((k) => shuffle(strata.get(k)!).slice(0, quota.get(k)));
  cases.push(...heldSample);
  for (const a of ADVERSARIAL) {
    cases.push({
      set: 'adversarial', id: a.id, language: a.language, kind: a.kind, group: a.category, text: a.after,
      primaryCV: a.source, masterCV: '', sourceText: a.source, before: a.before, after: a.after, claim: a.claim,
    });
  }

  // ---- What each case needs -------------------------------------------------
  type Route = 'main_missed' | 'deterministic' | 'model';
  const routed = cases.map((c) => {
    const flagged = introducedClaims(c.after, c.sourceText, c.before, c.language, c.kind);
    const mainCaughtWords = c.claim.filter((w) => flagged.includes(w));
    const split = splitIntroducedClaims(c.after, flagged, c.language, c.kind);
    const route: Route = mainCaughtWords.length === 0
      ? 'main_missed'
      : mainCaughtWords.some((w) => split.deterministic.includes(w)) ? 'deterministic' : 'model';
    return { c, flagged, mainCaughtWords, split, route };
  });
  const stored = rewrites.filter((r) => r.content !== null).map((r) => {
    const kit = kits.get(r.case_id)!;
    const src = kitSource(kit);
    const before = text(r.section.before);
    const after = text(r.content!);
    const unchanged = after === before;
    const numbers = unchanged ? [] : unsupportedNumbers(after, kit.verifiedMetrics.join('\n'), [kit.rawCV, kit.masterCV].filter(Boolean).join('\n'));
    const flagged = unchanged || numbers.length > 0 ? [] : introducedClaims(after, src.sourceText, before, r.language, r.section.kind);
    const split = splitIntroducedClaims(after, flagged, r.language, r.section.kind);
    const calls = flagged.length > 0 && split.deterministic.length === 0 && split.judged.length > 0;
    return { r, src, before, after, unchanged, numbers, flagged, split, calls };
  });

  const planCount = {
    stored_rewrites: { cases: stored.length, changed: stored.filter((s) => !s.unchanged).length, model_calls: stored.filter((s) => s.calls).length },
    ...Object.fromEntries((['injections', 'probes', 'heldout', 'adversarial'] as const).map((set) => {
      const rows = routed.filter((x) => x.c.set === set);
      return [set, {
        cases: rows.length,
        main_missed: rows.filter((x) => x.route === 'main_missed').length,
        deterministic: rows.filter((x) => x.route === 'deterministic').length,
        model_calls: rows.filter((x) => x.route === 'model').length,
      }];
    })),
    heldout_population: { all: heldPopulation.length, main_catches: heldCaught.length, strata: Object.fromEntries(strataKeys.map((k) => [k, `${quota.get(k)}/${strata.get(k)!.length}`])) },
    seed,
  };
  console.log(JSON.stringify(planCount, null, 2));
  fs.writeFileSync(path.join(OUT, 'plan.json'), JSON.stringify(planCount, null, 2));
  if (planOnly) return;

  // ---- Paid: the verifier --------------------------------------------------
  const runId = crypto.randomUUID();
  const callsFile = path.join(OUT, 'calls.jsonl');
  if (fs.existsSync(callsFile)) throw new Error(`${out} already holds a run; pick a new folder`);
  const calls: CallRecord[] = [];
  let spent = 0;
  let made = 0;
  const memo = new Map<string, Promise<Awaited<ReturnType<typeof verifyJudgedClaims>>>>();
  const verify = (caseId: string, v: { after: string; before: string; primaryCV: string; masterCV: string; language: string; judged: string[] }) => {
    const key = crypto.createHash('sha256').update(JSON.stringify([v.after, v.before, v.primaryCV, v.masterCV, v.language, v.judged])).digest('hex');
    const hit = memo.get(key);
    if (hit) return hit;
    if (made >= limit) throw new Error('call limit reached');
    // Stop before a call could pass the budget (a verifier call costs well under $0.05).
    if (spent > budget - 0.05) throw new Error(`budget stop: $${spent.toFixed(2)} spent of $${budget}`);
    made += 1;
    const ctx: shim.CallContext = {
      runId, caseId, rep: 1, arm, concurrency: 6, seq: { n: 0 }, lastRaw: new Map(),
      record: (r: CallRecord) => {
        calls.push(r);
        if (r.usage) spent += costUsd(arm.modelId, r.usage);
        fs.appendFileSync(callsFile, JSON.stringify({ ...r, request: { ...r.request, body: undefined } }) + '\n');
      },
    };
    const run = shim.callContext.run(ctx, () => verifyJudgedClaims({
      afterText: v.after, beforeText: v.before, primaryCV: v.primaryCV, masterCV: v.masterCV, language: v.language, judged: v.judged,
    }));
    memo.set(key, run);
    return run;
  };

  async function pool<T, R>(items: T[], worker: (item: T) => Promise<R>, n = 6): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i]);
      }
    }));
    return results;
  }

  const verdictLabel = (language: string, terms: string[]) => {
    if (terms.length === 0) return 'applied';
    const ls = terms.map((t) => labels[`${language}:${t}`]?.label);
    if (ls.some((l) => l === undefined)) return 'unlabelled';
    if (ls.some((l) => l === 'claim')) return 'true_refusal';
    if (ls.some((l) => l === 'strict')) return 'strict_refusal';
    return 'false_refusal';
  };

  // Stored rewrites, the production path.
  const storedResults = await pool(stored, async (s) => {
    const verifier = s.calls
      ? await verify(s.r.id, { after: s.after, before: s.before, primaryCV: s.src.primaryCV, masterCV: s.src.masterCV, language: s.r.language, judged: s.split.judged })
      : null;
    const refused = s.unchanged ? [] : s.numbers.length > 0 ? s.numbers : verifier ? verifier.refused : s.split.deterministic;
    const freed = verifier ? s.split.judged.filter((t) => !verifier.refused.includes(t)) : [];
    return {
      id: s.r.id, language: s.r.language, slot: s.r.slot, instruction: s.r.instruction, unchanged: s.unchanged,
      main: { terms: s.flagged, verdict: s.unchanged ? 'applied' : verdictLabel(s.r.language, s.flagged) },
      new: { terms: refused, verdict: s.unchanged ? 'applied' : verdictLabel(s.r.language, refused) },
      deterministic: s.split.deterministic, judged: s.split.judged,
      freed: freed.map((t) => ({ term: t, label: labels[`${s.r.language}:${t}`]?.label ?? null })),
      verifier,
    };
  });
  fs.writeFileSync(path.join(OUT, 'results-stored.jsonl'), storedResults.map((x) => JSON.stringify(x)).join('\n') + '\n');
  console.log(`stored rewrites done: ${made} calls, $${spent.toFixed(2)}`);

  // Misses, claim level.
  const caseResults = await pool(routed, async (x) => {
    let verifier = null;
    let newCaught: boolean;
    if (x.route === 'main_missed') newCaught = false;
    else if (x.route === 'deterministic') newCaught = true;
    else {
      verifier = await verify(x.c.id, { after: x.c.after, before: x.c.before, primaryCV: x.c.primaryCV, masterCV: x.c.masterCV, language: x.c.language, judged: x.split.judged });
      newCaught = x.mainCaughtWords.some((w) => verifier!.refused.includes(w));
    }
    // What production does with this text: refused without a call if a word is deterministic, else the model.
    const productionApplied = x.flagged.length === 0 || (x.split.deterministic.length === 0 && verifier !== null && verifier.refused.length === 0);
    return {
      set: x.c.set, id: x.c.id, language: x.c.language, kind: x.c.kind, group: x.c.group, text: x.c.text, claim: x.c.claim,
      route: x.route, main_caught: x.route !== 'main_missed', new_caught: newCaught,
      new_miss: x.route !== 'main_missed' && !newCaught, production_applied: productionApplied,
      main_caught_words: x.mainCaughtWords, deterministic: x.split.deterministic, judged: x.split.judged,
      verifier: verifier && { refused: verifier.refused, verdicts: verifier.verdicts, error: verifier.error, latencyMs: verifier.latencyMs, tokens: verifier.tokens },
    };
  });
  for (const set of ['injections', 'probes', 'heldout', 'adversarial'] as const) {
    fs.writeFileSync(path.join(OUT, `results-${set}.jsonl`), caseResults.filter((x) => x.set === set).map((x) => JSON.stringify(x)).join('\n') + '\n');
  }

  // ---- Summary --------------------------------------------------------------
  const verifierCalls = calls.filter((r) => r.task === 'verify_rewrite_claims');
  const latencies = verifierCalls.filter((r) => r.ok).map((r) => r.latency_ms).sort((a, b) => a - b);
  const pct = (p: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] : null;
  const callCost = (r: CallRecord) => (r.usage ? costUsd(arm.modelId, r.usage) : 0);
  const storedCallIds = new Set(storedResults.filter((s) => s.verifier).map((s) => s.id));
  const storedCost = verifierCalls.filter((r) => storedCallIds.has(r.case_id)).reduce((n, r) => n + callCost(r), 0);
  const changedStored = storedResults.filter((s) => !s.unchanged);
  const tally = (rows: typeof changedStored, guard: 'main' | 'new') => {
    const c = (v: string) => rows.filter((s) => s[guard].verdict === v).length;
    return { changed: rows.length, applied: c('applied'), false_refusal: c('false_refusal'), strict_refusal: c('strict_refusal'), true_refusal: c('true_refusal'), unlabelled: c('unlabelled') };
  };
  const bySet = Object.fromEntries((['injections', 'probes', 'heldout', 'adversarial'] as const).map((set) => {
    const rows = caseResults.filter((x) => x.set === set);
    const groups = [...new Set(rows.map((x) => `${x.language}:${x.group}`))].sort();
    const t = (rs: typeof rows) => ({
      cases: rs.length,
      main_caught: rs.filter((x) => x.main_caught).length,
      main_missed: rs.filter((x) => !x.main_caught).length,
      new_caught: rs.filter((x) => x.new_caught).length,
      new_misses: rs.filter((x) => x.new_miss).length,
      judged_by_model: rs.filter((x) => x.route === 'model').length,
      verifier_errors: rs.filter((x) => x.verifier?.error).length,
      production_applied: rs.filter((x) => x.production_applied).length,
    });
    return [set, { ...t(rows), by_group: Object.fromEntries(groups.map((g) => [g, t(rows.filter((x) => `${x.language}:${x.group}` === g))])) }];
  }));
  const summary = {
    run_id: runId,
    date: new Date().toISOString(),
    model: arm.modelId,
    arm: arm.name,
    seed,
    stored_rewrites: {
      all: { main: tally(changedStored, 'main'), new: tally(changedStored, 'new') },
      en: { main: tally(changedStored.filter((s) => s.language === 'en'), 'main'), new: tally(changedStored.filter((s) => s.language === 'en'), 'new') },
      de: { main: tally(changedStored.filter((s) => s.language === 'de'), 'main'), new: tally(changedStored.filter((s) => s.language === 'de'), 'new') },
      verifier_called: storedResults.filter((s) => s.verifier).length,
      verifier_cost_usd: Number(storedCost.toFixed(4)),
      verifier_cost_per_changed_rewrite_usd: Number((storedCost / Math.max(1, changedStored.length)).toFixed(5)),
      freed_claim_or_strict: storedResults.flatMap((s) => s.freed.filter((f) => f.label !== 'ordinary').map((f) => ({ id: s.id, ...f }))),
      still_false_refusal: changedStored.filter((s) => s.new.verdict === 'false_refusal').map((s) => ({ id: s.id, terms: s.new.terms })),
    },
    misses: bySet,
    new_misses: caseResults.filter((x) => x.new_miss).map((x) => ({ set: x.set, id: x.id, text: x.text, claim: x.claim, verdicts: x.verifier?.verdicts.filter((v) => x.main_caught_words.includes(v.term)) })),
    adversarial_misses: caseResults.filter((x) => x.set === 'adversarial' && !x.new_caught).map((x) => ({ id: x.id, group: x.group, text: x.text, route: x.route, verdicts: x.verifier?.verdicts })),
    verifier: {
      calls: verifierCalls.length,
      failed: verifierCalls.filter((r) => !r.ok).length,
      cost_usd: Number(verifierCalls.reduce((n, r) => n + callCost(r), 0).toFixed(4)),
      cost_per_call_usd: Number((verifierCalls.reduce((n, r) => n + callCost(r), 0) / Math.max(1, verifierCalls.length)).toFixed(5)),
      latency_ms: { p50: pct(0.5), p95: pct(0.95), max: latencies[latencies.length - 1] ?? null },
      tokens: {
        input: verifierCalls.reduce((n, r) => n + (r.usage?.input ?? 0), 0),
        output: verifierCalls.reduce((n, r) => n + (r.usage?.output ?? 0), 0),
        cache_read: verifierCalls.reduce((n, r) => n + (r.usage?.cacheRead ?? 0), 0),
        cache_write: verifierCalls.reduce((n, r) => n + (r.usage?.cacheWrite ?? 0), 0),
      },
      parse_or_validation_errors: caseResults.filter((x) => x.verifier?.error === 'invalid_response').length + storedResults.filter((s) => s.verifier?.error === 'invalid_response').length,
    },
    total_cost_usd: Number(spent.toFixed(4)),
  };
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({
    stored: summary.stored_rewrites.all, verifier_called_on_stored: summary.stored_rewrites.verifier_called,
    misses: Object.fromEntries(Object.entries(bySet).map(([k, v]) => [k, { cases: v.cases, main_caught: v.main_caught, new_misses: v.new_misses, judged_by_model: v.judged_by_model }])),
    adversarial_caught: bySet.adversarial.new_caught, verifier: summary.verifier, total_cost_usd: summary.total_cost_usd,
  }, null, 2));
}

const mode = process.argv[2];
(mode === 'generate' ? generate() : mode === 'score' ? score() : mode === 'model-check' ? modelCheck() : Promise.reject(new Error('mode: generate | score | model-check'))).catch((error) => {
  console.error(error);
  process.exit(1);
});
