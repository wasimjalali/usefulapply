-- =====================================================
-- MIGRATION: Simplify application status values
-- Run in Supabase SQL Editor BEFORE deploying code
-- =====================================================

-- Step 1: Drop old CHECK constraint FIRST (so we can update data)
ALTER TABLE application_sessions DROP CONSTRAINT IF EXISTS application_sessions_status_check;

-- Step 2: Migrate existing data to new values
UPDATE application_sessions SET status = 'applied' WHERE status IN ('draft', 'completed', 'sent');
-- 'interview', 'rejected', 'accepted' stay as-is (no change needed)

-- Step 3: Change default
ALTER TABLE application_sessions ALTER COLUMN status SET DEFAULT 'applied';

-- Step 4: Add new CHECK constraint with simplified values
ALTER TABLE application_sessions ADD CONSTRAINT application_sessions_status_check 
  CHECK (status IN ('applied', 'interview', 'rejected', 'accepted', 'follow_up'));

-- Step 5: Verify
SELECT status, COUNT(*) FROM application_sessions GROUP BY status ORDER BY status;
