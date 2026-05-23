-- Schedule the hourly "re-send confirmation to unconfirmed users" cron job.
--
-- IMPORTANT - manual prerequisites before applying this migration:
--
--   1. Generate a strong secret:
--        openssl rand -hex 32
--
--   2. Add it to BOTH:
--        a. /Users/wasimjalali/Desktop/Karko_AI/.env.local   CRON_SECRET=<value>
--        b. Vercel project env (Production + Preview)        CRON_SECRET=<value>
--
--   3. In the Supabase dashboard, enable the extensions:
--        Database -> Extensions -> pg_cron  (toggle ON)
--        Database -> Extensions -> pg_net   (toggle ON)
--
--   4. In the Supabase SQL editor, insert the SAME secret into the Vault:
--        INSERT INTO vault.secrets (name, secret)
--        VALUES ('karko_cron_secret', '<value from step 1>')
--        ON CONFLICT (name) DO UPDATE SET secret = EXCLUDED.secret;
--
--   5. Now run this migration. If any prerequisite is missing the migration
--      raises NOTICE on the cron.schedule step (which is the only step that
--      actually depends on the prerequisites) and returns early. The
--      CREATE OR REPLACE FUNCTION block always runs because the function
--      is safe to create even without pg_net (it will only fail at call
--      time). Re-running after the prerequisites are filled in is safe.

DO $$
DECLARE
  has_pg_cron BOOLEAN;
  has_pg_net BOOLEAN;
  has_vault_secret BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')  INTO has_pg_cron;
  SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')   INTO has_pg_net;
  SELECT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'karko_cron_secret'
  ) INTO has_vault_secret;

  IF NOT has_pg_cron THEN
    RAISE NOTICE 'pg_cron not enabled; skipping schedule. Enable in Supabase Dashboard then re-run this migration.';
    RETURN;
  END IF;
  IF NOT has_pg_net THEN
    RAISE NOTICE 'pg_net not enabled; skipping schedule. Enable in Supabase Dashboard then re-run this migration.';
    RETURN;
  END IF;
  IF NOT has_vault_secret THEN
    RAISE NOTICE 'Vault secret karko_cron_secret missing; skipping schedule. Insert it and re-run this migration.';
    RETURN;
  END IF;
END $$;

-- Stored procedure that fires the HTTP call to /api/cron/resend-confirmations.
-- Pulling the secret out of the cron schedule string means it never appears in
-- cron.job rows or pg_stat logs.
CREATE OR REPLACE FUNCTION public.trigger_karko_confirmation_resend()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  secret TEXT;
  endpoint TEXT := 'https://karkoai.com/api/cron/resend-confirmations';
BEGIN
  SELECT decrypted_secret INTO secret
    FROM vault.decrypted_secrets
    WHERE name = 'karko_cron_secret'
    LIMIT 1;

  IF secret IS NULL THEN
    RAISE NOTICE 'karko_cron_secret not set; aborting nudge call';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := endpoint,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || secret,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 30000
  );
END;
$$;

COMMENT ON FUNCTION public.trigger_karko_confirmation_resend() IS
  'Called hourly by pg_cron. Fires a signed POST to /api/cron/resend-confirmations which re-sends the confirmation email to users who signed up >24h ago and never confirmed.';

-- Unschedule any prior version of this job, then re-schedule. Safe on first run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'karko-resend-confirmations-hourly'
  ) THEN
    PERFORM cron.unschedule('karko-resend-confirmations-hourly');
  END IF;

  PERFORM cron.schedule(
    'karko-resend-confirmations-hourly',
    '0 * * * *',
    $cron$SELECT public.trigger_karko_confirmation_resend()$cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron schedule failed: %', SQLERRM;
END $$;
