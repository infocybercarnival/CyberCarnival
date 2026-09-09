from flask import (
    Blueprint,
    request,
    redirect,
    session,
    render_template,
    jsonify,
    flash,
)

from extensions import limiter
from services.admin_service import verify_admin_credentials
from services.audit_service import log_action
from services.session_service import generate_sid, revoke_session
from utils.auth import get_frontend_login_url
from utils.logger import get_logger
from utils.security import (
    is_locked_out,
    record_failed_login,
    clear_failed_logins,
)

bp = Blueprint("admin_auth", __name__, url_prefix="/admin")
logger = get_logger("admin_auth")


@bp.get("/login")
def login_page():
    if session.get("admin_username"):
        return redirect("/admin/")
    return render_template("admin/login.html")


@bp.post("/login")
@limiter.limit("10 per minute")
def login_submit():
    if session.get("admin_username"):
        return redirect("/admin/")

    ip = request.remote_addr or "unknown"
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")

    if not username or not password:
        flash("Username and password are required.", "error")
        return render_template("admin/login.html")

    lockout_key = f"admin:{username}"

    if is_locked_out(lockout_key, ip):
        logger.warning(
            "admin login blocked by lockout username=%s ip=%s",
            username,
            ip,
        )
        log_action(
            username,
            "login_blocked",
            "admin login blocked due to repeated failures",
            ip,
        )
        flash(
            "Too many failed login attempts. Please try again later.",
            "error",
        )
        return render_template("admin/login.html")

    if verify_admin_credentials(username, password):
        clear_failed_logins(lockout_key, ip)

        session.clear()
        session["admin_username"] = username
        session["is_admin"] = True
        session["sid"] = generate_sid()
        session.permanent = True

        log_action(
            username,
            "login",
            "successful admin password login",
            ip,
        )
        logger.info(
            "successful admin password login username=%s ip=%s",
            username,
            ip,
        )

        return redirect("/admin/")

    record_failed_login(lockout_key, ip)

    log_action(
        username,
        "login_failed",
        "failed admin password login",
        ip,
    )
    logger.warning(
        "failed admin password login username=%s ip=%s",
        username,
        ip,
    )

    flash("Invalid username or password.", "error")
    return render_template("admin/login.html")


@bp.post("/logout")
def logout():
    username = session.get("admin_username", "unknown")

    if username != "unknown":
        log_action(
            username,
            "logout",
            "admin logged out",
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

    resp.set_cookie("session", "", expires=0, path="/")
    return resp
