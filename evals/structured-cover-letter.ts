/**
 * Structured cover letter eval (PR 4 of the MCP integration, PLAN.md section 5).
 *
 * Question: does the writer agent, now returning the structured letter contract
 * (model writes subject, salutation, paragraphs, closing and JD-stated contact;
 * code fills sender, recipient, date, place, market), still write grounded,
 * dash-free letters under 250 words, with the right US and DACH conventions and
 * no invented recipient address?
 *
 *   npx tsx evals/structured-cover-letter.ts --allow-anthropic-api
 *
 * Six cases, one run each, on the production request shape (Sonnet 5.5,
 * adaptive thinking, effort low, no temperature) through the eval client, so
 * nothing reaches the production ledger. Each case runs the real analysis
 * calls (extract_applicant, parse_job, extract_metrics, skill_matching) and
 * then the real unifiedWriterAgent.generateCoverLetter(). No session row
 * exists, so recipient address lines must come back empty. One extra variant
 * re-assembles the contact case's model fields with a saved session address
 * (no model call) to check the verified-column path.
 *
 * Credentials: loads .env.local from the cwd or the main checkout (never printed).
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
const OUT = path.join(ROOT, 'evals', 'results', '2026-10-20-structured-cover-letter');
const CASE_IDS = ['syn-01', 'syn-07', 'syn-11', 'syn-15', 'syn-16', 'sl-de-contact'];
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

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
const norm = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();

/** Deep shape check against the contract, beyond the isStructuredCoverLetter guard. */
function contractIssues(letter: unknown, isStructured: (v: unknown) => boolean): string[] {
  const issues: string[] = [];
  if (!isStructured(letter)) return ['isStructuredCoverLetter() rejected it'];
  const l = letter as StructuredCoverLetter;
  const str = (v: unknown, name: string, optional = false) => {
    if (v === undefined && optional) return;
    if (typeof v !== 'string' || (!optional && !v.trim())) issues.push(`${name} is not a non-empty string`);
  };
  const strArr = (v: unknown, name: string) => {
    if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !x.trim())) issues.push(`${name} is not a string array`);
  };
  if (l.version !== 2) issues.push('version');
  str(l.language, 'language');
  if (l.market !== 'us' && l.market !== 'dach') issues.push('market');
  str(l.sender.name, 'sender.name');
  strArr(l.sender.addressLines, 'sender.addressLines');
  str(l.sender.phone, 'sender.phone', true);
  str(l.sender.email, 'sender.email', true);
  if (l.sender.links !== undefined) strArr(l.sender.links, 'sender.links');
  str(l.recipient.companyName, 'recipient.companyName', true);
  str(l.recipient.contactPerson, 'recipient.contactPerson', true);
  str(l.recipient.department, 'recipient.department', true);
  strArr(l.recipient.addressLines, 'recipient.addressLines');
  str(l.place, 'place', true);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(l.date)) issues.push('date is not ISO YYYY-MM-DD');
  str(l.subject, 'subject');
  str(l.salutation, 'salutation');
  strArr(l.paragraphs, 'paragraphs');
  if (l.paragraphs.length === 0) issues.push('no paragraphs');
  str(l.closing, 'closing');
  str(l.signatureName, 'signatureName');
  return issues;
}

async function main() {
  if (!process.argv.includes('--allow-anthropic-api')) {
    throw new Error('This eval calls the paid Anthropic API. Pass --allow-anthropic-api.');
  }
  loadEnv();
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set (checked the environment and .env.local)');

  const arm = { ...ARMS['sonnet55-low'] };
  installHooks(arm.promptVariant, shim);
  const { unifiedWriterAgent } = await import('../src/lib/agents/unified-writer-agent');
  const { isStructuredCoverLetter } = await import('../src/lib/cover-letter/contract');
  const { assembleStructuredCoverLetter, renderCoverLetterBody } = await import('../src/lib/agents/cover-letter-structure');

  const rows: CaseRow[] = [
    ...loadCases(path.join(ROOT, 'evals', 'dataset', 'cases.jsonl')),
    ...loadCases(path.join(ROOT, 'evals', 'dataset', 'structured-letter-cases.jsonl')),
  ].filter((row) => CASE_IDS.includes(row.id));
  if (rows.length !== CASE_IDS.length) throw new Error('A case id is missing from the datasets');

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

  // Three at a time: six cases, one run each.
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

    // No session row in the eval, so the recipient address must be empty, and
    // no address line from the ad may reach the body.
    add('recipient_address_empty', l.recipient.addressLines.length === 0, JSON.stringify(l.recipient.addressLines));
    const adAddressLines = c.jdText.split('\n').map((x) => x.trim()).filter((x) => /\b\d{5}\s+\p{L}/u.test(x) || /(straße|strasse|street|avenue)\s*\d/iu.test(x));
    const leaked = adAddressLines.filter((x) => norm(r.body!).includes(norm(x)));
    add('no_ad_address_in_body', leaked.length === 0, leaked.join(' | ') || `ad address lines: ${adAddressLines.length}`);

    // Contact person: only when the ad states one, and then copied verbatim.
    const expectsContact = row.tags.includes('contact-person');
    const contactOk = expectsContact
      ? Boolean(l.recipient.contactPerson && c.jdText.includes(l.recipient.contactPerson) && /Brandl/u.test(l.salutation))
      : !l.recipient.contactPerson && !l.recipient.department;
    add('contact_rule', contactOk, `contact=${l.recipient.contactPerson ?? ''} dept=${l.recipient.department ?? ''} salutation=${l.salutation}`);

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
    } else {
      const ok = l.market === 'us' && /^(Sincerely|Kind regards|Best regards),$/u.test(l.closing) && /^Application for /u.test(l.subject);
      add('market_rules', ok, `market=${l.market} closing="${l.closing}" subject="${l.subject}"`);
    }
    const subjectNumbers = l.subject.match(/\d+/gu) ?? [];
    add('subject_numbers_from_ad', subjectNumbers.every((n) => c.jdText.includes(n)), subjectNumbers.join(',') || 'none');

    const rendered = renderCoverLetterBody(l);
    const containsAll = [l.subject, l.salutation, ...l.paragraphs, l.closing, l.signatureName, l.sender.name].every((part) => r.body!.includes(part));
    add('body_faithful', rendered === r.body && containsAll, rendered === r.body ? 'body === renderCoverLetterBody(structured)' : 'body differs from rendering');

    add('sender_from_cv', [l.sender.name, l.sender.email ?? '', l.sender.phone ?? '', ...l.sender.addressLines, ...(l.sender.links ?? [])].every((v) => !v || c.cvText.includes(v)), JSON.stringify(l.sender));
    add('no_placeholders', !/\[[^\]]+\]/u.test(r.body), '');
  }

  // Verified-column path: re-assemble the contact case with a saved session
  // address (no model call). The address must appear exactly as saved.
  const contactCase = results.find((r) => r.case_id === 'sl-de-contact');
  let columnVariant: Record<string, unknown> | null = null;
  if (contactCase?.structured && contactCase.context.applicant && contactCase.context.job) {
    const s = contactCase.structured;
    const savedAddress = 'Industriestraße 14\n90431 Nürnberg';
    const context: MasterContext = {
      sessionId: 'eval-column-variant',
      jobDescription: resolveCase(rows.find((x) => x.id === 'sl-de-contact')!).jdText,
      rawCV: resolveCase(rows.find((x) => x.id === 'sl-de-contact')!).cvText,
      detectedLanguage: 'de',
      applicant: contactCase.context.applicant,
      job: contactCase.context.job,
      letterRecipient: { companyName: 'Brenner Getriebe GmbH', address: savedAddress, contactPerson: 'Frau Melanie Brandl' },
    };
    const letter = assembleStructuredCoverLetter(context, 'de', {
      subject: s.subject,
      salutation: s.salutation,
      paragraphs: s.paragraphs,
      closing: s.closing,
      contactPerson: s.recipient.contactPerson,
      department: s.recipient.department,
    }, s.date);
    const body = renderCoverLetterBody(letter);
    columnVariant = {
      recipient: letter.recipient,
      pass: letter.recipient.addressLines.join('\n') === savedAddress && body.includes(savedAddress) && letter.recipient.companyName === 'Brenner Getriebe GmbH',
      body,
    };
  }

  // Cost and tokens from the call records.
  const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const r of calls) {
    if (!r.usage) continue;
    totals.input += r.usage.input;
    totals.output += r.usage.output;
    totals.cacheWrite += r.usage.cacheWrite;
    totals.cacheRead += r.usage.cacheRead;
  }
  const letterCalls = calls.filter((r) => r.task === 'write_cover_letter');
  const letterTotals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const r of letterCalls) {
    if (!r.usage) continue;
    letterTotals.input += r.usage.input;
    letterTotals.output += r.usage.output;
    letterTotals.cacheWrite += r.usage.cacheWrite;
    letterTotals.cacheRead += r.usage.cacheRead;
  }
  const summary = {
    run_id: runId,
    date: new Date().toISOString(),
    model: arm.modelId,
    request_shape: { thinking: arm.thinking, effort: arm.effort, temperature: null, maxTokensScale: arm.maxTokensScale },
    calls: calls.length,
    cover_letter_calls: letterCalls.length,
    tokens: totals,
    cost_usd: costUsd(arm.modelId, totals),
    cover_letter_cost_usd: costUsd(arm.modelId, letterTotals),
    cover_letter_latency_ms: letterCalls.map((r) => r.latency_ms),
    cases: results.map((r) => ({ case_id: r.case_id, ok: r.ok, error: r.error, cover_letter_calls: r.cover_letter_calls, checks: r.checks })),
    column_variant: columnVariant,
  };

  for (const r of results) {
    if (r.body) fs.writeFileSync(path.join(OUT, 'letters', `${r.case_id}.txt`), r.body + '\n');
    fs.writeFileSync(path.join(OUT, 'letters', `${r.case_id}.json`), JSON.stringify(r, null, 1) + '\n');
  }
  if (columnVariant) fs.writeFileSync(path.join(OUT, 'letters', 'sl-de-contact.column-variant.txt'), `${columnVariant.body as string}\n`);
  fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 1) + '\n');

  for (const r of summary.cases) {
    const failed = Object.entries(r.checks).filter(([, v]) => !v.pass).map(([k, v]) => `${k} (${v.detail})`);
    console.log(`${r.case_id}: ${r.ok ? 'ok' : 'FAILED'} letter calls=${r.cover_letter_calls} ${failed.length ? 'FAILS: ' + failed.join('; ') : 'all checks pass'}`);
  }
  console.log(`column variant: ${columnVariant ? (columnVariant.pass ? 'pass' : 'FAIL') : 'not run'}`);
  console.log(`calls ${summary.calls}, cost $${summary.cost_usd.toFixed(4)} (cover letter calls $${summary.cover_letter_cost_usd.toFixed(4)})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
