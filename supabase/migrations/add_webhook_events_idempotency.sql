-- Webhook idempotency table: prevents duplicate processing of Stripe events.
-- Stripe delivers webhooks at-least-once; retries and manual replays are normal.
-- Without this, replayed events can add credits twice or remove credits twice.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup queries (delete events older than 30 days)
CREATE INDEX idx_webhook_events_processed_at ON public.webhook_events (processed_at);

-- RLS: no client access — only service role key (server-side webhook handler)
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.webhook_events IS 'Stripe webhook idempotency. Service-role only — no client RLS policies by design.';
