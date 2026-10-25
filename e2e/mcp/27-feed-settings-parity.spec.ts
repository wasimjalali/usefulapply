import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent } from '../lib/mcp-client';
import { setPlan } from '../lib/mcp-db';
import { seedCareerProfile, seedFeedInbox, seedFeedSettings } from '../lib/mcp-feed-seed';
import { PRIMARY_CV } from '../lib/model-script';
import type { TestUser } from '../lib/user';

/**
 * Feed settings shared by the web editor and the MCP, on one account, over the wire.
 *
 * The editor is opened in a real browser signed in as the user while an agent changes the same settings
 * through update_feed_settings. Every write moves the settings revision on: the open editor's save is
 * refused with a clear message and the editor reloads the agent's values, and an agent sending an old
 * revision is refused the same way. Screenshots of each state go to the test's output.
 */

interface SettingsRead {
  revision: number;
  settings: {
    salaryFloor: number | null;
    roles: string[];
    seniority: string[];
    excludedTerms: string[];
    cities: string[];
    countries: string[];
    languages: string[];
    workAuthorization: string | null;
  };
}

test.describe.serial('feed settings: one revision for the web editor and the MCP', () => {
  let agent: McpSession;
  let user: TestUser;
  let context: BrowserContext;

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed-parity');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(user.id, 'max');
    seedFeedSettings(user.id);
    seedFeedInbox(user.id, [{ title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'strong' }]);
    // The sidebar, and with it the Job Board, shows once the account has an application.
    await agent.ok('create_application', {
      jobDescription: 'Financial Controller at Fabrikam. You own month-end close and the rolling forecast. Required: IFRS, Excel.',
      title: 'Financial Controller',
      company: 'Fabrikam',
    });
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  async function openEditor(page: Page): Promise<void> {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const nav = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: /^Job Board/ });
    await nav.click();
    await expect(nav).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Edit feed' }).click();
    await expect(page.getByRole('heading', { name: 'How I search for you' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel('Salary floor')).toBeVisible();
  }

  test('a settings form left open is refused after an agent saved, shows why, and reloads the agent\'s values', async ({}, testInfo) => {
    const page = await context.newPage();
    await openEditor(page);
    const opened = await agent.ok<SettingsRead>('get_feed_settings');

    // The agent changes the salary floor while the form is open.
    const agentSave = await agent.ok<SettingsRead>('update_feed_settings', { revision: opened.revision, salaryFloor: 123000 });
    expect(agentSave.revision).toBe(opened.revision + 1);

    // The user edits the stale form and saves.
    await page.getByLabel('Salary floor').fill('50000');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    const notice = page.getByRole('alert').filter({ hasText: 'Your feed settings changed somewhere else' });
    await expect(notice).toBeVisible();
    await expect(notice).toHaveText('Your feed settings changed somewhere else. I loaded the latest. Check them and save again.');
    // The form now shows what is saved: the agent's value, not the stale edit.
    await expect(page.getByLabel('Salary floor')).toHaveValue('123000');
    await page.screenshot({ path: testInfo.outputPath('1-stale-save-refused.png'), fullPage: true });

    const afterRefusal = await agent.ok<SettingsRead>('get_feed_settings');
    expect(afterRefusal.settings.salaryFloor).toBe(123000);
    expect(afterRefusal.revision).toBe(agentSave.revision);

    // Saving from the reloaded form goes through.
    await page.getByLabel('Salary floor').fill('99000');
    await expect(notice).toHaveCount(0);
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('2-save-after-reload.png'), fullPage: true });
    const afterSave = await agent.ok<SettingsRead>('get_feed_settings');
    expect(afterSave.settings.salaryFloor).toBe(99000);
    expect(afterSave.revision).toBe(agentSave.revision + 1);
    await page.close();
  });

  test('seniority set through the MCP shows in the editor, changes there, and a save never swaps in the CV estimate', async ({}, testInfo) => {
    // The career profile reads this CV as senior, the estimate that used to replace every save.
    seedCareerProfile(user.id);
    const before = await agent.ok<SettingsRead>('get_feed_settings');
    const set = await agent.ok<SettingsRead & { changed: string[] }>('update_feed_settings', { revision: before.revision, seniority: ['junior', 'mid'] });
    expect(set.changed).toEqual(['seniority']);
    expect([...set.settings.seniority].sort()).toEqual(['junior', 'mid']);
    expect([...(await agent.ok<SettingsRead>('get_feed_settings')).settings.seniority].sort()).toEqual(['junior', 'mid']);

    const page = await context.newPage();
    await openEditor(page);
    const levels = page.getByRole('group', { name: 'Seniority' });
    await expect(levels.getByRole('button', { name: 'Junior' })).toHaveAttribute('aria-pressed', 'true');
    await expect(levels.getByRole('button', { name: 'Mid-level' })).toHaveAttribute('aria-pressed', 'true');
    await expect(levels.getByRole('button', { name: 'Senior' })).toHaveAttribute('aria-pressed', 'false');
    await page.screenshot({ path: testInfo.outputPath('3-seniority-from-mcp.png'), fullPage: true });

    // A save of something else keeps the levels; the profile's "senior" never comes back.
    await page.getByLabel('Salary floor').fill('88000');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect([...(await agent.ok<SettingsRead>('get_feed_settings')).settings.seniority].sort()).toEqual(['junior', 'mid']);

    // The editor changes them too.
    await levels.getByRole('button', { name: 'Junior' }).click();
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect((await agent.ok<SettingsRead>('get_feed_settings')).settings.seniority).toEqual(['mid']);
    await page.close();
  });

  test('an agent sending an old revision is refused and nothing changes', async () => {
    const current = await agent.ok<SettingsRead>('get_feed_settings');
    const refused = await agent.fails('update_feed_settings', { revision: current.revision - 1, salaryFloor: 1 });
    expect(refused).toMatch(/changed after you read them/);
    const after = await agent.ok<SettingsRead>('get_feed_settings');
    expect(after.settings.salaryFloor).toBe(current.settings.salaryFloor);
    expect(after.revision).toBe(current.revision);
  });
});
