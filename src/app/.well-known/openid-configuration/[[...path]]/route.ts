import { serveWellKnown } from '@/lib/mcp/well-known';

export const runtime = 'nodejs';

// OpenID discovery for clients that look here instead of the RFC 8414 path.
export const GET = serveWellKnown;
export const HEAD = serveWellKnown;
