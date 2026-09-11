import io
import unittest

from app import create_app
from extensions import db
from models import User, Event, EventRegistration
from services import registration_service


class TestComprehensiveSecurityAndUploads(unittest.TestCase):

    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.app.config['WTF_CSRF_ENABLED'] = False
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()
            self.user = User(
                username="teststudent",
                email="student@example.com",
                cybercarnival_token="CC2026TEST1",
                profile_completed=True,
                is_active=True
            )
            self.event = Event(
                id="evt-100",
                name="Test CTF Event",
                fee_amount=10000,
                max_teams=10,
                active=True,
                registration_open=True
            )
            db.session.add(self.user)
            db.session.add(self.event)
            db.session.commit()

            self.user_id = self.user.id
            self.event_id = self.event.id

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    # TC-001: Valid payment proof upload
    def test_tc001_payment_proof_valid_upload(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})
            reg_id = reg.id

        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = (io.BytesIO(png_data), "proof.png")

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        res = self.client.post(
            f"/api/registrations/{reg_id}/payment",
            data={
                "event_id": self.event_id,
                "transaction_id": "UPI12345678",
                "disclaimer_accepted": "true",
                "payment_proof": file
            },
            content_type="multipart/form-data"
        )
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            updated_reg = db.session.get(EventRegistration, reg_id)
            self.assertEqual(updated_reg.status, "pending_verification")
            self.assertTrue(bool(updated_reg.payment_proof_filename))

    # TC-002: Payment proof oversized upload > 500 KB
    def test_tc002_payment_proof_oversized_upload(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})
            reg_id = reg.id

        oversized_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * (600 * 1024)
        file = (io.BytesIO(oversized_data), "proof.png")

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        res = self.client.post(
            f"/api/registrations/{reg_id}/payment",
            data={
                "event_id": self.event_id,
                "transaction_id": "UPI12345679",
                "disclaimer_accepted": "true",
                "payment_proof": file
            },
            content_type="multipart/form-data"
        )
        self.assertEqual(res.status_code, 413)
        self.assertIn("500 KB limit", res.get_json().get("error", ""))

    # TC-003: Invalid payment file rejection
    def test_tc003_invalid_payment_file_rejection(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})
            reg_id = reg.id

        fake_exe = b"MZ\x90\x00\x03\x00\x00\x00"
        file = (io.BytesIO(fake_exe), "malicious.exe")

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        res = self.client.post(
            f"/api/registrations/{reg_id}/payment",
            data={
                "event_id": self.event_id,
                "transaction_id": "UPI12345680",
                "disclaimer_accepted": "true",
                "payment_proof": file
            },
            content_type="multipart/form-data"
        )
        self.assertEqual(res.status_code, 422)

    # TC-004: Unauthorized payment proof access
    def test_tc004_unauthorized_payment_proof_access(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            reg, _ = registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})
            reg.payment_proof_filename = "user1/reg1.png"
            db.session.commit()
            reg_id = reg.id

            other_user = User(username="otherstudent", email="other@example.com", cybercarnival_token="CC2026TEST2")
            db.session.add(other_user)
            db.session.commit()
            other_id = other_user.id

        with self.client.session_transaction() as sess:
            sess["user_id"] = other_id

        res = self.client.get(f"/api/registrations/{reg_id}/payment-proof")
        self.assertEqual(res.status_code, 403)

    # TC-005: Student cannot access admin API
    def test_tc005_student_cannot_access_admin_api(self):
        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        res = self.client.get("/admin/api/summary")
        self.assertEqual(res.status_code, 401)

    # TC-006: Coordinator cannot access unauthorized event
    def test_tc006_coordinator_cannot_access_unauthorized_event(self):
        with self.client.session_transaction() as sess:
            sess["is_coordinator"] = True
            sess["coordinator_username"] = "coord1"
            sess["coordinator_event_id"] = "evt-100"

        res = self.client.get("/coordinator/api/events/evt-999/participants")
        self.assertEqual(res.status_code, 403)

    # TC-007: Duplicate registration prevention
    def test_tc007_duplicate_registration_prevention(self):
        with self.app.app_context():
            user = db.session.get(User, self.user_id)
            registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})

            with self.assertRaises(registration_service.DuplicateRegistrationError):
                registration_service.register_for_event(user, {"event_id": self.event_id, "participant_mode": "individual"})

    # TC-008: Registration capacity protection
    def test_tc008_registration_capacity_protection(self):
        with self.app.app_context():
            small_event = Event(id="evt-small", name="Small Event", fee_amount=1000, max_teams=1, active=True, registration_open=True)
            db.session.add(small_event)
            db.session.commit()

            user1 = db.session.get(User, self.user_id)
            registration_service.register_for_event(user1, {"event_id": "evt-small", "participant_mode": "individual"})

            user2 = User(username="user2", email="user2@example.com", cybercarnival_token="CC2026TEST3")
            db.session.add(user2)
            db.session.commit()

            with self.assertRaises(registration_service.EventFullError):
                registration_service.register_for_event(user2, {"event_id": "evt-small", "participant_mode": "individual"})

    # TC-009: Duplicate transaction ID handling
    def test_tc009_duplicate_transaction_id_handling(self):
        with self.app.app_context():
            evt2 = Event(id="evt-200", name="Event 2", fee_amount=5000, active=True, registration_open=True)
            db.session.add(evt2)
            user2 = User(username="user2", email="u2@example.com", cybercarnival_token="CC2026U2")
            db.session.add(user2)
            db.session.commit()

            u1 = db.session.get(User, self.user_id)
            r1, _ = registration_service.register_for_event(u1, {"event_id": self.event_id, "participant_mode": "individual"})
            r2, _ = registration_service.register_for_event(user2, {"event_id": "evt-200", "participant_mode": "individual"})

            f1 = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 10)
            f1.filename = "proof1.png"
            f2 = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 10)
            f2.filename = "proof2.png"

            registration_service.submit_payment_proof(r1.id, u1.id, self.event_id, "TXNDUP123456", f1, True)

            with self.assertRaises(registration_service.DuplicateTransactionError):
                registration_service.submit_payment_proof(r2.id, user2.id, "evt-200", "TXNDUP123456", f2, True)

    # TC-012: Unauthorized payment approval
    def test_tc012_unauthorized_payment_approval(self):
        with self.app.app_context():
            u1 = db.session.get(User, self.user_id)
            r1, _ = registration_service.register_for_event(u1, {"event_id": self.event_id, "participant_mode": "individual"})
            reg_id = r1.id

        with self.client.session_transaction() as sess:
            sess["user_id"] = self.user_id

        res = self.client.post(f"/admin/api/registrations/{reg_id}/verify", json={"approved": True})
        self.assertEqual(res.status_code, 401)


if __name__ == "__main__":
    unittest.main()
