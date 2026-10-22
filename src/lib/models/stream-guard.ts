/**
 * What the Anthropic SDK 1.1.0 does not do for a streamed call, done here so a broken stream can fail over.
 *
 * The SDK's per-request `timeout` only covers the fetch until the response headers arrive. After that:
 *  - a connection lost or reset while the body is read surfaces as a plain AnthropicError (cause: TypeError
 *    "terminated") with no status, so providers.ts `isFailoverError` cannot tell it from a bug;
 *  - there is no idle timer, so a stream that stops sending data hangs until the caller gives up;
 *  - ping events are dropped inside the SDK before any consumer sees them, so counting events would call a
 *    long, quiet thinking phase "idle" (the API sends pings for exactly that).
 *
 * A guard is one stream's worth of that: an AbortController whose `signal` goes into the request options, a
 * per-request middleware that taps the response bytes (pings included) to reset an idle timer, and the error
 * conversion. When the timer fires it aborts the request, and the SDK's resulting APIUserAbortError is recognised
 * as ours and becomes a StreamIdleTimeoutError. Any other error from reading the stream that is not an APIError
 * becomes a StreamTransportError (original kept as `cause`). A status error, an SDK connection error, a stream
 * `error` event and an abort the caller asked for are returned unchanged, so providers.ts decides on them as it
 * does everywhere else. Whether an eligible error actually fails over is still the caller's `canFailOver`.
 *
 * It also measures the largest gap between received bytes (`maxGapMs`), from the response headers to the end, so the
 * `$ai_generation` event (`stream_max_gap_ms`) shows how close real thinking phases come to the idle limit. A failure
 * counts the gap still open when it happened (an idle timeout reports about the limit itself); the converted error
 * carries the number (`streamMaxGapOf`).
 *
 * One guard per streamed call. Call `dispose()` in a `finally`.
 */
import { APIError, APIUserAbortError, type Middleware } from '@anthropic-ai/sdk';
import { StreamIdleTimeoutError, StreamTransportError } from './providers';

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

/** The gap a converted stream error carries, or null (not a stream error, or the headers never arrived). */
export function streamMaxGapOf(error: unknown): number | null {
  const gap = typeof error === 'object' && error !== null ? (error as { streamMaxGapMs?: unknown }).streamMaxGapMs : undefined;
  return typeof gap === 'number' && Number.isFinite(gap) ? gap : null;
}

/**
 * The usage a stream reported before it broke. message_start carries the input and cache counts in full, but its
 * output_tokens is the output so far (about 1); the real count only arrives in message_delta, just before
 * message_stop. Without message_delta the record is marked `output_tokens_partial: true`: the input and cache fields
 * stand, the output count is a floor, and no estimate is invented for it.
 */
export function partialStreamUsage(usage: unknown, sawMessageDelta: boolean): Record<string, unknown> | undefined {
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) return undefined;
  return sawMessageDelta ? { ...usage } : { ...usage, output_tokens_partial: true };
}

/** True when a usage record says its output count is partial (see partialStreamUsage). */
export function outputTokensPartial(usage: unknown): boolean {
  return typeof usage === 'object' && usage !== null && (usage as { output_tokens_partial?: unknown }).output_tokens_partial === true;
}

/** What the guard reads of an SDK message stream (MessageStream and BetaMessageStream both fit). */
export interface FinalMessageStream<M> {
  finalMessage(): Promise<M>;
  readonly currentMessage: { usage: unknown } | undefined;
  on(event: 'streamEvent', listener: (event: { type: string }) => void): unknown;
}

export interface StreamGuardRequestOptions {
  signal: AbortSignal;
  middleware: Middleware[];
}

export class StreamGuard {
  private readonly controller = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private armed = false;
  private idleTimedOut = false;
  private sawStop = false;
  private removeCallerListener: (() => void) | null = null;
  /** When the last bytes arrived; null before the headers and after the gap was closed. */
  private lastByteAtMs: number | null = null;
  private measured = false;
  private largestGapMs = 0;

  constructor(
    private readonly idleMs: number,
    callerSignal?: AbortSignal,
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isFinite(idleMs) || idleMs <= 0) throw new Error(`createStreamGuard: invalid idle timeout ${idleMs}`);
    if (callerSignal) {
      if (callerSignal.aborted) this.controller.abort();
      else {
        const onAbort = () => this.controller.abort();
        callerSignal.addEventListener('abort', onAbort, { once: true });
        this.removeCallerListener = () => callerSignal.removeEventListener('abort', onAbort);
      }
    }
  }

  /** The signal for the request options. Aborted by our idle timer or by the caller's signal. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  /** Spread into the SDK request options of the streamed call. */
  get requestOptions(): StreamGuardRequestOptions {
    return { signal: this.controller.signal, middleware: [this.tap] };
  }

  /**
   * The largest gap between received bytes so far, in ms, counted from the response headers. Null when the headers
   * never arrived (nothing streamed).
   */
  get maxGapMs(): number | null {
    return this.measured ? this.largestGapMs : null;
  }

  /** Arm the idle timer. The middleware does it when the response headers arrive; exposed for tests. */
  start(): void {
    this.armed = true;
    this.measured = true;
    this.lastByteAtMs = this.now();
    this.rearm();
  }

  /** Reset the idle timer: some data arrived. */
  touch(): void {
    this.noteBytes();
    if (this.armed) this.rearm();
  }

  dispose(): void {
    this.closeGap();
    this.armed = false;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.removeCallerListener?.();
    this.removeCallerListener = null;
  }

  /**
   * Await a read of the stream (`finalMessage()`), converting its errors. `usageSoFar` reads the usage the stream
   * had reported, so a failed row can keep it.
   */
  async run<T>(read: () => Promise<T>, usageSoFar?: () => unknown): Promise<T> {
    try {
      const result = await read();
      this.closeGap();
      return result;
    } catch (error) {
      throw this.convert(error, usageSoFar);
    }
  }

  /**
   * `run` for an SDK message stream's final message: a failed read keeps the usage the stream reported, marked
   * partial unless message_delta (the real output count) arrived.
   */
  async finalMessage<M>(stream: FinalMessageStream<M>): Promise<M> {
    let sawMessageDelta = false;
    stream.on('streamEvent', (event) => {
      if (event.type === 'message_delta') sawMessageDelta = true;
    });
    return this.run(() => stream.finalMessage(), () => partialStreamUsage(stream.currentMessage?.usage, sawMessageDelta));
  }

  /**
   * Iterate the stream's events with the same conversion. Only errors from reading the stream are converted: an
   * error the consumer throws inside its own loop body never passes through here. A stream that ends without a
   * `message_stop` event is cut, not complete (a clean EOF after some text would otherwise return partial text).
   */
  async *events<E extends { type: string }>(stream: AsyncIterable<E>, usageSoFar?: () => unknown): AsyncGenerator<E, void, undefined> {
    try {
      for await (const event of stream) {
        if (event.type === 'message_stop') this.sawStop = true;
        yield event;
      }
      if (!this.sawStop) {
        // An abort ends the SDK's iteration quietly; report it as the abort it was.
        if (this.controller.signal.aborted) throw new APIUserAbortError();
        throw new StreamTransportError('The stream ended before message_stop', { partialUsage: usageSoFar?.() });
      }
      this.closeGap();
    } catch (error) {
      throw this.convert(error, usageSoFar);
    }
  }

  private noteBytes(): void {
    if (this.lastByteAtMs === null) return;
    const at = this.now();
    this.largestGapMs = Math.max(this.largestGapMs, at - this.lastByteAtMs);
    this.lastByteAtMs = at;
  }

  /** Count the gap still open (a failure, or the end of the read) and stop measuring. Idempotent. */
  private closeGap(): void {
    this.noteBytes();
    this.lastByteAtMs = null;
  }

  private rearm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.idleTimedOut = true;
      this.controller.abort();
    }, this.idleMs);
  }

  /** Taps the response body: every chunk, pings included, resets the idle timer. Error responses are left alone. */
  private readonly tap: Middleware = async (request, next) => {
    const response = await next(request);
    if (!response.ok || !response.body) return response;
    this.start();
    const touch = () => this.touch();
    const body = response.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        touch();
        controller.enqueue(chunk);
      },
    }));
    return new Response(body, response);
  };

  private convert(error: unknown, usageSoFar?: () => unknown): unknown {
    this.closeGap();
    return this.withGap(this.convertError(error, usageSoFar));
  }

  /** The converted error carries the gap, for the failed attempt's event. A frozen error is returned as it is. */
  private withGap(error: unknown): unknown {
    const gap = this.maxGapMs;
    if (gap !== null && typeof error === 'object' && error !== null && Object.isExtensible(error)) {
      Object.defineProperty(error, 'streamMaxGapMs', { value: gap, enumerable: false, configurable: true });
    }
    return error;
  }

  private convertError(error: unknown, usageSoFar?: () => unknown): unknown {
    const partialUsage = usageSoFar?.();
    if (this.idleTimedOut) return new StreamIdleTimeoutError(this.idleMs, { cause: error, partialUsage });
    if (error instanceof StreamTransportError) return error;
    // An abort the caller asked for stays a plain abort: not a route failure.
    if (error instanceof APIUserAbortError || isAbortError(error)) return error;
    if (error instanceof APIError) {
      // A stream `error` event (no status) arrived mid-stream: keep its usage with it for the failed row.
      if (error.status === undefined && partialUsage !== undefined && partialUsage !== null && Object.isExtensible(error)) {
        Object.defineProperty(error, 'partialUsage', { value: partialUsage, enumerable: false, configurable: true });
      }
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new StreamTransportError(`The stream broke: ${message}`, { cause: error, partialUsage });
  }
}

/** `now` is the clock the byte gap is measured on; tests pass their own. */
export function createStreamGuard(idleMs: number, callerSignal?: AbortSignal, now?: () => number): StreamGuard {
  return new StreamGuard(idleMs, callerSignal, now);
}
