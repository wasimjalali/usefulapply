import assert from 'node:assert/strict';
import test from 'node:test';

import { InputBudgetError } from '@/lib/models/haiku';
import { BUDGET_REPLY, settleChatReply, type ChatLoopState } from './loop-reply';
import type { ChatActionChip, ExecutedEffect } from './types';

// What the user sees when the chat's tool loop ends: the model's reply, or a fixed line when the loop
// stopped early or a tool result could not be used. Chips never outlive a reply that says the turn broke.

const ROW_MOVED: ExecutedEffect = { type: 'tracker_updated', sessionId: '11111111-1111-4111-8111-111111111111', status: 'interview' };
const DELETE_CHIP: ChatActionChip = { label: 'Delete Bosch', action: 'confirm-delete:22222222-2222-4222-8222-222222222222', icon: 'trash' };

function state(overrides: Partial<ChatLoopState> = {}): ChatLoopState {
  return {
    reply: '',
    executed: [],
    confirmActions: [],
    failedToolNames: [],
    oversizedToolNames: [],
    lastToolNames: '',
    ...overrides,
  };
}

test('budget stop after a write: the write is reported and no stale confirm chip is shown', () => {
  const out = settleChatReply(state({ executed: [ROW_MOVED], confirmActions: [DELETE_CHIP], lastToolNames: 'set_application_status' }), { error: new InputBudgetError('chat', 120_000) });
  assert.equal(out.reply, "That change saved, but I couldn't finish the reply. Check the tracker for the updated row.");
  assert.deepEqual(out.confirmActions, []);
});

test('any other loop failure after a write: same, the chips go with the broken reply', () => {
  const out = settleChatReply(state({ executed: [ROW_MOVED], confirmActions: [DELETE_CHIP], lastToolNames: 'delete_application' }), { error: new Error('max_tokens') });
  assert.equal(out.reply, "That change saved, but I couldn't finish the reply. Check the tracker for the updated row.");
  assert.deepEqual(out.confirmActions, []);
});

test('budget stop before any write: the budget reply and no chips', () => {
  const out = settleChatReply(state({ confirmActions: [DELETE_CHIP], lastToolNames: 'get_applications' }), { error: new InputBudgetError('chat', 120_000) });
  assert.equal(out.reply, BUDGET_REPLY);
  assert.deepEqual(out.confirmActions, []);
});

test('the first model call failing is an outage: the error goes back to the route', () => {
  const outage = new Error('overloaded');
  assert.throws(() => settleChatReply(state(), { error: outage }), (error) => error === outage);
});

test('a failure after a tool round with nothing executed: the fixed line, no chips', () => {
  const out = settleChatReply(state({ confirmActions: [DELETE_CHIP], lastToolNames: 'propose_cv_rewrite' }), { error: new Error('refusal') });
  assert.equal(out.reply, "I couldn't prepare that CV rewrite. Try again in a moment.");
  assert.deepEqual(out.confirmActions, []);
});

test('an oversized tool result: the user is told to ask about one thing at a time, effects kept', () => {
  const out = settleChatReply(state({ reply: 'Here are all 300 of your applications.', oversizedToolNames: ['get_applications'] }), null);
  assert.equal(out.reply, BUDGET_REPLY);
  assert.match(BUDGET_REPLY, /Ask about one thing at a time\./);

  // Nothing ran and the reply is the fixed budget line: a chip the model proposed beside it goes too.
  const withChip = settleChatReply(state({ reply: 'Use the button to delete Bosch.', oversizedToolNames: ['get_applications'], confirmActions: [DELETE_CHIP] }), null);
  assert.equal(withChip.reply, BUDGET_REPLY);
  assert.deepEqual(withChip.confirmActions, []);

  // With a write in the same turn the model's reply stands: it saw the write succeed and the too-large error.
  const withWrite = settleChatReply(state({ reply: 'Moved Zapier to interview. Ask about the rest one at a time.', executed: [ROW_MOVED], oversizedToolNames: ['get_applications'] }), null);
  assert.equal(withWrite.reply, 'Moved Zapier to interview. Ask about the rest one at a time.');
  // The model's reply stands there, and so do its chips.
  assert.deepEqual(settleChatReply(state({ reply: 'Moved Zapier.', executed: [ROW_MOVED], oversizedToolNames: ['get_applications'], confirmActions: [DELETE_CHIP] }), null).confirmActions, [DELETE_CHIP]);
});

test('a handler that threw wins over everything: the deterministic failure line, chips kept for the handlers that ran', () => {
  const out = settleChatReply(state({ reply: 'Done!', failedToolNames: ['set_application_status'], oversizedToolNames: ['get_applications'], confirmActions: [DELETE_CHIP] }), null);
  assert.equal(out.reply, "I couldn't complete that action. Try again in a moment.");
  assert.deepEqual(out.confirmActions, [DELETE_CHIP]);
});

test('a clean loop returns the model reply and its chips untouched', () => {
  const out = settleChatReply(state({ reply: 'Use the button to confirm the delete.', confirmActions: [DELETE_CHIP] }), null);
  assert.equal(out.reply, 'Use the button to confirm the delete.');
  assert.deepEqual(out.confirmActions, [DELETE_CHIP]);
});
