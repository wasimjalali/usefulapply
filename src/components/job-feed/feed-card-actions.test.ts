import assert from 'node:assert/strict';
import test from 'node:test';
import { getJobFeedCardActions } from './feed-card-actions';

const baseFeedback = {
  applyStartedAt: null,
  appliedAt: null,
  generationStatus: 'none' as const,
};

test('shows generate after check fit creates a pending fit analysis', () => {
  const actions = getJobFeedCardActions({
    feedback: {
      ...baseFeedback,
      applyStartedAt: '2026-06-22T10:00:00.000Z',
      generationStatus: 'pending',
    },
    session: {
      generatedCV: false,
      generationStatus: 'pending',
      hasFreshPendingFitAnalysis: true,
      screeningUsageCount: 0,
    },
    isFreeUser: false,
    fitLabel: 'good',
  });

  assert.equal(actions.badge, 'Fit checked');
  assert.deepEqual(actions.primary, {
    kind: 'generate-after-fit',
    label: 'Generate Kit',
    variant: 'gold',
  });
  assert.deepEqual(actions.secondary, {
    kind: 'new-search',
    label: 'New Search',
    variant: 'outline',
  });
});

test('shows screening prompt after a kit has been generated', () => {
  const actions = getJobFeedCardActions({
    feedback: {
      ...baseFeedback,
      appliedAt: '2026-06-22T10:05:00.000Z',
      generationStatus: 'succeeded',
    },
    session: {
      generatedCV: true,
      generationStatus: 'succeeded',
      hasFreshPendingFitAnalysis: false,
      screeningUsageCount: 0,
    },
    isFreeUser: false,
    fitLabel: 'strong',
  });

  assert.equal(actions.badge, 'Application ready');
  assert.deepEqual(actions.primary, {
    kind: 'screening',
    label: 'Answer Screening Questions',
    variant: 'gold',
  });
  assert.deepEqual(actions.secondary, {
    kind: 'skip-screening',
    label: 'Skip For Now',
    variant: 'outline',
  });
});

test('keeps the default generate and check fit actions before handoff starts', () => {
  const actions = getJobFeedCardActions({
    feedback: baseFeedback,
    session: null,
    isFreeUser: false,
    fitLabel: 'good',
  });

  assert.equal(actions.badge, null);
  assert.deepEqual(actions.primary, {
    kind: 'generate',
    label: 'Generate Kit',
    variant: 'gold',
  });
  assert.deepEqual(actions.secondary, {
    kind: 'check-fit',
    label: 'Check Fit',
    variant: 'outline',
  });
});
