/**
 * Deterministic scorer. Failure modes F1 to F18 are defined in evals/README.md.
 *
 *   npx tsx evals/score-deterministic.ts --run evals/results/2026-10-07-sonnet-eval --arm sonnet46-bedrock
 *
 * Reads calls.jsonl, kits.jsonl and intermediates/ for the arm (public folder plus the
 * private mirror for owner cases) and writes:
 *   <run>/<arm>/deterministic.json          aggregates for all cases, details for synthetic cases
 *   evals/private/results/<run>/<arm>/deterministic-owner.json   details with quoted text for owner cases
 */
import fs from 'node:fs';
import path from 'node:path';
import { claimStem, claimWords } from '../src/lib/agents/claim-token-normalization';
import { getAllBlacklistedPhrases } from '../src/lib/config/cover-letter-blacklist';
import { loadCases, resolveCase, type ResolvedCase } from './lib/cases';
import { costUsd } from './lib/pricing';
import type { CallRecord, EvalTask } from './lib/types';
import type { KitRecord, KitIntermediates } from './lib/pipeline';

const ROOT = path.resolve(__dirname, '..');
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface Finding {
  id: string;
  task: string;
  detail: string;
}

const STOP = new Set(['and', 'of', 'the', 'in', 'to', 'for', 'with', 'a', 'an', 'on', 'at', 'und', 'der', 'die', 'das', 'in', 'mit', 'von', 'fur', 'fuer', 'im', 'zu', 'bei', 'als']);
const EN_WORDS = new Set('the and of to in is for with that you your we our are on as at by be this will from have has it an or not can'.split(' '));
const DE_WORDS = new Set('der die das und ist für mit von zu den dem des ein eine einen ich sie wir bei als auf im nicht sich auch werden wird sind'.split(' '));

const stems = (text: string) => new Set(claimWords(text).map(claimStem));

function supported(term: string, source: Set<string>): boolean {
  const toks = claimWords(term).filter((w) => !STOP.has(w) && w.length > 1).map(claimStem);
  return toks.every((t) => source.has(t));
}

function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/\d[\d.,]*\d|\d/g)) {
    const n = m[0].replace(/[.,]/g, '');
    if (m[0].length === 1 && !text.slice(m.index! + 1, m.index! + 2).match(/%/)) continue; // lone single digits are noise
    out.add(n);
  }
  return out;
}

function langOf(text: string): 'en' | 'de' | null {
  const words = text.toLowerCase().match(/[a-zäöüß]+/g) ?? [];
  if (words.length < 20) return null;
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  const de = words.filter((w) => DE_WORDS.has(w)).length;
  return de > en ? 'de' : 'en';
}

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean);

function extractJson(raw: string): unknown {
  let s = raw.trim().replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const m = s.match(/[{[][\s\S]*[}\]]/);
  if (m) s = m[0];
  return JSON.parse(s);
}

function longestCopy(text: string, jd: string, n = 12): string | null {
  const jw = jd.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const grams = new Set<string>();
  for (let i = 0; i + n <= jw.length; i++) grams.add(jw.slice(i, i + n).join(' '));
  const tw = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  for (let i = 0; i + n <= tw.length; i++) {
    const g = tw.slice(i, i + n).join(' ');
    if (grams.has(g)) return g;
  }
  return null;
}

function pct(arr: number[], p: number): number {
  if (arr.length === 0) return NaN;
  const a = [...arr].sort((x, y) => x - y);
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  return a[lo] + (a[Math.ceil(idx)] - a[lo]) * (idx - lo);
}

function readJsonl<T>(f: string): T[] {
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T) : [];
}

function scoreKit(c: ResolvedCase, calls: CallRecord[], kit: KitRecord, inter: KitIntermediates | null): Finding[] {
  const f: Finding[] = [];
  const add = (id: string, task: string, detail: string) => f.push({ id, task, detail });
  const finalCall = (task: EvalTask) => [...calls].filter((x) => x.task === task).sort((a, b) => a.seq - b.seq).pop();
  const source = [c.cvText, c.masterCvText ?? ''].join('\n');
  const srcStems = stems(source);
  const srcNums = numbersIn(source);
  const jdNums = numbersIn(c.jdText);

  // F13 API level, F12 JSON validity
  const jsonTasks: EvalTask[] = ['parse_cv', 'extract_applicant', 'parse_job', 'skill_matching', 'extract_metrics', 'optimize_cv', 'write_email', 'write_follow_up_email'];
  for (const call of calls) {
    if (!call.ok) add('F13', call.task, `call failed: ${call.error}`);
    else {
      if (call.stop_reason && !['end_turn', 'stop_sequence'].includes(call.stop_reason)) add('F13', call.task, `stop_reason ${call.stop_reason}`);
      if (!call.raw_output || !call.raw_output.trim()) add('F13', call.task, 'empty output');
    }
  }
  for (const t of jsonTasks) {
    const call = finalCall(t);
    if (!call?.ok || !call.raw_output) continue;
    try {
      const j = extractJson(call.raw_output) as Record<string, unknown>;
      if (t === 'parse_cv' && !(j.personal && Array.isArray(j.experience))) add('F12', t, 'parse_cv JSON missing personal or experience');
      if (t === 'write_email' || t === 'write_follow_up_email') {
        if (typeof j.subject !== 'string' || typeof j.body !== 'string') add('F12', t, 'subject or body missing');
      }
    } catch {
      add('F12', t, 'output is not valid JSON');
      if (call.stop_reason === 'end_turn') add('F14', t, 'JSON did not close although the model stopped normally');
    }
  }

  // F18 production validation
  for (const fail of kit.failures) add('F18', fail.step, fail.message);

  // Documents
  const docs: Array<{ task: EvalTask; label: string; text: string; raw: string | null }> = [];
  const letter = inter?.coverLetter ?? null;
  if (letter) docs.push({ task: 'write_cover_letter', label: 'cover_letter', text: letter, raw: finalCall('write_cover_letter')?.raw_output ?? null });
  const em = inter?.applicationEmail;
  if (em) docs.push({ task: 'write_email', label: 'email', text: `${em.subject}\n${em.body}`, raw: finalCall('write_email')?.raw_output ?? null });
  const fu = inter?.followUpEmail;
  if (fu) docs.push({ task: 'write_follow_up_email', label: 'follow_up', text: `${fu.subject}\n${fu.body}`, raw: finalCall('write_follow_up_email')?.raw_output ?? null });
  const fit = inter?.fitAnalysis?.assessment;
  if (fit) docs.push({ task: 'fit_assessment', label: 'fit', text: fit, raw: finalCall('fit_assessment')?.raw_output ?? null });
  const cvd = inter?.optimizedCVData;
  let cvText = '';
  if (cvd) {
    cvText = [
      cvd.summary ?? '',
      ...cvd.experience.flatMap((e) => [e.company, e.position, ...e.bullets]),
      ...cvd.skills.flatMap((s) => s.items),
    ].join('\n');
    docs.push({ task: 'optimize_cv', label: 'cv', text: cvText, raw: finalCall('optimize_cv')?.raw_output ?? null });
  }

  const blacklist = getAllBlacklistedPhrases();
  for (const d of docs) {
    // F7 em and en dashes on the raw output
    const rawText = d.raw ?? d.text;
    const em1 = (rawText.match(/—/g) ?? []).length;
    const en1 = (rawText.match(/\s–\s/g) ?? []).length;
    if (em1 + en1 > 0) add('F7', d.task, `${em1} em dash, ${en1} spaced en dash in raw output`);

    // F1 numbers
    for (const n of numbersIn(d.text)) {
      if (srcNums.has(n)) continue;
      if (jdNums.has(n)) add('F1', d.task, `jd_only_number ${n}`);
      else add('F1', d.task, `number ${n} not in the CV or the ad`);
    }

    // F9 language
    const l = langOf(d.text);
    if (l && l !== c.language) add('F9', d.task, `${d.label} reads as ${l}, case is ${c.language}`);

    // F15 placeholders
    const ph = d.text.match(/\[[^\]]{2,40}\]/g);
    if (ph) add('F15', d.task, `placeholder ${ph.slice(0, 3).join(' ')}`);

    if (d.label !== 'cv') {
      // F8 voice
      if (c.language === 'en' && /\b[\w'-]+,\s+[\w'-]+(?:\s[\w'-]+)?,\s+(?:and|or)\s/i.test(d.text)) add('F8', d.task, 'Oxford comma pattern');
      if (/^(great|sure|absolutely|certainly)[!,. ]/i.test(d.text.trim())) add('F8', d.task, 'filler opener');
      const ex = (d.text.match(/!/g) ?? []).length;
      if (ex > 0) add('F8', d.task, `${ex} exclamation mark(s)`);
      if (d.label === 'cover_letter') {
        const norm = d.text.toLowerCase().replace(/\s+/g, ' ');
        for (const p of blacklist) if (norm.includes(p.toLowerCase())) add('F8', d.task, `blacklist phrase "${p}"`);
      }
      // F16 copying the ad
      const copy = longestCopy(d.text, c.jdText);
      if (copy) add('F16', d.task, `12 word run copied from the ad: "${copy}"`);
      // F10 German formality
      if (c.language === 'de') {
        if (/\b(du|dich|dein\w*|dir|euch)\b/i.test(d.text)) add('F10', d.task, 'informal du-form address');
        if ((d.label === 'cover_letter' || d.label === 'email') && !/(sehr geehrte|guten tag|hallo|liebe)/i.test(d.text)) add('F10', d.task, 'no German greeting found');
        if ((d.label === 'cover_letter' || d.label === 'email') && !/sehr geehrte|guten tag/i.test(d.text)) add('F10', d.task, 'greeting is not formal');
      }
      // F6 unknown named entities, F4 claimed missing skills
      if (d.label !== 'fit') {
        const adStems = stems(c.jdText);
        const caps = d.text.match(/(?<=[a-zäöü,;:] )[A-ZÄÖÜ][\p{L}\p{N}&.-]+(?: [A-ZÄÖÜ][\p{L}\p{N}&.-]+)*/gu) ?? [];
        const unknown = [...new Set(caps)].filter((t) => !supported(t, srcStems) && !supported(t, adStems));
        if (unknown.length) add('F6', d.task, `entity candidates: ${unknown.slice(0, 6).join('; ')}`);
        const hits = (inter?.match?.missingSkills ?? []).filter((m) => m.length > 2 && supported(m, stems(d.text)));
        if (hits.length) add('F4', d.task, `mentions requirement(s) the CV does not support: ${hits.slice(0, 6).join('; ')}`);
      }
    }
  }

  // F11 length and shape
  if (fit) {
    if (words(fit).length > 200) add('F11', 'fit_assessment', `${words(fit).length} words`);
    for (const h of ['**Strengths:**', '**Gaps:**', '**Recommendation:**']) if (!fit.includes(h)) add('F11', 'fit_assessment', `missing ${h}`);
    if (!/[.!?)"'»]$/.test(fit.trim())) add('F14', 'fit_assessment', 'does not end like a sentence');
  }
  if (letter && words(letter).length > 420) add('F11', 'write_cover_letter', `${words(letter).length} words`);
  if (em) {
    if (em.subject.length > 60) add('F11', 'write_email', `subject ${em.subject.length} chars`);
    const lines = em.body.split('\n').map((x) => x.trim()).filter(Boolean);
    const content = (lines.length >= 4 ? lines.slice(1, -2) : lines).join(' ');
    const sentences = content.split(/[.!?]+(?=\s|$)/u).map((x) => x.trim()).filter(Boolean).length;
    if (sentences > 4) add('F11', 'write_email', `${sentences} sentences`);
  }
  if (fu) {
    if (fu.subject.length > 60) add('F11', 'write_follow_up_email', `subject ${fu.subject.length} chars`);
    const lines = fu.body.split('\n').map((x) => x.trim()).filter(Boolean);
    const n = words((lines.length >= 4 ? lines.slice(1, -2) : lines).join(' ')).length;
    if (n > 80) add('F11', 'write_follow_up_email', `${n} words`);
    const want = c.language === 'de' ? 7 : 5;
    if (fu.recommendedDelay !== want) add('F11', 'write_follow_up_email', `recommendedDelay ${fu.recommendedDelay}, expected ${want}`);
  }

  // F17 identity
  const name = inter?.applicant?.name;
  const last = name ? name.trim().split(/\s+/).pop()!.toLowerCase() : null;
  if (last) {
    if (letter && !letter.toLowerCase().includes(last)) add('F17', 'write_cover_letter', 'applicant name missing from letter');
    if (em && !em.body.toLowerCase().includes(last)) add('F17', 'write_email', 'applicant name missing from email');
  }
  const company = inter?.job?.companyName;
  if (letter && company && company !== 'Unknown') {
    const first = company.toLowerCase().split(/[\s,.(]+/)[0];
    if (first && !letter.toLowerCase().includes(first)) add('F17', 'write_cover_letter', `company "${company}" not named in the letter`);
  }

  // F2, F3 CV grounding; F5 contact
  if (cvd) {
    for (const e of cvd.experience) {
      if (!supported(e.company, srcStems)) add('F2', 'optimize_cv', `employer not in CV: ${e.company}`);
      if (!supported(e.position, srcStems)) add('F2', 'optimize_cv', `title not in CV: ${e.position}`);
    }
    for (const e of cvd.education) {
      if (!supported(e.institution, srcStems)) add('F2', 'optimize_cv', `institution not in CV: ${e.institution}`);
      if (e.degree && !supported(e.degree, srcStems)) add('F2', 'optimize_cv', `degree not in CV: ${e.degree}`);
    }
    for (const s of cvd.skills.flatMap((x) => x.items)) if (!supported(s, srcStems)) add('F3', 'optimize_cv', `skill not in CV: ${s}`);
    if (cvd.personal.email && !source.includes(cvd.personal.email)) add('F5', 'optimize_cv', 'CV email not in source');
    if (cvd.personal.phone && !numbersIn(source).has(cvd.personal.phone.replace(/[^\d]/g, ''))) {
      const digits = cvd.personal.phone.replace(/\D/g, '');
      if (!source.replace(/\D/g, '').includes(digits)) add('F5', 'optimize_cv', 'CV phone not in source');
    }
  }
  const ap = inter?.applicant;
  if (ap) {
    if (ap.email && !source.includes(ap.email)) add('F5', 'extract_applicant', 'email not in source');
    if (ap.name && !source.toLowerCase().includes(ap.name.toLowerCase())) add('F5', 'extract_applicant', 'name not in source');
  }
  return f;
}

function main() {
  const run = arg('run');
  const armName = arg('arm');
  if (!run || !armName) throw new Error('usage: --run <results dir> --arm <arm>');
  const runDir = path.resolve(run);
  const pubDir = path.join(runDir, armName);
  const privDir = path.join(ROOT, 'evals', 'private', 'results', path.basename(runDir), armName);

  const cases = new Map(loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')).map((c) => [c.id, c]));
  const calls = [...readJsonl<CallRecord>(path.join(pubDir, 'calls.jsonl')), ...readJsonl<CallRecord>(path.join(privDir, 'calls.jsonl'))];
  const kits = [...readJsonl<KitRecord>(path.join(pubDir, 'kits.jsonl')), ...readJsonl<KitRecord>(path.join(privDir, 'kits.jsonl'))];
  if (kits.length === 0) throw new Error(`No kits found under ${pubDir} or ${privDir}. Run the arm first.`);

  const perKit: Array<{ case_id: string; origin: string; rep: number; findings: Finding[] }> = [];
  for (const kit of kits) {
    const row = cases.get(kit.case_id)!;
    const c = resolveCase(row);
    const dir = row.origin === 'owner' ? privDir : pubDir;
    const interFile = path.join(dir, 'intermediates', `${kit.case_id}.rep${kit.rep}.json`);
    const inter = fs.existsSync(interFile) ? (JSON.parse(fs.readFileSync(interFile, 'utf8')) as KitIntermediates) : null;
    // calls of the latest run that produced this kit: match on run_id of the kit
    const kitCalls = calls.filter((x) => x.case_id === kit.case_id && x.rep === kit.rep && x.run_id === kit.run_id);
    perKit.push({ case_id: kit.case_id, origin: row.origin, rep: kit.rep, findings: scoreKit(c, kitCalls, kit, inter) });
  }

  // aggregates, quality pass only (rep 1) for failure counts
  const q = perKit.filter((k) => k.rep === 1);
  const byId: Record<string, { kits: number; findings: number; byTask: Record<string, number> }> = {};
  for (const k of q) {
    const seen = new Set<string>();
    for (const x of k.findings) {
      const e = (byId[x.id] ??= { kits: 0, findings: 0, byTask: {} });
      e.findings++;
      e.byTask[x.task] = (e.byTask[x.task] ?? 0) + 1;
      if (!seen.has(x.id)) {
        e.kits++;
        seen.add(x.id);
      }
    }
  }

  // stats: latency, tokens, cost
  const tasks: EvalTask[] = ['parse_cv', 'extract_applicant', 'parse_job', 'skill_matching', 'extract_metrics', 'fit_assessment', 'optimize_cv', 'write_cover_letter', 'write_email', 'write_follow_up_email'];
  const cost = (x: CallRecord) => costUsd(x.request.model, x.usage!);
  const okCalls = calls.filter((x) => x.ok && x.usage);
  const perTask = tasks.map((t) => {
    const cs = okCalls.filter((x) => x.task === t);
    const lat = cs.map((x) => x.latency_ms);
    const clean = cs.filter((x) => x.concurrency === 1).map((x) => x.latency_ms);
    const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
    return {
      task: t,
      calls: cs.length,
      latency_ms_p50: pct(lat, 0.5),
      latency_ms_p95: pct(lat, 0.95),
      clean_latency_ms_p50: pct(clean, 0.5),
      clean_latency_ms_p95: pct(clean, 0.95),
      clean_n: clean.length,
      input_tokens_mean: mean(cs.map((x) => x.usage!.input)),
      cache_read_tokens_mean: mean(cs.map((x) => x.usage!.cacheRead)),
      cache_write_tokens_mean: mean(cs.map((x) => x.usage!.cacheWrite)),
      output_tokens_mean: mean(cs.map((x) => x.usage!.output)),
      cost_usd_total: cs.reduce((s, x) => s + cost(x), 0),
      retries: cs.reduce((s, x) => s + (x.attempts - 1), 0),
    };
  });
  const kitLat = (ks: KitRecord[]) => ({ n: ks.length, kit_ms_p50: pct(ks.map((k) => k.phases.fit_flow_ms + k.phases.gen_flow_ms), 0.5), kit_ms_p95: pct(ks.map((k) => k.phases.fit_flow_ms + k.phases.gen_flow_ms), 0.95) });
  const completeKits = kits.filter((k) => k.status !== 'aborted');
  const kitCosts = new Map<string, number>();
  for (const x of okCalls) kitCosts.set(`${x.case_id}|${x.rep}|${x.run_id}`, (kitCosts.get(`${x.case_id}|${x.rep}|${x.run_id}`) ?? 0) + cost(x));
  const stats = {
    calls_total: calls.length,
    calls_failed: calls.filter((x) => !x.ok).length,
    retries_total: calls.reduce((s, x) => s + Math.max(0, x.attempts - 1), 0),
    kits: { total: kits.length, complete: kits.filter((k) => k.status === 'complete').length, partial: kits.filter((k) => k.status === 'partial').length, aborted: kits.filter((k) => k.status === 'aborted').length },
    kit_latency_all_reps: kitLat(completeKits),
    kit_latency_clean_concurrency1: kitLat(completeKits.filter((k) => k.concurrency === 1)),
    cost_usd_total: [...kitCosts.values()].reduce((s, v) => s + v, 0),
    cost_usd_per_kit_mean: kitCosts.size ? [...kitCosts.values()].reduce((s, v) => s + v, 0) / kitCosts.size : NaN,
    perTask,
  };

  const summary = { run: path.basename(runDir), arm: armName, scored_kits_rep1: q.length, failure_counts_rep1: byId, stats };
  const pub = { ...summary, details: perKit.filter((k) => k.origin === 'synthetic') };
  fs.writeFileSync(path.join(pubDir, 'deterministic.json'), JSON.stringify(pub, null, 1));
  fs.mkdirSync(privDir, { recursive: true });
  fs.writeFileSync(path.join(privDir, 'deterministic-owner.json'), JSON.stringify(perKit.filter((k) => k.origin === 'owner'), null, 1));

  console.log(`scored ${q.length} kits (rep 1), ${kits.length} kits total`);
  for (const [id, e] of Object.entries(byId).sort()) console.log(`${id}: ${e.kits} kits, ${e.findings} findings`, JSON.stringify(e.byTask));
  console.log(JSON.stringify(stats.kits), `cost $${stats.cost_usd_total.toFixed(2)}`);
}

main();
