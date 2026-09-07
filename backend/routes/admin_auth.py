from flask import Blueprint, request, redirect, url_for, session, render_template, jsonify, flash
from flask_wtf.csrf import generate_csrf

import config
from services.admin_service import verify_admin_credentials
from services.audit_service import log_action
from services.session_service import generate_sid, revoke_session
from utils.logger import get_logger

bp = Blueprint("admin_auth", __name__, url_prefix="/admin")
logger = get_logger("admin_auth")


from utils.auth import get_frontend_login_url


@bp.get("/login")
def login_page():
    if session.get("admin_username"):
        return redirect("/admin/")
    return render_template("admin/login.html")


@bp.post("/login")
def login_submit():
    if session.get("admin_username"):
        return redirect("/admin/")
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if username and password and verify_admin_credentials(username, password):
        session.clear()
        session["admin_username"] = username
        session["is_admin"] = True
        session["sid"] = generate_sid()
        session.permanent = True
        log_action(username, "login", "successful admin password login", request.remote_addr or "unknown")
        logger.info("Successful admin password login for username=%s", username)
        return redirect("/admin/")
    flash("Invalid username or password.", "error")
    return render_template("admin/login.html")


@bp.route("/logout", methods=["GET", "POST"])
def logout():
    """Secure handler for admin logout."""
    username = session.get("admin_username", "unknown")
    if username != "unknown":
        log_action(username, "logout", "admin logged out", request.remote_addr or "unknown")
    sid = session.get("sid")
    if sid:
        revoke_session(sid)
    session.clear()
    if request.is_json or request.headers.get("Accept") == "application/json" or request.args.get("format") == "json":
        resp = jsonify({"success": True, "ok": True, "message": "Logged out successfully"})
    else:
        resp = redirect(get_frontend_login_url())
    resp.set_cookie("session", "", expires=0, path="/")
    return resp


