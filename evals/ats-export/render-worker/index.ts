interface Env {
  BROWSER: { quickAction(action: string, body: Record<string, unknown>): Promise<Response> };
  AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

/** The one model the AI parser stand-in is allowed to call. */
const AI_MODEL = '@cf/openai/gpt-oss-120b';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST {html, pdfOptions} or POST /ai {messages}', { status: 405 });
    const body = (await request.json()) as Record<string, unknown>;
    const started = Date.now();

    // The AI parser stand-in (evals/ats-export/ats/ai-parser.ts) sends extracted CV text here. It uses the
    // account's own Workers AI binding, so no key is handled by the eval.
    if (new URL(request.url).pathname === '/ai') {
      const result = await env.AI.run(AI_MODEL, body);
      return Response.json(result, { headers: { 'x-wall-ms': String(Date.now() - started) } });
    }

    const res = await env.BROWSER.quickAction('pdf', body);
    const bytes = await res.arrayBuffer();
    return new Response(bytes, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/pdf',
        'x-browser-ms-used': res.headers.get('x-browser-ms-used') ?? '',
        'x-wall-ms': String(Date.now() - started),
      },
    });
  },
};
