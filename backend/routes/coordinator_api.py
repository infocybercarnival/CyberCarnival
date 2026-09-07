import csv
import io
import re
import secrets
from urllib.parse import parse_qs, urlparse

from flask import Blueprint, jsonify, session, Response, request

from extensions import limiter, db
from models import EventRegistration
from services.coordinator_service import (
    get_coordinator, coordinator_owns_event, event_registrations_detail,
    event_attendance_summary, get_coordinator_event_role
)
from services.event_service import get_event, set_registration_open
from services.audit_service import log_action
from services.registration_service import (
    get_registration, verify_manual_payment, check_in_ticket,
    InvalidPaymentStateError, MissingRejectionReasonError, DuplicateRegistrationError
)
from utils.auth import coordinator_login_required

bp = Blueprint("coordinator_api", __name__, url_prefix="/coordinator/api")


def _coordinator():
    cid = session.get("coordinator_id")
    if not cid:
        return None
    coord = get_coordinator(cid)
    if not coord or not coord.is_active:
        return None
    return coord


def _actor():
    return f"coordinator:{session.get('coordinator_username', 'unknown')}"


@bp.get("/me")
@coordinator_login_required
def me():
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    events_data = []
    for e in coord.events:
        d = e.to_admin_dict()
        d["attendance_stats"] = event_attendance_summary(e.id)
        d["coordinator_role"] = get_coordinator_event_role(coord.id, e.id)
        events_data.append(d)

    return jsonify({
        "id": coord.id,
        "username": coord.username,
        "full_name": coord.full_name,
        "email": coord.email,
        "events": events_data
    })


@bp.get("/events")
@bp.get("/my-events")
@coordinator_login_required
def my_events():
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    events_data = []
    for e in coord.events:
        d = e.to_admin_dict()
        d["attendance_stats"] = event_attendance_summary(e.id)
        d["coordinator_role"] = get_coordinator_event_role(coord.id, e.id)
        events_data.append(d)

    return jsonify(events_data)


@bp.get("/events/<event_id>")
@coordinator_login_required
def get_event_detail(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    event = get_event(event_id)
    if not event:
        return jsonify({"error": "event not found"}), 404

    d = event.to_admin_dict()
    d["attendance_stats"] = event_attendance_summary(event_id)
    d["coordinator_role"] = get_coordinator_event_role(coord.id, event_id)
    return jsonify(d)


@bp.get("/events/<event_id>/participants")
@coordinator_login_required
def event_participants(event_id):
    coord = _coordinator()
    if not coord:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    if not coordinator_owns_event(coord, event_id):
        return jsonify({"error": "not authorized for this event"}), 403

    event = get_event(event_id)
    if not event:
        return jsonify({"error": "event not found"}), 404

    return jsonify({
        "event": event.to_admin_dict(),
        "attendance_stats": event_attendance_summary(event_id),
        "registrations": event_registrations_detail(event_id)
    })


@bp.get("/events/<event_id>/registrations")
@coordinator_login_required
def event_registrations(event_id):
    return event_participants(event_id)


def _parse_qr_or_input(body_data: dict):
    """Extracts registration_id and token from raw QR payload, URL, JSON string, or direct fields."""
    qr_data = (body_data.get("qr_data") or body_data.get("raw_data") or "").strip()
    registration_id = (body_data.get("registration_id") or body_data.get("ticket_id") or "").strip()
    token = (body_data.get("token") or body_data.get("ticket_token") or "").strip() or None

    if qr_data:
        # Check if qr_data is a URL e.g. http://127.0.0.1:5000/ticket?id=UUID&token=HEX
        if "http://" in qr_data or "https://" in qr_data or "/ticket?" in qr_data or "id=" in qr_data:
            parsed = urlparse(qr_data)
            query = parse_qs(parsed.query if parsed.query else (qr_data.split("?", 1)[1] if "?" in qr_data else qr_data))
            if "id" in query and query["id"]:
                registration_id = query["id"][0].strip()
            if "token" in query and query["token"]:
                token = query["token"][0].strip()
        elif qr_data.startswith("{") and qr_data.endswith("}"):
            try:
                import json
                jdata = json.loads(qr_data)
                registration_id = (jdata.get("id") or jdata.get("registration_id") or jdata.get("ticket_id") or "").strip()
                token = (jdata.get("token") or jdata.get("ticket_token") or "").strip() or token
            except Exception:
                pass
        elif not registration_id:
            registration_id = qr_data.strip()

    return registration_id, token


@bp.post("/events/<event_id>/check-in")
@bp.post("/check-in")
@bp.post("/tickets/check-in")
@coordinator_login_required
@limiter.limit("60 per minute")
def event_check_in_ticket(event_id=None):
    coord = _coordinator()
    if not coord:
        return jsonify({"error": "authentication required"}), 401

    primary_event = coord.get_primary_event()
    if not primary_event:
        return jsonify({
            "success": False,
            "status": "WRONG_EVENT",
            "message": "This QR ticket belongs to another event"
        }), 403

    # Server-side event isolation:
    # If an event_id parameter was provided in the route URL, it MUST match the coordinator's assigned primary event
    if event_id and (event_id != primary_event.id or not coordinator_owns_event(coord, event_id)):
        return jsonify({
            "success": False,
            "status": "WRONG_EVENT",
            "message": "This QR ticket belongs to another event"
        }), 403

    assigned_event = primary_event

    body = request.get_json(silent=True) or (request.form.to_dict() if request.form else {})
    registration_id, token = _parse_qr_or_input(body)

    if not registration_id and token:
        # Search registration by ticket token if token provided without registration_id
        reg_by_token = EventRegistration.query.filter_by(ticket_token=token).first()
        if reg_by_token:
            registration_id = reg_by_token.id

    if not registration_id and not token:
        return jsonify({
            "success": False,
            "status": "INVALID_QR",
            "message": "Invalid QR code"
        }), 400

    if not registration_id:
        return jsonify({
            "success": False,
            "status": "INVALID_TICKET",
            "message": "QR token does not exist"
        }), 404

    reg = get_registration(registration_id)
    if not reg:
        return jsonify({
            "success": False,
            "status": "INVALID_TICKET",
            "message": "QR token does not exist"
        }), 404

    # Ownership check: Registration MUST belong to the coordinator's assigned event
    if reg.event_id != assigned_event.id:
        return jsonify({
            "success": False,
            "status": "WRONG_EVENT",
            "message": "This QR ticket belongs to another event"
        }), 403

    # Registration Status checks
    if reg.status == "pending_verification":
        return jsonify({
            "success": False,
            "status": "PAYMENT_NOT_VERIFIED",
            "message": "Registration payment verification is pending"
        }), 400

    if reg.status == "rejected":
        return jsonify({
            "success": False,
            "status": "REGISTRATION_REJECTED",
            "message": "Registration is rejected"
        }), 400

    if reg.status != "confirmed":
        return jsonify({
            "success": False,
            "status": "INVALID_STATUS",
            "message": f"Registration status is '{reg.status}'. Ticket valid only when confirmed."
        }), 400

    # Constant-time token comparison
    if reg.ticket_token:
        if not token or not secrets.compare_digest(reg.ticket_token.strip(), token.strip()):
            return jsonify({
                "success": False,
                "status": "INVALID_TICKET",
                "message": "Invalid ticket token"
            }), 400

    participant_name = reg.leader.full_name or reg.leader.username if reg.leader else "Participant"
    participant_email = reg.leader.email if reg.leader else ""

    # Double Scan Protection
    if reg.checked_in:
        checked_in_at_str = reg.checked_in_at.strftime("%Y-%m-%d %H:%M:%S UTC") if reg.checked_in_at else "Earlier"
        actor_name = reg.checked_in_by or coord.username
        return jsonify({
            "success": False,
            "status": "ALREADY_PRESENT",
            "message": "Already marked as present",
            "participant": {
                "name": participant_name,
                "email": participant_email
            },
            "event": assigned_event.name,
            "checked_in_at": checked_in_at_str,
            "checked_in_by": actor_name,
            "registration_id": reg.id,
            "team_name": reg.team_name,
            "attendance_stats": event_attendance_summary(assigned_event.id)
        }), 200

    # Execute check-in
    actor_str = coord.username
    res = check_in_ticket(registration_id=reg.id, token=token, actor=actor_str)
    res["attendance_stats"] = event_attendance_summary(assigned_event.id)

    log_action(f"coordinator:{coord.username}", "TICKET_CHECK_IN", f"event={assigned_event.id} reg_id={reg.id} status={res['status']}", request.remote_addr or "unknown")
    return jsonify(res), 200


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

    log_action(_actor(), "close_registration", f"event {event_id}", request.remote_addr or "unknown")
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

    log_action(_actor(), "reopen_registration", f"event {event_id}", request.remote_addr or "unknown")
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
    writer.writerow(["team_name", "participant_name", "is_leader", "email", "phone", "college", "register_number", "cybercarnival_token", "registration_status", "checked_in", "checked_in_at", "transaction_id", "registered_at"])
    for r in regs:
        for m in r["members"]:
            writer.writerow([
                r["team_name"] or "",
                m["name"], m["is_leader"], m["email"], m["phone"] or "", m["college"] or "",
                m.get("register_number") or "", m["cybercarnival_token"] or "", r["status"],
                r.get("checked_in", False), r.get("checked_in_at") or "",
                r.get("transaction_id") or "", r["registered_at"],
            ])

    log_action(_actor(), "export_csv", f"event {event_id}", request.remote_addr or "unknown")
    safe_name = "".join(c if c.isalnum() else "_" for c in event.name).strip("_") or "event"
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={safe_name}_registrations.csv"},
    )


@bp.route("/logout", methods=["GET", "POST"])
def coordinator_api_logout():
    from services.session_service import revoke_session
    cname = session.get("coordinator_username")
    if cname:
        log_action(f"coordinator:{cname}", "logout", "coordinator logged out via API", request.remote_addr or "unknown")
    sid = session.get("sid")
    if sid:
        revoke_session(sid)
    session.clear()
    return jsonify({"success": True, "ok": True, "message": "Logged out successfully"})


