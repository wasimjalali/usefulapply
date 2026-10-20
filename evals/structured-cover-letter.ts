/**
 * Structured cover letter eval, live part (PR 4 of the MCP integration,
 * PLAN.md section 5). The offline part, which needs no API key, is
 * evals/structured-cover-letter-offline.ts.
 *
 * Question: does the writer agent, returning the structured letter contract
 * (model writes subject, salutation, paragraphs, closing and the recipient
 * details the ad states; code verifies them against the ad and fills sender,
 * date, place, market), still write grounded, dash-free letters under 250
 * words, with the right market conventions and no invented recipient detail?
 *
 *   npx tsx evals/structured-cover-letter.ts --allow-anthropic-api --out-sub <new-folder> [--cases a,b]
 *
 * One run per case on the production request shape (Sonnet 5.5, adaptive
 * thinking, effort low, no temperature) through the eval client, so nothing
 * reaches the production ledger. Each case runs the real analysis calls
 * (extract_applicant, parse_job, extract_metrics, skill_matching) and then
 * the real unifiedWriterAgent.generateCoverLetter(). No session row exists.
 *
 * Every run writes into its own --out-sub folder under the results directory
 * and refuses a folder that already holds a run, so no earlier run is ever
 * overwritten. (Run 1 sits in the results directory itself.)
 *
 * Credentials: loads .env.local / .dev.vars from the cwd or the main checkout (never printed).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ARMS } from './lib/arms';
import { loadCases, resolveCase, type CaseRow, type ResolvedCase } from './lib/cases';
import { installHooks } from './lib/hooks';
import * as shim from './lib/models-shim';
import { costUsd } from './lib/pricing';
import type { CallRecord } from './lib/types';
import type { MasterContext } from '../src/lib/agents/types';
import type { StructuredCoverLetter } from '../src/lib/cover-letter/contract';

const ROOT = path.resolve(__dirname, '..');
const RESULTS = path.join(ROOT, 'evals', 'results', '2026-10-20-structured-cover-letter');
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

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
      // A missing file is fine (the key may be in the environment); report
      // only the error code, never the contents.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') console.warn(`env file ${path.basename(file)} not loaded: ${code ?? 'unknown error'}`);
    }
  }
}

interface CaseResult {
  case_id: string;
  language: string;
  ok: boolean;
  error: string | null;
  cover_letter_calls: number;
  body: string | null;
  structured: StructuredCoverLetter | null;
  raw_letter_outputs: string[];
  context: {
    applicant: MasterContext['applicant'] | null;
    job: MasterContext['job'] | null;
    match: MasterContext['match'] | null;
    verifiedMetrics: string[];
  };
  checks: Record<string, { pass: boolean; detail: string }>;
}

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
const norm = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/ß/gu, 'ss').replace(/\s+/gu, ' ').trim();

/**
 * The contract, field by field: the same conditions as isStructuredCoverLetter
 * in src/lib/cover-letter/contract.ts, named so a failure says which field.
 */
function contractIssues(letter: unknown, isStructured: (v: unknown) => boolean): string[] {
  if (!letter || typeof letter !== 'object') return ['not an object'];
  const v = letter as Record<string, unknown>;
  const sender = (v.sender ?? {}) as Record<string, unknown>;
  const recipient = (v.recipient ?? {}) as Record<string, unknown>;
  const isText = (x: unknown) => typeof x === 'string';
  const isFilled = (x: unknown) => typeof x === 'string' && x.trim().length > 0;
  const isTextList = (x: unknown) => Array.isArray(x) && x.every(isText);
  const isOptionalText = (x: unknown) => x === undefined || isText(x);
  const rules: Array<[string, boolean]> = [
    ['version is 2', v.version === 2],
    ['language filled', isFilled(v.language)],
    ['market us or dach', v.market === 'us' || v.market === 'dach'],
    ['date filled', isFilled(v.date)],
    ['subject filled', isFilled(v.subject)],
    ['salutation filled', isFilled(v.salutation)],
    ['paragraphs a non-empty text list', isTextList(v.paragraphs) && (v.paragraphs as unknown[]).length > 0],
    ['closing filled', isFilled(v.closing)],
    ['signatureName filled', isFilled(v.signatureName)],
    ['place optional text', isOptionalText(v.place)],
    ['sender an object', !!v.sender && typeof v.sender === 'object'],
    ['sender.name filled', isFilled(sender.name)],
    ['sender.addressLines a text list', isTextList(sender.addressLines)],
    ['sender.phone optional text', isOptionalText(sender.phone)],
    ['sender.email optional text', isOptionalText(sender.email)],
    ['sender.links optional text list', sender.links === undefined || isTextList(sender.links)],
    ['recipient an object', !!v.recipient && typeof v.recipient === 'object'],
    ['recipient.addressLines a text list', isTextList(recipient.addressLines)],
    ['recipient.companyName optional text', isOptionalText(recipient.companyName)],
    ['recipient.contactPerson optional text', isOptionalText(recipient.contactPerson)],
    ['recipient.department optional text', isOptionalText(recipient.department)],
  ];
  const issues = rules.filter(([, ok]) => !ok).map(([name]) => name);
  // The named rules and the shared guard must agree, or this copy has drifted.
  if ((issues.length === 0) !== isStructured(letter)) issues.push('contractIssues and isStructuredCoverLetter disagree');
  return issues;
}

/** Beyond the contract: an ISO date and no empty lines in the lists the renderer prints. */
function formIssues(letter: StructuredCoverLetter): string[] {
  const issues: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(letter.date)) issues.push('date is not ISO YYYY-MM-DD');
  for (const [name, list] of [['paragraphs', letter.paragraphs], ['sender.addressLines', letter.sender.addressLines], ['recipient.addressLines', letter.recipient.addressLines]] as const) {
    if (list.some((line) => !line.trim())) issues.push(`${name} has an empty line`);
  }
  return issues;
}

async function main() {
  if (!process.argv.includes('--allow-anthropic-api')) {
    throw new Error('This eval calls the paid Anthropic API. Pass --allow-anthropic-api.');
  }
  const outSub = arg('out-sub');
  if (!outSub) throw new Error('Pass --out-sub <new-folder>: every run gets its own folder, so no earlier run is overwritten.');
  const OUT = path.join(RESULTS, outSub);
  if (fs.existsSync(path.join(OUT, 'summary.json'))) throw new Error(`${path.relative(ROOT, OUT)} already holds a run. Pick a new --out-sub.`);
  const caseIds = arg('cases')?.split(',') ?? ['syn-01', 'syn-07', 'syn-11', 'syn-15', 'syn-16', 'sl-de-contact', 'sl-us-address', 'sl-fr-contact'];

  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (checked the environment, .env.local and .dev.vars)');

  const arm = { ...ARMS['sonnet55-low'] };
  installHooks(arm.promptVariant, shim);
  const { unifiedWriterAgent } = await import('../src/lib/agents/unified-writer-agent');
  const { isStructuredCoverLetter } = await import('../src/lib/cover-letter/contract');
  const { renderCoverLetterBody } = await import('../src/lib/agents/cover-letter-structure');

  const rows: CaseRow[] = [
    ...loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')),
    ...loadCases(path.join(ROOT, 'evals', 'dataset', 'structured-letter-cases.jsonl')),
  ].filter((row) => caseIds.includes(row.id));
  if (rows.length !== caseIds.length) throw new Error('A case id is missing from the datasets');

  fs.mkdirSync(path.join(OUT, 'letters'), { recursive: true });
  const callsFile = path.join(OUT, 'calls.jsonl');
  const runId = crypto.randomUUID();
  const calls: CallRecord[] = [];

  async function runCase(row: CaseRow): Promise<CaseResult> {
    const c: ResolvedCase = resolveCase(row);
    const ctx: shim.CallContext = {
      runId,
      caseId: c.id,
      rep: 1,
      arm,
      concurrency: 3,
      seq: { n: 0 },
      lastRaw: new Map(),
      record: (r: CallRecord) => {
        calls.push(r);
        fs.appendFileSync(callsFile, JSON.stringify(r) + '\n');
      },
    };
    const context: MasterContext = {
      sessionId: `eval-${c.id}`,
      jobDescription: c.jdText,
      rawCV: c.cvText,
      masterCV: c.masterCvText ?? undefined,
      detectedLanguage: c.language,
    };
    const result: CaseResult = {
      case_id: c.id,
      language: c.language,
      ok: false,
      error: null,
      cover_letter_calls: 0,
      body: null,
      structured: null,
      raw_letter_outputs: [],
      context: { applicant: null, job: null, match: null, verifiedMetrics: [] },
      checks: {},
    };
    await shim.callContext.run(ctx, async () => {
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
        const letter = await unifiedWriterAgent.generateCoverLetter(context);
        result.body = letter.result.body;
        result.structured = letter.result.structured;
        result.ok = true;
      } catch (error) {
        result.error = (error as Error).message;
      }
    });
    const letterCalls = calls.filter((r) => r.case_id === c.id && r.task === 'write_cover_letter');
    result.cover_letter_calls = letterCalls.length;
    result.raw_letter_outputs = letterCalls.map((r) => r.raw_output ?? '');
    result.context = {
      applicant: context.applicant ?? null,
      job: context.job ?? null,
      match: context.match ?? null,
      verifiedMetrics: context.verifiedMetrics ?? [],
    };
    return result;
  }

  // Three at a time.
  const results: CaseResult[] = [];
  for (let i = 0; i < rows.length; i += 3) {
    results.push(...await Promise.all(rows.slice(i, i + 3).map(runCase)));
  }

  for (const r of results) {
    const row = rows.find((x) => x.id === r.case_id)!;
    const c = resolveCase(row);
    const checks = r.checks;
    const add = (name: string, pass: boolean, detail = '') => { checks[name] = { pass, detail }; };
    if (!r.ok || !r.structured || r.body === null) {
      add('generated', false, r.error ?? 'no letter');
      continue;
    }
    const l = r.structured;
    const sourceCv = [c.cvText, c.masterCvText ?? ''].join('\n');
    const paragraphsText = l.paragraphs.join('\n');

    const contract = contractIssues(l, isStructuredCoverLetter);
    add('contract_valid', contract.length === 0, contract.join('; '));
    const form = formIssues(l);
    add('fields_well_formed', form.length === 0, form.join('; '));

    // An ad with an application address must give a filled block, every line
    // the ad's own text; any other ad gives an empty block. No address line
    // from the ad may reach the letter text.
    const expectsAddress = row.tags.includes('address-in-jd');
    const verbatim = l.recipient.addressLines.every((line) => norm(c.jdText).includes(norm(line)));
    add(
      'recipient_address_rule',
      expectsAddress ? l.recipient.addressLines.length >= 2 && verbatim : l.recipient.addressLines.length === 0,
      JSON.stringify(l.recipient.addressLines),
    );
    const adAddressLines = c.jdText.split('\n').map((x) => x.trim()).filter((x) => (
      /\b\d{5}(?:\s+\p{L}|$)/u.test(x) || /(straße|strasse|street|avenue)\s*\d/iu.test(x) || /^\d+\s+\p{L}+.*(street|avenue|boulevard|road|rue|st\.)/iu.test(x)
    ));
    const letterText = norm([l.subject, l.salutation, ...l.paragraphs].join('\n'));
    const leaked = adAddressLines.filter((x) => letterText.includes(norm(x)));
    add('no_address_in_letter_text', leaked.length === 0, leaked.join(' | ') || `ad address lines: ${adAddressLines.length}`);

    // Contact: only when the ad states one, copied verbatim, and the
    // salutation addresses that person by surname.
    const expectsContact = row.tags.includes('contact-person');
    const surname = l.recipient.contactPerson?.split(/\s+/u).pop() ?? '';
    const contactOk = expectsContact
      ? Boolean(l.recipient.contactPerson && norm(c.jdText).includes(norm(l.recipient.contactPerson)) && surname && l.salutation.includes(surname))
      : !l.recipient.contactPerson && !l.recipient.department;
    add('contact_rule', contactOk, `company=${l.recipient.companyName ?? ''} contact=${l.recipient.contactPerson ?? ''} dept=${l.recipient.department ?? ''} salutation=${l.salutation}`);

    // Numbers in the paragraphs: from the CV, or employer facts quoted from the ad.
    const numbers = paragraphsText.match(/\d+(?:[.,]\d+)?/gu) ?? [];
    const fromNowhere = numbers.filter((n) => !sourceCv.includes(n) && !c.jdText.includes(n));
    const adOnly = numbers.filter((n) => !sourceCv.includes(n) && c.jdText.includes(n));
    add('numbers_traced', fromNowhere.length === 0, `cv-or-ad: ${numbers.length}, ad-only (employer facts, review): ${adOnly.join(',') || 'none'}, untraced: ${fromNowhere.join(',') || 'none'}`);

    // Fabrication bait: a skill the matcher marked missing, named in the letter.
    const baitHits = (r.context.match?.missingSkills ?? []).filter((s) => s.length > 2 && norm(paragraphsText).includes(norm(s)));
    add('no_missing_skill_named', baitHits.length === 0, baitHits.join(', ') || 'none');

    const rawDashes = r.raw_letter_outputs.join('').split('').filter((ch) => ch === EM_DASH || ch === EN_DASH).length;
    const bodyDashes = r.body.split('').filter((ch) => ch === EM_DASH || ch === EN_DASH).length;
    add('no_dashes', bodyDashes === 0, `body ${bodyDashes}, raw model output ${rawDashes}`);

    const wordCount = words(paragraphsText);
    add('under_250_words', wordCount < 250, `${wordCount} words in ${l.paragraphs.length} paragraphs`);
    add('three_paragraphs', l.paragraphs.length === 3, String(l.paragraphs.length));

    if (c.language === 'de') {
      const ok = l.market === 'dach' && l.closing === 'Mit freundlichen Grüßen' && /^Bewerbung als /u.test(l.subject) && !/betreff/iu.test(l.subject);
      add('market_rules', ok, `market=${l.market} closing="${l.closing}" subject="${l.subject}"`);
    } else if (c.language === 'en') {
      const ok = l.market === 'us' && /^(Sincerely|Kind regards|Best regards),$/u.test(l.closing) && /^Application for /u.test(l.subject);
      add('market_rules', ok, `market=${l.market} closing="${l.closing}" subject="${l.subject}"`);
    } else {
      // French: not a DACH market, a French subject and a French closing.
      const ok = l.market === 'us' && /^Candidature/u.test(l.subject) && /\p{L}/u.test(l.closing) && !l.closing.includes(l.signatureName);
      add('market_rules', ok, `market=${l.market} closing="${l.closing}" subject="${l.subject}"`);
    }
    const subjectNumbers = l.subject.match(/(?<!\d)\d{3,}(?!\d)/gu) ?? [];
    add('subject_numbers_from_ad', subjectNumbers.every((n) => c.jdText.includes(n)), subjectNumbers.join(',') || 'none');

    const rendered = renderCoverLetterBody(l);
    const containsAll = [l.subject, l.salutation, ...l.paragraphs, l.closing, l.signatureName, l.sender.name].every((part) => r.body!.includes(part));
    add('body_faithful', rendered === r.body && containsAll, rendered === r.body ? 'body === renderCoverLetterBody(structured)' : 'body differs from rendering');

    add('sender_from_cv', [l.sender.name, l.sender.email ?? '', l.sender.phone ?? '', ...l.sender.addressLines, ...(l.sender.links ?? [])].every((v) => !v || c.cvText.includes(v)), JSON.stringify(l.sender));
    add('no_placeholders', !/\[[^\]]+\]/u.test(r.body), '');
  }

  // Cost and tokens from the call records.
  const sum = (records: CallRecord[]) => {
    const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
    for (const r of records) {
      if (!r.usage) continue;
      totals.input += r.usage.input;
      totals.output += r.usage.output;
      totals.cacheWrite += r.usage.cacheWrite;
      totals.cacheRead += r.usage.cacheRead;
    }
    return totals;
  };
  const totals = sum(calls);
  const letterCalls = calls.filter((r) => r.task === 'write_cover_letter');
  const summary = {
    run_id: runId,
    date: new Date().toISOString(),
    model: arm.modelId,
    request_shape: { thinking: arm.thinking, effort: arm.effort, temperature: null, maxTokensScale: arm.maxTokensScale },
    calls: calls.length,
    cover_letter_calls: letterCalls.length,
    tokens: totals,
    cost_usd: costUsd(arm.modelId, totals),
    cover_letter_cost_usd: costUsd(arm.modelId, sum(letterCalls)),
    cover_letter_latency_ms: letterCalls.map((r) => r.latency_ms),
    cases: results.map((r) => ({ case_id: r.case_id, ok: r.ok, error: r.error, cover_letter_calls: r.cover_letter_calls, checks: r.checks })),
  };

  for (const r of results) {
    if (r.body) fs.writeFileSync(path.join(OUT, 'letters', `${r.case_id}.txt`), r.body + '\n');
    fs.writeFileSync(path.join(OUT, 'letters', `${r.case_id}.json`), JSON.stringify(r, null, 1) + '\n');
  }
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');

  for (const r of summary.cases) {
    const failed = Object.entries(r.checks).filter(([, v]) => !v.pass).map(([k, v]) => `${k} (${v.detail})`);
    console.log(`${r.case_id}: ${r.ok ? 'ok' : 'FAILED'} letter calls=${r.cover_letter_calls} ${failed.length ? 'FAILS: ' + failed.join('; ') : 'all checks pass'}`);
  }
  console.log(`calls ${summary.calls}, cost $${summary.cost_usd.toFixed(4)} (cover letter calls $${summary.cover_letter_cost_usd.toFixed(4)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
