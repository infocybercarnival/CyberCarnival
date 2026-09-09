import time

from flask import request
from werkzeug.security import generate_password_hash, check_password_hash

import config
from storage import json_store


def hash_password(plain: str) -> str:
    # scrypt (werkzeug default) — memory-hard, resistant to GPU cracking.
    return generate_password_hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return check_password_hash(hashed, plain)


def add_security_headers(response):
    """
    Applied to every response.

    Camera access remains disabled everywhere except the coordinator QR
    scanner page, where the authenticated coordinator needs the device camera.
    """

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    # ---------------------------------------------------------------------
    # Permissions Policy
    # ---------------------------------------------------------------------
    #
    # Camera is disabled across the application by default.
    # Only the authenticated coordinator scanner page may use it.
    #
    is_coordinator_scanner = (
        request.path.startswith("/coordinator/events/")
        and request.path.endswith("/scan")
    )

    if is_coordinator_scanner:
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(self)"
        )
    else:
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=()"
        )

    # ---------------------------------------------------------------------
    # Cache control for authenticated admin/coordinator pages
    # ---------------------------------------------------------------------

    if (
        request.path.startswith("/admin")
        or request.path.startswith("/coordinator")
        or request.path.startswith("/api/auth/me")
    ):
        response.headers["Cache-Control"] = (
            "no-store, no-cache, must-revalidate, max-age=0, private"
        )
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"

    # ---------------------------------------------------------------------
    # Content Security Policy
    # ---------------------------------------------------------------------

    if request.path.startswith("/admin") or request.path.startswith("/coordinator"):

        allowed_origins_str = " ".join(
            o.rstrip("/")
            for o in (config.ALLOWED_ORIGINS or [])
        )

        if is_coordinator_scanner:
            # QR scanner needs html5-qrcode from unpkg.
            #
            # scanner.html currently also contains a tiny inline script that
            # sets window.EVENT_ID, so unsafe-inline is temporarily needed
            # here only on the scanner page.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://unpkg.com; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: blob:; "
                "media-src 'self' blob:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                f"form-action 'self' {allowed_origins_str}"
            )

        else:
            # Admin / coordinator pages that do not need the scanner remain
            # locked to same-origin JavaScript.
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                f"form-action 'self' {allowed_origins_str}"
            )

    else:
        # Public site
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' "
            "https://checkout.razorpay.com "
            "https://challenges.cloudflare.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://*.razorpay.com; "
            "connect-src 'self' "
            "https://api.razorpay.com "
            "https://lumberjack.razorpay.com "
            "https://challenges.cloudflare.com; "
            "frame-src "
            "https://api.razorpay.com "
            "https://checkout.razorpay.com "
            "https://challenges.cloudflare.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'"
        )

    if config.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains"
        )

    return response


# -------------------------------------------------------------------------
# Login brute-force protection
# -------------------------------------------------------------------------


def _key(username: str, ip: str) -> str:
    return f"{username}:{ip}"


def is_locked_out(username: str, ip: str) -> bool:
    attempts = json_store.read_all(config.LOGIN_ATTEMPTS_FILE)
    key = _key(username, ip)

    for entry in attempts:
        if entry["key"] == key:
            if entry["count"] >= config.MAX_FAILED_LOGIN_ATTEMPTS:
                if (
                    time.time() - entry["last_attempt"]
                    < config.LOGIN_LOCKOUT_SECONDS
                ):
                    return True

    return False


def record_failed_login(username: str, ip: str) -> None:
    key = _key(username, ip)
    now = time.time()

    def match(r):
        return r["key"] == key

    def update(r):
        if (
            now - r["last_attempt"]
            > config.LOGIN_LOCKOUT_SECONDS
        ):
            r["count"] = 1
        else:
            r["count"] += 1

        r["last_attempt"] = now
        return r

    updated = json_store.update_where(
        config.LOGIN_ATTEMPTS_FILE,
        match,
        update
    )

    if not updated:
        json_store.append(
            config.LOGIN_ATTEMPTS_FILE,
            {
                "key": key,
                "count": 1,
                "last_attempt": now
            }
        )


def clear_failed_logins(username: str, ip: str) -> None:
    key = _key(username, ip)

    json_store.delete_where(
        config.LOGIN_ATTEMPTS_FILE,
        lambda r: r["key"] == key
    )
