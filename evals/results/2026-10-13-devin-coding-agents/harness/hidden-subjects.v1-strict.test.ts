// Hidden acceptance test for eval Task B (email subjects built in code).
// Copied into src/lib/agents/ at grading time only; the models never saw it.
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ModelCallOptions, ModelResponse } from '@/lib/models';
import type { MasterContext } from './types';
import {
  generateApplicationEmailWithRetry,
  generateFollowUpEmailWithRetry,
} from './unified-writer-agent';
import {
  buildApplicationEmailSystemBlocks,
  buildApplicationEmailUserPrompt,
  buildFollowUpEmailSystemBlocks,
  buildFollowUpEmailUserPrompt,
} from './prompts/email-prompts';

function ctx(lang: string, title: string, name: string): MasterContext {
  return {
    sessionId: 's1',
    jobDescription: `${title} at Example Corp.`,
    rawCV: `${name}\nEngineer`,
    detectedLanguage: lang,
    applicant: { name, email: 'a@example.com', skills: [], tools: [], languages: [], experiences: [], certifications: [] },
    job: { title, companyName: 'Example Corp', requiredSkills: [], niceToHaveSkills: [], responsibilities: [] },
  } as MasterContext;
}

function reply(obj: Record<string, unknown>) {
  const calls: ModelCallOptions[] = [];
  const call = async (o: ModelCallOptions): Promise<ModelResponse> => {
    calls.push(o);
    return { content: JSON.stringify(obj), usage: { inputTokens: 1, outputTokens: 1 }, model: 't', provider: 'anthropic', latencyMs: 1, generationId: `g${calls.length}` };
  };
  return { call, calls };
}

const body = (name: string) => `Dear Hiring Team,\n\nI am applying for this role. My CV and cover letter are attached. I am available next week.\n\nKind regards,\n${name || 'Applicant'}`;

async function app(lang: string, title: string, name: string, withSubject = true) {
  const r = reply(withSubject ? { subject: 'MODEL SUBJECT THAT MUST BE IGNORED, very long and full of keywords', body: body(name) } : { body: body(name) });
  const { result } = await generateApplicationEmailWithRetry(ctx(lang, title, name), undefined, r.call);
  return { subject: result.subject, calls: r.calls.length };
}

async function fu(lang: string, title: string, name: string, withSubject = true) {
  const delay = lang === 'de' ? 7 : 5;
  const r = reply(withSubject ? { subject: 'MODEL SUBJECT', body: body(name), recommendedDelay: delay } : { body: body(name), recommendedDelay: delay });
  const { result } = await generateFollowUpEmailWithRetry(ctx(lang, title, name), undefined, r.call);
  return { subject: result.subject, calls: r.calls.length, delay: result.recommendedDelay };
}

test('H1 en application ignores the model subject', async () => {
  const r = await app('en', 'Software Engineer', 'Ada Lovelace');
  assert.equal(r.subject, 'Application: Software Engineer, Ada Lovelace');
  assert.equal(r.calls, 1);
});

test('H2 body-only response accepted without retry', async () => {
  const r = await app('en', 'Software Engineer', 'Ada Lovelace', false);
  assert.equal(r.subject, 'Application: Software Engineer, Ada Lovelace');
  assert.equal(r.calls, 1);
});

test('H3 German application has no colon', async () => {
  assert.equal((await app('de', 'Software Engineer', 'Ada Lovelace')).subject, 'Bewerbung als Software Engineer, Ada Lovelace');
});

test('H4 French application prefix', async () => {
  assert.equal((await app('fr', 'Software Engineer', 'Ada Lovelace')).subject, 'Candidature: Software Engineer, Ada Lovelace');
});

test('H5 step a: primary title before slash fits (de)', async () => {
  assert.equal((await app('de', 'Junior Webentwickler / E-Commerce', 'Max Mustermann')).subject, 'Bewerbung als Junior Webentwickler, Max Mustermann');
});

test('H6 step a: en dash separator', async () => {
  assert.equal((await app('en', 'Data Analyst – Marketing Insights & Growth Analytics Team', 'Ada Lovelace')).subject, 'Application: Data Analyst, Ada Lovelace');
});

test('H7 step b: drop name when primary title + name is still too long', async () => {
  assert.equal((await app('en', 'Senior Full Stack Software Engineer / Platform Infrastructure', 'Ada Lovelace')).subject, 'Application: Senior Full Stack Software Engineer');
});

test('H8 step c: cut at last word boundary', async () => {
  const title = 'Principal Distributed Systems Reliability Engineering Manager Europe';
  const s = (await app('en', title, 'Ada')).subject;
  const words = title.split(' ');
  let expected = 'Application:';
  for (const w of words) {
    if ((`${expected} ${w}`).length > 60) break;
    expected = `${expected} ${w}`;
  }
  assert.equal(s, expected);
  assert.ok(s.length <= 60);
});

test('H9 whitespace collapsed', async () => {
  assert.equal((await app('en', '  Software   Engineer ', ' Ada   Lovelace ')).subject, 'Application: Software Engineer, Ada Lovelace');
});

test('H10 missing name', async () => {
  assert.equal((await app('en', 'Software Engineer', '')).subject, 'Application: Software Engineer');
});

test('H11 missing title, German application', async () => {
  assert.equal((await app('de', '', 'Ada Lovelace')).subject, 'Bewerbung: Ada Lovelace');
});

test('H12 missing title, English application', async () => {
  assert.equal((await app('en', '', 'Ada Lovelace')).subject, 'Application: Ada Lovelace');
});

test('H13 en follow-up', async () => {
  const r = await fu('en', 'Software Engineer', 'Ada Lovelace');
  assert.equal(r.subject, 'Following Up: Software Engineer, Ada Lovelace');
  assert.equal(r.delay, 5);
  assert.equal(r.calls, 1);
});

test('H14 de follow-up, body-only response', async () => {
  const r = await fu('de', 'Software Engineer', 'Ada Lovelace', false);
  assert.equal(r.subject, 'Nachfrage: Software Engineer, Ada Lovelace');
  assert.equal(r.delay, 7);
  assert.equal(r.calls, 1);
});

test('H15 follow-up long title respects the cap', async () => {
  const r = await fu('fr', 'Ingénieur logiciel principal plateforme données / Cloud Europe', 'Marie-Claire Dubois');
  assert.ok(r.subject.length <= 60, r.subject);
  assert.ok(r.subject.startsWith('Suivi de candidature: Ingénieur'), r.subject);
});

function promptText(blocks: Array<{ text: string }>, user: string) {
  return blocks.map((b) => b.text).join('\n') + '\n' + user;
}

test('P1 application prompts no longer ask for a subject', () => {
  for (const lang of ['en', 'de']) {
    const c = ctx(lang, 'Software Engineer', 'Ada Lovelace');
    const text = promptText(buildApplicationEmailSystemBlocks(), buildApplicationEmailUserPrompt(c));
    assert.ok(!/subject/i.test(text), `application prompt (${lang}) still mentions subject`);
  }
});

test('P2 follow-up prompts only mention the subject as primary-email context', () => {
  for (const lang of ['en', 'de']) {
    const c = ctx(lang, 'Software Engineer', 'Ada Lovelace');
    const text = promptText(buildFollowUpEmailSystemBlocks(), buildFollowUpEmailUserPrompt(c));
    const lines = text.split('\n').filter((l) => /subject/i.test(l) && !/primary_email_subject|primary email/i.test(l));
    assert.deepEqual(lines, [], `follow-up prompt (${lang}) still has subject rules`);
  }
});
