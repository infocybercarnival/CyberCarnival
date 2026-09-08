"""
Central configuration. Loaded once at startup. Fails fast (refuses to boot)
if required secrets are missing in production instead of silently falling
back to an insecure default.
"""

import os
import secrets
from pathlib import Path

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


ENV = os.environ.get("FLASK_ENV", "development")
IS_PRODUCTION = ENV == "production"


SECRET_KEY = os.environ.get("SECRET_KEY", "")

if not SECRET_KEY:
    if IS_PRODUCTION:
        raise RuntimeError(
            "SECRET_KEY is not set. Refusing to start in production without it. "
            "Set SECRET_KEY in your .env file."
        )

    SECRET_KEY = secrets.token_hex(32)


DATA_DIR = BASE_DIR / "data"
LOG_DIR = BASE_DIR / "logs"

DATA_DIR.mkdir(exist_ok=True)
LOG_DIR.mkdir(exist_ok=True)


LOGIN_ATTEMPTS_FILE = DATA_DIR / "login_attempts.json"


# --- CORS / Allowed Origins -------------------------------------------------

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]

if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5000",
        "http://127.0.0.1:5000",
    ]


# --- Site / OAuth -----------------------------------------------------------

SITE_URL = os.environ.get(
    "SITE_URL",
    "http://127.0.0.1:5000",
).rstrip("/")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

GOOGLE_REDIRECT_URI = (
    os.environ.get("GOOGLE_REDIRECT_URI", "")
    or f"{SITE_URL}/api/auth/google/callback"
)

ALLOWED_EMAIL_DOMAIN = (
    os.environ.get("ALLOWED_EMAIL_DOMAIN", "")
    .strip()
    .lower()
)

ADMIN_GOOGLE_EMAIL = (
    os.environ.get(
        "ADMIN_GOOGLE_EMAIL",
        "info.cybercarnival@gmail.com",
    )
    .strip()
    .lower()
)

ADMIN_NOTIFICATION_EMAIL = (
    os.environ.get(
        "ADMIN_NOTIFICATION_EMAIL",
        ADMIN_GOOGLE_EMAIL,
    )
    .strip()
)


# --- CAPTCHA (Cloudflare Turnstile) ----------------------------------------

TURNSTILE_SECRET_KEY = os.environ.get(
    "TURNSTILE_SECRET_KEY",
    "",
)

TURNSTILE_VERIFY_URL = (
    "https://challenges.cloudflare.com/turnstile/v0/siteverify"
)


# --- Razorpay ---------------------------------------------------------------

RAZORPAY_KEY_ID = os.environ.get(
    "RAZORPAY_KEY_ID",
    "",
)

RAZORPAY_KEY_SECRET = os.environ.get(
    "RAZORPAY_KEY_SECRET",
    "",
)

RAZORPAY_WEBHOOK_SECRET = os.environ.get(
    "RAZORPAY_WEBHOOK_SECRET",
    "",
)


PAYMENT_SESSION_MINUTES = int(
    os.environ.get(
        "PAYMENT_SESSION_MINUTES",
        "10",
    )
)


# --- Manual UPI QR payments -------------------------------------------------

UPI_ID = os.environ.get(
    "UPI_ID",
    "cybercarnival@upi",
).strip()

UPI_PAYEE_NAME = (
    os.environ.get(
        "UPI_PAYEE_NAME",
        "CyberCarnival",
    ).strip()
    or "CyberCarnival"
)

UPI_DUMMY_MODE = (
    os.environ.get(
        "UPI_DUMMY_MODE",
        "true",
    )
    .strip()
    .lower()
    == "true"
)


# --- Rate Limiting ----------------------------------------------------------

RATELIMIT_STORAGE_URI = os.environ.get(
    "RATELIMIT_STORAGE_URI",
    "memory://",
)


# --- Database ---------------------------------------------------------------

DATABASE_URL_ENV = os.environ.get("DATABASE_URL")

if DATABASE_URL_ENV:
    SQLALCHEMY_DATABASE_URI = DATABASE_URL_ENV.strip()

    if SQLALCHEMY_DATABASE_URI.startswith("mysql://"):
        SQLALCHEMY_DATABASE_URI = (
            "mysql+pymysql://"
            + SQLALCHEMY_DATABASE_URI[len("mysql://"):]
        )

    elif SQLALCHEMY_DATABASE_URI.startswith("postgresql://"):
        SQLALCHEMY_DATABASE_URI = (
            "postgresql+psycopg://"
            + SQLALCHEMY_DATABASE_URI[len("postgresql://"):]
        )

    elif SQLALCHEMY_DATABASE_URI.startswith("postgres://"):
        SQLALCHEMY_DATABASE_URI = (
            "postgresql+psycopg://"
            + SQLALCHEMY_DATABASE_URI[len("postgres://"):]
        )

else:
    if IS_PRODUCTION:
        raise RuntimeError(
            "DATABASE_URL environment variable is missing. "
            "Refusing to start in production without a database connection."
        )

    SQLALCHEMY_DATABASE_URI = (
        f"sqlite:///{DATA_DIR / 'cybercarnival.db'}"
    )


SQLALCHEMY_TRACK_MODIFICATIONS = False

SQLALCHEMY_ENGINE_OPTIONS = {
    "pool_pre_ping": True,
    "pool_recycle": 280,
}


# --- Email ------------------------------------------------------------------

EMAIL_DEV_MODE = (
    os.environ.get(
        "EMAIL_DEV_MODE",
        "true",
    )
    .strip()
    .lower()
    == "true"
)

EMAIL_SMTP_URL = os.environ.get(
    "EMAIL_SMTP_URL",
    "smtp.gmail.com:587",
)

EMAIL_SMTP_USER = os.environ.get(
    "EMAIL_SMTP_USER",
    "",
)

EMAIL_SMTP_PASSWORD = os.environ.get(
    "EMAIL_SMTP_PASSWORD",
    "",
)

EMAIL_FROM = (
    os.environ.get("EMAIL_FROM", "")
    or EMAIL_SMTP_USER
)

EMAIL_FROM_NAME = os.environ.get(
    "EMAIL_FROM_NAME",
    "CyberCarnival",
)


# --- OTP --------------------------------------------------------------------

OTP_LENGTH = 6
OTP_TTL_SECONDS = 2 * 60
OTP_MAX_ATTEMPTS = 5
OTP_RESEND_COOLDOWN_SECONDS = 60


# --- Event Poster Uploads ---------------------------------------------------

UPLOAD_DIR = DATA_DIR / "uploads" / "posters"

UPLOAD_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

MAX_POSTER_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_POSTER_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
    "webp",
}


# --- Payment Proof Uploads --------------------------------------------------

PAYMENT_PROOF_DIR = DATA_DIR / "uploads" / "payment_proofs"

PAYMENT_PROOF_DIR.mkdir(
    parents=True,
    exist_ok=True,
)

MAX_PAYMENT_PROOF_SIZE_BYTES = 5 * 1024 * 1024

ALLOWED_PAYMENT_PROOF_EXTENSIONS = {
    "png",
    "jpg",
    "jpeg",
}

ALLOWED_PAYMENT_PROOF_MIMES = {
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/pjpeg",
}


# --- Frontend Build Directory -----------------------------------------------

FRONTEND_DIST_DIR = Path(
    os.environ.get(
        "FRONTEND_DIST_DIR",
        str(
            BASE_DIR.parent
            / "frontend"
            / "out"
        ),
    )
).resolve()


# --- Request Size -----------------------------------------------------------

# Supports two event poster uploads up to 5 MB each
# plus multipart/form-data overhead.
MAX_CONTENT_LENGTH = 12 * 1024 * 1024


# --- Session / Cookie Security ----------------------------------------------

SESSION_COOKIE_NAME = "cybercarnival_session"

SESSION_COOKIE_SECURE = IS_PRODUCTION

SESSION_COOKIE_HTTPONLY = True

# Vercel frontend -> Render backend requires cross-site session cookies.
SESSION_COOKIE_SAMESITE = (
    "None"
    if IS_PRODUCTION
    else "Lax"
)

PERMANENT_SESSION_LIFETIME_SECONDS = (
    60 * 60 * 4
)


# --- CSRF -------------------------------------------------------------------

CSRF_TOKEN_LIFETIME_SECONDS = (
    PERMANENT_SESSION_LIFETIME_SECONDS
)


# --- Login Protection -------------------------------------------------------

MAX_FAILED_LOGIN_ATTEMPTS = 5

LOGIN_LOCKOUT_SECONDS = 15 * 60
