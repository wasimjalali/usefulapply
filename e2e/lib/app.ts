import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { JOB_DESCRIPTION } from './model-script';
import { openLocalD1 } from './sqlite';
import { createTestUser, signInContext, type TestUser } from './user';

export interface StoredApplication {
  id: string;
  revision: number;
  job_title: string | null;
  job_description: string;
  company: string | null;
  generation_status: string;
  generated_cv: Record<string, unknown> | null;
  cover_letter: { body?: string } | null;
  email: { subject?: string; body?: string } | null;
  follow_up_email: { subject?: string; body?: string } | null;
  selected_template: string;
  status: string;
}

const JSON_COLUMNS = ['generated_cv', 'cover_letter', 'email', 'follow_up_email'] as const;

function parse(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

/** The newest application of a user, read straight from the local D1 file. */
export function storedApplication(userId: string, sessionId?: string): StoredApplication | null {
  const db = openLocalD1();
  try {
    const row = (sessionId
      ? db.prepare('SELECT * FROM application_sessions WHERE user_id = ? AND id = ?').get(userId, sessionId)
      : db.prepare('SELECT * FROM application_sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId)) as
      Record<string, unknown> | undefined;
    if (!row) return null;
    for (const column of JSON_COLUMNS) row[column] = row[column] == null ? null : parse(row[column]);
    return row as unknown as StoredApplication;
  } finally {
    db.close();
  }
}

export interface Signedin {
  user: TestUser;
  context: BrowserContext;
  page: Page;
}

/**
 * The web app asks a new applicant when they can start before the first kit (see LogisticsQuestions). Specs that
 * aren't about that question start from a user who was already asked, so their kit runs aren't parked on the card.
 * Pass `askedAvailability: false` for a user who meets it.
 */
export async function signedInPage(
  browser: Browser,
  request: APIRequestContext,
  label: string,
  options: { askedAvailability?: boolean; videoDir?: string } = {},
): Promise<Signedin> {
  const user = await createTestUser(request, label);
  if (options.askedAvailability !== false) {
    const db = openLocalD1();
    try {
      const { changes } = db.prepare('UPDATE profiles SET availability_asked_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
      if (changes !== 1) throw new Error(`no profile row to mark as asked for ${user.id}`);
    } finally {
      db.close();
    }
  }
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    // A context made here is not the fixture's, so the config's video setting never reaches it.
    ...(options.videoDir ? { recordVideo: { dir: options.videoDir, size: { width: 1440, height: 900 } } } : {}),
  });
  await signInContext(context, request, user);
  const page = await context.newPage();
  return { user, context, page };
}

/** A second tab on the same signed-in browser context. */
export async function sameUserPage(context: BrowserContext): Promise<Page> {
  return context.newPage();
}

/** Fit check, then the full kit, through the real UI. Resolves once the kit is on screen. */
export async function generateKitThroughUi(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.getByPlaceholder(/Paste the whole ad/).fill(JOB_DESCRIPTION);
  await page.getByRole('button', { name: /Check my fit/ }).click();
  await expect(page.getByText('Good Fit (68%)').first()).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: /Generate the full kit/ }).click();
  await expect(page.getByText(/Your kit for Northwind Foods is ready/)).toBeVisible({ timeout: 120_000 });
}

export async function openApplication(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.getByRole('button', { name: /Northwind Foods/ }).first().click();
  await expect(page.getByRole('tab', { name: 'CV' })).toBeVisible({ timeout: 30_000 });
}

/** Change the tailored CV's professional title. Fields in the canvas are click-to-edit: click, type, confirm, then save. */
export async function editCvTitle(page: Page, title: string): Promise<void> {
  await page.getByRole('tab', { name: 'CV' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByText('Professional Title', { exact: true }).locator('xpath=..').click();
  await page.locator('input[type="text"]').first().fill(title);
  await page.locator('button[title="Save"]').first().click();
  await page.getByRole('button', { name: /Save changes/ }).click();
}

export async function editCoverLetter(page: Page, body: string): Promise<void> {
  await page.getByRole('tab', { name: 'Cover letter' }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByPlaceholder('Cover letter content...').fill(body);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
}

/** Poll a stored-application predicate, because the browser saves after its own short delay. */
export async function waitForStored(
  userId: string,
  predicate: (row: StoredApplication) => boolean,
  description: string,
  timeoutMs = 20_000,
): Promise<StoredApplication> {
  const deadline = Date.now() + timeoutMs;
  let last: StoredApplication | null = null;
  while (Date.now() < deadline) {
    last = storedApplication(userId);
    if (last && predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for stored application: ${description}. Last: ${JSON.stringify(last && { revision: last.revision })}`);
}
