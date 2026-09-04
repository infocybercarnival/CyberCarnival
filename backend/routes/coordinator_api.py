from flask import Blueprint, jsonify, session, Response, request
import csv
import io

from extensions import limiter
from services.coordinator_service import get_coordinator, coordinator_owns_event, event_registrations_detail
from services.event_service import get_event, set_registration_open
from services.audit_service import log_action
from services.registration_service import (
    get_registration, verify_manual_payment, check_in_ticket,
    InvalidPaymentStateError, MissingRejectionReasonError, DuplicateRegistrationError
)
from utils.auth import coordinator_login_required

bp = Blueprint("coordinator_api", __name__, url_prefix="/coordinator/api")


def _coordinator():
    return get_coordinator(session["coordinator_id"])


def _actor():
    return f"coordinator:{session.get('coordinator_username', 'unknown')}"


@bp.get("/my-events")
@coordinator_login_required
def my_events():
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    return jsonify([e.to_admin_dict() for e in coord.events])


@bp.get("/events/<event_id>/registrations")
@coordinator_login_required
def event_registrations(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    event = get_event(event_id)
    if not event:
        return jsonify({"error": "event not found"}), 404

    return jsonify(
        {
            "event": event.to_admin_dict(),
            "registrations": event_registrations_detail(event_id),
        }
    )


@bp.post("/events/<event_id>/close")
@coordinator_login_required
@limiter.limit("30 per minute")
def close_registration(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401
    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    ok = set_registration_open(event_id, False)
    if not ok:
        return jsonify({"error": "event not found"}), 404

    log_action(_actor(), "close_registration", f"event {event_id}", "")
    return jsonify({"ok": True, "registration_open": False})


@bp.post("/events/<event_id>/reopen")
@coordinator_login_required
@limiter.limit("30 per minute")
def reopen_registration(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401
    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    ok = set_registration_open(event_id, True)
    if not ok:
        return jsonify({"error": "event not found"}), 404

    log_action(_actor(), "reopen_registration", f"event {event_id}", "")
    return jsonify({"ok": True, "registration_open": True})


@bp.get("/events/<event_id>/export.csv")
@coordinator_login_required
@limiter.limit("20 per minute")
def export_registrations_csv(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401
    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    event = get_event(event_id)
    if not event:
        return jsonify({"error": "event not found"}), 404

    regs = event_registrations_detail(event_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["team_name", "participant_name", "is_leader", "email", "phone", "college", "register_number", "cybercarnival_token", "registration_status", "transaction_id", "payment_amount_paise", "registered_at"])
    for r in regs:
        for m in r["members"]:
            writer.writerow([
                r["team_name"] or "",
                m["name"], m["is_leader"], m["email"], m["phone"] or "", m["college"] or "",
                m.get("register_number") or "", m["cybercarnival_token"], r["status"],
                r.get("transaction_id") or "", r.get("payment_amount") or 0, r["registered_at"],
            ])

    log_action(_actor(), "export_csv", f"event {event_id}", "")
    safe_name = "".join(c if c.isalnum() else "_" for c in event.name).strip("_") or "event"
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={safe_name}_registrations.csv"},
    )


@bp.post("/registrations/<registration_id>/payment-verification")
@coordinator_login_required
@limiter.limit("60 per minute")
def payment_verification(registration_id):
    coord = _coordinator()
    if not coord: return jsonify({"error": "authentication required"}), 401
    reg = get_registration(registration_id)
    if not reg: return jsonify({"error": "registration not found"}), 404
    if not coordinator_owns_event(coord, reg.event_id):
        return jsonify({"error": "not authorized for this event"}), 403
    body = request.get_json(silent=True) or {}
    approved = bool(body.get("approved"))
    rejection_reason = body.get("rejection_reason")

    try:
        ok = verify_manual_payment(
            registration_id=registration_id,
            actor=_actor(),
            approved=approved,
            rejection_reason=rejection_reason
        )
    except InvalidPaymentStateError as e:
        return jsonify({"error": str(e)}), 409
    except MissingRejectionReasonError as e:
        return jsonify({"error": str(e)}), 422
    except DuplicateRegistrationError:
        return jsonify({"error": "cannot approve: a team member is already registered for this event"}), 409

    if not ok:
        return jsonify({"error": "registration not found"}), 404

    status_str = "confirmed" if approved else "rejected"
    log_action(_actor(), "payment_verified" if approved else "payment_rejected", f"registration {registration_id} -> {status_str}", "")
    return jsonify({"ok": True, "status": status_str})


@bp.post("/tickets/check-in")
@coordinator_login_required
@limiter.limit("60 per minute")
def coordinator_check_in_ticket():
    coord = _coordinator()
    if not coord:
        return jsonify({"error": "authentication required"}), 401
    body = request.get_json(silent=True) or {}
    registration_id = (body.get("registration_id") or body.get("ticket_id") or "").strip()
    token = (body.get("token") or "").strip() or None
    if not registration_id:
        return jsonify({"error": "registration_id or ticket_id is required"}), 422

    reg = get_registration(registration_id)
    if not reg:
        return jsonify({"error": "registration not found"}), 404
    if not coordinator_owns_event(coord, reg.event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    actor = _actor()
    res = check_in_ticket(registration_id=registration_id, token=token, actor=actor)
    status_code = 200 if res["success"] or res["status"] == "ALREADY_CHECKED_IN" else 400
    if res["status"] == "NOT_FOUND":
        status_code = 404
    log_action(actor, "TICKET_CHECK_IN", f"reg_id={registration_id} status={res['status']}", "")
    return jsonify(res), status_code
