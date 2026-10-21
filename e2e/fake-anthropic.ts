/**
 * A stand-in for api.anthropic.com for the e2e run. The preview Worker is
 * pointed at it with `--var ANTHROPIC_BASE_URL:http://127.0.0.1:18793`, so the
 * real SDK, the real agents and the real validators run and only the model's
 * answers are scripted (see lib/model-script.ts).
 *
 * Run: npx tsx e2e/fake-anthropic.ts [port]
 *
 * Failure injection for a test: POST /__control {"failWriter":"cv"|null,"delayMs":0}
 * makes that writer answer 500 until reset. GET /__calls returns the call log.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { answerFor, messageFor, writerFor, type Writer } from './lib/model-script';

const port = Number(process.argv[2] ?? process.env.FAKE_ANTHROPIC_PORT ?? 18793);

const calls: Array<{ writer: string; at: string; stream: boolean; user: string }> = [];
let failWriters = new Set<string>();
let delayMs = 0;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk as Buffer));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sse(response: ServerResponse, text: string): void {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const send = (event: string, data: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  send('message_start', {
    type: 'message_start',
    message: { id: 'msg_stub', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 1 } },
  });
  send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
  send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });
  send('content_block_stop', { type: 'content_block_stop', index: 0 });
  send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } });
  send('message_stop', { type: 'message_stop' });
  response.end();
}

createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/__control' && request.method === 'POST') {
      const body = JSON.parse((await readBody(request)) || '{}') as { failWriter?: string | string[] | null; delayMs?: number };
      failWriters = new Set(Array.isArray(body.failWriter) ? body.failWriter : body.failWriter ? [body.failWriter] : []);
      delayMs = body.delayMs ?? 0;
      return json(response, 200, { ok: true, failWriters: [...failWriters], delayMs });
    }
    if (url.pathname === '/__calls') return json(response, 200, calls);
    if (url.pathname === '/__health') return json(response, 200, { ok: true });
    if (url.pathname === '/__reset') {
      calls.length = 0;
      failWriters = new Set();
      delayMs = 0;
      return json(response, 200, { ok: true });
    }
    if (request.method === 'POST' && url.pathname.endsWith('/v1/messages')) {
      const body = JSON.parse(await readBody(request)) as { system?: unknown; stream?: boolean; messages?: Array<{ content?: unknown }> };
      const writer = writerFor(body.system);
      // What the model was actually shown, so a test can check which CV and which ad reached it.
      const first = body.messages?.[0]?.content;
      const user = typeof first === 'string' ? first : JSON.stringify(first ?? '');
      calls.push({ writer: writer ?? 'unknown', at: new Date().toISOString(), stream: Boolean(body.stream), user: user.slice(0, 20_000) });
      if (!writer) return json(response, 500, { type: 'error', error: { type: 'api_error', message: 'unscripted writer' } });
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      if (failWriters.has(writer as Writer)) {
        return json(response, 500, { type: 'error', error: { type: 'api_error', message: `scripted failure for ${writer}` } });
      }
      const text = answerFor(writer, user);
      return body.stream ? sse(response, text) : json(response, 200, messageFor(text));
    }
    json(response, 404, { error: 'not found' });
  } catch (error) {
    json(response, 500, { error: String(error) });
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`[fake-anthropic] listening on http://127.0.0.1:${port}`);
});
