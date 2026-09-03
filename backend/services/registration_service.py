import datetime

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
        EventRegistration.query.join(RegistrationMember)
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
        RegistrationMember.query.join(EventRegistration)
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
            .filter(EventRegistration.event_id == event.id,
                    EventRegistration.status.in_(["confirmed", "pending_verification"]))
            .count()
        )
        if locked_count >= event.max_teams:
            raise EventFullError(event.id)

    if _already_registered(event.id, leader.id):
        raise DuplicateRegistrationError(leader.id)

    member_users = []
    seen = {leader.id}
    warnings = []
    for name in _date_conflicts_for_user(leader.id, event):
        warnings.append(f"You are already registered for {name} on an overlapping date/time. You can still continue.")

    for token in clean_data.get("member_tokens", []):
        member = User.query.filter_by(cybercarnival_token=token).first()
        if not member:
            raise UnknownMemberTokenError(token)
        if member.id in seen:
            continue
        seen.add(member.id)
        if _already_registered(event.id, member.id):
            raise DuplicateRegistrationError(member.id)
        member_users.append(member)
        for name in _date_conflicts_for_user(member.id, event):
            warnings.append(f"{member.full_name or member.username} is already registered for {name} on an overlapping date/time. Registration is still allowed.")

    mode = clean_data.get("participant_mode", "individual")
    _validate_team_size(event, mode, len(member_users))

    transaction_id = (clean_data.get("transaction_id") or "").strip().upper()
    if event.fee_amount:
        if not transaction_id:
            raise TeamSizeError("transaction ID is required for paid events")
        if EventRegistration.query.filter_by(transaction_id=transaction_id).first():
            raise DuplicateTransactionError(transaction_id)

    registration = EventRegistration(
        event_id=event.id,
        team_name=(clean_data.get("team_name") or None) if mode == "team" else None,
        leader_user_id=leader.id,
        participant_mode=mode,
        transaction_id=transaction_id or None,
        payment_amount=event.fee_amount or 0,
        payment_submitted_at=datetime.datetime.utcnow() if event.fee_amount else None,
        status="pending_verification" if event.fee_amount else "confirmed",
    )
    db.session.add(registration)
    db.session.flush()
    db.session.add(RegistrationMember(registration_id=registration.id, user_id=leader.id, is_leader=True))
    for member in member_users:
        db.session.add(RegistrationMember(registration_id=registration.id, user_id=member.id, is_leader=False))
    db.session.commit()

    if registration.status == "confirmed":
        _send_confirmation_emails(registration, event, leader, member_users)
    return registration, warnings


def verify_manual_payment(registration_id: str, actor: str, approved: bool) -> bool:
    reg = db.session.get(EventRegistration, registration_id)
    if not reg:
        return False
    if approved:
        reg.status = "confirmed"
        reg.payment_verified_at = datetime.datetime.utcnow()
        reg.payment_verified_by = actor
        db.session.commit()
        member_users = [m.user for m in reg.members if not m.is_leader]
        _send_confirmation_emails(reg, reg.event, reg.leader, member_users)
    else:
        reg.status = "cancelled"
        reg.payment_verified_at = datetime.datetime.utcnow()
        reg.payment_verified_by = actor
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
    reg.status = status
    db.session.commit()
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
    rows = (db.session.query(RegistrationMember.user_id).join(EventRegistration)
            .filter(EventRegistration.status.in_(["confirmed", "pending_verification"]))
            .distinct().all())
    return {r[0] for r in rows}
