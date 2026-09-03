from flask import Blueprint, request, redirect, url_for, session

import config
from services.audit_service import log_action
from utils.logger import get_logger

bp = Blueprint("admin_auth", __name__, url_prefix="/admin")
logger = get_logger("admin_auth")


def get_frontend_login_url():
    if config.ALLOWED_ORIGINS:
        return f"{config.ALLOWED_ORIGINS[0].rstrip('/')}/login"
    return "/login"


@bp.get("/login")
def login_page():
    if session.get("admin_username"):
        return redirect("/admin/")
    return redirect(get_frontend_login_url())


@bp.post("/login")
def login_submit():
    if session.get("admin_username"):
        return redirect("/admin/")
    return redirect(get_frontend_login_url())


@bp.post("/logout")
def logout():
    username = session.get("admin_username", "unknown")
    log_action(username, "logout", "admin logged out", request.remote_addr or "unknown")
    session.clear()
    return redirect(get_frontend_login_url())
