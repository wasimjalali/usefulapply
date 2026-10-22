/**
 * Eval-only proxy for evals/screening-logistics/run.ts. It forwards the body
 * (messages, temperature, max_tokens) unchanged to the same model and input
 * shape callWorkersAI uses in src/lib/models/workers-ai.ts. Runs only under
 * `wrangler dev` on localhost; never deployed.
 */

const MODEL = '@cf/openai/gpt-oss-120b';

interface Env {
  AI: { run(model: string, input: Record<string, unknown>): Promise<unknown> };
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') return new Response('POST only', { status: 405 });
    const body = (await request.json()) as Record<string, unknown>;
    const started = Date.now();
    const result = await env.AI.run(MODEL, body);
    return Response.json({ model: MODEL, latencyMs: Date.now() - started, result });
  },
};

export default worker;
