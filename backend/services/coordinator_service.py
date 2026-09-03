from extensions import db
from models import Coordinator, Event, EventRegistration, RegistrationMember
from utils.security import hash_password, verify_password


def get_coordinator_by_username(username: str):
    return Coordinator.query.filter_by(username=username).first()


def get_coordinator(coordinator_id: str):
    return db.session.get(Coordinator, coordinator_id)


def verify_coordinator_credentials(username: str, password: str):
    """Same timing-safe pattern as admin/user credential checks — always
    runs a hash comparison whether the username exists or not."""
    coord = get_coordinator_by_username(username)
    if not coord or not coord.is_active:
        verify_password(password, hash_password("decoy-password-not-real"))
        return None
    if not verify_password(password, coord.password_hash):
        return None
    return coord


def list_coordinators() -> list:
    return Coordinator.query.order_by(Coordinator.created_at.desc()).all()


def create_coordinator(username: str, plain_password: str, full_name: str, phone: str, event_ids: list) -> Coordinator:
    if get_coordinator_by_username(username):
        raise ValueError("username already exists")

    events = Event.query.filter(Event.id.in_(event_ids)).all() if event_ids else []
    if len(events) != len(set(event_ids or [])):
        raise ValueError("one or more event_ids not found")

    coord = Coordinator(
        username=username,
        password_hash=hash_password(plain_password),
        full_name=full_name,
        phone=phone,
    )
    coord.events = events
    db.session.add(coord)
    db.session.commit()
    return coord


def set_coordinator_events(coordinator_id: str, event_ids: list) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    events = Event.query.filter(Event.id.in_(event_ids)).all() if event_ids else []
    coord.events = events
    db.session.commit()
    return True


def set_coordinator_active(coordinator_id: str, active: bool) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    coord.is_active = active
    db.session.commit()
    return True


def delete_coordinator(coordinator_id: str) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    db.session.delete(coord)
    db.session.commit()
    return True


def coordinator_owns_event(coordinator: Coordinator, event_id: str) -> bool:
    return any(e.id == event_id for e in coordinator.events)


def event_registrations_detail(event_id: str) -> list:
    """Full candidate detail for every confirmed registration on one event —
    what a coordinator sees. Includes contact info, deliberately: this is a
    scoped, authenticated, per-event view for the person actually running
    that event, not the public API."""
    regs = (
        EventRegistration.query.filter(EventRegistration.event_id == event_id, EventRegistration.status.in_(["confirmed", "pending_verification"]))
        .order_by(EventRegistration.created_at.asc())
        .all()
    )
    out = []
    for reg in regs:
        out.append(
            {
                "id": reg.id,
                "team_name": reg.team_name,
                "registered_at": reg.created_at.timestamp() if reg.created_at else None,
                "status": reg.status,
                "transaction_id": reg.transaction_id,
                "payment_amount": reg.payment_amount,
                "members": [
                    {
                        "user_id": m.user.id,
                        "name": m.user.full_name or m.user.username,
                        "email": m.user.email,
                        "phone": m.user.phone,
                        "college": m.user.college,
                        "register_number": m.user.register_number,
                        "cybercarnival_token": m.user.cybercarnival_token,
                        "is_leader": m.is_leader,
                    }
                    for m in reg.members
                ],
            }
        )
    return out
