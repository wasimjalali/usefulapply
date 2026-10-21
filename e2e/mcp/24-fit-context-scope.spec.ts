import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { netCharged, reservations, setPlan } from '../lib/mcp-db';
import { fakeCalls } from '../lib/fake-control';
import { MCP_FAKE_URL } from '../lib/env';
import { seedFeedInbox, seedFeedSettings, type SeededFeedJob } from '../lib/mcp-feed-seed';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { openLocalD1 } from '../lib/sqlite';
import type { TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * Idempotency keys are unique per tool, not across tools, so the same key may reach analyze_job_fit and
 * apply_to_feed_job. Each fit caches its context under an id the kit later names to earn the after-fit price
 * and reuse the analysis. With one id for both, the second fit overwrote the first one's context, and the first
 * application's kit would be written from the other job's ad. Each fit must keep its own context, and each kit
 * its own after-fit price, and each kit must be written from its own job ad (read off the scripted model's calls).
 */

// Two ads that share nothing, so the model's calls say which one a kit was written from.
const PASTED_AD = `${JOB_DESCRIPTION} Team motto: ZEBRA-PASTE-AD-71.`;
const FEED_AD = 'Senior FP&A Analyst at Northwind Foods. You own the rolling forecast. Team motto: QUOKKA-FEED-AD-42.';

test.describe.serial('fit contexts: one key on two tools', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let jobs: SeededFeedJob[];

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'fit-context-scope');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    jobs = seedFeedInbox(user.id, [{ title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong', description: FEED_AD }]);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('the same key on analyze_job_fit and apply_to_feed_job keeps two contexts, and both kits take the after-fit price', async () => {
    const key = uuid();
    const pasted = await agent.ok<{ applicationId: string }>('analyze_job_fit', {
      idempotencyKey: key,
      jobDescription: PASTED_AD,
      jobTitle: 'Financial Analyst',
      company: 'Calder Industrial Components',
    });
    const feed = await agent.ok<{ applicationId: string; creditsUsed: number }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'fit', idempotencyKey: key });
    expect(feed.creditsUsed).toBe(0.5);
    expect(feed.applicationId).not.toBe(pasted.applicationId);

    // Two fit reservations, each naming its own context.
    const db = openLocalD1();
    let contextIds: Array<string | null>;
    try {
      contextIds = (db.prepare("SELECT json_extract(metadata, '$.context_id') AS id FROM credit_reservations WHERE user_id = ? AND action = 'fit_analysis' ORDER BY rowid").all(user.id) as Array<{ id: string | null }>)
        .map((row) => row.id);
    } finally {
      db.close();
    }
    expect(contextIds).toHaveLength(2);
    expect(contextIds.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
    expect(new Set(contextIds).size, 'each fit has its own context id').toBe(2);

    for (const applicationId of [pasted.applicationId, feed.applicationId]) {
      const kit = await agent.ok<{ operationId: string; creditsReserved: number }>('generate_application_kit', { idempotencyKey: uuid(), applicationId });
      expect(kit.creditsReserved, `the paid fit makes the kit for ${applicationId} 1.5`).toBe(1.5);
      await expect
        .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
        .toBe('succeeded');
    }

    // Each kit's letter was written from its own ad and never the other's, and no kit repeated the ad's
    // analysis: it ran once per ad, so the kit reused the context its own fit cached.
    const calls = await fakeCalls(MCP_FAKE_URL);
    const writtenFrom = (writer: string, marker: string) => calls.filter((call) => call.writer === writer && call.user.includes(marker));
    for (const [own, other] of [['ZEBRA-PASTE-AD-71', 'QUOKKA-FEED-AD-42'], ['QUOKKA-FEED-AD-42', 'ZEBRA-PASTE-AD-71']]) {
      expect(writtenFrom('coverLetter', own), `a cover letter was written from ${own}`).toHaveLength(1);
      expect(calls.filter((call) => call.writer === 'coverLetter' && call.user.includes(own) && call.user.includes(other)), `no letter mixes ${own} with ${other}`).toHaveLength(0);
      expect(writtenFrom('job', own), `the ad ${own} was read once, by its fit, so the kit reused that context`).toHaveLength(1);
    }

    expect(reservations(user.id).filter((row) => row.action === 'generation_after_fit')).toHaveLength(2);
    // Two fits at 0.5 and two kits at 1.5.
    expect(netCharged(user.id)).toBe(4);
  });
});
