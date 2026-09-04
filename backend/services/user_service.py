from extensions import db
from models import User
from utils.security import verify_password, hash_password


def get_user_by_username(username: str):
    return User.query.filter_by(username=username).first()


def get_user_by_token(token: str):
    return User.query.filter_by(cybercarnival_token=token).first()


def get_user(user_id: str):
    return db.session.get(User, user_id)


def verify_user_credentials(username: str, password: str):
    """Returns the User on success, None otherwise. Same timing-safe pattern as
    verify_admin_credentials — always runs a hash check either way."""
    user = get_user_by_username(username)
    if not user or not user.is_active:
        verify_password(password, hash_password("decoy-password-not-real"))
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


class DuplicateProfileEmailError(Exception):
    pass


def complete_profile(user: User, clean_data: dict) -> User:
    # Enforce authenticated user's verified email as immutable source of truth
    verified_email = user.email.strip().lower()

    user.full_name = clean_data.get("full_name") or clean_data.get("participant_name") or user.full_name
    user.email = verified_email
    user.phone = clean_data.get("phone") or clean_data.get("participant_phone") or user.phone
    user.college = clean_data.get("college") or clean_data.get("college_name") or user.college
    user.profile_completed = True

    # Synchronize RegistrationMember records for this user
    from models import RegistrationMember
    members = RegistrationMember.query.filter_by(user_id=user.id).all()
    for m in members:
        if user.full_name:
            m.participant_name = user.full_name
        m.participant_email = verified_email
        if user.college:
            m.college_name = user.college
        if user.phone:
            m.participant_phone = user.phone

    db.session.commit()
    return user


def change_password(user: User, new_password: str) -> None:
    user.password_hash = hash_password(new_password)
    user.must_change_password = False
    db.session.commit()


def get_user_by_email(email: str):
    return User.query.filter(db.func.lower(User.email) == email.lower()).first()


def get_user_by_google_sub(google_sub: str):
    return User.query.filter_by(google_sub=google_sub).first()


def get_or_create_google_user(email: str, google_sub: str, full_name: str | None = None) -> User:
    """Finds or creates a User from a verified Google OAuth identity.
    Reuses existing token generation, username generation, and database schema."""
    from utils.id_generator import new_cybercarnival_token, new_username, new_temp_password

    # 1. Lookup by google_sub
    user = get_user_by_google_sub(google_sub)
    if user:
        if full_name and not user.full_name:
            user.full_name = full_name
            db.session.commit()
        return user

    # 2. Lookup by email (existing account created via OTP or manual)
    user = get_user_by_email(email)
    if user:
        if not user.google_sub:
            user.google_sub = google_sub
        if full_name and not user.full_name:
            user.full_name = full_name
        db.session.commit()
        return user

    # 3. Create new user for this verified Google identity
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

    import secrets
    unusable_pwd = secrets.token_hex(32)
    user = User(
        cybercarnival_token=token,
        username=username,
        password_hash=hash_password(unusable_pwd),
        must_change_password=False,
        email=email,
        full_name=full_name or "",
        google_sub=google_sub,
        auth_provider="google",
        profile_completed=False,
    )
    db.session.add(user)
    db.session.commit()

    from utils.email import send_google_signup_token_email
    try:
        send_google_signup_token_email(email, token)
    except Exception:
        # Same policy as every other email in this project: a failed send
        # never undoes an already-committed account — log it, don't raise.
        from utils.logger import get_logger
        get_logger("user_service").exception(
            "failed to send Google signup token email to=%s user=%s", email, user.id
        )

    return user


