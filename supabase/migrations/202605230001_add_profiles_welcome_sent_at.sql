-- Track when the founder-personal welcome flow (Day 0 + Day 3) was triggered
-- so the post-confirm endpoint can be safely retried / re-hit on /auth/callback
-- refreshes without duplicate sends.
--
-- NULL = not yet sent (post-confirm will fire on first opportunity).
-- non-NULL = already sent at that timestamp (post-confirm no-ops).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS welcome_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.welcome_sent_at IS
  'Set when /api/auth/post-confirm successfully sent the Day 0 founder welcome via Resend and scheduled the Day 3 check-in. Idempotency gate to prevent duplicate sends on auth-callback refresh.';
