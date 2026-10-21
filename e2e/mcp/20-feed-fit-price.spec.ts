import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { netCharged, operations, reservations, setPlan } from '../lib/mcp-db';
import { seedFeedInbox, seedFeedSettings, type SeededFeedJob } from '../lib/mcp-feed-seed';
import { PRIMARY_CV } from '../lib/model-script';
import { creditsOf, type TestUser } from '../lib/user';
import type { BrowserContext } from '@playwright/test';

/**
 * A fit check made from the feed earns the after-fit kit price, like analyze_job_fit does. The kit reads the
 * pending fit off the application and names its context id; the credits layer only honours that id for a
 * fit reservation that carries it, so apply_to_feed_job (mode fit) has to store it on the reservation.
 * Fit 0.5 + kit 1.5 = 2.0 in all. Without the id the kit costs 2.0 and the same journey costs 2.5.
 */
test.describe.serial('feed: fit then kit', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let jobs: SeededFeedJob[];

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed-fit-price');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    jobs = seedFeedInbox(user.id, [{ title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' }]);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  test('apply_to_feed_job in fit mode then generate_application_kit costs 0.5 + 1.5, not 0.5 + 2', async () => {
    const start = creditsOf(user.id).total;
    const fit = await agent.ok<{ applicationId: string; status: string; creditsUsed: number }>('apply_to_feed_job', { jobId: jobs[0].id, mode: 'fit', idempotencyKey: uuid() });
    expect(fit).toMatchObject({ status: 'succeeded', creditsUsed: 0.5 });
    expect(creditsOf(user.id).total).toBe(start - 0.5);

    const kit = await agent.ok<{ operationId: string; creditsReserved: number; status: string }>('generate_application_kit', { idempotencyKey: uuid(), applicationId: fit.applicationId });
    expect(kit.creditsReserved, 'the paid fit makes the kit 1.5').toBe(1.5);
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');

    expect(reservations(user.id).filter((row) => row.action === 'generation_after_fit')).toHaveLength(1);
    expect(reservations(user.id).filter((row) => row.action === 'full_application')).toHaveLength(0);
    expect(operations(user.id).filter((row) => row.kind === 'generate_kit')).toHaveLength(1);
    expect(netCharged(user.id)).toBe(2);
    expect(creditsOf(user.id).total).toBe(start - 2);
  });
});
