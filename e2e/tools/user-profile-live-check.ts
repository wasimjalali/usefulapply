/**
 * One cheap check of Anthropic user profiles against the real API: create an `application` profile the way the app
 * does (src/lib/models/user-profiles.ts), send a Haiku 5.5 message and a count_tokens request that name it, confirm
 * the API rejects an id that is not ours, then delete the profile and confirm it is gone. Costs a few hundred tokens.
 *
 * Run: npx tsx e2e/tools/user-profile-live-check.ts [out.json]
 * Key: ANTHROPIC_API_KEY from the environment, else ANTHROPIC_API_KEY alone from the main checkout's .dev.vars (read
 * into this process, never printed), as evals/haiku-55-swap/run.ts --key-from-dev-vars does.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import Anthropic, { APIError } from '@anthropic-ai/sdk';

function loadAnthropicKey(): void {
  if (process.env.ANTHROPIC_API_KEY) return;
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: __dirname, encoding: 'utf8' });
  if (common.status !== 0) throw new Error('git rev-parse failed: run from inside the Useful Apply checkout');
  const parsed = parseEnv(readFileSync(path.join(path.dirname(common.stdout.trim()), '.dev.vars'), 'utf8'));
  if (!parsed.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not in the main checkout .dev.vars');
  process.env.ANTHROPIC_API_KEY = parsed.ANTHROPIC_API_KEY;
}

async function expectError(run: () => Promise<unknown>): Promise<{ status: number | null; type: string | null; message: string }> {
  try {
    await run();
  } catch (error) {
    if (error instanceof APIError) return { status: error.status ?? null, type: error.type ?? null, message: error.message.slice(0, 300) };
    throw error;
  }
  throw new Error('expected an API error, got a success');
}

async function main(): Promise<void> {
  loadAnthropicKey();
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1 });
  const referenceId = `useful-apply-live-check-${new Date().toISOString()}`;
  const steps: Record<string, unknown> = { ranAt: new Date().toISOString(), sdk: '@anthropic-ai/sdk 1.1.0', referenceId };

  const profile = await client.userProfiles.create(
    { access_type: 'application', external_user_details: { reference_id: referenceId } },
    { maxRetries: 0 },
  );
  steps.create = { id: profile.id, type: profile.type, access_type: profile.access_type, reference_id: profile.external_user_details.reference_id, enforcement_status: profile.enforcement_status };

  try {
    const fetched = await client.userProfiles.retrieve(profile.id);
    steps.retrieve = { id: fetched.id, reference_id: fetched.external_user_details.reference_id };

    const message = await client.messages.create(
      { model: 'claude-haiku-5-5', max_tokens: 64, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] },
      { headers: { 'anthropic-user-profile-id': profile.id } },
    ).withResponse();
    steps.messageWithHeader = {
      status: message.response.status,
      request_id: message.request_id,
      stop_reason: message.data.stop_reason,
      text: message.data.content.map((block) => (block.type === 'text' ? block.text : '')).join('').slice(0, 40),
      usage: { input: message.data.usage.input_tokens, output: message.data.usage.output_tokens },
    };

    const counted = await client.messages.countTokens(
      { model: 'claude-haiku-5-5', messages: [{ role: 'user', content: 'Reply with the single word: ok' }] },
      { headers: { 'anthropic-user-profile-id': profile.id } },
    );
    steps.countTokensWithHeader = { input_tokens: counted.input_tokens };

    steps.messageWithForeignId = await expectError(() => client.messages.create(
      { model: 'claude-haiku-5-5', max_tokens: 16, messages: [{ role: 'user', content: 'ok' }] },
      { headers: { 'anthropic-user-profile-id': 'uprof_011CZkZCu8hGbp5mYRQgUmz9' }, maxRetries: 0 },
    ));
  } finally {
    const deleted = await client.userProfiles.delete(profile.id);
    steps.delete = { id: deleted.id, type: deleted.type };
    steps.retrieveAfterDelete = await expectError(() => client.userProfiles.retrieve(profile.id, {}, { maxRetries: 0 }));
  }

  const out = process.argv[2];
  const json = JSON.stringify(steps, null, 2);
  if (out) {
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, `${json}\n`);
  }
  console.log(json);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
