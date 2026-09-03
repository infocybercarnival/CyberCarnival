from flask import Blueprint, request, jsonify, session
from urllib.parse import urlsplit

import config
from extensions import limiter
from services.registration_service import (
    register_for_event, get_registration, preflight_warnings, member_preview,
    DuplicateRegistrationError, EventNotFoundError, EventFullError,
    RegistrationClosedError, UnknownMemberTokenError, TeamSizeError,
    DuplicateTransactionError, UnconfiguredFeeError,
)
from services.user_service import get_user
from services.audit_service import log_action
from utils.validators import validate_event_registration_payload, ValidationError
from utils.auth import user_login_required
from utils.logger import get_logger

bp = Blueprint("registration", __name__)
logger = get_logger("registration")


def _origin_only(value: str) -> str:
    try:
        parts = urlsplit(value)
        if parts.scheme not in {"http", "https"} or not parts.netloc:
            return ""
        return f"{parts.scheme}://{parts.netloc}".rstrip("/").lower()
    except Exception:
        return ""


def validate_csrf_origin(req) -> bool:
    supplied = req.headers.get("Origin") or req.headers.get("Referer") or ""
    if not supplied:
        # Non-browser/API clients still need an authenticated session; browser
        # requests normally include Origin/Referer for state-changing requests.
        return True
    request_origin = _origin_only(supplied)
    allowed = {_origin_only(v) for v in [*config.ALLOWED_ORIGINS, config.SITE_URL] if v}
    return bool(request_origin and request_origin in allowed)


@bp.get("/api/registrations/preflight/<event_id>")
@user_login_required
def registration_preflight(event_id):
    leader = get_user(session["user_id"])
    if not leader: return jsonify({"error": "authentication required"}), 401
    try:
        warnings = preflight_warnings(leader, event_id)
    except EventNotFoundError:
        return jsonify({"error": "event not found"}), 404
    return jsonify({"warnings": warnings})


@bp.get("/api/registrations/member-preview/<token>")
@user_login_required
@limiter.limit("30 per minute")
def teammate_preview(token):
    user = get_user(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "authentication required"}), 401
    preview = member_preview(token)
    if not preview:
        return jsonify({"error": "token not found"}), 404
    return jsonify(preview)


@bp.post("/api/registrations")
@user_login_required
@limiter.limit("10 per minute")
def submit_registration():
    if not validate_csrf_origin(request):
        return jsonify({"error": "invalid origin"}), 403
    leader = get_user(session["user_id"])
    if not leader:
        session.clear(); return jsonify({"error": "authentication required"}), 401
    if not leader.profile_completed:
        return jsonify({"error": "complete your profile before registering for an event"}), 409
    payload = request.get_json(silent=True)
    if payload is None: return jsonify({"error": "request body must be valid JSON"}), 400
    try:
        clean = validate_event_registration_payload(payload)
        record, warnings = register_for_event(leader, clean)
    except ValidationError as e:
        return jsonify({"error": "validation failed", "fields": e.errors}), 422
    except EventNotFoundError:
        return jsonify({"error": "unknown or inactive event_id"}), 404
    except EventFullError:
        return jsonify({"error": "this event is at capacity"}), 409
    except RegistrationClosedError:
        return jsonify({"error": "registration for this event is closed"}), 409
    except DuplicateRegistrationError:
        return jsonify({"error": "you (or a teammate) are already registered for this event"}), 409
    except UnknownMemberTokenError as e:
        return jsonify({"error": f"no account found for token {e.token}"}), 404
    except TeamSizeError as e:
        return jsonify({"error": str(e)}), 422
    except UnconfiguredFeeError as e:
        return jsonify({"error": str(e)}), 422
    except DuplicateTransactionError:
        return jsonify({"error": "this transaction ID has already been submitted"}), 409

    log_action(leader.id, "REGISTRATION_SUBMITTED", f"reg_id={record.id} status={record.status}", request.remote_addr or "")
    return jsonify({
        "id": record.id,
        "status": record.status,
        "warnings": warnings,
        "payment_url": f"/payment?eventId={record.event_id}&registrationId={record.id}" if record.status == "pending_payment" else None,
        "payment_message": "Proceed to the payment page to complete your registration." if record.status == "pending_payment" else None,
    }), 201


@bp.get("/api/events/<event_id>/payment/<registration_id>")
@user_login_required
@limiter.limit("30 per minute")
def view_payment_details(event_id, registration_id):
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "authentication required"}), 401
    try:
        from services.registration_service import get_payment_page_details, UnauthorizedRegistrationAccessError
        details = get_payment_page_details(event_id, registration_id, user_id)
        return jsonify(details)
    except EventNotFoundError:
        return jsonify({"error": "registration or event not found"}), 404
    except UnauthorizedRegistrationAccessError:
        return jsonify({"error": "you are not authorized to view this registration payment page"}), 403


@bp.post("/api/registrations/<registration_id>/payment")
@user_login_required
@limiter.limit("10 per minute")
def submit_payment(registration_id):
    if not validate_csrf_origin(request):
        return jsonify({"error": "invalid origin"}), 403
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "authentication required"}), 401

    event_id = request.form.get("event_id", "").strip()
    transaction_id = request.form.get("transaction_id", "").strip()
    disclaimer_val = request.form.get("disclaimer_accepted", "").strip().lower()
    disclaimer_accepted = disclaimer_val in {"true", "1", "yes", "on"}
    file = request.files.get("payment_proof")

    try:
        from services.registration_service import (
            submit_payment_proof, InvalidPaymentStateError, DisclaimerNotAcceptedError,
            InvalidPaymentFileError, PaymentFileTooLargeError, UnauthorizedRegistrationAccessError
        )
        record = submit_payment_proof(
            registration_id=registration_id,
            user_id=user_id,
            event_id=event_id,
            transaction_id=transaction_id,
            file=file,
            disclaimer_accepted=disclaimer_accepted
        )
        log_action(user_id, "PAYMENT_PROOF_SUBMITTED", f"reg_id={record.id} txn={record.transaction_id}", request.remote_addr or "")
        return jsonify({
            "id": record.id,
            "status": record.status,
            "message": "Payment submitted successfully! Your registration for this event is now confirmed."
        }), 200
    except ValidationError as e:
        return jsonify({"error": "validation failed", "fields": e.errors}), 422
    except EventNotFoundError:
        return jsonify({"error": "registration or event not found"}), 404
    except UnauthorizedRegistrationAccessError:
        return jsonify({"error": "you are not authorized to submit payment for this registration"}), 403
    except InvalidPaymentStateError as e:
        return jsonify({"error": str(e)}), 409
    except DisclaimerNotAcceptedError as e:
        return jsonify({"error": str(e)}), 422
    except InvalidPaymentFileError as e:
        return jsonify({"error": str(e)}), 422
    except PaymentFileTooLargeError as e:
        return jsonify({"error": str(e)}), 413
    except DuplicateTransactionError:
        return jsonify({"error": "this transaction ID has already been submitted"}), 409


@bp.get("/api/registrations/<registration_id>/payment-proof")
def view_payment_proof(registration_id):
    from flask import send_from_directory
    from models import EventRegistration, User
    from services.coordinator_service import get_coordinator, coordinator_owns_event

    user_id = session.get("user_id")
    coord_id = session.get("coordinator_id")
    is_admin = session.get("is_admin", False)

    if not (user_id or coord_id or is_admin):
        return jsonify({"error": "authentication required"}), 401

    reg = get_registration(registration_id)
    if not reg or not reg.payment_proof_filename:
        return jsonify({"error": "payment proof not found"}), 404

    is_owner = bool(user_id) and ((reg.leader_user_id == user_id) or any(m.user_id == user_id for m in reg.members))
    
    is_authorized_coord = False
    if session.get("is_coordinator", False) and coord_id:
        coord = get_coordinator(coord_id)
        if coord and coordinator_owns_event(coord, reg.event_id):
            is_authorized_coord = True

    if not (is_admin or is_authorized_coord or is_owner):
        return jsonify({"error": "unauthorized access to payment proof"}), 403

    return send_from_directory(config.PAYMENT_PROOF_DIR, reg.payment_proof_filename)


@bp.get("/api/registrations/<registration_id>/ticket")
@limiter.limit("30 per minute")
def view_ticket(registration_id):
    reg = get_registration(registration_id)
    if not reg or reg.status != "confirmed":
        return jsonify({"error": "ticket not found"}), 404
    event = reg.event
    return jsonify({
        "status": reg.status,
        "event_name": event.name if event else "Unknown event",
        "team_name": reg.team_name,
        "venue": event.venue if event else None,
        "date": event.event_date if event else None,
        "time": event.event_time if event else None,
        "members": [{"name": m.user.full_name or m.user.username, "is_leader": m.is_leader} for m in reg.members],
    })
