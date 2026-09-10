import sys
import os
import unittest
import uuid
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import config
from app import create_app
from extensions import db
from models import User

class TestAuthenticationLoops(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        config.TURNSTILE_SECRET_KEY = "test-turnstile-secret"
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

        # Seed a test user
        self.user = User.query.filter_by(username="looptestuser").first()
        if not self.user:
            self.user = User(
                username="looptestuser",
                email="looptest@example.com",
                cybercarnival_token="CCLOOPTEST01",
                password_hash="scrypt:fakehash",
                is_active=True,
                profile_completed=True,
                full_name="Loop Test User",
                phone="9876543210",
                college="SRM IST"
            )
            db.session.add(self.user)
            db.session.commit()

    def tearDown(self):
        db.session.rollback()
        users = User.query.filter(User.email.like("%looptest%")).all()
        for u in users:
            db.session.delete(u)
        db.session.commit()
        self.app_context.pop()

    def test_scenario_a_b_unauthenticated_access(self):
        """SCENARIO A & B: Unauthenticated user accesses /api/auth/me and receives 401 without looping"""
        res = self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, 401)
        data = res.get_json()
        self.assertEqual(data.get("error"), "authentication required")

    def test_scenario_c_d_authenticated_session(self):
        """SCENARIO C & D: Authenticated user session state is returned by /api/auth/me"""
        user = User.query.filter_by(username="looptestuser").first()
        with self.client.session_transaction() as sess:
            sess["user_id"] = user.id

        res = self.client.get("/api/auth/me")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("id"), str(user.id))
        self.assertEqual(data.get("username"), "looptestuser")

    def test_scenario_e_unauthenticated_dashboard(self):
        """SCENARIO E: Unauthenticated API request to protected route returns 401 ONCE"""
        res = self.client.get("/api/auth/me/events")
        self.assertEqual(res.status_code, 401)

    def test_scenario_f_successful_session_establishment(self):
        """SCENARIO F: Successful session setting persists across requests"""
        user = User.query.filter_by(username="looptestuser").first()
        with self.client as client:
            with client.session_transaction() as sess:
                sess["user_id"] = user.id
                sess["sid"] = "test-session-sid-01"

            res = client.get("/api/auth/me")
            self.assertEqual(res.status_code, 200)
            self.assertEqual(res.get_json()["username"], "looptestuser")

    def test_scenario_g_dashboard_refresh(self):
        """SCENARIO G: Refreshing dashboard preserves active session"""
        user = User.query.filter_by(username="looptestuser").first()
        with self.client as client:
            with client.session_transaction() as sess:
                sess["user_id"] = user.id

            res1 = client.get("/api/auth/me")
            self.assertEqual(res1.status_code, 200)

            res2 = client.get("/api/auth/me")
            self.assertEqual(res2.status_code, 200)

            res3 = client.get("/api/auth/me/events")
            self.assertEqual(res3.status_code, 200)

    def test_scenario_h_logout_revocation(self):
        """SCENARIO H: Logout revokes session and renders subsequent calls 401"""
        user = User.query.filter_by(username="looptestuser").first()
        self.assertIsNotNone(user)
        unique_sid = f"test-sid-logout-{uuid.uuid4().hex}"
        with self.client as client:
            with client.session_transaction() as sess:
                sess["user_id"] = user.id
                sess["sid"] = unique_sid

            me_before = client.get("/api/auth/me")
            self.assertEqual(me_before.status_code, 200)

            logout_res = client.post("/api/auth/logout")
            self.assertEqual(logout_res.status_code, 200)

            me_after = client.get("/api/auth/me")
            self.assertEqual(me_after.status_code, 401)

    def test_scenario_i_registration_completion(self):
        """SCENARIO I: User creation via OTP verification creates active user account"""
        from services.otp_service import verify_otp_and_create_user, request_otp
        from models import OtpVerification
        from utils.security import hash_password

        email = "newreguser@looptest.com"
        from datetime import datetime, timedelta
        # Seed active OTP
        otp_entry = OtpVerification(
            email=email,
            otp_hash=hash_password("123456"),
            purpose="signup",
            attempts=0,
            max_attempts=5,
            expires_at=datetime.utcnow() + timedelta(minutes=10)
        )
        db.session.add(otp_entry)
        db.session.commit()

        user = verify_otp_and_create_user(email, "123456")
        self.assertIsNotNone(user)
        self.assertEqual(user.email, email)
        self.assertTrue(user.cybercarnival_token.startswith("CC"))

        # Clean up
        db.session.delete(user)
        db.session.commit()

    def test_scenario_j_localhost_headers(self):
        """SCENARIO J: Localhost origin requests are allowed and return correct CORS headers"""
        res = self.client.get("/api/auth/me", headers={"Origin": "http://localhost:3000"})
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "http://localhost:3000")
        self.assertEqual(res.headers.get("Access-Control-Allow-Credentials"), "true")

    def test_scenario_k_127_0_0_1_headers(self):
        """SCENARIO K: 127.0.0.1 origin requests are allowed and return correct CORS headers"""
        res = self.client.get("/api/auth/me", headers={"Origin": "http://127.0.0.1:3000"})
        self.assertEqual(res.headers.get("Access-Control-Allow-Origin"), "http://127.0.0.1:3000")
        self.assertEqual(res.headers.get("Access-Control-Allow-Credentials"), "true")

if __name__ == "__main__":
    unittest.main()
