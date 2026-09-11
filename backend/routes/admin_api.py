import csv
import io
import datetime

from flask import Blueprint, request, jsonify, session, Response, redirect

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
from models import User, EventRegistration

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
            "name": m.participant_name or (m.user.full_name if m.user else None) or (m.user.username if m.user else ""),
            "email": m.participant_email or (m.user.email if m.user else ""),
            "phone": m.participant_phone or (m.user.phone if m.user else ""),
            "college": m.college_name or (m.user.college if m.user else ""),
            "register_number": m.user.register_number if m.user else "",
            "cybercarnival_token": m.user.cybercarnival_token if m.user else "",
            "is_leader": m.is_leader,
            "participant_name": m.participant_name or (m.user.full_name if m.user else None) or (m.user.username if m.user else ""),
            "participant_email": m.participant_email or (m.user.email if m.user else ""),
            "college_name": m.college_name or (m.user.college if m.user else ""),
            "participant_phone": m.participant_phone or (m.user.phone if m.user else ""),
        }
        for m in reg.members
    ]
    expected_amount = reg.event.fee_amount if (reg.event and reg.event.fee_amount) else 0
    return {
        "id": reg.id,
        "event_id": reg.event_id,
        "event_name": reg.event.name if reg.event else reg.event_id,
        "team_name": reg.team_name,
        "leader_user_id": reg.leader_user_id,
        "leader_name": leader.full_name or leader.username if leader else "",
        "leader_email": leader.email if leader else "",
        "leader_phone": leader.phone if leader else "",
        "leader_college": leader.college if leader else "",
        "leader_cybercarnival_token": leader.cybercarnival_token if leader else "",
        "status": reg.status,
        "ticket_token": reg.ticket_token,
        "checked_in": reg.checked_in or False,
        "checked_in_at": reg.checked_in_at.timestamp() if reg.checked_in_at else None,
        "checked_in_by": reg.checked_in_by,
        "transaction_id": reg.transaction_id,
        "payment_amount": reg.payment_amount,
        "expected_amount": expected_amount,
        "expected_amount_rupees": f"{expected_amount / 100:.2f}",
        "payment_submitted_at": reg.payment_submitted_at.timestamp() if reg.payment_submitted_at else None,
        "payment_reviewed_at": reg.payment_reviewed_at.timestamp() if reg.payment_reviewed_at else None,
        "payment_reviewed_by": reg.payment_reviewed_by,
        "payment_verified_at": reg.payment_verified_at.timestamp() if reg.payment_verified_at else None,
        "payment_verified_by": reg.payment_verified_by,
        "rejection_reason": reg.rejection_reason,
        "payment_proof_url": f"/admin/api/registrations/{reg.id}/proof" if reg.payment_proof_filename else None,
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


@bp.get("/registrations/<registration_id>")
@login_required
def get_registration_detail(registration_id):
    reg = regs.get_registration(registration_id)
    if not reg:
        return jsonify({"error": "registration not found"}), 404
    return jsonify(_reg_to_dict(reg))


@bp.get("/registrations/<registration_id>/proof")
@login_required
def admin_view_payment_proof(registration_id):
    from flask import send_from_directory
    import config
    reg = regs.get_registration(registration_id)
    if not reg or not reg.payment_proof_filename:
        return jsonify({"error": "payment proof not found"}), 404
    fn = reg.payment_proof_filename
    if fn and fn.startswith("supabase:"):
        from services.storage_service import get_signed_payment_proof_url
        signed_url = get_signed_payment_proof_url(fn)
        if signed_url:
            return redirect(signed_url)
    return send_from_directory(config.PAYMENT_PROOF_DIR, fn)


@bp.get("/registrations/export.csv")
@login_required
@limiter.limit("20 per minute")
def export_registrations_csv():
    event_id = request.args.get("event_id") or None
    status_filter = request.args.get("status") or None
    records = [_reg_to_dict(r) for r in regs.list_registrations(event_id)]

    if status_filter:
        if status_filter == "verified":
            records = [r for r in records if r["status"] == "confirmed"]
        elif status_filter == "unverified":
            records = [r for r in records if r["status"] == "pending_verification"]
        elif status_filter == "declined":
            records = [r for r in records if r["status"] == "rejected"]

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["registration_id", "event_id", "event_name", "team_name", "participant_name", "is_leader", "email", "phone", "college", "register_number", "cybercarnival_token", "status", "transaction_id", "payment_amount_paise", "rejection_reason", "created_at"])
    for r in records:
        for m in r["members"]:
            writer.writerow([
                r["id"], r["event_id"], r["event_name"], r["team_name"] or "",
                m["name"], m["is_leader"], m["email"], m.get("phone") or "",
                m.get("college") or "", m.get("register_number") or "",
                m["cybercarnival_token"], r["status"], r.get("transaction_id") or "",
                r.get("payment_amount") or 0, r.get("rejection_reason") or "", r["created_at"],
            ])

    audit_service.log_action(_actor(), "export_csv", f"exported registrations (event_id={event_id}, status={status_filter})", _ip())
    return Response(
        buffer.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=registrations.csv"},
    )


@bp.post("/registrations/<registration_id>/verify")
@login_required
@limiter.limit("60 per minute")
def verify_registration_payment(registration_id):
    body = request.get_json(silent=True) or {}
    approved = bool(body.get("approved"))
    rejection_reason = body.get("rejection_reason")
    actor = _actor()

    try:
        ok = regs.verify_manual_payment(
            registration_id=registration_id,
            actor=actor,
            approved=approved,
            rejection_reason=rejection_reason
        )
    except regs.InvalidPaymentStateError as e:
        return jsonify({"error": str(e)}), 409
    except regs.MissingRejectionReasonError as e:
        return jsonify({"error": str(e)}), 422
    except regs.DuplicateRegistrationError:
        return jsonify({"error": "cannot approve: a team member is already registered for this event"}), 409

    if not ok:
        return jsonify({"error": "registration not found"}), 404

    status_str = "confirmed" if approved else "rejected"
    audit_service.log_action(actor, f"verify_payment_{status_str}", f"registration {registration_id} -> {status_str}", _ip())
    return jsonify({"ok": True, "status": status_str})


@bp.post("/tickets/check-in")
@login_required
@limiter.limit("60 per minute")
def admin_check_in_ticket():
    body = request.get_json(silent=True) or {}
    registration_id = (body.get("registration_id") or body.get("ticket_id") or "").strip()
    token = (body.get("token") or "").strip() or None
    if not registration_id:
        return jsonify({"error": "registration_id or ticket_id is required"}), 422

    actor = _actor()
    res = regs.check_in_ticket(registration_id=registration_id, token=token, actor=actor)
    status_code = 200 if res["success"] or res["status"] == "ALREADY_CHECKED_IN" else 400
    if res["status"] == "NOT_FOUND":
        status_code = 404
    audit_service.log_action(actor, "TICKET_CHECK_IN", f"reg_id={registration_id} status={res['status']}", _ip())
    return jsonify(res), status_code


@bp.delete("/registrations/<registration_id>")
@login_required
@limiter.limit("60 per minute")
def delete_registration(registration_id):
    ok = regs.delete_registration(registration_id)
    if not ok:
        return jsonify({"error": "not found"}), 404
    audit_service.log_action(_actor(), "delete_registration", f"registration {registration_id}", _ip())
    return jsonify({"ok": True})


# --- Participants (accounts, attendance, filtering) ------------------

@bp.get("/participants")
@login_required
def list_participants():
    attendance_filter = (request.args.get("attendance") or "").strip().lower()
    event_filter = (request.args.get("event_id") or "").strip()

    from models import RegistrationMember
    from collections import defaultdict

    all_users = User.query.order_by(User.created_at.desc()).all()
    all_events_map = {e.id: e.name for e in events.list_events(include_inactive=True)}

    all_members = (
        db.session.query(RegistrationMember, EventRegistration)
        .join(EventRegistration, RegistrationMember.registration_id == EventRegistration.id)
        .all()
    )

    user_members_map = defaultdict(list)
    for member, reg in all_members:
        user_members_map[member.user_id].append((member, reg))

    participant_records = []
    total_participants = len(all_users)
    present_set = set()
    not_attended_set = set()

    for u in all_users:
        user_m_pairs = user_members_map.get(u.id, [])
        attended_events = []
        unattended_events = []
        all_registrations = []
        has_registrations = len(user_m_pairs) > 0

        for m, reg in user_m_pairs:
            evt_name = all_events_map.get(reg.event_id, reg.event_id)
            reg_info = {
                "registration_id": reg.id,
                "event_id": reg.event_id,
                "event_name": evt_name,
                "status": reg.status,
                "checked_in": bool(reg.checked_in),
                "checked_in_at": reg.checked_in_at.timestamp() if reg.checked_in_at else None,
                "checked_in_at_formatted": reg.checked_in_at.strftime("%d %b %Y, %I:%M %p UTC") if reg.checked_in_at else None,
                "checked_in_by": reg.checked_in_by,
                "team_name": reg.team_name,
                "is_leader": m.is_leader,
            }
            all_registrations.append(reg_info)

            if reg.checked_in and reg.status == "confirmed":
                attended_events.append(reg_info)
            else:
                unattended_events.append(reg_info)

        is_present = len(attended_events) > 0
        overall_attendance = "PRESENT" if is_present else "NOT_ATTENDED"

        # Summary sets (event-scoped if event_filter active, otherwise global)
        if event_filter:
            reg_for_event = any(r["event_id"] == event_filter for r in all_registrations)
            att_for_event = any(r["event_id"] == event_filter for r in attended_events)
            if att_for_event:
                present_set.add(u.id)
            elif reg_for_event:
                not_attended_set.add(u.id)
        else:
            if is_present:
                present_set.add(u.id)
            elif has_registrations:
                not_attended_set.add(u.id)

        # Filtering logic
        if event_filter:
            user_event_ids = {r["event_id"] for r in all_registrations}
            if event_filter not in user_event_ids:
                continue
            if attendance_filter == "present":
                checked_in_event_ids = {r["event_id"] for r in attended_events}
                if event_filter not in checked_in_event_ids:
                    continue
            elif attendance_filter == "not_attended":
                checked_in_event_ids = {r["event_id"] for r in attended_events}
                if event_filter in checked_in_event_ids:
                    continue
        else:
            if attendance_filter == "present" and not is_present:
                continue
            if attendance_filter == "not_attended" and (is_present or not has_registrations):
                continue

        p_dict = {
            "id": u.id,
            "cybercarnival_token": u.cybercarnival_token,
            "username": u.username,
            "email": u.email,
            "full_name": u.full_name,
            "phone": u.phone,
            "college": u.college,
            "register_number": u.register_number,
            "profile_completed": u.profile_completed,
            "created_at": u.created_at.timestamp() if u.created_at else None,
            "has_registrations": has_registrations,
            "overall_attendance": overall_attendance,
            "attended_events_count": len(attended_events),
            "attended_events": attended_events,
            "unattended_events": unattended_events,
            "all_registrations": all_registrations,
        }
        participant_records.append(p_dict)

    # Pagination calculations
    try:
        page = max(1, int(request.args.get("page", 1)))
    except (ValueError, TypeError):
        page = 1

    try:
        per_page = max(1, int(request.args.get("per_page", 10)))
    except (ValueError, TypeError):
        per_page = 10

    total_records = len(participant_records)
    import math
    total_pages = math.ceil(total_records / per_page) if total_records > 0 else 1

    if page > total_pages and total_pages > 0:
        page = total_pages

    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_records = participant_records[start_idx:end_idx]

    registered = [p for p in paginated_records if p["has_registrations"]]
    not_registered = [p for p in paginated_records if not p["has_registrations"]]

    summary_total = (len(present_set) + len(not_attended_set)) if event_filter else total_participants
    summary_unregistered = 0 if event_filter else (total_participants - len(present_set) - len(not_attended_set))

    return jsonify({
        "summary": {
            "total_participants": summary_total,
            "present_count": len(present_set),
            "not_attended_count": len(not_attended_set),
            "unregistered_count": summary_unregistered
        },
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total_records,
            "total_pages": total_pages
        },
        "participants": paginated_records,
        "registered": registered,
        "not_registered": not_registered
    })


# --- Events --------------------------------------------------------------------------

def _event_fields_from_form(form) -> dict:
    data = {}
    for key in ("name", "category", "tag", "description", "venue", "date", "time", "fee", "prize"):
        if key in form:
            data[key] = form.get(key, "").strip()[:500] or None

    for key, target in (("min_team_size", "min_team_size"), ("max_team_size", "max_team_size"), ("max_teams", "max_teams")):
        if key in form:
            raw_val = form.get(key, "").strip()
            if raw_val != "":
                try:
                    val = int(raw_val)
                    data[target] = val if val >= 0 else None
                except ValueError:
                    pass
            else:
                data[target] = None

    if "fee_rupees" in form:
        raw = form.get("fee_rupees", "").strip()
        if raw:
            try:
                data["fee_amount"] = max(0, round(float(raw) * 100))
            except ValueError:
                pass
        else:
            data["fee_amount"] = None

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

    if "active" in form:
        raw_act = form.get("active", "").strip().lower()
        data["active"] = raw_act in ("true", "on", "1", "yes")

    if "registration_open" in form:
        raw_reg = form.get("registration_open", "").strip().lower()
        data["registration_open"] = raw_reg in ("true", "on", "1", "yes")

    return data


@bp.get("/coordinators")
@login_required
def list_coordinators():
    return jsonify([c.to_admin_dict() for c in coordinators.list_coordinators()])


@bp.get("/events")
@login_required
def list_events():
    return jsonify([e.to_admin_dict() for e in events.list_events(include_inactive=True)])


@bp.get("/events/<event_id>")
@login_required
def get_event_detail(event_id):
    e = events.get_event(event_id)
    if not e:
        return jsonify({"error": "event not found"}), 404
    return jsonify(e.to_admin_dict())


def _parse_coordinator_ids_from_form(form) -> tuple[list, list]:
    faculty_ids = form.getlist("faculty_coordinators") or form.getlist("faculty_coordinators[]")
    student_ids = form.getlist("student_coordinators") or form.getlist("student_coordinators[]")
    if "coordinators_json" in form and form.get("coordinators_json").strip():
        try:
            import json
            c_data = json.loads(form.get("coordinators_json"))
            if isinstance(c_data, dict):
                faculty_ids = c_data.get("faculty", faculty_ids)
                student_ids = c_data.get("student", student_ids)
        except Exception:
            pass
    return faculty_ids, student_ids


@bp.post("/events")
@login_required
@limiter.limit("30 per minute")
def create_event():
    form = request.form
    name = form.get("name", "").strip()
    if not name or len(name) > 150:
        return jsonify({"error": "name is required (max 150 chars)"}), 422

    data = _event_fields_from_form(form)
    data["name"] = name
    record = events.create_event(data)

    faculty_ids, student_ids = _parse_coordinator_ids_from_form(form)
    coordinators.sync_event_coordinators(record.id, faculty_ids, student_ids)

    poster = request.files.get("poster")
    poster_2 = request.files.get("poster_2")

    try:
        if poster and poster.filename:
            events.save_poster(record, poster)

        if poster_2 and poster_2.filename:
            events.save_second_poster(record, poster_2)

    except ValueError as e:
        events.delete_event(record.id)
        return jsonify({"error": f"Poster validation failed: {str(e)}"}), 422

    audit_service.log_action(_actor(), "EVENT_CREATED", f"event {record.id} ({name})", _ip())
    return jsonify({
        "ok": True,
        "event_id": record.id,
        "message": "Event created successfully"
    }), 201


@bp.put("/events/<event_id>")
@login_required
@limiter.limit("30 per minute")
def edit_event(event_id):
    logger.info("EVENT EDIT START event_id=%s", event_id)

    try:
        existing = events.get_event(event_id)
    except Exception as e:
        logger.exception("EVENT LOOKUP ERROR event_id=%s", event_id)
        return jsonify({
            "error": f"Event lookup failed: {type(e).__name__}: {str(e)}"
        }), 500

    if not existing:
        return jsonify({"error": "event not found"}), 404

    form = request.form
    data = _event_fields_from_form(form)

    if "name" in data and (not data["name"] or len(data["name"]) > 150):
        return jsonify({"error": "name is required (max 150 chars)"}), 422

    # Capacity Safety Check: pending_payment also occupies a slot, so include it.
    if "max_teams" in data and data["max_teams"] is not None:
        new_max = data["max_teams"]

        try:
            active_count = (
                EventRegistration.query.filter_by(event_id=event_id)
                .filter(
                    EventRegistration.status.in_(
                        ["confirmed", "pending_verification", "pending_payment"]
                    )
                )
                .count()
            )
        except Exception as e:
            logger.exception("EVENT CAPACITY CHECK ERROR event_id=%s", event_id)
            return jsonify({
                "error": f"Capacity check failed: {type(e).__name__}: {str(e)}"
            }), 500

        if new_max < active_count:
            return jsonify({
                "error": (
                    f"Capacity cannot be set to {new_max}: "
                    f"{active_count} active registration(s) already exist."
                )
            }), 422

    # STEP 1: Update the event row itself.
    try:
        logger.info(
            "EVENT DB UPDATE START event_id=%s fields=%s",
            event_id,
            ",".join(sorted(data.keys())) if data else "none",
        )

        record = events.update_event(event_id, data)

        if not record:
            logger.error("EVENT DB UPDATE RETURNED NONE event_id=%s", event_id)
            return jsonify({"error": "event not found during update"}), 404

        logger.info("EVENT DB UPDATE SUCCESS event_id=%s", event_id)

    except Exception as e:
        logger.exception("EVENT DB UPDATE ERROR event_id=%s", event_id)
        return jsonify({
            "error": f"Event update failed: {type(e).__name__}: {str(e)}"
        }), 500

    # STEP 2: Sync faculty/student coordinator assignments.
    try:
        faculty_ids, student_ids = _parse_coordinator_ids_from_form(form)

        logger.info(
            "EVENT COORDINATOR SYNC START event_id=%s faculty_count=%s student_count=%s",
            event_id,
            len(faculty_ids),
            len(student_ids),
        )

        coordinators.sync_event_coordinators(
            record.id,
            faculty_ids,
            student_ids,
        )

        logger.info("EVENT COORDINATOR SYNC SUCCESS event_id=%s", event_id)

    except Exception as e:
        logger.exception("EVENT COORDINATOR SYNC ERROR event_id=%s", event_id)
        return jsonify({
            "error": f"Coordinator sync failed: {type(e).__name__}: {str(e)}"
        }), 500

    # STEP 3: Save poster, if one was included in this edit request.
    poster = request.files.get("poster")

    if poster and poster.filename:
        logger.info(
            "POSTER UPLOAD START event_id=%s filename=%s content_type=%s",
            event_id,
            poster.filename,
            poster.content_type,
        )

        try:
            poster_url = events.save_poster(record, poster)

            logger.info(
                "POSTER UPLOAD SUCCESS event_id=%s url=%s",
                event_id,
                poster_url,
            )

        except ValueError as e:
            logger.exception(
                "POSTER VALIDATION/SAVE ERROR event_id=%s",
                event_id,
            )
            return jsonify({
                "error": f"Poster upload failed: {str(e)}"
            }), 422

        except Exception as e:
            logger.exception(
                "POSTER UNEXPECTED ERROR event_id=%s",
                event_id,
            )
            return jsonify({
                "error": f"Poster upload server error: {type(e).__name__}: {str(e)}"
            }), 500
    else:
        logger.info("EVENT EDIT NO POSTER event_id=%s", event_id)

    # STEP 4: Save optional second poster.
    poster_2 = request.files.get("poster_2")

    if poster_2 and poster_2.filename:
        logger.info(
            "POSTER 2 UPLOAD START event_id=%s filename=%s content_type=%s",
            event_id,
            poster_2.filename,
            poster_2.content_type,
        )

        try:
            poster_url_2 = events.save_second_poster(record, poster_2)
            logger.info("POSTER 2 UPLOAD SUCCESS event_id=%s url=%s", event_id, poster_url_2)

        except ValueError as e:
            logger.exception("POSTER 2 VALIDATION/SAVE ERROR event_id=%s", event_id)
            return jsonify({"error": f"Second poster upload failed: {str(e)}"}), 422

        except Exception as e:
            logger.exception("POSTER 2 UNEXPECTED ERROR event_id=%s", event_id)
            return jsonify({
                "error": f"Second poster upload server error: {type(e).__name__}: {str(e)}"
            }), 500
    else:
        logger.info("EVENT EDIT NO SECOND POSTER event_id=%s", event_id)

    changed_fields = list(data.keys())

    try:
        audit_service.log_action(
            _actor(),
            "EVENT_UPDATED",
            f"event {event_id} (updated: {', '.join(changed_fields)})",
            _ip(),
        )
    except Exception:
        # Do not fail a successful event edit just because audit logging failed.
        logger.exception("EVENT AUDIT LOG ERROR event_id=%s", event_id)

    logger.info("EVENT EDIT SUCCESS event_id=%s", event_id)
    return jsonify({
        "ok": True,
        "event_id": record.id,
        "message": "Event updated successfully"
    })


@bp.post("/events/<event_id>/toggle")
@login_required
@limiter.limit("60 per minute")
def toggle_event(event_id):
    body = request.get_json(silent=True) or {}
    active = bool(body.get("active", True))
    ok = events.set_event_active(event_id, active)
    if not ok:
        return jsonify({"error": "not found"}), 404
    audit_service.log_action(_actor(), "EVENT_TOGGLED", f"event {event_id} active={active}", _ip())
    return jsonify({"ok": True})


@bp.delete("/events/<event_id>")
@login_required
@limiter.limit("60 per minute")
def delete_event(event_id):
    reg_count = EventRegistration.query.filter_by(event_id=event_id).count()
    if reg_count > 0:
        return jsonify({"error": f"Cannot delete event: {reg_count} registration(s) exist for this event."}), 409

    ok = events.delete_event(event_id)
    if not ok:
        return jsonify({"error": "not found"}), 404

    audit_service.log_action(_actor(), "EVENT_DELETED", f"event {event_id}", _ip())
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


# --- Coordinator Management -----------------------------------------------------------

@bp.get("/coordinators")
@login_required
def list_admin_coordinators():
    coords = coordinators.list_coordinators()
    res = []
    for c in coords:
        d = c.to_admin_dict()
        res.append(d)
    return jsonify(res)


@bp.post("/coordinators")
@login_required
@limiter.limit("30 per minute")
def create_admin_coordinator():
    body = request.get_json(silent=True) or (request.form.to_dict() if request.form else {})
    full_name = (body.get("full_name") or "").strip()
    phone = (body.get("phone") or "").strip()
    email = (body.get("email") or "").strip()
    role = (body.get("role") or "STUDENT").strip().upper()
    is_active = body.get("is_active", True)
    if isinstance(is_active, str):
        is_active = is_active.lower() in ("true", "1", "yes", "on")
    event_id = (body.get("event_id") or "").strip()

    login_username = body.get("event_login_username")
    login_password = body.get("event_login_password")
    login_active = body.get("event_login_active")
    if isinstance(login_active, str):
        login_active = login_active.lower() in ("true", "1", "yes", "on")

    try:
        coordinators.set_event_coordinator_credentials(
            event_id, username=login_username, plain_password=login_password, is_active=login_active
        )
        coord = coordinators.create_coordinator(
            full_name=full_name, phone=phone, email=email, event_id=event_id,
            role=role, is_active=is_active,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 422

    audit_service.log_action(_actor(), "COORDINATOR_CREATED", f"coordinator person {coord.id} for event {event_id}", _ip())
    return jsonify(coord.to_admin_dict()), 201


@bp.patch("/coordinators/<coordinator_id>")
@login_required
@limiter.limit("30 per minute")
def update_admin_coordinator(coordinator_id):
    body = request.get_json(silent=True) or (request.form.to_dict() if request.form else {})
    full_name = body.get("full_name")
    phone = body.get("phone")
    email = body.get("email")
    role = body.get("role")
    is_active = body.get("is_active")
    if isinstance(is_active, str):
        is_active = is_active.lower() in ("true", "1", "yes", "on")
    event_id = (body.get("event_id") or "").strip()

    login_username = body.get("event_login_username")
    login_password = body.get("event_login_password")
    login_active = body.get("event_login_active")
    if isinstance(login_active, str):
        login_active = login_active.lower() in ("true", "1", "yes", "on")

    try:
        if event_id:
            coordinators.set_event_coordinator_credentials(
                event_id, username=login_username, plain_password=login_password, is_active=login_active
            )
        coord = coordinators.update_coordinator(
            coordinator_id=coordinator_id, full_name=full_name, phone=phone, email=email,
            is_active=is_active, event_id=event_id or None, role=role,
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 422

    audit_service.log_action(_actor(), "COORDINATOR_UPDATED", f"coordinator person {coordinator_id}", _ip())
    return jsonify(coord.to_admin_dict())


@bp.delete("/coordinators/<coordinator_id>")
@login_required
@limiter.limit("30 per minute")
def delete_admin_coordinator(coordinator_id):
    ok = coordinators.delete_coordinator(coordinator_id)
    if not ok:
        return jsonify({"error": "coordinator not found"}), 404
    audit_service.log_action(_actor(), "COORDINATOR_DELETED", f"coordinator {coordinator_id}", _ip())
    return jsonify({"ok": True})


@bp.post("/coordinators/<coordinator_id>/events")
@login_required
@limiter.limit("30 per minute")
def assign_admin_coordinator_event(coordinator_id):
    body = request.get_json(silent=True) or {}
    event_id = body.get("event_id")
    if not event_id:
        return jsonify({"error": "event_id is required"}), 422
    coord = coordinators.get_coordinator(coordinator_id)
    if not coord:
        return jsonify({"error": "coordinator not found"}), 404
    current_eids = [e.id for e in coord.events]
    if event_id not in current_eids:
        current_eids.append(event_id)
        coordinators.set_coordinator_events(coordinator_id, current_eids)
    audit_service.log_action(_actor(), "COORDINATOR_EVENT_ASSIGNED", f"coordinator {coordinator_id} -> event {event_id}", _ip())
    return jsonify(coord.to_admin_dict())


@bp.delete("/coordinators/<coordinator_id>/events/<event_id>")
@login_required
@limiter.limit("30 per minute")
def remove_admin_coordinator_event(coordinator_id, event_id):
    coord = coordinators.get_coordinator(coordinator_id)
    if not coord:
        return jsonify({"error": "coordinator not found"}), 404
    current_eids = [e.id for e in coord.events if e.id != event_id]
    coordinators.set_coordinator_events(coordinator_id, current_eids)
    audit_service.log_action(_actor(), "COORDINATOR_EVENT_REMOVED", f"coordinator {coordinator_id} -> event {event_id}", _ip())
    return jsonify(coord.to_admin_dict())


@bp.post("/logout")
def admin_api_logout():
    from services.session_service import revoke_session
    username = session.get("admin_username", "unknown")
    if username != "unknown":
        audit_service.log_action(username, "logout", "admin logged out via API", _ip())
    sid = session.get("sid")
    if sid:
        revoke_session(sid)
    session.clear()
    return jsonify({"success": True, "ok": True, "message": "Logged out successfully"})
