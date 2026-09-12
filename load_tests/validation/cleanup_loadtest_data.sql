-- CyberCarnival Safe Load Test Data Cleanup Script
-- Removes ONLY records prefixed with 'loadtest_' created during load testing.
-- Safe to execute against staging/development databases. NEVER affects real user accounts.

BEGIN;

-- 1. Delete registration_members belonging to load test registrations or load test users
DELETE FROM registration_members
WHERE registration_id IN (
    SELECT r.id
    FROM event_registrations r
    JOIN users u ON r.leader_user_id = u.id
    WHERE u.email LIKE 'loadtest_%' OR u.google_sub LIKE 'loadtest_%'
)
OR user_id IN (
    SELECT id FROM users WHERE email LIKE 'loadtest_%' OR google_sub LIKE 'loadtest_%'
);

-- 2. Delete event_registrations created by load test users
DELETE FROM event_registrations
WHERE leader_user_id IN (
    SELECT id FROM users WHERE email LIKE 'loadtest_%' OR google_sub LIKE 'loadtest_%'
);

-- 3. Delete load test user accounts
DELETE FROM users
WHERE email LIKE 'loadtest_%' OR google_sub LIKE 'loadtest_%';

COMMIT;

-- Print summary confirmation
SELECT 'Cleanup complete. Remaining loadtest users:' as status, COUNT(*) as remaining_count
FROM users WHERE email LIKE 'loadtest_%';
