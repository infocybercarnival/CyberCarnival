import unittest
from app import app
from extensions import db
from models import User, Admin, Coordinator, Event


class TestLogoutSecurityFlow(unittest.TestCase):
    def setUp(self):
        self.app = app
        self.app.config["TESTING"] = True
        self.app.config["WTF_CSRF_ENABLED"] = False
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            # Setup test user
            self.user = User.query.filter_by(username="testlogoutuser").first()
            if not self.user:
                self.user = User(
                    username="testlogoutuser",
                    email="testlogout@example.com",
                    cybercarnival_token="CYBERLOGOUT01",
                    password_hash="scrypt:fakehash",
                    is_active=True,
                    profile_completed=True,
                    full_name="Test Logout User"
                )

                db.session.add(self.user)

            # Setup test admin
            self.admin = Admin.query.filter_by(username="testadminlogout").first()
            if not self.admin:
                self.admin = Admin(
                    username="testadminlogout",
                    password_hash="scrypt:fakehash"
                )
                db.session.add(self.admin)

            # Setup test event & coordinator
            self.event = Event.query.filter_by(id="test-logout-evt").first()
            if not self.event:
                self.event = Event(
                    id="test-logout-evt",
                    name="Logout Test Event",
                    category="TECHNICAL",
                    active=True
                )
                db.session.add(self.event)

            self.coord = Coordinator.query.filter_by(username="testcoordlogout").first()
            if not self.coord:
                self.coord = Coordinator(

                    username="testcoordlogout",
                    password_hash="scrypt:fakehash",
                    full_name="Test Coordinator Logout",
                    is_active=True
                )
                self.coord.events.append(self.event)
                db.session.add(self.coord)

            db.session.commit()
            self.user_id = self.user.id
            self.admin_username = self.admin.username
            self.coord_id = self.coord.id
            self.coord_username = self.coord.username
            self.event_id = self.event.id

    def test_participant_logout_flow(self):
        # 1. Login user by setting session
        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        # Verify access
        me_resp = self.client.get("/api/auth/me")
        self.assertEqual(me_resp.status_code, 200)

        # 2. Call logout
        logout_resp = self.client.post("/api/auth/logout")
        self.assertEqual(logout_resp.status_code, 200)
        self.assertTrue(logout_resp.json.get("success"))

        # 3. Verify /api/auth/me returns 401
        me_after = self.client.get("/api/auth/me")
        self.assertEqual(me_after.status_code, 401)

    def test_admin_logout_flow(self):
        # 1. Login admin
        with self.client.session_transaction() as sess:
            sess["admin_username"] = self.admin_username
            sess["is_admin"] = True

        # Verify access to admin summary
        summary_resp = self.client.get("/admin/api/summary")
        self.assertEqual(summary_resp.status_code, 200)

        # 2. Call admin logout
        logout_resp = self.client.post("/admin/logout")
        self.assertEqual(logout_resp.status_code, 302)

        # 3. Verify admin API returns 401 after logout
        summary_after = self.client.get("/admin/api/summary")
        self.assertEqual(summary_after.status_code, 401)

    def test_admin_api_logout_flow(self):
        with self.client.session_transaction() as sess:
            sess["admin_username"] = self.admin_username
            sess["is_admin"] = True

        logout_resp = self.client.post("/admin/api/logout")
        self.assertEqual(logout_resp.status_code, 200)
        self.assertTrue(logout_resp.json.get("success"))

        summary_after = self.client.get("/admin/api/summary")
        self.assertEqual(summary_after.status_code, 401)

    def test_coordinator_logout_flow(self):
        # 1. Login coordinator
        with self.client.session_transaction() as sess:
            sess["coordinator_id"] = self.coord_id
            sess["coordinator_username"] = self.coord_username
            sess["coordinator_event_id"] = self.event_id

        # Verify access to coordinator /me
        coord_me = self.client.get("/coordinator/api/me")
        self.assertEqual(coord_me.status_code, 200)

        # 2. Call coordinator logout
        logout_resp = self.client.post("/coordinator/logout")
        self.assertEqual(logout_resp.status_code, 302)
        self.assertTrue(logout_resp.location.endswith("/login"))

        # 3. Verify coordinator API returns 401
        coord_after = self.client.get("/coordinator/api/me")
        self.assertEqual(coord_after.status_code, 401)

    def test_coordinator_api_logout_flow(self):
        with self.client.session_transaction() as sess:
            sess["coordinator_id"] = self.coord_id
            sess["coordinator_username"] = self.coord_username
            sess["coordinator_event_id"] = self.event_id

        logout_resp = self.client.post("/coordinator/api/logout")
        self.assertEqual(logout_resp.status_code, 200)
        self.assertTrue(logout_resp.json.get("success"))

        coord_after = self.client.get("/coordinator/api/me")
        self.assertEqual(coord_after.status_code, 401)


    def test_security_cache_headers(self):
        resp = self.client.get("/api/auth/me")
        self.assertIn("no-store", resp.headers.get("Cache-Control", ""))

        admin_resp = self.client.get("/admin/")
        self.assertIn("no-store", admin_resp.headers.get("Cache-Control", ""))

        coord_resp = self.client.get("/coordinator/")
        self.assertIn("no-store", coord_resp.headers.get("Cache-Control", ""))

if __name__ == "__main__":
    unittest.main()
