/**
 * Feed data end to end (spec n-feed-data): what a real run stores, read back through the MCP tools.
 *
 *   npx tsx e2e/tools/feed-data.ts [outFile]
 *
 * Real code, real local D1 (a fresh migrated one in a temp dir): the whole run workflow of a Max user through
 * runJobFeedFoundationWorkflow, then the get_job_feed tool's own handler (the code the MCP route runs, minus the
 * transport). Nothing leaves the machine:
 *   - SerpAPI: `fetch` is wrapped and each search answered from the stub below, with ads shaped like the ones seen
 *     on 2026-10-25: a 122-character snippet, a flat block with its lists glued together, a copy cut off with an
 *     ellipsis, long apply links, and twenty well-formed ads to fill a page.
 *   - The employer pages those ads link to: answered by the same wrapper, with JobPosting JSON-LD the way boards
 *     publish it (HTML lists and headings, sometimes entity-encoded), one behind a redirect and one refusing (403).
 *   - The model is the scripted Anthropic fake on FAKE_ANTHROPIC_PORT.
 *
 * Prints `__RESULT__{...report}`; exits non-zero if any scenario failed.
 */

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fakeReset } from '../lib/fake-control';
import { PRIMARY_CV } from '../lib/model-script';
import { freshStateDir, openPlatform, pointModelAtFake } from '../lib/platform';

pointModelAtFake();
process.env.SERPAPI_API_KEY = 'e2e-stub-serpapi-key';

interface Scenario {
  name: string;
  passed: boolean;
  observed: Record<string, unknown>;
  error?: string;
}

const report: { startedAt: string; scenarios: Scenario[] } = { startedAt: new Date().toISOString(), scenarios: [] };

// ---------------------------------------------------------------------------
// Fixtures: the ads and the pages behind them
// ---------------------------------------------------------------------------

/** A 122-character snippet, the way Compound Law's ad arrived. */
const SNIPPET = 'Compound Law is hiring an Applied AI Engineer to build legal AI systems with our lawyers. Join a small team in Berlin now.';

/** The ad behind the snippet, as the employer's page publishes it in JSON-LD. */
const COMPOUND_HTML = [
  '<p>Compound Law builds AI systems that draft and review contracts with our lawyers.</p>',
  '<h3>Your tasks</h3>',
  '<ul><li>Build retrieval and drafting pipelines on Claude and open models</li><li>Ship evaluation suites for every legal workflow</li><li>Work directly with the partners on new products</li></ul>',
  '<p><strong>Requirements</strong></p>',
  '<ul><li>Minimum 2 years of professional experience in software engineering</li><li>Experience with TypeScript and Python in production</li><li>Fluent English; German is a plus</li></ul>',
  '<p>We offer equity, 30 days of holiday and a hybrid setup with two office days in Berlin-Mitte.</p>',
  '<p>' + 'Our team ships legal tools that hundreds of lawyers use every day, and we care about careful engineering. '.repeat(8) + '</p>',
].join('');

/** Hays' ad as Google returned it: list items glued together, no line breaks. */
const GLUED = 'Entwicklung und Implementierung individueller KI-Lösungen sowie deren Integration in bestehende IT-SystemlandschaftenImplementierung, Konfiguration und Betrieb moderner AI-Services auf führenden Cloud-PlattformenKonzeption und Implementierung von Agentic-AI-Lösungen zur Automatisierung von Geschäftsprozessen Erfolgreich abgeschlossenes Studium der Informatik oder eine vergleichbare QualifikationKenntnisse in DevOps-Praktiken sowie CI/CD-PipelinesSehr gute Deutsch- und Englischkenntnisse in Wort und Schrift '.repeat(2);

/** The same ad on the board's page: entity-encoded HTML inside the JSON-LD, as some boards publish it. */
const HAYS_HTML_ENCODED = [
  '&lt;h2&gt;Ihre Aufgaben&lt;/h2&gt;',
  '&lt;ul&gt;&lt;li&gt;Entwicklung und Implementierung individueller KI-Lösungen sowie deren Integration in bestehende IT-Systemlandschaften&lt;/li&gt;',
  '&lt;li&gt;Implementierung, Konfiguration und Betrieb moderner AI-Services auf führenden Cloud-Plattformen&lt;/li&gt;',
  '&lt;li&gt;Konzeption und Implementierung von Agentic-AI-Lösungen zur Automatisierung von Geschäftsprozessen&lt;/li&gt;&lt;/ul&gt;',
  '&lt;h2&gt;Ihre Qualifikationen&lt;/h2&gt;',
  '&lt;ul&gt;&lt;li&gt;Erfolgreich abgeschlossenes Studium der Informatik oder eine vergleichbare Qualifikation&lt;/li&gt;',
  '&lt;li&gt;Kenntnisse in DevOps-Praktiken sowie CI/CD-Pipelines&lt;/li&gt;',
  '&lt;li&gt;Sehr gute Deutsch- und Englischkenntnisse in Wort und Schrift&lt;/li&gt;&lt;/ul&gt;',
  '&lt;p&gt;' + 'Hays vermittelt IT-Fachkräfte an Unternehmen in ganz Deutschland, vom Mittelstand bis zum DAX-Konzern. '.repeat(6) + '&lt;/p&gt;',
].join('');

/** A copy Google cut off with an ellipsis; its page refuses us (403). */
const CUT = 'Werdegang Du hast einen Master in Informatik oder einem verwandten Fach und bringst Erfahrung mit Sprachmodellen mit. '.repeat(14) + 'Mehrjährige praktische Berufserfahrung in der Entwicklung von AI- od…';

/** List items Google also returns as highlights, and its copy with them glued together after a glued heading. */
const GLUE_ITEMS = [
  'University degree in computer science or a similar field',
  'Minimum 3 years of relevant professional experience',
  'Experience with prompt evaluation and LLM tooling',
  'Very good German and English, written and spoken',
];
const GLUED_WITH_HIGHLIGHTS = 'Glue Labs builds prompt tooling for insurers and banks across Europe. You design and evaluate prompts for our customer-facing assistants. ' +
  'Qualifications' + GLUE_ITEMS.join('') + ' We offer a hybrid setup in Berlin and a learning budget.';

/** A 190-character apply link, longer than the 80 the old wrapper kept. */
const LONG_APPLY = 'https://talents.studysmarter.de/companies/thermondo/ai-automation-enablement-manager-m-w-d-berlin-kreuzberg-1234567/apply?utm_source=google_jobs_apply&utm_medium=organic&utm_campaign=google_jobs';

function jsonLdPage(posting: Record<string, unknown>): string {
  return `<!doctype html><html><head><title>Job</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Some Board"}</script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...posting })}</script>
</head><body><nav>Jobs Companies Login</nav><main>Rendered by script</main></body></html>`;
}

/** Twenty well-formed ads with line breaks (nothing to fetch), about 3,800 characters each. */
function longAd(n: number): string {
  const block = (k: number) =>
    `Block ${k} of ad ${n}. You build agent workflows on Claude for the operations team of Agentic Co ${n}, ` +
    `own the evaluation suite, and ship weekly. Requirements: TypeScript, Python, two years in production systems. `;
  return Array.from({ length: 18 }, (_, k) => block(k)).join('\n').slice(0, 3_800) + ' Ende der Anzeige.';
}

function serpJobs() {
  const base = {
    location: 'Berlin',
    via: 'Stub Board',
    detected_extensions: { posted_at: '1 day ago', schedule_type: 'Full-time' },
  };
  return [
    {
      ...base,
      job_id: 'compound-law',
      title: 'Applied AI Engineer',
      company_name: 'Compound Law',
      share_link: 'https://www.google.de/search?ibp=htl;jobs&q=Applied+AI+Engineer&htidocid=compound',
      description: SNIPPET,
      apply_options: [{ title: 'Compound Law', link: 'https://jobs.compound-law.de/applied-ai-engineer' }],
    },
    {
      ...base,
      job_id: 'hays-devops-ai',
      title: 'DevOps AI Specialist (m/w/d)',
      company_name: 'Hays',
      location: 'Leverkusen',
      share_link: 'https://www.google.de/search?ibp=htl;jobs&q=AI+Specialist&htidocid=hays',
      description: GLUED,
      // The board's short link redirects to the posting.
      apply_options: [{ title: 'Hays', link: 'https://www.hays.de/go/devops-ai' }],
    },
    {
      ...base,
      job_id: 'cut-off',
      title: 'Machine Learning Engineer',
      company_name: 'Refusing GmbH',
      share_link: 'https://www.google.de/search?ibp=htl;jobs&q=ML&htidocid=cut',
      description: CUT,
      apply_options: [{ title: 'Refusing', link: 'https://karriere.refusing-gmbh.de/ml-engineer' }],
    },
    {
      ...base,
      job_id: 'thermondo',
      title: 'AI & Automation Enablement Manager (m/w/d)',
      company_name: 'Thermondo',
      share_link: 'https://www.google.de/search?ibp=htl;jobs&q=AI+Enablement+Manager&htidocid=1HgNBthermondo-long-share-link-0123456789',
      description: longAd(0),
      apply_options: [{ title: 'Talents By StudySmarter', link: LONG_APPLY }],
    },
    {
      ...base,
      job_id: 'glued-highlights',
      title: 'Prompt Engineer',
      company_name: 'Glue Labs',
      share_link: 'https://www.google.de/search?ibp=htl;jobs&q=Prompt+Engineer&htidocid=glue',
      // Google's copy with the list markup stripped, and the same items in its highlights. The page is gone (404).
      description: GLUED_WITH_HIGHLIGHTS,
      job_highlights: [{ title: 'Qualifications', items: GLUE_ITEMS }],
      apply_options: [{ title: 'Glue Labs', link: 'https://jobs.glue-labs.de/prompt-engineer' }],
    },
    ...Array.from({ length: 20 }, (_, i) => ({
      ...base,
      job_id: `agentic-${i + 1}`,
      title: `AI Automation Engineer ${i + 1}`,
      company_name: `Agentic Co ${i + 1}`,
      share_link: `https://www.google.de/search?ibp=htl;jobs&q=AI&htidocid=agentic-${i + 1}`,
      description: longAd(i + 1),
      apply_options: [{ title: 'Stub Board', link: `https://boards.agentic-${i + 1}.de/jobs/${i + 1}` }],
    })),
  ];
}

/** An ad of about 1,200 characters with line breaks (nothing to fetch), saying `mode` in its own words. */
function filterAd(company: string, mode: string): string {
  const filler = `${company} builds agent workflows on Claude for insurers and banks, with an evaluation suite for every workflow.`;
  return [`About ${company}`, filler, mode, 'Requirements', 'TypeScript, Python and production systems.', ...Array.from({ length: 8 }, () => filler)].join('\n');
}

/** The second user's run: one job per setting it must honour. */
function filterJobs() {
  const base = { location: 'München', via: 'Stub Board', detected_extensions: { posted_at: '1 day ago', schedule_type: 'Full-time' } };
  const job = (id: string, title: string, company: string, mode: string) => ({
    ...base,
    job_id: id,
    title,
    company_name: company,
    share_link: `https://www.google.de/search?ibp=htl;jobs&q=AI&htidocid=${id}`,
    description: filterAd(company, mode),
    apply_options: [{ title: company, link: `https://jobs.${id}.de/apply` }],
  });
  return [
    job('f-onsite', 'KI-Ingenieur', 'Werk GmbH', 'Die Arbeit findet zu 100% vor Ort in München statt.'),
    job('f-hybrid', 'AI Engineer', 'Hybrid AG', 'Hybrid: two office days a week in München.'),
    job('f-senior', 'Senior AI Engineer', 'Elder Labs', 'Hybrid, with flexible office days.'),
    job('f-junior', 'Junior AI Engineer', 'Fresh GmbH', 'Hybrid setup with a learning budget.'),
    job('f-dexter', 'Applied AI Engineer (m/w/d)', 'dexter health GmbH', 'Hybrid in Berlin.'),
    job('f-remote', 'AI Automation Engineer', 'Remote Co', 'This role is fully remote within Germany.'),
    job('f-unknown', 'AI Specialist', 'Quiet KG', 'We build tools for the Mittelstand.'),
  ];
}

const PAGES: Record<string, () => Response> = {
  'https://jobs.compound-law.de/applied-ai-engineer': () => html(jsonLdPage({
    '@type': 'JobPosting',
    title: 'Applied AI Engineer (Legal AI)',
    description: COMPOUND_HTML,
    hiringOrganization: { '@type': 'Organization', name: 'Compound Law' },
  })),
  'https://www.hays.de/go/devops-ai': () => new Response(null, { status: 301, headers: { location: '/jobsuche/t01?prospectId=b2935962' } }),
  'https://www.hays.de/jobsuche/t01?prospectId=b2935962': () => html(jsonLdPage({
    '@graph': [{ '@type': 'WebPage', name: 'Hays' }, { '@type': 'JobPosting', title: 'DevOps AI Specialist (m/w/d)', description: HAYS_HTML_ENCODED }],
  })),
  'https://karriere.refusing-gmbh.de/ml-engineer': () => new Response('Forbidden', { status: 403 }),
};

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ---------------------------------------------------------------------------
// Network edge
// ---------------------------------------------------------------------------

const serp = { calls: 0 };
/** What the next searches return, one list per search; a search past the end returns nothing. */
let serpQueue: unknown[][] = [];
const pageRequests: string[] = [];
const strayRequests: string[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
  const host = new URL(url).hostname;
  if (host === 'serpapi.com') {
    serp.calls += 1;
    // A run's first search returns its ads; the run's other searches return nothing new.
    const jobs = serpQueue.shift() ?? [];
    return new Response(JSON.stringify({ jobs_results: jobs }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (host === '127.0.0.1' || host === 'localhost') return realFetch(input, init);
  pageRequests.push(url);
  const page = PAGES[url];
  if (page) return page();
  // Every other employer page is unknown here: a 404, the way a dead link answers. Only German hosts are expected.
  if (host.endsWith('.de')) return new Response('Not found', { status: 404 });
  strayRequests.push(url);
  return new Response('Not found', { status: 404 });
}) as typeof fetch;

type Row = Record<string, unknown>;

function structuredCv(): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(), version: 1, createdAt: now, updatedAt: now,
    sourceFileName: 'cv.txt', sourceFormat: 'txt',
    settings: { region: 'EU', includePhoto: false, pageSize: 'a4', maxPages: 1, language: 'en' },
    personal: { fullName: 'Dana Weber', email: 'dana.weber@example.com', phone: '', city: 'Berlin', currentTitle: 'AI Engineer' },
    experience: [{
      id: 'exp-1', company: 'Kern Systems', position: 'AI Engineer',
      startDate: { raw: 'Mar 2023', year: 2023, month: 3, confidence: 'high' }, current: true,
      bullets: ['Built agent workflows on Claude for the operations team', 'Shipped an evaluation suite for every workflow'],
    }],
    education: [], skills: [], certifications: [], languages: [],
  };
}

async function main(): Promise<void> {
  const platform = await openPlatform(freshStateDir());
  const feedServer = await import('../../src/lib/job-feed/server');
  const { feedTools } = await import('../../src/lib/mcp/tools/feed');
  const tool = (name: string) => {
    const found = feedTools.find((definition) => definition.name === name);
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };
  /** A tool's handler, its result checked against the tool's own output schema as the MCP route does. */
  const call = async <T>(name: string, args: Record<string, unknown>, userId: string): Promise<T> => {
    const definition = tool(name);
    const parsedArgs = definition.input.parse(args);
    const result = await definition.run(parsedArgs, { userId } as never);
    return definition.output.parse(result.structured) as T;
  };

  const all = async (query: string, ...bindings: unknown[]): Promise<Row[]> => {
    const result = await platform.db.prepare(query).bind(...bindings).all();
    return (result as unknown as { results: Row[] }).results;
  };
  const one = async (query: string, ...bindings: unknown[]) => (await all(query, ...bindings))[0];
  const run = (query: string, ...bindings: unknown[]) => platform.db.prepare(query).bind(...bindings).run();

  async function seedMaxUser(label: string): Promise<string> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run("INSERT INTO profiles (id, email, subscription_tier, job_searches_reset_at, created_at, updated_at) VALUES (?, ?, 'max', ?, ?, ?)", id, `${label}@test.local`, now, now, now);
    await run(
      "INSERT INTO user_credits (id, user_id, monthly_credits, rollover_credits, addon_credits, plan_tier, version, created_at, updated_at) VALUES (?, ?, 200, 0, 0, 'max', 0, ?, ?)",
      crypto.randomUUID(), id, now, now,
    );
    await run(
      `INSERT INTO documents (id, user_id, type, file_name, file_type, raw_text, sections, all_skills, all_experiences, all_education, structured_data, created_at, updated_at)
       VALUES (?, ?, 'primary_cv', 'cv.txt', 'txt', ?, '{}', '[]', '[]', '[]', ?, ?, ?)`,
      crypto.randomUUID(), id, PRIMARY_CV, JSON.stringify(structuredCv()), now, now,
    );
    await feedServer.getOrProvisionFreeJobFeedSettingsAdmin(id, ['AI Automation Engineer'], { consentAccepted: true });
    await run("UPDATE job_feed_settings SET target_countries = ?, user_timezone = 'Europe/Berlin' WHERE user_id = ?", JSON.stringify(['de']), id);
    return id;
  }

  const scenario = async (name: string, body: () => Promise<Record<string, unknown>>) => {
    const observed: Record<string, unknown> = {};
    try {
      await fakeReset();
      Object.assign(observed, await body());
      report.scenarios.push({ name, passed: true, observed });
      console.log(`PASS  ${name}`);
    } catch (error) {
      report.scenarios.push({ name, passed: false, observed, error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error) });
      console.log(`FAIL  ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  interface FeedView {
    jobId: string;
    title: string;
    company: string;
    applyUrl: string | null;
    sourceUrl?: string | null;
    description?: string | null;
    descriptionComplete?: boolean;
    applyOptions?: Array<{ title: string; link: string }>;
  }
  interface FeedPage { items: FeedView[]; totalCount: number; hasMore: boolean; nextOffset: number | null }

  /** Every inbox job through get_job_feed with detail full, page by page, following nextOffset. */
  const readWholeFeed = async (userId: string): Promise<{ items: FeedView[]; pages: number[] }> => {
    const items: FeedView[] = [];
    const pages: number[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const page: FeedPage = await call<FeedPage>('get_job_feed', { view: 'inbox', detail: 'full', limit: 50, offset }, userId);
      pages.push(page.items.length);
      items.push(...page.items);
      assert.ok(page.items.length > 0, 'a page is never empty while hasMore');
      offset = page.nextOffset;
      assert.ok(pages.length < 20, 'paging ends');
    }
    return { items, pages };
  };
  const unwrap = (value: string | null | undefined) => (value ?? '').replace(/^<</, '').replace(/>>$/, '');
  const byCompany = (items: FeedView[], company: string) => {
    const found = items.find((item) => unwrap(item.company) === company);
    assert.ok(found, `${company} is in the feed`);
    return found;
  };

  const userId = await seedMaxUser('data');
  serpQueue = [serpJobs()];
  const result = await feedServer.runJobFeedFoundationWorkflow({ userId, orchestrator: 'direct' });
  assert.equal(result.run.status, 'completed', `the run completed: ${result.run.error_message ?? ''}`);
  const feed = await readWholeFeed(userId);
  const stored = async (sourceJobId: string) =>
    one('SELECT description, description_source, description_complete, apply_url, source_url, source_identifiers FROM job_feed_canonical_jobs WHERE source_job_id = ?', sourceJobId);

  await scenario('d1. a 122-character snippet is replaced by the ad on the employer page, and get_job_feed returns all of it', async () => {
    const row = await stored('compound-law');
    assert.equal(row.description_source, 'employer_page');
    assert.equal(row.description_complete, 1);
    const text = String(row.description);
    assert.ok(text.length > 1_000, `stored ${text.length} characters`);
    assert.ok(text.includes('Minimum 2 years of professional experience in software engineering'), 'the requirements are there');
    const item = byCompany(feed.items, 'Compound Law');
    assert.equal(unwrap(item.description), text, 'the tool returns the stored text, whole');
    assert.equal(item.descriptionComplete, true);
    return { storedChars: text.length, fetched: pageRequests.filter((url) => url.includes('compound-law')) };
  });

  await scenario('d2. a page that refuses us leaves the Google copy, marked incomplete, and never cut further', async () => {
    const row = await stored('cut-off');
    assert.equal(row.description_source, 'serp');
    assert.equal(row.description_complete, 0);
    const item = byCompany(feed.items, 'Refusing GmbH');
    assert.equal(item.descriptionComplete, false);
    assert.equal(unwrap(item.description), String(row.description), 'the whole stored copy comes back');
    return { chars: String(row.description).length };
  });

  await scenario('d3. a page of twenty long ads is split by size, never by cutting a description', async () => {
    assert.ok(feed.pages.length >= 2, `pages ${feed.pages.join(', ')}`);
    assert.equal(feed.items.length, Number((await one('SELECT COUNT(*) AS n FROM job_feed_ranked_items WHERE user_id = ?', userId)).n), 'every ranked job is read');
    for (const item of feed.items) {
      const row = await one('SELECT description FROM job_feed_canonical_jobs WHERE id = ?', item.jobId);
      // The tool neutralizes angle brackets in ad text; none of these ads has any.
      assert.equal(unwrap(item.description), String(row.description), `${unwrap(item.title)} came back whole`);
    }
    const lengths = feed.items.map((item) => unwrap(item.description).length);
    assert.ok(lengths.every((length) => length !== 2_000), 'nothing stops at the old 2,000-character cap');
    assert.ok(lengths.filter((length) => length > 3_000).length >= 20, 'the long ads are long');
    return { pages: feed.pages, longest: Math.max(...lengths) };
  });

  await scenario('d4. a 190-character apply link comes back whole in applyUrl, applyOptions and the stored row', async () => {
    const row = await stored('thermondo');
    assert.equal(row.apply_url, LONG_APPLY, 'stored whole');
    const item = byCompany(feed.items, 'Thermondo');
    assert.equal(unwrap(item.applyUrl), LONG_APPLY);
    assert.deepEqual(item.applyOptions?.map((option) => unwrap(option.link)), [LONG_APPLY]);
    assert.equal(unwrap(item.sourceUrl), String(row.source_url), 'the share link too');
    assert.ok(String(row.source_url).length > 80, 'the share link is longer than the old cap');
    for (const view of feed.items) {
      for (const link of [view.applyUrl, view.sourceUrl, ...(view.applyOptions ?? []).map((option) => option.link)]) {
        if (link) assert.doesNotThrow(() => new URL(unwrap(link)), `a usable URL: ${link}`);
      }
    }
    return { applyUrlLength: LONG_APPLY.length };
  });

  await scenario('d5. list items and headings are separate lines: from the employer page HTML, and from Google\'s copy with its highlights', async () => {
    const lines = (text: unknown) => String(text).split('\n').map((line) => line.trim());

    // Compound Law: <h3> and a <p><strong> heading, two <ul> lists.
    const compound = lines((await stored('compound-law')).description);
    for (const heading of ['Your tasks:', 'Requirements:']) assert.ok(compound.includes(heading), `"${heading}" is a line of its own`);
    for (const item of ['- Build retrieval and drafting pipelines on Claude and open models', '- Minimum 2 years of professional experience in software engineering', '- Fluent English; German is a plus']) {
      assert.ok(compound.includes(item), `"${item}" is a line of its own`);
    }

    // Hays: entity-encoded HTML behind a redirect, the glued Google copy replaced.
    const hays = await stored('hays-devops-ai');
    assert.equal(hays.description_source, 'employer_page', 'read from the page the redirect led to');
    const haysLines = lines(hays.description);
    assert.ok(haysLines.includes('Ihre Aufgaben:') && haysLines.includes('Ihre Qualifikationen:'));
    assert.ok(haysLines.includes('- Kenntnisse in DevOps-Praktiken sowie CI/CD-Pipelines'));
    assert.ok(haysLines.includes('- Sehr gute Deutsch- und Englischkenntnisse in Wort und Schrift'));
    assert.ok(!String(hays.description).includes('CI/CD-PipelinesSehr'), 'nothing glued is left');
    assert.ok(!/&lt;|<li|<\/?p>/.test(String(hays.description)), 'no markup or entities left');

    // Glue Labs: no page, so Google's copy, with the heading and its items split on Google's own highlights.
    const glue = await stored('glued-highlights');
    assert.equal(glue.description_source, 'serp');
    const glueLines = lines(glue.description);
    assert.ok(glueLines.includes('Qualifications:'), 'the glued heading is a line of its own');
    for (const item of GLUE_ITEMS) assert.ok(glueLines.includes(`- ${item}`), `"${item}" is an item`);

    // The MCP returns the same lines.
    const item = byCompany(feed.items, 'Hays');
    assert.ok(unwrap(item.description).split('\n').includes('- Kenntnisse in DevOps-Praktiken sowie CI/CD-Pipelines'));
    return { compound: compound.slice(0, 8), hays: haysLines.slice(0, 6), glue: glueLines };
  });

  // A second user: onsite left out of the work modes, junior and mid chosen, and dexter health's Applied AI
  // Engineer already in the tracker from an application made outside the feed.
  const filterUser = await seedMaxUser('filters');
  await run(
    "UPDATE job_feed_settings SET remote_preferences = ?, remote_preference = 'remote_first', seniority_targets = ?, seniority_target = 'junior' WHERE user_id = ?",
    JSON.stringify(['remote_first', 'remote_only', 'hybrid']), JSON.stringify(['junior', 'mid']), filterUser,
  );
  const insertApplication = async (title: string, company: string): Promise<string> => {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await run(
      "INSERT INTO application_sessions (id, user_id, job_title, company, job_description, matching_skills, missing_skills, suggestions, cv_edits, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'An ad.', '[]', '[]', '[]', '[]', 'applied', ?, ?)",
      id, filterUser, title, company, now, now,
    );
    return id;
  };
  await insertApplication('Applied AI Engineer', 'dexter health');
  serpQueue = [filterJobs()];
  const filterRun = await feedServer.runJobFeedFoundationWorkflow({ userId: filterUser, orchestrator: 'direct' });
  assert.equal(filterRun.run.status, 'completed', `the second run completed: ${filterRun.run.error_message ?? ''}`);
  const filterFeed = async () => (await readWholeFeed(filterUser)).items.map((item) => unwrap(item.company));

  await scenario('e1. onsite left out: an ad that says 100% vor Ort never reaches the feed; hybrid, remote and unstated ones do', async () => {
    const companies = await filterFeed();
    assert.ok(!companies.includes('Werk GmbH'), `onsite job shown: ${companies.join(', ')}`);
    for (const kept of ['Hybrid AG', 'Remote Co', 'Quiet KG']) assert.ok(companies.includes(kept), `${kept} is in the feed`);
    const runRow = await one('SELECT metadata FROM job_feed_runs WHERE id = ?', filterRun.run.id);
    const metadata = JSON.parse(String(runRow.metadata)) as Record<string, unknown>;
    assert.deepEqual(metadata.ranking_excluded_by_settings, { workMode: 1, seniority: 1 });
    // The reading is stored on the job, replacing the board's guess.
    assert.equal((await one("SELECT work_mode FROM job_feed_canonical_jobs WHERE source_job_id = 'f-onsite'")).work_mode, 'onsite');
    assert.equal((await one("SELECT work_mode FROM job_feed_canonical_jobs WHERE source_job_id = 'f-hybrid'")).work_mode, 'hybrid');
    assert.equal((await one("SELECT work_mode FROM job_feed_canonical_jobs WHERE source_job_id = 'f-unknown'")).work_mode, 'unknown', 'a city alone is not onsite');
    return { companies, excluded: metadata.ranking_excluded_by_settings };
  });

  await scenario('e2. junior and mid chosen: a senior role is left out, a junior one and one that does not say are kept', async () => {
    const companies = await filterFeed();
    assert.ok(!companies.includes('Elder Labs'), 'the senior role is not shown');
    assert.ok(companies.includes('Fresh GmbH') && companies.includes('Quiet KG'));
    return { companies };
  });

  await scenario('e3. a job already in the tracker under another link and title suffix is never ranked or shown', async () => {
    const companies = await filterFeed();
    assert.ok(!companies.includes('dexter health GmbH'), 'the applied job is not shown');
    const ranked = await one(
      "SELECT COUNT(*) AS n FROM job_feed_ranked_items r JOIN job_feed_canonical_jobs j ON j.id = r.canonical_job_id WHERE r.user_id = ? AND j.source_job_id = 'f-dexter'",
      filterUser,
    );
    assert.equal(Number(ranked.n), 0, 'not even ranked');
    const runRow = await one('SELECT metadata FROM job_feed_runs WHERE id = ?', filterRun.run.id);
    assert.equal((JSON.parse(String(runRow.metadata)) as Record<string, unknown>).tracker_excluded_count, 1);
    return { companies };
  });

  await scenario('e4. the inbox applies settings when it is read: a later change and a later application hide jobs at once', async () => {
    // The feed's own fit check makes an application for its job; that must not hide the job.
    const hybridJob = await one("SELECT id FROM job_feed_canonical_jobs WHERE source_job_id = 'f-hybrid'");
    const ownApplication = await insertApplication('AI Engineer', 'Hybrid AG');
    await run(
      "INSERT INTO job_feed_feedback (id, user_id, canonical_job_id, application_session_id, apply_started_at, generation_status, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'none', '{}', ?, ?)",
      crypto.randomUUID(), filterUser, hybridJob.id, ownApplication, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(),
    );
    // An application made elsewhere for the junior role does.
    await insertApplication('Junior AI Engineer', 'Fresh GmbH');
    // And the work modes narrow to onsite (which takes onsite and hybrid): remote is out.
    await run("UPDATE job_feed_settings SET remote_preferences = ?, remote_preference = 'onsite' WHERE user_id = ?", JSON.stringify(['onsite']), filterUser);
    const companies = await filterFeed();
    assert.ok(companies.includes('Hybrid AG'), 'the feed\'s own application keeps its job');
    assert.ok(!companies.includes('Fresh GmbH'), 'the job applied to elsewhere is hidden');
    assert.ok(!companies.includes('Remote Co'), 'the remote job is hidden once remote is left out');
    return { companies };
  });

  await scenario('d9. nothing left the machine except the stubbed SerpAPI calls and the stubbed employer pages', async () => {
    assert.deepEqual(strayRequests, []);
    return { serpCalls: serp.calls, pageRequests: pageRequests.length };
  });

  await platform.dispose();
  const failed = report.scenarios.filter((entry) => !entry.passed);
  if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(report, null, 2));
  console.log(`__RESULT__${JSON.stringify(report)}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
