from extensions import db
from models import Coordinator, CoordinatorEvent, Event, EventRegistration, RegistrationMember
from utils.security import hash_password, verify_password


def get_coordinator_by_username(username: str):
    """Legacy helper kept for compatibility with old data/tools."""
    return Coordinator.query.filter_by(username=username).first()


def get_coordinator(coordinator_id: str):
    return db.session.get(Coordinator, coordinator_id)


def get_event_by_coordinator_username(username: str):
    username_clean = (username or "").strip()
    if not username_clean:
        return None
    return Event.query.filter_by(coordinator_username=username_clean).first()


def verify_coordinator_credentials(username: str, password: str):
    """Verify the ONE shared coordinator credential stored on an Event."""
    event = get_event_by_coordinator_username(username)
    if not event or not event.coordinator_login_active or not event.coordinator_password_hash:
        # Keep timing roughly similar even for an unknown username.
        verify_password(password, hash_password("decoy-password-not-real"))
        return None
    if not verify_password(password, event.coordinator_password_hash):
        return None
    return event


def set_event_coordinator_credentials(event_id: str, username: str = None, plain_password: str = None, is_active: bool = None) -> Event:
    event = db.session.get(Event, (event_id or "").strip())
    if not event:
        raise ValueError("Selected event not found")

    if username is not None:
        username_clean = username.strip()
        if not username_clean:
            raise ValueError("Coordinator login username is required")
        existing = Event.query.filter(Event.coordinator_username == username_clean, Event.id != event.id).first()
        if existing:
            raise ValueError("Coordinator login username is already used by another event")
        event.coordinator_username = username_clean

    if plain_password is not None and plain_password.strip():
        password_clean = plain_password.strip()
        if len(password_clean) < 6:
            raise ValueError("Coordinator login password must be at least 6 characters long")
        event.coordinator_password_hash = hash_password(password_clean)

    if is_active is not None:
        event.coordinator_login_active = bool(is_active)

    if not event.coordinator_username:
        raise ValueError("Coordinator login username is required for this event")
    if not event.coordinator_password_hash:
        raise ValueError("Set a coordinator login password for this event")

    db.session.commit()
    return event


def list_coordinators() -> list:
    return Coordinator.query.order_by(Coordinator.created_at.desc()).all()


def create_coordinator(username: str = None, plain_password: str = None, full_name: str = None, event_id: str = None, phone: str = None, email: str = None, role: str = "STUDENT", is_active: bool = True) -> Coordinator:
    """Create a coordinator PERSON. Event login is managed separately."""
    event_id_clean = (event_id or "").strip()
    if not event_id_clean:
        raise ValueError("An event selection is required")
    target_event = db.session.get(Event, event_id_clean)
    if not target_event:
        raise ValueError("Selected event not found")

    full_name_clean = (full_name or "").strip()
    if not full_name_clean:
        raise ValueError("Coordinator full name is required")

    role_clean = (role or "STUDENT").upper()
    if role_clean not in ("FACULTY", "STUDENT"):
        role_clean = "STUDENT"

    coord = Coordinator(
        username=None,
        password_hash=None,
        full_name=full_name_clean,
        phone=(phone or "").strip() or None,
        email=(email or "").strip() or None,
        is_active=bool(is_active),
        event_id=event_id_clean,
    )
    try:
        db.session.add(coord)
        db.session.flush()
        db.session.add(CoordinatorEvent(
            coordinator_id=coord.id,
            event_id=event_id_clean,
            role=role_clean,
        ))
        db.session.commit()
        return coord
    except Exception:
        db.session.rollback()
        raise


def update_coordinator(coordinator_id: str, username: str = None, full_name: str = None, phone: str = None, email: str = None, plain_password: str = None, is_active: bool = None, event_id: str = None, role: str = None) -> Coordinator:
    """Update coordinator PERSON details/assignment. Login is event-level."""
    coord = get_coordinator(coordinator_id)
    if not coord:
        raise ValueError("Coordinator not found")

    target_event_id = (event_id or coord.event_id or "").strip()
    if not target_event_id:
        raise ValueError("An event selection is required")
    target_event = db.session.get(Event, target_event_id)
    if not target_event:
        raise ValueError("Selected event not found")

    if full_name is not None:
        full_name_clean = full_name.strip()
        if not full_name_clean:
            raise ValueError("Coordinator full name cannot be empty")
        coord.full_name = full_name_clean
    if phone is not None:
        coord.phone = phone.strip() or None
    if email is not None:
        coord.email = email.strip() or None
    if is_active is not None:
        coord.is_active = bool(is_active)

    old_event_id = coord.event_id
    coord.event_id = target_event_id

    role_clean = (role or "").upper() if role else None
    try:
        # One person has one current event assignment in this portal.
        CoordinatorEvent.query.filter_by(coordinator_id=coord.id).delete(synchronize_session=False)
        db.session.flush()
        db.session.add(CoordinatorEvent(
            coordinator_id=coord.id,
            event_id=target_event_id,
            role=role_clean if role_clean in ("FACULTY", "STUDENT") else "STUDENT",
        ))
        db.session.commit()
        return coord
    except Exception:
        db.session.rollback()
        raise


def set_coordinator_events(coordinator_id: str, event_ids: list) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    primary_eid = event_ids[0] if event_ids else None
    if not primary_eid:
        return False
    update_coordinator(coordinator_id, event_id=primary_eid, role=coord.get_role())
    return True


def sync_event_coordinators(event_id: str, faculty_ids: list, student_ids: list) -> bool:
    event = db.session.get(Event, event_id)
    if not event:
        raise ValueError("Event not found")

    def _clean_ids(values):
        cleaned, seen = [], set()
        for value in values or []:
            cid = str(value or "").strip()
            if cid and cid not in seen:
                seen.add(cid)
                cleaned.append(cid)
        return cleaned

    faculty_clean = _clean_ids(faculty_ids)
    student_clean = [cid for cid in _clean_ids(student_ids) if cid not in set(faculty_clean)]
    desired = [(cid, "FACULTY") for cid in faculty_clean] + [(cid, "STUDENT") for cid in student_clean]

    try:
        CoordinatorEvent.query.filter_by(event_id=event_id).delete(synchronize_session=False)
        db.session.flush()
        for coordinator_id, role in desired:
            coord = db.session.get(Coordinator, coordinator_id)
            if not coord:
                continue
            coord.event_id = event_id
            db.session.add(CoordinatorEvent(coordinator_id=coordinator_id, event_id=event_id, role=role))
        db.session.commit()
        return True
    except Exception:
        db.session.rollback()
        raise


def set_coordinator_active(coordinator_id: str, active: bool) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    coord.is_active = bool(active)
    db.session.commit()
    return True


def delete_coordinator(coordinator_id: str) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    CoordinatorEvent.query.filter_by(coordinator_id=coordinator_id).delete(synchronize_session=False)
    db.session.delete(coord)
    db.session.commit()
    return True


def coordinator_owns_event(coordinator: Coordinator, event_id: str) -> bool:
    if not coordinator or not event_id:
        return False
    pe = coordinator.get_primary_event()
    return bool(pe and pe.id == event_id)


def get_coordinator_event_role(coordinator_id: str, event_id: str) -> str:
    ce = CoordinatorEvent.query.filter_by(coordinator_id=coordinator_id, event_id=event_id).first()
    return ce.role if ce else "STUDENT"


def event_attendance_summary(event_id: str) -> dict:
    total_confirmed = EventRegistration.query.filter_by(event_id=event_id, status="confirmed").count()
    present = EventRegistration.query.filter_by(event_id=event_id, status="confirmed", checked_in=True).count()
    remaining = max(total_confirmed - present, 0)
    return {
        "confirmed": total_confirmed,
        "present": present,
        "remaining": remaining,
    }


def event_registrations_detail(event_id: str) -> list:
    """Full registration detail for an event assigned to a coordinator."""
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
                "payment_proof_url": f"/api/registrations/{reg.id}/payment-proof" if reg.payment_proof_filename else None,
                "disclaimer_accepted": reg.disclaimer_accepted,
                "checked_in": reg.checked_in,
                "checked_in_at": reg.checked_in_at.strftime("%Y-%m-%d %H:%M:%S UTC") if reg.checked_in_at else None,
                "checked_in_by": reg.checked_in_by,
                "ticket_token": reg.ticket_token,
                "members": [
                    {
                        "user_id": m.user.id if m.user else None,
                        "name": m.participant_name or (m.user.full_name if m.user else None) or (m.user.username if m.user else "Participant"),
                        "email": m.participant_email or (m.user.email if m.user else None),
                        "phone": m.participant_phone or (m.user.phone if m.user else None),
                        "college": m.college_name or (m.user.college if m.user else None),
                        "register_number": m.user.register_number if m.user else None,
                        "cybercarnival_token": m.user.cybercarnival_token if m.user else None,
                        "is_leader": m.is_leader,
                    }
                    for m in reg.members
                ],
            }
        )
    return out
