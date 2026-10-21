import assert from 'node:assert/strict';
import test from 'node:test';

import type { MasterContext } from '../types';
import { buildScreeningPrompt } from '../../services/screening';
import { buildCoverLetterSystemBlocks, buildCoverLetterUserPrompt } from './cover-letter-prompt';
import {
  buildApplicationEmailSystemBlocks,
  buildApplicationEmailUserPrompt,
  buildFollowUpEmailSystemBlocks,
} from './email-prompts';
import { buildLogisticsBlock, statedAvailabilityLines, statedSalaryLines } from './logistics-prompt';

// The live failures of 2026-10-21: an email said "I can start as soon as we
// agree on a date" and a screening answer said "I have no notice period and can
// start immediately", with neither in any CV. The prompts asked for it.

const CV = [
  'Ada Lovelace, Senior Data Analyst',
  'Calder Industrial Components, Senior Data Analyst (2021 - Present)',
  '- Own the monthly forecast and variance reporting for two business units.',
  '- Kept the reporting platform at 99.9% availability through the ERP migration.',
].join('\n');

// The ad states its own start date and salary. Neither is the applicant's.
const JD = 'Senior Data Analyst. Start date: 1 January. Salary: 80,000 to 95,000 EUR. Please state your salary expectation.';

function context(overrides: Partial<MasterContext> = {}): MasterContext {
  return {
    sessionId: 'session-1',
    jobDescription: JD,
    rawCV: CV,
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
      title: 'Senior Data Analyst',
      companyName: 'Northwind',
      location: 'London, United Kingdom',
      requiredSkills: ['SQL'],
      niceToHaveSkills: [],
      responsibilities: ['Own the forecast'],
      startDate: '1 January',
      expectedSalary: '80,000 to 95,000 EUR',
    },
    ...overrides,
  };
}

const systemText = (blocks: Array<{ text: string }>) => blocks.map((block) => block.text).join('\n');

test('no writer prompt requires availability any more', () => {
  const email = buildApplicationEmailUserPrompt(context()) + systemText(buildApplicationEmailSystemBlocks());
  const letter = buildCoverLetterUserPrompt(context()) + systemText(buildCoverLetterSystemBlocks());
  for (const prompt of [email, letter]) {
    assert.doesNotMatch(prompt, /specific availability/i);
    assert.doesNotMatch(prompt, /the applicant's availability\./i);
    assert.doesNotMatch(prompt, /a close with availability/i);
    assert.doesNotMatch(prompt, /availability or next steps/i);
    assert.doesNotMatch(prompt, /before the availability sentence/i);
  }
  assert.match(email, /Close with a next step or call to action/);
  assert.match(email, /The default is to leave availability out and close with a next step/);
  assert.match(letter, /The third paragraph ends with a next step/);
});

test('without a stated availability, the writers get a no-date rule and never "immediately"', () => {
  const block = buildLogisticsBlock(context(), 'email');
  assert.match(block, /Neither CV states the applicant's availability/);
  assert.match(block, /"after my notice period"/);
  assert.match(block, /with no date, and only when the CVs show a current role/);
  assert.match(block, /Never write that the applicant can start immediately, right away, at short notice or as soon as a date is agreed, or that they have no notice period/);
  // "99.9% availability" is an achievement, not a start date.
  assert.deepEqual(statedAvailabilityLines(context()), []);
});

test('the ad is never a source: its start date and salary do not count as stated', () => {
  const block = buildLogisticsBlock(context(), 'letter');
  assert.doesNotMatch(block, /1 January/);
  assert.doesNotMatch(block, /80,000/);
  assert.deepEqual(statedSalaryLines(context()), []);
});

test('salary is forbidden unless the applicant stated it', () => {
  for (const prompt of [buildApplicationEmailUserPrompt(context()), buildCoverLetterUserPrompt(context())]) {
    assert.match(prompt, /The applicant hasn't stated a salary expectation, so salary stays out entirely, even when the job ad asks for one\./);
  }
  assert.match(systemText(buildApplicationEmailSystemBlocks()), /Salary never appears unless the applicant stated it\./);
  assert.match(systemText(buildCoverLetterSystemBlocks()), /Salary never appears unless the applicant stated it\./);
  assert.match(systemText(buildFollowUpEmailSystemBlocks()), /says nothing about availability, notice period, start date, salary/);

  // A job-feed salary floor is a search filter, not an expectation.
  const withFloor = buildCoverLetterUserPrompt(context({ jobPreferences: { salaryFloor: 70_000 } }));
  assert.match(withFloor, /The salary floor in the applicant job preferences is a search filter, not a salary expectation, and never appears\./);

  // A salary expectation the applicant wrote in their Master CV is theirs to use.
  const stated = context({ masterCV: 'Salary expectation: 85,000 EUR per year' });
  assert.deepEqual(statedSalaryLines(stated), ['Salary expectation: 85,000 EUR per year']);
  const block = buildLogisticsBlock(stated, 'email');
  assert.match(block, /- "Salary expectation: 85,000 EUR per year"/);
  assert.match(block, /only when the job ad asks for a salary expectation, and only as the applicant stated it/);
  assert.doesNotMatch(block, /salary stays out entirely/);
});

test('a German job gets the German standard wording, an English one does not', () => {
  const german = context({ detectedLanguage: 'de', job: { ...context().job!, location: 'München, Deutschland' } });
  for (const prompt of [buildApplicationEmailUserPrompt(german), buildCoverLetterUserPrompt(german)]) {
    assert.match(prompt, /"nach Ablauf meiner Kündigungsfrist"/);
    assert.match(prompt, /Job location \(the market\): München, Deutschland/);
  }
  for (const prompt of [buildApplicationEmailUserPrompt(context()), buildCoverLetterUserPrompt(context())]) {
    assert.doesNotMatch(prompt, /Kündigungsfrist/);
    assert.match(prompt, /"after my notice period"/);
  }
  // The user's language override wins over the detected language, as it does for the rest of the letter.
  assert.match(buildCoverLetterUserPrompt(context({ detectedLanguage: 'en', userLanguageOverride: 'de' })), /"nach Ablauf meiner Kündigungsfrist"/);
});

test('an availability the CV states is passed through and used as written', () => {
  const primary = context({ rawCV: `${CV}\nNotice period: 3 months` });
  assert.deepEqual(statedAvailabilityLines(primary), ['Notice period: 3 months']);
  for (const prompt of [buildApplicationEmailUserPrompt(primary), buildCoverLetterUserPrompt(primary)]) {
    assert.match(prompt, /- "Notice period: 3 months"\nIf one of them states the applicant's own availability, notice period or start date, use it as written/);
    assert.doesNotMatch(prompt, /Neither CV states the applicant's availability/);
  }

  const master = context({ detectedLanguage: 'de', masterCV: 'Kündigungsfrist: 6 Wochen zum Quartalsende\nVerfügbar ab 01.03.2027' });
  assert.deepEqual(statedAvailabilityLines(master), ['Kündigungsfrist: 6 Wochen zum Quartalsende', 'Verfügbar ab 01.03.2027']);
  assert.match(buildLogisticsBlock(master, 'letter'), /use it as written \(in German\)/);
});

test('the applicant\'s own instruction counts for logistics only', () => {
  const block = buildLogisticsBlock(context({ userInstruction: 'Say I can start in March.' }), 'email');
  assert.match(block, /an availability, notice period, start date or salary expectation it states may be used as stated\. This exception covers those logistics only, never skills, experience, metrics or results\./);
  assert.doesNotMatch(buildLogisticsBlock(context(), 'email'), /rewrite instruction counts/);
});

test('screening answers: non-committal start date, no invented salary, no guessed eligibility', () => {
  const prompt = buildScreeningPrompt({ jobTitle: 'Senior Data Analyst', company: 'Northwind', jobDescription: JD });
  assert.match(prompt, /^You write job application screening answers inside Useful Apply/);
  assert.doesNotMatch(prompt, /Numeric or factual \(years of experience, salary, start date\): 1 sentence under 20 words\.$/m);
  assert.match(prompt, /"Ich kann nach Ablauf meiner Kündigungsfrist beginnen\."/);
  assert.match(prompt, /"I can start after my notice period\."/);
  assert.match(prompt, /Never say immediately, right away, at short notice or no notice period unless the applicant stated exactly that\./);
  assert.match(prompt, /Otherwise answer that it's open to discussion, with no figure/);
  assert.match(prompt, /Never take a figure from the job description\./);
  assert.match(prompt, /don't guess yes or no/);
});

test('the cached system prefixes stay static', () => {
  assert.equal(systemText(buildApplicationEmailSystemBlocks()), systemText(buildApplicationEmailSystemBlocks()));
  assert.equal(systemText(buildCoverLetterSystemBlocks()), systemText(buildCoverLetterSystemBlocks()));
  assert.doesNotMatch(systemText(buildApplicationEmailSystemBlocks()) + systemText(buildCoverLetterSystemBlocks()), /Kündigungsfrist|after my notice period/);
});
