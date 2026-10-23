/**
 * How /api/chat streams a reply (a request with `Accept: text/event-stream`). Server-sent events, one JSON object per
 * `data:` line:
 *
 *   { type: 'turn', storedUserMessage }   first, when the route stored the user's message under its own id
 *   { type: 'delta', text }     more of the reply, appended to what the client shows
 *   { type: 'status', text }    a tool round is running (shown until the next delta)
 *   { type: 'ping' }            every 10 s, so the client's own idle limit only trips when the connection is gone
 *   { type: 'done', ... }       the JSON body a non-streamed request gets: `reply` is the whole reply and replaces
 *                               whatever the deltas showed (a guard or a failed tool can still change it at the end)
 *   { type: 'error', status, code?, error, ... }   the turn failed; nothing was stored as its reply
 *
 * The deltas pass the same checks the finished reply passes: text goes out a sentence at a time, and only when the
 * whole reply so far passes the CV-addition guard (chat-reply-guard.ts) and comes out of sanitizeDashes with what was
 * already sent as its prefix. A reply the guard would replace stops streaming there and arrives whole in `done`.
 */
import { guardUnsupportedCvAdditionOffer } from '@/lib/agents/chat-reply-guard';
import { sanitizeDashes } from '@/lib/config/typo-corrections';
import type { HaikuTextStream } from '@/lib/models/haiku';

export type ChatStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'ping' }
  | { type: 'turn'; storedUserMessage: { id: string; content: string } }
  | ({ type: 'done' } & Record<string, unknown>)
  | ({ type: 'error'; status: number } & Record<string, unknown>);

const HEARTBEAT_MS = 10_000;

/** The reply as the user reads it: every round's text, in order, a paragraph apart. */
export function joinReplyRounds(rounds: string[]): string {
  return rounds.map((text) => text.trim()).filter(Boolean).join('\n\n');
}

/** Where a sentence ends: the index after the last `.`, `!`, `?` or `…` followed by whitespace, or after a newline. */
function sentenceEnd(text: string): number {
  let end = 0;
  for (const match of text.matchAll(/[.!?…](?=\s)|\n/g)) end = match.index + 1;
  return end;
}

/** The text the client has been shown, and the gate every delta passes on the way there. */
export class ReplyStream {
  private sent = '';
  private rounds: string[] = [];
  private raw = '';
  private deliveredInCall = false;
  private held = false;

  constructor(
    private readonly send: (event: ChatStreamEvent) => void,
    private readonly cvRewriteProposed: () => boolean,
  ) {}

  /** callHaiku's stream option for one model call: text from it goes through the gate. */
  forCall(signal: AbortSignal): HaikuTextStream {
    return {
      // A new attempt: whatever a failed one held back is dropped (failover only happens before anything was sent).
      attempt: () => {
        this.raw = '';
        this.deliveredInCall = false;
      },
      text: (delta) => {
        this.raw += delta;
        const end = sentenceEnd(this.raw);
        if (end > 0) this.offer(this.raw.slice(0, end));
      },
      delivered: () => this.deliveredInCall,
      signal,
    };
  }

  /** True once text of the current model call reached the client: a failure of that call can no longer be retried. */
  get deliveredThisCall(): boolean {
    return this.deliveredInCall;
  }

  /** The reply is known to be replaced by a fixed line (a tool failed, a result was too large): stop streaming it. */
  hold(): void {
    this.held = true;
  }

  /**
   * A model call answered and was accepted: its whole text is final, so it goes out too (a tool round's opening line
   * included). The call is over, so a later failure (a tool, the budget guard) is no longer a cut of streamed text.
   */
  endRound(text: string): void {
    this.offer(text);
    this.rounds.push(text);
    this.raw = '';
    this.deliveredInCall = false;
  }

  status(text: string): void {
    this.send({ type: 'status', text });
  }

  private offer(current: string): void {
    if (this.held) return;
    const full = joinReplyRounds([...this.rounds, current]);
    if (guardUnsupportedCvAdditionOffer(full, { cvRewriteProposed: this.cvRewriteProposed() }) !== full) {
      this.held = true;
      return;
    }
    const shown = sanitizeDashes(full);
    // A dash rewrite that changed text already sent: hold, `done` carries the settled reply.
    if (shown.length <= this.sent.length || !shown.startsWith(this.sent)) return;
    this.send({ type: 'delta', text: shown.slice(this.sent.length) });
    this.sent = shown;
    this.deliveredInCall = true;
  }
}

/**
 * The streamed response. `run` gets the event sink and the signal that fires when the client goes away (the Stop
 * button, a closed tab); it returns the `done` body, or null when the client left and nothing more is sent. A throw
 * becomes the `error` event `fail` builds.
 */
export function chatEventStream(
  run: (send: (event: ChatStreamEvent) => void, signal: AbortSignal) => Promise<Record<string, unknown> | null>,
  fail: (error: unknown) => Promise<{ status: number; body: Record<string, unknown> }>,
  requestSignal: AbortSignal | undefined,
): Response {
  const encoder = new TextEncoder();
  const clientGone = new AbortController();
  requestSignal?.addEventListener('abort', () => clientGone.abort(), { once: true });
  let closed = false;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: ChatStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch (error) {
          // The stream is gone (the client cancelled it): the turn stops where it is.
          console.error('[chat] the reply stream closed under a write:', error instanceof Error ? error.message : error);
          closed = true;
          clientGone.abort();
        }
      };
      const heartbeat = setInterval(() => send({ type: 'ping' }), HEARTBEAT_MS);
      void (async () => {
        try {
          const done = await run(send, clientGone.signal);
          if (done) send({ type: 'done', ...done });
        } catch (error) {
          const { status, body: failure } = await fail(error);
          if (!clientGone.signal.aborted) send({ type: 'error', status, ...failure });
        } finally {
          clearInterval(heartbeat);
          if (!closed) {
            closed = true;
            controller.close();
          }
        }
      })();
    },
    cancel() {
      closed = true;
      clientGone.abort();
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

/** True when the request asked for the streamed reply. Anything else (a tab from before streaming) gets JSON. */
export function wantsEventStream(accept: string | null): boolean {
  return (accept ?? '').split(',').some((part) => part.trim().split(';')[0].toLowerCase() === 'text/event-stream');
}
