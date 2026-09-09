from flask import Blueprint, render_template, session, redirect, url_for, abort

from services.event_service import get_event
from utils.auth import coordinator_login_required

bp = Blueprint("coordinator_pages", __name__, url_prefix="/coordinator")


def _get_logged_event():
    event_id = session.get("coordinator_event_id")
    if not event_id:
        return None
    event = get_event(event_id)
    if not event or not event.coordinator_login_active:
        return None
    return event


def _owns_event(event_id: str) -> bool:
    return bool(event_id and session.get("coordinator_event_id") == event_id)


@bp.get("/")
@coordinator_login_required
def dashboard():
    event = _get_logged_event()
    if not event:
        session.clear()
        return redirect(url_for("coordinator_auth.login_page"))
    return render_template(
        "coordinator/dashboard.html",
        coordinator_username=event.coordinator_username,
        coordinator_name=f"{event.name} Coordinator Team",
        coordinator_role="EVENT TEAM",
        event=event.to_admin_dict(),
    )


@bp.get("/events/<event_id>")
@coordinator_login_required
def event_detail(event_id):
    if not _owns_event(event_id):
        abort(403)
    event = _get_logged_event()
    if not event:
        abort(404)
    return render_template(
        "coordinator/event_detail.html",
        coordinator_username=event.coordinator_username,
        coordinator_name=f"{event.name} Coordinator Team",
        event=event.to_admin_dict(),
    )


@bp.get("/events/<event_id>/scan")
@coordinator_login_required
def scanner(event_id):
    if not _owns_event(event_id):
        abort(403)
    event = _get_logged_event()
    if not event:
        abort(404)
    return render_template(
        "coordinator/scanner.html",
        coordinator_username=event.coordinator_username,
        coordinator_name=f"{event.name} Coordinator Team",
        event=event.to_admin_dict(),
    )
