import datetime

from sqlalchemy.exc import IntegrityError
from extensions import db
from models import Event, EventRegistration, RegistrationMember, User
from utils.email import send_registration_confirmation_email
from utils.logger import get_logger

logger = get_logger("registration_service")


class DuplicateRegistrationError(Exception): pass
class EventNotFoundError(Exception): pass
class EventFullError(Exception): pass
class RegistrationClosedError(Exception): pass
class UnknownMemberTokenError(Exception):
    def __init__(self, token): self.token = token; super().__init__(token)
class TeamSizeError(Exception): pass
class DuplicateTransactionError(Exception): pass


def _dates_overlap(a_start, a_end, b_start, b_end) -> bool:
    a_end = a_end or a_start
    b_end = b_end or b_start
    return a_start <= b_end and b_start <= a_end


def _date_conflicts_for_user(user_id: str, event: Event) -> list[str]:
    """Same-day/overlap conflicts are warnings, never blockers."""
    if not event.event_start_date:
        return []
    rows = (
        EventRegistration.query.join(RegistrationMember, EventRegistration.id == RegistrationMember.registration_id)
        .join(Event, EventRegistration.event_id == Event.id)
        .filter(
            RegistrationMember.user_id == user_id,
            EventRegistration.status.in_(["confirmed", "pending_verification"]),
            EventRegistration.event_id != event.id,
            Event.event_start_date.isnot(None),
        )
        .with_entities(Event.name, Event.event_start_date, Event.event_end_date)
        .all()
    )
    return [name for name, start, end in rows if _dates_overlap(event.event_start_date, event.event_end_date, start, end)]


def preflight_warnings(leader: User, event_id: str) -> list[str]:
    event = db.session.get(Event, event_id)
    if not event or not event.active:
        raise EventNotFoundError(event_id)
    return _date_conflicts_for_user(leader.id, event)


def _already_registered(event_id: str, user_id: str) -> bool:
    return (
        RegistrationMember.query.join(EventRegistration, RegistrationMember.registration_id == EventRegistration.id)
        .filter(
            EventRegistration.event_id == event_id,
            EventRegistration.status.in_(["confirmed", "pending_verification"]),
            RegistrationMember.user_id == user_id,
        )
        .with_for_update()
        .first() is not None
    )


def _validate_team_size(event: Event, mode: str, member_count: int) -> None:
    total = 1 + member_count
    if mode == "individual":
        if total != 1:
            raise TeamSizeError("individual registration cannot include teammates")
        if event.min_team_size and event.min_team_size > 1:
            raise TeamSizeError(f"this event requires a team of at least {event.min_team_size}")
    else:
        if event.max_team_size == 1:
            raise TeamSizeError("this event only accepts individual registrations")
        minimum = event.min_team_size or 2
        maximum = event.max_team_size or 11
        if total < minimum or total > maximum:
            raise TeamSizeError(f"team size must be between {minimum} and {maximum}")


class InvalidPaymentStateError(Exception): pass
class DisclaimerNotAcceptedError(Exception): pass
class InvalidPaymentFileError(Exception): pass
class PaymentFileTooLargeError(Exception): pass
class UnauthorizedRegistrationAccessError(Exception): pass
class UnconfiguredFeeError(Exception): pass


def get_effective_fee_amount(event: Event) -> int:
    if event.fee_amount is not None and event.fee_amount > 0:
        return event.fee_amount
    if not event.fee:
        return 0
    fee_str = str(event.fee).upper().strip()
    if "FREE" in fee_str or fee_str in ["0", "NONE", "N/A", "TBA", "—"]:
        return 0
    m = re.search(r"(\d+)", fee_str)
    if m:
        try:
            return int(m.group(1)) * 100
        except ValueError:
            pass
    return 0


def register_for_event(leader: User, clean_data: dict) -> tuple[EventRegistration, list[str]]:
    event = db.session.query(Event).filter_by(id=clean_data["event_id"]).with_for_update().first()
    if not event or not event.active:
        raise EventNotFoundError(clean_data["event_id"])
    if not event.registration_open:
        raise RegistrationClosedError(event.id)

    if event.max_teams is not None:
        # The event row above is already locked FOR UPDATE, which serializes
        # registrations for this event. Do not apply FOR UPDATE to COUNT(*) —
        # PostgreSQL rejects row locks on aggregate queries.
        locked_count = (
            db.session.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event.id,
                EventRegistration.status.in_(["confirmed", "pending_verification"]),
            )
            .count()
        )
        if locked_count >= event.max_teams:
            raise EventFullError(event.id)

    if _already_registered(event.id, leader.id):
        raise DuplicateRegistrationError(leader.id)

    effective_fee = get_effective_fee_amount(event)
    if effective_fee <= 0:
        raise UnconfiguredFeeError("Registration for this event is currently unavailable because the event fee is pending configuration.")

    # Check if leader has an abandoned pending_payment registration for this event
    existing_pending = (
        EventRegistration.query.filter_by(
            event_id=event.id,
            leader_user_id=leader.id,
            status="pending_payment"
        ).order_by(EventRegistration.created_at.desc()).first()
    )
    if existing_pending:
        warnings = [f"Resuming your pending payment for {event.name}."]
        return existing_pending, warnings

    raw_tokens = clean_data.get("member_tokens", [])
    mode = clean_data.get("participant_mode", "individual")
    _validate_team_size(event, mode, len(raw_tokens))

    member_users = []
    seen = {leader.id}
    warnings = []
    for name in _date_conflicts_for_user(leader.id, event):
        warnings.append(f"You are already registered for {name} on an overlapping date/time. You can still continue.")

    for token in raw_tokens:
        tok_clean = token.strip().upper()
        if leader.cybercarnival_token and tok_clean == leader.cybercarnival_token.strip().upper():
            raise TeamSizeError("You cannot add yourself as a teammate.")
        member = User.query.filter_by(cybercarnival_token=tok_clean).first()
        if not member:
            raise UnknownMemberTokenError(token)
        if member.id in seen:
            raise TeamSizeError(f"Duplicate teammate token '{tok_clean}' in team roster.")
        seen.add(member.id)
        if _already_registered(event.id, member.id):
            raise DuplicateRegistrationError(member.id)
        member_users.append(member)
        for name in _date_conflicts_for_user(member.id, event):
            warnings.append(f"{member.full_name or member.username} is already registered for {name} on an overlapping date/time. Registration is still allowed.")

    _validate_team_size(event, mode, len(member_users))

    registration = EventRegistration(
        event_id=event.id,
        team_name=(clean_data.get("team_name") or None) if mode == "team" else None,
        leader_user_id=leader.id,
        participant_mode=mode,
        transaction_id=None,
        payment_amount=effective_fee,
        payment_submitted_at=None,
        status="pending_payment",
    )
    db.session.add(registration)
    db.session.flush()

    is_active = (registration.status in ["confirmed", "pending_verification"])
    db.session.add(RegistrationMember(registration_id=registration.id, event_id=event.id, user_id=leader.id, is_leader=True, active_registration=is_active))
    for member in member_users:
        db.session.add(RegistrationMember(registration_id=registration.id, event_id=event.id, user_id=member.id, is_leader=False, active_registration=is_active))
    
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        err_str = str(e).lower()
        if "uq_active_user_per_event" in err_str or "uq_member_once_per_event" in err_str:
            raise DuplicateRegistrationError(leader.id)
        raise

    if registration.status == "confirmed":
        _send_confirmation_emails(registration, event, leader, member_users)
    return registration, warnings


def get_payment_page_details(event_id: str, registration_id: str, user_id: str) -> dict:
    import config
    reg = db.session.get(EventRegistration, registration_id)
    if not reg or reg.event_id != event_id:
        raise EventNotFoundError(registration_id)
    
    is_leader = (reg.leader_user_id == user_id)
    is_member = any(m.user_id == user_id for m in reg.members)
    if not (is_leader or is_member):
        raise UnauthorizedRegistrationAccessError()
    
    event = reg.event
    if not event:
        raise EventNotFoundError(event_id)
    
    return {
        "registration_id": reg.id,
        "event_id": event.id,
        "event_name": event.name,
        "event_description": event.description or event.short_description or "",
        "event_date": event.event_date,
        "event_time": event.event_time,
        "venue": event.venue,
        "fee_amount_paise": event.fee_amount or 0,
        "fee_amount_rupees": f"{(event.fee_amount or 0) / 100:.2f}",
        "participant_mode": reg.participant_mode,
        "team_name": reg.team_name,
        "status": reg.status,
        "transaction_id": reg.transaction_id or "",
        "disclaimer_accepted": bool(reg.disclaimer_accepted),
        "has_proof": bool(reg.payment_proof_filename),
        "upi_id": config.UPI_ID,
        "upi_payee_name": config.UPI_PAYEE_NAME,
        "upi_dummy_mode": config.UPI_DUMMY_MODE,
        "qr_url": f"/api/events/{event.id}/payment-qr",
        "members": [{"name": m.user.full_name or m.user.username, "is_leader": m.is_leader} for m in reg.members]
    }


def submit_payment_proof(registration_id: str, user_id: str, event_id: str, transaction_id: str, file, disclaimer_accepted: bool) -> EventRegistration:
    import os
    import uuid
    from utils.validators import SAFE_TEXT_RE, ValidationError
    import config

    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        raise EventNotFoundError(registration_id)
    if reg.leader_user_id != user_id:
        raise UnauthorizedRegistrationAccessError()
    if reg.event_id != event_id:
        raise EventNotFoundError(event_id)

    event = reg.event
    if not event or not event.fee_amount:
        raise InvalidPaymentStateError("This event does not require payment")

    if reg.status != "pending_payment":
        raise InvalidPaymentStateError(f"Registration status '{reg.status}' is not eligible for payment submission")

    if not disclaimer_accepted:
        raise DisclaimerNotAcceptedError("You must read and agree to the no-refund disclaimer")

    txn_clean = (transaction_id or "").strip().upper()
    if not txn_clean or len(txn_clean) < 6 or len(txn_clean) > 80 or not SAFE_TEXT_RE.match(txn_clean):
        raise ValidationError({"transaction_id": "Enter a valid UPI transaction/reference ID (6-80 characters)"})

    # Check if transaction_id is already used by another registration
    existing_txn = EventRegistration.query.filter(
        EventRegistration.transaction_id == txn_clean,
        EventRegistration.id != reg.id
    ).first()
    if existing_txn:
        raise DuplicateTransactionError(txn_clean)

    if not file or not getattr(file, "filename", None):
        raise InvalidPaymentFileError("Payment proof screenshot file is required")

    # Read and check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > config.MAX_PAYMENT_PROOF_SIZE_BYTES:
        raise PaymentFileTooLargeError("File size exceeds the 5 MB limit")

    filename = file.filename.lower()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in config.ALLOWED_PAYMENT_PROOF_EXTENSIONS:
        raise InvalidPaymentFileError("Only JPG, JPEG, and PNG image files are allowed")

    # Inspect magic bytes
    header = file.read(16)
    file.seek(0)

    is_jpeg = header.startswith(b"\xff\xd8\xff")
    is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
    if not (is_jpeg or is_png):
        raise InvalidPaymentFileError("Uploaded file content is not a valid JPG or PNG image")

    mime_type = "image/jpeg" if is_jpeg else "image/png"

    safe_filename = f"proof_{reg.id}_{uuid.uuid4().hex[:8]}.{ext}"
    dest_path = config.PAYMENT_PROOF_DIR / safe_filename
    if hasattr(file, "save"):
        file.save(str(dest_path))
    else:
        with open(dest_path, "wb") as f:
            f.write(file.getvalue() if hasattr(file, "getvalue") else file.read())

    reg.transaction_id = txn_clean
    reg.payment_amount = event.fee_amount
    reg.payment_submitted_at = datetime.datetime.utcnow()
    reg.payment_proof_filename = safe_filename
    reg.payment_proof_mime_type = mime_type
    reg.payment_proof_size = file_size
    reg.disclaimer_accepted = True
    reg.disclaimer_accepted_at = datetime.datetime.utcnow()
    reg.status = "confirmed"
    reg.payment_verified_at = datetime.datetime.utcnow()
    reg.payment_verified_by = "auto_payment_submission"
    for m in reg.members:
        m.active_registration = True

    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        err_str = str(e).lower()
        if "transaction_id" in err_str or "uq_event_registrations_transaction_id" in err_str:
            raise DuplicateTransactionError(txn_clean)
        raise

    # Trigger ticket availability & send confirmation email immediately
    member_users = [m.user for m in reg.members if not m.is_leader]
    _send_confirmation_emails(reg, reg.event, reg.leader, member_users)

    return reg


def verify_manual_payment(registration_id: str, actor: str, approved: bool) -> bool:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        return False
    if approved:
        reg.status = "confirmed"
        reg.payment_verified_at = datetime.datetime.utcnow()
        reg.payment_verified_by = actor
        for m in reg.members:
            m.active_registration = True
        db.session.commit()
        member_users = [m.user for m in reg.members if not m.is_leader]
        _send_confirmation_emails(reg, reg.event, reg.leader, member_users)
    else:
        reg.status = "cancelled"
        reg.payment_verified_at = datetime.datetime.utcnow()
        reg.payment_verified_by = actor
        for m in reg.members:
            m.active_registration = False
        db.session.commit()
    return True


def _send_confirmation_emails(registration, event, leader, member_users) -> None:
    all_members = [leader, *member_users]
    roster = [m.full_name or m.username for m in all_members]
    for member in all_members:
        try:
            send_registration_confirmation_email(
                member.email,
                recipient_name=member.full_name or member.username,
                event_name=event.name,
                registration_id=registration.id,
                team_name=registration.team_name,
                event_date=event.event_date,
                event_time=event.event_time,
                venue=event.venue,
                fee=event.fee,
                members=roster,
            )
        except Exception:
            logger.exception("failed to send registration confirmation email to=%s registration=%s", member.email, registration.id)


def member_preview(token: str):
    """Return only the fields a team leader needs to verify a teammate.

    Email and phone are deliberately excluded: the coordinator/admin can see
    full contact details after a registration is submitted, while this public
    participant flow avoids turning CyberCarnival tokens into a contact-info
    lookup service.
    """
    token = (token or "").strip().upper()
    if not token or len(token) > 32:
        return None
    user = User.query.filter_by(cybercarnival_token=token, is_active=True).first()
    if not user:
        return None
    return {
        "cybercarnival_token": user.cybercarnival_token,
        "name": user.full_name or user.username,
        "college": user.college,
        "register_number": user.register_number,
    }

def list_registrations(event_id: str = None) -> list:
    q = EventRegistration.query
    if event_id:
        q = q.filter_by(event_id=event_id)
    return q.order_by(EventRegistration.created_at.desc()).all()


def get_registration(registration_id: str):
    return db.session.get(EventRegistration, registration_id)


def set_status(registration_id: str, status: str) -> bool:
    allowed = {"confirmed", "cancelled", "pending_verification"}
    if status not in allowed:
        raise ValueError("invalid status")
    reg = get_registration(registration_id)
    if not reg: return False

    active = status in {"confirmed", "pending_verification"}
    if active and reg.status == "cancelled":
        # Check if any member is in another active registration for this event
        for m in reg.members:
            if _already_registered(reg.event_id, m.user_id):
                raise DuplicateRegistrationError(m.user_id)

    reg.status = status
    for m in reg.members:
        m.active_registration = active
    
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        err_str = str(e).lower()
        if "uq_active_user_per_event" in err_str or "uq_member_once_per_event" in err_str:
            raise DuplicateRegistrationError(reg.leader_user_id)
        raise
    return True


def delete_registration(registration_id: str) -> bool:
    reg = get_registration(registration_id)
    if not reg: return False
    db.session.delete(reg); db.session.commit(); return True


def counts_by_event() -> dict:
    rows = (db.session.query(EventRegistration.event_id, db.func.count(EventRegistration.id))
            .filter(EventRegistration.status == "confirmed")
            .group_by(EventRegistration.event_id).all())
    return {event_id: count for event_id, count in rows}


def registered_user_ids() -> set:
    rows = (db.session.query(RegistrationMember.user_id)
            .join(EventRegistration, RegistrationMember.registration_id == EventRegistration.id)
            .filter(EventRegistration.status.in_(["confirmed", "pending_verification"]))
            .distinct().all())
    return {r[0] for r in rows}
