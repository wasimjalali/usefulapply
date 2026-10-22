import { NextRequest, NextResponse } from 'next/server';
import { callHaiku } from '@/lib/models/haiku';
import {
  TRACKER_ANSWER_SCHEMA,
  TRACKER_STATUSES,
  TRACKER_SYSTEM_PROMPT,
  buildTrackerMessages,
  trackerOutcome,
  type TrackerIntent,
  type TrackerModelAnswer,
  type TrackerStatus,
} from '@/lib/agents/prompts/tracker-prompt';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getCurrentUser } from '@/auth/server';
import { listTrackerOverview } from '@/db/repos/sessions';
import { flattenUntrusted as flatten, knownTimeZone } from '@/lib/agents/chat-tools/untrusted';

const MAX_MESSAGE_LENGTH = 500;

/**
 * The model sees at most this many applications, newest first (`listTrackerOverview` orders by
 * created_at desc), so the prompt stays far below the 100k input budget however long a job hunt runs.
 */
const MAX_PROMPT_APPLICATIONS = 200;

const STATUSES = TRACKER_STATUSES;
type Status = TrackerStatus;

type Intent = TrackerIntent;

type ModelAnswer = TrackerModelAnswer;

function parseAnswer(raw: string): ModelAnswer | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<ModelAnswer>;
    if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) return null;
    return {
      intent: (parsed.intent ?? 'answer') as Intent,
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : null,
      status: STATUSES.includes(parsed.status as Status) ? (parsed.status as Status) : null,
      dateTime: typeof parsed.dateTime === 'string' ? parsed.dateTime : null,
      reply: parsed.reply.trim(),
    };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Please sign in.' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`tracker-chat:${user.id}`, RATE_LIMITS['chat']);
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: 'Too many messages. Wait a moment.' }, { status: 429 });
    }

    const body = (await req.json()) as { message?: unknown; timeZone?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const timeZone = knownTimeZone(body.timeZone) ? (body.timeZone as string) : 'UTC';
    if (!message) {
      return NextResponse.json({ error: 'Say something first.' }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return NextResponse.json({ error: 'That message is too long.' }, { status: 400 });
    }

    // The applications come from the database, never from the request, so the
    // model can only ever name a row this user owns.
    const rows = (await listTrackerOverview(user.id)).slice(0, MAX_PROMPT_APPLICATIONS);
    if (rows.length === 0) {
      return NextResponse.json({
        reply: 'Nothing to track yet. Your applications land here once a kit is ready.',
        action: { type: 'none' },
      });
    }

    // Company and role are copied from job ads, so they are attacker-authored
    // text. Flatten and cap them: a newline here would let a posting pose as
    // another APPLICATIONS row or as an instruction.
    const applications = rows
      .map((row) =>
        [
          `id=${row.id}`,
          `company=<<${flatten(row.company)}>>`,
          `role=<<${flatten(row.job_title)}>>`,
          `status=${row.status}`,
          row.interview_at ? `interview=${row.interview_at}` : null,
          row.follow_up_due_at ? `follow_up_due=${row.follow_up_due_at}` : null,
        ]
          .filter(Boolean)
          .join(' '),
      )
      .join('\n');

    const now = new Date();
    const response = await callHaiku({
      site: 'tracker',
      system: { static: TRACKER_SYSTEM_PROMPT },
      messages: buildTrackerMessages({
        applications,
        today: `${now.toLocaleString('en-GB', { timeZone, dateStyle: 'full', timeStyle: 'short' })} (times are ${timeZone})`,
        message,
      }),
      jsonSchema: TRACKER_ANSWER_SCHEMA,
      maxTokens: 4000,
      generationContext: {
        requestExecutionId: crypto.randomUUID(),
        userId: user.id,
        route: '/api/tracker/chat',
        feature: 'tracker',
        operation: 'tracker_chat',
      },
    });

    const answer = parseAnswer(response.content);
    if (!answer) {
      return NextResponse.json({
        reply: 'I did not follow that. Try naming the company and what changed.',
        action: { type: 'none' },
      });
    }

    return NextResponse.json(trackerOutcome(answer, rows, message, timeZone));
  } catch (error) {
    console.error('[Tracker chat] failed:', error);
    return NextResponse.json({ error: 'That did not go through. Try again.' }, { status: 500 });
  }
}
