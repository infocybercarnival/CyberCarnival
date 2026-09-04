"""
OTP request/verify — step 1 of the signup flow. Verifying the OTP creates the
user account (token + system-issued username/password) in one step; nothing
is created before that.
"""
import datetime

import config
from extensions import db
from models import OtpVerification, User
from utils.security import hash_password, verify_password
from utils.id_generator import new_cybercarnival_token, new_otp_code, new_username, new_temp_password
from utils.email import send_otp_email, send_credentials_email


class CooldownError(Exception):
    """An OTP was requested for this email too recently."""


class InvalidOtpError(Exception):
    pass


class ExpiredOtpError(Exception):
    pass


class TooManyAttemptsError(Exception):
    pass


class EmailAlreadyRegisteredError(Exception):
    pass


def request_otp(email: str) -> None:
    if User.query.filter_by(email=email).first():
        raise EmailAlreadyRegisteredError(email)

    recent = (
        OtpVerification.query.filter_by(email=email)
        .order_by(OtpVerification.created_at.desc())
        .first()
    )
    now = datetime.datetime.utcnow()
    if recent and (now - recent.created_at).total_seconds() < config.OTP_RESEND_COOLDOWN_SECONDS:
        raise CooldownError(email)

    code = new_otp_code(config.OTP_LENGTH)
    entry = OtpVerification(
        email=email,
        otp_hash=hash_password(code),
        purpose="signup",
        max_attempts=config.OTP_MAX_ATTEMPTS,
        expires_at=now + datetime.timedelta(seconds=config.OTP_TTL_SECONDS),
    )
    db.session.add(entry)
    db.session.commit()

    send_otp_email(email, code)


def verify_otp_and_create_user(email: str, otp: str) -> User:
    entry = (
        OtpVerification.query.filter_by(email=email, purpose="signup", consumed_at=None)
        .order_by(OtpVerification.created_at.desc())
        .first()
    )
    if not entry:
        raise InvalidOtpError(email)

    now = datetime.datetime.utcnow()
    if now > entry.expires_at:
        raise ExpiredOtpError(email)

    if entry.attempts >= entry.max_attempts:
        raise TooManyAttemptsError(email)

    if not verify_password(otp, entry.otp_hash):
        entry.attempts += 1
        db.session.commit()
        raise InvalidOtpError(email)

    entry.consumed_at = now
    db.session.commit()

    if User.query.filter_by(email=email).first():
        raise EmailAlreadyRegisteredError(email)

    # Token/username collisions are astronomically unlikely (14 random chars
    # from a 34-symbol alphabet) but retry a few times rather than trust luck.
    for _ in range(5):
        token = new_cybercarnival_token()
        username = new_username()
        if User.query.filter_by(cybercarnival_token=token).first():
            continue
        if User.query.filter_by(username=username).first():
            continue
        break
    else:
        raise RuntimeError("could not generate a unique token/username")

    temp_password = new_temp_password()
    user = User(
        cybercarnival_token=token,
        username=username,
        password_hash=hash_password(temp_password),
        must_change_password=True,
        email=email,
        profile_completed=False,
    )
    db.session.add(user)
    db.session.commit()

    send_credentials_email(email, token, username, temp_password)
    return user


def request_login_otp(user: User) -> None:
    recent = (
        OtpVerification.query.filter_by(email=user.email, purpose="login")
        .order_by(OtpVerification.created_at.desc())
        .first()
    )
    now = datetime.datetime.utcnow()
    if recent and (now - recent.created_at).total_seconds() < config.OTP_RESEND_COOLDOWN_SECONDS:
        raise CooldownError(user.email)

    OtpVerification.query.filter_by(email=user.email, purpose="login", consumed_at=None).update({"consumed_at": now})

    code = new_otp_code(config.OTP_LENGTH)
    entry = OtpVerification(
        email=user.email,
        otp_hash=hash_password(code),
        purpose="login",
        max_attempts=config.OTP_MAX_ATTEMPTS,
        expires_at=now + datetime.timedelta(seconds=config.OTP_TTL_SECONDS),
    )
    db.session.add(entry)
    db.session.commit()

    send_otp_email(user.email, code, purpose="login")


def verify_login_otp(user: User, otp: str) -> bool:
    entry = (
        OtpVerification.query.filter_by(email=user.email, purpose="login", consumed_at=None)
        .order_by(OtpVerification.created_at.desc())
        .first()
    )
    if not entry:
        raise InvalidOtpError(user.email)

    now = datetime.datetime.utcnow()
    if now > entry.expires_at:
        raise ExpiredOtpError(user.email)

    if entry.attempts >= entry.max_attempts:
        raise TooManyAttemptsError(user.email)

    if not verify_password(otp, entry.otp_hash):
        entry.attempts += 1
        db.session.commit()
        raise InvalidOtpError(user.email)

    entry.consumed_at = now
    db.session.commit()
    return True

