import assert from 'node:assert/strict';
import test from 'node:test';

import { parkedRunStillValid, stepAfterDroppedResume } from './logistics-resume';

// Ways a resume can go wrong, written before the helpers:
// - the parked kit belongs to another application now, and running it would write into the wrong one;
// - another run is already working, and a second kit would charge twice;
// - a session with no id yet (null) must still match its own parked run;
// - when nothing runs, the guided line must not stay on "Building": back to the fit result when there is
//   one (its Generate button keeps the after-fit price), otherwise to the job step.

test('a parked kit runs only for the same application and only when nothing else is working', () => {
  assert.equal(parkedRunStillValid('session-1', 'session-1', false), true);
  assert.equal(parkedRunStillValid('session-1', 'session-2', false), false);
  assert.equal(parkedRunStillValid('session-1', null, false), false);
  assert.equal(parkedRunStillValid(null, 'session-1', false), false);
  assert.equal(parkedRunStillValid('session-1', 'session-1', true), false);
});

test('two sessions without an id match each other', () => {
  assert.equal(parkedRunStillValid(null, null, false), true);
  assert.equal(parkedRunStillValid(null, null, true), false);
});

test('a dropped resume sends the guided line back to the fit result, or to the job when there is no fit', () => {
  assert.equal(stepAfterDroppedResume(true), 'fit-result');
  assert.equal(stepAfterDroppedResume(false), 'job');
});
