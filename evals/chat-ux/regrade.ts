/**
 * Regrade stored chat-ux outcomes with another version of the graders (the 2026-10-23 write-up uses it to show the
 * final runs under the graders as they stood before any change made after seeing model output).
 *
 *   npx tsx evals/chat-ux/regrade.ts <graders-root> <results.json> [...more results.json]
 *
 * <graders-root> is a checkout of the repo at the grader version to apply (for example a worktree at 274765f7).
 * Each outcome's reply, actions, effects, tools and stored summary are graded again with that root's `gradeUx` and
 * its case list. Database checks (rows changed, the expected status, chat rows stored) cannot be replayed from the
 * stored output, so the failures the run itself recorded for those are carried over as they are.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface Outcome {
  caseId: string;
  run: number;
  pass: boolean;
  failures: string[];
  output?: {
    status?: number;
    reply?: string;
    actions?: Array<{ label: string; action: string }>;
    executed?: Array<{ type: string }>;
    toolsCalled?: string[];
    summary?: string | null;
  };
}

const DB_FAILURE = /status applied|status is|expected (?:rejected|accepted|interview|follow_up|applied)|changed \d+ row|chat rows for the turn|lacks the \w+ effect|write effect/i;

async function main(): Promise<void> {
  const [root, ...files] = process.argv.slice(2);
  if (!root || files.length === 0) throw new Error('usage: regrade.ts <graders-root> <results.json> [...]');
  const site = await import(path.resolve(root, 'evals/chat-ux/sites/chat-ux.ts'));
  const fixtures = await import(path.resolve(root, 'evals/chat-ux/fixtures/cases.ts'));
  const byId = new Map<string, unknown>((fixtures.CASES as Array<{ id: string }>).map((c) => [c.id, c]));
  for (const file of files) {
    const data = JSON.parse(readFileSync(file, 'utf8')) as { gitSha: string; outcomes: Outcome[] };
    let pass = 0;
    let total = 0;
    const categories = new Map<string, [number, number]>();
    for (const o of data.outcomes) {
      const c = byId.get(o.caseId) as { category: string } | undefined;
      if (!c || !o.output) continue;
      const graded = site.gradeUx(c, {
        status: o.output.status ?? 200,
        body: { reply: o.output.reply ?? '', actions: o.output.actions ?? [], executed: o.output.executed ?? [] },
        toolsCalled: o.output.toolsCalled ?? [],
        changed: [],
        dbFailures: o.failures.filter((f) => DB_FAILURE.test(f)),
        summary: o.output.summary ?? null,
        rowsAdded: null,
      }) as { pass: boolean };
      total += 1;
      if (graded.pass) pass += 1;
      const entry = categories.get(c.category) ?? [0, 0];
      entry[1] += 1;
      if (graded.pass) entry[0] += 1;
      categories.set(c.category, entry);
    }
    console.log(`${path.basename(path.dirname(path.dirname(path.dirname(path.dirname(file)))))}/${path.basename(file)} (run at ${data.gitSha.slice(0, 8)}): ${pass}/${total} under graders at ${root}`);
    console.log('  ', Object.fromEntries([...categories].map(([k, [p, t]]) => [k, `${p}/${t}`])));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
