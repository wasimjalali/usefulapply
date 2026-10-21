/**
 * Run one product service call against the preview's local D1, from outside
 * the Worker. The Playwright loader cannot import the app's ESM dependencies,
 * so specs shell out to this (tsx) and read the JSON line it prints.
 *
 *   npx tsx e2e/tools/ops.ts <op> '<json args>'
 *
 * ops:
 *   edit-cv-title     {userId, sessionId, title}      a field edit through the cv service (revision-conditional)
 *   persist-letter    {userId, sessionId, body}       persistKit with the stored kit and a new cover letter
 *   create-application {userId, jobDescription}       a stored application (the service the MCP tools will call)
 *   edit-email        {userId, sessionId, body}       replace the application email through the kit service
 *   edit-follow-up    {userId, sessionId, body}       replace the follow-up email through the kit service
 *   seed-fit-capture  {userId, contextId}             a paid, captured fit analysis for a context (what a real fit leaves behind)
 *   enqueue           {userId, sessionId, key}        enqueueKitGeneration with a recording producer: the message is
 *                                                     captured and NOT delivered, so the sweeper path can be exercised
 */

import { LOCAL_STATE_V3 } from '../lib/env';
import { openPlatform, pointModelAtFake } from '../lib/platform';

async function main(): Promise<void> {
  const [op, rawArgs] = process.argv.slice(2);
  const args = JSON.parse(rawArgs ?? '{}') as Record<string, string>;
  pointModelAtFake();
  const platform = await openPlatform(process.env.OPS_STATE ?? LOCAL_STATE_V3);
  let result: unknown;
  try {
    if (op === 'edit-cv-title') {
      const { getTailoredCv, setCvFields } = await import('../../src/lib/services/cv');
      const current = await getTailoredCv(args.userId, args.sessionId);
      result = await setCvFields(args.userId, args.sessionId, current.revision, [
        { path: 'personal.currentTitle', value: args.title },
      ]);
    } else if (op === 'persist-letter') {
      const { getKit, persistKit } = await import('../../src/lib/services/kit');
      const kit = await getKit(args.userId, args.sessionId);
      result = await persistKit(args.userId, args.sessionId, {
        optimizedCV: { content: String((kit.cv as { content?: string } | null)?.content ?? ''), changes: [] },
        optimizedCVData: kit.optimizedCVData,
        coverLetter: args.body,
        applicationEmail: kit.email ? { subject: kit.email.subject, body: kit.email.body } : null,
        followUpEmail: kit.followUpEmail,
        documentErrors: {},
      });
    } else if (op === 'edit-email') {
      const { saveKitDocument } = await import('../../src/lib/services/kit');
      result = await saveKitDocument(args.userId, args.sessionId, 'email', {
        subject: 'Application: edited elsewhere',
        body: args.body,
        attachmentNote: 'Please find my CV and cover letter attached.',
      });
    } else if (op === 'edit-follow-up') {
      const { saveKitDocument } = await import('../../src/lib/services/kit');
      result = await saveKitDocument(args.userId, args.sessionId, 'followUpEmail', {
        subject: 'Following up: edited elsewhere',
        body: args.body,
        recommendedDelay: 5,
      });
    } else if (op === 'seed-fit-capture') {
      const credits = await import('../../src/db/repos/credits');
      const key = `fit_analysis:seed:${args.contextId}`;
      const reserved = await credits.reserveCredits({ userId: args.userId, action: 'FIT_ANALYSIS', idempotencyKey: key, metadata: { context_id: args.contextId } });
      if (!reserved.success) throw new Error(`could not reserve the fit: ${reserved.error}`);
      await credits.captureReservation({ userId: args.userId, idempotencyKey: key });
      result = { key };
    } else if (op === 'create-application') {
      const { createApplication } = await import('../../src/lib/services/applications');
      const created = await createApplication(args.userId, { jobDescription: args.jobDescription });
      result = { id: created.id, revision: created.revision };
    } else if (op === 'enqueue') {
      const { enqueueKitGeneration } = await import('../../src/lib/services/generation-runner');
      result = { ...(await enqueueKitGeneration(args.userId, args.sessionId, args.key, {})), messages: platform.queue.messages.length };
    } else {
      throw new Error(`unknown op ${op}`);
    }
  } finally {
    await platform.dispose();
  }
  console.log(`__RESULT__${JSON.stringify(result)}`);
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
