from flask import Blueprint, render_template, request, redirect, url_for, session, flash, jsonify

from extensions import limiter
from services.coordinator_service import verify_coordinator_credentials
from services.audit_service import log_action
from services.session_service import generate_sid, revoke_session
from utils.validators import validate_login_payload, ValidationError
from utils.security import is_locked_out, record_failed_login, clear_failed_logins
from utils.auth import get_frontend_login_url
from utils.logger import get_logger

bp = Blueprint("coordinator_auth", __name__, url_prefix="/coordinator")
logger = get_logger("coordinator_auth")


@bp.get("/login")
def login_page():
    event_id = session.get("coordinator_event_id")

    if event_id:
        return redirect(
            url_for(
                "coordinator_pages.event_detail",
                event_id=event_id
            )
        )

    return render_template("coordinator/login.html")


@bp.post("/login")
@limiter.limit("10 per minute")
def login_submit():
    ip = request.remote_addr or "unknown"

    try:
        creds = validate_login_payload(request.form.to_dict())
    except ValidationError:
        flash("Username and password are required.", "error")
        return redirect(url_for("coordinator_auth.login_page"))

    username = creds["username"]
    lockout_key = f"coordinator:{username}"

    if is_locked_out(lockout_key, ip):
        logger.warning(
            "coordinator login blocked (lockout) user=%s ip=%s",
            username,
            ip,
        )

        flash("Too many failed attempts. Try again later.", "error")
        return redirect(url_for("coordinator_auth.login_page"))

    event = verify_coordinator_credentials(
        username,
        creds["password"],
    )

    if event:
        clear_failed_logins(lockout_key, ip)

        session.clear()

        session["coordinator_event_id"] = event.id
        session["coordinator_username"] = event.coordinator_username
        session["sid"] = generate_sid()
        session.permanent = True

        log_action(
            f"coordinator:{username}",
            "login",
            f"successful coordinator login for event {event.id}",
            ip,
        )

        logger.info(
            "coordinator login success user=%s event=%s ip=%s",
            username,
            event.id,
            ip,
        )

        # Go directly to the event participant/dashboard UI.
        return redirect(
            url_for(
                "coordinator_pages.event_detail",
                event_id=event.id,
            )
        )

    record_failed_login(lockout_key, ip)

    log_action(
        f"coordinator:{username}",
        "login_failed",
        "failed coordinator login attempt",
        ip,
    )

    logger.warning(
        "coordinator login failed user=%s ip=%s",
        username,
        ip,
    )

    flash("Invalid username or password.", "error")

    return redirect(url_for("coordinator_auth.login_page"))


@bp.post("/logout")
def logout():
    username = session.get(
        "coordinator_username",
        "unknown",
    )

    if username != "unknown":
        log_action(
            f"coordinator:{username}",
            "logout",
            "coordinator logged out",
            request.remote_addr or "unknown",
        )

    sid = session.get("sid")

    if sid:
        revoke_session(sid)

    session.clear()

    if (
        request.is_json
        or request.headers.get("Accept") == "application/json"
        or request.args.get("format") == "json"
    ):
        resp = jsonify({
            "success": True,
            "ok": True,
            "message": "Logged out successfully",
        })
    else:
        resp = redirect(get_frontend_login_url())

    resp.set_cookie(
        "session",
        "",
        expires=0,
        path="/",
    )

    return resp
