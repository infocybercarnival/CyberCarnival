-- Idempotent PostgreSQL Migration: Add payment_proof_path column to event_registrations
-- File: backend/postgres/migration_add_payment_proof_path.sql

BEGIN;

ALTER TABLE event_registrations
ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;

-- Synchronize existing stored payment proof references into payment_proof_path
UPDATE event_registrations
SET payment_proof_path = payment_proof_filename
WHERE payment_proof_path IS NULL
  AND payment_proof_filename IS NOT NULL;

COMMENT ON COLUMN event_registrations.payment_proof_path IS
'Stores the Supabase Storage object path or local disk path reference of an uploaded payment proof screenshot';

COMMIT;
