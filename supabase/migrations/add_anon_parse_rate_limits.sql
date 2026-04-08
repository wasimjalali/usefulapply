-- Rate limit table for anonymous CV parse attempts (5 per IP per 24h rolling window)
CREATE TABLE IF NOT EXISTS anon_parse_rate_limits (
  ip_address TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for cleanup of expired windows
CREATE INDEX idx_anon_parse_window_start ON anon_parse_rate_limits (window_start);

-- RLS enabled but no policies = no access via anon key (service role bypasses RLS)
ALTER TABLE anon_parse_rate_limits ENABLE ROW LEVEL SECURITY;

-- Atomic check-and-increment function.
-- Returns: allowed (boolean), current attempt_count (integer).
-- Handles window expiry, cleanup, and increment in a single transaction.
CREATE OR REPLACE FUNCTION check_anon_parse_limit(
  p_ip TEXT,
  p_max_attempts INT DEFAULT 5,
  p_window_hours INT DEFAULT 24
)
RETURNS TABLE(allowed BOOLEAN, current_count INT) AS $$
DECLARE
  v_cutoff TIMESTAMPTZ := NOW() - (p_window_hours || ' hours')::INTERVAL;
  v_count INT;
BEGIN
  -- Opportunistic cleanup: delete expired records (keeps table small)
  DELETE FROM anon_parse_rate_limits WHERE window_start < v_cutoff;

  -- Upsert: insert new record or increment existing (reset if window expired)
  INSERT INTO anon_parse_rate_limits (ip_address, attempt_count, window_start)
  VALUES (p_ip, 1, NOW())
  ON CONFLICT (ip_address) DO UPDATE SET
    attempt_count = CASE
      WHEN anon_parse_rate_limits.window_start < v_cutoff THEN 1
      ELSE anon_parse_rate_limits.attempt_count + 1
    END,
    window_start = CASE
      WHEN anon_parse_rate_limits.window_start < v_cutoff THEN NOW()
      ELSE anon_parse_rate_limits.window_start
    END
  RETURNING anon_parse_rate_limits.attempt_count INTO v_count;

  RETURN QUERY SELECT v_count <= p_max_attempts, v_count;
END;
$$ LANGUAGE plpgsql;
