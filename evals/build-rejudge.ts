/**
 * Second-vendor re-judge. Samples 30% of judged pairs from SYNTHETIC cases only (owner data never
 * goes to a second vendor), writes blind packets plus one brief, and later merges the verdicts.
 *
 *   build:  npx tsx evals/build-rejudge.ts build --run <dir> --a <armdir> --b <armdir> [--fraction 0.3] [--seed rejudge-1]
 *   run:    codex exec -C <run>/rejudge -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only \
 *             -o <run>/rejudge/codex-<a>__vs__<b>.md - < <run>/rejudge/brief-<a>__vs__<b>.md
 *   merge:  npx tsx evals/build-rejudge.ts merge --run <dir> --a <armdir> --b <armdir> --codex <run>/rejudge/codex-<a>__vs__<b>.md
 *
 * Packets show "Output 1" and "Output 2" only. The key (packet to case, doc type and arm order)
 * is written outside the packets folder, to <run>/rejudge-key/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadCases, resolveCase } from './lib/cases';
import {
  DOC_TYPES,
  RUBRIC,
  VERDICT_SCHEMA,
  docText,
  groupPairs,
  judgeUserPrompt,
  loadIntermediates,
  loadVerdictRows,
  pairName,
  seededBit,
  seededFloat,
  validateVerdict,
  winnerArm,
  type DocType,
  type Verdict,
} from './lib/judge-common';

const ROOT = path.resolve(__dirname, '..');
const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

interface KeyRow {
  packet_id: string;
  case_id: string;
  doc_type: DocType;
  rep: number;
  output1_is: 'a' | 'b';
}

function build(runDir: string, a: string, b: string) {
  const fraction = Number(arg('fraction') ?? 0.3);
  const seed = arg('seed') ?? 'rejudge-1';
  const rep = 1;
  const cases = new Map(loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')).map((c) => [c.id, c]));
  const name = pairName(a, b);
  const synthetic = loadVerdictRows(runDir, a, b).filter((r) => r.origin === 'synthetic' && r.pass === 1 && !r.auto);
  // Seeded 30% per document type, so every type is represented.
  const picked: Array<{ case_id: string; doc_type: DocType }> = [];
  for (const t of DOC_TYPES) {
    const pool = synthetic.filter((r) => r.doc_type === t).sort((x, y) => seededFloat(seed, x.case_id, t) - seededFloat(seed, y.case_id, t));
    for (const r of pool.slice(0, Math.max(pool.length ? 1 : 0, Math.round(pool.length * fraction)))) picked.push({ case_id: r.case_id, doc_type: t });
  }
  if (picked.length === 0) throw new Error('No judged synthetic pairs found. Run judge.ts first.');

  const packetsDir = path.join(runDir, 'rejudge', 'packets');
  const keyDir = path.join(runDir, 'rejudge-key');
  fs.mkdirSync(packetsDir, { recursive: true });
  fs.mkdirSync(keyDir, { recursive: true });
  const key: KeyRow[] = [];
  const ids: string[] = [];
  for (const p of picked) {
    const row = cases.get(p.case_id)!;
    const c = resolveCase(row);
    const da = docText(loadIntermediates(runDir, a, row.origin, p.case_id, rep), p.doc_type);
    const db = docText(loadIntermediates(runDir, b, row.origin, p.case_id, rep), p.doc_type);
    if (!da || !db) continue;
    const output1_is = seededBit(seed, 'pos', p.case_id, p.doc_type) === 0 ? 'a' : 'b';
    const [o1, o2] = output1_is === 'a' ? [da, db] : [db, da];
    const packet_id = `p${String(key.length + 1).padStart(3, '0')}`;
    fs.writeFileSync(path.join(packetsDir, `${packet_id}.md`), judgeUserPrompt({ docType: p.doc_type, language: row.language, jd: c.jdText, cv: c.cvText, masterCv: c.masterCvText, output1: o1, output2: o2 }));
    key.push({ packet_id, case_id: p.case_id, doc_type: p.doc_type, rep, output1_is });
    ids.push(packet_id);
  }
  fs.writeFileSync(path.join(keyDir, `${name}.key.json`), JSON.stringify(key, null, 1));

  const brief = `You are an independent judge. Work only from the files in the current directory (the packets folder). Do not read anything outside it and do not look for model or arm names.

${ids.length} packets are in packets/${ids[0]}.md to packets/${ids[ids.length - 1]}.md. Each holds a job ad, a source CV and two outputs labelled Output 1 and Output 2 for one document type.

${RUBRIC}

For every packet, produce one verdict. Your final message must be ONLY a JSON array, one object per packet, no prose and no code fence:
[{"packet_id":"p001","winner":"1"|"2"|"tie","scores":{"grounding":{"output1":1-5,"output2":1-5},"specificity":{...},"voice":{...},"structure_length":{...},"language_formality":{...}},"fabrications":{"output1":["quoted unsupported claim"],"output2":[]},"reason":"one or two sentences"}]

Each verdict must follow this JSON schema (plus the packet_id field):
${JSON.stringify(VERDICT_SCHEMA)}
`;
  fs.writeFileSync(path.join(runDir, 'rejudge', `brief-${name}.md`), brief);
  console.log(`${key.length} packets (${DOC_TYPES.map((t) => `${t}:${key.filter((k) => k.doc_type === t).length}`).join(' ')}), key in ${path.relative(ROOT, keyDir)}`);
  const rj = path.relative(ROOT, path.join(runDir, 'rejudge'));
  console.log(`run:\ncodex exec -C ${rj} -m gpt-6-astra -c model_reasoning_effort="xhigh" -s read-only -o ${rj}/codex-${name}.md - < ${rj}/brief-${name}.md`);
}

function merge(runDir: string, a: string, b: string, codexFile: string) {
  const name = pairName(a, b);
  const key = JSON.parse(fs.readFileSync(path.join(runDir, 'rejudge-key', `${name}.key.json`), 'utf8')) as KeyRow[];
  const raw = fs.readFileSync(codexFile, 'utf8');
  const m = raw.match(/\[[\s\S]*\]/);
  if (!m) throw new Error('No JSON array found in the Codex output');
  const verdicts = JSON.parse(m[0]) as Array<Verdict & { packet_id: string }>;
  const opus = new Map(groupPairs(loadVerdictRows(runDir, a, b)).map((p) => [`${p.case_id}|${p.doc_type}`, p]));

  const rows: Array<{ case_id: string; doc_type: DocType; codex: string; opus: string }> = [];
  const invalid: string[] = [];
  for (const k of key) {
    const v = verdicts.find((x) => x.packet_id === k.packet_id);
    try {
      if (!v) throw new Error('missing');
      const codex = winnerArm(validateVerdict(v), k.output1_is);
      const o = opus.get(`${k.case_id}|${k.doc_type}`);
      if (o) rows.push({ case_id: k.case_id, doc_type: k.doc_type, codex, opus: o.winner });
    } catch (e) {
      invalid.push(`${k.packet_id}: ${(e as Error).message}`);
    }
  }
  const agree = (rs: typeof rows) => ({ n: rs.length, agree: rs.filter((r) => r.codex === r.opus).length, rate: rs.length ? rs.filter((r) => r.codex === r.opus).length / rs.length : null });
  const decisive = rows.filter((r) => r.opus !== 'tie' && r.codex !== 'tie');
  const out = {
    pair: name,
    packets: key.length,
    invalid,
    agreement_all: agree(rows),
    agreement_both_decisive: { ...agree(decisive), opposite_winner: decisive.filter((r) => r.codex !== r.opus).length },
    by_doc_type: Object.fromEntries(DOC_TYPES.map((t) => [t, agree(rows.filter((r) => r.doc_type === t))])),
  };
  fs.writeFileSync(path.join(runDir, 'rejudge', `agreement-${name}.json`), JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
}

function main() {
  const cmd = process.argv[2];
  const run = arg('run');
  const a = arg('a');
  const b = arg('b');
  if (!['build', 'merge'].includes(cmd) || !run || !a || !b) throw new Error('usage: build|merge --run <dir> --a <armdir> --b <armdir> [--codex <file>]');
  const runDir = path.resolve(run);
  if (cmd === 'build') build(runDir, a, b);
  else {
    const codex = arg('codex');
    if (!codex) throw new Error('merge needs --codex <file>');
    merge(runDir, a, b, path.resolve(codex));
  }
}

main();
