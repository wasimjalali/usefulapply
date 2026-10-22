import assert from 'node:assert/strict';
import test from 'node:test';

import { InvalidInputError } from '@/lib/services/errors';
import {
  AVAILABILITY_CHOICES,
  AVAILABILITY_NOTE_MAX,
  LOGISTICS_TEXT_BLOCKED_MESSAGE,
  SALARY_EXPECTATION_MAX,
  availabilityFact,
  hasBlockedLogisticsText,
  logisticsFromProfile,
  needsAvailabilityPrompt,
  normalizeLogisticsUpdate,
  profileGaps,
  touchesLogistics,
} from './logistics';

// The ways this can go wrong, first.

test('an unknown start-date choice is refused with a message safe to show', () => {
  for (const bad of ['tomorrow', 'ASAP', 3, true, {}, ['1_month']]) {
    assert.throws(() => normalizeLogisticsUpdate({ availability: bad }), InvalidInputError, String(bad));
  }
});

test('text that is too long, or not text, is refused', () => {
  assert.throws(() => normalizeLogisticsUpdate({ availabilityNote: 'x'.repeat(AVAILABILITY_NOTE_MAX + 1) }), InvalidInputError);
  assert.throws(() => normalizeLogisticsUpdate({ salaryExpectation: 'x'.repeat(SALARY_EXPECTATION_MAX + 1) }), InvalidInputError);
  assert.throws(() => normalizeLogisticsUpdate({ salaryExpectation: 65000 }), InvalidInputError);
  // Exactly at the limit is fine.
  assert.equal(normalizeLogisticsUpdate({ salaryExpectation: 'x'.repeat(SALARY_EXPECTATION_MAX) }).salary_expectation?.length, SALARY_EXPECTATION_MAX);
});

test('a profile that has not loaded never triggers the questions', () => {
  assert.equal(needsAvailabilityPrompt(null), false);
  assert.equal(needsAvailabilityPrompt(undefined), false);
});

test('a skip is remembered: availability null but asked_at set means do not ask again', () => {
  assert.equal(needsAvailabilityPrompt({ availability: null, availability_asked_at: '2026-10-21T20:00:00.000Z' }), false);
  assert.equal(needsAvailabilityPrompt({ availability: null, availability_asked_at: null }), true);
  assert.equal(needsAvailabilityPrompt({}), true);
});

test('"Other" with no details counts as not given, everywhere', () => {
  const profile = { availability: 'other', availability_note: '   ' };
  assert.deepEqual(logisticsFromProfile(profile), { availability: null, availabilityNote: null, salaryExpectation: null });
  assert.equal(availabilityFact(logisticsFromProfile(profile)), null);
  assert.deepEqual(profileGaps(profile), ['availability', 'salaryExpectation']);
});

test('a stored value outside the choices (old or tampered row) is treated as not given', () => {
  assert.equal(logisticsFromProfile({ availability: 'next_week' }).availability, null);
});

// And what it should do.

test('a partial update only returns the keys that were sent; empty text becomes null', () => {
  assert.deepEqual(normalizeLogisticsUpdate({ salaryExpectation: '  65.000 EUR   brutto/Jahr ' }), { salary_expectation: '65.000 EUR brutto/Jahr' });
  assert.deepEqual(normalizeLogisticsUpdate({ availability: '', availabilityNote: '' }), { availability: null, availability_note: null });
  assert.deepEqual(normalizeLogisticsUpdate({}), {});
  for (const choice of AVAILABILITY_CHOICES) assert.equal(normalizeLogisticsUpdate({ availability: choice }).availability, choice);
});

test('any touched field (a skip included) stamps availability_asked_at; an untouched update does not', () => {
  assert.equal(touchesLogistics(normalizeLogisticsUpdate({ availability: null })), true);
  assert.equal(touchesLogistics(normalizeLogisticsUpdate({ salaryExpectation: '' })), true);
  assert.equal(touchesLogistics(normalizeLogisticsUpdate({})), false);
});

test('the prompt fact keeps the applicant\'s own words and never adds a date', () => {
  assert.equal(availabilityFact({ availability: '1_month', availabilityNote: null, salaryExpectation: null }), 'can start one month after accepting an offer');
  assert.equal(availabilityFact({ availability: 'other', availabilityNote: '3 Monate zum Quartalsende', salaryExpectation: null }), '3 Monate zum Quartalsende');
  assert.equal(availabilityFact({ availability: '3_months', availabilityNote: 'to the end of the quarter', salaryExpectation: null }), 'can start three months after accepting an offer (to the end of the quarter)');
  assert.equal(availabilityFact({ availability: null, availabilityNote: 'ignored', salaryExpectation: null }), null);
});

test('gaps list only what is missing', () => {
  assert.deepEqual(profileGaps({ availability: '2_weeks', salary_expectation: '65k' }), []);
  assert.deepEqual(profileGaps({ availability: '2_weeks' }), ['salaryExpectation']);
  assert.deepEqual(profileGaps(null), ['availability', 'salaryExpectation']);
});

test('< > [ ] in the note or salary are refused at the source', () => {
  for (const bad of ['>60.000 EUR', '<70k', '3 Monate [Quartalsende]', 'x]']) {
    assert.throws(() => normalizeLogisticsUpdate({ salaryExpectation: bad }), /can't contain < > \[ or \]/, bad);
    assert.throws(() => normalizeLogisticsUpdate({ availabilityNote: bad }), InvalidInputError, bad);
  }
});

test('the screens run the same blocked-sign check as the service, and say why in the agreed words', () => {
  for (const bad of ['>60.000 EUR', '<70k', '3 Monate [Quartalsende]', 'x]', 'a > b']) {
    assert.equal(hasBlockedLogisticsText(bad), true, bad);
  }
  // Normal punctuation passes, and so does everything the service accepts.
  for (const fine of ['65.000 EUR brutto/Jahr', '3 Monate zum Quartalsende (nach der Probezeit)', 'over 60k, negotiable', "ab 1. März; Mo-Fr", '€70k - 75k']) {
    assert.equal(hasBlockedLogisticsText(fine), false, fine);
    assert.doesNotThrow(() => normalizeLogisticsUpdate({ salaryExpectation: fine, availabilityNote: fine }), fine);
  }
  assert.equal(LOGISTICS_TEXT_BLOCKED_MESSAGE, "Use letters, numbers and normal punctuation. < > [ and ] aren't allowed.");
});
