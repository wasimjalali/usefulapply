/**
 * Builds evals/dataset/cases.jsonl (30 cases) and the private owner subset.
 *
 *   npx tsx evals/dataset/build-cases.ts
 *
 * Public job ads are fetched live from public ATS endpoints (Greenhouse board API,
 * Personio XML feed) and frozen into cases.jsonl, so the run itself never depends
 * on the network. Owner cases carry only a reference; their text comes from
 * evals/private/owner_jds_all.json (regenerate with evals/private/README.md).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(__dirname, 'cases.jsonl');
const PRIVATE_DIR = path.join(ROOT, 'private');

type Case = {
  id: string;
  origin: 'owner' | 'synthetic';
  language: 'en' | 'de';
  tags: string[];
  jd?: string;
  jd_ref?: string;
  cv_ref: string;
  source_url: string | null;
  notes: string;
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
}

function htmlToText(html: string): string {
  // Greenhouse returns entity-escaped HTML, so decode first, then strip tags.
  let s = decodeEntities(html);
  s = s.replace(/<\s*(script|style)[\s\S]*?<\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*li[^>]*>/gi, '\n- ');
  s = s.replace(/<\s*br\s*\/?>/gi, '\n');
  s = s.replace(/<\/\s*(p|div|h[1-6]|ul|ol|tr)\s*>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/—/g, '-') // keep em dashes out of inputs so the scorer only sees model-made ones
    .trim();
}

async function greenhouse(board: string, id: string) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Greenhouse ${board}/${id} ${res.status}`);
  const j = (await res.json()) as { title: string; location?: { name?: string }; content: string; absolute_url: string };
  const text = `${j.title}\n${j.location?.name ?? ''}\n\n${htmlToText(j.content)}`;
  return { text, sourceUrl: j.absolute_url, title: j.title };
}

async function personio(slug: string, id: string) {
  const url = `https://${slug}.jobs.personio.de/xml?language=de`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Personio ${slug} ${res.status}`);
  const xml = await res.text();
  const pos = xml.split('<position>').slice(1).find((p) => p.includes(`<id>${id}</id>`));
  if (!pos) throw new Error(`Personio ${slug}/${id} not found`);
  const name = decodeEntities((pos.match(/<name>([\s\S]*?)<\/name>/) ?? [])[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '');
  const office = decodeEntities((pos.match(/<office>([\s\S]*?)<\/office>/) ?? [])[1] ?? '').replace(/<!\[CDATA\[|\]\]>/g, '');
  const parts: string[] = [];
  for (const m of pos.matchAll(/<jobDescription>([\s\S]*?)<\/jobDescription>/g)) {
    const heading = (m[1].match(/<name>([\s\S]*?)<\/name>/) ?? [])[1] ?? '';
    const value = (m[1].match(/<value>([\s\S]*?)<\/value>/) ?? [])[1] ?? '';
    parts.push(`${decodeEntities(heading).replace(/<!\[CDATA\[|\]\]>/g, '')}\n${htmlToText(value.replace(/<!\[CDATA\[|\]\]>/g, ''))}`);
  }
  return { text: `${name}\n${office}\n\n${parts.join('\n\n')}`, sourceUrl: `https://${slug}.jobs.personio.de/job/${id}`, title: name };
}

type Pub =
  | { kind: 'gh'; board: string; id: string }
  | { kind: 'pe'; slug: string; id: string };

const SYNTHETIC: Array<{ id: string; cv: string; lang: 'en' | 'de'; pub: Pub; tags: string[]; notes: string }> = [
  { id: 'syn-01', cv: 'cv-en-junior-marketing', lang: 'en', pub: { kind: 'gh', board: 'coinbase', id: '8238576' }, tags: ['junior', 'thin-cv', 'marketing'], notes: 'Thin CV, entry-level ad.' },
  { id: 'syn-02', cv: 'cv-en-junior-marketing', lang: 'en', pub: { kind: 'gh', board: 'datadog', id: '8177270' }, tags: ['junior', 'thin-cv', 'marketing-ops', 'bait'], notes: 'Bait: ad asks for marketing automation and CRM tooling the CV lacks.' },
  { id: 'syn-03', cv: 'cv-en-junior-marketing', lang: 'en', pub: { kind: 'gh', board: 'elastic', id: '8224763' }, tags: ['junior', 'thin-cv', 'marketing'], notes: 'Coordinator role, long ad.' },
  { id: 'syn-04', cv: 'cv-en-career-changer-teacher', lang: 'en', pub: { kind: 'gh', board: 'datadog', id: '7128703' }, tags: ['career-changer', 'customer-success', 'bait'], notes: 'Bait: ad wants SaaS and technical account experience the CV lacks.' },
  { id: 'syn-05', cv: 'cv-en-career-changer-teacher', lang: 'en', pub: { kind: 'gh', board: 'figma', id: '6130557004' }, tags: ['career-changer', 'enablement', 'seniority-stretch'], notes: 'Senior-level ad, closest fit to a teacher.' },
  { id: 'syn-06', cv: 'cv-en-career-changer-teacher', lang: 'en', pub: { kind: 'gh', board: 'figma', id: '6130540004' }, tags: ['career-changer', 'program-management'], notes: 'Onboarding program role.' },
  { id: 'syn-07', cv: 'cv-en-senior-backend-gap', lang: 'en', pub: { kind: 'gh', board: 'cloudflare', id: '7463793' }, tags: ['senior', 'gap', 'engineering', 'bait'], notes: 'Bait: Go/Rust and networking depth the CV lacks.' },
  { id: 'syn-08', cv: 'cv-en-senior-backend-gap', lang: 'en', pub: { kind: 'gh', board: 'coinbase', id: '8247401' }, tags: ['senior', 'gap', 'engineering'], notes: 'Payments platform, strong fit.' },
  { id: 'syn-09', cv: 'cv-en-senior-backend-gap', lang: 'en', pub: { kind: 'gh', board: 'duolingo', id: '8584012002' }, tags: ['senior', 'gap', 'engineering'], notes: 'Backend role, mid-length ad.' },
  { id: 'syn-10', cv: 'cv-en-senior-backend-gap', lang: 'en', pub: { kind: 'gh', board: 'elastic', id: '8161419' }, tags: ['senior', 'gap', 'engineering', 'bait', 'long-jd'], notes: 'Very long ad; bait: search-algorithm depth the CV lacks.' },
  { id: 'syn-11', cv: 'cv-en-finance-analyst', lang: 'en', pub: { kind: 'gh', board: 'datadog', id: '8204554' }, tags: ['mid', 'finance'], notes: 'FP&A analyst, direct fit.' },
  { id: 'syn-12', cv: 'cv-en-finance-analyst', lang: 'en', pub: { kind: 'gh', board: 'gitlab', id: '8731564002' }, tags: ['mid', 'finance', 'bait', 'seniority-stretch'], notes: 'Bait: senior FP&A ad asking for tools and scale the CV lacks.' },
  { id: 'syn-13', cv: 'cv-en-finance-analyst', lang: 'en', pub: { kind: 'gh', board: 'okta', id: '8075386' }, tags: ['mid', 'finance', 'seniority-stretch'], notes: 'Manager-level finance ad.' },
  { id: 'syn-14', cv: 'cv-en-finance-analyst', lang: 'en', pub: { kind: 'gh', board: 'airbnb', id: '8079378' }, tags: ['mid', 'operations', 'long-jd', 'bait'], notes: 'Very long ad outside the CV field (workplace operations).' },
  { id: 'syn-15', cv: 'cv-de-technischer-vertrieb', lang: 'de', pub: { kind: 'pe', slug: 'ottonova', id: '2795474' }, tags: ['mid', 'sales', 'bait'], notes: 'German ad, insurance broker account management; bait: industry experience the CV lacks.' },
  { id: 'syn-16', cv: 'cv-de-mfa-quereinstieg', lang: 'de', pub: { kind: 'pe', slug: 'ottonova', id: '2817870' }, tags: ['career-changer', 'insurance'], notes: 'German career-changer ad written for this profile.' },
];

// Owner cases in order own-01..own-14: language and tags. Language verified by reading each ad.
// The case -> session id map lives in the gitignored evals/private/owner_case_map.json.
const OWNER: Array<{ lang: 'en' | 'de'; tags: string[]; notes: string }> = [
  { lang: 'en', tags: ['mid', 'ai-solutions', 'startup'], notes: 'Stored language column says de, ad is English.' },
  { lang: 'en', tags: ['mid', 'ecommerce', 'bait'], notes: 'Non-AI market manager role. Stored language column says de, ad is English.' },
  { lang: 'en', tags: ['mid', 'marketing', 'noisy-jd'], notes: 'LinkedIn page noise in the ad text.' },
  { lang: 'en', tags: ['junior', 'ai-implementation'], notes: 'Junior role.' },
  { lang: 'en', tags: ['intern', 'ai-engineering', 'noisy-jd'], notes: 'Internship, LinkedIn noise.' },
  { lang: 'en', tags: ['senior', 'product', 'long-jd'], notes: 'Longest owner ad (9.3k chars).' },
  { lang: 'en', tags: ['lead', 'ai-orchestration', 'noisy-jd'], notes: 'Lead-level ad.' },
  { lang: 'en', tags: ['mid', 'ai-engineering', 'noisy-jd'], notes: 'Long LinkedIn-style ad.' },
  { lang: 'en', tags: ['mid', 'marketing-ops'], notes: 'Marketing operations ad.' },
  { lang: 'en', tags: ['mid', 'ai-engineering'], notes: 'Company page ad.' },
  { lang: 'de', tags: ['mid', 'ecommerce', 'bait'], notes: 'German Du/wir ad, e-commerce account manager.' },
  { lang: 'de', tags: ['mid', 'automation', 'du-form'], notes: 'German ad, informal Du.' },
  { lang: 'de', tags: ['mid', 'genai', 'long-jd'], notes: 'German ad with gendered Nutzer:innen style.' },
  { lang: 'de', tags: ['mid', 'prompt-engineering', 'sie-form'], notes: 'German ad, formal Sie.' },
];

async function main() {
  const cases: Case[] = [];

  const allPath = path.join(PRIVATE_DIR, 'owner_jds_all.json');
  if (!fs.existsSync(allPath)) throw new Error(`Missing ${allPath}. Regenerate it with evals/private/README.md first.`);
  const all = JSON.parse(fs.readFileSync(allPath, 'utf8')) as Array<{ id: string; job_title: string; company: string; job_url: string | null; job_description: string }>;
  const ownerSubset: Record<string, { job_title: string; company: string; job_url: string | null; job_description: string }> = {};
  const mapPath = path.join(PRIVATE_DIR, 'owner_case_map.json');
  if (!fs.existsSync(mapPath)) throw new Error(`Missing ${mapPath} (case id -> session id prefix).`);
  const caseMap = JSON.parse(fs.readFileSync(mapPath, 'utf8')) as Record<string, string>;
  OWNER.forEach((o, i) => {
    const id = `own-${String(i + 1).padStart(2, '0')}`;
    const sid = caseMap[id];
    if (!sid) throw new Error(`${id} missing from ${mapPath}`);
    const row = all.find((r) => r.id.startsWith(sid));
    if (!row) throw new Error(`Owner session for ${id} not found`);
    ownerSubset[id] = { job_title: row.job_title, company: row.company, job_url: row.job_url, job_description: row.job_description };
    cases.push({
      id,
      origin: 'owner',
      language: o.lang,
      tags: o.tags,
      jd_ref: `private:owner_jds.json#${id}`,
      cv_ref: 'private:owner_cv.json',
      source_url: null,
      notes: o.notes,
    });
  });
  fs.writeFileSync(path.join(PRIVATE_DIR, 'owner_jds.json'), JSON.stringify(ownerSubset, null, 1));

  for (const s of SYNTHETIC) {
    const r = s.pub.kind === 'gh' ? await greenhouse(s.pub.board, s.pub.id) : await personio(s.pub.slug, s.pub.id);
    cases.push({
      id: s.id,
      origin: 'synthetic',
      language: s.lang,
      tags: s.tags,
      jd: r.text,
      cv_ref: `cv:${s.cv}`,
      source_url: r.sourceUrl,
      notes: `${s.notes} Ad title: ${r.title}`,
    });
    console.log(s.id, r.title, r.text.length);
  }

  fs.writeFileSync(OUT, cases.map((c) => JSON.stringify(c)).join('\n') + '\n');
  console.log(`wrote ${cases.length} cases to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
