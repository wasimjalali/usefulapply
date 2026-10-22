/**
 * Eval-only proxy for the gpt-oss-120b baseline arm. It forwards the body (messages, temperature,
 * max_tokens, response_format, tools) unchanged to the model on Workers AI and returns the raw result with
 * the latency. Workers AI has no local simulation, so the AI binding runs remotely under `wrangler dev`
 * with wrangler's own login. Never deployed.
 *
 *   npx wrangler dev -c evals/haiku-55-swap/wrangler.jsonc --port 8799
 *   ... run.ts <site> --gptoss-url http://localhost:8799
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
