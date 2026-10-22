/**
 * Prompt-cache layout of every Sonnet call site (.claude/rules/prompt-caching.md, "Measure and test").
 *
 * Each site builds two different requests (two users, two jobs, two rewrite instructions, or a first attempt
 * and its retry) through the real request path, with a fake transport, and compares the cached prefix up to
 * each marker: byte-identical where the cache must be shared, different where it carries per-user data.
 * No model is called. These check bytes and markers, never model behaviour.
 *
 * What would break the cache, and the test that catches it:
 * - a split that changes the prompt text            -> "blocks always join to the prompt", request builder guards
 * - per-user or per-request bytes in a shared prefix -> the cross-user tests per site
 * - a marker that drops the CVs out of a per-user prefix -> "extraction prefixes carry the CVs"
 * - 5m before 1h, more than 4 markers                -> request builder guards, "every site keeps TTL order"
 * - a retry whose prefix differs from the first attempt -> the retry tests
 * - a regenerate boundary that swallows the instruction -> "regenerate rewrites share the session context"
 * - a renamed static-head heading                     -> skill matching and fit tests (the split must exist)
 * - a marked prefix under the 512-token minimum      -> MIN_CACHEABLE checks
 * - writers started in parallel (all miss)            -> "kit writers run one after another"
 * - PostHog losing the site, TTL split or cost        -> the $ai_generation test
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';

import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import { buildSonnetRequest, setSonnetDepsForTests, type SonnetDeps } from '@/lib/models/anthropic';
import type { MessagesClient } from '@/lib/models/providers';
import type { MasterContext } from './types';
import { computeSkillMatch, extractApplicantProfile, extractVerifiedMetrics, parseJobDescription } from './context-builder';
import {
  applicationEmailCallOptions,
  coverLetterCallOptions,
  cvCallOptions,
  cvSectionCallOptions,
  fitAssessmentCallOptions,
  followUpEmailCallOptions,
  generateApplicationEmailWithRetry,
  generateFollowUpEmailWithRetry,
  sessionContextLength,
  unifiedWriterAgent,
} from './unified-writer-agent';
import { buildCoverLetterUserPrompt } from './prompts/cover-letter-prompt';
import { buildApplicationEmailUserPrompt, buildFollowUpEmailUserPrompt } from './prompts/email-prompts';

type Request = Anthropic.MessageCreateParamsNonStreaming;

// Rough English token estimate (chars / 3), as in the audit. The API minimum is 512 tokens.
const MIN_CACHEABLE_CHARS = 512 * 3;

const GENERATION_CONTEXT: LlmGenerationContext = {
  requestExecutionId: 'request-1',
  userId: 'user-1',
  route: '/api/agent-v2',
  feature: 'application_generation',
  operation: 'full_optimization',
};

// -------------------------------------------------------------------------------------------------
// Fixtures: two applicants, two jobs. Long enough to look like real CVs.
// -------------------------------------------------------------------------------------------------

function cv(name: string, employer: string, tool: string): string {
  const roles = [2019, 2020, 2021, 2022, 2023].map((year, i) => `${employer} ${i + 1}, ${year} to ${year + 1}
- Built ${tool} pipelines for ${12 + i} internal teams and cut release time by ${20 + i}%
- Ran weekly reviews with product and design, wrote the onboarding guide for new engineers
- Migrated the reporting stack to ${tool} and documented every step for the support team`).join('\n\n');
  return `${name}\n${name.toLowerCase().replace(/\s+/g, '.')}@example.com | Berlin\n\nSUMMARY\nEngineer with five years in data platforms.\n\nEXPERIENCE\n${roles}\n\nSKILLS\n${tool}, SQL, Python, Airflow\n\nLANGUAGES\nGerman (C1), English (native)`;
}

const USERS = {
  ada: { name: 'Ada Lovelace', primary: cv('Ada Lovelace', 'Analytical Engines GmbH', 'dbt'), master: cv('Ada Lovelace', 'Difference Labs', 'Spark') },
  grace: { name: 'Grace Hopper', primary: cv('Grace Hopper', 'Compiler Works AG', 'Kafka'), master: cv('Grace Hopper', 'Navy Systems', 'Flink') },
};

const JOBS = {
  data: {
    description: 'Data Engineer at Example Corp. You build pipelines with dbt and Airflow. Berlin, hybrid.',
    job: { title: 'Data Engineer', companyName: 'Example Corp', location: 'Berlin', requiredSkills: ['dbt', 'Airflow', 'SQL'], niceToHaveSkills: ['Spark'], responsibilities: ['Build pipelines', 'Own data quality'] },
  },
  platform: {
    description: 'Platform Engineer at Other GmbH. Kubernetes, Terraform, on-call. Munich.',
    job: { title: 'Platform Engineer', companyName: 'Other GmbH', location: 'Munich', requiredSkills: ['Kubernetes', 'Terraform'], niceToHaveSkills: ['Go'], responsibilities: ['Run clusters'] },
  },
};

function context(user: keyof typeof USERS, job: keyof typeof JOBS, extra: Partial<MasterContext> = {}): MasterContext {
  const u = USERS[user];
  const j = JOBS[job];
  return {
    sessionId: `session-${user}-${job}`,
    jobDescription: j.description,
    rawCV: u.primary,
    masterCV: u.master,
    detectedLanguage: 'en',
    applicant: {
      name: u.name,
      email: `${user}@example.com`,
      address: 'Berlin',
      skills: ['SQL', 'Python'],
      tools: ['Airflow'],
      languages: ['German (C1)'],
      experiences: [{ company: 'Analytical Engines GmbH 1', title: 'Engineer', startDate: '2019', endDate: '2020', bullets: ['Built pipelines'] }],
      certifications: [],
    },
    job: j.job,
    match: { score: 72, matchedRequirements: ['SQL'], claimableEvidence: ['SQL'], missingSkills: ['Terraform'], details: [] },
    verifiedMetrics: ['20% release time'],
    ...extra,
  };
}

// -------------------------------------------------------------------------------------------------
// The cached prefix of a request, as the cache key sees it: model, thinking and effort, then every block
// in order (tools, system, messages) up to the marker. The marker itself is not part of the content.
// -------------------------------------------------------------------------------------------------

function blocksInOrder(request: Request): Array<{ text: string; marker: string | null }> {
  const out: Array<{ text: string; marker: string | null }> = [];
  if (typeof request.system === 'string') out.push({ text: `system:${request.system}`, marker: null });
  else for (const b of request.system ?? []) out.push({ text: `system:${b.text}`, marker: b.cache_control ? b.cache_control.ttl ?? '5m' : null });
  for (const message of request.messages) {
    if (typeof message.content === 'string') { out.push({ text: `${message.role}:${message.content}`, marker: null }); continue; }
    for (const b of message.content) {
      const block = b as { type: string; text?: string; cache_control?: { ttl?: string } | null };
      out.push({ text: `${message.role}:${block.type}:${block.text ?? ''}`, marker: block.cache_control ? block.cache_control.ttl ?? '5m' : null });
    }
  }
  return out;
}

/** One string per marker: everything the cache hashes up to and including the marked block. */
function cachedPrefixes(request: Request): string[] {
  const head = JSON.stringify({ model: request.model, thinking: request.thinking, output_config: request.output_config, tools: request.tools ?? null });
  const blocks = blocksInOrder(request);
  const prefixes: string[] = [];
  blocks.forEach((block, i) => {
    if (block.marker) prefixes.push(head + JSON.stringify(blocks.slice(0, i + 1).map((b) => b.text)));
  });
  return prefixes;
}

function markers(request: Request): string[] {
  return blocksInOrder(request).flatMap((b) => (b.marker ? [b.marker] : []));
}

function userText(request: Request): string {
  const content = request.messages[0].content;
  return typeof content === 'string' ? content : content.map((b) => (b as { text?: string }).text ?? '').join('');
}

/** The text of the marked prefix (no JSON wrapping), for size and content checks. */
function markedPrefixText(request: Request, markerIndex: number): string {
  const blocks = blocksInOrder(request);
  let seen = -1;
  for (let i = 0; i < blocks.length; i += 1) {
    if (blocks[i].marker) seen += 1;
    if (seen === markerIndex) return blocks.slice(0, i + 1).map((b) => b.text).join('');
  }
  throw new Error(`no marker ${markerIndex}`);
}

// -------------------------------------------------------------------------------------------------
// Fake transport: records every request, answers with fixed text and usage. Real request building,
// real failover helper, fake ledger and PostHog.
// -------------------------------------------------------------------------------------------------

interface Recorder {
  requests: Request[];
  events: Array<{ distinctId: string; event?: string; properties: Record<string, unknown> }>;
  starts: number[];
  ends: number[];
}

function fakeMessage(text: string, usage: Record<string, unknown>): Anthropic.Message {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage,
  } as unknown as Anthropic.Message;
}

const DEFAULT_USAGE = {
  input_tokens: 100,
  output_tokens: 20,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
};

async function withFakeTransport(
  answer: (request: Request) => string,
  run: (recorder: Recorder) => Promise<unknown>,
  usage: Record<string, unknown> = DEFAULT_USAGE,
): Promise<Recorder> {
  const recorder: Recorder = { requests: [], events: [], starts: [], ends: [] };
  const client = {
    messages: {
      create(params: Request) {
        recorder.requests.push(params);
        return {
          async withResponse() {
            return { data: fakeMessage(answer(params), usage), request_id: 'req_test' };
          },
        };
      },
      // Calls whose budget is above STREAM_ABOVE_MAX_TOKENS stream and wait for the final message.
      stream(params: Request) {
        recorder.requests.push(params);
        return { request_id: 'req_test', finalMessage: async () => fakeMessage(answer(params), usage) };
      },
    },
  } as unknown as MessagesClient;
  const deps: Partial<SonnetDeps> = {
    getClient: () => client,
    getBedrockClient: () => null,
    startLedger: async () => ({ id: `ledger-${recorder.requests.length + 1}`, startedAt: new Date(0).toISOString() }),
    completeLedger: async () => {},
    failLedger: async () => {},
    capture: async (event) => { recorder.events.push(event); },
  };
  setSonnetDepsForTests(deps);
  try {
    await run(recorder);
  } finally {
    setSonnetDepsForTests(null);
  }
  return recorder;
}

const swallow = async (promise: Promise<unknown>) => { await promise.catch(() => undefined); };

// =================================================================================================
// Request builder guards
// =================================================================================================

test('a split that does not join to the prompt is refused before anything is sent', () => {
  assert.throws(() => buildSonnetRequest({
    prompt: 'abc',
    promptBlocks: [{ type: 'text', text: 'ab', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'X' }],
  }), /do not join to the prompt/);
});

test('a 1h marker after a 5m one is refused (the API answers 400)', () => {
  assert.throws(() => buildSonnetRequest({
    prompt: 'ab',
    systemBlocks: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral', ttl: '5m' } }],
    promptBlocks: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral', ttl: '1h' } }, { type: 'text', text: 'b' }],
  }), /1h cache marker after a 5m/);
});

test('more than four markers are refused', () => {
  const marked = (text: string) => ({ type: 'text' as const, text, cache_control: { type: 'ephemeral' as const } });
  assert.throws(() => buildSonnetRequest({
    prompt: 'abc',
    systemBlocks: [marked('s1'), marked('s2')],
    promptBlocks: [marked('a'), marked('b'), marked('c')],
  }), /5 cache markers/);
});

test('5m markers go out without a ttl, 1h markers with ttl "1h"', () => {
  const request = buildSonnetRequest({
    prompt: 'ab',
    systemBlocks: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral', ttl: '1h' } }],
    promptBlocks: [{ type: 'text', text: 'a', cache_control: { type: 'ephemeral', ttl: '5m' } }, { type: 'text', text: 'b' }],
  });
  const system = request.system as Anthropic.TextBlockParam[];
  assert.deepEqual(system[0].cache_control, { type: 'ephemeral', ttl: '1h' });
  const content = request.messages[0].content as Anthropic.TextBlockParam[];
  assert.deepEqual(content[0].cache_control, { type: 'ephemeral' });
  assert.equal(content[1].cache_control, undefined);
});

test('a plain system prompt with a TTL is one marked block holding the same text, JSON rule included', () => {
  const plain = buildSonnetRequest({ prompt: 'p', systemPrompt: 'You parse.', jsonMode: true });
  const marked = buildSonnetRequest({ prompt: 'p', systemPrompt: 'You parse.', jsonMode: true, systemPromptCacheTtl: '5m' });
  assert.equal(typeof plain.system, 'string');
  const blocks = marked.system as Anthropic.TextBlockParam[];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, plain.system);
  assert.deepEqual(blocks[0].cache_control, { type: 'ephemeral' });
});

// =================================================================================================
// Writers
// =================================================================================================

const WRITER_SITES = {
  write_cover_letter: { options: coverLetterCallOptions, build: buildCoverLetterUserPrompt },
  write_email: { options: applicationEmailCallOptions, build: buildApplicationEmailUserPrompt },
  write_follow_up_email: { options: followUpEmailCallOptions, build: buildFollowUpEmailUserPrompt },
};

test('every writer site keeps its TTL order and at most four markers, kit and regenerate alike', () => {
  const requests: Request[] = [
    buildSonnetRequest(cvCallOptions(context('ada', 'data'))),
    buildSonnetRequest(cvSectionCallOptions(context('ada', 'data'), { kind: 'summary', label: 'Summary', before: 'Engineer.' })),
    buildSonnetRequest(fitAssessmentCallOptions(context('ada', 'data'))),
  ];
  for (const site of Object.values(WRITER_SITES)) {
    requests.push(buildSonnetRequest(site.options(context('ada', 'data'))));
    requests.push(buildSonnetRequest(site.options(context('ada', 'data', { userInstruction: 'Make it shorter' }), undefined, { reusedInSession: true })));
  }
  for (const request of requests) {
    const ttls = markers(request);
    assert.ok(ttls.length >= 1 && ttls.length <= 4, `markers: ${ttls.join(',')}`);
    const first5m = ttls.indexOf('5m');
    assert.ok(first5m === -1 || !ttls.slice(first5m).includes('1h'), `TTL order: ${ttls.join(',')}`);
  }
});

test('writer blocks always join to exactly the prompt the builder wrote', () => {
  for (const [name, site] of Object.entries(WRITER_SITES)) {
    for (const ctx of [context('ada', 'data'), context('grace', 'platform', { userInstruction: 'Mention my Kafka work' })]) {
      for (const reusedInSession of [false, true]) {
        const options = site.options(ctx, undefined, { reusedInSession });
        assert.equal(options.prompt, site.build(ctx), name);
        assert.equal(options.promptBlocks?.map((b) => b.text).join(''), options.prompt, name);
      }
    }
  }
});

test('kit CV: the 1h system block is identical for two users and two jobs, and the section rewrite reads it', () => {
  const a = buildSonnetRequest(cvCallOptions(context('ada', 'data')));
  const b = buildSonnetRequest(cvCallOptions(context('grace', 'platform')));
  const rewrite = buildSonnetRequest(cvSectionCallOptions(context('grace', 'platform'), { kind: 'summary', label: 'Summary', before: 'Engineer.' }));
  assert.deepEqual(markers(a), ['1h']);
  assert.deepEqual(markers(rewrite), ['1h']);
  assert.equal(cachedPrefixes(a)[0], cachedPrefixes(b)[0]);
  assert.equal(cachedPrefixes(a)[0], cachedPrefixes(rewrite)[0]);
  assert.ok(markedPrefixText(a, 0).length > MIN_CACHEABLE_CHARS);
  // Per-request data never sits before the marker.
  assert.ok(!markedPrefixText(a, 0).includes('Ada Lovelace'));
});

for (const [name, site] of Object.entries(WRITER_SITES)) {
  test(`${name}: the 1h system block is shared across users, kit and regenerate`, () => {
    const kitAda = buildSonnetRequest(site.options(context('ada', 'data')));
    const kitGrace = buildSonnetRequest(site.options(context('grace', 'platform')));
    const regen = buildSonnetRequest(site.options(context('grace', 'platform', { userInstruction: 'Shorter' }), undefined, { reusedInSession: true }));
    assert.equal(markers(kitAda)[0], '1h');
    assert.equal(cachedPrefixes(kitAda)[0], cachedPrefixes(kitGrace)[0]);
    assert.equal(cachedPrefixes(kitAda)[0], cachedPrefixes(regen)[0]);
    assert.ok(markedPrefixText(kitAda, 0).length > MIN_CACHEABLE_CHARS, `${name} system under 512 tokens`);
  });

  test(`${name}: the kit marks the end of the first attempt (5m) and nothing per-user is shared between users`, () => {
    const ada = buildSonnetRequest(site.options(context('ada', 'data')));
    const grace = buildSonnetRequest(site.options(context('grace', 'data')));
    assert.deepEqual(markers(ada), ['1h', '5m']);
    assert.equal(markedPrefixText(ada, 1).endsWith(userText(ada)), true, 'the 5m marker sits on the last block');
    assert.notEqual(cachedPrefixes(ada)[1], cachedPrefixes(grace)[1]);
  });

  test(`${name}: regenerate rewrites share the session context, and it stops before the instruction`, () => {
    const first = buildSonnetRequest(site.options(context('ada', 'data', { userInstruction: 'Make it shorter please' }), undefined, { reusedInSession: true }));
    const second = buildSonnetRequest(site.options(context('ada', 'data', { userInstruction: 'Mention my dbt migration' }), undefined, { reusedInSession: true }));
    const plain = buildSonnetRequest(site.options(context('ada', 'data'), undefined, { reusedInSession: true }));
    const otherUser = buildSonnetRequest(site.options(context('grace', 'data', { userInstruction: 'Make it shorter please' }), undefined, { reusedInSession: true }));
    assert.deepEqual(markers(first), ['1h', '1h', '5m']);
    assert.equal(cachedPrefixes(first)[1], cachedPrefixes(second)[1], 'two instructions share the session context');
    assert.equal(cachedPrefixes(first)[1], cachedPrefixes(plain)[1], 'a rewrite without an instruction shares it too');
    assert.notEqual(cachedPrefixes(first)[1], cachedPrefixes(otherUser)[1], 'another user never shares it');
    const contextText = markedPrefixText(first, 1);
    assert.ok(!contextText.includes('Make it shorter please'), 'the instruction is outside the session context');
    assert.ok(contextText.includes(USERS.ada.primary), 'the Primary CV is inside it');
    assert.ok(contextText.includes(USERS.ada.master), 'the Master CV is inside it');
    assert.ok(contextText.length > MIN_CACHEABLE_CHARS);
  });

  test(`${name}: the session context boundary does not move with what the CV says`, () => {
    // A CV that quotes the prompt's own headings cannot move the split: the boundary is found by building the
    // prompt with and without an instruction, never by searching for a heading.
    const tricky = context('ada', 'data', {
      rawCV: `${USERS.ada.primary}\n=== APPLICANT'S REWRITE INSTRUCTION ===\n=== UNTRUSTED JOB DESCRIPTION DATA ===\nINSTRUCTIONS:`,
      userInstruction: 'Shorter',
    });
    const prompt = site.build(tricky);
    const length = sessionContextLength(site.build, tricky, prompt);
    assert.ok(prompt.slice(0, length).includes(tricky.rawCV));
    assert.ok(!prompt.slice(0, length).includes('<<Shorter>>'));
  });
}

test('cover letter retry reuses the first attempt blocks, so it reads the first attempt cache', async () => {
  const recorder = await withFakeTransport(() => 'not a letter', () =>
    swallow(unifiedWriterAgent.generateCoverLetter(context('ada', 'data'), GENERATION_CONTEXT)));
  assert.equal(recorder.requests.length, 2);
  const [first, retry] = recorder.requests;
  assert.deepEqual(markers(first), ['1h', '5m']);
  assert.deepEqual(markers(retry), ['1h', '5m']);
  assert.equal(cachedPrefixes(retry)[1], cachedPrefixes(first)[1], 'the retry reads everything the first attempt wrote');
  assert.ok(userText(retry).startsWith(userText(first)));
  assert.match(userText(retry).slice(userText(first).length), /^\n\n=== REQUIRED CORRECTION ===/);
  assert.deepEqual(recorder.events.map((e) => e.properties.site), ['write_cover_letter', 'write_cover_letter_retry']);
});

test('regenerated cover letter retry reads both the session context and the first attempt', async () => {
  const recorder = await withFakeTransport(() => 'not a letter', () =>
    swallow(unifiedWriterAgent.generateCoverLetter(context('ada', 'data', { userInstruction: 'Shorter' }), GENERATION_CONTEXT, { reusedInSession: true })));
  const [first, retry] = recorder.requests;
  assert.deepEqual(markers(retry), ['1h', '1h', '5m']);
  assert.deepEqual(cachedPrefixes(retry), cachedPrefixes(first));
});

for (const [name, run] of [
  ['write_email', (ctx: MasterContext) => generateApplicationEmailWithRetry(ctx, GENERATION_CONTEXT)],
  ['write_follow_up_email', (ctx: MasterContext) => generateFollowUpEmailWithRetry(ctx, GENERATION_CONTEXT)],
] as const) {
  test(`${name} validation retry reads the first attempt cache`, async () => {
    const recorder = await withFakeTransport(() => 'not json', () => swallow(run(context('ada', 'data'))));
    assert.equal(recorder.requests.length, 2);
    const [first, retry] = recorder.requests;
    assert.equal(cachedPrefixes(retry)[1], cachedPrefixes(first)[1]);
    // Same model, thinking and effort on both attempts: anything else would change the cache key.
    assert.equal(retry.model, first.model);
    assert.deepEqual(retry.thinking, first.thinking);
    assert.deepEqual(retry.output_config, first.output_config);
    assert.deepEqual(recorder.events.map((e) => e.properties.site), [name, `${name}_retry`]);
  });
}

test('kit writers run one after another, so each call starts after the previous one has finished', async () => {
  // Calls sent at the same moment all miss (measured). The writers share no prefix with each other today, so
  // there is nothing to warm; running them in order also keeps every retry and regenerate read possible.
  const log: string[] = [];
  const step = (name: string, value: unknown) => async () => {
    log.push(`start:${name}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
    log.push(`end:${name}`);
    return value;
  };
  const tokens = { input: 1, output: 1 };
  const harness = Object.create(unifiedWriterAgent) as typeof unifiedWriterAgent;
  harness.generateOptimizedCVData = step('cv', { cvData: {}, legacyCV: { content: '', changes: [] }, tokens }) as typeof harness.generateOptimizedCVData;
  harness.generateCoverLetter = step('letter', { result: { body: 'x', structured: {} }, tokens }) as typeof harness.generateCoverLetter;
  harness.generateApplicationEmail = step('email', { result: { subject: 's', body: 'b' }, tokens }) as typeof harness.generateApplicationEmail;
  harness.generateFollowUpEmail = step('follow_up', { result: { subject: 's', body: 'b', recommendedDelay: 5 }, tokens }) as typeof harness.generateFollowUpEmail;
  await harness.generateKitDocuments(context('ada', 'data'), () => {}, GENERATION_CONTEXT, { cv: 1, coverLetter: 2, applicationEmail: 3, followUpEmail: 4 });
  assert.deepEqual(log, [
    'start:cv', 'end:cv',
    'start:letter', 'end:letter',
    'start:email', 'end:email',
    'start:follow_up', 'end:follow_up',
  ]);
});

// =================================================================================================
// Fit assessment
// =================================================================================================

test('fit assessment: the static system and the static framework are shared across users and jobs', () => {
  const a = buildSonnetRequest(fitAssessmentCallOptions(context('ada', 'data')));
  const b = buildSonnetRequest(fitAssessmentCallOptions(context('grace', 'platform')));
  assert.deepEqual(markers(a), ['5m', '5m'], 'the framework split exists (a renamed heading would drop it)');
  assert.deepEqual(cachedPrefixes(a), cachedPrefixes(b));
  assert.ok(markedPrefixText(a, 1).length > MIN_CACHEABLE_CHARS);
  assert.ok(!markedPrefixText(a, 1).includes('Ada Lovelace'));
  assert.equal(userText(a), fitAssessmentCallOptions(context('ada', 'data')).prompt);
});

// =================================================================================================
// Context building (through the real call path, fake transport)
// =================================================================================================

test('applicant and metric extraction: the whole prompt is cached per user, identical across jobs', async () => {
  const recorder = await withFakeTransport(() => 'not json', async () => {
    await swallow(extractApplicantProfile(USERS.ada.primary, USERS.ada.master, GENERATION_CONTEXT));
    await swallow(extractApplicantProfile(USERS.ada.primary, USERS.ada.master, GENERATION_CONTEXT));
    await swallow(extractApplicantProfile(USERS.grace.primary, USERS.grace.master, GENERATION_CONTEXT));
    await swallow(extractVerifiedMetrics(USERS.ada.primary, USERS.ada.master, GENERATION_CONTEXT));
    await swallow(extractVerifiedMetrics(USERS.ada.primary, USERS.ada.master, GENERATION_CONTEXT));
    await swallow(extractVerifiedMetrics(USERS.grace.primary, USERS.grace.master, GENERATION_CONTEXT));
  });
  const [applicantAda1, applicantAda2, applicantGrace, metricsAda1, metricsAda2, metricsGrace] = recorder.requests;
  for (const [ada1, ada2, grace] of [[applicantAda1, applicantAda2, applicantGrace], [metricsAda1, metricsAda2, metricsGrace]]) {
    assert.deepEqual(markers(ada1), ['5m']);
    assert.equal(cachedPrefixes(ada1)[0], cachedPrefixes(ada2)[0]);
    assert.notEqual(cachedPrefixes(ada1)[0], cachedPrefixes(grace)[0]);
    const prefix = markedPrefixText(ada1, 0);
    assert.ok(prefix.includes(USERS.ada.primary) && prefix.includes(USERS.ada.master), 'extraction prefixes carry the CVs');
    assert.ok(prefix.length > MIN_CACHEABLE_CHARS);
  }
});

test('job parsing: the system prompt is shared across jobs', async () => {
  const recorder = await withFakeTransport(() => 'not json', async () => {
    await swallow(parseJobDescription(JOBS.data.description, GENERATION_CONTEXT));
    await swallow(parseJobDescription(JOBS.platform.description, GENERATION_CONTEXT));
  });
  const [a, b] = recorder.requests;
  assert.deepEqual(markers(a), ['5m']);
  assert.equal(cachedPrefixes(a)[0], cachedPrefixes(b)[0]);
  assert.ok(markedPrefixText(a, 0).length > MIN_CACHEABLE_CHARS);
  assert.ok(!markedPrefixText(a, 0).includes('Example Corp'));
});

test('skill matching: the static matching rules are shared across users and jobs', async () => {
  const recorder = await withFakeTransport(() => 'not json', async () => {
    const ada = context('ada', 'data');
    const grace = context('grace', 'platform');
    await swallow(computeSkillMatch(ada.applicant, ada.job, USERS.ada.primary, USERS.ada.master, GENERATION_CONTEXT));
    await swallow(computeSkillMatch(grace.applicant, grace.job, USERS.grace.primary, USERS.grace.master, GENERATION_CONTEXT));
  });
  const [a, b] = recorder.requests;
  assert.deepEqual(markers(a), ['5m'], 'the rules split exists (a renamed heading would drop it)');
  assert.equal(cachedPrefixes(a)[0], cachedPrefixes(b)[0]);
  assert.ok(markedPrefixText(a, 0).length > MIN_CACHEABLE_CHARS);
  assert.ok(!markedPrefixText(a, 0).includes(USERS.ada.primary));
});

// =================================================================================================
// Measurement
// =================================================================================================

test('every Sonnet attempt sends $ai_generation with the site, the 5m and 1h write split and the cost', async () => {
  const usage = {
    input_tokens: 400,
    output_tokens: 1000,
    cache_read_input_tokens: 6000,
    cache_creation_input_tokens: 3000,
    cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
  };
  const letter = JSON.stringify({ body: 'x' });
  const recorder = await withFakeTransport(() => letter, () =>
    swallow(unifiedWriterAgent.generateCoverLetter(context('ada', 'data'), GENERATION_CONTEXT)), usage);
  const event = recorder.events[0];
  assert.equal(event.distinctId, 'user-1');
  assert.equal(event.event, undefined, 'defaults to $ai_generation');
  const p = event.properties;
  assert.equal(p.site, 'write_cover_letter');
  assert.equal(p.$ai_model, 'claude-sonnet-5-5');
  assert.equal(p.cache_read_tokens, 6000);
  assert.equal(p.cache_creation_tokens, 3000);
  assert.equal(p.cache_creation_5m_tokens, 1000);
  assert.equal(p.cache_creation_1h_tokens, 2000);
  assert.equal(p.input_tokens_total, 9400);
  assert.equal(p.cache_hit_rate, 6000 / 9400);
  assert.equal(p.cache_markers, '1h,5m');
  // 400 x $2 + 6000 x $0.10 + 1000 x $2.50 + 2000 x $4 + 1000 x $10, per million.
  const expected = (400 * 2 + 6000 * 0.1 + 1000 * 2.5 + 2000 * 4 + 1000 * 10) / 1_000_000;
  assert.ok(Math.abs((p.cost_usd as number) - expected) < 1e-12);
  assert.equal(p.$ai_is_error, false);
  assert.equal(p.feature, 'application_generation');
});
