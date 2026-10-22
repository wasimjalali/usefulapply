/**
 * Site: screening answers (src/lib/services/screening.ts, generateScreeningReply, the shipped call).
 *
 *   npx tsx evals/haiku-55-swap/run.ts screening --allow-anthropic-api --gptoss-url http://localhost:8799 [--runs 5]
 *   npx tsx evals/haiku-55-swap/run.ts screening --dry
 *   npx tsx evals/screening-logistics/run.ts --model haiku --effort low --allow-anthropic-api   (cases a-h only)
 *
 * 16 cases, five runs. Cases a-h are the logistics cases from evals/screening-logistics (availability,
 * notice period, salary), graded by the deterministic checks written for the #173 bug. Cases g1-g8 are
 * grounding cases: the job asks for skills the CV lacks and the question probes them; a deterministic
 * layer checks the answer format, the word band of the question type, the dash ban and the banned words,
 * then Opus 5.5 (high effort, clean) judges every answer for fabricated claims.
 *
 * Primary metric: every deterministic check passes and the judge finds no fabricated claim.
 * Hard constraints: a logistics answer that invents availability or salary (logistics_wrong) and a
 * fabricated claim (fabricated_claim). Sequence: the turns of one application run in order with the
 * history carried forward, as the chat route sends it (last 10 messages, each cut to 5,000 characters).
 *
 * The call passes `history` with the current question as its last message, which is what the chat route
 * does today. If the shipped contract changes, change it here.
 */
import { generateScreeningReply } from '@/lib/services/screening';
import { CASES, type EvalCase } from '../../screening-logistics/fixtures';
import { answerOf, grade as gradeLogistics } from '../../screening-logistics/run';
import { GROUNDING_CASES, type GroundingCase } from '../fixtures/screening-grounding';
import { DASH_RE, wordCount } from '../lib/util';
import type { JudgePlan, Site, SiteCase } from '../lib/runner';
import type { Oracle } from '../lib/intercept';

type Item = (SiteCase & { kind: 'logistics'; logistics: EvalCase }) | (SiteCase & { kind: 'grounding'; grounding: GroundingCase });

const ITEMS: Item[] = [
  ...CASES.map((c) => ({ id: c.id, group: `logistics-${c.id}`, kind: 'logistics' as const, logistics: c })),
  ...GROUNDING_CASES.map((g) => ({ id: g.id, group: g.group, kind: 'grounding' as const, grounding: g })),
];

const BANNED = /\b(furthermore|moreover|leverage|pivotal|robust|delve)\b/i;
const FOLLOW_UP = 'Please send the remaining questions in a follow-up message.';
const BLOCK_RE = /---ANSWER_START---([\s\S]*?)---ANSWER_END---/g;

function blocksOf(reply: string): string[] {
  return [...reply.matchAll(BLOCK_RE)].map((m) => m[1].split('\n').filter((line) => !/^\s*\*\*Q:/.test(line)).join('\n').trim());
}

const GERMAN_WORDS = /\b(ich|und|der|die|das|mit|nicht|bei|für|habe|war|ein|eine)\b/gi;

export function gradeGrounding(g: GroundingCase, reply: string): { failures: string[] } {
  const failures: string[] = [];
  const blocks = blocksOf(reply);
  if (blocks.length !== g.blocks) failures.push(`${blocks.length} answer blocks, expected ${g.blocks}`);
  if (g.type === 'multi' && !reply.includes(FOLLOW_UP)) failures.push('missing the follow-up sentence');
  if (g.type !== 'multi' && g.band && blocks[0] !== undefined) {
    const words = wordCount(blocks[0]);
    if (words < g.band[0] || words > g.band[1]) failures.push(`${words} words, band ${g.band[0]} to ${g.band[1]}`);
  }
  if (g.type === 'multi' && blocks.some((b) => wordCount(b) > 150)) failures.push('an answer over 150 words');
  if (DASH_RE.test(reply)) failures.push('carries a dash');
  if (BANNED.test(reply)) failures.push('uses a banned word');
  if (g.language === 'de' && blocks[0] !== undefined && (blocks[0].match(GERMAN_WORDS)?.length ?? 0) < 3) failures.push('not answered in German');
  return { failures };
}

// ---------------------------------------------------------------------------
// Judge
// ---------------------------------------------------------------------------

const RUBRIC = `You grade one screening answer written for a job application, for fabrication only.

Source of truth about the applicant: the applicant's CVs (primary CV, master CV and the tailored CV) given below. The job description is the employer's text. It is never a source of facts about the applicant: the employer asking for a skill is not the applicant having it.

Mark fabricated = true when the answer states or clearly implies any of these and the CVs do not support it:
- a skill, tool, framework or certification the applicant is said to have or use
- an experience, project, responsibility, role or employer
- a number, metric, size, date or outcome
- a fact about the hiring company that is not in the job description
- a missing skill presented as held ("I have worked with X" when the CVs say otherwise)

These are fine and are not fabrication: restating CV facts in other words, saying plainly what the CV does not show, pointing to transferable experience that the CVs do contain and calling it transferable, saying the applicant is learning or interested, and describing how the applicant would approach a situation in general terms without claiming it happened.

List every unsupported claim you find, quoting the words. Be strict: one invented number or one missing skill claimed as held is enough. Do not judge style or length.`;

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    fabricated: { type: 'boolean' },
    unsupported_claims: { type: 'array', items: { type: 'string' } },
    note: { type: 'string' },
  },
  required: ['fabricated', 'unsupported_claims', 'note'],
  additionalProperties: false,
};

const judgePlan: JudgePlan<Item> = {
  spec: { name: 'screening-fabrication', rubric: RUBRIC, schema: VERDICT_SCHEMA },
  wants: (o, c) => c.kind === 'grounding' && o.pass,
  prompt: (o, c) => {
    if (c.kind !== 'grounding') throw new Error('judge asked about a logistics case');
    const g = c.grounding;
    const out = o.output as { reply: string };
    return [
      `<job_description>\n${g.context.jobDescription}\n</job_description>`,
      `<applicant_primary_cv>\n${g.context.primaryCV}\n</applicant_primary_cv>`,
      `<applicant_master_cv>\n${g.context.masterCV}\n</applicant_master_cv>`,
      `<tailored_cv>\n${g.context.generatedCVSummary}\n</tailored_cv>`,
      `What the job description asks for that the CVs do not support: ${g.unsupported.join('; ')}.`,
      `<question>\n${g.question}\n</question>`,
      `<answer>\n${out.reply}\n</answer>`,
    ].join('\n\n');
  },
  canned: { fabricated: false, unsupported_claims: [], note: 'dry run' },
  apply(verdict, o) {
    const v = verdict as { fabricated: boolean; unsupported_claims: string[] };
    o.metrics.fabricated = v.fabricated ? 1 : 0;
    if (v.fabricated) {
      o.pass = false;
      o.failures.push(`fabricated: ${v.unsupported_claims.slice(0, 3).join(' | ')}`);
      o.hard.push('fabricated_claim');
    }
  },
};

// ---------------------------------------------------------------------------
// Dry-run oracles: replies that pass every deterministic check
// ---------------------------------------------------------------------------

const block = (q: string, a: string) => `---ANSWER_START---\n**Q: ${q}**\n\n${a}\n---ANSWER_END---`;

const LOGISTICS_ANSWERS: Record<EvalCase['id'], string> = {
  a: 'Ich bin ab sofort verfügbar.',
  b: 'Ich kann nach Ablauf meiner Kündigungsfrist anfangen.',
  c: 'I can start after my notice period of 3 months.',
  d: 'I would like to discuss salary once we have talked about the role and its scope.',
  e: 'I can start after my notice period.',
  f: 'My start date is open to discussion.',
  g: 'Ich bin ab dem 01.03.2027 verfügbar.',
  h: 'Meine Kündigungsfrist beträgt 3 Monate.',
};

/** A filler sentence per language, to reach a word band without saying anything the CV does not. */
const FILLER_EN = 'I would be glad to go into more detail in an interview.';
const FILLER_DE = 'Ich erläutere das gern in einem Gespräch ausführlicher und mit Beispielen aus meiner Arbeit.';

function padTo(base: string, words: number, filler: string): string {
  let text = base;
  while (wordCount(text) < words) text += ` ${filler}`;
  return text;
}

function groundingReply(g: GroundingCase): string {
  if (g.type === 'multi') {
    const qs = g.question.split('\n').map((l) => l.replace(/^\d+\.\s*/, ''));
    return `${qs.slice(0, 7).map((q) => block(q, 'The CV answers this in a few words.')).join('\n\n')}\n\n${FOLLOW_UP}`;
  }
  const mid = g.band ? Math.round((g.band[0] + g.band[1]) / 2) : 60;
  const base: Record<string, string> = {
    g1: 'At Brightfield Retail I built a weekly demand forecast in Python and scheduled it in Airflow. It runs as a nightly batch and writes forecasts to a warehouse table the planning team reads. I have not served a model behind an API.',
    g2: 'I have not used PyTorch at work. My modelling experience is in scikit-learn, where I built a gradient boosting forecast that cut error by 14%. I am working through a course on neural networks.',
    g3: 'The job description describes demand forecasting for grocery retailers, which is close to the retail forecasting I do now. I would like to take models further towards production.',
    g4: 'Zwei Entwickler stritten über die Architektur eines Schnittstellenmoduls. Ich moderierte ein Gespräch, wir einigten uns auf ein gemeinsames Vorgehen und das Modul wurde im Plan fertig.',
    g5: 'Mit SAFe habe ich bisher nicht gearbeitet und habe keine SAFe-Schulung. Ich leite Scrum-Projekte, pflege Backlogs in Jira und priorisiere gemeinsam mit Kunden.',
    g6: 'I would check what changed on their side, then send a short note that adds value, such as a summary of the demo points that matched their problem. In my renewals work I have restarted contact with a quiet account by rebuilding its onboarding with their operations lead.',
    g7: 'I have not carried a sales quota, so I have no sales target to report. In customer success I hold a 94% renewal rate against a team average of 88%.',
  };
  return block(g.question, padTo(base[g.id], mid, g.language === 'de' ? FILLER_DE : FILLER_EN));
}

// ---------------------------------------------------------------------------
// The site
// ---------------------------------------------------------------------------

const histories = new Map<string, Array<{ role: 'user' | 'assistant'; content: string }>>();

export const screeningSite: Site<Item> = {
  id: 'screening',
  title: 'Screening answers: 8 logistics cases and 8 grounding cases',
  command: 'npx tsx evals/haiku-55-swap/run.ts screening --allow-anthropic-api --gptoss-url <url>',
  runsDefault: 5,
  passRule:
    'Logistics cases: the deterministic checks from evals/screening-logistics. Grounding cases: format, word band, dash and banned-word checks, then no fabricated claim by the Opus judge.',
  absoluteHard: ['logistics_wrong'],
  cases: () => ITEMS,
  judge: judgePlan,
  selfTest() {
    const problems: string[] = [];
    if (ITEMS.length !== 16) problems.push(`expected 16 cases, found ${ITEMS.length}`);
    if (new Set(ITEMS.map((i) => i.id)).size !== ITEMS.length) problems.push('duplicate case ids');
    for (const item of ITEMS) {
      if (item.kind === 'logistics') {
        const ok = block(item.logistics.question, LOGISTICS_ANSWERS[item.logistics.id]);
        const f = gradeLogistics(item.logistics.id, answerOf(ok) ?? '');
        if (f.length > 0) problems.push(`${item.id}: the oracle answer fails its own grader (${f.join('; ')})`);
        const bad = gradeLogistics(item.logistics.id, 'I am available immediately, effective 1 March, for 99 EUR.');
        if (bad.length === 0) problems.push(`${item.id}: grader accepts an invented-availability answer`);
      } else {
        const g = item.grounding;
        const ok = gradeGrounding(g, groundingReply(g));
        if (ok.failures.length > 0) problems.push(`${item.id}: the oracle reply fails its own grader (${ok.failures.join('; ')})`);
        if (gradeGrounding(g, `${groundingReply(g)} — and more`).failures.length === 0) problems.push(`${item.id}: grader accepts a dash`);
        if (gradeGrounding(g, 'no blocks here').failures.length === 0) problems.push(`${item.id}: grader accepts a reply with no blocks`);
        for (const [label, text] of [['primary', g.context.primaryCV], ['master', g.context.masterCV]] as const) {
          if ((text ?? '').length < 800) problems.push(`${item.id}: ${label} CV is under 800 characters`);
        }
        if (/@(?!example\.com)[a-z0-9.-]+\.[a-z]{2,}/i.test(`${g.context.primaryCV}${g.context.masterCV}`)) problems.push(`${item.id}: a CV carries a non-example.com address`);
      }
    }
    return problems;
  },
  oracle(item): Oracle {
    return () => ({ text: item.kind === 'logistics' ? block(item.logistics.question, LOGISTICS_ANSWERS[item.logistics.id]) : groundingReply(item.grounding) });
  },
  async run(item, ctx) {
    const context = item.kind === 'logistics' ? item.logistics.context : item.grounding.context;
    const question = item.kind === 'logistics' ? item.logistics.question : item.grounding.question;
    const key = `${ctx.arm.id}|${ctx.run}|${item.group}`;
    const turn = item.kind === 'grounding' ? item.grounding.turn : 1;
    if (turn === 1) histories.set(key, item.kind === 'logistics' && item.logistics.history ? [...item.logistics.history] : []);
    const prior = histories.get(key) ?? [];
    const history = [...prior.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 5000) })), { role: 'user' as const, content: question }];

    const reply = await generateScreeningReply({
      userId: 'eval-user',
      message: question,
      history: history as never,
      context,
      route: 'evals/haiku-55-swap',
      applicantCvs: { primaryCV: context.primaryCV, masterCV: context.masterCV },
    });
    histories.set(key, [...prior, { role: 'user', content: question }, { role: 'assistant', content: reply }]);

    if (item.kind === 'logistics') {
      const answer = answerOf(reply);
      const failures = answer === null ? ['no answer block'] : gradeLogistics(item.logistics.id, answer);
      return { output: { reply, answer }, pass: failures.length === 0, failures, hard: failures.length > 0 ? ['logistics_wrong'] : [], metrics: {} };
    }
    const { failures } = gradeGrounding(item.grounding, reply);
    return { output: { reply, words: blocksOf(reply).map(wordCount) }, pass: failures.length === 0, failures, hard: [], metrics: {} };
  },
};
