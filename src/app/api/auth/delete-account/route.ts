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

    // Delete all user data from public tables using admin client (bypasses RLS).
    // Most child tables also `on delete cascade` from profiles.id, so this is
    // belt-and-suspenders against cascade misconfig. Order matters for FK constraints.
    const tablesWithUserId = [
      'chat_messages',
      'credit_reservations',
      'job_feed_application_generation_events',
      'job_feed_application_generations',
      'job_feed_feedback',
      'job_feed_ranked_items',
      'job_feed_raw_fetches',
      'job_feed_runs',
      'job_feed_settings',
      'user_cv_suggestions',
      'user_job_preferences',
      'user_career_profiles',
      'user_search_strategies',
      'user_notifications',
      'application_sessions',
      'documents',
      'profile_photos',
      'connected_accounts',
      'user_credits',
      'credit_transactions',
      'subscriptions',
      'message_feedback',
    ];

    for (const table of tablesWithUserId) {
      const { error } = await (supabaseAdmin as any)
        .from(table)
        .delete()
        .eq('user_id', userId);

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
        console.warn(`[delete-account] Error deleting from ${table}:`, error.message);
      }
    }

    // profiles uses `id` not `user_id`
    const { error: profileError } = await (supabaseAdmin as any)
      .from('profiles')
      .delete()
      .eq('id', userId);

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('[delete-account] Error deleting profile:', profileError.message);
    }

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
