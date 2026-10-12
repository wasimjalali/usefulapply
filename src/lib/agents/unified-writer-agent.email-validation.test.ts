import assert from 'node:assert/strict';
import test from 'node:test';

import type { LlmGenerationContext } from '@/db/repos/adminMetrics';
import type { ModelCallOptions, ModelResponse } from '@/lib/models';
import type { MasterContext } from './types';
import {
  EmailValidationError,
  generateApplicationEmailWithRetry,
  generateFollowUpEmailWithRetry,
  unifiedWriterAgent,
} from './unified-writer-agent';

const GENERATION_CONTEXT: LlmGenerationContext = {
  requestExecutionId: 'request-1',
  route: '/api/agent-v2',
  feature: 'application_generation',
  operation: 'full_optimization',
};

function context(): MasterContext {
  return {
    sessionId: 'session-1',
    jobDescription: 'Software Engineer at Example Corp.',
    rawCV: 'Ada Lovelace\nSoftware Engineer',
    detectedLanguage: 'en',
    applicant: {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      skills: [],
      tools: [],
      languages: [],
      experiences: [],
      certifications: [],
    },
    job: {
      title: 'Software Engineer',
      companyName: 'Example Corp',
      requiredSkills: [],
      niceToHaveSkills: [],
      responsibilities: [],
    },
  };
}

function response(content: string, generationId: string, inputTokens = 10, outputTokens = 5): ModelResponse {
  return {
    content,
    usage: { inputTokens, outputTokens },
    model: 'test-model',
    provider: 'anthropic',
    latencyMs: 1,
    generationId,
  };
}

const VALID_APPLICATION_EMAIL = JSON.stringify({
  subject: 'Application: Software Engineer, Ada Lovelace',
  body: 'Dear Hiring Team,\n\nI am applying for the Software Engineer role. My CV and cover letter are attached. I am available to discuss the role next week.\n\nKind regards,\nAda Lovelace',
});

const LONG_SUBJECT_APPLICATION_EMAIL = JSON.stringify({
  subject: `Application: ${'Senior Software Engineer '.repeat(3)}, Ada Lovelace`,
  body: 'Dear Hiring Team,\n\nI am applying for the Software Engineer role. My CV and cover letter are attached. I am available to discuss the role next week.\n\nKind regards,\nAda Lovelace',
});

// A non-length miss: a bracketed placeholder still fails validation.
const PLACEHOLDER_APPLICATION_EMAIL = JSON.stringify({
  subject: 'Application: Software Engineer, Ada Lovelace',
  body: 'Dear [Hiring Manager],\n\nI am applying for the Software Engineer role. My CV and cover letter are attached.\n\nKind regards,\nAda Lovelace',
});

for (const mode of ['cached', 'direct'] as const) {
test(`an overlong subject renders as written, with no retry, in the ${mode} kit`, async () => {
  const calls: ModelCallOptions[] = [];
  const modelCall = async (options: ModelCallOptions): Promise<ModelResponse> => {
    calls.push(options);
    return response(LONG_SUBJECT_APPLICATION_EMAIL, `generation-${calls.length}`, 10, 5);
  };
  const masterContext = context();
  const harness: typeof unifiedWriterAgent = {
    ...unifiedWriterAgent,
    async extractApplicantProfile() {
      return { result: masterContext.applicant!, tokens: { input: 1, output: 1 } };
    },
    async parseJobDescription() {
      return { result: masterContext.job!, tokens: { input: 1, output: 1 } };
    },
    async extractVerifiedMetrics() {
      return { result: [], tokens: { input: 1, output: 1 } };
    },
    async detectLanguage() { return 'en'; },
    async computeSkillMatch() {
      return {
        result: { score: 68, matchedRequirements: [], claimableEvidence: [], missingSkills: [] },
        tokens: { input: 1, output: 1 },
      };
    },
    async generateOptimizedCVData() {
      return {
        cvData: {} as NonNullable<MasterContext['optimizedCVData']>,
        legacyCV: { content: 'CV', changes: [] },
        tokens: { input: 1, output: 1 },
      };
    },
    async generateCoverLetter() {
      return { result: 'Cover letter', tokens: { input: 1, output: 1 } };
    },
    async generateApplicationEmail(generationContextValue, ledgerContext) {
      return generateApplicationEmailWithRetry(generationContextValue, ledgerContext, modelCall);
    },
    async generateFollowUpEmail() {
      return {
        result: { subject: 'Following Up: Software Engineer', body: 'Follow-up\nAda Lovelace', recommendedDelay: 5 },
        tokens: { input: 2, output: 1 },
      };
    },
  };

  const result = mode === 'cached'
    ? await harness.runWithContext(masterContext, () => undefined, GENERATION_CONTEXT)
    : await harness.run({
        sessionId: masterContext.sessionId,
        primaryCV: masterContext.rawCV,
        jobDescription: masterContext.jobDescription,
        generationContext: GENERATION_CONTEXT,
      }, () => undefined);

  assert.equal(result.success, true);
  assert.equal(result.data?.context.applicationEmail?.subject, JSON.parse(LONG_SUBJECT_APPLICATION_EMAIL).subject);
  assert.equal(result.data?.context.followUpEmail?.recommendedDelay, 5);
  assert.deepEqual(result.data?.documentErrors, {});
  assert.equal(calls.length, 1);
});
}

test('malformed email JSON retries without copying draft text into correction instructions', async () => {
  const calls: ModelCallOptions[] = [];
  const result = await generateApplicationEmailWithRetry(context(), GENERATION_CONTEXT, async (options) => {
    calls.push(options);
    return calls.length === 1
      ? response('Private draft fragment, invalid JSON', 'generation-1', 10, 5)
      : response(VALID_APPLICATION_EMAIL, 'generation-2', 7, 3);
  });
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls[1].prompt, /Private draft fragment/u);
  assert.deepEqual(result.tokens, { input: 17, output: 8 });
});

test('a persistent invalid application email fails after one correction', async () => {
  let calls = 0;
  const modelCall = async (): Promise<ModelResponse> => {
    calls += 1;
    return response(PLACEHOLDER_APPLICATION_EMAIL, `generation-${calls}`);
  };

  await assert.rejects(
    generateApplicationEmailWithRetry(context(), GENERATION_CONTEXT, modelCall),
    (error: unknown) => {
      assert.ok(error instanceof EmailValidationError);
      assert.equal(error.message, 'Application email contained a placeholder');
      return true;
    },
  );
  assert.equal(calls, 2);
});

test('a provider failure is not retried', async () => {
  let calls = 0;
  const providerError = new Error('provider unavailable');
  const modelCall = async (): Promise<ModelResponse> => {
    calls += 1;
    throw providerError;
  };

  await assert.rejects(
    generateApplicationEmailWithRetry(context(), GENERATION_CONTEXT, modelCall),
    (error: unknown) => error === providerError,
  );
  assert.equal(calls, 1);
});

test('a valid application email uses one model call', async () => {
  let calls = 0;
  const modelCall = async (): Promise<ModelResponse> => {
    calls += 1;
    return response(VALID_APPLICATION_EMAIL, 'generation-1', 11, 6);
  };

  const result = await generateApplicationEmailWithRetry(context(), GENERATION_CONTEXT, modelCall);

  assert.equal(calls, 1);
  assert.deepEqual(result.tokens, { input: 11, output: 6 });
  assert.equal(result.result.subject, 'Application: Software Engineer, Ada Lovelace');
});

test('follow-up email validation gets the same bounded correction', async () => {
  const calls: ModelCallOptions[] = [];
  const modelCall = async (options: ModelCallOptions): Promise<ModelResponse> => {
    calls.push(options);
    const content = calls.length === 1
      ? JSON.stringify({
          subject: 'Following Up: Software Engineer',
          body: 'Dear Hiring Team,\n\nI wanted to follow up.\n\nKind regards,\nAda Lovelace',
          recommendedDelay: 9,
        })
      : JSON.stringify({
          subject: 'Following Up: Software Engineer',
          body: 'Dear Hiring Team,\n\nI wanted to follow up.\n\nKind regards,\nAda Lovelace',
          recommendedDelay: 5,
        });
    return response(content, `generation-${calls.length}`, 4, 2);
  };

  const result = await generateFollowUpEmailWithRetry(context(), GENERATION_CONTEXT, modelCall);

  assert.equal(calls.length, 2);
  assert.deepEqual(result.tokens, { input: 8, output: 4 });
  assert.equal(result.result.recommendedDelay, 5);
  assert.equal(calls[1].generationContext?.parentGenerationId, 'generation-1');
});

test('a follow-up validation failure leaves the rest of the kit intact', async () => {
  const masterContext = context();
  const emittedErrors: Array<{ step: string; error: string }> = [];
  const harness: typeof unifiedWriterAgent = {
    ...unifiedWriterAgent,
    async generateOptimizedCVData() {
      return {
        cvData: {} as NonNullable<MasterContext['optimizedCVData']>,
        legacyCV: { content: 'CV', changes: [] },
        tokens: { input: 1, output: 1 },
      };
    },
    async generateCoverLetter() {
      return { result: 'Cover letter', tokens: { input: 1, output: 1 } };
    },
    async generateApplicationEmail() {
      return {
        result: JSON.parse(VALID_APPLICATION_EMAIL) as { subject: string; body: string },
        tokens: { input: 1, output: 1 },
      };
    },
    async generateFollowUpEmail() {
      throw new EmailValidationError('Follow-up email contained a placeholder');
    },
  };

  const result = await unifiedWriterAgent.runWithContext.call(
    harness,
    masterContext,
    (event) => {
      if (event.type === 'step_error') emittedErrors.push({ step: event.step.id, error: event.error });
    },
    GENERATION_CONTEXT,
  );

  assert.equal(result.success, true);
  assert.deepEqual(result.data?.documentErrors, { followUpEmail: 'VALIDATION_FAILED' });
  assert.deepEqual(emittedErrors, [{ step: 'follow_up', error: 'Follow-up email contained a placeholder' }]);
  assert.equal(result.data?.context.coverLetter, 'Cover letter');
  assert.equal(result.data?.context.applicationEmail?.subject, 'Application: Software Engineer, Ada Lovelace');
  assert.equal(result.data?.context.followUpEmail, undefined);
  // The cached context the run was handed is never written to.
  assert.equal(masterContext.coverLetter, undefined);
});
