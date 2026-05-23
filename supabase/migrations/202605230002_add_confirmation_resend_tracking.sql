-- Schema support for the hourly "re-send confirmation to unconfirmed users" job.
-- Pairs with: src/app/api/cron/resend-confirmations/route.ts
--
-- Two columns:
--   last_confirmation_resend_at -> 24h throttle between nudges per user.
--   confirmation_resend_count   -> hard cap (max 2 nudges) so dead leads don't get
--                                  pinged forever.
--
-- The cron job itself (pg_cron + pg_net + Vault) is scheduled by the companion
-- migration 202605230003_schedule_confirmation_resend_cron.sql AFTER the user
-- has:
--   1. Generated a CRON_SECRET and added it to .env.local + Vercel env.
--   2. Enabled pg_cron + pg_net extensions in Supabase dashboard.
--   3. Inserted the same secret into Supabase Vault.
--
-- Splitting the schema and the schedule means this migration is safe to apply
-- on any environment; the schedule migration is gated on the manual setup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_confirmation_resend_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_resend_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.profiles.last_confirmation_resend_at IS
  'Set each time /api/cron/resend-confirmations re-sends a confirmation link. Enforces 24h gap between nudges.';

COMMENT ON COLUMN public.profiles.confirmation_resend_count IS
  'Incremented per nudge. Capped at 2 by cron logic so dead leads stop receiving emails.';
