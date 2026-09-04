import os

from flask import Flask, jsonify, send_from_directory, abort, request
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

logger = get_logger("app")


def create_app() -> Flask:
    app = Flask(__name__)

    app.config["SECRET_KEY"] = config.SECRET_KEY
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
    )

    # API routes
    app.register_blueprint(health_bp)
    app.register_blueprint(events_bp)
    app.register_blueprint(speakers_bp)
    app.register_blueprint(registration_bp)
    app.register_blueprint(auth_bp)

    # Admin routes
    app.register_blueprint(admin_auth_bp)
    app.register_blueprint(admin_pages_bp)
    app.register_blueprint(admin_api_bp)

    # Coordinator routes
    app.register_blueprint(coordinator_auth_bp)
    app.register_blueprint(coordinator_pages_bp)
    app.register_blueprint(coordinator_api_bp)

    # Frontend is hosted separately on Vercel.
    # Do NOT register frontend_bp here.

    # Temporary route debugging
    @app.before_request
    def debug_request_route():
        print(
            f"[ROUTE DEBUG] "
            f"method={request.method} "
            f"path={request.path} "
            f"endpoint={request.endpoint} "
            f"host={request.host} "
            f"url={request.url}",
            flush=True
        )

    csrf.exempt(registration_bp)
    csrf.exempt(auth_bp)

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

    @app.errorhandler(404)
    def not_found(e):
        print(
            f"[404 DEBUG] "
            f"path={request.path} "
            f"endpoint={request.endpoint} "
            f"url={request.url}",
            flush=True
        )

        print("[REGISTERED ADMIN ROUTES]", flush=True)

        for rule in app.url_map.iter_rules():
            if "admin" in str(rule).lower():
                print(
                    f"  {rule} -> {rule.endpoint}",
                    flush=True
                )

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
