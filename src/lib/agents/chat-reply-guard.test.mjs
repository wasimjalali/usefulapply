import assert from 'node:assert/strict';
import test from 'node:test';
import {
  guardUnsupportedCvAdditionOffer,
  UNSUPPORTED_CV_ADDITION_REPLY,
} from './chat-reply-guard.ts';

test('replaces an offer to add unsupported CV claims before rewriting', () => {
  const reply = 'Want me to first add that certification (and the team size) to your CV, then rewrite the bullets?';
  assert.equal(guardUnsupportedCvAdditionOffer(reply), UNSUPPORTED_CV_ADDITION_REPLY);
});

test('replaces implicit addition offers that target a CV rewrite', () => {
  const question = 'Want me to first add that certification and the team size, then rewrite the bullets?';
  const statement = 'I can add the certification first, then rewrite the bullets.';
  assert.equal(guardUnsupportedCvAdditionOffer(question), UNSUPPORTED_CV_ADDITION_REPLY);
  assert.equal(guardUnsupportedCvAdditionOffer(statement), UNSUPPORTED_CV_ADDITION_REPLY);
});

test('does not replace a direct refusal or an ordinary rewrite offer', () => {
  const refusal = 'I cannot add that certification to your CV because your documents do not support it.';
  const rewrite = 'Want me to rewrite the bullets using what is already in your CV?';
  assert.equal(guardUnsupportedCvAdditionOffer(refusal), refusal);
  assert.equal(guardUnsupportedCvAdditionOffer(rewrite), rewrite);
});

test('leaves a refusal followed by a valid rewrite offer alone', () => {
  const reply = 'I cannot add that certification, but I can rewrite the bullets using your documented experience.';
  assert.equal(guardUnsupportedCvAdditionOffer(reply), reply);
});

test('does not block addition offers for another document surface', () => {
  const reply = 'Want me to include that paragraph in your cover letter?';
  assert.equal(guardUnsupportedCvAdditionOffer(reply), reply);
});
