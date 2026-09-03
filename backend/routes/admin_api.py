import csv
import io
import datetime

from flask import Blueprint, request, jsonify, session, Response

from extensions import limiter, db
from utils.auth import login_required
from utils.logger import get_logger
from services import registration_service as regs
from services import event_service as events
from services import audit_service
from services import user_service
from services import coordinator_service as coordinators
from services import speaker_service as speakers
from utils.id_generator import new_username, new_temp_password
from models import User

bp = Blueprint("admin_api", __name__, url_prefix="/admin/api")
logger = get_logger("admin_api")


def _actor():
    return session.get("admin_username", "unknown")


def _ip():
    return request.remote_addr or "unknown"


def _reg_to_dict(reg):
    leader = reg.leader
    members = [
        {
            "user_id": m.user_id,
            "name": m.user.full_name or m.user.username,
            "email": m.user.email,
            "phone": m.user.phone,
            "college": m.user.college,
            "register_number": m.user.register_number,
            "cybercarnival_token": m.user.cybercarnival_token,
            "is_leader": m.is_leader,
        }
        for m in reg.members
    ]
    return {
        "id": reg.id,
        "event_id": reg.event_id,
        "event_name": reg.event.name if reg.event else reg.event_id,
        "team_name": reg.team_name,
        "leader_name": leader.full_name or leader.username if leader else "",
        "leader_email": leader.email if leader else "",
        "status": reg.status,
        "transaction_id": reg.transaction_id,
        "payment_amount": reg.payment_amount,
        "payment_proof_url": f"/api/registrations/{reg.id}/payment-proof" if reg.payment_proof_filename else None,
        "disclaimer_accepted": reg.disclaimer_accepted,
        "participant_mode": reg.participant_mode,
        "member_count": len(members),
        "members": members,
        "created_at": reg.created_at.timestamp() if reg.created_at else None,
    }


# --- Summary -----------------------------------------------------------------------

@bp.get("/summary")
@login_required
def summary():
    all_events = events.list_events(include_inactive=True)
    counts = regs.counts_by_event()
    total_users = User.query.count()
    total_registered_users = len(regs.registered_user_ids())
    return jsonify(
        {
            "total_registrations": sum(counts.values()),
            "total_events": len(all_events),
            "total_accounts": total_users,
            "accounts_never_registered": total_users - total_registered_users,
            "by_event": [
                {"event_id": e.id, "event_name": e.name, "count": counts.get(e.id, 0)}
                for e in all_events
            ],
        }
    )


# --- Registrations -------------------------------------------------------------------

@bp.get("/registrations")
@login_required
def list_registrations():
    event_id = request.args.get("event_id") or None
    return jsonify([_reg_to_dict(r) for r in regs.list_registrations(event_id)])


@bp.get("/registrations/export.csv")
@login_required
@limiter.limit("20 per minute")
def export_registrations_csv():
    event_id = request.args.get("event_id") or None
    records = [_reg_to_dict(r) for r in regs.list_registrations(event_id)]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["registration_id", "event_id", "event_name", "team_name", "participant_name", "is_leader", "email", "phone", "college", "register_number", "cybercarnival_token", "status", "transaction_id", "payment_amount_paise", "created_at"])
    for r in records:
        for m in r["members"]:
            writer.writerow([
                r["id"], r["event_id"], r["event_name"], r["team_name"] or "",
                m["name"], m["is_leader"], m["email"], m.get("phone") or "",
                m.get("college") or "", m.get("register_number") or "",
                m["cybercarnival_token"], r["status"], r.get("transaction_id") or "",
                r.get("payment_amount") or 0, r["created_at"],
            ])

    audit_service.log_action(_actor(), "export_csv", f"exported registrations (event_id={event_id})", _ip())
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=registrations.csv"},
    )


@bp.post("/registrations/<registration_id>/status")
@login_required
@limiter.limit("60 per minute")
def update_registration_status(registration_id):
    body = request.get_json(silent=True) or {}
    status = body.get("status")
    try:
        ok = regs.set_status(registration_id, status)
    except ValueError:
        return jsonify({"error": "invalid status"}), 422
    except regs.DuplicateRegistrationError:
        return jsonify({"error": "cannot activate status: a team member is already registered for this event"}), 409
    if not ok:
        return jsonify({"error": "not found"}), 404
    if status == "confirmed":
        reg = regs.get_registration(registration_id)
        if reg and reg.transaction_id:
            reg.payment_verified_at = datetime.datetime.utcnow()
            reg.payment_verified_by = _actor()
            db.session.commit()
    audit_service.log_action(_actor(), "update_status", f"registration {registration_id} -> {status}", _ip())
    return jsonify({"ok": True})


@bp.delete("/registrations/<registration_id>")
@login_required
@limiter.limit("60 per minute")
def delete_registration(registration_id):
    ok = regs.delete_registration(registration_id)
    if not ok:
        return jsonify({"error": "not found"}), 404
    audit_service.log_action(_actor(), "delete_registration", f"registration {registration_id}", _ip())
    return jsonify({"ok": True})


# --- Participants (accounts, split by registered / never registered) ------------------

@bp.get("/participants")
@login_required
def list_participants():
    """Two buckets the admin asked for: accounts that have registered for at
    least one event, and accounts that verified OTP / logged in but never did."""
    registered_ids = regs.registered_user_ids()
    all_users = User.query.order_by(User.created_at.desc()).all()

    def user_dict(u):
        return {
            "id": u.id,
            "cybercarnival_token": u.cybercarnival_token,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "phone": u.phone,
            "college": u.college,
            "profile_completed": u.profile_completed,
            "created_at": u.created_at.timestamp() if u.created_at else None,
        }

    registered = [user_dict(u) for u in all_users if u.id in registered_ids]
    not_registered = [user_dict(u) for u in all_users if u.id not in registered_ids]
    return jsonify({"registered": registered, "not_registered": not_registered})


# --- Events --------------------------------------------------------------------------

def _event_fields_from_form(form) -> dict:
    data = {}
    for key in ("name", "category", "tag", "description", "venue", "date", "time", "fee", "prize"):
        if key in form:
            data[key] = form.get(key, "").strip()[:500]
    for key, target in (("min_team_size", "min_team_size"), ("max_team_size", "max_team_size"), ("max_teams", "max_teams")):
        if key in form and form.get(key, "").strip() != "":
            try:
                data[target] = int(form.get(key))
            except ValueError:
                pass
        elif key in form:
            data[target] = None
    # Entered in rupees (whole or with paise, e.g. "250" or "250.50") since
    # that's what a human types; stored as integer paise for Razorpay.
    # Separate from the free-text `fee` display field above — leaving this
    # blank/0 means the event is free and skips the payment step entirely.
    if "fee_rupees" in form:
        raw = form.get("fee_rupees", "").strip()
        if raw:
            try:
                data["fee_amount"] = round(float(raw) * 100)
            except ValueError:
                pass
        else:
            data["fee_amount"] = None
    # HTML <input type="date"> submits "YYYY-MM-DD" or "" (cleared) — used
    # only for the same-day registration-conflict check, kept separate from
    # the free-text `date` display field above.
    for key, target in (("start_date", "start_date"), ("end_date", "end_date")):
        if key in form:
            raw = form.get(key, "").strip()
            if raw:
                try:
                    data[target] = datetime.date.fromisoformat(raw)
                except ValueError:
                    pass
            else:
                data[target] = None
    return data


@bp.get("/events")
@login_required
def list_events():
    return jsonify([e.to_admin_dict() for e in events.list_events(include_inactive=True)])


@bp.post("/events")
@login_required
@limiter.limit("30 per minute")
def create_event():
    # multipart/form-data so the poster file can ride along with the fields.
    form = request.form
    name = form.get("name", "").strip()
    if not name or len(name) > 150:
        return jsonify({"error": "name is required (max 150 chars)"}), 422

    data = _event_fields_from_form(form)
    data["name"] = name
    record = events.create_event(data)

    poster = request.files.get("poster")
    if poster and poster.filename:
        try:
            events.save_poster(record, poster)
        except ValueError as e:
            return jsonify({"error": str(e)}), 422

    audit_service.log_action(_actor(), "create_event", f"event {record.id} ({name})", _ip())
    return jsonify(record.to_admin_dict()), 201


@bp.put("/events/<event_id>")
@login_required
@limiter.limit("30 per minute")
def edit_event(event_id):
    form = request.form
    data = _event_fields_from_form(form)
    if "name" in data and (not data["name"] or len(data["name"]) > 150):
        return jsonify({"error": "name is required (max 150 chars)"}), 422

    record = events.update_event(event_id, data)
    if not record:
        return jsonify({"error": "not found"}), 404

    poster = request.files.get("poster")
    if poster and poster.filename:
        try:
            events.save_poster(record, poster)
        except ValueError as e:
            return jsonify({"error": str(e)}), 422

    audit_service.log_action(_actor(), "edit_event", f"event {event_id}", _ip())
    return jsonify(record.to_admin_dict())


@bp.post("/events/<event_id>/toggle")
@login_required
@limiter.limit("60 per minute")
def toggle_event(event_id):
    body = request.get_json(silent=True) or {}
    active = bool(body.get("active", True))
    ok = events.set_event_active(event_id, active)
    if not ok:
        return jsonify({"error": "not found"}), 404
    audit_service.log_action(_actor(), "toggle_event", f"event {event_id} active={active}", _ip())
    return jsonify({"ok": True})


@bp.delete("/events/<event_id>")
@login_required
@limiter.limit("60 per minute")
def delete_event(event_id):
    ok = events.delete_event(event_id)
    if not ok:
        return jsonify({"error": "not found"}), 404
    audit_service.log_action(_actor(), "delete_event", f"event {event_id}", _ip())
    return jsonify({"ok": True})


# --- Speakers ---------------------------------------------------------------------------

def _speaker_fields_from_form(form) -> dict:
    data = {}
    for key in ("name", "designation", "organization", "category", "bio",
                "session_title", "session_time", "session_venue",
                "twitter_url", "linkedin_url", "github_url"):
        if key in form:
            data[key] = form.get(key, "").strip()[:2000] or None
    if "expertise" in form:
        data["expertise"] = [e.strip() for e in form.get("expertise", "").split(",") if e.strip()]
    if "display_order" in form:
        try:
            data["display_order"] = int(form.get("display_order") or 0)
        except ValueError:
            pass
    if "is_featured" in form:
        data["is_featured"] = form.get("is_featured") in ("true", "on", "1")
    if "active" in form:
        data["active"] = form.get("active") in ("true", "on", "1")
    return data


# --- Audit log -------------------------------------------------------------------------

@bp.get("/audit-log")
@login_required
def audit_log():
    return jsonify(audit_service.list_audit_log())