import { NextRequest, NextResponse } from 'next/server';
import { getAuth, getCurrentUser, takeDeleteEmailFailure } from '@/auth/server';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';
import { getBillingSubscription } from '@/db/repos/subscriptions';
import { willBillAgain } from '@/lib/subscription-billing';

export const runtime = 'nodejs';

/**
 * Asks for the deletion, it does not perform it. Better Auth mails a link and
 * only its callback deletes anything, so a borrowed session is no longer
 * enough on its own. The R2 purge and the D1 wipe run in the `beforeDelete`
 * hook in `src/auth/server.ts`, before the user row goes.
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rateLimit = await checkRateLimit(`delete-account:${user.id}`, RATE_LIMITS['delete-account']);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // Deleting the account drops the local subscription row, and nothing in
    // this app cancels at Stripe, so the card would keep being charged with no
    // record left to reconcile against. The subscription has to go first.
    const subscription = await getBillingSubscription(user.id);
    if (willBillAgain(subscription)) {
      return NextResponse.json(
        { error: 'Cancel your subscription first.', code: 'SUBSCRIPTION_ACTIVE' },
        { status: 409 },
      );
    }

    const auth = await getAuth();
    await auth.api.deleteUser({
      headers: request.headers,
      body: { callbackURL: '/' },
    });

    // Better Auth answers 200 whether or not the mail went out, so telling the
    // user to check their inbox without this would be a guess.
    if (takeDeleteEmailFailure(user.id)) {
      return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }

    return NextResponse.json({ requested: true, email: user.email });
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
