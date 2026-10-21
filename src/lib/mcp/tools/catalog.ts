import type { AnyToolDefinition } from '@/lib/mcp/tools/framework';
import { accountTools } from '@/lib/mcp/tools/account';
import { applicationTools } from '@/lib/mcp/tools/applications';
import { cvTools } from '@/lib/mcp/tools/cv';
import { feedTools } from '@/lib/mcp/tools/feed';
import { profileTools } from '@/lib/mcp/tools/profile';
import { spendTools } from '@/lib/mcp/tools/spend';

/**
 * The v1 tool catalog (docs/agent-integration/PLAN.md section 4), one module per group.
 * Every name here has its scope in scopes.ts, and the MCP E2E asserts tools/list returns exactly
 * the names in TOOL_SCOPES.
 */
export const CATALOG: readonly AnyToolDefinition[] = [
  ...accountTools,
  ...applicationTools,
  ...cvTools,
  ...spendTools,
  ...feedTools,
  ...profileTools,
];
