import { request as playwrightRequest, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { BASE_URL, TEST_PASSWORD } from './env';
import { openLocalD1 } from './sqlite';
import { createTestUser, nextTestIp, type TestUser } from './user';

/**
 * Helpers for e2e/visual/screens.spec.ts. A screenshot compared with maxDiffPixels 0 has to come out the same on
 * any day, in any run, so everything a screen prints that would differ is pinned here:
 *
 *  - the browser clock's start (`FROZEN_NOW`; it runs from there), time zone and locale;
 *  - the user's name and email, and every timestamp of their rows, rewritten in the local D1 to fixed instants
 *    (`pinUser`), keeping their order;
 *  - the job feed: the server drops runs and jobs older than seven days of real time, so the seeded rows carry a
 *    recent real timestamp, and the browser sees the feed API answer it with a fixed one (`seedFeedInbox`,
 *    `rewriteTimes`);
 *  - requests to any host but the preview are aborted, so nothing third party paints, and the landing's demo reel
 *    iframe gets a blank page.
 */

export const FROZEN_NOW = new Date('2026-10-24T09:00:00Z');
/**
 * Rows are pinned two and a half hours before the clock's start: relative times read "2 hours ago" for the whole
 * run, and nothing sits on the edge of the product's 30-minute windows (a fresh fit, a recent edit).
 */
const PINNED_FROM = Date.parse('2026-10-24T06:30:00.000Z');
const PINNED_DAY = '2026-10-24';

export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
] as const;
export type Viewport = (typeof VIEWPORTS)[number];

function withDb<T>(fn: (db: ReturnType<typeof openLocalD1>) => T): T {
  const db = openLocalD1();
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** The same kind of value (ISO text, epoch seconds or epoch ms) as `old`, at `ms`. Null for anything else. */
function sameKind(old: unknown, ms: number): string | number | null {
  if (typeof old === 'number') return old > 1e12 ? ms : Math.floor(ms / 1000);
  if (typeof old === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(old)) return new Date(ms).toISOString();
  return null;
}

function toMs(value: unknown): number {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  return Date.parse(String(value));
}

/** "October 24, 2026", the way the cover letter writes its date line in English. */
function letterDate(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

/** Ways a day could be written other than ISO and the letter's date line: short and long, US and UK, numeric. */
function otherRenderings(day: string): string[] {
  const date = new Date(`${day}T00:00:00Z`);
  const as = (locale: string, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
  return [
    as('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    as('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }),
    as('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }),
    as('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    as('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    as('de-DE', { year: 'numeric', month: '2-digit', day: '2-digit' }),
  ];
}

/** Tables a screen reads timestamps from, and the column that names the user. */
const USER_TABLES: Array<[table: string, userColumn: string]> = [
  ['user', 'id'],
  ['profiles', 'id'],
  ['documents', 'user_id'],
  ['application_sessions', 'user_id'],
  ['chat_messages', 'user_id'],
  ['credit_transactions', 'user_id'],
];
/** Text columns that hold JSON or prose with dates inside (the letter's date line, `updatedAt` fields). */
const TEXT_TABLES: Array<[table: string, userColumn: string]> = [
  ['application_sessions', 'user_id'],
  ['chat_messages', 'user_id'],
  ['documents', 'user_id'],
];

/**
 * Give a user a fixed name and email, and move every timestamp of their rows to fixed instants from 06:30:00
 * on the frozen day, one second apart in their original order. Dates written into the kit (the letter's date
 * line, `updatedAt` fields) move to the frozen day too. Only the local D1 is touched.
 */
export function pinUser(user: TestUser, handle: string, moreRealDays: string[] = []): TestUser {
  const email = `visual-${handle}@test.local`;
  const realDays = [...new Set([new Date().toISOString().slice(0, 10), ...moreRealDays])].filter((day) => day !== PINNED_DAY);
  withDb((db) => {
    // A rerun on the same local D1 finds the address taken by the last run's user.
    db.prepare("UPDATE user SET email = email || '.' || id WHERE email = ?").run(email);
    db.prepare("UPDATE profiles SET email = email || '.' || id WHERE email = ?").run(email);
    db.prepare('UPDATE user SET email = ?, name = ? WHERE id = ?').run(email, 'Tomas Brandt', user.id);
    db.prepare('UPDATE profiles SET email = ?, full_name = ? WHERE id = ?').run(email, 'Tomas Brandt', user.id);

    for (const [table, userColumn] of USER_TABLES) {
      const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
        .map((column) => column.name)
        .filter((name) => /_at$/.test(name) && !/expires|lease/.test(name));
      if (columns.length === 0) continue;
      const rows = db.prepare(`SELECT rowid AS rid, ${columns.join(', ')} FROM ${table} WHERE ${userColumn} = ?`).all(user.id) as Array<Record<string, unknown>>;
      const instants = [...new Set(rows.flatMap((row) => columns.map((c) => row[c]).filter((v) => sameKind(v, 0) !== null).map(toMs)))]
        .sort((a, b) => a - b);
      const pinned = new Map(instants.map((ms, rank) => [ms, PINNED_FROM + rank * 1000]));
      const update = db.prepare(`UPDATE ${table} SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE rowid = ?`);
      for (const row of rows) {
        update.run(...columns.map((c) => {
          const value = row[c];
          const kind = sameKind(value, 0);
          return kind === null ? value : sameKind(value, pinned.get(toMs(value)) as number);
        }), row.rid);
      }
    }

    for (const [table, userColumn] of TEXT_TABLES) {
      const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string }>)
        .filter((column) => column.type === 'TEXT' && !/_at$|^id$|_id$/.test(column.name))
        .map((column) => column.name);
      const rows = db.prepare(`SELECT rowid AS rid, ${columns.join(', ')} FROM ${table} WHERE ${userColumn} = ?`).all(user.id) as Array<Record<string, unknown>>;
      for (const row of rows) {
        const changed: Record<string, string> = {};
        for (const column of columns) {
          const value = row[column];
          if (typeof value !== 'string') continue;
          // A real day in a format the two replacements don't know would print on screen and break later runs.
          const unknown = realDays.flatMap(otherRenderings).find((text) => value.includes(text));
          if (unknown) throw new Error(`${table}.${column} holds "${unknown}", a real date pinUser doesn't rewrite`);
          let next = value.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, new Date(PINNED_FROM).toISOString());
          for (const day of realDays) next = next.replaceAll(day, PINNED_DAY).replaceAll(letterDate(day), letterDate(PINNED_DAY));
          if (next !== value) changed[column] = next;
        }
        const names = Object.keys(changed);
        if (names.length > 0) {
          db.prepare(`UPDATE ${table} SET ${names.map((c) => `${c} = ?`).join(', ')} WHERE rowid = ?`).run(...names.map((c) => changed[c]), row.rid);
        }
      }
    }
  });
  return { ...user, email };
}

/**
 * The browser stores the chat a moment after it shows it. Wait until the user's saved chat holds a message matching
 * `last` and its count has held still for two seconds, so closing the browser loses nothing.
 */
export async function waitForSavedChat(userId: string, last: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let stableSince = 0;
  let previous = -1;
  while (Date.now() < deadline) {
    const { total, matched } = withDb((db) => db.prepare(
      'SELECT COUNT(*) AS total, SUM(CASE WHEN content LIKE ? THEN 1 ELSE 0 END) AS matched FROM chat_messages WHERE user_id = ?',
    ).get(`%${last}%`, userId) as { total: number; matched: number | null });
    if ((matched ?? 0) > 0 && total === previous) {
      if (Date.now() - stableSince >= 2_000) return;
    } else {
      stableSince = Date.now();
    }
    previous = total;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the saved chat of ${userId} never settled with "${last}"`);
}

/**
 * Copy a user's applications and their chat into another user, under new ids, so several users show the same kit
 * without running the kit flow again. Each screen group gets its own user because the job feed API allows 15
 * loads a minute per user, and every dashboard load spends one.
 */
export function cloneApplications(fromUserId: string, toUserId: string): void {
  withDb((db) => {
    const sessionColumns = (db.prepare('PRAGMA table_info(application_sessions)').all() as Array<{ name: string }>).map((c) => c.name);
    const messageColumns = (db.prepare('PRAGMA table_info(chat_messages)').all() as Array<{ name: string }>).map((c) => c.name);
    const sessions = db.prepare('SELECT * FROM application_sessions WHERE user_id = ? ORDER BY rowid').all(fromUserId) as Array<Record<string, unknown>>;
    for (const session of sessions) {
      const id = crypto.randomUUID();
      db.prepare(`INSERT INTO application_sessions (${sessionColumns.join(', ')}) VALUES (${sessionColumns.map(() => '?').join(', ')})`)
        .run(...sessionColumns.map((c) => (c === 'id' ? id : c === 'user_id' ? toUserId : session[c])));
      const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY rowid').all(session.id) as Array<Record<string, unknown>>;
      for (const message of messages) {
        db.prepare(`INSERT INTO chat_messages (${messageColumns.join(', ')}) VALUES (${messageColumns.map(() => '?').join(', ')})`)
          .run(...messageColumns.map((c) => (c === 'id' ? crypto.randomUUID() : c === 'session_id' ? id : c === 'user_id' ? toUserId : message[c])));
      }
    }
  });
}

/**
 * A verified user with the English primary CV, asked about availability, under a fixed name and email, with copies
 * of another user's applications when `applicationsFrom` names one.
 */
export async function visualUser(request: APIRequestContext, handle: string, options: { applicationsFrom?: string } = {}): Promise<TestUser> {
  const user = await createTestUser(request, `visual-${handle}`);
  withDb((db) => {
    db.prepare('UPDATE profiles SET availability_asked_at = ? WHERE id = ?').run(new Date().toISOString(), user.id);
  });
  if (options.applicationsFrom) cloneApplications(options.applicationsFrom, user.id);
  return pinUser(user, handle);
}

export type SessionCookies = Awaited<ReturnType<APIRequestContext['storageState']>>['cookies'];

/**
 * Sign a user in once and keep the session cookies, so each screenshot's fresh context reuses them instead of
 * signing in again (the sign-in endpoint is rate limited per address).
 */
export async function signIn(user: TestUser): Promise<SessionCookies> {
  const api = await playwrightRequest.newContext({ baseURL: BASE_URL });
  try {
    const response = await api.post('/api/auth/sign-in/email', {
      data: { email: user.email, password: TEST_PASSWORD },
      headers: { 'cf-connecting-ip': user.ip, 'x-forwarded-for': user.ip },
    });
    if (!response.ok()) throw new Error(`sign-in failed: ${response.status()} ${await response.text()}`);
    return (await api.storageState()).cookies;
  } finally {
    await api.dispose();
  }
}

/**
 * A real timestamp the browser sees as a fixed one: `real` goes into the D1 rows, and `rewriteTimes` swaps it for
 * `shown` in every API response.
 */
export interface TimeRewrite { real: string; shown: string }

/**
 * Feed settings with consent, a completed run and its ranked jobs, as the feed pipeline leaves them. The rows carry
 * a real time 30 hours back (inside the seven-day inbox window, past the run cooldown), shown as the day before
 * the frozen clock.
 */
export function seedFeedInbox(userId: string, jobs: Array<{ title: string; company: string; fitLabel: 'strong' | 'good'; salary: string; location: string }>): TimeRewrite[] {
  const realMs = Date.now() - 30 * 60 * 60 * 1000;
  const at = (offsetSeconds: number): TimeRewrite => ({
    real: new Date(realMs + offsetSeconds * 1000).toISOString(),
    shown: new Date(Date.parse('2026-10-23T09:00:00.000Z') + offsetSeconds * 1000).toISOString(),
  });
  const settingsAt = at(0);
  const startedAt = at(60);
  const completedAt = at(120);
  const runId = crypto.randomUUID();
  withDb((db) => {
    db.prepare(`
      INSERT OR REPLACE INTO job_feed_settings
        (user_id, enabled, consent_accepted_at, user_timezone, target_market, target_countries, target_cities, target_roles,
         preferred_locations, remote_preference, remote_preferences, salary_floor, languages, seniority_target, seniority_targets,
         employment_types, work_authorization_status, user_skills, excluded_terms, created_at, updated_at)
      VALUES (?, 1, ?, 'UTC', 'us_canada', '["us"]', '[]', '["Financial Analyst"]', '[]', 'flexible', '["remote","hybrid"]',
              NULL, '["en"]', NULL, '["senior"]', '["full_time"]', NULL, '[]', '[]', ?, ?)
    `).run(userId, settingsAt.real, settingsAt.real, settingsAt.real);
    db.prepare(`
      INSERT INTO job_feed_runs
        (id, user_id, local_date, local_timezone, trigger_source, status, idempotency_key, started_at, completed_at,
         raw_jobs_fetched, jobs_after_prefilter, ranked_jobs_count, metadata, created_at, updated_at)
      VALUES (?, ?, '2026-10-23', 'UTC', 'manual_user', 'completed', ?, ?, ?, 10, 5, ?, '{}', ?, ?)
    `).run(runId, userId, `visual-run-${runId}`, startedAt.real, completedAt.real, jobs.length, startedAt.real, completedAt.real);
    jobs.forEach((job, index) => {
      const id = crypto.randomUUID();
      db.prepare(`
        INSERT INTO job_feed_canonical_jobs
          (id, canonical_key, source_provider, source_job_id, title, title_normalized, company, company_normalized, location_text,
           location_normalized, work_mode, employment_type, salary_text, description, apply_url, source_url, posted_at_text,
           freshness_days, source_identifiers, first_seen_at, last_seen_at, times_seen, created_at, updated_at)
        VALUES (?, ?, 'serpapi', ?, ?, ?, ?, ?, ?, ?, 'remote', 'full_time', ?, ?, ?, ?, '1 day ago', 1, '[]', ?, ?, 1, ?, ?)
      `).run(
        id, `visual-${id}`, `visual-source-${id}`, job.title, job.title.toLowerCase(), job.company, job.company.toLowerCase(),
        job.location, job.location.toLowerCase(), job.salary,
        `${job.title} at ${job.company}. You own the rolling forecast and month-end reporting. Required: Forecasting.`,
        `https://jobs.example.test/${index + 1}`, `https://jobs.example.test/source/${index + 1}`,
        completedAt.real, completedAt.real, completedAt.real, completedAt.real,
      );
      db.prepare(`
        INSERT INTO job_feed_ranked_items
          (id, run_id, user_id, canonical_job_id, rank_position, fit_label, ranking_source, reason, deterministic_score, metadata, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'llm', ?, 80, '{}', ?)
      `).run(crypto.randomUUID(), runId, userId, id, index + 1, job.fitLabel, `Matches the forecasting work at ${job.company}.`, completedAt.real);
    });
  });
  return [settingsAt, startedAt, completedAt];
}

/** Swap each real timestamp for its shown one in every job feed API response the page receives. */
export async function rewriteTimes(context: BrowserContext, rewrites: TimeRewrite[]): Promise<void> {
  if (rewrites.length === 0) return;
  await context.route('**/api/job-feed/**', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    for (const { real, shown } of rewrites) body = body.replaceAll(real, shown);
    await route.fulfill({ response, body });
  });
}

/**
 * A browser context for one screenshot: the viewport, UTC, en-US, reduced motion, the frozen clock, nothing from
 * any host but the preview, and the user's session when there is one.
 */
export async function visualPage(
  browser: Browser,
  viewport: Viewport,
  options: { user?: { user: TestUser; cookies: SessionCookies }; rewrites?: TimeRewrite[]; theme?: 'light' | 'dark' } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  // A fresh address per context, so the per-address limits of one screenshot never reach the next.
  const ip = nextTestIp();
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    timezoneId: 'UTC',
    locale: 'en-US',
    colorScheme: 'light',
    reducedMotion: 'reduce',
    extraHTTPHeaders: { 'cf-connecting-ip': ip, 'x-forwarded-for': ip },
  });
  const origin = new URL(BASE_URL).origin;
  await context.route((url) => url.origin !== origin && (url.protocol === 'http:' || url.protocol === 'https:'), (route) => route.abort());
  // The landing's demo reel plays in an iframe (masked in the screenshot) and keeps loading media; it gets a blank page.
  await context.route('**/demo/useful-apply-reel**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>reel</title>' }));
  await rewriteTimes(context, options.rewrites ?? []);
  if (options.user) await context.addCookies(options.user.cookies);
  // Light is the setting's default (System on a light browser), so only dark sets the cookie the app reads.
  if (options.theme === 'dark') await context.addCookies([{ name: 'ua-theme', value: 'dark', url: BASE_URL }]);
  await context.clock.install({ time: FROZEN_NOW });
  const page = await context.newPage();
  return { context, page };
}

/**
 * Bring a long page to its final state. Scroll reveals (ScrollReveal, `data-inview`) show once they intersect the
 * viewport less its bottom 60px, which a reveal in the page's last 60px never does by scrolling, and whether it
 * shows anyway depends on when React hydrates. So the viewport is made as tall as the page until every reveal has
 * shown and every image has loaded (taller if the page grows with it), then set back for the screenshot.
 */
export async function settleLongPage(page: Page): Promise<void> {
  await page.waitForLoadState('load');
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('the page has no viewport size');
  const nextFrame = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  let hidden = -1;
  for (let round = 0; round < 3 && hidden !== 0; round++) {
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: viewport.width, height: height + 120 });
    for (const deadline = Date.now() + 10_000; Date.now() < deadline;) {
      await nextFrame();
      hidden = await page.locator('[data-inview="false"]').count();
      if (hidden === 0) break;
    }
  }
  if (hidden !== 0) throw new Error(`${hidden} scroll reveals stayed hidden with the whole page in view`);
  await page.evaluate(async () => {
    const loads = Promise.all([...document.images].map((img) => (img.complete ? Promise.resolve() : new Promise((resolve) => {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    }))));
    let timer = 0;
    const late = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(
        `images still loading after 15 s: ${[...document.images].filter((img) => !img.complete).map((img) => img.currentSrc || img.src).join(', ')}`,
      )), 15_000);
    });
    try {
      await Promise.race([loads, late]);
    } finally {
      clearTimeout(timer);
    }
    // decode() rejects for a broken image, which already renders as broken; that's the same every run.
    await Promise.all([...document.images].map((img) => img.decode().catch(() => undefined)));
    await document.fonts.ready;
  });
  await page.setViewportSize(viewport);
  await page.evaluate(() => window.scrollTo(0, 0));
  await nextFrame();
}
