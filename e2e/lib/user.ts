import type { APIRequestContext, BrowserContext } from '@playwright/test';
import { BASE_URL, TEST_PASSWORD } from './env';
import { PRIMARY_CV } from './model-script';
import { openLocalD1 } from './sqlite';

/** The parsed form of PRIMARY_CV, as /api/parse-cv would have stored it. The canvas needs it to render and edit. */
function primaryCvStructured(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    version: 1,
    createdAt: now,
    updatedAt: now,
    sourceFileName: 'tomas-brandt.txt',
    sourceFormat: 'txt',
    settings: { region: 'US', includePhoto: false, pageSize: 'letter', maxPages: 1, language: 'en' },
    personal: { fullName: 'Tomas Brandt', email: 'tomas.brandt@example.com', phone: '', city: 'Chicago', currentTitle: 'Financial Analyst' },
    experience: [{
      id: 'exp-1',
      company: 'Calder Industrial Components',
      position: 'Financial Analyst',
      startDate: { raw: 'Mar 2022', year: 2022, month: 3, confidence: 'high' },
      current: true,
      bullets: [
        'Own the monthly forecast and variance reporting for two business units',
        'Improved forecast accuracy for the larger unit from 88% to 96%',
      ],
    }],
    education: [],
    skills: [],
    certifications: [],
    languages: [],
  };
}

export interface TestUser {
  id: string;
  email: string;
  /** A private address sent as `cf-connecting-ip`, so each test user has its own rate-limit buckets. */
  ip: string;
}

let ipCounter = 0;
function nextTestIp(): string {
  ipCounter += 1;
  const stamp = Date.now() % 60_000;
  return `10.${Math.floor(stamp / 250) % 250}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

/**
 * A verified user with a stored primary CV, created through the product's own
 * sign-up endpoint. The verification email would go to a mailbox nobody reads,
 * so the verified flag is set directly in the local sqlite file.
 *
 * The requests carry no Origin header, which Better Auth's origin check only
 * enforces for browser-style requests.
 */
export async function createTestUser(request: APIRequestContext, label: string): Promise<TestUser> {
  const email = `di-${label}-${Date.now().toString(36)}@test.local`;
  const ip = nextTestIp();
  const signUp = await request.post(`${BASE_URL}/api/auth/sign-up/email`, {
    data: { email, password: TEST_PASSWORD, name: `DI ${label}` },
    headers: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
  });
  if (!signUp.ok()) throw new Error(`sign-up failed: ${signUp.status()} ${await signUp.text()}`);
  const { user } = (await signUp.json()) as { user: { id: string } };

  const db = openLocalD1();
  try {
    db.prepare('UPDATE user SET email_verified = 1 WHERE id = ?').run(user.id);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO documents (id, user_id, type, file_name, file_type, raw_text, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
      VALUES (?, ?, 'primary_cv', 'tomas-brandt.txt', 'txt', ?, '{}', '[]', '[]', '[]', ?, ?, ?)
    `).run(crypto.randomUUID(), user.id, PRIMARY_CV, JSON.stringify(primaryCvStructured()), now, now);
  } finally {
    db.close();
  }
  return { id: user.id, email, ip };
}

/** Sign in over the API and hand the session cookie to a browser context. */
export async function signInContext(context: BrowserContext, request: APIRequestContext, user: TestUser): Promise<void> {
  const response = await request.post(`${BASE_URL}/api/auth/sign-in/email`, {
    data: { email: user.email, password: TEST_PASSWORD },
    headers: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
  });
  if (!response.ok()) throw new Error(`sign-in failed: ${response.status()} ${await response.text()}`);
  const state = await request.storageState();
  await context.addCookies(state.cookies);
}

export function creditsOf(userId: string): { monthly: number; rollover: number; addon: number; total: number; version: number } {
  const db = openLocalD1();
  try {
    const row = db.prepare('SELECT monthly_credits AS m, rollover_credits AS r, addon_credits AS a, version FROM user_credits WHERE user_id = ?').get(userId) as
      { m: number; r: number; a: number; version: number } | undefined;
    if (!row) throw new Error(`no credits row for ${userId}`);
    return { monthly: row.m, rollover: row.r, addon: row.a, total: row.m + row.r + row.a, version: row.version };
  } finally {
    db.close();
  }
}
