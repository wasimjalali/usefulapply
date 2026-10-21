import assert from 'node:assert/strict';
import test from 'node:test';

import { getStartOfNextLocalDay } from './helpers';
import { nextRunAfter } from '../services/feed/run';
import type { JobFeedRun } from '@/lib/supabase/types';

// The live calls of 2026-10-21: one queued run polled every ~17 seconds returned a different
// "next run" each time (22:00:54.149Z, 22:00:11.928Z, ...), the seconds of each call carried over.
test('next local midnight is the same instant whenever in the day it is asked', () => {
  for (const at of ['2026-10-21T15:03:54.149Z', '2026-10-21T15:04:12.372Z', '2026-10-21T21:59:59.999Z']) {
    assert.equal(getStartOfNextLocalDay(new Date(at), 'Europe/Berlin').toISOString(), '2026-10-21T22:00:00.000Z', at);
  }
});

test('next local midnight across the DST change and in zones off the hour', () => {
  // Berlin leaves summer time at 03:00 on 25 October, so that midnight is 23:00Z.
  assert.equal(getStartOfNextLocalDay(new Date('2026-10-25T10:17:41.5Z'), 'Europe/Berlin').toISOString(), '2026-10-25T23:00:00.000Z');
  assert.equal(getStartOfNextLocalDay(new Date('2026-10-21T15:03:54.149Z'), 'Asia/Kolkata').toISOString(), '2026-10-21T18:30:00.000Z');
  assert.equal(getStartOfNextLocalDay(new Date('2026-10-21T15:03:54.149Z'), 'Asia/Kathmandu').toISOString(), '2026-10-21T18:15:00.000Z');
});

function run(overrides: Partial<JobFeedRun>): JobFeedRun {
  return {
    local_date: '2026-10-21',
    local_timezone: 'Europe/Berlin',
    status: 'running',
    started_at: '2026-10-21T15:04:03.275Z',
    created_at: '2026-10-21T15:03:54.149Z',
    completed_at: null,
    ...overrides,
  } as JobFeedRun;
}

// The same session: while the run was in flight it said "midnight", once it completed it said
// 11:04Z the next day (the 20-hour floor). The gate only ever allowed the second.
test('a run in flight reports the same next run as its completed row will', () => {
  const now = new Date('2026-10-21T15:05:03.393Z');
  const inFlight = nextRunAfter(run({}), 'Europe/Berlin', now);
  const completed = nextRunAfter(run({ status: 'completed', completed_at: '2026-10-21T15:06:20.000Z' }), 'Europe/Berlin', new Date('2026-10-21T15:06:28.383Z'));
  assert.equal(inFlight, '2026-10-22T11:04:03.275Z');
  assert.equal(completed, inFlight);
  assert.equal(nextRunAfter(run({}), 'Europe/Berlin', new Date('2026-10-21T15:06:12.923Z')), inFlight, 'stable across polls');
});

test('a queued run with no start time counts from when it was created', () => {
  assert.equal(nextRunAfter(run({ status: 'queued', started_at: null }), 'Europe/Berlin', new Date('2026-10-21T15:03:55Z')), '2026-10-22T11:03:54.149Z');
});
