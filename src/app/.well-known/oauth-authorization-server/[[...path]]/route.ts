import { serveWellKnown } from '@/lib/mcp/well-known';

export const runtime = 'nodejs';

// RFC 8414 authorization server metadata, at the root and with the issuer path (/api/auth) appended.
export const GET = serveWellKnown;
export const HEAD = serveWellKnown;
