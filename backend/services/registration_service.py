import datetime
import re
import secrets

import config
from sqlalchemy.exc import IntegrityError
from extensions import db
from models import Event, EventRegistration, RegistrationMember, User
from utils.email import send_registration_confirmation_email
from utils.logger import get_logger

logger = get_logger("registration_service")


def _utc_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class DuplicateRegistrationError(Exception): pass
class EventNotFoundError(Exception): pass
class EventFullError(Exception): pass
class RegistrationClosedError(Exception): pass
class UnknownMemberTokenError(Exception):
    def __init__(self, token): self.token = token; super().__init__(token)
class TeamSizeError(Exception): pass
class DuplicateTransactionError(Exception): pass
class DuplicateEmailError(Exception): pass


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
            EventRegistration.status.in_(["confirmed", "pending_verification", "pending_payment"]),
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
            EventRegistration.status.in_(["confirmed", "pending_verification", "pending_payment"]),
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
class PaymentStorageUnavailableError(Exception): pass


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
        # The event row above is locked FOR UPDATE, which serializes
        # registrations for this event across concurrent transactions.
        occupied_count = (
            db.session.query(EventRegistration)
            .filter(
                EventRegistration.event_id == event.id,
                EventRegistration.status.in_(["confirmed", "pending_verification", "pending_payment"]),
            )
            .count()
        )
        if occupied_count >= event.max_teams:
            raise EventFullError(event.id)

    if _already_registered(event.id, leader.id):
        raise DuplicateRegistrationError(leader.id)

    effective_fee = get_effective_fee_amount(event)
    is_loadtest = config.LOAD_TEST_ENABLED and leader.email.startswith("loadtest_")
    if effective_fee <= 0 and not is_loadtest:
        raise UnconfiguredFeeError("For free events kindly contact the Student Co-Ordinator")

    # If the leader already started a payment for this event, resume that
    # registration instead of creating a duplicate.
    existing_pending = (
        EventRegistration.query.filter_by(
            event_id=event.id,
            leader_user_id=leader.id,
            status="pending_payment",
        )
        .order_by(EventRegistration.created_at.desc())
        .first()
    )
    if existing_pending and not is_loadtest:
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
        transaction_id=f"LOADTEST_TXN_{leader.id[:8]}_{secrets.token_hex(4)}" if is_loadtest else None,
        payment_amount=effective_fee,
        payment_submitted_at=_utc_now() if is_loadtest else None,
        status="confirmed" if is_loadtest else "pending_payment",
    )
    db.session.add(registration)
    db.session.flush()

    is_active = (registration.status in ["confirmed", "pending_verification", "pending_payment"])
    participants_input = clean_data.get("participants", [])

    leader_p = participants_input[0] if len(participants_input) > 0 else {}
    leader_member = RegistrationMember(
        registration_id=registration.id,
        event_id=event.id,
        user_id=leader.id,
        is_leader=True,
        active_registration=is_active,
        participant_name=leader_p.get("participant_name") or leader.full_name or leader.username,
        participant_email=leader_p.get("participant_email") or leader.email,
        college_name=leader_p.get("college_name") or leader.college,
        participant_phone=leader_p.get("participant_phone") or leader.phone,
    )
    db.session.add(leader_member)

    for idx, member in enumerate(member_users):
        m_p = participants_input[idx + 1] if len(participants_input) > (idx + 1) else {}
        db.session.add(
            RegistrationMember(
                registration_id=registration.id,
                event_id=event.id,
                user_id=member.id,
                is_leader=False,
                active_registration=is_active,
                participant_name=m_p.get("participant_name") or member.full_name or member.username,
                participant_email=m_p.get("participant_email") or member.email,
                college_name=m_p.get("college_name") or member.college,
                participant_phone=m_p.get("participant_phone") or member.phone,
            )
        )
    
    try:
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        err_str = str(e).lower()
        if "uq_active_user_per_event" in err_str or "uq_member_once_per_event" in err_str:
            raise DuplicateRegistrationError(leader.id)
        raise

    # -------------------------------------------------------------------------
    # NEW REGISTRATION -> ADMIN EMAIL NOTIFICATION
    # Send notification email to Admin only AFTER successful database commit.
    # Email failure MUST NOT roll back or disrupt the saved registration.
    # -------------------------------------------------------------------------
    try:
        from utils.email import send_admin_new_registration_notification
        roster = [
            {
                "name": m.participant_name or (m.user.full_name if m.user else None) or (m.user.username if m.user else ""),
                "email": m.participant_email or (m.user.email if m.user else ""),
                "username": m.user.username if m.user else "",
            }
            for m in registration.members
        ]
        fee_display = f"₹{registration.payment_amount / 100:.2f}" if registration.payment_amount else (event.fee or "Free")
        send_admin_new_registration_notification(
            registration.id,
            event_name=event.name,
            participant_name=leader.full_name or leader.username,
            participant_email=leader.email,
            username=leader.username,
            participant_mode=registration.participant_mode,
            team_name=registration.team_name,
            team_size=len(registration.members),
            members=roster,
            payment_status=registration.status.upper().replace("_", " "),
            fee=fee_display,
            transaction_id=registration.transaction_id,
        )
    except Exception as exc:
        logger.error(
            "Safely caught admin notification email exception for registration %s (registration remains saved): %s",
            registration.id,
            exc,
            exc_info=True,
        )

    if registration.status == "confirmed":
        _send_confirmation_emails(registration, event, leader, member_users)
    return registration, warnings



def get_payment_page_details(event_id: str, registration_id: str, user_id: str) -> dict:
    import config

    reg = db.session.get(EventRegistration, registration_id)

    if not reg or reg.event_id != event_id:
        raise EventNotFoundError(registration_id)

    # Fetch ALL members of this registration directly from DB.
    registration_members = (
        RegistrationMember.query
        .filter_by(registration_id=registration_id)
        .order_by(
            RegistrationMember.is_leader.desc(),
            RegistrationMember.joined_at.asc()
        )
        .all()
    )

    is_leader = reg.leader_user_id == user_id

    is_member = any(
        m.user_id == user_id
        for m in registration_members
    )

    if not (is_leader or is_member):
        raise UnauthorizedRegistrationAccessError()

    event = reg.event

    if not event:
        raise EventNotFoundError(event_id)

    amount = (
        reg.payment_amount
        if reg.payment_amount is not None
        else (event.fee_amount or 0)
    )

    return {
        "registration_id": reg.id,
        "event_id": event.id,
        "event_name": event.name,
        "event_description": event.description or "",
        "event_date": event.event_date,
        "event_time": event.event_time,
        "venue": event.venue,

        "fee_amount_paise": amount,
        "fee_amount_rupees": f"{amount / 100:.2f}",

        "participant_mode": reg.participant_mode,
        "team_name": reg.team_name,
        "status": reg.status,

        "transaction_id": reg.transaction_id or "",
        "disclaimer_accepted": bool(reg.disclaimer_accepted),
        "has_proof": bool(reg.payment_proof_filename),

        "upi_id": config.UPI_ID,
        "upi_payee_name": config.UPI_PAYEE_NAME,
        "upi_dummy_mode": config.UPI_DUMMY_MODE,
        "qr_url": f"/api/events/{event.id}/payment-qr/{reg.id}",

        "members": [
            {
                "name": (
                    m.participant_name
                    or (
                        m.user.full_name
                        if m.user else None
                    )
                    or (
                        m.user.username
                        if m.user else ""
                    )
                ),

                "email": (
                    m.participant_email
                    or (
                        m.user.email
                        if m.user else ""
                    )
                ),

                "college": (
                    m.college_name
                    or (
                        m.user.college
                        if m.user else ""
                    )
                ),

                "phone": (
                    m.participant_phone
                    or (
                        m.user.phone
                        if m.user else ""
                    )
                ),

                "is_leader": bool(m.is_leader),
            }

            for m in registration_members
        ],
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
    if event_id and reg.event_id != event_id:
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
        raise InvalidPaymentFileError("Please upload a payment screenshot.")

    # Read and check file size
    file.seek(0, os.SEEK_END)
    file_size = file.tell()
    file.seek(0)

    if file_size > config.MAX_PAYMENT_PROOF_SIZE_BYTES:
        raise PaymentFileTooLargeError("Payment screenshot must not exceed 200 KB.")

    filename = file.filename.lower()
    ext = filename.rsplit(".", 1)[-1] if "." in filename else ""
    if ext not in config.ALLOWED_PAYMENT_PROOF_EXTENSIONS:
        raise InvalidPaymentFileError("Only JPG, JPEG, PNG, and WEBP images are allowed.")

    # Inspect magic bytes
    header = file.read(16)
    file.seek(0)

    is_jpeg = header.startswith(b"\xff\xd8\xff")
    is_png = header.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = header.startswith(b"RIFF") and len(header) >= 12 and header[8:12] == b"WEBP"
    if not (is_jpeg or is_png or is_webp):
        raise InvalidPaymentFileError("Only JPG, JPEG, PNG, and WEBP images are allowed.")

    if is_jpeg:
        mime_type = "image/jpeg"
    elif is_png:
        mime_type = "image/png"
    else:
        mime_type = "image/webp"

    from services.storage_service import upload_payment_proof, SupabaseStorageError

    file_bytes = file.read() if hasattr(file, "read") else b""
    file.seek(0)

    try:
        upload_result = upload_payment_proof(
            user_id=user_id,
            registration_id=reg.id,
            file_bytes=file_bytes,
            filename=filename,
            mime_type=mime_type,
        )
    except SupabaseStorageError as e:
        raise PaymentStorageUnavailableError("Payment storage is temporarily unavailable. Please try again later.")

    safe_filename = upload_result["storage_reference"]

    reg.transaction_id = txn_clean
    reg.payment_amount = event.fee_amount
    reg.payment_submitted_at = _utc_now()
    reg.payment_proof_filename = safe_filename
    reg.payment_proof_mime_type = mime_type
    reg.payment_proof_size = file_size
    reg.disclaimer_accepted = True
    reg.disclaimer_accepted_at = _utc_now()
    reg.status = "pending_verification"
    reg.payment_verified_at = None
    reg.payment_verified_by = None
    reg.rejection_reason = None
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

    # Payment proof is now safely committed and the registration has moved to
    # pending_verification. Notify every registered participant with the same
    # CyberCarnival card-style "under admin review" email.
    _send_pending_verification_emails(reg, event)

    return reg


def _send_pending_verification_emails(registration, event) -> None:
    from utils.email import send_registration_pending_email

    sent_to = set()

    for member in registration.members:
        email = (
            member.participant_email
            or (member.user.email if member.user else "")
            or ""
        ).strip().lower()

        if not email or email in sent_to:
            continue

        sent_to.add(email)

        recipient_name = (
            member.participant_name
            or (member.user.full_name if member.user else None)
            or (member.user.username if member.user else None)
            or "Participant"
        )

        try:
            send_registration_pending_email(
                email,
                recipient_name=recipient_name,
                event_name=event.name,
                registration_id=registration.id,
                team_name=registration.team_name,
                event_date=event.event_date,
                event_time=event.event_time,
                venue=event.venue,
                transaction_id=registration.transaction_id,
            )
        except Exception:
            logger.exception(
                "failed to send pending-verification email "
                "to=%s registration=%s",
                email,
                registration.id,
            )


class RegistrationAlreadyVerifiedError(Exception): pass
class MissingRejectionReasonError(Exception): pass


import secrets

def verify_manual_payment(registration_id: str, actor: str, approved: bool, rejection_reason: str = None) -> bool:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        return False

    # Email Delivery Safety & Duplicate Protection:
    # If the registration is already in the target state, return True without re-sending emails
    if approved and reg.status == "confirmed":
        logger.info("Registration %s is already confirmed — skipping duplicate confirmation email", registration_id)
        return True
    if not approved and reg.status == "rejected":
        logger.info("Registration %s is already rejected/removed — skipping duplicate decline email", registration_id)
        return True

    now = _utc_now()
    if approved:
        reg.status = "confirmed"
        if not reg.ticket_token:
            reg.ticket_token = secrets.token_hex(16)
        reg.payment_reviewed_at = now
        reg.payment_reviewed_by = actor
        reg.payment_verified_at = now
        reg.payment_verified_by = actor
        reg.rejection_reason = None
        for m in reg.members:
            m.active_registration = True
        db.session.commit()
        member_users = [m.user for m in reg.members if not m.is_leader]
        _send_confirmation_emails(reg, reg.event, reg.leader, member_users)
    else:
        reason_clean = (rejection_reason or "").strip() or "Registration declined by administrator."
        reg.status = "rejected"
        reg.payment_reviewed_at = now
        reg.payment_reviewed_by = actor
        reg.payment_verified_at = None
        reg.payment_verified_by = None
        reg.rejection_reason = reason_clean
        for m in reg.members:
            m.active_registration = False
        db.session.commit()
        member_users = [m.user for m in reg.members if not m.is_leader]
        _send_rejection_emails(reg, reg.event, reg.leader, member_users, reason_clean)
    return True


def _send_rejection_emails(registration, event, leader, member_users, rejection_reason: str) -> None:
    from utils.email import send_registration_rejection_email
    all_members = [leader, *member_users]
    for member in all_members:
        try:
            send_registration_rejection_email(
                member.email,
                recipient_name=member.full_name or member.username,
                event_name=event.name,
                registration_id=registration.id,
                rejection_reason=rejection_reason,
            )
        except Exception:
            logger.exception("failed to send registration rejection email to=%s registration=%s", member.email, registration.id)


def _send_confirmation_emails(registration, event, leader, member_users) -> None:
    all_members = [leader, *member_users]
    roster = [m.full_name or m.username for m in all_members]
    whatsapp_link = getattr(event, "whatsapp_group_link", None)
    for member in all_members:
        try:
            send_registration_confirmation_email(
                member.email,
                recipient_name=member.full_name or member.username,
                recipient_email=member.email,
                college_name=member.college or "SRM Institute of Science and Technology",
                event_name=event.name,
                registration_id=registration.id,
                team_name=registration.team_name,
                event_date=event.event_date,
                event_time=event.event_time,
                venue=event.venue,
                fee=event.fee,
                members=roster,
                ticket_token=registration.ticket_token,
                whatsapp_group_link=whatsapp_link,
            )
        except Exception:
            logger.exception("failed to send registration confirmation email to=%s registration=%s", member.email, registration.id)


def check_in_ticket(registration_id: str, token: str | None, actor: str) -> dict:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        return {"success": False, "status": "INVALID_TICKET", "message": "QR token does not exist"}
    if reg.status == "pending_verification":
        return {"success": False, "status": "PAYMENT_NOT_VERIFIED", "message": "Registration is pending admin verification"}

    if reg.status == "rejected":
        return {"success": False, "status": "REGISTRATION_REJECTED", "message": "Registration is rejected"}
    if reg.status != "confirmed":
        return {"success": False, "status": "INVALID_STATUS", "message": f"Registration status is '{reg.status}'. Ticket valid only when confirmed."}
    
    if token and reg.ticket_token:
        if not secrets.compare_digest(reg.ticket_token.strip(), token.strip()):
            return {"success": False, "status": "INVALID_TICKET", "message": "Invalid ticket token"}

    participant_name = reg.leader.full_name or reg.leader.username if reg.leader else "Participant"
    participant_email = reg.leader.email if reg.leader else ""
    event_name = reg.event.name if reg.event else "Event"

    if reg.checked_in:
        checked_in_at_str = reg.checked_in_at.strftime("%Y-%m-%d %H:%M:%S UTC") if reg.checked_in_at else "Earlier"
        return {
            "success": False,
            "status": "ALREADY_PRESENT",
            "message": "Already marked as present",
            "participant": {
                "name": participant_name,
                "email": participant_email
            },
            "event": event_name,
            "checked_in_at": checked_in_at_str,
            "checked_in_by": reg.checked_in_by or actor,
            "registration_id": reg.id,
            "team_name": reg.team_name,
        }

    now = _utc_now()
    reg.checked_in = True
    reg.checked_in_at = now
    reg.checked_in_by = actor
    db.session.commit()

    checked_in_at_str = now.strftime("%Y-%m-%d %H:%M:%S UTC")

    roster = []
    for m in reg.members:
        roster.append({
            "name": m.participant_name or (m.user.full_name if m.user else None) or (m.user.username if m.user else ""),
            "email": m.participant_email or (m.user.email if m.user else ""),
            "college": m.college_name or (m.user.college if m.user else ""),
            "is_leader": m.is_leader
        })

    return {
        "success": True,
        "status": "PRESENT",
        "message": "Attendance marked successfully",
        "participant": {
            "name": participant_name,
            "email": participant_email
        },
        "event": event_name,
        "checked_in_at": checked_in_at_str,
        "checked_in_by": actor,
        "registration_id": reg.id,
        "team_name": reg.team_name,
        "members": roster,
    }


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


def delete_registration(registration_id: str) -> bool:
    reg = get_registration(registration_id)
    if not reg:
        return False

    proof_filename = reg.payment_proof_filename

    # 1. Delete database records transactionally first
    db.session.delete(reg)
    db.session.commit()

    # 2. Only AFTER database commit succeeds, clean up physical proof file or Supabase Storage object
    if proof_filename:
        try:
            from services.storage_service import delete_file
            delete_file(proof_filename)
        except Exception as e:
            logger.warning(f"Post-commit cleanup warning: could not delete proof file '{proof_filename}' for registration {registration_id}: {e}")

    return True


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


def get_participant_details(registration_id: str, user_id: str) -> dict:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        raise EventNotFoundError(registration_id)

    is_leader = (reg.leader_user_id == user_id)
    is_member = any(m.user_id == user_id for m in reg.members)
    if not (is_leader or is_member):
        raise UnauthorizedRegistrationAccessError()

    event = reg.event
    if not event:
        raise EventNotFoundError(reg.event_id)

    members_list = []
    # Sort members so leader comes first, then teammates
    sorted_members = sorted(reg.members, key=lambda m: (not m.is_leader, m.joined_at))
    for m in sorted_members:
        u = m.user
        members_list.append({
            "member_id": m.id,
            "user_id": m.user_id,
            "is_leader": m.is_leader,
            "participant_name": m.participant_name or (u.full_name if u else None) or (u.username if u else ""),
            "participant_email": m.participant_email or (u.email if u else ""),
            "college_name": m.college_name or (u.college if u else ""),
            "participant_phone": m.participant_phone or (u.phone if u else ""),
        })

    return {
        "registration_id": reg.id,
        "event_id": event.id,
        "event_name": event.name,
        "participant_mode": reg.participant_mode,
        "team_name": reg.team_name,
        "status": reg.status,
        "participants": members_list,
    }


def save_participant_details(registration_id: str, user_id: str, clean_participants: list[dict]) -> EventRegistration:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        raise EventNotFoundError(registration_id)

    is_leader = (reg.leader_user_id == user_id)
    is_member = any(m.user_id == user_id for m in reg.members)
    if not (is_leader or is_member):
        raise UnauthorizedRegistrationAccessError()

    event = reg.event
    if not event:
        raise EventNotFoundError(reg.event_id)

    # 1. Validate internal duplicates within the submission
    seen_in_request = set()
    for p in clean_participants:
        e = p["participant_email"].strip().lower()
        if e in seen_in_request:
            raise DuplicateEmailError("This email ID is already registered for another participant.")
        seen_in_request.add(e)

    # 2. Validate uniqueness across PostgreSQL database for each email for this event
    for p in clean_participants:
        e = p["participant_email"].strip().lower()
        dup = (
            RegistrationMember.query
            .filter(
                RegistrationMember.event_id == reg.event_id,
                db.func.lower(RegistrationMember.participant_email) == e,
                RegistrationMember.registration_id != reg.id,
                RegistrationMember.active_registration == True,
            )
            .first()
        )
        if dup:
            raise DuplicateEmailError("This email ID is already registered for another participant.")

    # 3. Update existing RegistrationMember records or append missing ones
    members = sorted(reg.members, key=lambda m: (not m.is_leader, m.joined_at))

    for idx, p in enumerate(clean_participants):
        if idx < len(members):
            target_m = members[idx]
        else:
            target_m = RegistrationMember(
                registration_id=reg.id,
                event_id=event.id,
                user_id=reg.leader_user_id,
                is_leader=False,
                active_registration=(reg.status in ["confirmed", "pending_verification"]),
            )
            db.session.add(target_m)

        target_m.participant_name = p["participant_name"].strip()
        target_m.participant_email = p["participant_email"].strip().lower()
        target_m.college_name = p["college_name"].strip()
        target_m.participant_phone = p["participant_phone"].strip()

    try:
        db.session.commit()
    except IntegrityError as ie:
        db.session.rollback()
        err_msg = str(ie).lower()
        if "uq_reg_member_participant_email" in err_msg or "unique" in err_msg:
            raise DuplicateEmailError("This email ID is already registered for another participant.")
        raise

    return reg
