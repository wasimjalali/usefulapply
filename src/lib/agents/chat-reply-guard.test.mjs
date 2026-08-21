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

test('replaces a promised inclusion and names the unsupported items', () => {
  const reply = 'The punchier version with your AWS Solutions Architect certification and the 25-person team will appear once it is ready.';
  assert.equal(
    guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed: true }),
    "I can't add your AWS Solutions Architect certification and the 25-person team from this request. CV rewrites only use details supported by your documents.",
  );
});

test('only treats promised inclusion as a CV claim when a CV rewrite was proposed', () => {
  const reply = 'The rewrite including the unsupported certification will be ready shortly.';
  assert.equal(
    guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed: true }),
    "I can't add the unsupported certification from this request. CV rewrites only use details supported by your documents.",
  );
  assert.equal(guardUnsupportedCvAdditionOffer(reply), reply);
});

test('replaces a direct promise to include unsupported CV claims', () => {
  const reply = 'The rewrite will include your AWS certification and the 25-person team once it is ready.';
  assert.equal(
    guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed: true }),
    "I can't add your AWS certification and the 25-person team from this request. CV rewrites only use details supported by your documents.",
  );
});

test('replaces a direct promise with plural claim nouns', () => {
  const reply = 'The rewrite will include Scrum certifications once it is ready.';
  assert.equal(
    guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed: true }),
    "I can't add Scrum certifications from this request. CV rewrites only use details supported by your documents.",
  );
});

test('does not treat an ordinary rewrite description as an unsupported claim', () => {
  const replies = [
    'The rewrite with tighter wording will be ready after you confirm.',
    'The rewrite with your requested tighter wording will be ready after you confirm.',
    'The rewrite will include ATS-friendly wording once it is ready.',
    'The rewrite with a Professional tone will be ready after you confirm.',
    'The rewrite will include 3 tighter bullets once it is ready.',
    'The rewrite will include clearer team-focused wording once it is ready.',
  ];
  for (const reply of replies) {
    assert.equal(guardUnsupportedCvAdditionOffer(reply, { cvRewriteProposed: true }), reply);
  }
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
