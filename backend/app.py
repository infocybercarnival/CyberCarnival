import os

from flask import (
    Flask,
    jsonify,
    send_from_directory,
    abort,
    request,
    redirect,
    session,
)
from flask_cors import CORS
from werkzeug.middleware.proxy_fix import ProxyFix

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

logger = get_logger("app")


def create_app() -> Flask:
    app = Flask(__name__)

    if config.TRUST_PROXY_HOPS > 0:
        app.wsgi_app = ProxyFix(
            app.wsgi_app,
            x_for=config.TRUST_PROXY_HOPS,
            x_proto=config.TRUST_PROXY_HOPS,
            x_host=config.TRUST_PROXY_HOPS,
        )

    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["SESSION_COOKIE_NAME"] = config.SESSION_COOKIE_NAME
    app.config["MAX_CONTENT_LENGTH"] = config.MAX_CONTENT_LENGTH
    app.config["SESSION_COOKIE_SECURE"] = config.SESSION_COOKIE_SECURE
    app.config["SESSION_COOKIE_HTTPONLY"] = config.SESSION_COOKIE_HTTPONLY
    app.config["SESSION_COOKIE_SAMESITE"] = config.SESSION_COOKIE_SAMESITE
    app.config["PERMANENT_SESSION_LIFETIME"] = (
        config.PERMANENT_SESSION_LIFETIME_SECONDS
    )
    app.config["WTF_CSRF_TIME_LIMIT"] = config.CSRF_TOKEN_LIFETIME_SECONDS
    app.config["SQLALCHEMY_DATABASE_URI"] = config.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = (
        config.SQLALCHEMY_TRACK_MODIFICATIONS
    )
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = (
        config.SQLALCHEMY_ENGINE_OPTIONS
    )

    limiter.init_app(app)
    csrf.init_app(app)
    db.init_app(app)

    with app.app_context():
        import models  # noqa: F401
        db.create_all()

    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": config.ALLOWED_ORIGINS or []
            }
        },
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "X-CSRFToken"],
    )

    @app.before_request
    def validate_credentialed_api_origin():
        if request.method in {"GET", "HEAD", "OPTIONS"}:
            return None

        protected_prefixes = (
            "/api/",
            "/admin/api/",
            "/coordinator/api/",
        )

        if not request.path.startswith(protected_prefixes):
            return None

        origin = (request.headers.get("Origin") or "").strip().rstrip("/")

        allowed_origins = {
            value.strip().rstrip("/")
            for value in (config.ALLOWED_ORIGINS or [])
            if value and value.strip()
        }

        # Backend-rendered admin/coordinator pages are same-origin.
        allowed_origins.add(request.host_url.rstrip("/"))

        if origin:
            if origin not in allowed_origins:
                logger.warning(
                    "blocked unsafe request method=%s path=%s origin=%s ip=%s",
                    request.method,
                    request.path,
                    origin,
                    request.remote_addr,
                )
                return jsonify({
                    "error": "request origin not allowed"
                }), 403

            return None

        sec_fetch_site = (
            request.headers.get("Sec-Fetch-Site", "")
            .strip()
            .lower()
        )

        if sec_fetch_site == "cross-site":
            logger.warning(
                "blocked cross-site request without trusted origin "
                "method=%s path=%s ip=%s",
                request.method,
                request.path,
                request.remote_addr,
            )
            return jsonify({
                "error": "cross-site request rejected"
            }), 403

        return None

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

    # ------------------------------------------------------------------
    # CSRF deployment mode
    # ------------------------------------------------------------------
    # CURRENT TEST/DEPLOYMENT:
    #   Vercel frontend -> Render backend = cross-site.
    #   Browser third-party cookie restrictions can prevent Flask-WTF's
    #   session-bound CSRF token from round-tripping reliably. In this mode,
    #   API blueprints use the strict Origin/Sec-Fetch-Site validation above.
    #
    # FINAL OFFICE SERVER:
    #   Set CROSS_SITE_FRONTEND=false when frontend/backend are same-site.
    #   These exemptions are then NOT applied and Flask-WTF CSRF protects
    #   the routes normally.
    if config.CROSS_SITE_FRONTEND:
        csrf.exempt(registration_bp)
        csrf.exempt(auth_bp)
        csrf.exempt(coordinator_auth_bp)
        csrf.exempt(coordinator_api_bp)
        csrf.exempt(admin_api_bp)

    @app.get("/")
    def root():
        return jsonify({
            "status": "ok",
            "service": "CyberCarnival API"
        })

    @app.get("/uploads/posters/<path:filename>")
    def uploaded_poster(filename):
        target = (config.UPLOAD_DIR / filename).resolve()

        try:
            target.relative_to(config.UPLOAD_DIR.resolve())
        except ValueError:
            abort(404)

        if not target.is_file():
            abort(404)

        return send_from_directory(
            config.UPLOAD_DIR,
            filename
        )

    app.after_request(add_security_headers)

    from flask_wtf.csrf import CSRFError
    from utils.auth import get_frontend_login_url

    @app.errorhandler(CSRFError)
    def handle_csrf_error(e):
        if request.path == "/admin/logout" and not session.get("admin_username"):
            return redirect(get_frontend_login_url())

        # Return JSON for API callers so the frontend sees the real reason.
        if (
            request.path.startswith("/api/")
            or request.path.startswith("/admin/api/")
            or request.path.startswith("/coordinator/api/")
        ):
            return jsonify({
                "error": "CSRF validation failed",
                "detail": e.description,
            }), 400

        return (
            "<!doctype html><html lang=en>"
            "<title>400 Bad Request</title>"
            "<h1>Bad Request</h1>"
            f"<p>{e.description}</p>",
            400,
        )

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({
            "error": "not found"
        }), 404

    @app.errorhandler(413)
    def too_large(e):
        return jsonify({
            "error": "request body too large"
        }), 413

    @app.errorhandler(429)
    def rate_limited(e):
        return jsonify({
            "error": "too many requests, slow down"
        }), 429

    @app.errorhandler(500)
    def server_error(e):
        logger.exception("unhandled server error")
        return jsonify({
            "error": "internal server error"
        }), 500

    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))

    app.run(
        host="0.0.0.0",
        port=port,
        debug=not config.IS_PRODUCTION
    )

