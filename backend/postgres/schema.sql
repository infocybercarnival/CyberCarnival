-- CyberCarnival PostgreSQL / Supabase schema
-- Generated for the Render + Supabase deployment.
-- Safe bootstrap order: run this file first, then data.sql.

BEGIN;

DROP TABLE IF EXISTS registration_members CASCADE;
DROP TABLE IF EXISTS coordinator_events CASCADE;
DROP TABLE IF EXISTS event_registrations CASCADE;
DROP TABLE IF EXISTS webhook_events CASCADE;
DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS otp_verifications CASCADE;
DROP TABLE IF EXISTS speakers CASCADE;
DROP TABLE IF EXISTS coordinators CASCADE;
DROP TABLE IF EXISTS events CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS admins CASCADE;

CREATE TABLE admins (
  id varchar(36) PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
  id varchar(36) PRIMARY KEY,
  cybercarnival_token varchar(16) NOT NULL UNIQUE,
  username varchar(32) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  must_change_password boolean NOT NULL DEFAULT true,
  email varchar(255) NOT NULL UNIQUE,
  full_name varchar(120),
  phone varchar(20),
  college varchar(150),
  is_srm_ramapuram boolean NOT NULL DEFAULT false,
  register_number varchar(40),
  profile_completed boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  google_sub varchar(255) UNIQUE,
  auth_provider varchar(32) NOT NULL DEFAULT 'otp'
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_token ON users(cybercarnival_token);
CREATE INDEX idx_users_google_sub ON users(google_sub);

CREATE TABLE events (
  id varchar(36) PRIMARY KEY,
  name varchar(150) NOT NULL,
  category varchar(30) NOT NULL DEFAULT 'TECHNICAL',
  tag varchar(40),
  description text,
  poster_url varchar(500),
  venue varchar(200),
  event_date varchar(60),
  event_time varchar(60),
  fee varchar(60),
  min_team_size smallint,
  max_team_size smallint,
  max_teams integer,
  prize varchar(120),
  active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  registration_open boolean NOT NULL DEFAULT true,
  event_start_date date,
  event_end_date date,
  fee_amount integer,
  CONSTRAINT ck_events_min_team_positive CHECK (min_team_size IS NULL OR min_team_size >= 1),
  CONSTRAINT ck_events_max_team_positive CHECK (max_team_size IS NULL OR max_team_size >= 1),
  CONSTRAINT ck_events_team_range CHECK (min_team_size IS NULL OR max_team_size IS NULL OR min_team_size <= max_team_size),
  CONSTRAINT ck_events_max_teams_nonnegative CHECK (max_teams IS NULL OR max_teams >= 0),
  CONSTRAINT ck_events_fee_nonnegative CHECK (fee_amount IS NULL OR fee_amount >= 0)
);

CREATE TABLE coordinators (
  id varchar(36) PRIMARY KEY,
  username varchar(64) NOT NULL UNIQUE,
  password_hash varchar(255) NOT NULL,
  full_name varchar(120),
  phone varchar(20),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE otp_verifications (
  id varchar(36) PRIMARY KEY,
  email varchar(255) NOT NULL,
  otp_hash varchar(255) NOT NULL,
  purpose varchar(32) NOT NULL DEFAULT 'signup',
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  consumed_at timestamp without time zone,
  expires_at timestamp without time zone NOT NULL,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_otp_email ON otp_verifications(email);
CREATE INDEX idx_otp_expires ON otp_verifications(expires_at);

CREATE TABLE speakers (
  id varchar(36) PRIMARY KEY,
  name varchar(120) NOT NULL,
  designation varchar(150),
  organization varchar(150),
  category varchar(30) NOT NULL DEFAULT 'INDUSTRY',
  portrait_url varchar(500),
  bio text,
  expertise jsonb,
  session_title varchar(200),
  session_time varchar(60),
  session_venue varchar(150),
  twitter_url varchar(300),
  linkedin_url varchar(300),
  github_url varchar(300),
  is_featured boolean NOT NULL DEFAULT false,
  display_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE event_registrations (
  id varchar(36) PRIMARY KEY,
  event_id varchar(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_name varchar(120),
  leader_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status varchar(24) NOT NULL DEFAULT 'confirmed',
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payment_expires_at timestamp without time zone,
  razorpay_payment_id varchar(64) UNIQUE,
  razorpay_order_id varchar(64),
  participant_mode varchar(16) NOT NULL DEFAULT 'individual',
  transaction_id varchar(80) UNIQUE,
  payment_amount integer,
  payment_submitted_at timestamp without time zone,
  payment_verified_at timestamp without time zone,
  payment_verified_by varchar(120),
  CONSTRAINT ck_registration_status CHECK (status IN ('confirmed','pending_verification','cancelled')),
  CONSTRAINT ck_participant_mode CHECK (participant_mode IN ('individual','team')),
  CONSTRAINT ck_payment_amount_nonnegative CHECK (payment_amount IS NULL OR payment_amount >= 0)
);
CREATE INDEX idx_reg_event ON event_registrations(event_id, status);
CREATE INDEX ix_event_registrations_transaction_id ON event_registrations(transaction_id);
CREATE INDEX ix_event_registrations_razorpay_payment_id ON event_registrations(razorpay_payment_id);

CREATE TABLE registration_members (
  id varchar(36) PRIMARY KEY,
  registration_id varchar(36) NOT NULL REFERENCES event_registrations(id) ON DELETE CASCADE,
  user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_leader boolean NOT NULL DEFAULT false,
  joined_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_member_once_per_event UNIQUE (registration_id, user_id)
);
CREATE INDEX idx_registration_members_user ON registration_members(user_id);

CREATE TABLE coordinator_events (
  id varchar(36) PRIMARY KEY,
  coordinator_id varchar(36) NOT NULL REFERENCES coordinators(id) ON DELETE CASCADE,
  event_id varchar(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  created_at timestamp without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_coordinator_event UNIQUE (coordinator_id, event_id)
);
CREATE INDEX idx_coordinator_events_event ON coordinator_events(event_id);

CREATE TABLE webhook_events (
  id varchar(36) PRIMARY KEY,
  event_id varchar(128) NOT NULL UNIQUE,
  event_type varchar(64) NOT NULL,
  processed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE audit_log (
  id varchar(36) PRIMARY KEY,
  actor varchar(120),
  action varchar(80) NOT NULL,
  target varchar(120),
  meta_json jsonb,
  created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);

COMMIT;
