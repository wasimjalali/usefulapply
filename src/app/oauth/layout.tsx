import { notFound } from 'next/navigation';
import { isMcpEnabled } from '@/lib/mcp/config';

// Read per request: MCP_ENABLED is a runtime var, not a build-time one.
export const dynamic = 'force-dynamic';

/** The consent and resume pages exist only while the MCP server is on. */
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  if (!isMcpEnabled()) notFound();
  return children;
}
