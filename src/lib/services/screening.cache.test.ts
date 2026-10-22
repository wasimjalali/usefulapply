import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildScreeningApplicantContext,
  buildScreeningPrompt,
  buildScreeningRequestContext,
  buildScreeningStaticPrompt,
  screeningMessages,
  type ScreeningPromptContext,
} from './screening';

// Cache layout (.claude/rules/prompt-caching.md): tools, static rules, the per-user applicant block
// (saved start date and salary rules, then the CVs), then the
// per-request application block and the question. One byte of drift before a marker is a miss.

const ENGLISH: ScreeningPromptContext = {
  jobTitle: 'Senior Data Analyst',
  company: 'Northwind Traders',
  jobDescription: 'Own the monthly forecast. Eintritt zum 1. April is NOT in this ad.',
  matchingSkills: ['SQL', 'Forecasting'],
  missingSkills: ['Rust'],
  generatedCVSummary: 'Ada Lovelace, Senior Data Analyst\n- Cut forecast error by 18%.',
  companyResearchSummary: 'Makes forecasting tools.',
};
const GERMAN: ScreeningPromptContext = {
  jobTitle: 'Leitung Controlling (m/w/d)',
  company: 'Bosch GmbH',
  jobDescription: 'Leitung des Controllings, Gehalt: 90.000 EUR, Standort Stuttgart.',
  matchingSkills: ['SAP'],
  generatedCVSummary: 'Max Mustermann, Controller',
};
const ADA_CVS = { primaryCV: 'Ada Lovelace\nNotice period: 3 months', masterCV: 'Ada Lovelace master\nLed the planning cycle.' };
const MAX_CVS = { primaryCV: 'Max Mustermann\nKündigungsfrist: 3 Monate', masterCV: undefined };

test('screening: the static block is byte-identical for every user and request', () => {
  const first = buildScreeningStaticPrompt();
  const second = buildScreeningStaticPrompt();
  assert.equal(first, second);
  // Nothing from any request, user or application can be in it.
  for (const text of [
    ...Object.values(ENGLISH).flat(),
    ...Object.values(GERMAN).flat(),
    ...Object.values(ADA_CVS),
    ...Object.values(MAX_CVS),
  ]) {
    if (typeof text === 'string') assert.ok(!first.includes(text), `request data leaked into the static block: ${text}`);
  }
  assert.doesNotMatch(first, /<applicant_primary_cv>|<untrusted_job_description>|^# Application$/m);
  assert.doesNotMatch(first, /[—–―]/);
  // Over Haiku 5.5's 512-token minimum at 1.8 chars per token, so the marker caches.
  assert.ok(first.length / 1.8 > 512, `static block too short to cache: ${first.length} chars`);
});

test('screening: the applicant block is the same for one user across applications and turns, and differs per user', () => {
  const adaOnEnglishJob = buildScreeningApplicantContext({ ...ENGLISH, ...ADA_CVS });
  const adaOnGermanJob = buildScreeningApplicantContext({ ...GERMAN, ...ADA_CVS });
  assert.equal(adaOnEnglishJob, adaOnGermanJob);
  assert.notEqual(adaOnEnglishJob, buildScreeningApplicantContext({ ...ENGLISH, ...MAX_CVS }));
  const noCvs = buildScreeningApplicantContext(ENGLISH);
  assert.doesNotMatch(noCvs, /<applicant_primary_cv>|<applicant_master_cv>/, 'no CVs, no CV tags');
  assert.match(noCvs, /^# The applicant's start date and salary\n/);
  // Only CV text: nothing about the application.
  for (const text of [ENGLISH.jobTitle!, ENGLISH.company!, ENGLISH.jobDescription!, ENGLISH.generatedCVSummary!]) {
    assert.ok(!adaOnEnglishJob.includes(text));
  }
  assert.match(adaOnEnglishJob, /^# The applicant's start date and salary\n[\s\S]*\n\nThe applicant's own uploaded CV and full master CV/);
});

test('screening: a saved start date or salary changes only the applicant block, never the static rules', () => {
  const logistics = { availability: '1_month' as const, availabilityNote: null, salaryExpectation: '65,000 EUR gross a year' };
  const plain = buildScreeningPrompt({ ...ENGLISH, ...ADA_CVS });
  const withSaved = buildScreeningPrompt({ ...ENGLISH, ...ADA_CVS, logistics });
  assert.ok(withSaved.startsWith(buildScreeningStaticPrompt()));
  assert.notEqual(buildScreeningApplicantContext({ ...ADA_CVS, logistics }), buildScreeningApplicantContext(ADA_CVS));
  assert.ok(!buildScreeningStaticPrompt().includes('65,000'));
  assert.ok(withSaved.includes('65,000 EUR gross a year'));
  assert.notEqual(plain, withSaved);
});

test('screening: per-request data sits in the application block, after the cached parts', () => {
  const english = buildScreeningRequestContext({ ...ENGLISH, ...ADA_CVS });
  const german = buildScreeningRequestContext({ ...GERMAN, ...ADA_CVS });
  assert.match(english, /^# Application\nJob title: Senior Data Analyst\nCompany: Northwind Traders/);
  assert.match(english, /Matching skills: SQL, Forecasting/);
  assert.match(german, /Job title: Leitung Controlling/);
  assert.notEqual(english, german);
  // The CVs belong to the stable block, not to the request block.
  assert.ok(!english.includes('Notice period: 3 months'));
  assert.ok(!german.includes('applicant_primary_cv'));

  // The whole prompt reads static, then CVs, then the application.
  const whole = buildScreeningPrompt({ ...ENGLISH, ...ADA_CVS });
  assert.ok(whole.startsWith(buildScreeningStaticPrompt()));
  assert.ok(whole.indexOf('<applicant_primary_cv>') < whole.indexOf('# Application'));
});

test('screening: messages keep the history, put the application in front of the question, and fail loud on bad history', () => {
  const request = buildScreeningRequestContext(ENGLISH);
  const messages = screeningMessages(
    [
      { role: 'assistant', content: 'An answer from a window that started mid-conversation.' },
      { role: 'user', content: 'Why this role?' },
      { role: 'assistant', content: 'Answer one.' },
      { role: 'user', content: 'Notice period?' },
    ],
    'Notice period?',
    request,
  );
  assert.deepEqual(messages.map((turn) => turn.role), ['user', 'assistant', 'user'], 'leading assistant turn dropped');
  assert.equal(messages[0].content, 'Why this role?', 'earlier turns pass through untouched');
  assert.equal(messages[2].content, `${request}\n\n# Screening questions\nNotice period?`);

  assert.throws(() => screeningMessages([{ role: 'user', content: 'Q' }, { role: 'assistant', content: 'A' }], 'Q', request), /must end with the current user turn/);
  assert.throws(() => screeningMessages([{ role: 'tool', content: 'x' }, { role: 'user', content: 'Q' }], 'Q', request), /Unexpected screening history role: tool/);
});
