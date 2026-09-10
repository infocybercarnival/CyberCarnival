from flask import (
    Blueprint,
    render_template,
    request,
    redirect,
    url_for,
    session,
    flash,
    jsonify,
)

import config

from extensions import limiter
from services.coordinator_service import verify_coordinator_credentials
from services.audit_service import log_action
from services.session_service import generate_sid, revoke_session
from services.event_service import get_event
from utils.validators import validate_login_payload, ValidationError
from utils.security import (
    is_locked_out,
    record_failed_login,
    clear_failed_logins,
)
from utils.auth import get_frontend_login_url
from utils.logger import get_logger


bp = Blueprint(
    "coordinator_auth",
    __name__,
    url_prefix="/coordinator",
)

logger = get_logger("coordinator_auth")


@bp.get("/login")
def login_page():
    """
    Show coordinator login page.

    If a valid coordinator session already exists, continue to the
    assigned event. If the session is stale or references an invalid
    event, clear it and show the login page instead of redirecting into
    a broken event page.
    """

    event_id = session.get("coordinator_event_id")

    if event_id:
        try:
            event = get_event(event_id)

            if (
                event
                and event.coordinator_login_active
                and event.coordinator_username
            ):
                return redirect(
                    url_for(
                        "coordinator_pages.event_detail",
                        event_id=event.id,
                    )
                )

        except Exception:
            logger.exception(
                "Failed to validate existing coordinator session "
                "for event_id=%s",
                event_id,
            )

        # Stale / invalid coordinator session.
        session.pop("coordinator_event_id", None)
        session.pop("coordinator_username", None)
        session.pop("sid", None)

    return render_template(
        "coordinator/login.html"
    )


@bp.post("/login")
@limiter.limit("10 per minute")
def login_submit():
    ip = request.remote_addr or "unknown"

    try:
        creds = validate_login_payload(
            request.form.to_dict()
        )

    except ValidationError:
        flash(
            "Username and password are required.",
            "error",
        )

        return redirect(
            url_for(
                "coordinator_auth.login_page"
            )
        )

    username = (
        creds.get("username") or ""
    ).strip()

    password = (
        creds.get("password") or ""
    )

    lockout_key = (
        f"coordinator:{username}"
    )

    # ---------------------------------------------------------
    # Lockout check
    # ---------------------------------------------------------

    try:
        if is_locked_out(
            lockout_key,
            ip,
        ):
            logger.warning(
                "coordinator login blocked "
                "(lockout) user=%s ip=%s",
                username,
                ip,
            )

            flash(
                "Too many failed attempts. "
                "Try again later.",
                "error",
            )

            return redirect(
                url_for(
                    "coordinator_auth.login_page"
                )
            )

    except Exception:
        # Login should not completely crash just because
        # lockout storage has a temporary issue.
        logger.exception(
            "Failed checking coordinator login lockout "
            "user=%s ip=%s",
            username,
            ip,
        )

    # ---------------------------------------------------------
    # Credential verification
    # ---------------------------------------------------------

    try:
        event = verify_coordinator_credentials(
            username,
            password,
        )

    except Exception:
        logger.exception(
            "Coordinator credential verification crashed "
            "user=%s ip=%s",
            username,
            ip,
        )

        flash(
            "Unable to process coordinator login right now. "
            "Please try again.",
            "error",
        )

        return redirect(
            url_for(
                "coordinator_auth.login_page"
            )
        )

    # ---------------------------------------------------------
    # Successful login
    # ---------------------------------------------------------

    if event:
        try:
            clear_failed_logins(
                lockout_key,
                ip,
            )
        except Exception:
            logger.exception(
                "Failed clearing coordinator login attempts "
                "user=%s",
                username,
            )

        try:
            session.clear()

            session["coordinator_event_id"] = (
                event.id
            )

            session["coordinator_username"] = (
                event.coordinator_username
            )

            session["sid"] = generate_sid()

            session.permanent = True

        except Exception:
            logger.exception(
                "Failed creating coordinator session "
                "user=%s event=%s",
                username,
                getattr(
                    event,
                    "id",
                    "unknown",
                ),
            )

            session.clear()

            flash(
                "Unable to create coordinator session. "
                "Please try again.",
                "error",
            )

            return redirect(
                url_for(
                    "coordinator_auth.login_page"
                )
            )

        # Audit failure should NEVER destroy a successful login.
        try:
            log_action(
                f"coordinator:{username}",
                "login",
                (
                    "successful coordinator login "
                    f"for event {event.id}"
                ),
                ip,
            )

        except Exception:
            logger.exception(
                "Coordinator audit logging failed "
                "user=%s event=%s",
                username,
                event.id,
            )

        logger.info(
            "coordinator login success "
            "user=%s event=%s ip=%s",
            username,
            event.id,
            ip,
        )

        return redirect(
            url_for(
                "coordinator_pages.event_detail",
                event_id=event.id,
            )
        )

    # ---------------------------------------------------------
    # Failed login
    # ---------------------------------------------------------

    try:
        record_failed_login(
            lockout_key,
            ip,
        )
    except Exception:
        logger.exception(
            "Failed recording coordinator login attempt "
            "user=%s",
            username,
        )

    try:
        log_action(
            f"coordinator:{username}",
            "login_failed",
            "failed coordinator login attempt",
            ip,
        )
    except Exception:
        logger.exception(
            "Failed writing coordinator failed-login audit "
            "user=%s",
            username,
        )

    logger.warning(
        "coordinator login failed "
        "user=%s ip=%s",
        username,
        ip,
    )

    flash(
        "Invalid username or password.",
        "error",
    )

    return redirect(
        url_for(
            "coordinator_auth.login_page"
        )
    )


@bp.post("/logout")
def logout():
    username = session.get(
        "coordinator_username",
        "unknown",
    )

    sid = session.get("sid")

    if (
        username
        and username != "unknown"
    ):
        try:
            log_action(
                f"coordinator:{username}",
                "logout",
                "coordinator logged out",
                request.remote_addr
                or "unknown",
            )
        except Exception:
            logger.exception(
                "Failed writing coordinator logout audit "
                "user=%s",
                username,
            )

    if sid:
        try:
            revoke_session(sid)
        except Exception:
            logger.exception(
                "Failed revoking coordinator session sid"
            )

    session.clear()

    if (
        request.is_json
        or request.headers.get("Accept")
        == "application/json"
        or request.args.get("format")
        == "json"
    ):
        resp = jsonify(
            {
                "success": True,
                "ok": True,
                "message": (
                    "Logged out successfully"
                ),
            }
        )

    else:
        resp = redirect(
            get_frontend_login_url()
        )

    # Clear the actual Flask session cookie used by this app.
    resp.set_cookie(
        config.SESSION_COOKIE_NAME,
        "",
        expires=0,
        path="/",
        secure=config.SESSION_COOKIE_SECURE,
        httponly=config.SESSION_COOKIE_HTTPONLY,
        samesite=config.SESSION_COOKIE_SAMESITE,
    )

    return resp
