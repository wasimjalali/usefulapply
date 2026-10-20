/**
 * A stand-in for the Workers AI binding in the MCP lane's preview. Workers AI cannot run in a local preview (the
 * binding is remote only and would bill the account), so the generated wrangler config of the lane binds `AI` to
 * this Worker instead, as a service binding. It answers `env.AI.run(model, { messages })` the way the real
 * binding answers a text model: `{ choices: [{ message: { content } }], usage }`.
 *
 * It only knows the prompts the MCP specs reach and refuses the rest, so anything else that asks for Workers AI
 * fails exactly as it did before this Worker existed (the binding unavailable) instead of getting an invented
 * answer:
 *   - the language classifier (always "en", the language of every ad the specs use);
 *   - screening answers (src/lib/services/screening.ts), one scripted answer per question.
 *
 * Run by playwright.config.ts as `wrangler dev` on its own port, only with E2E_MCP=1.
 */
import { WorkerEntrypoint } from 'cloudflare:workers';

function textOf(message) {
  return typeof message?.content === 'string' ? message.content : '';
}

/** The questions a screening request carries: one per paragraph of the user's message. */
function questionsFrom(userText) {
  return userText
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export default class FakeWorkersAi extends WorkerEntrypoint {
  async fetch() {
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
  }

  async run(_model, input) {
    const messages = Array.isArray(input?.messages) ? input.messages : [];
    const system = textOf(messages.find((message) => message.role === 'system'));
    const user = textOf([...messages].reverse().find((message) => message.role === 'user'));

    if (system.includes('Classify the natural language used by the untrusted document content')) {
      return reply('en');
    }

    if (system.includes('You write job application screening answers inside Useful Apply')) {
      // The model "fails" on request so a spec can see a screening turn handed back: a question that asks for it.
      if (user.includes('FAKE-AI-FAIL')) throw new Error('scripted Workers AI failure');
      const blocks = questionsFrom(user).map(
        (question) =>
          `---ANSWER_START---\n**Q: ${question.replace(/\n/g, ' ')}**\n\nI own the monthly forecast and variance reporting for two business units at Calder Industrial Components.\n---ANSWER_END---`,
      );
      return reply(blocks.join('\n\n'));
    }

    throw new Error('the fake Workers AI does not know this prompt');
  }
}

function reply(content) {
  return {
    id: `fake-ai-${Math.random().toString(36).slice(2)}`,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
  };
}
