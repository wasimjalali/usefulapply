import assert from 'node:assert/strict';
import test from 'node:test';

import { getStartOfNextLocalDay } from './helpers';
import { nextRunAfter } from '../services/feed/cooldown';
import type { JobFeedRun } from '@/lib/supabase/types';

// The live calls of 2026-10-21: one queued run polled every ~17 seconds returned a different
// "next run" each time (22:00:54.149Z, 22:00:11.928Z, ...), the seconds of each call carried over.
test('next local midnight is the same instant whenever in the day it is asked', () => {
  for (const at of ['2026-10-21T15:03:54.149Z', '2026-10-21T15:04:12.372Z', '2026-10-21T21:59:59.999Z']) {
    assert.equal(getStartOfNextLocalDay(new Date(at), 'Europe/Berlin').toISOString(), '2026-10-21T22:00:00.000Z', at);
  }
});

test('next local midnight across the DST change and in zones off the hour', () => {
  // 00:30 summer time on 25 October: that local day has 25 hours, so its midnight is 23:00Z.
  assert.equal(getStartOfNextLocalDay(new Date('2026-10-24T22:30:15.5Z'), 'Europe/Berlin').toISOString(), '2026-10-25T23:00:00.000Z');
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
    updated_at: '2026-10-21T15:04:03.275Z',
    completed_at: null,
    ...overrides,
  } as JobFeedRun;
}
const BERLIN = 'Europe/Berlin';

// The same session: while the run was in flight it said "midnight", once it completed it said
// 11:04Z the next day (the 20-hour floor). The gate only ever allowed the second.
test('a running run reports the same next run as its completed row will, on every poll', () => {
  const inFlight = nextRunAfter(run({}), BERLIN, new Date('2026-10-21T15:05:03.393Z'));
  const completed = nextRunAfter(run({ status: 'completed', completed_at: '2026-10-21T15:06:20.000Z' }), BERLIN, new Date('2026-10-21T15:06:28.383Z'));
  assert.equal(inFlight, '2026-10-22T11:04:03.275Z');
  assert.equal(completed, inFlight);
  assert.equal(nextRunAfter(run({}), BERLIN, new Date('2026-10-21T15:06:12.923Z')), inFlight);
});

test('a queued run counts from when it was queued, not from an earlier attempt', () => {
  // A fresh row.
  assert.equal(nextRunAfter(run({ status: 'queued', started_at: null, updated_at: '2026-10-21T15:03:54.149Z' }), BERLIN, new Date('2026-10-21T15:03:55Z')), '2026-10-22T11:03:54.149Z');
  // A failed attempt from this morning, requeued now: the claim will restart the 20 hours.
  assert.equal(nextRunAfter(run({ status: 'queued', started_at: '2026-10-21T08:00:00.000Z', updated_at: '2026-10-21T15:00:05.000Z' }), BERLIN, new Date('2026-10-21T15:00:10Z')), '2026-10-22T11:00:05.000Z');
  // A completed row forced to rerun after 28 hours keeps yesterday's started_at; it is not "no wait".
  assert.equal(nextRunAfter(run({ status: 'queued', started_at: '2026-10-20T09:00:00.000Z', updated_at: '2026-10-21T15:00:05.000Z' }), BERLIN, new Date('2026-10-21T15:00:10Z')), '2026-10-22T11:00:05.000Z');
});

test('a failed run says no wait: the gate only counts completed runs', () => {
  assert.equal(nextRunAfter(run({ status: 'failed', completed_at: '2026-10-21T15:05:00Z' }), BERLIN, new Date('2026-10-21T15:05:01Z')), null);
});

test('when next local midnight is later than the 20-hour floor, midnight wins', () => {
  // Started at 00:30 local on 22 October: the floor is 20:30 local, the calendar allows the next run at midnight.
  const early = run({ local_date: '2026-10-22', started_at: '2026-10-21T22:30:00.000Z', updated_at: '2026-10-21T22:30:00.000Z' });
  assert.equal(nextRunAfter(early, BERLIN, new Date('2026-10-21T22:31:00Z')), '2026-10-22T22:00:00.000Z');
});

test('a run in another timezone than the settings reports the same in flight and completed', () => {
  const utcRun = run({ local_timezone: 'UTC', started_at: '2026-10-21T21:30:00.000Z', updated_at: '2026-10-21T21:30:00.000Z' });
  const inFlight = nextRunAfter(utcRun, BERLIN, new Date('2026-10-21T21:31:00Z'));
  const completed = nextRunAfter({ ...utcRun, status: 'completed', completed_at: '2026-10-21T21:40:00.000Z' } as JobFeedRun, BERLIN, new Date('2026-10-21T21:41:00Z'));
  assert.equal(completed, inFlight);
});

test('missing or broken timestamps fall back the way the gate does', () => {
  const now = new Date('2026-10-21T15:05:00Z');
  // A running row with no started_at counts from created_at.
  assert.equal(nextRunAfter(run({ started_at: null }), BERLIN, now), '2026-10-22T11:03:54.149Z');
  // A queued row with no updated_at counts from created_at.
  assert.equal(nextRunAfter(run({ status: 'queued', started_at: null, updated_at: null as unknown as string }), BERLIN, now), '2026-10-22T11:03:54.149Z');
  // No local date: nothing to say.
  assert.equal(nextRunAfter(run({ local_date: null as unknown as string }), BERLIN, now), null);
  // An unreadable start time: the calendar day alone, next local midnight.
  assert.equal(nextRunAfter(run({ started_at: 'not a date', created_at: 'not a date' }), BERLIN, now), '2026-10-21T22:00:00.000Z');
});
