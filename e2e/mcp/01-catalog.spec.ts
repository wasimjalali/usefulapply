import { expect, test } from '../lib/worker-logs';
import { TOOL_SCOPES } from '../../src/lib/mcp/scopes';
import { newAgent, type McpSession } from '../lib/mcp-client';

/**
 * The catalog as an agent sees it: tools/list is exactly the names in TOOL_SCOPES, every tool states all four
 * annotations, and destructiveHint / readOnlyHint match the table in docs/agent-integration/PLAN.md section 4.
 */

/** PLAN section 4, "Destructive: yes". Anything else in the catalog must say false. */
const DESTRUCTIVE = new Set([
  'generate_application_kit',
  'regenerate_document',
  'rewrite_cv_section',
  'delete_application',
  // Dismiss and rate_not_relevant end the job with no undo, so the tool is destructive and those verbs confirm.
  'give_job_feedback',
  'save_cv',
  'delete_cv',
  'set_profile_photo',
  'remove_profile_photo',
  'update_profile',
  'update_cv_content',
  'undo_last_edit',
  'edit_cv_structure',
  'delete_cv_item',
  'edit_document_text',
  'set_cv_template',
  'update_feed_settings',
  'withdraw_feed_consent',
  'update_notification_settings',
]);

/** PLAN section 4: "Spending tools also set idempotentHint: true". */
const SPEND_TOOLS = ['analyze_job_fit', 'generate_application_kit', 'regenerate_document', 'rewrite_cv_section', 'apply_to_feed_job', 'draft_screening_answers'];

test.describe.serial('tool catalog', () => {
  let session: McpSession;

  test.beforeAll(async ({ browser, request }) => {
    const agent = await newAgent(browser, request, 'catalog');
    session = agent.session;
    await agent.context.close();
  });

  test.afterAll(async () => {
    await session?.close();
  });

  test('tools/list is exactly the catalog, 43 tools, with the scope split the PLAN table lists', async () => {
    const client = await session.connect();
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();
    expect(names).toEqual(Object.keys(TOOL_SCOPES).sort());
    // The PLAN prose says 44 tools and 25 free writes; its table lists 24 free writes (13 + 6 + 24 = 43).
    expect(names).toHaveLength(43);
    const byScope = (scope: string) => Object.entries(TOOL_SCOPES).filter(([, value]) => value === scope).length;
    expect({ read: byScope('read'), spend: byScope('spend'), write: byScope('write') }).toEqual({ read: 13, spend: 6, write: 24 });
  });

  test('every tool sets title and all four annotations as booleans, and hints follow the PLAN table', async () => {
    const client = await session.connect();
    const { tools } = await client.listTools();
    const problems: string[] = [];
    for (const tool of tools) {
      const scope = TOOL_SCOPES[tool.name as keyof typeof TOOL_SCOPES];
      const hints = tool.annotations;
      if (typeof hints?.title !== 'string' || hints.title.length === 0) problems.push(`${tool.name}: annotation title`);
      if (typeof tool.title !== 'string' || tool.title.length === 0) problems.push(`${tool.name}: title`);
      for (const hint of ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'] as const) {
        if (typeof hints?.[hint] !== 'boolean') problems.push(`${tool.name}: ${hint} is not a boolean`);
      }
      // A read tool is read-only, and nothing else is.
      if (hints?.readOnlyHint !== (scope === 'read')) problems.push(`${tool.name}: readOnlyHint ${String(hints?.readOnlyHint)} for scope ${scope}`);
      // The PLAN's destructive column.
      if (hints?.destructiveHint !== DESTRUCTIVE.has(tool.name)) problems.push(`${tool.name}: destructiveHint ${String(hints?.destructiveHint)}`);
      if (SPEND_TOOLS.includes(tool.name) && hints?.idempotentHint !== true) problems.push(`${tool.name}: a spending tool must be idempotent`);
      if (!tool.description || tool.description.length < 20) problems.push(`${tool.name}: description`);
      if (!tool.inputSchema) problems.push(`${tool.name}: inputSchema`);
      if (!tool.outputSchema) problems.push(`${tool.name}: outputSchema`);
      // Spending tools take a key; nothing takes a user id.
      const properties = Object.keys((tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {});
      if (SPEND_TOOLS.includes(tool.name) && !properties.includes('idempotencyKey')) problems.push(`${tool.name}: idempotencyKey missing`);
      if (properties.some((property) => /^user_?id$/i.test(property))) problems.push(`${tool.name}: takes a user id`);
    }
    expect(problems).toEqual([]);
  });

  test('the spending tools that cost credits state the cost in their description', async () => {
    const { tools } = await (await session.connect()).listTools();
    const description = (name: string) => tools.find((tool) => tool.name === name)?.description ?? '';
    expect(description('analyze_job_fit')).toMatch(/0\.5 credits/);
    expect(description('generate_application_kit')).toMatch(/2 credits/);
    expect(description('generate_application_kit')).toMatch(/1\.5 when/);
    expect(description('regenerate_document')).toMatch(/0\.5 credits/);
    expect(description('rewrite_cv_section')).toMatch(/0\.5 credits/);
    expect(description('draft_screening_answers')).toMatch(/no credits/i);
  });

  test('a tool the catalog does not have is refused, and so is test_write_stub', async () => {
    const outcome = await session.raw({ method: 'tools/call', params: { name: 'test_write_stub', arguments: {} } });
    // Unknown tool: a JSON-RPC error or an error result, never a success.
    const body = outcome.body as { error?: unknown; result?: { isError?: boolean } } | null;
    expect(outcome.status === 200 ? Boolean(body?.error) || body?.result?.isError === true : outcome.status >= 400).toBe(true);
  });
});
