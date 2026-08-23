import { NextResponse } from 'next/server';

// OpenNext Cloudflare does not support Next.js 16 proxy.ts (Node-only).
// Session lives in the Better Auth cookie (`usefulapply.session`) and is
// validated in getCurrentUser() / auth.api.getSession. No refresh hop.
export async function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
