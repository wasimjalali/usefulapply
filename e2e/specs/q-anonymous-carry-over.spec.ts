import { readFile } from 'node:fs/promises';
import { expect, test, type Browser, type BrowserContext, type Download, type Page } from '@playwright/test';
import { generateKitThroughUi, signedInPage } from '../lib/app';
import { BASE_URL, TEST_PASSWORD } from '../lib/env';
import { accountWallHref } from '../../src/components/kit/account-wall';
import { JOB_DESCRIPTION, PRIMARY_CV } from '../lib/model-script';
import { openLocalD1 } from '../lib/sqlite';
import { createTestUser, nextTestIp } from '../lib/user';

/**
 * Anonymous work carried into an account, and downloads right after.
 *
 * An anonymous visitor gets one free fit check and no kit, so the real road to a download is the guided line:
 * upload, fit, "Generate the full kit", the sign-up card, then the kit and its files. The CV and the fit check
 * come along only into the account that authenticated in that browser from a sign-up card or an account wall
 * (the carry-over marker, src/lib/anonymous-generation.ts). A plain log-in clears the marker first, so a marker
 * someone left behind can't hand their CV to the next person who signs in.
 *
 * PDFs need Browser Run, which does not run locally (the route answers 503); Word files render, so they are the
 * real file each download case checks.
 */

const RETRY_ERROR = "The PDF didn't build. Try again in a moment.";

interface Ledger { amount: number; transaction_type: string; transaction_kind: string }

function userIdByEmail(email: string): string {
  const db = openLocalD1();
  try {
    const row = db.prepare('SELECT id FROM user WHERE email = ?').get(email) as { id: string } | undefined;
    if (!row) throw new Error(`no user ${email}`);
    return row.id;
  } finally {
    db.close();
  }
}

function query<T>(sql: string, ...args: unknown[]): T[] {
  const db = openLocalD1();
  try {
    return db.prepare(sql).all(...args) as T[];
  } finally {
    db.close();
  }
}

async function anonymousContext(browser: Browser, videoDir?: string): Promise<{ context: BrowserContext; page: Page }> {
  // One free fit check per IP, so each anonymous visitor gets an address of their own.
  const ip = nextTestIp();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
    // A context made here is not the fixture's, so the config's video setting never reaches it.
    ...(videoDir ? { recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } } } : {}),
  });
  return { context, page: await context.newPage() };
}

/** Paste the CV and run the free fit check, signed out. */
async function anonymousCvAndFit(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'No file handy? Paste the text instead' }).click();
  await page.getByPlaceholder(/Paste your full CV/).fill(PRIMARY_CV);
  await page.getByRole('button', { name: 'Use this text' }).click();
  // While the CV is read the line asks for the ad and runs the fit once reading ends; if reading ended first,
  // the job step asks for the click instead.
  await page.getByPlaceholder(/Paste the whole ad/).first().fill(JOB_DESCRIPTION);
  await expect(async () => {
    const check = page.getByRole('button', { name: /Check my fit/ });
    if (await check.isVisible() && await check.isEnabled()) await check.click();
    await expect(page.getByText('Good Fit (68%)').first()).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 60_000 });
}

async function bytesOf(download: Download): Promise<Buffer> {
  const path = await download.path();
  if (!path) throw new Error('download has no file');
  return readFile(path);
}

async function primaryCvOf(userId: string): Promise<string | null> {
  const rows = query<{ raw_text: string }>("SELECT raw_text FROM documents WHERE user_id = ? AND type = 'primary_cv'", userId);
  return rows[0]?.raw_text ?? null;
}

async function logInOnPage(page: Page, path: string, email: string): Promise<void> {
  await page.goto(path);
  await page.getByLabel('Email').fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /^Log in$/ }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

test('(q1) anonymous CV and fit, then sign-up from the guided line: the kit is built on the carried CV and downloads deliver', async ({ browser }, testInfo) => {
  const { context, page } = await anonymousContext(browser, testInfo.outputPath('video'));
  await anonymousCvAndFit(page);

  // The kit needs an account: the guided line's sign-up card.
  await page.getByRole('button', { name: /Generate the full kit/ }).click();
  await expect(page.getByRole('heading', { name: 'Create your free account to get the kit' })).toBeVisible();
  await expect(page.getByText('Your CV and this fit check come with you.')).toBeVisible();
  const email = `di-carry-${Date.now().toString(36)}@test.local`;
  await page.getByPlaceholder('Email').fill(email);
  await page.getByPlaceholder('Password').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create account and generate the kit' }).click();
  await expect(page.getByRole('heading', { name: 'Check your inbox' })).toBeVisible({ timeout: 30_000 });

  // The confirmation link goes to a mailbox nobody reads here: confirm in D1, as the link would. The start-date
  // question a new applicant meets first is covered by its own spec, so this one starts past it.
  const userId = userIdByEmail(email);
  const db = openLocalD1();
  try {
    db.prepare('UPDATE user SET email_verified = 1 WHERE id = ?').run(userId);
    db.prepare('UPDATE profiles SET availability_asked_at = ? WHERE id = ?').run(new Date().toISOString(), userId);
  } finally {
    db.close();
  }
  expect(await primaryCvOf(userId), 'nothing is attached before the account authenticates').toBeNull();

  // The confirmation link signs the account in with no form (autoSignInAfterVerification). The same happens here:
  // a session arrives in this browser and nothing touches the marker the sign-up card set, so the carry-over
  // rests on that marker alone. Then the user lands back on the dashboard and the kit picks up where it stopped.
  const signIn = await context.request.post(`${BASE_URL}/api/auth/sign-in/email`, { data: { email, password: TEST_PASSWORD } });
  expect(signIn.ok(), await signIn.text()).toBe(true);
  await page.goto('/dashboard');
  await expect(page.getByText(/Your kit for Northwind Foods is ready/)).toBeVisible({ timeout: 120_000 });

  // The carried CV became the account's primary CV, and the kit is one stored application.
  await expect.poll(() => primaryCvOf(userId), { timeout: 15_000 }).toContain('Calder Industrial Components');
  await expect.poll(() => query<{ id: string }>('SELECT id FROM application_sessions WHERE user_id = ?', userId).length, { timeout: 15_000 }).toBe(1);
  const [application] = query<{ cover_letter: string | null; email: string | null; generated_cv: string | null }>(
    'SELECT cover_letter, email, generated_cv FROM application_sessions WHERE user_id = ?', userId,
  );
  expect(application.generated_cv && application.cover_letter && application.email, 'every kit document is stored').toBeTruthy();

  // The free fit was never charged: the only spend is the kit itself.
  const debits = query<Ledger>('SELECT amount, transaction_type, transaction_kind FROM credit_transactions WHERE user_id = ? AND amount < 0', userId);
  expect(debits, JSON.stringify(debits)).toHaveLength(1);
  expect(debits[0].transaction_type, 'one charge, for the kit').toMatch(/^full_application/);

  // Downloads work at once: the Word file renders on the server; the PDF meets the local Browser Run failure.
  await page.getByRole('tab', { name: 'CV', exact: true }).click();
  const word = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Word' }).click();
  const docx = await word;
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);
  expect((await bytesOf(docx)).subarray(0, 2).toString(), 'a DOCX is a zip').toBe('PK');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  await expect(page.getByRole('alert').filter({ hasText: RETRY_ERROR })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('carried-kit-downloads.png') });
  await context.close();
});

test('(q2) a signed-in user starting a new application downloads their base CV, with no application behind it', async ({ browser, request }) => {
  const { context, page } = await signedInPage(browser, request, 'basecv');
  await generateKitThroughUi(page);
  await page.getByRole('button', { name: 'New Application' }).click();
  await page.getByRole('tab', { name: 'CV', exact: true }).click();

  const exportBody = page.waitForRequest((req) => req.url().endsWith('/api/exports') && req.method() === 'POST');
  const word = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Word' }).click();
  expect((await exportBody).postDataJSON().applicationId, 'the base CV goes out with no application').toBeUndefined();
  const docx = await word;
  expect(docx.suggestedFilename()).toMatch(/_CV\.docx$/);
  expect((await bytesOf(docx)).subarray(0, 2).toString()).toBe('PK');
  await context.close();
});

test('(q3) a plain log-in never takes the anonymous CV, even with a marker left behind', async ({ browser, request }) => {
  const other = await createTestUser(request, 'other', { primaryCv: false });
  const { context, page } = await anonymousContext(browser);
  await anonymousCvAndFit(page);
  // Someone clicked an account wall here and walked away: the marker is still set.
  await page.evaluate(() => localStorage.setItem('usefulapply_carry_anonymous', String(Date.now())));

  await logInOnPage(page, '/auth/login', other.email);
  await expect(page.getByRole('heading', { name: 'Start with your CV' })).toBeVisible({ timeout: 30_000 });
  // Give the sync time it would need to migrate a CV, then check nothing arrived.
  await page.waitForTimeout(5000);
  expect(await primaryCvOf(other.id), 'the anonymous CV is not attached to this account').toBeNull();
  expect(query('SELECT id FROM application_sessions WHERE user_id = ?', other.id)).toHaveLength(0);
  await context.close();
});

test('(q4) a log-in opened from an account wall (keep=1) carries the CV into that account', async ({ browser, request }) => {
  const owner = await createTestUser(request, 'owner', { primaryCv: false });
  const { context, page } = await anonymousContext(browser);
  await anonymousCvAndFit(page);

  // The exact link the download wall and the chat's account wall open.
  await logInOnPage(page, accountWallHref('login'), owner.email);
  await expect.poll(() => primaryCvOf(owner.id), { timeout: 20_000 }).toContain('Calder Industrial Components');
  // The fit check came along too: the line is back on its verdict.
  await expect(page.getByText('Good Fit (68%)').first()).toBeVisible({ timeout: 20_000 });
  await context.close();
});

test('(q5) an anonymous tab left open hands nothing to someone who logs in from another tab', async ({ browser, request }) => {
  const other = await createTestUser(request, 'tab', { primaryCv: false });
  const { context, page: anonymousTab } = await anonymousContext(browser);
  await anonymousCvAndFit(anonymousTab);

  // The risky order, forced: the anonymous tab learns of the new session only after the other tab has written the
  // shared auth id, so that id can't tell this tab apart from the account's own. (Left to itself, the anonymous
  // tab usually refetches first and clears for the plain reason that no id was stored yet.)
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await anonymousTab.route('**/api/auth/get-session**', async (route) => {
    await gate;
    await route.continue();
  });

  // Someone else logs in, plainly, in a second tab of the same browser.
  const loginTab = await context.newPage();
  await logInOnPage(loginTab, '/auth/login', other.email);
  // The tab may still be navigating to /dashboard, so a read that lands mid-navigation just counts as not yet.
  await expect.poll(() => loginTab.evaluate(() => localStorage.getItem('usefulapply-auth-user-id')).catch(() => null)).toBe(other.id);
  release();

  // The first tab comes back into focus: Better Auth refetches the session there and finds the new user. That tab
  // was anonymous and consumed no marker, so its CV and fit check go, not into this account.
  await anonymousTab.bringToFront();
  await anonymousTab.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
  });
  await expect(anonymousTab.getByRole('heading', { name: 'Start with your CV' })).toBeVisible({ timeout: 30_000 });
  await anonymousTab.waitForTimeout(5000);
  expect(await primaryCvOf(other.id), 'the CV left open in the other tab is not attached').toBeNull();
  expect(query('SELECT id FROM application_sessions WHERE user_id = ?', other.id)).toHaveLength(0);
  await context.close();
});
