import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, RATE_LIMITS } from '@/lib/middleware/rateLimiter';

export const runtime = 'nodejs';

export async function DELETE(request: NextRequest) {
  try {
    // Verify the caller is authenticated
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate-limit per user so a compromised session can't burn deletion attempts in a loop.
    const rateLimit = await checkRateLimit(`delete-account:${user.id}`, RATE_LIMITS['delete-account']);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const userId = user.id;
    const supabaseAdmin = createAdminClient();

    const { deleteAllUserData } = await import('@/db/repos/admin');
    await deleteAllUserData(userId);

    // Delete storage files
    const buckets = ['avatars', 'profile-photos', 'generated-pdfs', 'cv-files'];
    for (const bucket of buckets) {
      try {
        const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
        if (files && files.length > 0) {
          const filePaths = files.map((f: { name: string }) => `${userId}/${f.name}`);
          await supabaseAdmin.storage.from(bucket).remove(filePaths);
        }
      } catch {
        // Bucket may not exist — skip silently
      }
    }

    // Delete the user from auth.users — this is the critical step that
    // the old client-side function could never do (requires service role key)
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      console.error('[delete-account] Failed to delete auth user:', deleteAuthError.message);
      return NextResponse.json(
        { error: 'Failed to delete account. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[delete-account] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    );
  }
}
