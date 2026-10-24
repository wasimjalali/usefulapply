import { expect, test, type APIRequestContext, type Browser, type Locator, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage, storedApplication, waitForStored } from '../lib/app';
import { fakeReset } from '../lib/fake-control';
import { setPlan } from '../lib/mcp-db';
import { seedFeedInbox, seedFeedSettings } from '../lib/mcp-feed-seed';
import { openLocalD1 } from '../lib/sqlite';
import { cloneApplications } from '../lib/visual';

/**
 * (s) Four things the backend already did that the web app now shows: rating a feed match, the employment type
 * filter, the failed payment notice and editing an application's title, company and job link.
 *
 * Ways it could fail, written before the spec:
 *  1. Rating: the buttons show on the Free plan (the server answers 403), or on a role the server would refuse (applied).
 *  2. "Good match" doesn't reach the row (metadata.match_rating stays empty), or shows as chosen only in the client's
 *     copy: after a reload the button is unpressed again.
 *  3. "Not relevant" fires at once with no question (it is terminal: the server blocks the row for good), or "Keep"
 *     still sends the request, or focus is lost after Keep.
 *  4. "Not relevant" removes the card from the client only: after a reload the server serves the role again, or the
 *     row isn't stamped 'not_relevant'.
 *  5. After "Not relevant" the user is left on a dead detail page, or focus falls to the page.
 *  6. The same role can still be rated or dismissed afterwards (a hand-made request gets a 200).
 *  7. A 409 reads as success (the card leaves) or a 404 shows an error instead of removing the card quietly.
 *  8. Good match after Not relevant reopens a terminal row.
 *  9. Employment type: the chips show nothing for a stored value, a click doesn't mark the chip, or the last type can
 *     be switched off (the server then falls back to full-time without telling anyone).
 * 10. The save sends the old employment types (the draft isn't part of the payload), or they are stored but the editor
 *     shows the default again after a reload.
 * 11. Payment notice: a past-due subscription shows nothing because the pane only reads the active row; an active one
 *     shows the notice anyway; the notice's button doesn't open the portal; both "Manage billing" buttons show at once.
 * 12. The notice is missing when only user_credits knows (no subscriptions row), which the webhook can leave behind.
 * 13. Edit details: the form saves to the store but not to D1 (gone after a reload), the sidebar keeps the old name,
 *     the tracker row keeps the old company, or the job link takes a "javascript:" address that then renders as an href.
 * 14. Cancel or Escape saves anyway, or Save with nothing changed bumps the revision.
 * 15. "Open the ad" shows for an application with no link, shows a non-web link, opens in the same tab, or lacks
 *     rel="noopener noreferrer". Clearing the link leaves the old link in the row.
 * 16. A title-only save writes the form's stale link over one added elsewhere while the form was open, or sends a link at all.
 * 17. A save that fails leaves the draft in the store, and the autosync saves it later behind a form that said it failed.
 * 18. After a conflict the form can never save: it keeps comparing against the values it opened on.
 */

const JOBS = [
  { title: 'Senior FP&A Analyst', company: 'Northwind Foods', fitLabel: 'strong' as const },
  { title: 'Financial Controller', company: 'Fabrikam', fitLabel: 'good' as const },
  { title: 'Head of Planning', company: 'Contoso', fitLabel: 'good' as const },
  { title: 'Treasury Lead', company: 'Adventure Works', fitLabel: 'good' as const },
];

const canvas = (page: Page) => page.locator('[data-shell-column="canvas"]:not([inert])');
const cardOf = (page: Page, title: string): Locator =>
  canvas(page).getByRole('heading', { name: title }).locator('xpath=ancestor::div[@role="button"][1]');

// Every feed user holds a copy of one kit built once through the real UI (see r-feed-dismiss.spec.ts): a user with no
// kit is on the guided line, which has no sidebar and so no way to the Job Board.
let kitOwnerId: string;

test.beforeAll(async ({ browser, request }) => {
  test.setTimeout(300_000);
  await fakeReset();
  const { user, context, page } = await signedInPage(browser, request, 'surfacekit');
  try {
    await generateKitThroughUi(page);
    await waitForStored(user.id, (row) => row.generation_status === 'succeeded', 'kit persisted');
  } finally {
    await context.close();
  }
  kitOwnerId = user.id;
});

async function feedUser(browser: Browser, request: APIRequestContext, label: string) {
  const signedIn = await signedInPage(browser, request, label);
  cloneApplications(kitOwnerId, signedIn.user.id);
  return signedIn;
}

async function openJobBoard(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByRole('tab', { name: 'CV', exact: true })).toBeVisible({ timeout: 30_000 });
  const nav = page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: /^Job Board/ });
  await nav.click();
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
}

function withDb<T>(fn: (db: ReturnType<typeof openLocalD1>) => T): T {
  const db = openLocalD1();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** metadata.match_rating of a user's feedback row for a job, or null when there is no row or no rating. */
function matchRating(userId: string, jobId: string): string | null {
  return withDb((db) => {
    const row = db
      .prepare("SELECT json_extract(metadata, '$.match_rating') AS rating FROM job_feed_feedback WHERE user_id = ? AND canonical_job_id = ?")
      .get(userId, jobId) as { rating: string | null } | undefined;
    return row?.rating ?? null;
  });
}

async function waitForRating(userId: string, jobId: string, expected: string): Promise<void> {
  await expect.poll(() => matchRating(userId, jobId), { timeout: 15_000 }).toBe(expected);
}

function employmentTypesOf(userId: string): string[] {
  return withDb((db) => {
    const row = db.prepare('SELECT employment_types FROM job_feed_settings WHERE user_id = ?').get(userId) as { employment_types: string } | undefined;
    if (!row) throw new Error(`no feed settings for ${userId}`);
    return (JSON.parse(row.employment_types) as string[]).slice().sort();
  });
}

/** A paid plan the way the webhook leaves it. `rowStatus: null` leaves out the subscriptions row. */
function seedBilling(userId: string, options: { creditsStatus: string; rowStatus: string | null }): void {
  setPlan(userId, 'plus');
  const now = new Date().toISOString();
  withDb((db) => {
    db.prepare('UPDATE profiles SET subscription_status = ? WHERE id = ?').run(options.creditsStatus, userId);
    db.prepare("UPDATE user_credits SET subscription_status = ?, stripe_customer_id = ?, stripe_subscription_id = ?, version = version + 1 WHERE user_id = ?")
      .run(options.creditsStatus, `cus_e2e_${userId}`, `sub_e2e_${userId}`, userId);
    if (options.rowStatus) {
      db.prepare(`
        INSERT INTO subscriptions
          (id, user_id, tier, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, created_at, updated_at)
        VALUES (?, ?, 'plus', ?, ?, ?, ?, 0, ?, ?)
      `).run(crypto.randomUUID(), userId, options.rowStatus, `cus_e2e_${userId}`, `sub_e2e_${userId}`, new Date(Date.now() + 20 * 86_400_000).toISOString(), now, now);
    }
  });
}

async function openUsage(page: Page) {
  await page.goto('/dashboard?settings=usage');
  await expect(page.getByText('left this month')).toBeVisible({ timeout: 30_000 });
}

const NOTICE = "Your last payment didn't go through. Update your card to keep your plan.";

test('(s1) a Plus user rates a match: Good match sticks across a reload, Not relevant asks first, then the role is gone for good', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { user, context, page } = await feedUser(browser, request, 'surfacerate');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [target, neighbour] = seedFeedInbox(user.id, JOBS);

    const ratingRequests: string[] = [];
    page.on('request', (req) => {
      if (req.url().endsWith('/api/job-feed/feedback') && req.method() === 'POST') ratingRequests.push(req.postData() ?? '');
    });
    const notRelevantRequests = () => ratingRequests.filter((body) => body.includes('"rated_not_relevant"'));

    await openJobBoard(page);
    await cardOf(page, target.title).click();
    const good = canvas(page).getByRole('button', { name: 'Good match' });
    const notRelevant = canvas(page).getByRole('button', { name: 'Not relevant' });
    await expect(good).toHaveAttribute('aria-disabled', 'false');
    await expect(notRelevant).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Dismiss', exact: true })).toBeVisible();

    // Good match: the button shows it, the row holds it.
    await good.click();
    // Once rated it reads as a status, not a toggle (the server has no way to take a rating back), and the button
    // the user just pressed keeps the focus.
    const rated = canvas(page).getByRole('button', { name: 'Rated a good match' });
    await expect(rated).toHaveAttribute('aria-disabled', 'true');
    await expect(rated).not.toHaveAttribute('aria-pressed', /.*/);
    await expect(rated).toBeFocused();
    await rated.click();
    await waitForRating(user.id, target.id, 'helpful');

    // Still chosen after a reload: the state comes from the server, not the client's copy.
    await page.reload();
    await openJobBoard(page);
    await cardOf(page, target.title).click();
    await expect(canvas(page).getByRole('button', { name: 'Rated a good match' })).toHaveAttribute('aria-disabled', 'true');

    // Not relevant is terminal, so it asks first. Keep sends nothing and hands focus back.
    await canvas(page).getByRole('button', { name: 'Not relevant' }).click();
    await expect(canvas(page).getByText("Not a fit? It won't come back.")).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Good match' })).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Keep' })).toBeFocused();
    await canvas(page).getByRole('button', { name: 'Keep' }).click();
    await expect(canvas(page).getByText("Not a fit? It won't come back.")).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Not relevant' })).toBeFocused();
    await page.waitForTimeout(500);
    expect(notRelevantRequests()).toHaveLength(0);
    expect(matchRating(user.id, target.id)).toBe('helpful');

    // Escape closes it too.
    await canvas(page).getByRole('button', { name: 'Not relevant' }).click();
    await page.keyboard.press('Escape');
    await expect(canvas(page).getByText("Not a fit? It won't come back.")).toHaveCount(0);
    expect(notRelevantRequests()).toHaveLength(0);

    // Confirm: one request, back on the list with focus on its heading, the role gone, the neighbour kept.
    await canvas(page).getByRole('button', { name: 'Not relevant' }).click();
    await canvas(page).getByRole('group', { name: 'Not a fit?' }).getByRole('button', { name: 'Not relevant' }).click();
    await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);
    await expect(cardOf(page, neighbour.title)).toBeVisible();
    await expect(canvas(page).getByRole('heading', { level: 2 })).toBeFocused();
    await waitForRating(user.id, target.id, 'not_relevant');
    expect(notRelevantRequests()).toHaveLength(1);

    // Terminal: the server refuses every further change to that role.
    for (const action of ['rated_helpful', 'dismissed']) {
      const response = await page.request.post('/api/job-feed/feedback', { data: { jobId: target.id, action, runId: null } });
      expect([404, 409], `${action} on a not-relevant role`).toContain(response.status());
    }
    expect(matchRating(user.id, target.id)).toBe('not_relevant');

    // Gone after a reload.
    await page.reload();
    await openJobBoard(page);
    await expect(cardOf(page, neighbour.title)).toBeVisible();
    await expect(cardOf(page, target.title)).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(s2) a Free user sees no rating buttons and the server refuses a hand-made rating', async ({ browser, request }) => {
  test.setTimeout(90_000);
  const { user, context, page } = await feedUser(browser, request, 'surfaceratefree');
  try {
    setPlan(user.id, 'free');
    seedFeedSettings(user.id);
    const [job] = seedFeedInbox(user.id, JOBS.slice(0, 1));
    await openJobBoard(page);
    await cardOf(page, job.title).click();
    await expect(canvas(page).getByRole('button', { name: 'Back to feed' })).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Save this role' })).toBeVisible();
    await expect(canvas(page).getByRole('button', { name: 'Good match' })).toHaveCount(0);
    await expect(canvas(page).getByRole('button', { name: 'Not relevant' })).toHaveCount(0);

    for (const action of ['rated_helpful', 'rated_not_relevant']) {
      const response = await page.request.post('/api/job-feed/feedback', { data: { jobId: job.id, action, runId: null } });
      expect(response.status(), action).toBe(403);
    }
    expect(matchRating(user.id, job.id)).toBeNull();
  } finally {
    await context.close();
  }
});

test('(s3) a 409 on Not relevant keeps the role and says why, a 404 removes it quietly', async ({ browser, request }) => {
  test.setTimeout(120_000);
  const { user, context, page } = await feedUser(browser, request, 'surfaceratecodes');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    const [conflict, gone] = seedFeedInbox(user.id, JOBS.slice(0, 2));
    await openJobBoard(page);

    await page.route('**/api/job-feed/feedback', (route) => {
      const body = route.request().postData() ?? '';
      if (!body.includes('"rated_not_relevant"')) return route.continue();
      return body.includes(conflict.id)
        ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'terminal' }) })
        : route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Job Feed item not found.' }) });
    });

    await cardOf(page, conflict.title).click();
    await canvas(page).getByRole('button', { name: 'Not relevant' }).click();
    await canvas(page).getByRole('group', { name: 'Not a fit?' }).getByRole('button', { name: 'Not relevant' }).click();
    await expect(page.getByText("That role can't be rated now.")).toBeVisible();
    await expect(page.getByText("That role won't come back.")).toHaveCount(0);
    await expect(canvas(page).getByRole('heading', { name: conflict.title })).toBeVisible();

    await canvas(page).getByRole('button', { name: 'Back to feed' }).click();
    await cardOf(page, gone.title).click();
    await canvas(page).getByRole('button', { name: 'Not relevant' }).click();
    await canvas(page).getByRole('group', { name: 'Not a fit?' }).getByRole('button', { name: 'Not relevant' }).click();
    await expect(canvas(page).getByRole('tab', { name: 'Today' })).toBeVisible();
    await expect(cardOf(page, gone.title)).toHaveCount(0);
    await expect(page.getByText(/no longer in your feed/)).toHaveCount(0);
    await expect(page.getByText("That role won't come back.")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('(s4) employment types: saved, kept after a reload, and the last one cannot be switched off', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const { user, context, page } = await feedUser(browser, request, 'surfaceemployment');
  try {
    setPlan(user.id, 'plus');
    seedFeedSettings(user.id);
    seedFeedInbox(user.id, JOBS.slice(0, 1));
    expect(employmentTypesOf(user.id)).toEqual(['full_time']);

    const openEditor = async () => {
      await openJobBoard(page);
      await canvas(page).getByRole('button', { name: 'Edit feed' }).click();
      await expect(canvas(page).getByRole('heading', { name: 'How I search for you' })).toBeVisible();
      return canvas(page).getByRole('group', { name: 'Employment type' });
    };
    const chip = (group: Locator, name: string) => group.getByRole('button', { name, exact: true });

    let group = await openEditor();
    // The stored value shows, and only that one.
    await expect(chip(group, 'Full-time')).toHaveAttribute('aria-pressed', 'true');
    for (const name of ['Part-time', 'Contract', 'Internship', 'Temporary']) {
      await expect(chip(group, name)).toHaveAttribute('aria-pressed', 'false');
    }

    const save = canvas(page).getByRole('button', { name: 'Save preferences' });
    await expect(save).toBeDisabled();

    // A set, not a list: after saving two types, switching one off and on again (it moves to the end) is no change.
    await chip(group, 'Part-time').click();
    await save.click();
    await expect(canvas(page).getByText('Saved.')).toBeVisible({ timeout: 30_000 });
    expect(employmentTypesOf(user.id)).toEqual(['full_time', 'part_time']);
    await chip(group, 'Full-time').click();
    await chip(group, 'Full-time').click();
    await expect(save).toBeDisabled();

    // Switching the last one off is refused in the form: a message, and Save stays off.
    await chip(group, 'Full-time').click();
    await chip(group, 'Part-time').click();
    await expect(group.getByText('Choose at least one employment type.')).toBeVisible();
    await expect(save).toBeDisabled();

    // Two types, neither of them the default.
    await chip(group, 'Contract').click();
    await chip(group, 'Temporary').click();
    await expect(group.getByText('Choose at least one employment type.')).toHaveCount(0);
    await expect(save).toBeEnabled();
    const saveRequest = page.waitForRequest((req) => req.url().endsWith('/api/job-feed/settings') && req.method() === 'PUT');
    await save.click();
    const sent = await saveRequest;
    await expect(canvas(page).getByText('Saved.')).toBeVisible({ timeout: 30_000 });
    expect(employmentTypesOf(user.id)).toEqual(['contract', 'temporary']);

    // The server refuses an empty list sent by hand, instead of turning it into full-time.
    const empty = await page.request.put('/api/job-feed/settings', { data: { ...(sent.postDataJSON() as Record<string, unknown>), employment_types: [] } });
    expect(empty.status()).toBe(400);
    expect(JSON.stringify(await empty.json())).toContain('at least one employment type');
    expect(employmentTypesOf(user.id)).toEqual(['contract', 'temporary']);

    // The editor reads the stored value back after a reload.
    await page.reload();
    group = await openEditor();
    await expect(chip(group, 'Contract')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(group, 'Temporary')).toHaveAttribute('aria-pressed', 'true');
    await expect(chip(group, 'Full-time')).toHaveAttribute('aria-pressed', 'false');
    await expect(chip(group, 'Part-time')).toHaveAttribute('aria-pressed', 'false');
  } finally {
    await context.close();
  }
});

test('(s5) a past-due plan shows the failed payment notice with a working Manage billing, an active one shows none', async ({ browser, request }) => {
  test.setTimeout(150_000);
  // Past due is a feed user with a kit, so the sidebar is there to show the plan name.
  const past = await feedUser(browser, request, 'surfacepastdue');
  const creditsOnly = await signedInPage(browser, request, 'surfacepastduecredits');
  const active = await signedInPage(browser, request, 'surfaceactive');
  try {
    seedBilling(past.user.id, { creditsStatus: 'past_due', rowStatus: 'past_due' });
    // The webhook writes user_credits first and the subscriptions row after, so one can lead the other.
    seedBilling(creditsOnly.user.id, { creditsStatus: 'past_due', rowStatus: null });
    seedBilling(active.user.id, { creditsStatus: 'active', rowStatus: 'active' });

    // Past due: the notice sits on the plan row and its button opens the portal. Nothing else changes the plan.
    await openUsage(past.page);
    await expect(past.page.getByText('Credit pack')).toBeVisible();
    const notice = past.page.getByRole('alert').filter({ hasText: NOTICE });
    await expect(notice).toBeVisible();
    // One Manage billing button, not two.
    await expect(past.page.getByRole('button', { name: 'Manage billing' })).toHaveCount(1);
    await expect(notice.getByRole('button', { name: 'Manage billing' })).toBeVisible();
    await past.page.route('**/api/stripe/create-portal', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/dashboard?portal=stubbed' }),
    }));
    const portal = past.page.waitForRequest((req) => req.url().endsWith('/api/stripe/create-portal') && req.method() === 'POST');
    await notice.getByRole('button', { name: 'Manage billing' }).click();
    await portal;
    await past.page.waitForURL(/portal=stubbed/);

    // The sidebar still names the plan for a past-due user.
    await expect(past.page.getByRole('navigation', { name: 'Workspace' })).toBeVisible({ timeout: 30_000 });
    await expect(past.page.getByText('Plus plan', { exact: true })).toBeVisible();

    // Only user_credits says past due: still shown.
    await openUsage(creditsOnly.page);
    await expect(creditsOnly.page.getByRole('alert').filter({ hasText: NOTICE })).toBeVisible();

    // Active: no notice, and the plan row keeps its own Manage billing.
    await openUsage(active.page);
    await expect(active.page.getByText('Credit pack')).toBeVisible();
    await expect(active.page.getByText(NOTICE)).toHaveCount(0);
    await expect(active.page.getByRole('button', { name: 'Manage billing' })).toHaveCount(1);
  } finally {
    await past.context.close();
    await creditsOnly.context.close();
    await active.context.close();
  }
});

test('(s6) editing an application: title, company and link persist, show in the sidebar and tracker, and the ad link is safe', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { user, context, page } = await feedUser(browser, request, 'surfaceedit');
  try {
    withDb((db) => db.prepare("UPDATE application_sessions SET job_url = 'https://jobs.example.test/ad-42' WHERE user_id = ?").run(user.id));
    const header = () => page
      .locator('header', { has: page.getByRole('button', { name: 'Edit details' }) })
      .getByRole('heading', { level: 2 });
    const form = () => page.locator('form').filter({ has: page.locator('#application-job-title') });
    const adLink = () => page.getByRole('link', { name: 'Open the ad' });
    const sidebarEntry = (name: RegExp) => page.getByRole('button', { name }).first();

    await page.goto('/dashboard');
    await sidebarEntry(/Northwind Foods/).click();
    await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });

    // The ad link: the stored address, a new tab, no opener.
    await expect(adLink()).toHaveAttribute('href', 'https://jobs.example.test/ad-42');
    await expect(adLink()).toHaveAttribute('target', '_blank');
    await expect(adLink()).toHaveAttribute('rel', /noopener/);
    await expect(adLink()).toHaveAttribute('rel', /noreferrer/);

    const before = storedApplication(user.id)!;

    // Cancel and Escape save nothing; Save with no change doesn't bump the revision.
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-job-title').fill('Throwaway title');
    await form().getByRole('button', { name: 'Cancel' }).click();
    await expect(form()).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit details' })).toBeFocused();
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-company').fill('Throwaway company');
    await page.keyboard.press('Escape');
    await expect(form()).toHaveCount(0);
    await page.getByRole('button', { name: 'Edit details' }).click();
    await form().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form()).toHaveCount(0);
    await page.waitForTimeout(500);
    const unchanged = storedApplication(user.id)!;
    expect(unchanged.job_title).toBe(before.job_title);
    expect(unchanged.company).toBe(before.company);
    expect(unchanged.revision).toBe(before.revision);

    // A non-web address is refused in the form and never reaches the row.
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-job-url').fill('javascript:alert(1)');
    await form().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form().getByRole('alert')).toContainText('http');
    await page.waitForTimeout(500);
    expect((storedApplication(user.id) as unknown as Record<string, unknown>).job_url).toBe('https://jobs.example.test/ad-42');

    // A real edit: all three fields, saved to D1, and the sidebar and tracker follow.
    await page.locator('#application-job-title').fill('Head of Strategy');
    await page.locator('#application-company').fill('Contoso Labs');
    await page.locator('#application-job-url').fill('https://careers.contoso.test/jobs/77');
    await form().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form()).toHaveCount(0);
    await expect(header()).toHaveText('Contoso Labs, Head of Strategy');
    await expect(adLink()).toHaveAttribute('href', 'https://careers.contoso.test/jobs/77');
    const saved = await waitForStored(
      user.id,
      (row) => row.job_title === 'Head of Strategy' && row.company === 'Contoso Labs',
      'the edited title and company are stored',
    );
    expect(saved.revision).toBeGreaterThan(before.revision);
    expect((saved as unknown as Record<string, unknown>).job_url).toBe('https://careers.contoso.test/jobs/77');
    await expect(sidebarEntry(/Contoso Labs/)).toContainText('Head of Strategy');

    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Application Tracker' }).click();
    await expect(canvas(page).getByText('Contoso Labs')).toBeVisible();
    await expect(canvas(page).getByText('Head of Strategy')).toBeVisible();

    // Still there after a reload, from the server.
    await page.goto('/dashboard');
    await sidebarEntry(/Contoso Labs/).click();
    await expect(header()).toHaveText('Contoso Labs, Head of Strategy');
    await expect(adLink()).toHaveAttribute('href', 'https://careers.contoso.test/jobs/77');

    // Clearing the link removes it from the row and the header.
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-job-url').fill('');
    await form().getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form()).toHaveCount(0);
    await expect(adLink()).toHaveCount(0);
    await expect.poll(() => (storedApplication(user.id) as unknown as Record<string, unknown>).job_url, { timeout: 15_000 }).toBeNull();
    expect(storedApplication(user.id)!.company).toBe('Contoso Labs');
  } finally {
    await context.close();
  }
});

test('(s7) a title-only edit leaves a link that was added elsewhere while the form was open, and sends no link at all', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const { user, context, page } = await feedUser(browser, request, 'surfacestale');
  try {
    // An application with no link, as a pasted ad leaves it.
    withDb((db) => db.prepare('UPDATE application_sessions SET job_url = NULL WHERE user_id = ?').run(user.id));
    const saves: string[] = [];
    page.on('request', (req) => {
      const body = req.postData() ?? '';
      if (req.method() === 'POST' && req.headers()['next-action'] && body.includes('Title Only Change')) saves.push(body);
    });

    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
    const before = storedApplication(user.id)!;
    expect((before as unknown as Record<string, unknown>).job_url).toBeNull();

    await page.getByRole('button', { name: 'Edit details' }).click();
    await expect(page.locator('#application-job-url')).toHaveValue('');

    // Another writer (the MCP tool, another tab) adds the link while the form is open, and the page learns of it.
    withDb((db) => db.prepare("UPDATE application_sessions SET job_url = 'https://other.example.test/added-elsewhere', revision = revision + 1 WHERE user_id = ?").run(user.id));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(3_000);

    // The user changes the title only and saves: the form must not write its stale, empty link over the new one.
    await page.locator('#application-job-title').fill('Title Only Change');
    await page.locator('form').filter({ has: page.locator('#application-job-title') }).getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => storedApplication(user.id)?.job_title, { timeout: 20_000 }).toBe('Title Only Change');
    expect((storedApplication(user.id) as unknown as Record<string, unknown>).job_url).toBe('https://other.example.test/added-elsewhere');
    await expect(page.getByRole('link', { name: 'Open the ad' })).toHaveAttribute('href', 'https://other.example.test/added-elsewhere');
    // Not even a null: the request carried the title and nothing else of the form.
    expect(saves.length).toBeGreaterThan(0);
    for (const body of saves) expect(body).not.toContain('job_url');
  } finally {
    await context.close();
  }
});

test('(s8) a save that fails once keeps the form open and the draft out of the store, a retry saves it, and a cancelled edit sends nothing', async ({ browser, request }) => {
  test.setTimeout(180_000);
  const { user, context, page } = await feedUser(browser, request, 'surfacefail');
  try {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
    const before = storedApplication(user.id)!;
    const original = `${before.company}, ${before.job_title}`;
    const header = page
      .locator('header', { has: page.getByRole('button', { name: 'Edit details' }) })
      .getByRole('heading', { level: 2 });
    await expect(header).toHaveText(original);

    // The first save that carries the edited title fails on the server; every later one goes through.
    let failed = 0;
    await page.route('**/dashboard**', (route) => {
      const carriesTitle = route.request().method() === 'POST' && route.request().headers()['next-action']
        && (route.request().postData() ?? '').includes('Retried Title');
      if (carriesTitle && failed === 0) {
        failed += 1;
        return route.fulfill({ status: 500, contentType: 'text/plain', body: 'Internal Server Error' });
      }
      return route.continue();
    });
    const form = page.locator('form').filter({ has: page.locator('#application-job-title') });
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-job-title').fill('Retried Title');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form.getByRole('alert')).toContainText("didn't save");
    await expect(page.locator('#application-job-title')).toHaveValue('Retried Title');
    expect(failed).toBe(1);

    // The failed draft is not in the store, so the autosync (two seconds after a change) has nothing to save: wait
    // longer than that with the form still open, and the row has not moved.
    await page.waitForTimeout(4_000);
    const afterFailure = storedApplication(user.id)!;
    expect(afterFailure.job_title).toBe(before.job_title);
    expect(afterFailure.revision).toBe(before.revision);
    expect(failed).toBe(1);

    // The same form saves it on a retry.
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect.poll(() => storedApplication(user.id)?.job_title, { timeout: 20_000 }).toBe('Retried Title');
    await expect(header).toHaveText(`${before.company}, Retried Title`);

    // A cancelled edit sends nothing and changes nothing.
    const saved = storedApplication(user.id)!;
    let cancelledSent = 0;
    page.on('request', (req) => {
      if (req.method() === 'POST' && req.headers()['next-action'] && (req.postData() ?? '').includes('Cancelled Title')) cancelledSent += 1;
    });
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.locator('#application-job-title').fill('Cancelled Title');
    await form.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(4_000);
    expect(cancelledSent).toBe(0);
    expect(storedApplication(user.id)!.revision).toBe(saved.revision);
    await expect(header).toHaveText(`${before.company}, Retried Title`);
  } finally {
    await context.close();
  }
});

test('(s9) a conflicting save shows what the server holds now, and the next Save is the user\'s deliberate overwrite', async ({ browser, request }) => {
  test.setTimeout(150_000);
  const { user, context, page } = await feedUser(browser, request, 'surfaceconflict');
  try {
    await page.goto('/dashboard');
    await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
    await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
    const form = page.locator('form').filter({ has: page.locator('#application-job-title') });

    await page.getByRole('button', { name: 'Edit details' }).click();
    // Another writer changes the same field while the form is open, and the page learns of it.
    withDb((db) => db.prepare("UPDATE application_sessions SET job_title = 'Title From Elsewhere', revision = revision + 1 WHERE user_id = ?").run(user.id));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(3_000);

    await page.locator('#application-job-title').fill('My Own Title');
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    // The server's value stays, the form says what it is, and the draft stays in the input.
    await expect(form.getByRole('alert')).toContainText('Job title is now "Title From Elsewhere"');
    await expect(page.locator('#application-job-title')).toHaveValue('My Own Title');
    await page.waitForTimeout(500);
    expect(storedApplication(user.id)!.job_title).toBe('Title From Elsewhere');

    // Not a dead end: the user has seen the other value, so the next Save replaces it.
    await form.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(form).toHaveCount(0);
    await expect.poll(() => storedApplication(user.id)?.job_title, { timeout: 20_000 }).toBe('My Own Title');
  } finally {
    await context.close();
  }
});
