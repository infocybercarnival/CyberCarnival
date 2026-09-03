from flask import Blueprint, render_template, session

from utils.auth import coordinator_login_required

bp = Blueprint("coordinator_pages", __name__, url_prefix="/coordinator")


@bp.get("/")
@coordinator_login_required
def dashboard():
    return render_template("coordinator/dashboard.html", coordinator_username=session.get("coordinator_username"))
