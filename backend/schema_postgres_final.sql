-- ============================================================================
-- CyberCarnival Authoritative Production PostgreSQL Schema for Supabase
-- Target Database: Supabase PostgreSQL (PostgreSQL 15+)
-- Derived directly from current SQLAlchemy models (backend/models.py) and
-- active application logic (services & routes).
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. ADMINS TABLE
-- Production admin authentication table. (No default credentials inserted)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 2. USERS TABLE
-- Master participant account profiles.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    cybercarnival_token VARCHAR(16) NOT NULL UNIQUE,
    username VARCHAR(32) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN NOT NULL DEFAULT TRUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(120),
    phone VARCHAR(20),
    college VARCHAR(150),
    is_srm_ramapuram BOOLEAN NOT NULL DEFAULT FALSE,
    register_number VARCHAR(40),
    profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    google_sub VARCHAR(255) UNIQUE,
    auth_provider VARCHAR(32) NOT NULL DEFAULT 'otp',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_cybercarnival_token ON users(cybercarnival_token);
CREATE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub);

-- ----------------------------------------------------------------------------
-- 3. EVENTS TABLE
-- Master technical & non-technical event catalog.
-- Note: fee_amount stores price in PAISE (e.g. ₹200 = 20000 paise).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(30) NOT NULL DEFAULT 'TECHNICAL',
    tag VARCHAR(40),
    description TEXT,
    poster_url VARCHAR(500),
    venue VARCHAR(200),
    event_date VARCHAR(60),
    event_start_date DATE,
    event_end_date DATE,
    event_time VARCHAR(60),
    fee VARCHAR(60),
    fee_amount INTEGER,
    min_team_size SMALLINT,
    max_team_size SMALLINT,
    max_teams INTEGER,
    prize VARCHAR(120),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    registration_open BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_events_min_team_positive CHECK (min_team_size IS NULL OR min_team_size >= 1),
    CONSTRAINT ck_events_max_team_positive CHECK (max_team_size IS NULL OR max_team_size >= 1),
    CONSTRAINT ck_events_team_range CHECK (min_team_size IS NULL OR max_team_size IS NULL OR min_team_size <= max_team_size),
    CONSTRAINT ck_events_max_teams_nonnegative CHECK (max_teams IS NULL OR max_teams >= 0),
    CONSTRAINT ck_events_fee_nonnegative CHECK (fee_amount IS NULL OR fee_amount >= 0)
);

-- ----------------------------------------------------------------------------
-- 4. COORDINATORS TABLE
-- Master coordinator account profiles.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coordinators (
    id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120),
    phone VARCHAR(20),
    email VARCHAR(255),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 5. COORDINATOR_EVENTS TABLE
-- Event ↔ Coordinator junction table with event-specific role assignment.
-- Roles: FACULTY, STUDENT
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coordinator_events (
    id VARCHAR(36) PRIMARY KEY,
    coordinator_id VARCHAR(36) NOT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
    event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'STUDENT',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_coordinator_event UNIQUE (coordinator_id, event_id),
    CONSTRAINT ck_coordinator_event_role CHECK (role IN ('FACULTY', 'STUDENT'))
);

CREATE INDEX IF NOT EXISTS idx_coordinator_events_event ON coordinator_events(event_id);
CREATE INDEX IF NOT EXISTS idx_coordinator_events_coordinator ON coordinator_events(coordinator_id);

-- ----------------------------------------------------------------------------
-- 6. OTP_VERIFICATIONS TABLE
-- One-Time Passcode challenge tokens (hashes stored, never plaintext).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS otp_verifications (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    purpose VARCHAR(32) NOT NULL DEFAULT 'signup',
    attempts SMALLINT NOT NULL DEFAULT 0,
    max_attempts SMALLINT NOT NULL DEFAULT 5,
    consumed_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_email ON otp_verifications(email);
CREATE INDEX IF NOT EXISTS idx_otp_verifications_expires ON otp_verifications(expires_at);

-- ----------------------------------------------------------------------------
-- 7. SPEAKERS TABLE
-- Featured speakers and panelists catalog.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS speakers (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    designation VARCHAR(150),
    organization VARCHAR(150),
    category VARCHAR(30) NOT NULL DEFAULT 'INDUSTRY',
    portrait_url VARCHAR(500),
    bio TEXT,
    expertise JSONB,
    session_title VARCHAR(200),
    session_time VARCHAR(60),
    session_venue VARCHAR(150),
    twitter_url VARCHAR(300),
    linkedin_url VARCHAR(300),
    github_url VARCHAR(300),
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    display_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- 8. EVENT_REGISTRATIONS TABLE
-- Team and individual event registration records.
-- Status values: pending_payment, pending_verification, confirmed, rejected
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_registrations (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_name VARCHAR(120),
    leader_user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'pending_payment',
    ticket_token VARCHAR(64),
    checked_in BOOLEAN NOT NULL DEFAULT FALSE,
    checked_in_at TIMESTAMP WITH TIME ZONE,
    checked_in_by VARCHAR(120),
    participant_mode VARCHAR(16) NOT NULL DEFAULT 'individual',
    transaction_id VARCHAR(80) UNIQUE,
    payment_amount INTEGER,
    payment_submitted_at TIMESTAMP WITH TIME ZONE,
    payment_reviewed_at TIMESTAMP WITH TIME ZONE,
    payment_reviewed_by VARCHAR(120),
    payment_verified_at TIMESTAMP WITH TIME ZONE,
    payment_verified_by VARCHAR(120),
    rejection_reason TEXT,
    payment_proof_filename VARCHAR(255),
    payment_proof_mime_type VARCHAR(64),
    payment_proof_size INTEGER,
    disclaimer_accepted BOOLEAN NOT NULL DEFAULT FALSE,
    disclaimer_accepted_at TIMESTAMP WITH TIME ZONE,
    razorpay_order_id VARCHAR(64),
    razorpay_payment_id VARCHAR(64) UNIQUE,
    payment_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_event_registrations_id_event UNIQUE (id, event_id),
    CONSTRAINT ck_registration_status CHECK (status IN ('confirmed', 'pending_verification', 'pending_payment', 'rejected')),
    CONSTRAINT ck_participant_mode CHECK (participant_mode IN ('individual', 'team')),
    CONSTRAINT ck_payment_amount_nonnegative CHECK (payment_amount IS NULL OR payment_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_event_registrations_event_id ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_registrations_event_status ON event_registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_event_registrations_leader ON event_registrations(leader_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_registrations_transaction_id ON event_registrations(transaction_id) WHERE transaction_id IS NOT NULL AND transaction_id != '';
CREATE INDEX IF NOT EXISTS idx_event_registrations_razorpay_payment_id ON event_registrations(razorpay_payment_id);

-- ----------------------------------------------------------------------------
-- 9. REGISTRATION_MEMBERS TABLE
-- Individual team member participation details linked to parent registration.
-- Includes active_registration flag synchronized with parent registration status.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS registration_members (
    id VARCHAR(36) PRIMARY KEY,
    registration_id VARCHAR(36) NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
    event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    active_registration BOOLEAN NOT NULL DEFAULT TRUE,
    participant_name VARCHAR(120),
    participant_email VARCHAR(255),
    college_name VARCHAR(150),
    participant_phone VARCHAR(20),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_member_once_per_event UNIQUE (registration_id, user_id),
    CONSTRAINT fk_registration_members_registration_event FOREIGN KEY (registration_id, event_id) REFERENCES event_registrations(id, event_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_registration_members_registration_id ON registration_members(registration_id);
CREATE INDEX IF NOT EXISTS idx_registration_members_user ON registration_members(user_id);
CREATE INDEX IF NOT EXISTS idx_registration_members_email ON registration_members(participant_email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_user_per_event ON registration_members (event_id, user_id) WHERE (active_registration = true);

-- ----------------------------------------------------------------------------
-- 10. WEBHOOK_EVENTS TABLE
-- External payment/auth provider webhook event idempotency ledger.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(36) PRIMARY KEY,
    event_id VARCHAR(128) NOT NULL UNIQUE,
    event_type VARCHAR(64) NOT NULL,
    processed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);

-- ----------------------------------------------------------------------------
-- 11. AUDIT_LOG TABLE
-- Administrative and security audit trailing log.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id VARCHAR(36) PRIMARY KEY,
    actor VARCHAR(120),
    action VARCHAR(80) NOT NULL,
    target VARCHAR(120),
    meta_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action);

-- ----------------------------------------------------------------------------
-- 12. EVENT_SEAT_COUNTS VIEW
-- Real-time seat occupancy calculation view.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW event_seat_counts AS
SELECT 
    e.id AS event_id,
    e.name AS event_name,
    e.max_teams,
    COUNT(r.id) FILTER (WHERE r.status = 'confirmed') AS confirmed_teams,
    COUNT(r.id) FILTER (WHERE r.status = 'pending_verification') AS pending_verification_teams,
    COUNT(r.id) FILTER (WHERE r.status = 'pending_payment') AS pending_payment_teams,
    CASE 
        WHEN e.max_teams IS NULL THEN NULL
        ELSE GREATEST(e.max_teams - COUNT(r.id) FILTER (WHERE r.status = 'confirmed'), 0)
    END AS seats_available
FROM events e
LEFT JOIN event_registrations r ON e.id = r.event_id
GROUP BY e.id, e.name, e.max_teams;

COMMIT;
