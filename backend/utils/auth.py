from functools import wraps
from flask import session, redirect, url_for, jsonify, request

import config
from services.session_service import is_session_revoked


def get_frontend_login_url():
    if request:
        origin = request.headers.get("Origin") or request.headers.get("Referer")
        if origin:
            clean_origin = origin.rstrip("/").split("/admin")[0].split("/coordinator")[0].split("/login")[0].split("/register")[0]
            if any(clean_origin == o.rstrip("/") for o in (config.ALLOWED_ORIGINS or [])):
                return f"{clean_origin}/login"
        if request.host_url:
            host_base = request.host_url.rstrip("/")
            if any(host_base == o.rstrip("/") for o in (config.ALLOWED_ORIGINS or [])):
                return f"{host_base}/login"
    if config.ALLOWED_ORIGINS:
        return f"{config.ALLOWED_ORIGINS[0].rstrip('/')}/login"
    return "/login"


def _check_revoked():
    sid = session.get("sid")
    if sid and is_session_revoked(sid):
        session.clear()
        return True
    return False


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _check_revoked() or not session.get("admin_username"):
            if request.path.startswith("/admin/api/"):
                return jsonify({"error": "authentication required"}), 401
            return redirect(get_frontend_login_url())
        return view(*args, **kwargs)

    return wrapped


def user_login_required(view):
    """Same pattern as login_required, for participant accounts (/api/*).
    Always JSON — the public API has no server-rendered login page to redirect to."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _check_revoked() or not session.get("user_id"):
            return jsonify({"error": "authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped


def coordinator_login_required(view):
    """Same pattern as login_required, for event-coordinator accounts.
    Separate event-scoped session key (coordinator_event_id) from admin/user
    sessions. The credential belongs to an event, not an individual person."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _check_revoked() or not session.get("coordinator_event_id"):
            if request.path.startswith("/coordinator/api/"):
                return jsonify({"error": "authentication required"}), 401
            return redirect(url_for("coordinator_auth.login_page", next=request.path))
        return view(*args, **kwargs)

    return wrapped

