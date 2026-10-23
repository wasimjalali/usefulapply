/**
 * Reads a streamed /api/chat reply (src/app/api/chat/reply-stream.ts has the events). Returns true once a `done` or
 * `error` event was handled, false when the stream ended without one (cut on the way).
 *
 * The server sends a ping every 10 s and ends a model stream that sat idle for 60 s with its own error event. So when
 * no byte at all arrives for CLIENT_IDLE_MS, the connection itself is gone, and `onIdle` runs (the caller aborts).
 */
export const CHAT_STREAM_CLIENT_IDLE_MS = 75_000;

type ChatStreamEventBody = Record<string, unknown>;

export interface ChatStreamHandlers {
  onTurn: (event: ChatStreamEventBody) => void;
  onDelta: (text: string) => void;
  onStatus: (text: string) => void;
  onDone: (event: ChatStreamEventBody) => void;
  onError: (event: ChatStreamEventBody) => void;
  onIdle: () => void;
}

export async function readChatStream(response: Response, handlers: ChatStreamHandlers): Promise<boolean> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('The chat reply has no body to read');
  const decoder = new TextDecoder();
  let buffer = '';
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(handlers.onIdle, CHAT_STREAM_CLIENT_IDLE_MS);
  };

  arm();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return false;
      arm();
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';
      for (const frame of frames) {
        if (!frame.startsWith('data: ')) continue;
        // A frame that is not JSON is a server bug: it throws to the caller's failure path, never skipped quietly.
        const event = JSON.parse(frame.slice(6)) as ChatStreamEventBody;
        switch (event.type) {
          case 'delta':
            if (typeof event.text === 'string') handlers.onDelta(event.text);
            break;
          case 'status':
            if (typeof event.text === 'string') handlers.onStatus(event.text);
            break;
          case 'turn':
            handlers.onTurn(event);
            break;
          case 'done':
            handlers.onDone(event);
            return true;
          case 'error':
            handlers.onError(event);
            return true;
          default:
            // ping, and any event a newer server adds.
            break;
        }
      }
    }
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}
