import { serveWellKnown } from '@/lib/mcp/well-known';

export const runtime = 'nodejs';

// RFC 9728 protected resource metadata, at the root and with the /mcp path appended.
export const GET = serveWellKnown;
export const HEAD = serveWellKnown;
