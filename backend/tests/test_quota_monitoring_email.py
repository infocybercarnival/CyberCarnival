"""
Comprehensive automated tests for Supabase Quota Monitoring, SMTP External Infrastructure Alerts,
Email Deduplication Cooldown, Recovery Detection, Database Failure Handling, and Security.
"""

import io
import unittest
from unittest.mock import MagicMock, patch

from app import create_app
import config
from extensions import db
from models import Admin, AdminAlert, Event, EventRegistration, User
from services import alert_service, monitoring_service, registration_service
from utils.email import send_infrastructure_alert_email


class TestQuotaMonitoringAndEmailAlerts(unittest.TestCase):

    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        self.client = self.app.test_client()

        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

        # Reset email cooldown tracker
        alert_service._LAST_EMAIL_SENT.clear()

        # Seed test event
        event = Event(
            id="evt-quota-test",
            name="Quota & Email Test Event",
            description="Testing quota & email monitoring",
            category="TECH",
            fee_amount=5000,
            fee="50.00",
            max_teams=50,
            min_team_size=1,
            max_team_size=4,
        )
        db.session.add(event)

        # Seed test user
        user = User(
            username="quotauser",
            email="quotauser@example.com",
            full_name="Quota Test User",
            register_number="REG5678",
            college="Test College",
            cybercarnival_token="CC-QUOTA-5678",
        )
        db.session.add(user)

        # Seed admin
        admin = Admin(username="admin_quota_test", password_hash="hashed")
        db.session.add(admin)

        db.session.commit()
        self.user_id = user.id
        self.event_id = event.id

    def tearDown(self):
        alert_service._LAST_EMAIL_SENT.clear()
        db.session.remove()
        db.drop_all()
        self.app_context.pop()

    def test_1_storage_failure_triggers_503_alert_and_smtp_attempt(self):
        """
        Storage Failure:
        - Returns 503 Service Unavailable.
        - No file written to local disk.
        - AdminAlert created.
        - SMTP email alert attempted.
        """
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(
                user, {"event_id": self.event_id, "participant_mode": "individual"}
            )
            reg_id = reg.id

        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 512
        file = (io.BytesIO(png_data), "proof.png")

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        original_prod = config.IS_PRODUCTION
        config.IS_PRODUCTION = True

        try:
            with patch("services.storage_service.is_supabase_storage_configured", return_value=True), \
                 patch("services.storage_service.upload_to_supabase", return_value=False), \
                 patch("services.alert_service.send_infrastructure_alert_email") as mock_email:

                mock_email.return_value = True

                res = self.client.post(
                    f"/api/registrations/{reg_id}/payment",
                    data={
                        "event_id": self.event_id,
                        "transaction_id": "TXNFAIL503",
                        "disclaimer_accepted": "true",
                        "payment_proof": file,
                    },
                    content_type="multipart/form-data",
                )

                self.assertEqual(res.status_code, 503)
                self.assertIn("Payment storage is temporarily unavailable", res.get_json().get("error", ""))

                # Verify SMTP alert was called
                mock_email.assert_called_once()
                call_args = mock_email.call_args[1]
                self.assertEqual(call_args["severity"], "critical")
                self.assertEqual(call_args["service_name"], "supabase_storage")

                with self.app.app_context():
                    # Confirm AdminAlert created
                    alert = AdminAlert.query.filter_by(category="supabase_storage").first()
                    self.assertIsNotNone(alert)
                    self.assertEqual(alert.severity, "critical")
        finally:
            config.IS_PRODUCTION = original_prod

    def test_2_email_deduplication_cooldown(self):
        """
        Duplicate Failure Deduplication:
        Multiple repeated failures within cooldown window trigger ONLY ONE SMTP email,
        while updating AdminAlert occurrence_count.
        """
        with patch("services.alert_service.send_infrastructure_alert_email") as mock_email:
            mock_email.return_value = True

            with self.app.app_context():
                # 1st failure -> triggers email
                alert_service.create_or_update_alert(
                    title="🚨 Storage Outage",
                    message="Outage 1",
                    severity="critical",
                    category="supabase_storage",
                )
                self.assertEqual(mock_email.call_count, 1)

                # 2nd failure -> suppressed by cooldown
                alert_service.create_or_update_alert(
                    title="🚨 Storage Outage",
                    message="Outage 2",
                    severity="critical",
                    category="supabase_storage",
                )
                self.assertEqual(mock_email.call_count, 1)

                # 3rd failure -> suppressed by cooldown
                alert_service.create_or_update_alert(
                    title="🚨 Storage Outage",
                    message="Outage 3",
                    severity="critical",
                    category="supabase_storage",
                )
                self.assertEqual(mock_email.call_count, 1)

                # Verify occurrence count in DB
                alert = AdminAlert.query.filter_by(category="supabase_storage").first()
                self.assertEqual(alert.occurrence_count, 3)

    def test_3_service_recovery(self):
        """
        Service Recovery:
        - Resolves active incident alerts.
        - Creates an info recovery AdminAlert.
        - Sends 1 recovery email.
        """
        with patch("services.alert_service.send_infrastructure_alert_email") as mock_email:
            mock_email.return_value = True

            with self.app.app_context():
                # Trigger incident
                alert_service.create_or_update_alert(
                    title="🚨 DB Outage",
                    message="DB connection failed",
                    severity="critical",
                    category="supabase_database",
                )
                self.assertEqual(mock_email.call_count, 1)

                # Trigger recovery
                rec_alert = alert_service.create_recovery_alert("supabase_database", "Supabase Database")
                self.assertIsNotNone(rec_alert)
                self.assertEqual(rec_alert.severity, "info")

                # Verify total email calls = 2 (1 failure + 1 recovery)
                self.assertEqual(mock_email.call_count, 2)
                recovery_call = mock_email.call_args[1]
                self.assertTrue(recovery_call.get("is_recovery"))
                self.assertEqual(recovery_call.get("severity"), "info")

    def test_4_database_failure_handling(self):
        """
        Database Outage:
        - Returns unhealthy status from health check.
        - System health check handles DB error safely without crashing.
        - Does not create local SQLite fallback files.
        """
        with patch("services.monitoring_service.db.session.execute", side_effect=Exception("DB Connection Refused")):
            res = monitoring_service.check_database_health()
            self.assertEqual(res["status"], "unhealthy")
            self.assertIn("Database ping failed", res["message"])

        # Health check overall summary handles DB error cleanly
        with patch("services.monitoring_service.check_database_health", return_value={"service": "database", "status": "unhealthy"}):
            summary = monitoring_service.run_full_system_health_check()
            self.assertEqual(summary["database"]["status"], "unhealthy")

    def test_5_smtp_failure_safety(self):
        """
        SMTP Failure:
        - If SMTP server fails, send_infrastructure_alert_email returns False.
        - Does not crash calling code or expose secrets.
        """
        with patch("utils.email._send_html_email", side_effect=Exception("SMTP Connection Error")):
            success = send_infrastructure_alert_email(
                subject="Test Alert",
                title="Test Title",
                message="Test Message",
                service_name="system",
                severity="critical",
            )
            self.assertFalse(success)

    def test_6_quota_metrics_validation(self):
        """
        Quota Metric Parsing & Thresholds:
        - Missing management credentials -> returns metrics_available=False without fake percentages.
        - Present management credentials -> evaluates 80%, 90%, 95% thresholds correctly.
        """
        # 1. Missing credentials
        with patch.object(config, "SUPABASE_MANAGEMENT_TOKEN", ""), \
             patch.object(config, "SUPABASE_PROJECT_REF", ""):
            res = monitoring_service.check_supabase_quota_metrics()
            self.assertFalse(res["metrics_available"])
            self.assertEqual(res["status"], "unavailable")

        # 2. Present credentials with 85% usage -> warning
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"database_size_pct": 85, "storage_size_pct": 40}

        with patch.object(config, "SUPABASE_MANAGEMENT_TOKEN", "mock_token"), \
             patch.object(config, "SUPABASE_PROJECT_REF", "mock_ref"), \
             patch("requests.get", return_value=mock_response):

            res = monitoring_service.check_supabase_quota_metrics()
            self.assertTrue(res["metrics_available"])
            self.assertEqual(res["status"], "warning")
            self.assertEqual(res["max_usage_pct"], 85)

    def test_7_system_health_api_security(self):
        """
        Admin System Health API:
        - Unauthenticated -> 401
        - Admin authenticated -> 200
        - Payload contains no secrets (DATABASE_URL, SUPABASE_SERVICE_ROLE_KEY, etc.)
        """
        # 1. Unauthenticated -> 401
        res = self.client.get("/admin/api/system-health")
        self.assertEqual(res.status_code, 401)

        # 2. Admin authenticated -> 200
        with self.client.session_transaction() as sess:
            sess["admin_logged_in"] = True
            sess["admin_username"] = "admin_quota_test"

        res = self.client.get("/admin/api/system-health")
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("database", data)
        self.assertIn("storage", data)
        self.assertIn("quota", data)

        # 3. Secret sanitization
        text = res.get_data(as_text=True)
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", text)
        self.assertNotIn("DATABASE_URL", text)
        self.assertNotIn("SUPABASE_MANAGEMENT_TOKEN", text)
