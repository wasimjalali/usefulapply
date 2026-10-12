/**
 * End-to-end check of isolated kit failures and length-free validation.
 *
 * Runs the real writer agent (run and runWithContext, so both Apply Directly
 * and Analyze First), the real callModel and callAnthropic, the real
 * validators and the real credits repo against a fresh local D1 (wrangler
 * getPlatformProxy, every migration in migrations/d1 applied). Only the
 * Anthropic transport is stubbed: Messages.create / Messages.stream return
 * scripted answers per writer. The context builders (profile, JD, metrics,
 * language, match) return fixed data so each scenario controls the documents.
 *
 * The credit scenarios run the same sequence the agent-v2 route runs: reserve,
 * run, then release on a failed kit, or capture plus refundReservationPartially
 * with KIT_DOCUMENT_FAILURE_REFUND on a partial one.
 *
 * Run: npx tsx scripts/verify-kit-isolation.ts <out-dir>
 * Writes <out-dir>/kit-isolation-report.json and exits non-zero on any failure.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AnyD1Database } from 'drizzle-orm/d1';

process.env.AI_PROVIDER = 'anthropic';
process.env.ANTHROPIC_API_KEY = 'stub-key-not-real';

const repoRoot = resolve(__dirname, '..');
const outDir = resolve(process.argv[2] ?? join(repoRoot, 'verify', 'kit-isolation'));

// ---------------------------------------------------------------------------
// Local D1
// ---------------------------------------------------------------------------

const work = mkdtempSync(join(tmpdir(), 'kit-isolation-'));
const persistTo = join(work, 'state');
const configPath = join(work, 'wrangler.json');
writeFileSync(configPath, JSON.stringify({
  name: 'kit-isolation-check',
  compatibility_date: '2026-08-17',
  compatibility_flags: ['nodejs_compat'],
  d1_databases: [{
    binding: 'DB',
    database_name: 'usefulapply-db',
    database_id: '00000000-0000-4000-8000-00000000d1d1',
    migrations_dir: join(repoRoot, 'migrations', 'd1'),
  }],
}, null, 2));

// ---------------------------------------------------------------------------
// Stubbed model transport
// ---------------------------------------------------------------------------

type Writer = 'cv' | 'coverLetter' | 'applicationEmail' | 'followUpEmail' | 'fit';
type Behaviour = 'ok' | 'long' | 'throw' | 'placeholder';

const calls: Record<Writer, number> = { cv: 0, coverLetter: 0, applicationEmail: 0, followUpEmail: 0, fit: 0 };
const prompts: Record<Writer, string[]> = { cv: [], coverLetter: [], applicationEmail: [], followUpEmail: [], fit: [] };
let behaviour: Record<Writer, Behaviour> = { cv: 'ok', coverLetter: 'ok', applicationEmail: 'ok', followUpEmail: 'ok', fit: 'ok' };

function resetModel(next: Partial<Record<Writer, Behaviour>>) {
  behaviour = { cv: 'ok', coverLetter: 'ok', applicationEmail: 'ok', followUpEmail: 'ok', fit: 'ok', ...next };
  for (const key of Object.keys(calls) as Writer[]) {
    calls[key] = 0;
    prompts[key] = [];
  }
}

function writerFor(system: unknown): Writer {
  const text = Array.isArray(system)
    ? system.map((block) => (block as { text?: string }).text ?? '').join('\n')
    : String(system ?? '');
  if (text.includes('You are the Writer Agent for Useful Apply')) return 'cv';
  if (text.includes('You are an expert cover letter writer for Useful Apply')) return 'coverLetter';
  if (text.includes('You write job application emails for Useful Apply')) return 'applicationEmail';
  if (text.includes('You are the follow-up email writer for Useful Apply')) return 'followUpEmail';
  if (text.includes('You are Useful Apply, a senior talent acquisition specialist')) return 'fit';
  throw new Error('Stub got a call from an unknown writer');
}

const NAME = 'Tomas Brandt';

const CV_JSON = JSON.stringify({
  personal: { fullName: NAME, email: 'tomas.brandt@example.com', city: 'Chicago', currentTitle: 'Financial Analyst' },
  summary: 'Financial analyst with 5 years of experience in budgeting, forecasting and month-end reporting.',
  experience: [{
    id: 'exp-1',
    company: 'Calder Industrial Components',
    position: 'Financial Analyst',
    startDate: 'Mar 2022',
    current: true,
    bullets: [
      'Own the monthly forecast and variance reporting for two business units',
      'Improved forecast accuracy for the larger unit from 88% to 96%',
    ],
  }],
  education: [{ id: 'edu-1', institution: 'University of Illinois Chicago', degree: 'B.S. Finance' }],
  skills: [{ category: 'Tools', items: ['Excel', 'Power BI', 'SAP'] }],
  languages: [{ language: 'English', proficiency: 'Native' }],
  certifications: [],
  projects: [],
  customSections: [],
  additionalInfo: [],
  analysis: { summary: 'Tailored to FP&A.', key_changes: ['Led with forecasting'], ats_compatibility: 82, missing_keywords_added: [] },
  sectionHeaders: { summary: 'Summary', experience: 'Experience' },
  localizedStrings: { present: 'Present' },
});

const LETTER_SENTENCES = [
  'At Calder Industrial Components I own the monthly forecast and variance reporting for two business units.',
  'I rebuilt the forecast model around order backlog, and accuracy for the larger unit rose from 88% to 96%.',
  'Month-end close reporting now takes 6 working days instead of 9 because I automated the journal checks in Excel VBA.',
  'Plant managers read the Power BI dashboards I build on SAP data every week.',
  'At Redfern Stores I prepared the weekly store P&L packs and the annual budget for the regional team.',
  'I also found a supplier rebate that was not being claimed, worth about 120,000 USD a year.',
];
const LONG_LETTER = [
  'Dear Hiring Team,',
  '',
  ...Array.from({ length: 30 }, (_, i) => LETTER_SENTENCES[i % LETTER_SENTENCES.length]),
  '',
  'Kind regards,',
  NAME,
].join('\n');

const LONG_SUBJECT = `Application: Senior Financial Planning and Analysis Analyst, Corporate Finance, ${NAME}`;
const LONG_APPLICATION_EMAIL = JSON.stringify({
  subject: LONG_SUBJECT,
  body: [
    'Dear Hiring Team,',
    '',
    'I own the monthly forecast for two business units at Calder Industrial Components. I rebuilt that model around order backlog. Accuracy for the larger unit rose from 88% to 96%. I shortened month-end reporting from 9 working days to 6. I build Power BI dashboards on SAP data for plant managers. My CV and cover letter are attached. I can talk any day next week.',
    '',
    'Kind regards,',
    NAME,
  ].join('\n'),
});
const PLACEHOLDER_APPLICATION_EMAIL = JSON.stringify({
  subject: `Application: Financial Analyst, ${NAME}`,
  body: `Dear [Hiring Manager],\n\nMy CV and cover letter are attached.\n\nKind regards,\n${NAME}`,
});
const LONG_FOLLOW_UP = JSON.stringify({
  subject: `Following Up: Senior Financial Planning and Analysis Analyst role, ${NAME}`,
  body: [
    'Dear Hiring Team,',
    '',
    Array.from({ length: 6 }, () => 'I applied last week and I am still keen on the role, because the month-end work you describe is the work I do every month at Calder Industrial Components for two business units.').join(' '),
    '',
    'Kind regards,',
    NAME,
  ].join('\n'),
  recommendedDelay: 5,
});
const LONG_FIT = [
  '**Good Fit (68%)**',
  '',
  '**Strengths:**',
  ...Array.from({ length: 12 }, (_, i) => `- Monthly forecasting and variance reporting for two business units, point ${i + 1}, from the Calder role`),
  '',
  '**Gaps:**',
  ...Array.from({ length: 10 }, (_, i) => `- No documented consolidation experience in a group finance team, gap ${i + 1}`),
  '',
  '**Recommendation:** Apply now and lead with the forecast accuracy work, because that is the strongest match to what this team needs.',
].join('\n');

function answer(writer: Writer): string {
  const mode = behaviour[writer];
  if (mode === 'throw') throw Object.assign(new Error(`stubbed provider failure for ${writer}`), { status: 500 });
  if (writer === 'cv') return CV_JSON;
  if (writer === 'coverLetter') return LONG_LETTER;
  if (writer === 'applicationEmail') return mode === 'placeholder' ? PLACEHOLDER_APPLICATION_EMAIL : LONG_APPLICATION_EMAIL;
  if (writer === 'followUpEmail') return LONG_FOLLOW_UP;
  return LONG_FIT;
}

function message(text: string) {
  return {
    id: `msg_stub_${Math.random().toString(36).slice(2)}`,
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PRIMARY_CV = 'Tomas Brandt\nFinancial Analyst\nCalder Industrial Components, Mar 2022 - Present\n- Own the monthly forecast and variance reporting for two business units\n- Improved forecast accuracy for the larger unit from 88% to 96%';
const JOB_DESCRIPTION = 'Senior FP&A Analyst at Northwind Foods. You own the rolling forecast and month-end reporting.';

interface Report {
  startedAt: string;
  scenarios: Array<{ name: string; passed: boolean; observed: Record<string, unknown>; error?: string }>;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const report: Report = { startedAt: new Date().toISOString(), scenarios: [] };

  execFileSync('npx', ['wrangler', 'd1', 'migrations', 'apply', 'usefulapply-db', '--local', '--config', configPath, '--persist-to', persistTo], {
    cwd: repoRoot,
    stdio: ['ignore', 'ignore', 'inherit'],
    env: { ...process.env, CI: '1' },
  });

  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy<{ DB: AnyD1Database }>({ configPath, persist: { path: join(persistTo, 'v3') } });
  (globalThis as Record<symbol, unknown>)[Symbol.for('__cloudflare-context__')] = { env: proxy.env, cf: proxy.cf, ctx: proxy.ctx };

  // The SDK ships CJS and ESM builds and either may back the app's client, so
  // both Messages prototypes are patched. A call that reached the network
  // would fail the run (the key is not real), so a miss here cannot pass.
  const requireFromHere = createRequire(__filename);
  const sdkBuilds = new Set<{ Messages: { prototype: unknown } }>([
    (await import('@anthropic-ai/sdk')).default as unknown as { Messages: { prototype: unknown } },
    requireFromHere('@anthropic-ai/sdk').default ?? requireFromHere('@anthropic-ai/sdk'),
  ]);
  for (const sdk of sdkBuilds) patchMessages(sdk.Messages.prototype as Record<string, unknown>);
  function patchMessages(messages: Record<string, unknown>) {
  messages.create = async function create(params: { system?: unknown; messages: Array<{ content: unknown }> }) {
    const writer = writerFor(params.system);
    calls[writer] += 1;
    prompts[writer].push(String(params.messages[0]?.content ?? ''));
    return message(answer(writer));
  };
  messages.stream = function stream(params: { system?: unknown; messages: Array<{ content: unknown }> }) {
    const writer = writerFor(params.system);
    calls[writer] += 1;
    prompts[writer].push(String(params.messages[0]?.content ?? ''));
    let result: ReturnType<typeof message> | Error;
    try {
      result = message(answer(writer));
    } catch (error) {
      result = error as Error;
    }
    return {
      request_id: null,
      finalMessage: async () => {
        if (result instanceof Error) throw result;
        return result;
      },
    };
  };
  }

  const { unifiedWriterAgent } = await import('../src/lib/agents/unified-writer-agent');
  const credits = await import('../src/db/repos/credits');
  const { KIT_DOCUMENT_FAILURE_REFUND } = await import('../src/lib/credit-costs');
  const { KIT_DOCUMENTS } = await import('../src/lib/agents/types');
  type MasterContext = import('../src/lib/agents/types').MasterContext;
  type AgentEvent = import('../src/lib/agents/types').AgentEvent;

  const applicant: NonNullable<MasterContext['applicant']> = {
    name: NAME,
    email: 'tomas.brandt@example.com',
    skills: ['Excel', 'Power BI'],
    tools: ['SAP'],
    languages: ['English'],
    experiences: [],
    certifications: [],
  };
  const job: NonNullable<MasterContext['job']> = {
    title: 'Senior FP&A Analyst',
    companyName: 'Northwind Foods',
    requiredSkills: ['Forecasting'],
    niceToHaveSkills: [],
    responsibilities: ['Own the rolling forecast'],
  };
  const match: NonNullable<MasterContext['match']> = {
    score: 68,
    matchedRequirements: ['Forecasting'],
    claimableEvidence: ['Own the monthly forecast and variance reporting for two business units'],
    missingSkills: [],
  };

  const agent: typeof unifiedWriterAgent = {
    ...unifiedWriterAgent,
    async extractApplicantProfile() { return { result: applicant, tokens: { input: 1, output: 1 } }; },
    async parseJobDescription() { return { result: job, tokens: { input: 1, output: 1 } }; },
    async extractVerifiedMetrics() { return { result: [], tokens: { input: 1, output: 1 } }; },
    async detectLanguage() { return 'en'; },
    async computeSkillMatch() { return { result: match, tokens: { input: 1, output: 1 } }; },
  };

  const contextFor = (): MasterContext => ({
    sessionId: 'kit-isolation',
    jobDescription: JOB_DESCRIPTION,
    rawCV: PRIMARY_CV,
    detectedLanguage: 'en',
    applicant,
    job,
    match,
    verifiedMetrics: [],
  });

  const runKit = async (flow: 'apply_directly' | 'analyze_first') => {
    const events: AgentEvent[] = [];
    const emit = (event: AgentEvent) => { events.push(event); };
    const result = flow === 'apply_directly'
      ? await agent.run({ sessionId: 'kit-isolation', jobDescription: JOB_DESCRIPTION, primaryCV: PRIMARY_CV }, emit)
      : await agent.runWithContext(contextFor(), emit);
    const stepErrors = events.flatMap((event) => (event.type === 'step_error' ? [event.step.id] : []));
    const stepsCompleted = events.flatMap((event) => (event.type === 'step_completed' ? [event.step.id] : []));
    return { result, stepErrors, stepsCompleted };
  };

  const scenario = async (name: string, body: () => Promise<Record<string, unknown>>) => {
    const observed: Record<string, unknown> = {};
    try {
      Object.assign(observed, await body());
      report.scenarios.push({ name, passed: true, observed });
      console.log(`PASS  ${name}`);
    } catch (error) {
      report.scenarios.push({ name, passed: false, observed, error: error instanceof Error ? error.message : String(error) });
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  // (a) Over-length documents render as written, with one model call each.
  for (const flow of ['apply_directly', 'analyze_first'] as const) {
    await scenario(`a. over-length email, follow-up and letter render with no retry (${flow})`, async () => {
      resetModel({});
      const { result, stepErrors } = await runKit(flow);
      const ctx = result.data?.context;
      assert.equal(result.success, true);
      assert.deepEqual(result.data?.documentErrors, {});
      assert.deepEqual(stepErrors, []);
      assert.equal(ctx?.applicationEmail?.subject, LONG_SUBJECT);
      assert.ok((ctx?.applicationEmail?.subject.length ?? 0) > 60);
      const followUpWords = ctx?.followUpEmail?.body.split(/\s+/).length ?? 0;
      const letterWords = ctx?.coverLetter?.split(/\s+/).length ?? 0;
      assert.ok(followUpWords > 80, `follow-up has ${followUpWords} words`);
      assert.ok(letterWords > 420, `letter has ${letterWords} words`);
      assert.deepEqual(calls, { cv: 1, coverLetter: 1, applicationEmail: 1, followUpEmail: 1, fit: 0 });
      return {
        subjectChars: ctx?.applicationEmail?.subject.length,
        followUpWords,
        letterWords,
        modelCalls: { ...calls },
      };
    });
  }

  await scenario('a. over-length fit assessment renders with no retry', async () => {
    resetModel({});
    const result = await agent.runFitAnalysis({ sessionId: 'fit-check', jobDescription: JOB_DESCRIPTION, primaryCV: PRIMARY_CV }, () => undefined);
    const words = result.data?.context.fitAnalysis?.assessment.split(/\s+/).length ?? 0;
    assert.equal(result.success, true);
    assert.ok(words > 200, `fit has ${words} words`);
    assert.equal(calls.fit, 1);
    return { fitWords: words, modelCalls: { ...calls } };
  });

  // (b) The cover letter throws: everything else is returned.
  for (const flow of ['apply_directly', 'analyze_first'] as const) {
    await scenario(`b. cover letter throws, rest of the kit is returned (${flow})`, async () => {
      resetModel({ coverLetter: 'throw' });
      const { result, stepErrors, stepsCompleted } = await runKit(flow);
      const ctx = result.data?.context;
      assert.equal(result.success, true);
      assert.deepEqual(result.data?.documentErrors, { coverLetter: 'GENERATION_FAILED' });
      assert.deepEqual(stepErrors, ['cover_letter']);
      assert.ok(ctx?.optimizedCVData);
      assert.equal(ctx?.coverLetter, undefined);
      assert.ok(ctx?.applicationEmail?.body);
      assert.ok(ctx?.followUpEmail?.body);
      return { documentErrors: result.data?.documentErrors, stepErrors, stepsCompleted };
    });
  }

  // (c) The application email fails validation twice: the follow-up is still written.
  for (const flow of ['apply_directly', 'analyze_first'] as const) {
    await scenario(`c. application email fails, follow-up still written (${flow})`, async () => {
      resetModel({ applicationEmail: 'placeholder' });
      const { result, stepErrors } = await runKit(flow);
      const ctx = result.data?.context;
      assert.equal(result.success, true);
      assert.deepEqual(result.data?.documentErrors, { applicationEmail: 'VALIDATION_FAILED' });
      assert.deepEqual(stepErrors, ['email']);
      assert.equal(calls.applicationEmail, 2, 'one retry for a non-length miss');
      assert.equal(ctx?.applicationEmail, undefined);
      assert.ok(ctx?.followUpEmail?.body);
      const followUpPrompt = prompts.followUpEmail[0] ?? '';
      assert.match(followUpPrompt, /<primary_email_subject><\/primary_email_subject>/u);
      return {
        documentErrors: result.data?.documentErrors,
        stepErrors,
        applicationEmailCalls: calls.applicationEmail,
        followUpWritten: Boolean(ctx?.followUpEmail),
        followUpPromptHadEmptyPrimaryEmail: true,
      };
    });
  }

  // Credits on a real local D1.
  const userId = '00000000-0000-4000-8000-00000000c0de';
  const now = new Date().toISOString();
  const db = proxy.env.DB;
  await db.prepare('INSERT INTO profiles (id, email, job_searches_reset_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(userId, 'kit-isolation@test.local', now, now, now).run();
  await db.prepare('INSERT INTO user_credits (id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .bind('00000000-0000-4000-8000-00000000c0df', userId, 1, 0, 6, 'free', now, now).run();
  const balance = async () => {
    const { credits: row } = await credits.getUserCredits(userId);
    assert.ok(row);
    return { total: row.monthly_credits + row.rollover_credits + row.addon_credits, monthly: row.monthly_credits, rollover: row.rollover_credits, addon: row.addon_credits };
  };

  // The route's settle step, verbatim in intent: capture, then refund the failed documents.
  const settle = async (key: string, documentErrors: Record<string, unknown>) => {
    await credits.captureReservation({ idempotencyKey: key, userId });
    const failed = KIT_DOCUMENTS.filter((document) => documentErrors[document]);
    const amount = failed.reduce((sum, document) => sum + KIT_DOCUMENT_FAILURE_REFUND[document], 0);
    return credits.refundReservationPartially({ userId, idempotencyKey: key, amount, reason: `kit_documents_failed:${failed.join(',')}` });
  };

  await scenario('d. every document fails after context: the whole reservation comes back', async () => {
    resetModel({ cv: 'throw', coverLetter: 'throw', applicationEmail: 'throw', followUpEmail: 'throw' });
    const before = await balance();
    const key = `full_application:${userId}:d`;
    const reserved = await credits.reserveCredits({ userId, action: 'FULL_APPLICATION', idempotencyKey: key });
    assert.equal(reserved.success, true);
    const during = await balance();
    const { result, stepErrors } = await runKit('apply_directly');
    assert.equal(result.success, false);
    assert.deepEqual(stepErrors, ['cv_generation', 'cover_letter', 'email', 'follow_up']);
    const released = await credits.releaseReservation({ idempotencyKey: key, userId, reason: result.error });
    assert.equal(released.success, true);
    const after = await balance();
    assert.equal(during.total, before.total - 2);
    assert.deepEqual(after, before);
    return { before, during, after, error: result.error, stepErrors };
  });

  await scenario('e. one document fails: 0.5 refunded exactly once (refund path run twice)', async () => {
    resetModel({ coverLetter: 'throw' });
    const before = await balance();
    const key = `full_application:${userId}:e`;
    assert.equal((await credits.reserveCredits({ userId, action: 'FULL_APPLICATION', idempotencyKey: key })).success, true);
    const { result } = await runKit('analyze_first');
    assert.equal(result.success, true);
    const documentErrors = result.data?.documentErrors ?? {};
    const first = await settle(key, documentErrors);
    const second = await settle(key, documentErrors);
    const after = await balance();
    const reservation = await credits.getReservationByKey(userId, key);
    const ledger = await db.prepare("SELECT amount FROM credit_transactions WHERE user_id = ? AND transaction_type = 'reservation_partial_refund'").bind(userId).all();
    assert.deepEqual(first, { success: true, refunded: 0.5, alreadyRefunded: false, error: null });
    assert.deepEqual(second, { success: true, refunded: 0, alreadyRefunded: true, error: null });
    assert.equal(after.total, before.total - 2 + 0.5);
    assert.equal(reservation?.status, 'captured');
    assert.equal(ledger.results.length, 1);
    return { before, after, first, second, reservationStatus: reservation?.status, partialRefundLedgerRows: ledger.results };
  });

  await scenario('e. three documents fail on a 1.5 after-fit kit: refund is capped at the charge', async () => {
    resetModel({ coverLetter: 'throw', applicationEmail: 'throw', followUpEmail: 'throw' });
    const before = await balance();
    const key = `generation_after_fit:${userId}:e2`;
    assert.equal((await credits.reserveCredits({ userId, action: 'GENERATION_AFTER_FIT', idempotencyKey: key })).success, true);
    const { result } = await runKit('analyze_first');
    assert.equal(result.success, true);
    assert.deepEqual(Object.keys(result.data?.documentErrors ?? {}).sort(), ['applicationEmail', 'coverLetter', 'followUpEmail']);
    const first = await settle(key, result.data?.documentErrors ?? {});
    const after = await balance();
    assert.equal(first.refunded, 1.5);
    assert.equal(after.total, before.total);
    return { before, after, first };
  });

  await proxy.dispose();
  const failed = report.scenarios.filter((entry) => !entry.passed);
  writeFileSync(join(outDir, 'kit-isolation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\n${report.scenarios.length - failed.length}/${report.scenarios.length} passed. Report: ${join(outDir, 'kit-isolation-report.json')}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
