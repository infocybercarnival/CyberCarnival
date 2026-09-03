-- Idempotent PostgreSQL Migration: Add payment proof & disclaimer columns + update status constraint
-- File: backend/postgres/migration_add_payment_proof_and_disclaimer.sql

BEGIN;

ALTER TABLE event_registrations 
ADD COLUMN IF NOT EXISTS payment_proof_filename VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_proof_mime_type VARCHAR(64),
ADD COLUMN IF NOT EXISTS payment_proof_size INTEGER,
ADD COLUMN IF NOT EXISTS disclaimer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS disclaimer_accepted_at TIMESTAMP WITHOUT TIME ZONE;

-- Update status check constraint to include 'pending_payment'
ALTER TABLE event_registrations 
DROP CONSTRAINT IF EXISTS ck_registration_status;

ALTER TABLE event_registrations 
ADD CONSTRAINT ck_registration_status 
CHECK (status IN ('confirmed', 'pending_verification', 'pending_payment', 'cancelled', 'rejected'));

COMMIT;
