from flask import Blueprint, render_template, session

from utils.auth import login_required

bp = Blueprint("admin_pages", __name__, url_prefix="/admin")


@bp.get("/")
@login_required
def dashboard():
    return render_template("admin/dashboard.html", admin_username=session.get("admin_username"))
