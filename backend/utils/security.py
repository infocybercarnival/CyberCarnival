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
    """Applied to every response. Defense-in-depth against XSS/clickjacking/MIME-sniffing."""
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"

    if request.path.startswith("/admin") or request.path.startswith("/coordinator"):
        # Admin panel + coordinator panel: same trust level (both are
        # server-rendered, session-authenticated, own hand-written JS files,
        # no inline <script>), so both get the strict script-src. style-src
        # allows unsafe-inline because several dashboard elements — the
        # coordinator-credentials box in the admin template, and both
        # dashboards' JS-rendered rows — use inline style="..." for one-off
        # layout tweaks rather than a dedicated CSS class each. Same
        # tradeoff the public site already makes below, just for styles
        # only; scripts stay locked down on both panels.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self'"
        )
    else:
        # Public site: Next.js embeds inline hydration/bootstrap scripts and
        # Tailwind can inject inline styles, so 'unsafe-inline' is required
        # here. Razorpay's checkout widget needs its own script/frame/connect
        # allowances — it loads its UI from checkout.razorpay.com and talks
        # to api.razorpay.com from inside that popup. Everything else stays
        # locked to same-origin, and framing/plugins stay blocked.
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://checkout.razorpay.com https://challenges.cloudflare.com; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https://*.razorpay.com; "
            "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com https://challenges.cloudflare.com; "
            "frame-src https://api.razorpay.com https://checkout.razorpay.com https://challenges.cloudflare.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'"
        )
    if config.IS_PRODUCTION:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# --- Login brute-force protection -------------------------------------------------
# Keyed by "username:ip" so an attacker can't lock out a legitimate admin by
# spraying failed logins from elsewhere, and can't bypass the limit by
# rotating IPs against a single known username without also needing the IP limit.

def _key(username: str, ip: str) -> str:
    return f"{username}:{ip}"


def is_locked_out(username: str, ip: str) -> bool:
    attempts = json_store.read_all(config.LOGIN_ATTEMPTS_FILE)
    key = _key(username, ip)
    for entry in attempts:
        if entry["key"] == key:
            if entry["count"] >= config.MAX_FAILED_LOGIN_ATTEMPTS:
                if time.time() - entry["last_attempt"] < config.LOGIN_LOCKOUT_SECONDS:
                    return True
    return False


def record_failed_login(username: str, ip: str) -> None:
    key = _key(username, ip)
    now = time.time()

    def match(r):
        return r["key"] == key

    def update(r):
        # Reset the counter if the previous lockout window has already expired.
        if now - r["last_attempt"] > config.LOGIN_LOCKOUT_SECONDS:
            r["count"] = 1
        else:
            r["count"] += 1
        r["last_attempt"] = now
        return r

    updated = json_store.update_where(config.LOGIN_ATTEMPTS_FILE, match, update)
    if not updated:
        json_store.append(config.LOGIN_ATTEMPTS_FILE, {"key": key, "count": 1, "last_attempt": now})


def clear_failed_logins(username: str, ip: str) -> None:
    key = _key(username, ip)
    json_store.delete_where(config.LOGIN_ATTEMPTS_FILE, lambda r: r["key"] == key)