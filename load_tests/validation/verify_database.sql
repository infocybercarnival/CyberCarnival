-- CyberCarnival Database Concurrency Integrity Verification Queries
-- Run after load testing to verify race conditions, duplicate tokens, and capacity consistency.

-- 1. Check for Duplicate Ticket Tokens
SELECT ticket_token, COUNT(*) as duplicate_count
FROM event_registrations
WHERE ticket_token IS NOT NULL AND ticket_token != ''
GROUP BY ticket_token
HAVING COUNT(*) > 1;

-- 2. Check for Duplicate Active Registrations (Same User registered multiple times for Same Event)
SELECT event_id, leader_user_id, COUNT(*) as duplicate_registration_count
FROM event_registrations
WHERE status IN ('confirmed', 'pending_verification', 'pending_payment')
GROUP BY event_id, leader_user_id
HAVING COUNT(*) > 1;

-- 3. Check for Duplicate Teammate Email Registrations in Same Event
SELECT event_id, LOWER(participant_email) as email, COUNT(*) as duplicate_member_count
FROM registration_members
WHERE active_registration = true
GROUP BY event_id, LOWER(participant_email)
HAVING COUNT(*) > 1;

-- 4. Check for Exceeded Event Capacities
SELECT e.id, e.name, e.max_teams, COUNT(r.id) as confirmed_registrations
FROM events e
JOIN event_registrations r ON e.id = r.event_id
WHERE r.status = 'confirmed' AND e.max_teams IS NOT NULL
GROUP BY e.id, e.name, e.max_teams
HAVING COUNT(r.id) > e.max_teams;

-- 5. Check for Orphaned Registration Members (Members without a parent registration)
SELECT m.id, m.registration_id, m.participant_email
FROM registration_members m
LEFT JOIN event_registrations r ON m.registration_id = r.id
WHERE r.id IS NULL;

-- 6. Summary Count of Generated Load Test Data
SELECT
  (SELECT COUNT(*) FROM users WHERE email LIKE 'loadtest_%') as loadtest_users_count,
  (SELECT COUNT(*) FROM event_registrations r JOIN users u ON r.leader_user_id = u.id WHERE u.email LIKE 'loadtest_%') as loadtest_registrations_count;
