import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../lib/worker-logs';
import { McpSession, newAgent, uuid } from '../lib/mcp-client';
import { setPlan } from '../lib/mcp-db';
import { seedCareerProfile, seedFeedInbox, seedFeedSettings, type SeededFeedJob } from '../lib/mcp-feed-seed';
import { openLocalD1 } from '../lib/sqlite';
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
  let jobs: SeededFeedJob[];

  test.beforeAll(async ({ browser, request }) => {
    const created = await newAgent(browser, request, 'feed-parity');
    agent = created.session;
    user = created.user;
    context = created.context;
    await agent.ok('save_cv', { target: 'primary', text: PRIMARY_CV });
    setPlan(user.id, 'max');
    seedFeedSettings(user.id);
    jobs = seedFeedInbox(user.id, [
      { title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'strong' },
      { title: 'FP&A Manager', company: 'Contoso', fitLabel: 'good' },
      { title: 'Planning Analyst', company: 'Northwind Foods', fitLabel: 'good' },
    ]);
  });

  test.afterAll(async () => {
    await agent?.close();
    await context?.close();
  });

  async function openEditor(page: Page): Promise<void> {
    // The job feed by its own link: this account has no kit, so the dashboard would open on the guided line.
    await page.goto('/dashboard?workspace=job-feed');
    await page.waitForLoadState('networkidle');
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

  test('words to avoid, cities, languages and work authorization set through the MCP read back the same in get_feed_settings and the editor', async ({}, testInfo) => {
    const before = await agent.ok<SettingsRead>('get_feed_settings');
    expect(before.settings.countries).not.toContain('de');
    const set = await agent.ok<SettingsRead & { changed: string[] }>('update_feed_settings', {
      revision: before.revision,
      excludedTerms: ['Sales', 'Randstad', 'sales'],
      cities: ['Berlin'],
      languages: ['English', 'German', 'Dari/Persian'],
      workAuthorization: 'needs_sponsorship',
    });
    expect(set.changed).toEqual(expect.arrayContaining(['words to avoid', 'cities', 'languages', 'work authorization']));
    const read = await agent.ok<SettingsRead>('get_feed_settings');
    expect(read.settings).toMatchObject({
      excludedTerms: ['Sales', 'Randstad'],
      cities: ['Berlin'],
      languages: ['English', 'German', 'Dari/Persian'],
      workAuthorization: 'needs_sponsorship',
    });
    // Berlin brought Germany with it.
    expect(read.settings.countries).toContain('de');

    const page = await context.newPage();
    await openEditor(page);
    await expect(page.getByLabel('Words to avoid')).toHaveValue('Sales, Randstad');
    await expect(page.getByLabel('Cities')).toHaveValue('Berlin');
    await expect(page.getByLabel('Languages')).toHaveValue('English, German, Dari/Persian');
    await expect(page.getByLabel('Work authorization')).toHaveValue('needs_sponsorship');
    await expect(page.getByRole('button', { name: 'Remove Germany' })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('4-fields-from-mcp.png'), fullPage: true });

    // And the other way: the editor's change is what the MCP reads.
    await page.getByLabel('Words to avoid').fill('Sales, Randstad, Werkstudent');
    await page.getByRole('button', { name: 'Save preferences' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect((await agent.ok<SettingsRead>('get_feed_settings')).settings.excludedTerms).toEqual(['Sales', 'Randstad', 'Werkstudent']);
    await page.close();

    // Bad values are refused before anything is written.
    const current = await agent.ok<SettingsRead>('get_feed_settings');
    expect(await agent.fails('update_feed_settings', { revision: current.revision, workAuthorization: 'citizen' })).toMatch(/invalid/i);
    expect(await agent.fails('update_feed_settings', { revision: current.revision, excludedTerms: ['x'.repeat(81)] })).toMatch(/too big|at most|80/i);
    expect(await agent.fails('update_feed_settings', { revision: current.revision, languages: [] })).toMatch(/too small|at least|1/i);
    expect((await agent.ok<SettingsRead>('get_feed_settings')).revision).toBe(current.revision);
  });

  test('update_feed_searches sets the search list the editor shows, and a list over the limit is refused', async ({}, testInfo) => {
    const before = await agent.ok<SettingsRead>('get_feed_settings');
    const saved = await agent.ok<{ revision: number; searches: Array<{ query: string; country: string }>; roles: string[]; countries: string[]; searchLimit: number }>('update_feed_searches', {
      revision: before.revision,
      searches: [
        { query: 'Applied AI Engineer', country: 'de' },
        { query: 'KI-Ingenieur', country: 'de' },
        { query: 'AI Automation Engineer', country: 'nl' },
      ],
    });
    expect(saved.searches).toEqual([
      { query: 'Applied AI Engineer', country: 'de' },
      { query: 'KI-Ingenieur', country: 'de' },
      { query: 'AI Automation Engineer', country: 'nl' },
    ]);
    expect(saved.roles).toEqual(['Applied AI Engineer', 'KI-Ingenieur', 'AI Automation Engineer']);
    expect(saved.countries).toEqual(expect.arrayContaining(['de', 'nl']));

    const career = await agent.ok<{ searchStrategy: { userConfirmed: boolean; queries: Array<{ query: string; targetCountry: string }> } }>('get_career_profile');
    expect(career.searchStrategy.userConfirmed).toBe(true);
    expect(career.searchStrategy.queries.map((query) => `${query.query}|${query.targetCountry}`)).toEqual(['Applied AI Engineer|de', 'KI-Ingenieur|de', 'AI Automation Engineer|nl']);

    const page = await context.newPage();
    await openEditor(page);
    const inputValues = () => page.locator('input').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    await expect.poll(inputValues).toEqual(expect.arrayContaining(['Applied AI Engineer', 'KI-Ingenieur', 'AI Automation Engineer']));
    await page.screenshot({ path: testInfo.outputPath('5-searches-from-mcp.png'), fullPage: true });
    await page.close();

    const tooMany = Array.from({ length: saved.searchLimit + 1 }, (_, index) => ({ query: `Role ${index + 1}`, country: 'de' }));
    expect(await agent.fails('update_feed_searches', { revision: saved.revision, searches: tooMany })).toMatch(new RegExp(`more than ${saved.searchLimit} searches`));
  });

  test('regenerate_career_profile reads the CV again and leaves the settings\' seniority alone; the editor button does the same', async () => {
    const before = await agent.ok<SettingsRead>('get_feed_settings');
    // The stored profile is the seeded one, "senior". The CV on file reads as mid on the scripted model.
    const regenerated = await agent.ok<{ status: string; profile: { seniority: { level: string } } | null }>('regenerate_career_profile');
    expect(regenerated.status).toBe('ok');
    expect(regenerated.profile?.seniority.level).toBe('mid');
    const career = await agent.ok<{ status: string; cvNewerThanProfile: boolean; profile: { seniority: { level: string } } }>('get_career_profile');
    expect(career).toMatchObject({ status: 'ok', cvNewerThanProfile: false, profile: { seniority: { level: 'mid' } } });
    // The settings are the user's: unchanged, revision included.
    const after = await agent.ok<SettingsRead>('get_feed_settings');
    expect(after.revision).toBe(before.revision);
    expect(after.settings.seniority).toEqual(before.settings.seniority);

    const page = await context.newPage();
    await openEditor(page);
    const reread = page.getByRole('button', { name: 'Read my CV again' });
    const posted = page.waitForResponse((response) => response.url().endsWith('/api/job-feed/career-profile') && response.request().method() === 'POST');
    await reread.click();
    const response = await posted;
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ok', regenerated: true });
    await expect(reread).toBeEnabled();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.close();
  });

  test('roles over the search list are named in droppedRoles and a warning, never dropped silently', async () => {
    const before = await agent.ok<SettingsRead & { settings: { countries: string[] } }>('get_feed_settings');
    const roles = Array.from({ length: 30 }, (_, index) => `Role ${String(index + 1).padStart(2, '0')}`);
    const saved = await agent.ok<{ settings: { roles: string[]; countries: string[] }; searchLimit: number; droppedRoles: string[]; warning: string | null }>('update_feed_settings', {
      revision: before.revision,
      roles,
      countries: ['de'],
    });
    // Max keeps eight searches a run for three runs a day: a list of 24.
    expect(saved.searchLimit).toBe(24);
    expect(saved.settings.roles).toEqual(roles.slice(0, 24));
    expect(saved.droppedRoles).toEqual(roles.slice(24));
    expect(saved.warning).toContain('6 of the roles sent did not fit');
    expect(saved.warning).toContain('Role 25');
  });

  test('give_job_feedback says why a job cannot change: a kit made, dismissed, rated not relevant, or not in the feed', async () => {
    // A kit made for the first job, the way the feed's apply leaves the row.
    const db = openLocalD1();
    try {
      const now = new Date().toISOString();
      db.prepare(
        "INSERT INTO job_feed_feedback (id, user_id, canonical_job_id, apply_started_at, applied_at, generation_status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'succeeded', '{}', ?, ?)",
      ).run(uuid(), user.id, jobs[0].id, now, now, now, now);
    } finally {
      db.close();
    }
    expect(await agent.fails('give_job_feedback', { jobId: jobs[0].id, action: 'save' })).toBe('This job already has an application kit, so it left the feed. It is in the tracker.');

    await agent.ok('give_job_feedback', { jobId: jobs[1].id, action: 'dismiss' });
    expect(await agent.fails('give_job_feedback', { jobId: jobs[1].id, action: 'save' })).toBe('This job was dismissed, so it left the feed for good.');

    await agent.ok('give_job_feedback', { jobId: jobs[2].id, action: 'rate_not_relevant' });
    expect(await agent.fails('give_job_feedback', { jobId: jobs[2].id, action: 'rate_helpful' })).toBe('This job was rated not relevant, so it left the feed for good.');

    expect(await agent.fails('give_job_feedback', { jobId: uuid(), action: 'save' })).toBe('That job is not in this feed. Jobs leave it 7 days after the run that found them.');
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
