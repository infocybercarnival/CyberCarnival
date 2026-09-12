"""
Comprehensive tests for Supabase failure monitoring, production zero local disk fallback,
AdminAlert deduplication, recovery alerts, and Admin API security.
"""

import io
import unittest
from unittest.mock import patch

from app import create_app
import config
from extensions import db
from models import Admin, AdminAlert, Event, EventRegistration, User
from services import alert_service, registration_service


class TestSupabaseAlertSystem(unittest.TestCase):

    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        self.client = self.app.test_client()

        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

        # Seed test event
        event = Event(
            id="evt-storage-test",
            name="Storage Test Event",
            description="Testing storage failure",
            category="TECH",
            fee_amount=10000,
            fee="100.00",
            max_teams=50,
            min_team_size=1,
            max_team_size=4,
        )
        db.session.add(event)

        # Seed test user
        user = User(
            username="storageuser",
            email="storageuser@example.com",
            full_name="Storage Test User",
            register_number="REG1234",
            college="Test College",
            cybercarnival_token="CC-TEST-1234",
        )
        db.session.add(user)

        # Seed admin
        admin = Admin(username="admin_storage_test", password_hash="hashed")
        db.session.add(admin)

        db.session.commit()
        self.user_id = user.id
        self.event_id = event.id

    def tearDown(self):
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_production_supabase_storage_failure_no_local_disk_write(self):
        """
        Critical Rule: In production, when Supabase Storage fails:
        1. HTTP 503 is returned.
        2. AdminAlert is created with critical severity.
        3. NO payment screenshot file is written to local disk.
        """
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(
                user, {"event_id": self.event_id, "participant_mode": "individual"}
            )
            reg_id = reg.id

        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 1024
        file = (io.BytesIO(png_data), "proof.png")

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        # Force production mode & mock Supabase upload failure
        original_prod = config.IS_PRODUCTION
        config.IS_PRODUCTION = True

        try:
            with patch("services.storage_service.is_supabase_storage_configured", return_value=True), \
                 patch("services.storage_service.upload_to_supabase", return_value=False):

                res = self.client.post(
                    f"/api/registrations/{reg_id}/payment",
                    data={
                        "event_id": self.event_id,
                        "transaction_id": "UPIPRODFAIL123",
                        "disclaimer_accepted": "true",
                        "payment_proof": file,
                    },
                    content_type="multipart/form-data",
                )

                self.assertEqual(res.status_code, 503)
                self.assertEqual(
                    res.get_json().get("error"),
                    "Payment storage is temporarily unavailable. Please try again later.",
                )

                with self.app.app_context():
                    # Confirm AdminAlert created
                    alert = AdminAlert.query.filter_by(category="supabase_storage").first()
                    self.assertIsNotNone(alert)
                    self.assertEqual(alert.severity, "critical")
                    self.assertIn("Supabase Storage Unavailable", alert.title)

                    # Confirm registration status is NOT updated to pending_verification
                    reg_check = db.session.get(EventRegistration, reg_id)
                    self.assertIsNone(reg_check.payment_proof_filename)
                    self.assertEqual(reg_check.status, "pending_payment")
        finally:
            config.IS_PRODUCTION = original_prod

    def test_alert_deduplication(self):
        """
        Multiple repeated failures within deduplication window update occurrence_count
        rather than flooding the database with duplicate alert rows.
        """
        with self.app.app_context():
            a1 = alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Failure Test",
                message="Failure 1",
                severity="critical",
                category="supabase_storage",
            )
            a2 = alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Failure Test",
                message="Failure 2",
                severity="critical",
                category="supabase_storage",
            )
            a3 = alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Failure Test",
                message="Failure 3",
                severity="critical",
                category="supabase_storage",
            )

            alerts = AdminAlert.query.filter_by(title="🚨 Supabase Storage Failure Test").all()
            self.assertEqual(len(alerts), 1)
            self.assertEqual(alerts[0].occurrence_count, 3)
            self.assertEqual(alerts[0].message, "Failure 3")

    def test_alert_recovery(self):
        """
        When a service recovers, previous unresolved alerts are marked resolved and an info recovery alert is created.
        """
        with self.app.app_context():
            # Create active critical alert
            fail_alert = alert_service.create_or_update_alert(
                title="🚨 Supabase Storage Failure Test",
                message="Service down",
                severity="critical",
                category="supabase_storage",
            )
            self.assertEqual(fail_alert.status, "unread")

            # Post recovery
            rec_alert = alert_service.create_recovery_alert("supabase_storage", "Supabase Storage")
            self.assertIsNotNone(rec_alert)
            self.assertEqual(rec_alert.severity, "info")
            self.assertIn("Recovered", rec_alert.title)

            # Check original alert is now resolved
            rechecked = db.session.get(AdminAlert, fail_alert.id)
            self.assertEqual(rechecked.status, "resolved")
            self.assertIsNotNone(rechecked.resolved_at)

    def test_admin_alerts_api_security_and_endpoints(self):
        """
        Test /admin/api/alerts endpoints security and lifecycle.
        - Unauthenticated -> 401
        - Admin authenticated -> 200
        - Read and resolve actions work cleanly.
        """
        with self.app.app_context():
            alert = alert_service.create_or_update_alert(
                title="⚠️ Test Warning Alert",
                message="Testing Admin API security",
                severity="warning",
                category="system",
            )
            alert_id = alert.id

        # 1. Unauthenticated request -> 401
        res = self.client.get("/admin/api/alerts")
        self.assertEqual(res.status_code, 401)

        # 2. Admin authenticated request -> 200
        with self.client.session_transaction() as sess:
            sess["admin_logged_in"] = True
            sess["admin_username"] = "admin_storage_test"

        res = self.client.get("/admin/api/alerts")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("alerts", data)
        self.assertGreaterEqual(data["unread_count"], 1)

        # 3. Mark Read
        res_read = self.client.post(f"/admin/api/alerts/{alert_id}/read")
        self.assertEqual(res_read.status_code, 200)

        # 4. Mark Resolve
        res_res = self.client.post(f"/admin/api/alerts/{alert_id}/resolve")
        self.assertEqual(res_res.status_code, 200)

        with self.app.app_context():
            final_alert = db.session.get(AdminAlert, alert_id)
            self.assertEqual(final_alert.status, "resolved")

    def test_secret_protection(self):
        """
        Verify API responses for /admin/api/alerts never leak environment secrets.
        """
        with self.app.app_context():
            alert_service.create_or_update_alert(
                title="⚠️ Secret Leak Test Alert",
                message="Ensuring secrets are never exposed",
                severity="info",
                category="system",
                meta={"safe_key": "safe_value"},
            )

        with self.client.session_transaction() as sess:
            sess["admin_logged_in"] = True
            sess["admin_username"] = "admin_storage_test"

        res = self.client.get("/admin/api/alerts")
        self.assertEqual(res.status_code, 200)
        text = res.get_data(as_text=True)

        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", text)
        self.assertNotIn("DATABASE_URL", text)
        self.assertNotIn("SECRET_KEY", text)
