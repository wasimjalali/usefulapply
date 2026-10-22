import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { netCharged, profileRow, setPlan } from '../lib/mcp-db';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import type { BrowserContext } from '@playwright/test';
import type { TestUser } from '../lib/user';

/**
 * The applicant's own start date and salary expectation through the MCP tools (migration 0012).
 *
 * - get_account starts with nulls and availabilityAsked false.
 * - update_profile refuses a bad choice, a note over 200 and a salary over 120 without saving or stamping anything,
 *   and an update of other fields does not count as having asked.
 * - A valid save round-trips through get_account, text is tidied, a partial update keeps the rest and null clears.
 * - A skip (availability: null) records that the user was asked, and nothing leaks to another account.
 * - The spending tools return profileGaps: advisory, never a refusal, empty once both values are saved.
 *
 * What the writers do with the values (the prompt block, the salary rule) is covered by the web lane's
 * k-availability spec, which can see the captured writer prompts.
 */

interface Account {
  profile: { name: string | null; email: string; availability: string | null; availabilityNote: string | null; salaryExpectation: string | null; availabilityAsked: boolean };
}
interface Saved {
  availability: string | null;
  availabilityNote: string | null;
  salaryExpectation: string | null;
  location: string | null;
}
type Gaps = Array<'availability' | 'salaryExpectation'>;

test.describe.serial('availability and salary expectation', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;
  let applicationId: string;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'availability');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    applicationId = (await agent.ok<{ applicationId: string }>('analyze_job_fit', { idempotencyKey: uuid(), jobDescription: JOB_DESCRIPTION, jobTitle: 'Senior FP&A Analyst', company: 'Northwind Foods' })).applicationId;
    setPlan(user.id, 'plus');
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  const account = async () => (await agent.ok<Account>('get_account')).profile;

  test('a new account has nothing saved and has not been asked, and the kit result lists both gaps without blocking', async () => {
    expect(await account()).toMatchObject({ availability: null, availabilityNote: null, salaryExpectation: null, availabilityAsked: false });

    const charged = netCharged(user.id);
    const kit = await agent.ok<{ operationId: string; profileGaps: Gaps; creditsReserved: number }>('generate_application_kit', { idempotencyKey: uuid(), applicationId, waitSeconds: 20 });
    expect(kit.profileGaps, 'advisory, in the order availability then salary').toEqual(['availability', 'salaryExpectation']);
    expect(kit.creditsReserved, 'the kit was queued anyway').toBeGreaterThan(0);
    await expect
      .poll(async () => (await agent.ok<{ status: string }>('get_operation', { operationId: kit.operationId })).status, { timeout: 90_000, intervals: [1_000, 2_000] })
      .toBe('succeeded');
    expect(netCharged(user.id)).toBeGreaterThan(charged);
  });

  test('bad values are refused and nothing is saved or stamped', async () => {
    expect(await agent.fails('update_profile', { availability: 'next_week' })).toMatch(/availability/i);
    expect(await agent.fails('update_profile', { availabilityNote: 'x'.repeat(201) })).toMatch(/200/);
    expect(await agent.fails('update_profile', { salaryExpectation: 'y'.repeat(121) })).toMatch(/120/);
    // A good field next to a bad one: the whole call is refused, the good one is not saved.
    expect(await agent.fails('update_profile', { location: 'Hamburg, Germany', salaryExpectation: 'y'.repeat(121) })).toMatch(/120/);
    expect(await agent.fails('update_profile', {})).toMatch(/at least one field/i);
    // The writers fence these values and watch for [placeholders], so the four signs never get stored.
    expect(await agent.fails('update_profile', { salaryExpectation: '>60k' })).toMatch(/can't contain/);
    expect(await agent.fails('update_profile', { availabilityNote: '3 Monate [Quartalsende]' })).toMatch(/can't contain/);

    const row = profileRow(user.id);
    expect(row).toMatchObject({ availability: null, availability_note: null, salary_expectation: null, availability_asked_at: null });
    expect(row.location, 'the refused call saved nothing').not.toBe('Hamburg, Germany');
  });

  test('an update of other fields does not count as asking', async () => {
    await agent.ok('update_profile', { phone: '+49 30 1234567' });
    expect((await account()).availabilityAsked).toBe(false);
    expect(profileRow(user.id).availability_asked_at).toBeNull();
  });

  test('a valid save round-trips through get_account, tidies the text, and a partial update keeps the rest', async () => {
    const saved = await agent.ok<Saved>('update_profile', {
      availability: 'other',
      availabilityNote: '  3 Monate   zum Quartalsende ',
      salaryExpectation: ' 65.000 EUR brutto/Jahr ',
    });
    expect(saved).toMatchObject({ availability: 'other', availabilityNote: '3 Monate zum Quartalsende', salaryExpectation: '65.000 EUR brutto/Jahr' });

    expect(await account()).toEqual(
      expect.objectContaining({ availability: 'other', availabilityNote: '3 Monate zum Quartalsende', salaryExpectation: '65.000 EUR brutto/Jahr', availabilityAsked: true }),
    );
    const row = profileRow(user.id);
    expect(row).toMatchObject({ availability: 'other', availability_note: '3 Monate zum Quartalsende', salary_expectation: '65.000 EUR brutto/Jahr' });
    expect(typeof row.availability_asked_at).toBe('string');

    // Switching to a fixed choice with whitespace-only text clears the note and leaves the salary alone.
    const switched = await agent.ok<Saved>('update_profile', { availability: '1_month', availabilityNote: '   ' });
    expect(switched).toMatchObject({ availability: '1_month', availabilityNote: null, salaryExpectation: '65.000 EUR brutto/Jahr' });
  });

  test('with both values saved the spending tools report no gaps, and clearing the salary brings that gap back', async () => {
    const regenerate = (instruction: string) =>
      agent.ok<{ creditsUsed: number; profileGaps: Gaps }>('regenerate_document', { idempotencyKey: uuid(), applicationId, document: 'cover_letter', instruction });

    const complete = await regenerate('Keep it to four short paragraphs');
    expect(complete).toMatchObject({ creditsUsed: 0.5, profileGaps: [] });

    await agent.ok('update_profile', { salaryExpectation: '' });
    expect(await account()).toMatchObject({ availability: '1_month', salaryExpectation: null, availabilityAsked: true });
    const noSalary = await regenerate('Open with the forecast accuracy result');
    expect(noSalary.profileGaps).toEqual(['salaryExpectation']);
  });

  test('screening answers report a missing salary, then none once it is saved', async () => {
    const questions = ['What are your salary expectations?', 'When can you start?'];
    const before = await agent.ok<{ creditsUsed: number; answers: unknown[]; profileGaps: Gaps }>('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions });
    expect(before).toMatchObject({ creditsUsed: 0, profileGaps: ['salaryExpectation'] });
    expect(before.answers).toHaveLength(2);

    await agent.ok('update_profile', { salaryExpectation: '70,000 EUR gross a year' });
    const after = await agent.ok<{ profileGaps: Gaps }>('draft_screening_answers', { idempotencyKey: uuid(), applicationId, questions });
    expect(after.profileGaps).toEqual([]);
  });

  test('overwriting or clearing a saved start date or salary asks first, and a declined form changes nothing', async () => {
    const { client, asked } = await agent.elicitingClient('decline');
    try {
      const before = profileRow(user.id);
      for (const args of [{ salaryExpectation: '80,000 EUR gross a year' }, { salaryExpectation: null }, { availability: '3_months' }]) {
        const result = await client.callTool({ name: 'update_profile', arguments: args });
        expect(result.isError, JSON.stringify(args)).toBe(true);
        expect((result.content as Array<{ text: string }>)[0].text).toMatch(/declined the confirmation form, so nothing was changed/);
      }
      expect(asked).toHaveLength(3);
      expect(asked[0]).toMatch(/Overwrite the saved salary expectation/);
      expect(asked[2]).toMatch(/Overwrite the saved start date/);
      expect(profileRow(user.id), 'a declined form left every column as it was').toEqual(before);

      // Filling an empty field overwrites nothing, so it asks nothing.
      const filled = await client.callTool({ name: 'update_profile', arguments: { availabilityNote: 'after the move' } });
      expect(filled.isError).toBeFalsy();
      expect(asked).toHaveLength(3);
    } finally {
      await client.close();
    }
  });

  test('a new start-date choice clears the old details, so the two never disagree', async () => {
    expect(await account()).toMatchObject({ availability: '1_month', availabilityNote: 'after the move' });
    const changed = await agent.ok<Saved>('update_profile', { availability: '2_weeks' });
    expect(changed).toMatchObject({ availability: '2_weeks', availabilityNote: null });
    // Other keeps the stored details; a note given with the choice is kept.
    await agent.ok('update_profile', { availability: 'other', availabilityNote: 'after the move' });
    expect((await agent.ok<Saved>('update_profile', { availability: 'other' })).availabilityNote).toBe('after the move');
    const back = await agent.ok<Saved>('update_profile', { availability: '1_month' });
    expect(back).toMatchObject({ availability: '1_month', availabilityNote: null });
  });

  test('a skip records that the user was asked, leaves the values empty, and another account sees none of this', async ({ browser, request }) => {
    const other = await newAgent(browser, request, 'availability-skip');
    try {
      expect(((await other.session.ok<Account>('get_account')).profile)).toMatchObject({ availability: null, salaryExpectation: null, availabilityAsked: false });

      const skipped = await other.session.ok<Saved>('update_profile', { availability: null });
      expect(skipped).toMatchObject({ availability: null, availabilityNote: null, salaryExpectation: null });
      expect(((await other.session.ok<Account>('get_account')).profile)).toMatchObject({ availability: null, availabilityAsked: true });
      expect(typeof profileRow(other.user.id).availability_asked_at).toBe('string');

      // The first user's values are untouched by the other account's skip.
      const mine = await account();
      expect(mine).toMatchObject({ availability: '1_month', salaryExpectation: '70,000 EUR gross a year' });
      expect(profileRow(user.id).salary_expectation).toBe('70,000 EUR gross a year');
    } finally {
      await other.session.close();
      await other.context.close();
    }
  });
});
