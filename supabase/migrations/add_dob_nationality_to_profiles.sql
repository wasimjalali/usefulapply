-- Add date_of_birth and nationality columns to profiles table
-- These are standard fields for German CVs (Lebenslauf) and optional for EU CVs.
-- They persist at the profile level so users don't re-enter them per session.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS date_of_birth TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT;
