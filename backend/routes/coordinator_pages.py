from flask import Blueprint, render_template, session, redirect, url_for, abort

from services.coordinator_service import get_coordinator, coordinator_owns_event
from services.event_service import get_event
from utils.auth import coordinator_login_required

bp = Blueprint("coordinator_pages", __name__, url_prefix="/coordinator")


def _get_active_coordinator():
    cid = session.get("coordinator_id")
    if not cid:
        return None
    coord = get_coordinator(cid)
    if not coord or not coord.is_active:
        return None
    return coord


@bp.get("/")
@coordinator_login_required
def dashboard():
    coord = _get_active_coordinator()
    if not coord:
        session.clear()
        return redirect(url_for("coordinator_auth.login_page"))
    pe = coord.get_primary_event()
    if not pe:
        return render_template(
            "coordinator/dashboard.html",
            coordinator_username=coord.username,
            coordinator_name=coord.full_name or coord.username,
            coordinator_role=coord.get_role(),
            event=None
        )
    return render_template(
        "coordinator/dashboard.html",
        coordinator_username=coord.username,
        coordinator_name=coord.full_name or coord.username,
        coordinator_role=coord.get_role(),
        event=pe.to_admin_dict()
    )


@bp.get("/events/<event_id>")
@coordinator_login_required
def event_detail(event_id):
    coord = _get_active_coordinator()
    if not coord:
        session.clear()
        return redirect(url_for("coordinator_auth.login_page"))
    if not coordinator_owns_event(coord, event_id):
        abort(403)
    event = get_event(event_id)
    if not event:
        abort(404)
    return render_template(
        "coordinator/event_detail.html",
        coordinator_username=coord.username,
        coordinator_name=coord.full_name or coord.username,
        event=event.to_admin_dict()
    )


@bp.get("/events/<event_id>/scan")
@coordinator_login_required
def scanner(event_id):
    coord = _get_active_coordinator()
    if not coord:
        session.clear()
        return redirect(url_for("coordinator_auth.login_page"))
    if not coordinator_owns_event(coord, event_id):
        abort(403)
    event = get_event(event_id)
    if not event:
        abort(404)
    return render_template(
        "coordinator/scanner.html",
        coordinator_username=coord.username,
        coordinator_name=coord.full_name or coord.username,
        event=event.to_admin_dict()
    )
