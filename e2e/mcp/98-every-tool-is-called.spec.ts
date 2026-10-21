import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../lib/worker-logs';
import { TOOL_SCOPES } from '../../src/lib/mcp/scopes';

/**
 * A tool added to the catalog without a test fails here: every name in TOOL_SCOPES has to be CALLED by name in
 * a spec of this lane, as the first argument of ok, fails, call or callModern, as `name:` of a raw callTool, or
 * as the first entry of a [name, args] table row. A name that only sits in a list of descriptions or annotations
 * does not count. Read tools and free write tools are called in 03-tool-tour.spec.ts and 10-feed.spec.ts,
 * spending tools in 02, 05, 06, 09 and 10; the output of each of those calls is validated against the tool's
 * outputSchema by the MCP client.
 */
function callPatterns(name: string): RegExp[] {
  const quoted = `['"\`]${name}['"\`]`;
  return [
    // agent.ok<{ ... }>('name', ...): the generic arguments may contain anything up to the opening parenthesis.
    new RegExp(`\\.(?:ok|fails|call|callModern)\\b[^\\n]*?\\(\\s*${quoted}`),
    new RegExp(`\\bname:\\s*${quoted}`),
    new RegExp(`\\[\\s*${quoted}\\s*,\\s*[({]`),
  ];
}

test('every tool in the catalog is called by name somewhere in the lane', () => {
  const dir = __dirname;
  const own = '98-every-tool-is-called.spec.ts';
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith('.spec.ts') && file !== own && file !== '01-catalog.spec.ts')
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n');
  const uncalled = Object.keys(TOOL_SCOPES).filter((name) => !callPatterns(name).some((pattern) => pattern.test(sources)));
  expect(uncalled, 'tools no spec calls').toEqual([]);
});

test('the call patterns tell a call from a name that is only listed', () => {
  const sample = [
    "const x = await agent.ok<{ a: Array<{ b: string }> }>('get_account', {});",
    "for (const name of ['list_applications', 'get_cv']) {}",
    "await client.callTool({ name: 'export_documents', arguments: {} });",
    "['delete_cv', { target: 'primary' }],",
  ].join('\n');
  const called = (name: string) => callPatterns(name).some((pattern) => pattern.test(sample));
  expect(['get_account', 'export_documents', 'delete_cv'].map(called)).toEqual([true, true, true]);
  expect(['list_applications', 'get_cv'].map(called)).toEqual([false, false]);
});
