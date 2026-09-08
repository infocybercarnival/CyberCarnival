from extensions import db
from models import Coordinator, CoordinatorEvent, Event, EventRegistration, RegistrationMember
from utils.security import hash_password, verify_password


def get_coordinator_by_username(username: str):
    return Coordinator.query.filter_by(username=username).first()


def get_coordinator(coordinator_id: str):
    return db.session.get(Coordinator, coordinator_id)


def verify_coordinator_credentials(username: str, password: str):
    """Timing-safe coordinator credential verification."""
    coord = get_coordinator_by_username(username)
    if not coord or not coord.is_active:
        verify_password(password, hash_password("decoy-password-not-real"))
        return None
    if not verify_password(password, coord.password_hash):
        return None
    return coord


def list_coordinators() -> list:
    return Coordinator.query.order_by(Coordinator.created_at.desc()).all()


def get_active_coordinator_for_event(event_id: str, exclude_id: str = None):
    q = Coordinator.query.filter_by(event_id=event_id, is_active=True)
    if exclude_id:
        q = q.filter(Coordinator.id != exclude_id)
    return q.first()


def create_coordinator(username: str, plain_password: str, full_name: str, event_id: str, phone: str = None, email: str = None, role: str = "STUDENT", is_active: bool = True) -> Coordinator:
    username_clean = (username or "").strip()
    if not username_clean:
        raise ValueError("Username is required")
    if get_coordinator_by_username(username_clean):
        raise ValueError("Username already exists")
    if not plain_password or len(plain_password) < 6:
        raise ValueError("Password must be at least 6 characters long")

    event_id_clean = (event_id or "").strip()
    if not event_id_clean:
        raise ValueError("An event selection is required")

    target_event = db.session.get(Event, event_id_clean)
    if not target_event:
        raise ValueError("Selected event not found")

    role_clean = (role or "STUDENT").upper()
    if role_clean not in ("FACULTY", "STUDENT"):
        role_clean = "STUDENT"

    # Enforce: One active coordinator credential per event
    if is_active:
        existing_active = get_active_coordinator_for_event(event_id_clean)
        if existing_active:
            raise ValueError("An active coordinator already exists for this event.")

    coord = Coordinator(
        username=username_clean,
        password_hash=hash_password(plain_password),
        full_name=(full_name or "").strip() or username_clean,
        phone=(phone or "").strip() if phone else None,
        email=(email or "").strip() if email else None,
        is_active=is_active,
        event_id=event_id_clean,
    )
    coord.events = [target_event]
    db.session.add(coord)
    db.session.commit()

    # Maintain CoordinatorEvent table
    CoordinatorEvent.query.filter_by(coordinator_id=coord.id).delete()
    db.session.add(CoordinatorEvent(
        coordinator_id=coord.id,
        event_id=event_id_clean,
        role=role_clean
    ))
    db.session.commit()

    return coord


def update_coordinator(coordinator_id: str, username: str = None, full_name: str = None, phone: str = None, email: str = None, plain_password: str = None, is_active: bool = None, event_id: str = None, role: str = None) -> Coordinator:
    coord = get_coordinator(coordinator_id)
    if not coord:
        raise ValueError("Coordinator not found")

    target_active = bool(is_active) if is_active is not None else coord.is_active
    target_event_id = event_id.strip() if (event_id and event_id.strip()) else coord.event_id

    if not target_event_id:
        raise ValueError("An event selection is required")

    target_event = db.session.get(Event, target_event_id)
    if not target_event:
        raise ValueError("Selected event not found")

    # Enforce: One active coordinator credential per event
    if target_active:
        existing_active = get_active_coordinator_for_event(target_event_id, exclude_id=coord.id)
        if existing_active:
            raise ValueError("An active coordinator already exists for this event.")

    if username is not None:
        u_clean = username.strip()
        if not u_clean:
            raise ValueError("Username cannot be empty")
        existing = get_coordinator_by_username(u_clean)
        if existing and existing.id != coord.id:
            raise ValueError("Username already taken")
        coord.username = u_clean

    if full_name is not None:
        coord.full_name = full_name.strip() or coord.username

    if phone is not None:
        coord.phone = phone.strip() if phone else None

    if email is not None:
        coord.email = email.strip() if email else None

    if plain_password and plain_password.strip():
        if len(plain_password.strip()) < 6:
            raise ValueError("Password must be at least 6 characters long")
        coord.password_hash = hash_password(plain_password.strip())

    coord.is_active = target_active
    coord.event_id = target_event_id
    coord.events = [target_event]

    role_clean = (role or "").upper() if role else None
    if role_clean in ("FACULTY", "STUDENT"):
        ce = CoordinatorEvent.query.filter_by(coordinator_id=coord.id, event_id=target_event_id).first()
        if not ce:
            CoordinatorEvent.query.filter_by(coordinator_id=coord.id).delete()
            db.session.add(CoordinatorEvent(coordinator_id=coord.id, event_id=target_event_id, role=role_clean))
        else:
            ce.role = role_clean

    db.session.commit()
    return coord


def set_coordinator_events(coordinator_id: str, event_ids: list) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    primary_eid = event_ids[0] if event_ids else None
    if primary_eid:
        target_event = db.session.get(Event, primary_eid)
        if target_event:
            coord.event_id = primary_eid
            coord.events = [target_event]
            db.session.commit()
            return True
    return False


def sync_event_coordinators(event_id: str, faculty_ids: list, student_ids: list) -> bool:
    """Synchronize coordinator assignments for one event.

    Replaces the CoordinatorEvent rows for the target event with the exact
    faculty/student coordinator IDs submitted by the admin event form.

    This function is intentionally role-aware:
      - IDs in faculty_ids are stored with role FACULTY
      - IDs in student_ids are stored with role STUDENT

    Invalid/duplicate IDs are ignored safely. The operation is committed
    atomically and rolled back on failure.
    """
    event = db.session.get(Event, event_id)
    if not event:
        raise ValueError("Event not found")

    def _clean_ids(values):
        cleaned = []
        seen = set()
        for value in values or []:
            cid = str(value or "").strip()
            if not cid or cid in seen:
                continue
            seen.add(cid)
            cleaned.append(cid)
        return cleaned

    faculty_clean = _clean_ids(faculty_ids)
    student_clean = _clean_ids(student_ids)

    # If an ID somehow appears in both groups, faculty wins deterministically.
    faculty_set = set(faculty_clean)
    student_clean = [cid for cid in student_clean if cid not in faculty_set]

    desired = [(cid, "FACULTY") for cid in faculty_clean]
    desired += [(cid, "STUDENT") for cid in student_clean]

    try:
        # Remove the event's existing role assignments first.
        CoordinatorEvent.query.filter_by(event_id=event_id).delete(
            synchronize_session=False
        )

        for coordinator_id, role in desired:
            coord = db.session.get(Coordinator, coordinator_id)
            if not coord:
                continue

            # Keep the coordinator's primary event aligned with this assignment
            # when it is currently unset or already points to this event.
            # Do not silently steal a coordinator from another event.
            if not coord.event_id or coord.event_id == event_id:
                coord.event_id = event_id
                coord.events = [event]

            db.session.add(
                CoordinatorEvent(
                    coordinator_id=coordinator_id,
                    event_id=event_id,
                    role=role,
                )
            )

        db.session.commit()
        return True

    except Exception:
        db.session.rollback()
        raise


def set_coordinator_active(coordinator_id: str, active: bool) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    if active and coord.event_id:
        existing = get_active_coordinator_for_event(coord.event_id, exclude_id=coord.id)
        if existing:
            raise ValueError("An active coordinator already exists for this event.")
    coord.is_active = active
    db.session.commit()
    return True


def delete_coordinator(coordinator_id: str) -> bool:
    coord = get_coordinator(coordinator_id)
    if not coord:
        return False
    CoordinatorEvent.query.filter_by(coordinator_id=coordinator_id).delete()
    db.session.delete(coord)
    db.session.commit()
    return True


def coordinator_owns_event(coordinator: Coordinator, event_id: str) -> bool:
    if not coordinator or not event_id:
        return False
    pe = coordinator.get_primary_event()
    if not pe:
        return False
    return pe.id == event_id


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
