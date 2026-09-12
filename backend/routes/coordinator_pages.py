from flask import (
    Blueprint,
    render_template,
    session,
    redirect,
    url_for,
    abort,
)

from services.event_service import get_event
from utils.auth import coordinator_login_required


bp = Blueprint(
    "coordinator_pages",
    __name__,
    url_prefix="/coordinator",
)


def _get_logged_event():
    event_id = session.get("coordinator_event_id")

    if not event_id:
        return None

    event = get_event(event_id)

    if not event:
        return None

    if not event.coordinator_login_active:
        return None

    return event


def _owns_event(event_id: str) -> bool:
    event = _get_logged_event()
    return bool(event and event_id and event.id == event_id)


def _build_event_page_data(event):
    """
    Coordinator pages only need a small subset of Event fields.

    Do not call event.to_admin_dict() here because that serializer also
    loads coordinator-person assignments and other admin-only relational
    data. A mismatch in coordinator_events / coordinators should not make
    the coordinator dashboard or QR scanner crash.
    """

    return {
        "id": event.id,
        "name": event.name,
        "category": event.category,
        "tag": event.tag,
        "description": event.description,
        "date": event.event_date,
        "time": event.event_time,
        "venue": event.venue,
        "registration_open": event.registration_open,
    }


@bp.get("/")
@coordinator_login_required
def dashboard():
    """
    Coordinator root route.

    Redirect the logged-in coordinator directly to the event
    participant/dashboard interface.
    """

    event = _get_logged_event()

    if not event:
        session.clear()

        return redirect(
            url_for(
                "coordinator_auth.login_page"
            )
        )

    return redirect(
        url_for(
            "coordinator_pages.event_detail",
            event_id=event.id,
        )
    )


@bp.get("/events/<event_id>")
@coordinator_login_required
def event_detail(event_id):
    if not _owns_event(event_id):
        abort(403)

    event = _get_logged_event()

    if not event:
        session.clear()

        return redirect(
            url_for(
                "coordinator_auth.login_page"
            )
        )

    event_data = _build_event_page_data(event)

    return render_template(
        "coordinator/event_detail.html",
        coordinator_username=event.coordinator_username,
        coordinator_name=f"{event.name} Coordinator Team",
        event=event_data,
    )


@bp.get("/events/<event_id>/scan")
@coordinator_login_required
def scanner(event_id):
    if not _owns_event(event_id):
        abort(403)

    event = _get_logged_event()

    if not event:
        session.clear()

        return redirect(
            url_for(
                "coordinator_auth.login_page"
            )
        )

    event_data = _build_event_page_data(event)

    return render_template(
        "coordinator/scanner.html",
        coordinator_username=event.coordinator_username,
        coordinator_name=f"{event.name} Coordinator Team",
        event=event_data,
    )
