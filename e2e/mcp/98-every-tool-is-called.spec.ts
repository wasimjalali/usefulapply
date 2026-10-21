import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '../lib/worker-logs';
import { TOOL_SCOPES } from '../../src/lib/mcp/scopes';

/**
 * A tool added to the catalog without a test fails here: every name in TOOL_SCOPES has to be called by name in
 * a spec of this lane (not merely listed). Read tools and free write tools are called in 03-tool-tour.spec.ts
 * and 10-feed.spec.ts, spending tools in 02, 05, 06, 09 and 10; the output of each of those calls is
 * validated against the tool's outputSchema by the MCP client.
 */
test('every tool in the catalog is called by name somewhere in the lane', () => {
  const dir = __dirname;
  const own = '98-every-tool-is-called.spec.ts';
  const sources = readdirSync(dir)
    .filter((file) => file.endsWith('.spec.ts') && file !== own && file !== '01-catalog.spec.ts')
    .map((file) => readFileSync(join(dir, file), 'utf8'))
    .join('\n');
  const uncalled = Object.keys(TOOL_SCOPES).filter((name) => !new RegExp(`['"\`]${name}['"\`]`).test(sources));
  expect(uncalled, 'tools no spec calls').toEqual([]);
});
