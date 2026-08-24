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

export const PROMPTS = {
  intro: 'What can Useful Apply do for me?',
  analyze: 'Analyze a job description for me',
  runFeed: 'Search new jobs for today',
  kit: 'Generate a full kit for a job description',
  followUps: 'Which follow-ups are due?',
  interviews: 'What interviews do I have this week?',
} as const;

/**
 * Chips with a fixed, instant answer skip the model: the reply is part of the
 * product, so it should never vary or cost tokens. Rendered as markdown.
 */
export const CANNED_RESPONSES: Record<string, string> = {
  [PROMPTS.intro]: [
    "Here's what I can do for you:",
    '',
    '- **Check your fit** for any job ad before you spend credits, with a match score, strengths and gaps',
    '- **Generate a full application kit**: tailored CV, cover letter, application email and follow-up',
    '- **Rewrite your CV or letters** on request, grounded only in your real experience',
    '- **Answer screening questions** from your CV',
    '- **Find new roles daily** on your Job Board, matched to your profile',
    '- **Track every application** and draft follow-ups when they come due',
    '',
    'Paste a job ad here to start, or ask me anything.',
  ].join('\n'),
  [PROMPTS.kit]: "Paste the job description here, the whole ad works best. I'll create your tailored CV, cover letter and both emails from it.",
};

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
  // First-time set: an introduction, the paste-a-job paths and the board.
  if (!state.hasCV || state.applicationCount === 0) {
    return [PROMPTS.intro, PROMPTS.analyze, PROMPTS.runFeed, PROMPTS.kit];
  }

  // Active users: the introduction stays first, urgent chips next, then the
  // everyday actions.
  const picks: string[] = [PROMPTS.intro];
  if (hasFollowUpDue(state.trackerRows, timeZone)) picks.push(PROMPTS.followUps);
  if (hasUpcomingInterview(state.trackerRows, timeZone)) picks.push(PROMPTS.interviews);
  picks.push(PROMPTS.analyze, PROMPTS.runFeed, PROMPTS.kit);
  return picks.slice(0, 4);
}
