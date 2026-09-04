import os

from pathlib import Path

from flask import Flask, jsonify, render_template, send_from_directory, abort
from flask_cors import CORS

import config
from extensions import limiter, csrf, db
from utils.security import add_security_headers
from utils.logger import get_logger

from routes.health import bp as health_bp
from routes.events import bp as events_bp
from routes.speakers import bp as speakers_bp
from routes.registration import bp as registration_bp
from routes.auth import bp as auth_bp
from routes.admin_auth import bp as admin_auth_bp
from routes.admin_pages import bp as admin_pages_bp
from routes.admin_api import bp as admin_api_bp
from routes.coordinator_auth import bp as coordinator_auth_bp
from routes.coordinator_pages import bp as coordinator_pages_bp
from routes.coordinator_api import bp as coordinator_api_bp
from routes.frontend import bp as frontend_bp

logger = get_logger("app")


def ensure_frontend_build() -> None:
    """Build the static Next.js frontend when frontend/out is missing.

    This preserves the project's one-command local workflow: after extracting
    the project, `python app.py` can install frontend dependencies (first run
    only), build the static export, and then Flask serves both the UI and API.
    """
    import shutil
    frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
    out_dir = frontend_dir / "out"
    if out_dir.exists() and (out_dir / "index.html").exists():
        return

    package_json = frontend_dir / "package.json"
    if not package_json.exists():
        raise RuntimeError(f"Frontend package.json not found at {package_json}")

    print("[CyberCarnival] Frontend build not found; preparing frontend...")

    pm = "pnpm" if shutil.which("pnpm") else "npm"
    install_cmd = f"{pm} install"
    build_cmd = f"{pm} run build" if pm == "npm" else f"{pm} build"

    if not (frontend_dir / "node_modules").exists():
        print(f"[CyberCarnival] Installing frontend dependencies with {pm}...")
        try:
            subprocess.run(install_cmd, cwd=frontend_dir, shell=True, check=True)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(f"Frontend dependency installation failed using {pm}. Make sure Node.js is installed.") from exc

    print(f"[CyberCarnival] Building frontend static export with {pm}...")
    try:
        subprocess.run(build_cmd, cwd=frontend_dir, shell=True, check=True)
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Frontend build failed using {pm}. Check the build output above.") from exc

    if not (out_dir / "index.html").exists():
        raise RuntimeError("Frontend build completed but frontend/out/index.html was not created.")




def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
    app.config["SESSION_COOKIE_SECURE"] = config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_HTTPONLY"] = config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = config.SESSION_COOKIE_SAMESITE
    app.config["PERMANENT_SESSION_LIFETIME"] = config.PERMANENT_SESSION_LIFETIME_SECONDS
    app.config["WTF_CSRF_TIME_LIMIT"] = config.CSRF_TOKEN_LIFETIME_SECONDS
    app.config["SQLALCHEMY_DATABASE_URI"] = config.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = config.SQLALCHEMY_TRACK_MODIFICATIONS
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = config.SQLALCHEMY_ENGINE_OPTIONS

    limiter.init_app(app)
    csrf.init_app(app)
    db.init_app(app)

    with app.app_context():
        import models  # noqa: F401 — register models on db.metadata before create_all
        db.create_all()

    # Public API is meant to be called cross-origin from the marketing frontend.
    # /api/auth/* and /api/registrations now set a session cookie (participant
    # login), so credentials are enabled here — but only for the explicit
    # origins in ALLOWED_ORIGINS, never "*" (the browser refuses credentialed
    # requests against a wildcard origin anyway). Admin routes are NOT
    # included here — they're same-origin, cookie-authenticated only.
    CORS(
        app,
        resources={r"/api/*": {"origins": config.ALLOWED_ORIGINS or []}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE"],
    )

    app.register_blueprint(health_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(speakers_bp)
    app.register_blueprint(registration_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_auth_bp)
    app.register_blueprint(admin_pages_bp)
    app.register_blueprint(admin_api_bp)
    app.register_blueprint(coordinator_auth_bp)
    app.register_blueprint(coordinator_pages_bp)
    app.register_blueprint(coordinator_api_bp)
    app.register_blueprint(frontend_bp)  # catch-all — must stay last

    # These public endpoints are called by client-side JS on a different origin
    # (the Next.js frontend) than the one rendering CSRF tokens (the admin
    # panel), so they can't carry a Flask-WTF form token. Real protection here
    # is: SameSite=Lax cookies (never sent on a cross-site simple POST),
    # strict CORS origin allow-listing for the credentialed requests that do
    # carry the session cookie, and per-route rate limiting.
    csrf.exempt(registration_bp)
    csrf.exempt(auth_bp)

    @app.get("/uploads/posters/<path:filename>")
    def uploaded_poster(filename):
        # Extra safety net on top of secure_filename() at upload time.
        target = (config.UPLOAD_DIR / filename).resolve()
        try:
            target.relative_to(config.UPLOAD_DIR.resolve())
        except ValueError:
            abort(404)
        if not target.is_file():
            abort(404)
        return send_from_directory(config.UPLOAD_DIR, filename)

    app.after_request(add_security_headers)

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "not found"}), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({"error": "request body too large"}), 413

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({"error": "too many requests, slow down"}), 429

    @app.errorhandler(500)
    def server_error(e):
        logger.exception("unhandled server error")
        return jsonify({"error": "internal server error"}), 500

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(
        host="0.0.0.0",
        port=port,
        debug=not config.IS_PRODUCTION
    )
