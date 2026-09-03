from flask import Blueprint, render_template, request, redirect, url_for, session, flash

from extensions import limiter
from services.coordinator_service import verify_coordinator_credentials
from services.audit_service import log_action
from utils.validators import validate_login_payload, ValidationError
from utils.security import is_locked_out, record_failed_login, clear_failed_logins
from utils.logger import get_logger

bp = Blueprint("coordinator_auth", __name__, url_prefix="/coordinator")
logger = get_logger("coordinator_auth")


@bp.get("/login")
def login_page():
    if session.get("coordinator_id"):
        return redirect(url_for("coordinator_pages.dashboard"))
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
    # Shares the same lockout keyspace pattern as admin login (keyed by
    # username+IP) — a brute-force attempt against a coordinator account
    # gets locked out the same way an admin one would.
    lockout_key = f"coordinator:{username}"

    if is_locked_out(lockout_key, ip):
        logger.warning("coordinator login blocked (lockout) user=%s ip=%s", username, ip)
        flash("Too many failed attempts. Try again later.", "error")
        return redirect(url_for("coordinator_auth.login_page"))

    coord = verify_coordinator_credentials(username, creds["password"])
    if coord:
        clear_failed_logins(lockout_key, ip)
        session.clear()
        session["coordinator_id"] = coord.id
        session["coordinator_username"] = coord.username
        session.permanent = True
        log_action(f"coordinator:{username}", "login", "successful coordinator login", ip)
        logger.info("coordinator login success user=%s ip=%s", username, ip)
        return redirect(url_for("coordinator_pages.dashboard"))

    record_failed_login(lockout_key, ip)
    log_action(f"coordinator:{username}", "login_failed", "failed coordinator login attempt", ip)
    logger.warning("coordinator login failed user=%s ip=%s", username, ip)
    flash("Invalid username or password.", "error")
    return redirect(url_for("coordinator_auth.login_page"))


@bp.post("/logout")
def logout():
    username = session.get("coordinator_username", "unknown")
    log_action(f"coordinator:{username}", "logout", "coordinator logged out", request.remote_addr or "unknown")
    session.clear()
    return redirect(url_for("coordinator_auth.login_page"))
