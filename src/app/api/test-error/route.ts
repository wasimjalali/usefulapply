import { NextResponse } from 'next/server';
import { getPostHogServer } from '@/lib/posthog-server';

export async function GET() {
  const posthog = getPostHogServer();

  try {
    throw new Error('Test backend error - DELETE THIS AFTER TESTING');
  } catch (error) {
    posthog.captureException(error as Error, 'test-user', {
      test: true,
      endpoint: '/api/test-error',
    });
    await posthog.flush();

    return NextResponse.json({ error: 'Test error captured' }, { status: 500 });
  }
}
