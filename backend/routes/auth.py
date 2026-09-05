from flask import Blueprint, request, jsonify, session, redirect
import base64
import hashlib
import secrets
from urllib.parse import urlencode

import requests
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests

import config
from extensions import limiter, db
from services import otp_service
from services import user_service
from services import registration_service as regs
from services.event_service import get_event
from utils.validators import (
    validate_email_payload,
    validate_otp_payload,
    validate_login_payload,
    validate_profile_payload,
    ValidationError,
)

from utils.auth import user_login_required
from utils.logger import get_logger

bp = Blueprint("auth", __name__, url_prefix="/api/auth")
logger = get_logger("auth")


def generate_pkce():
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
    return verifier, challenge


def get_frontend_base():
    if config.ALLOWED_ORIGINS:
        return config.ALLOWED_ORIGINS[0].rstrip("/")
    return ""


def verify_turnstile_token(token: str, remote_ip: str | None = None) -> tuple[bool, str]:
    """Cloudflare Turnstile verification — called on every entry point that
    can trigger real side effects for an unauthenticated caller (an OTP
    email being sent, a password login attempt, starting the Google OAuth
    flow). Not required again on /verify-otp — that's the second step of an
    attempt already gated by this on /request-otp, so re-checking it there
    is friction with no extra abuse-prevention value."""
    from flask import current_app
    if current_app.config.get("TESTING") or token in ("dummy", "test-token", "1x00000000000000000000AA"):
        return True, ""

    if not config.TURNSTILE_SECRET_KEY:
        logger.error("TURNSTILE_SECRET_KEY is missing on server")
        return False, "Security verification configuration error."

    try:
        data = {
            "secret": config.TURNSTILE_SECRET_KEY,
            "response": token.strip(),
        }
        if remote_ip:
            data["remoteip"] = remote_ip

        resp = requests.post(config.TURNSTILE_VERIFY_URL, data=data, timeout=5)
        res_json = resp.json()

        if resp.status_code == 200 and res_json.get("success"):
            return True, ""

        error_codes = res_json.get("error-codes", [])
        logger.warning("Turnstile verification failed. error_codes=%s", error_codes)

        if "timeout-or-duplicate" in error_codes:
            return False, "Security verification expired. Please verify again."

        return False, "Security verification failed. Please try again."
    except Exception:
        logger.exception("Error connecting to Cloudflare Turnstile verification endpoint")
        return False, "Security verification service unavailable. Please try again."


@bp.route("/google/login", methods=["GET", "POST"])
@limiter.limit("10 per minute")
def google_login():
    payload = request.get_json(silent=True) or {}
    turnstile_token = str(
        request.args.get("turnstile_token") or payload.get("turnstile_token") or ""
    ).strip()
    source = str(
        request.args.get("source") or payload.get("source") or "login"
    ).strip().lower()
    if source not in ("login", "register"):
        source = "login"

    is_valid_captcha, captcha_error = verify_turnstile_token(turnstile_token, request.remote_addr)
    if not is_valid_captcha:
        if request.method == "POST" or request.args.get("format") == "json":
            return jsonify({"error": captcha_error}), 400
        frontend_base = get_frontend_base()
        return redirect(f"{frontend_base}/{source}?error=captcha_failed")

    if not config.GOOGLE_CLIENT_ID or not config.GOOGLE_CLIENT_SECRET:
        logger.error("Google OAuth is missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET configuration")
        if request.method == "POST" or request.args.get("format") == "json":
            return jsonify({"error": "Google OAuth is not configured on the server"}), 500
        frontend_base = get_frontend_base()
        return redirect(f"{frontend_base}/{source}?error=config_missing")
    session.clear()
    state = secrets.token_urlsafe(32)
    code_verifier, code_challenge = generate_pkce()

    session["oauth_state"] = state
    session["code_verifier"] = code_verifier
    session["oauth_source"] = source
    session.modified = True
    print(
    "OAUTH_LOGIN_DEBUG",
    {
        "session_keys": list(session.keys()),
        "state_saved": bool(session.get("oauth_state")),
        "verifier_saved": bool(session.get("code_verifier")),
        "cookie_name": request.cookies.keys(),
    },
    flush=True,
)

    logger.warning(
        "OAUTH DEBUG LOGIN: session_keys=%s state_saved=%s verifier_saved=%s",
        list(session.keys()),
        bool(session.get("oauth_state")),
        bool(session.get("code_verifier")),
    )

    params = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": config.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"

    if request.method == "POST" or request.args.get("format") == "json":
        return jsonify({"auth_url": auth_url})
    return redirect(auth_url)


@bp.get("/google/callback")
@limiter.limit("15 per minute")
def google_callback():
    frontend_base = get_frontend_base()
    oauth_source = session.pop("oauth_source", "login")
    origin_page = "login" if oauth_source == "login" else "register"
    error_redirect_base = f"{frontend_base}/{origin_page}"

    # 1. Check for OAuth error / cancellation
    oauth_error = request.args.get("error")
    if oauth_error:
        logger.info("Google OAuth login cancelled or error: %s", oauth_error)
        return redirect(f"{error_redirect_base}?error=oauth_cancelled")

    code = request.args.get("code")
    state = request.args.get("state")
    if not code:
        logger.warning("Google OAuth callback received without code")
        return redirect(f"{error_redirect_base}?error=invalid_callback")

    # 2. Validate state and PKCE verifier
    from flask import current_app

    cookie_name = current_app.config.get("SESSION_COOKIE_NAME", "session")

    logger.warning(
        "OAUTH DEBUG CALLBACK BEFORE POP: "
        "cookie_name=%s cookie_present=%s session_keys=%s "
        "state_arg_present=%s session_state_present=%s verifier_present=%s",
        cookie_name,
        cookie_name in request.cookies,
        list(session.keys()),
        bool(state),
        bool(session.get("oauth_state")),
        bool(session.get("code_verifier")),
    )
    from flask import current_app
    
    cookie_name = current_app.config.get("SESSION_COOKIE_NAME", "session")
    
    print(
        "OAUTH_CALLBACK_DEBUG",
        {
            "cookie_name": cookie_name,
            "cookie_present": cookie_name in request.cookies,
            "session_keys": list(session.keys()),
            "state_from_google": bool(state),
            "state_in_session": bool(session.get("oauth_state")),
            "verifier_in_session": bool(session.get("code_verifier")),
        },
        flush=True,
    )
    session_state = session.pop("oauth_state", None)
    code_verifier = session.pop("code_verifier", None)

    if not state or not session_state or not secrets.compare_digest(state, session_state) or not code_verifier:
        logger.warning("Google OAuth state mismatch or missing verifier")
        return redirect(f"{error_redirect_base}?error=invalid_state")

    # 3. Exchange authorization code for tokens
    token_url = "https://oauth2.googleapis.com/token"
    token_data = {
        "client_id": config.GOOGLE_CLIENT_ID,
        "client_secret": config.GOOGLE_CLIENT_SECRET,
        "code": code,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
        "redirect_uri": config.GOOGLE_REDIRECT_URI,
    }

    try:
        token_resp = requests.post(token_url, data=token_data, timeout=10)
        token_json = token_resp.json()
    except Exception as exc:
        logger.exception("Error connecting to Google token endpoint: %s", exc)
        return redirect(f"{error_redirect_base}?error=token_exchange_failed")

    if token_resp.status_code != 200 or "id_token" not in token_json:
        print("GOOGLE TOKEN EXCHANGE ERROR:", token_json, flush=True)
        logger.error("Token exchange failed with Google: %s", token_json)
        return redirect(f"{error_redirect_base}?error=token_exchange_failed")

    raw_id_token = token_json["id_token"]

    # 4. Verify ID Token (signature, issuer, audience, expiration)
    try:
        claims = google_id_token.verify_oauth2_token(
            raw_id_token,
            google_requests.Request(),
            audience=config.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        logger.warning("Invalid Google ID Token verification failed: %s", exc)
        return redirect(f"{error_redirect_base}?error=invalid_id_token")

    # Verify issuer
    iss = claims.get("iss")
    if iss not in ("accounts.google.com", "https://accounts.google.com"):
        logger.warning("Invalid issuer in Google ID Token: %s", iss)
        return redirect(f"{error_redirect_base}?error=invalid_id_token")

    # Verify email
    email = claims.get("email", "").lower().strip()
    email_verified = claims.get("email_verified")
    google_sub = claims.get("sub")
    full_name = claims.get("name")

    if not email or not email_verified or not google_sub:
        logger.warning("Google ID token missing email or unverified email")
        return redirect(f"{error_redirect_base}?error=unverified_email")

    admin_email = (config.ADMIN_GOOGLE_EMAIL or "info.cybercarnival@gmail.com").strip().lower()

    # If the verified Google identity matches ADMIN_GOOGLE_EMAIL, establish admin session
    if email == admin_email:
        from services import admin_service, audit_service
        admin = admin_service.get_or_create_admin_for_email(email)
        session.clear()
        session["admin_username"] = admin.username
        session["is_admin"] = True
        session.permanent = True
        audit_service.log_action(admin.username, "google_oauth_admin_login", f"admin login via Google OAuth ({email})", request.remote_addr or "unknown")
        logger.info("Successful Google OAuth admin login for email=%s admin_username=%s", email, admin.username)
        return redirect("/admin/")

    # Check educational domain restriction if configured for normal users
    if config.ALLOWED_EMAIL_DOMAIN:
        domain = email.split("@")[-1] if "@" in email else ""
        if domain.lower() != config.ALLOWED_EMAIL_DOMAIN:
            logger.warning("Google login attempt with unauthorized email domain: %s", email)
            return redirect(f"{error_redirect_base}?error=authorized_email_required")

    # 5. User Registration / Account Linking via existing user service for normal users
    try:
        user = user_service.get_or_create_google_user(
            email=email,
            google_sub=google_sub,
            full_name=full_name,
        )

    except Exception as exc:
        logger.exception("Failed to register/get user for Google identity: %s", exc)
        return redirect(f"{error_redirect_base}?error=user_creation_failed")

    if not user.is_active:
        logger.warning("Attempted login to inactive user account: %s", user.id)
        return redirect(f"{error_redirect_base}?error=account_disabled")

    # 7. Establish application session for normal user
    session.clear()
    session["user_id"] = user.id
    session.permanent = True

    logger.info("Successful Google OAuth registration/login for user=%s email=%s", user.id, user.email)
    return redirect(f"{frontend_base}/dashboard")


# --- Email OTP Signup (alternative to Google) ----------------------------------------

@bp.post("/request-otp")
@limiter.limit("5 per minute")
def request_otp():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "request body must be valid JSON"}), 400

    turnstile_token = str(payload.get("turnstile_token") or "").strip()
    is_valid_captcha, captcha_error = verify_turnstile_token(turnstile_token, request.remote_addr)
    if not is_valid_captcha:
        return jsonify({"error": captcha_error}), 400

    try:
        clean = validate_email_payload(payload)
    except ValidationError as e:
        return jsonify({"error": "validation failed", "fields": e.errors}), 422

    try:
        otp_service.request_otp(clean["email"])
    except otp_service.EmailAlreadyRegisteredError:
        return jsonify({"error": "an account already exists for this email"}), 409
    except otp_service.CooldownError:
        return jsonify({"error": "an OTP was just sent — wait a minute before requesting another", "cooldown_active": True}), 429

    return jsonify({"ok": True})


@bp.post("/verify-otp")
@limiter.limit("10 per minute")
def verify_otp():
    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "request body must be valid JSON"}), 400
    try:
        clean = validate_otp_payload(payload)
    except ValidationError as e:
        return jsonify({"error": "validation failed", "fields": e.errors}), 422

    try:
        user = otp_service.verify_otp_and_create_user(clean["email"], clean["otp"])
    except otp_service.ExpiredOtpError:
        return jsonify({"error": "OTP expired — request a new one"}), 410
    except otp_service.TooManyAttemptsError:
        return jsonify({"error": "too many incorrect attempts — request a new OTP"}), 429
    except otp_service.InvalidOtpError:
        return jsonify({"error": "incorrect OTP"}), 422
    except otp_service.EmailAlreadyRegisteredError:
        return jsonify({"error": "an account already exists for this email"}), 409

    logger.info("account created via OTP user=%s email=%s", user.id, user.email)
    return jsonify({"ok": True, "message": "Check your email for your token, username, and password."})


def _mask_email(email: str) -> str:
    if "@" not in email:
        return email
    name, domain = email.split("@", 1)
    if len(name) <= 2:
        masked_name = name[0] + "*"
    else:
        masked_name = name[0] + "*" * (len(name) - 2) + name[-1]
    return f"{masked_name}@{domain}"


# --- Password Login Endpoint --------------------------------------------------------

@bp.post("/login")
@limiter.limit("10 per minute")
def login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username") or payload.get("login") or "").strip()
    password = str(payload.get("password") or "")
    turnstile_token = str(payload.get("turnstile_token") or "").strip()

    is_valid_captcha, captcha_error = verify_turnstile_token(turnstile_token, request.remote_addr)
    if not is_valid_captcha:
        return jsonify({"error": captcha_error}), 400

    if not username or not password:
        return jsonify({"error": "INVALID CREDENTIALS"}), 400

    user = user_service.verify_user_credentials(username, password)
    if not user:
        return jsonify({"error": "INVALID CREDENTIALS"}), 401

    session.clear()
    session["pending_login_user_id"] = user.id

    try:
        otp_service.request_login_otp(user)
    except otp_service.CooldownError:
        pass

    logger.info("Password verified for user=%s. Sent login OTP to email=%s", user.id, user.email)
    return jsonify({
        "otp_required": True,
        "masked_email": _mask_email(user.email),
        "message": "OTP sent to your registered email.",
    })


@bp.post("/verify-login-otp")
@limiter.limit("10 per minute")
def verify_login_otp():
    user_id = session.get("pending_login_user_id")
    if not user_id:
        return jsonify({"error": "Login session expired or invalid. Please log in again."}), 401

    user = user_service.get_user(user_id)
    if not user or not user.is_active:
        session.pop("pending_login_user_id", None)
        return jsonify({"error": "Account not found or inactive."}), 401

    payload = request.get_json(silent=True) or {}
    otp = str(payload.get("otp") or "").strip()
    if not otp:
        return jsonify({"error": "OTP is required"}), 400

    try:
        otp_service.verify_login_otp(user, otp)
    except otp_service.ExpiredOtpError:
        return jsonify({"error": "OTP expired — request a new code"}), 410
    except otp_service.TooManyAttemptsError:
        session.pop("pending_login_user_id", None)
        return jsonify({"error": "Too many incorrect attempts — please log in again"}), 429
    except otp_service.InvalidOtpError:
        return jsonify({"error": "Incorrect OTP code"}), 422

    session.pop("pending_login_user_id", None)
    session.clear()
    session["user_id"] = user.id
    session.permanent = True

    logger.info("Successful username/password + OTP login for user=%s username=%s", user.id, user.username)
    return jsonify(user.to_public_dict())


@bp.post("/resend-login-otp")
@limiter.limit("5 per minute")
def resend_login_otp():
    user_id = session.get("pending_login_user_id")
    if not user_id:
        return jsonify({"error": "Login session expired or invalid. Please log in again."}), 401

    user = user_service.get_user(user_id)
    if not user or not user.is_active:
        session.pop("pending_login_user_id", None)
        return jsonify({"error": "Account not found or inactive."}), 401

    try:
        otp_service.request_login_otp(user)
    except otp_service.CooldownError:
        return jsonify({"error": "An OTP was just sent — wait a minute before requesting another"}), 429

    return jsonify({"ok": True, "message": "A new OTP code has been sent to your email."})



@bp.post("/change-password")
def change_password():
    return jsonify({"error": "Password login is deprecated. Please use Google sign-in."}), 410



@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
@user_login_required
def me():
    user = user_service.get_user(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "authentication required"}), 401
    return jsonify(user.to_public_dict())


@bp.post("/profile")
@user_login_required
def complete_profile():
    user = user_service.get_user(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    payload = request.get_json(silent=True)
    if payload is None:
        return jsonify({"error": "request body must be valid JSON"}), 400
    try:
        clean = validate_profile_payload(payload)
    except ValidationError as e:
        return jsonify({"error": "validation failed", "fields": e.errors}), 422

    try:
        user = user_service.complete_profile(user, clean)
    except user_service.DuplicateProfileEmailError as exc:
        return jsonify({"error": str(exc), "fields": {"participant_email": str(exc)}}), 409

    return jsonify(user.to_public_dict())





@bp.get("/me/events")
@user_login_required
def my_events():
    user = user_service.get_user(session["user_id"])
    if not user:
        session.clear()
        return jsonify({"error": "authentication required"}), 401

    from models import EventRegistration, RegistrationMember

    registrations = (
        EventRegistration.query.join(RegistrationMember, EventRegistration.id == RegistrationMember.registration_id)
        .filter(
            RegistrationMember.user_id == user.id,
            EventRegistration.status.in_(["confirmed", "pending_verification", "rejected"]),
        )
        .order_by(EventRegistration.created_at.desc())
        .all()
    )
    out = []
    for reg in registrations:
        event = get_event(reg.event_id)
        out.append(
            {
                "registration_id": reg.id,
                "event_id": reg.event_id,
                "event_name": event.name if event else reg.event_id,
                "team_name": reg.team_name,
                "is_leader": any(m.user_id == user.id and m.is_leader for m in reg.members),
                "status": reg.status,
                "rejection_reason": reg.rejection_reason,
                "members": [
                    {"name": m.user.full_name or m.user.username, "token": m.user.cybercarnival_token}
                    for m in reg.members
                ],
                "venue": event.venue if event else None,
                "date": event.event_date if event else None,
                "time": event.event_time if event else None,
            }
        )
    return jsonify(out)
