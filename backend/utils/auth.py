from functools import wraps
from flask import session, redirect, url_for, jsonify, request


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("admin_username"):
            if request.path.startswith("/admin/api/"):
                return jsonify({"error": "authentication required"}), 401
            return redirect(url_for("admin_auth.login_page", next=request.path))
        return view(*args, **kwargs)

    return wrapped


def user_login_required(view):
    """Same pattern as login_required, for participant accounts (/api/*).
    Always JSON — the public API has no server-rendered login page to redirect to."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "authentication required"}), 401
        return view(*args, **kwargs)

    return wrapped


def coordinator_login_required(view):
    """Same pattern as login_required, for event-coordinator accounts.
    Separate session key (coordinator_id) from both admin_username and
    user_id, so a coordinator session can't be confused with or escalated
    into either of those — three genuinely distinct roles, three keys."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("coordinator_id"):
            if request.path.startswith("/coordinator/api/"):
                return jsonify({"error": "authentication required"}), 401
            return redirect(url_for("coordinator_auth.login_page", next=request.path))
        return view(*args, **kwargs)

    return wrapped
