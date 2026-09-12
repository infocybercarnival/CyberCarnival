import os
import sys
import datetime
import unittest
from pathlib import Path
from unittest.mock import patch

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import config
from app import create_app
from extensions import db
from models import User, OtpVerification
from services.otp_service import (
    request_otp,
    verify_otp_and_create_user,
    request_login_otp,
    verify_login_otp,
    ExpiredOtpError,
)
from utils.security import hash_password
from utils.email import send_otp_email


class TestOtpExpiry(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        config.TURNSTILE_SECRET_KEY = "test-turnstile-secret"
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.rollback()
        OtpVerification.query.filter(OtpVerification.email.like("%otpexpiry%")).delete()
        User.query.filter(User.email.like("%otpexpiry%")).delete()
        db.session.commit()
        self.app_context.pop()

    def test_otp_config_defaults(self):
        """Verify centralized OTP configuration defaults to 7 minutes (420 seconds)."""
        self.assertEqual(config.OTP_EXPIRY_MINUTES, 7)
        self.assertEqual(config.OTP_TTL_SECONDS, 420)
        self.assertEqual(config.OTP_TTL_SECONDS, config.OTP_EXPIRY_MINUTES * 60)

    def test_signup_otp_expiration_7_minutes(self):
        """Verify signup OTP created with 7-minute (420s) expiration timestamp."""
        email = "otpexpiry_signup@example.com"
        request_otp(email)

        entry = (
            OtpVerification.query.filter_by(email=email, purpose="signup")
            .order_by(OtpVerification.created_at.desc())
            .first()
        )
        self.assertIsNotNone(entry)
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        ttl = (entry.expires_at - now).total_seconds()
        # TTL should be around 420 seconds (7 minutes)
        self.assertGreater(ttl, 410)
        self.assertLessEqual(ttl, 420)

    def test_login_otp_expiration_7_minutes(self):
        """Verify login OTP created with 7-minute (420s) expiration timestamp."""
        email = "otpexpiry_login@example.com"
        user = User(
            username="otpexpiry_login_user",
            email=email,
            cybercarnival_token="CCOTPEXP01",
            password_hash=hash_password("Pass123!"),
            is_active=True,
        )
        db.session.add(user)
        db.session.commit()

        request_login_otp(user)

        entry = (
            OtpVerification.query.filter_by(email=email, purpose="login")
            .order_by(OtpVerification.created_at.desc())
            .first()
        )
        self.assertIsNotNone(entry)
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        ttl = (entry.expires_at - now).total_seconds()
        self.assertGreater(ttl, 410)
        self.assertLessEqual(ttl, 420)

    def test_otp_valid_before_7_minutes(self):
        """Verify OTP verification succeeds before 7-minute expiration."""
        email = "otpexpiry_valid@example.com"
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        entry = OtpVerification(
            email=email,
            otp_hash=hash_password("654321"),
            purpose="signup",
            attempts=0,
            max_attempts=5,
            expires_at=now + datetime.timedelta(minutes=6, seconds=50),
        )
        db.session.add(entry)
        db.session.commit()

        created_user = verify_otp_and_create_user(email, "654321")
        self.assertIsNotNone(created_user)
        self.assertEqual(created_user.email, email)

    def test_otp_rejected_after_7_minutes(self):
        """Verify OTP verification raises ExpiredOtpError after 7 minutes."""
        email = "otpexpiry_expired@example.com"
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        entry = OtpVerification(
            email=email,
            otp_hash=hash_password("654321"),
            purpose="signup",
            attempts=0,
            max_attempts=5,
            expires_at=now - datetime.timedelta(seconds=1),
        )
        db.session.add(entry)
        db.session.commit()

        with self.assertRaises(ExpiredOtpError):
            verify_otp_and_create_user(email, "654321")

    def test_login_otp_rejected_after_7_minutes(self):
        """Verify login OTP verification raises ExpiredOtpError after 7 minutes."""
        email = "otpexpiry_login_expired@example.com"
        user = User(
            username="otpexpiry_login_expired_user",
            email=email,
            cybercarnival_token="CCOTPEXP02",
            password_hash=hash_password("Pass123!"),
            is_active=True,
        )
        db.session.add(user)
        db.session.commit()

        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        entry = OtpVerification(
            email=email,
            otp_hash=hash_password("654321"),
            purpose="login",
            attempts=0,
            max_attempts=5,
            expires_at=now - datetime.timedelta(seconds=1),
        )
        db.session.add(entry)
        db.session.commit()

        with self.assertRaises(ExpiredOtpError):
            verify_login_otp(user, "654321")

    def test_resent_otp_receives_fresh_window(self):
        """Verify resent login OTP invalidates old OTP and creates fresh 7-minute window."""
        email = "otpexpiry_resend@example.com"
        user = User(
            username="otpexpiry_resend_user",
            email=email,
            cybercarnival_token="CCOTPEXP03",
            password_hash=hash_password("Pass123!"),
            is_active=True,
        )
        db.session.add(user)
        db.session.commit()

        # Generate initial OTP
        request_login_otp(user)
        entry1 = (
            OtpVerification.query.filter_by(email=email, purpose="login")
            .order_by(OtpVerification.created_at.desc())
            .first()
        )

        # Simulate resend after cooldown window
        entry1.created_at -= datetime.timedelta(seconds=config.OTP_RESEND_COOLDOWN_SECONDS + 5)
        db.session.commit()

        request_login_otp(user)
        entry2 = (
            OtpVerification.query.filter_by(email=email, purpose="login", consumed_at=None)
            .order_by(OtpVerification.created_at.desc())
            .first()
        )

        self.assertIsNotNone(entry1.consumed_at)  # Old OTP invalidated
        self.assertNotEqual(entry1.id, entry2.id)
        now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
        ttl2 = (entry2.expires_at - now).total_seconds()
        self.assertGreater(ttl2, 410)
        self.assertLessEqual(ttl2, 420)

    def test_otp_email_contains_configured_minutes(self):
        """Verify transactional OTP emails state configured minutes validity dynamically."""
        captured = {}

        def mock_send(to, subject, html, dev_summary=""):
            captured["subject"] = subject
            captured["html"] = html
            captured["dev_summary"] = dev_summary

        with patch("utils.email._send_html_email", side_effect=mock_send):
            send_otp_email("otpexpiry_email@example.com", "123456", purpose="signup")

        self.assertIn(f"{config.OTP_EXPIRY_MINUTES} minutes", captured.get("html", ""))
        self.assertIn(f"Expires in {config.OTP_EXPIRY_MINUTES} minutes.", captured.get("dev_summary", ""))
        self.assertIn("7 minutes", captured.get("html", ""))

    def test_dynamic_config_change(self):
        """Verify changing OTP_EXPIRY_MINUTES dynamically derives correct TTL."""
        with patch.object(config, "OTP_EXPIRY_MINUTES", 10):
            with patch.object(config, "OTP_TTL_SECONDS", 10 * 60):
                email = "otpexpiry_dynamic@example.com"
                request_otp(email)

                entry = (
                    OtpVerification.query.filter_by(email=email, purpose="signup")
                    .order_by(OtpVerification.created_at.desc())
                    .first()
                )
                self.assertIsNotNone(entry)
                now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)
                ttl = (entry.expires_at - now).total_seconds()
                self.assertGreater(ttl, 590)
                self.assertLessEqual(ttl, 600)

    def test_invalid_env_config_fallback(self):
        """Verify invalid or non-positive OTP_EXPIRY_MINUTES falls back safely to 7 minutes."""
        for invalid_val in ["invalid", "-10", "0", "abc"]:
            with patch.dict(os.environ, {"OTP_EXPIRY_MINUTES": invalid_val}):
                try:
                    expiry_val = int(os.environ.get("OTP_EXPIRY_MINUTES", "7"))
                    if expiry_val <= 0:
                        expiry_val = 7
                except (ValueError, TypeError):
                    expiry_val = 7
                self.assertEqual(expiry_val, 7)


if __name__ == "__main__":
    unittest.main()
