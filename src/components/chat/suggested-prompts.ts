/**
 * The three chips the chat empty state offers. They teach what the assistant
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
  howItWorks: 'How does Useful Apply work?',
  today: 'What should I do today?',
  feed: "Anything strong in today's feed?",
  showFeed: "Show me today's job feed",
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
  if (!state.hasCV) {
    return [PROMPTS.howItWorks, PROMPTS.showFeed];
  }
  if (state.applicationCount === 0) {
    return [PROMPTS.howItWorks, PROMPTS.today, PROMPTS.feed];
  }

  // Rungs 3 to 5 in order, then rung 6 as the default. An active user always
  // gets the briefing chip; it just yields to anything more urgent.
  const picks: string[] = [];
  if (hasFollowUpDue(state.trackerRows, timeZone)) picks.push(PROMPTS.followUps);
  if (hasUpcomingInterview(state.trackerRows, timeZone)) picks.push(PROMPTS.interviews);
  if (state.newFeedCount > 0) picks.push(PROMPTS.feed);
  picks.push(PROMPTS.today);
  return picks.slice(0, 3);
}
