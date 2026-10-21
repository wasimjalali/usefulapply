import { request as playwrightRequest, test as base } from '@playwright/test';
import { MCP_BASE_URL } from './env';

/**
 * The preview Worker's own console, read through wrangler's local observability endpoint (the same one the
 * test-mode guard in mcp-oauth.spec.ts counts log lines with). Used to attach the server side of a failed
 * test, and to assert that a failure was logged and what it logged (never the content of a user's data).
 */
export async function workerLogs(sinceMs: number, base: string = MCP_BASE_URL): Promise<string[]> {
  const api = await playwrightRequest.newContext();
  try {
    const response = await api.post(`${base}/cdn-cgi/local/explorer/api/local/observability/query`, {
      data: { sql: `SELECT level, message FROM logs WHERE ts_ms >= ${Math.floor(sinceMs)} ORDER BY ts_ms, seq LIMIT 600` },
    });
    if (!response.ok()) return [`log query failed: ${response.status()} ${(await response.text()).slice(0, 200)}`];
    const body = (await response.json()) as { result?: { rows?: unknown[][] } };
    return (body.result?.rows ?? [])
      .map(([level, message]) => {
        let text = String(message);
        try {
          const parsed = JSON.parse(text) as unknown;
          if (typeof parsed === 'string') text = parsed;
        } catch {
          // already plain text
        }
        return `${String(level)} ${text}`;
      })
      .filter((line) => !/^info "?(GET|POST|PUT|DELETE) /.test(line));
  } catch (error) {
    return [`log query failed: ${error instanceof Error ? error.message : String(error)}`];
  } finally {
    await api.dispose();
  }
}

/**
 * `test` for the MCP specs: the same as Playwright's, plus the Worker's console attached to every failed test
 * (a tool failure is reported to the agent as one generic line, and the cause is only in the server log).
 */
export const test = base.extend<{ serverLogOnFailure: void }>({
  serverLogOnFailure: [
    async ({}, use, testInfo) => {
      const started = Date.now() - 2_000;
      await use();
      if (testInfo.status !== testInfo.expectedStatus) {
        const lines = await workerLogs(started);
        await testInfo.attach('worker-log', { body: lines.join('\n') || '(nothing logged)', contentType: 'text/plain' });
        // Also in the terminal, where a failing run is read first.
        const interesting = lines.filter((line) => /^(error|warn)|\[mcp\]|\[UnifiedAgent\]|Error/.test(line)).slice(-12);
        if (interesting.length > 0) console.log(`--- worker log (${testInfo.title}) ---\n${interesting.join('\n').slice(0, 3000)}`);
      }
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
