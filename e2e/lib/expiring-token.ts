import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MCP_PORT } from './env';

/** Where 00-mint-expiring-token.spec.ts leaves the token that 99-expired-token.spec.ts waits out. One file per MCP lane port. */
export const EXPIRING_TOKEN_FILE = join(tmpdir(), `ua-mcp-e2e-expiring-token-${MCP_PORT}.json`);

export interface ExpiringToken {
  accessToken: string;
  refreshToken: string | null;
  clientId: string;
  ip: string;
  expiresAtMs: number;
}
