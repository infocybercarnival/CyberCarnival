"""
SQLAlchemy models for the CyberCarnival relational database.
Production uses PostgreSQL/Supabase. PostgreSQL bootstrap SQL is kept under
backend/postgres/. db.create_all() remains a safety net for missing tables,
but production schema/data should be imported explicitly.
"""
import time
import uuid

import config
from extensions import db


def new_uuid() -> str:
    return str(uuid.uuid4())


class Admin(db.Model):
    __tablename__ = "admins"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    username = db.Column(db.String(64), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())


class OtpVerification(db.Model):
    __tablename__ = "otp_verifications"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    email = db.Column(db.String(255), nullable=False, index=True)
    otp_hash = db.Column(db.String(255), nullable=False)
    purpose = db.Column(db.String(32), nullable=False, default="signup")
    attempts = db.Column(db.SmallInteger, nullable=False, default=0)
    max_attempts = db.Column(db.SmallInteger, nullable=False, default=5)
    consumed_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    cybercarnival_token = db.Column(db.String(16), nullable=False, unique=True, index=True)
    username = db.Column(db.String(32), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    must_change_password = db.Column(db.Boolean, nullable=False, default=True)
    email = db.Column(db.String(255), nullable=False, unique=True, index=True)
    full_name = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    college = db.Column(db.String(150), nullable=True)
    is_srm_ramapuram = db.Column(db.Boolean, nullable=False, default=False)
    register_number = db.Column(db.String(40), nullable=True)
    profile_completed = db.Column(db.Boolean, nullable=False, default=False)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    google_sub = db.Column(db.String(255), nullable=True, unique=True, index=True)
    auth_provider = db.Column(db.String(32), nullable=False, default="otp")
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())

    def to_public_dict(self):
        return {
            "id": self.id,
            "cybercarnival_token": self.cybercarnival_token,
            "username": self.username,
            "email": self.email,
            "auth_provider": self.auth_provider,

            "full_name": self.full_name,
            "phone": self.phone,
            "college": self.college,
            "is_srm_ramapuram": self.is_srm_ramapuram,
            "register_number": self.register_number,
            "profile_completed": self.profile_completed,
        }


class Event(db.Model):
    __tablename__ = "events"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    name = db.Column(db.String(150), nullable=False)
    category = db.Column(db.String(30), nullable=False, default="TECHNICAL")
    tag = db.Column(db.String(40), nullable=True)
    description = db.Column(db.Text, nullable=True)
    poster_url = db.Column(db.String(500), nullable=True)
    venue = db.Column(db.String(200), nullable=True)
    event_date = db.Column(db.String(60), nullable=True)
    # Real dates for the same-day conflict check — event_date above stays as
    # free display text ("7 & 8 OCTOBER") since that's what admins actually
    # type; these are separate, admin-set-later fields purely for comparing
    # ranges. Nullable on purpose: an event without these set yet is simply
    # excluded from the conflict check rather than treated as a false match.
    event_start_date = db.Column(db.Date, nullable=True)
    event_end_date = db.Column(db.Date, nullable=True)
    event_time = db.Column(db.String(60), nullable=True)
    fee = db.Column(db.String(60), nullable=True)
    # Real amount for Razorpay — fee above stays free display text ("₹250
    # PER TEAM", "FREE") since that's what admins actually type; this is the
    # separate, admin-set numeric field payment actually runs on. In PAISE
    # (Razorpay's base unit — ₹250 = 25000), not rupees. Null or 0 = free
    # event, registration confirms immediately with no payment step.
    fee_amount = db.Column(db.Integer, nullable=True)
    min_team_size = db.Column(db.SmallInteger, nullable=True)
    max_team_size = db.Column(db.SmallInteger, nullable=True)
    max_teams = db.Column(db.Integer, nullable=True)
    prize = db.Column(db.String(120), nullable=True)
    active = db.Column(db.Boolean, nullable=False, default=True)
    # Distinct from `active` (which hides the event entirely). This is the
    # coordinator's "close registration" switch — event stays visible/listed,
    # just stops accepting new teams. Defaults open; coordinators/admins close
    # it explicitly once they've got enough entries or the deadline passes.
    registration_open = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())

    def seats_available(self):
        if self.max_teams is None:
            return None
        confirmed = EventRegistration.query.filter_by(event_id=self.id, status="confirmed").count()
        return max(self.max_teams - confirmed, 0)

    def teams_registered(self):
        return EventRegistration.query.filter_by(event_id=self.id, status="confirmed").count()

    def to_public_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "category": self.category,
            "tag": self.tag,
            "description": self.description,
            "poster_url": (f"{config.SITE_URL}{self.poster_url}" if self.poster_url and self.poster_url.startswith("/") else self.poster_url),
            "venue": self.venue,
            "date": self.event_date,
            "start_date": self.event_start_date.isoformat() if self.event_start_date else None,
            "end_date": self.event_end_date.isoformat() if self.event_end_date else None,
            "time": self.event_time,
            "fee": self.fee,
            "fee_amount": self.fee_amount,
            "min_team_size": self.min_team_size,
            "max_team_size": self.max_team_size,
            "max_teams": self.max_teams,
            "teams_registered": self.teams_registered(),
            "seats_available": self.seats_available(),
            "prize": self.prize,
            "registration_open": self.registration_open,
        }

    def to_admin_dict(self):
        d = self.to_public_dict()
        d["active"] = self.active
        d["created_at"] = self.created_at.timestamp() if self.created_at else None
        return d


class Coordinator(db.Model):
    """A per-event login the super admin creates and hands off (over
    WhatsApp, per how this project actually shares credentials) to a
    student/event coordinator. Scoped to only the event(s) assigned via
    CoordinatorEvent — never sees anything outside that."""
    __tablename__ = "coordinators"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    username = db.Column(db.String(64), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(120), nullable=True)
    phone = db.Column(db.String(20), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=db.func.now())

    events = db.relationship("Event", secondary="coordinator_events", backref="coordinators")

    def to_admin_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "full_name": self.full_name,
            "phone": self.phone,
            "is_active": self.is_active,
            "created_at": self.created_at.timestamp() if self.created_at else None,
            "event_ids": [e.id for e in self.events],
            "event_names": [e.name for e in self.events],
        }


class CoordinatorEvent(db.Model):
    """Junction table — a coordinator can be assigned more than one event
    (some run two), and in principle an event could have more than one
    coordinator, though the admin UI defaults to assigning one at a time."""
    __tablename__ = "coordinator_events"
    __table_args__ = (db.UniqueConstraint("coordinator_id", "event_id", name="uq_coordinator_event"),)

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    coordinator_id = db.Column(db.String(36), db.ForeignKey("coordinators.id", ondelete="CASCADE"), nullable=False)
    event_id = db.Column(db.String(36), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    created_at = db.Column(db.DateTime, default=db.func.now())


class EventRegistration(db.Model):
    __tablename__ = "event_registrations"
    __table_args__ = (db.UniqueConstraint("id", "event_id", name="uq_event_registrations_id_event"),)

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    event_id = db.Column(db.String(36), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    team_name = db.Column(db.String(120), nullable=True)
    leader_user_id = db.Column(db.String(36), db.ForeignKey("users.id"), nullable=False)
    # Paid registrations are submitted only after the participant enters the
    # UPI transaction/reference ID. They remain pending_verification until an
    # admin/coordinator verifies the payment and confirms them. Free events
    # are confirmed immediately.
    status = db.Column(db.String(24), nullable=False, default="confirmed")
    participant_mode = db.Column(db.String(16), nullable=False, default="individual")
    transaction_id = db.Column(db.String(80), nullable=True, unique=True, index=True)
    payment_amount = db.Column(db.Integer, nullable=True)  # paise snapshot at registration time
    payment_submitted_at = db.Column(db.DateTime, nullable=True)
    payment_verified_at = db.Column(db.DateTime, nullable=True)
    payment_verified_by = db.Column(db.String(120), nullable=True)

    payment_proof_filename = db.Column(db.String(255), nullable=True)
    payment_proof_mime_type = db.Column(db.String(64), nullable=True)
    payment_proof_size = db.Column(db.Integer, nullable=True)
    disclaimer_accepted = db.Column(db.Boolean, nullable=False, default=False)
    disclaimer_accepted_at = db.Column(db.DateTime, nullable=True)

    # Legacy Razorpay columns kept nullable so existing databases can migrate
    # without losing historical records. New registrations do not use them.
    razorpay_order_id = db.Column(db.String(64), nullable=True)
    razorpay_payment_id = db.Column(db.String(64), nullable=True, unique=True, index=True)
    payment_expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=db.func.now())

    event = db.relationship("Event")
    leader = db.relationship("User", foreign_keys=[leader_user_id])
    members = db.relationship("RegistrationMember", backref="registration", cascade="all, delete-orphan", foreign_keys="[RegistrationMember.registration_id]")


class RegistrationMember(db.Model):
    __tablename__ = "registration_members"
    __table_args__ = (
        db.UniqueConstraint("registration_id", "user_id", name="uq_member_once_per_event"),
        db.ForeignKeyConstraint(
            ["registration_id", "event_id"],
            ["event_registrations.id", "event_registrations.event_id"],
            name="fk_registration_members_registration_event",
            ondelete="CASCADE",
        ),
    )

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    registration_id = db.Column(db.String(36), db.ForeignKey("event_registrations.id", ondelete="CASCADE"), nullable=False)
    event_id = db.Column(db.String(36), db.ForeignKey("events.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.String(36), db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_leader = db.Column(db.Boolean, nullable=False, default=False)
    active_registration = db.Column(db.Boolean, nullable=False, default=True)
    joined_at = db.Column(db.DateTime, default=db.func.now())

    user = db.relationship("User")



class WebhookEvent(db.Model):
    __tablename__ = "webhook_events"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    event_id = db.Column(db.String(128), nullable=False, unique=True, index=True)
    event_type = db.Column(db.String(64), nullable=False)
    processed_at = db.Column(db.DateTime, default=db.func.now())


class Speaker(db.Model):
    """Managed entirely from the admin panel's Speakers tab — replaces what
    used to be a hardcoded array baked into the frontend component."""
    __tablename__ = "speakers"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    name = db.Column(db.String(120), nullable=False)
    designation = db.Column(db.String(150), nullable=True)
    organization = db.Column(db.String(150), nullable=True)
    category = db.Column(db.String(30), nullable=False, default="INDUSTRY")
    portrait_url = db.Column(db.String(500), nullable=True)
    bio = db.Column(db.Text, nullable=True)
    expertise = db.Column(db.JSON, nullable=True)  # list[str]
    session_title = db.Column(db.String(200), nullable=True)
    session_time = db.Column(db.String(60), nullable=True)
    session_venue = db.Column(db.String(150), nullable=True)
    twitter_url = db.Column(db.String(300), nullable=True)
    linkedin_url = db.Column(db.String(300), nullable=True)
    github_url = db.Column(db.String(300), nullable=True)
    is_featured = db.Column(db.Boolean, nullable=False, default=False)
    display_order = db.Column(db.Integer, nullable=False, default=0)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, default=db.func.now())
    updated_at = db.Column(db.DateTime, default=db.func.now(), onupdate=db.func.now())

    def to_public_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "designation": self.designation,
            "organization": self.organization,
            "category": self.category,
            "portrait_url": self.portrait_url,
            "bio": self.bio,
            "expertise": self.expertise or [],
            "session_title": self.session_title,
            "session_time": self.session_time,
            "session_venue": self.session_venue,
            "socials": {
                "twitter": self.twitter_url,
                "linkedin": self.linkedin_url,
                "github": self.github_url,
            },
            "is_featured": self.is_featured,
        }

    def to_admin_dict(self):
        d = self.to_public_dict()
        d["display_order"] = self.display_order
        d["active"] = self.active
        return d


class AuditLogEntry(db.Model):
    __tablename__ = "audit_log"

    id = db.Column(db.String(36), primary_key=True, default=new_uuid)
    actor = db.Column(db.String(120), nullable=True)
    action = db.Column(db.String(80), nullable=False)
    target = db.Column(db.String(120), nullable=True)
    meta_json = db.Column(db.JSON, nullable=True)
    created_at = db.Column(db.DateTime, default=db.func.now())