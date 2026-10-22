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
 * One guard per streamed call. Call `dispose()` in a `finally`.
 */
import { APIError, APIUserAbortError, type Middleware } from '@anthropic-ai/sdk';
import { StreamIdleTimeoutError, StreamTransportError } from './providers';

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
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

  constructor(
    private readonly idleMs: number,
    callerSignal?: AbortSignal,
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

  /** Arm the idle timer. The middleware does it when the response headers arrive; exposed for tests. */
  start(): void {
    this.armed = true;
    this.rearm();
  }

  /** Reset the idle timer: some data arrived. */
  touch(): void {
    if (this.armed) this.rearm();
  }

  dispose(): void {
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
      return await read();
    } catch (error) {
      throw this.convert(error, usageSoFar);
    }
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
    } catch (error) {
      throw this.convert(error, usageSoFar);
    }
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

export function createStreamGuard(idleMs: number, callerSignal?: AbortSignal): StreamGuard {
  return new StreamGuard(idleMs, callerSignal);
}
