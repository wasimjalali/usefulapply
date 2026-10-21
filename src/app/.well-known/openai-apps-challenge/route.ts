// OpenAI app directory domain verification. Source:
// https://developers.openai.com/apps-sdk/deploy/submission
// The file at /.well-known/openai-apps-challenge must return only the token as plain text.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function serve(): Response {
  const token = process.env.OPENAI_APPS_CHALLENGE?.trim();
  if (!token) return new Response('Not found', { status: 404 });
  return new Response(token, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export const GET = serve;
export const HEAD = serve;
