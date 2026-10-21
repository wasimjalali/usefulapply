/**
 * Profile update: the start date and salary expectation (migration 0012).
 * Failure cases come first: what must never reach the store.
 * Run: npx tsx --test src/lib/services/profile.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareProfileWrite } from './profile';
import { InvalidInputError } from './errors';

const NOW = '2026-10-21T10:00:00.000Z';
const write = (updates: Parameters<typeof prepareProfileWrite>[1]) => prepareProfileWrite('user-1', updates, NOW);

test('rejects an availability that is not one of the five choices', () => {
  assert.throws(() => write({ availability: 'tomorrow' as never }), InvalidInputError);
  assert.throws(() => write({ availability: 3 as never }), InvalidInputError);
});

test('rejects a start date note over 200 characters and a salary over 120', () => {
  assert.throws(() => write({ availability_note: 'x'.repeat(201) }), InvalidInputError);
  assert.throws(() => write({ salary_expectation: 'x'.repeat(121) }), InvalidInputError);
  assert.throws(() => write({ availabilityNote: 'x'.repeat(201) }), InvalidInputError);
  assert.throws(() => write({ salaryExpectation: 'x'.repeat(121) }), InvalidInputError);
  assert.equal(write({ availability_note: 'x'.repeat(200) }).availability_note?.length, 200);
  assert.equal(write({ salary_expectation: 'x'.repeat(120) }).salary_expectation?.length, 120);
});

test('rejects text fields that are not text', () => {
  assert.throws(() => write({ salary_expectation: 65000 as never }), InvalidInputError);
  assert.throws(() => write({ availability_note: { a: 1 } as never }), InvalidInputError);
});

test('a caller can never set availability_asked_at or another bookkeeping column', () => {
  assert.throws(() => write({ availability_asked_at: NOW } as never), /Forbidden profile fields: availability_asked_at/);
  assert.throws(() => write({ subscription_tier: 'max' } as never), InvalidInputError);
});

test('rejects the same field given as column and as alias', () => {
  assert.throws(() => write({ salary_expectation: '60k', salaryExpectation: '70k' }), InvalidInputError);
  assert.throws(() => write({ availability_note: 'a', availabilityNote: 'b' }), InvalidInputError);
});

test('a rejected update writes nothing: the error is thrown before any write is built', () => {
  assert.throws(() => write({ full_name: 'Ada', availability: 'nope' as never }), InvalidInputError);
});

test('existing free-text fields have length caps', () => {
  assert.throws(() => write({ full_name: 'x'.repeat(201) }), InvalidInputError);
  assert.throws(() => write({ phone: '1'.repeat(51) }), InvalidInputError);
  assert.throws(() => write({ linkedin_url: 'https://x.test/' + 'a'.repeat(300) }), InvalidInputError);
  assert.throws(() => write({ nationality: 'x'.repeat(101) }), InvalidInputError);
  assert.equal(write({ full_name: 'x'.repeat(200) }).full_name?.length, 200);
});

test('an avatar outside the user\'s own prefix is still refused', () => {
  assert.throws(() => write({ avatar_url: 'avatars/someone-else/a.jpg' }), InvalidInputError);
});

test('a skip (availability null) is stamped, so the question is never asked again', () => {
  const out = write({ availability: null });
  assert.equal(out.availability, null);
  assert.equal(out.availability_asked_at, NOW);
});

test('saving an answer stores it and stamps the time', () => {
  const out = write({ availability: 'other', availability_note: '  3 Monate   zum Quartalsende ', salary_expectation: '65.000 EUR brutto/Jahr' });
  assert.equal(out.availability, 'other');
  assert.equal(out.availability_note, '3 Monate zum Quartalsende');
  assert.equal(out.salary_expectation, '65.000 EUR brutto/Jahr');
  assert.equal(out.availability_asked_at, NOW);
});

test('a partial update leaves the other two fields out of the write', () => {
  const out = write({ salary_expectation: '70k' });
  assert.deepEqual(Object.keys(out).sort(), ['availability_asked_at', 'salary_expectation']);
  const clearNote = write({ availability_note: '   ' });
  assert.equal(clearNote.availability_note, null);
  assert.equal('availability' in clearNote, false);
});

test('camelCase aliases map to the columns', () => {
  const out = write({ availability: '1_month', availabilityNote: 'after my project', salaryExpectation: '' });
  assert.equal(out.availability_note, 'after my project');
  assert.equal(out.salary_expectation, null);
  assert.equal('availabilityNote' in out, false);
  assert.equal('salaryExpectation' in out, false);
});

test('an undefined value means not given, never clear', () => {
  const out = write({ availability: undefined, salary_expectation: undefined, full_name: 'Ada' });
  assert.equal('availability' in out, false);
  assert.equal('salary_expectation' in out, false);
  assert.equal('availability_asked_at' in out, false);
});

test('an update that has nothing to do with logistics does not stamp', () => {
  const out = write({ full_name: 'Ada', timezone: 'Europe/Berlin', notify_marketing: false });
  assert.equal('availability_asked_at' in out, false);
  assert.equal(out.full_name, 'Ada');
  assert.equal(out.timezone, 'Europe/Berlin');
});

test('the existing checks still run: unknown timezone and date format', () => {
  assert.throws(() => write({ timezone: 'Mars/Olympus' }), /Unknown timezone/);
  assert.throws(() => write({ date_format: 'yyyy' }), /Unknown date format/);
});
