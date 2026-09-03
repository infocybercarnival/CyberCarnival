-- Idempotent PostgreSQL Migration: Enforce one active registration per user per event
-- Safely backfills event_id and active_registration, validates integrity, and creates composite FK and partial unique index.

BEGIN;

-- Step 1: Add new columns as NULLable initially if they do not exist
ALTER TABLE registration_members 
  ADD COLUMN IF NOT EXISTS event_id varchar(36),
  ADD COLUMN IF NOT EXISTS active_registration boolean DEFAULT true;

-- Step 2: Backfill event_id and active_registration from event_registrations
UPDATE registration_members rm
SET event_id = er.event_id,
    active_registration = (er.status IN ('confirmed', 'pending_verification'))
FROM event_registrations er
WHERE rm.registration_id = er.id
  AND (rm.event_id IS NULL OR rm.active_registration IS DISTINCT FROM (er.status IN ('confirmed', 'pending_verification')));

-- Step 3: Validate that no NULL values remain in event_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM registration_members WHERE event_id IS NULL) THEN
    RAISE EXCEPTION 'Backfill failed: NULL event_id found in registration_members';
  END IF;
END $$;

-- Step 4: Make event_id NOT NULL and active_registration NOT NULL
ALTER TABLE registration_members 
  ALTER COLUMN event_id SET NOT NULL,
  ALTER COLUMN active_registration SET NOT NULL;

-- Step 5: Add Composite Unique Constraint on event_registrations(id, event_id) idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_event_registrations_id_event'
  ) THEN
    ALTER TABLE event_registrations
      ADD CONSTRAINT uq_event_registrations_id_event UNIQUE (id, event_id);
  END IF;
END $$;

-- Step 6: Add Composite Foreign Key on registration_members idempotently
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_registration_members_registration_event'
  ) THEN
    ALTER TABLE registration_members
      ADD CONSTRAINT fk_registration_members_registration_event 
      FOREIGN KEY (registration_id, event_id) 
      REFERENCES event_registrations(id, event_id) 
      ON DELETE CASCADE;
  END IF;
END $$;

-- Step 7: Validate no duplicate active participation exists in current data
DO $$
BEGIN
  IF EXISTS (
    SELECT event_id, user_id 
    FROM registration_members 
    WHERE active_registration = true 
    GROUP BY event_id, user_id 
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration pre-check failed: Duplicate active participation exists in current database!';
  END IF;
END $$;

-- Step 8: Create Partial Unique Index for active registrations idempotently
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_user_per_event 
ON registration_members (event_id, user_id) 
WHERE (active_registration = true);

COMMIT;
