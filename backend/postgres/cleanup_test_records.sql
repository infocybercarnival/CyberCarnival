-- Dependency-Safe Cleanup SQL Script for Initial Integration Test Records
-- Includes pre-delete audit display, transactional deletion, and post-delete verification.
-- IMPORTANT: Review before executing. DO NOT RUN AUTOMATICALLY.
-- Usage: psql -h localhost -U postgres -d cybercarnival -f backend/postgres/cleanup_test_records.sql

BEGIN;

-- ============================================================================
-- PRE-DELETE VERIFICATION DISPLAY
-- ============================================================================

SELECT '=== 1. TARGET USERS TO BE DELETED ===' AS section;
SELECT id, email, username 
FROM users 
WHERE id IN (
    '050ede31-504e-4c73-b249-fc278e977739',
    '5a8545b8-79fb-460c-816f-74d91c670908',
    '435b3e89-d70e-43d1-ac72-fa8d80047db4',
    'e185eb2e-f3e3-4716-81c2-cdf387f8430e',
    '76663c21-e2f4-4985-99d1-08e7760db7d8'
);

SELECT '=== 2. TARGET REGISTRATIONS TO BE DELETED ===' AS section;
SELECT id, event_id, team_name, status 
FROM event_registrations 
WHERE id IN (
    'b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e',
    '49195661-9b43-429f-a5b5-97971e3fb544',
    'ed9f7e76-001b-487e-b45e-28fcfec3281c',
    'a68d37a1-1287-4a10-ad9f-b8f34529c783'
);

SELECT '=== 3. TARGET REGISTRATION MEMBERS COUNT ===' AS section;
SELECT COUNT(*) AS target_registration_members_count 
FROM registration_members 
WHERE registration_id IN (
    'b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e',
    '49195661-9b43-429f-a5b5-97971e3fb544',
    'ed9f7e76-001b-487e-b45e-28fcfec3281c',
    'a68d37a1-1287-4a10-ad9f-b8f34529c783'
) 
OR user_id IN (
    '050ede31-504e-4c73-b249-fc278e977739',
    '5a8545b8-79fb-460c-816f-74d91c670908',
    '435b3e89-d70e-43d1-ac72-fa8d80047db4',
    'e185eb2e-f3e3-4716-81c2-cdf387f8430e',
    '76663c21-e2f4-4985-99d1-08e7760db7d8'
);


-- ============================================================================
-- DEPENDENCY-SAFE TRANSACTIONAL DELETION
-- ============================================================================

-- Step 1: Delete registration members
DELETE FROM registration_members 
WHERE registration_id IN (
    'b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e',
    '49195661-9b43-429f-a5b5-97971e3fb544',
    'ed9f7e76-001b-487e-b45e-28fcfec3281c',
    'a68d37a1-1287-4a10-ad9f-b8f34529c783'
) 
OR user_id IN (
    '050ede31-504e-4c73-b249-fc278e977739',
    '5a8545b8-79fb-460c-816f-74d91c670908',
    '435b3e89-d70e-43d1-ac72-fa8d80047db4',
    'e185eb2e-f3e3-4716-81c2-cdf387f8430e',
    '76663c21-e2f4-4985-99d1-08e7760db7d8'
);

-- Step 2: Delete registrations
DELETE FROM event_registrations 
WHERE id IN (
    'b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e',
    '49195661-9b43-429f-a5b5-97971e3fb544',
    'ed9f7e76-001b-487e-b45e-28fcfec3281c',
    'a68d37a1-1287-4a10-ad9f-b8f34529c783'
);

-- Step 3: Delete users
DELETE FROM users 
WHERE id IN (
    '050ede31-504e-4c73-b249-fc278e977739',
    '5a8545b8-79fb-460c-816f-74d91c670908',
    '435b3e89-d70e-43d1-ac72-fa8d80047db4',
    'e185eb2e-f3e3-4716-81c2-cdf387f8430e',
    '76663c21-e2f4-4985-99d1-08e7760db7d8'
);


-- ============================================================================
-- POST-DELETE VERIFICATION DISPLAY & INTEGRITY CHECKS
-- ============================================================================

SELECT '=== POST-DELETE VERIFICATION COUNTS (MUST ALL BE 0) ===' AS section;

SELECT 
    (SELECT COUNT(*) FROM users WHERE id IN ('050ede31-504e-4c73-b249-fc278e977739','5a8545b8-79fb-460c-816f-74d91c670908','435b3e89-d70e-43d1-ac72-fa8d80047db4','e185eb2e-f3e3-4716-81c2-cdf387f8430e','76663c21-e2f4-4985-99d1-08e7760db7d8')) AS remaining_target_users,
    (SELECT COUNT(*) FROM event_registrations WHERE id IN ('b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e','49195661-9b43-429f-a5b5-97971e3fb544','ed9f7e76-001b-487e-b45e-28fcfec3281c','a68d37a1-1287-4a10-ad9f-b8f34529c783')) AS remaining_target_registrations,
    (SELECT COUNT(*) FROM registration_members WHERE registration_id IN ('b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e','49195661-9b43-429f-a5b5-97971e3fb544','ed9f7e76-001b-487e-b45e-28fcfec3281c','a68d37a1-1287-4a10-ad9f-b8f34529c783') OR user_id IN ('050ede31-504e-4c73-b249-fc278e977739','5a8545b8-79fb-460c-816f-74d91c670908','435b3e89-d70e-43d1-ac72-fa8d80047db4','e185eb2e-f3e3-4716-81c2-cdf387f8430e','76663c21-e2f4-4985-99d1-08e7760db7d8')) AS remaining_target_members;

DO $$
DECLARE
    users_rem integer;
    regs_rem integer;
    mems_rem integer;
BEGIN
    SELECT COUNT(*) INTO users_rem FROM users WHERE id IN ('050ede31-504e-4c73-b249-fc278e977739','5a8545b8-79fb-460c-816f-74d91c670908','435b3e89-d70e-43d1-ac72-fa8d80047db4','e185eb2e-f3e3-4716-81c2-cdf387f8430e','76663c21-e2f4-4985-99d1-08e7760db7d8');
    SELECT COUNT(*) INTO regs_rem FROM event_registrations WHERE id IN ('b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e','49195661-9b43-429f-a5b5-97971e3fb544','ed9f7e76-001b-487e-b45e-28fcfec3281c','a68d37a1-1287-4a10-ad9f-b8f34529c783');
    SELECT COUNT(*) INTO mems_rem FROM registration_members WHERE registration_id IN ('b86bd8f2-24f1-4bb3-83dd-86cdcb5a932e','49195661-9b43-429f-a5b5-97971e3fb544','ed9f7e76-001b-487e-b45e-28fcfec3281c','a68d37a1-1287-4a10-ad9f-b8f34529c783') OR user_id IN ('050ede31-504e-4c73-b249-fc278e977739','5a8545b8-79fb-460c-816f-74d91c670908','435b3e89-d70e-43d1-ac72-fa8d80047db4','e185eb2e-f3e3-4716-81c2-cdf387f8430e','76663c21-e2f4-4985-99d1-08e7760db7d8');

    IF users_rem > 0 OR regs_rem > 0 OR mems_rem > 0 THEN
        RAISE EXCEPTION 'Cleanup validation failed: Target records still remain (users=%, regs=%, members=%)', users_rem, regs_rem, mems_rem;
    END IF;
END $$;

COMMIT;
