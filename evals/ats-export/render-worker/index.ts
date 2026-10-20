interface Env {
  BROWSER: { quickAction(action: string, body: Record<string, unknown>): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST {html, pdfOptions}', { status: 405 });
    const body = (await request.json()) as Record<string, unknown>;
    const started = Date.now();
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
