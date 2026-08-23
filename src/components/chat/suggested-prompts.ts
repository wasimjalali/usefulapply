/**
 * The chips the chat empty state offers (up to four). They teach what the assistant
 * can do, so they have to match the state the user is actually in: a new user
 * with no applications should never be asked which follow-ups are due.
 *
 * Clicking a chip sends the text straight to the chat, never through job-ad
 * detection, so the copy here is always read as a question.
 */

import { defaultFollowUpDue, parseDate } from '@/components/tracker/tracker-status';
import { dayKey } from '@/lib/utils/format-date';
import type { TrackerApplicationRow } from '@/db/repos/sessions';

export interface SuggestedPromptState {
  hasCV: boolean;
  applicationCount: number;
  trackerRows: TrackerApplicationRow[];
  /** New roles in a feed run the user has not opened yet. */
  newFeedCount: number;
}

const PROMPTS = {
  intro: 'What can Useful Apply do for me?',
  analyze: 'Analyze a job description for me',
  runFeed: 'Run my job feed for today',
  today: 'What should I do today?',
  followUps: 'Which follow-ups are due?',
  interviews: 'What interviews do I have this week?',
} as const;

/** Same rule as the tracker and the chat tools: due today is due, not overdue. */
function hasFollowUpDue(rows: TrackerApplicationRow[], timeZone: string): boolean {
  const todayKey = dayKey(new Date(), timeZone);
  return rows.some((row) => {
    if (row.status !== 'applied' && row.status !== 'follow_up') return false;
    const due = parseDate(row.follow_up_due_at)
      ?? (row.status === 'applied' ? defaultFollowUpDue(row.created_at) : null);
    return Boolean(due && dayKey(due, timeZone) <= todayKey);
  });
}

function hasUpcomingInterview(rows: TrackerApplicationRow[], timeZone: string): boolean {
  const todayKey = dayKey(new Date(), timeZone);
  return rows.some((row) => {
    const at = parseDate(row.interview_at);
    return Boolean(at && dayKey(at, timeZone) >= todayKey);
  });
}

export function buildSuggestedPrompts(
  state: SuggestedPromptState,
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): string[] {
  // First-time set: an introduction, the paste-a-job path and the feed.
  if (!state.hasCV || state.applicationCount === 0) {
    return [PROMPTS.intro, PROMPTS.analyze, PROMPTS.runFeed, PROMPTS.today];
  }

  // Active users: the introduction stays first, urgent chips next, then the
  // everyday actions.
  const picks: string[] = [PROMPTS.intro];
  if (hasFollowUpDue(state.trackerRows, timeZone)) picks.push(PROMPTS.followUps);
  if (hasUpcomingInterview(state.trackerRows, timeZone)) picks.push(PROMPTS.interviews);
  picks.push(PROMPTS.analyze, PROMPTS.runFeed, PROMPTS.today);
  return picks.slice(0, 4);
}
