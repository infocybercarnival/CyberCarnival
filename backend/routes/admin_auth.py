from flask import Blueprint, render_template, request, redirect, url_for, session, flash

from extensions import limiter
from services.admin_service import verify_admin_credentials
from services.audit_service import log_action
from utils.validators import validate_login_payload, ValidationError
from utils.security import is_locked_out, record_failed_login, clear_failed_logins
from utils.logger import get_logger

bp = Blueprint("admin_auth", __name__, url_prefix="/admin")
logger = get_logger("admin_auth")


@bp.get("/login")
def login_page():
    if session.get("admin_username"):
        return redirect(url_for("admin_pages.dashboard"))
    return render_template("admin/login.html")


@bp.post("/login")
@limiter.limit("10 per minute")
def login_submit():
    ip = request.remote_addr or "unknown"
    try:
        creds = validate_login_payload(request.form.to_dict())
    except ValidationError:
        flash("Username and password are required.", "error")
        return redirect(url_for("admin_auth.login_page"))

    username = creds["username"]

    if is_locked_out(username, ip):
        logger.warning("login blocked (lockout) user=%s ip=%s", username, ip)
        flash("Too many failed attempts. Try again later.", "error")
        return redirect(url_for("admin_auth.login_page"))

    if verify_admin_credentials(username, creds["password"]):
        clear_failed_logins(username, ip)
        session.clear()
        session["admin_username"] = username
        session.permanent = True
        log_action(username, "login", "successful login", ip)
        logger.info("login success user=%s ip=%s", username, ip)
        return redirect(url_for("admin_pages.dashboard"))

    record_failed_login(username, ip)
    log_action(username, "login_failed", "failed login attempt", ip)
    logger.warning("login failed user=%s ip=%s", username, ip)
    # Deliberately generic — never reveal whether the username exists.
    flash("Invalid username or password.", "error")
    return redirect(url_for("admin_auth.login_page"))


@bp.post("/logout")
def logout():
    username = session.get("admin_username", "unknown")
    log_action(username, "logout", "admin logged out", request.remote_addr or "unknown")
    session.clear()
    return redirect(url_for("admin_auth.login_page"))
