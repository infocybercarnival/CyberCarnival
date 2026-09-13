import io
import os
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

import config
from app import create_app
from extensions import db
from models import User, Event, EventRegistration, Coordinator
from services import storage_service, registration_service


class TestStorageService(unittest.TestCase):

    def setUp(self):
        self.app = create_app()
        self.app.config["TESTING"] = True
        self.app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{config.DATA_DIR / 'test_storage_service.db'}"
        self.client = self.app.test_client()

        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        with self.app.app_context():
            db.session.remove()
            db.drop_all()
        db_file = config.DATA_DIR / 'test_storage_service.db'
        if db_file.exists():
            try:
                db_file.unlink()
            except OSError:
                pass

    def test_is_supabase_storage_configured(self):
        with patch.object(config, "STORAGE_BACKEND", "supabase"), \
             patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            self.assertTrue(storage_service.is_supabase_storage_configured())

        with patch.object(config, "SUPABASE_URL", ""):
            self.assertFalse(storage_service.is_supabase_storage_configured())

        with patch.object(config, "STORAGE_BACKEND", "local"):
            self.assertFalse(storage_service.is_supabase_storage_configured())

    def test_get_public_asset_url(self):
        with patch.object(config, "STORAGE_BACKEND", "supabase"), \
             patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            url = storage_service.get_public_asset_url("supabase:event-assets/posters/demo.jpg")
            self.assertEqual(url, "https://xyz.supabase.co/storage/v1/object/public/event-assets/posters/demo.jpg")

        raw_url = "https://cdn.example.com/poster.jpg"
        self.assertEqual(storage_service.get_public_asset_url(raw_url), raw_url)
        self.assertIsNone(storage_service.get_public_asset_url(""))

    @patch("requests.post")
    def test_upload_to_supabase_success(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_post.return_value = mock_resp

        with patch.object(config, "STORAGE_BACKEND", "supabase"), \
             patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            ok = storage_service.upload_to_supabase("payment-proofs", "user1/reg1.png", b"testbytes", "image/png")
            self.assertTrue(ok)
            mock_post.assert_called_once()

    @patch("requests.post")
    def test_get_signed_payment_proof_url(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"signedURL": "/storage/v1/object/sign/payment-proofs/u1/r1.png?token=abc"}
        mock_post.return_value = mock_resp

        with patch.object(config, "STORAGE_BACKEND", "supabase"), \
             patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            signed_url = storage_service.get_signed_payment_proof_url("supabase:payment-proofs/u1/r1.png")
            self.assertEqual(signed_url, "https://xyz.supabase.co/storage/v1/object/sign/payment-proofs/u1/r1.png?token=abc")

    @patch("requests.delete")
    def test_delete_file_supabase(self, mock_delete):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_delete.return_value = mock_resp

        with patch.object(config, "STORAGE_BACKEND", "supabase"), \
             patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            deleted = storage_service.delete_file("supabase:payment-proofs/u1/r1.png")
            self.assertTrue(deleted)
            mock_delete.assert_called_once()

    def test_local_payment_proof_upload_and_db_persistence(self):
        """Verify uploading payment proof via API saves file under PAYMENT_PROOF_DIR and updates DB payment_proof_path."""
        test_file_path = None
        with self.app.app_context():
            user = User(username="proof_user", email="proof@example.com", password_hash="hashed_pw", cybercarnival_token="CCPROOF01")
            event = Event(id="evt-proof-101", name="Proof Event", category="Gaming", fee_amount=5000)
            db.session.add_all([user, event])
            db.session.commit()

            reg, _ = registration_service.register_for_event(user, {"event_id": event.id, "participant_mode": "individual"})
            user_id = user.id
            reg_id = reg.id

        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        file = (io.BytesIO(png_bytes), "my_screenshot.png")

        with self.client.session_transaction() as sess:
            sess["user_id"] = user_id

        res = self.client.post(
            f"/api/registrations/{reg_id}/payment",
            data={
                "event_id": "evt-proof-101",
                "transaction_id": "TXNPROOF9999",
                "disclaimer_accepted": "true",
                "payment_proof": file
            },
            content_type="multipart/form-data"
        )
        self.assertEqual(res.status_code, 200)

        with self.app.app_context():
            updated_reg = db.session.get(EventRegistration, reg_id)
            self.assertIsNotNone(updated_reg.payment_proof_path)
            self.assertIsNotNone(updated_reg.payment_proof_filename)
            self.assertEqual(updated_reg.payment_proof_path, updated_reg.payment_proof_filename)

            saved_file_path = config.PAYMENT_PROOF_DIR / updated_reg.payment_proof_filename
            test_file_path = saved_file_path
            self.assertTrue(saved_file_path.exists(), f"File should be created physically at {saved_file_path}")
            self.assertEqual(saved_file_path.read_bytes(), png_bytes)

        # Cleanup created test file
        if test_file_path and test_file_path.exists():
            try:
                test_file_path.unlink()
            except OSError:
                pass

    def test_payment_proof_access_authorization(self):
        """Verify unauthorized users receive 401/403 when trying to access payment proof, while authorized owners can view it."""
        test_file_path = None
        with self.app.app_context():
            owner = User(username="owner_user", email="owner@example.com", password_hash="hashed_pw", cybercarnival_token="CCOWNER01")
            other_user = User(username="stranger_user", email="stranger@example.com", password_hash="hashed_pw", cybercarnival_token="CCSTRANGER01")
            event = Event(id="evt-access-102", name="Access Event", category="Gaming", fee_amount=5000)
            db.session.add_all([owner, other_user, event])
            db.session.commit()

            reg, _ = registration_service.register_for_event(owner, {"event_id": event.id, "participant_mode": "individual"})
            reg.payment_proof_filename = "test_auth_proof.png"
            reg.payment_proof_path = "test_auth_proof.png"
            reg.status = "pending_verification"
            db.session.commit()

            owner_id = owner.id
            other_user_id = other_user.id
            reg_id = reg.id

            test_file_path = config.PAYMENT_PROOF_DIR / "test_auth_proof.png"
            test_file_path.write_bytes(b"\x89PNG\r\n\x1a\nfake_image_bytes")

        # 1. Unauthenticated request -> 401
        res_unauth = self.client.get(f"/api/registrations/{reg_id}/payment-proof")
        self.assertEqual(res_unauth.status_code, 401)

        # 2. Unauthorized third-party user request -> 403
        with self.client.session_transaction() as sess:
            sess["user_id"] = other_user_id

        res_forbidden = self.client.get(f"/api/registrations/{reg_id}/payment-proof")
        self.assertEqual(res_forbidden.status_code, 403)

        # 3. Authorized owner user request -> 200 OK
        with self.client.session_transaction() as sess:
            sess["user_id"] = owner_id

        res_ok = self.client.get(f"/api/registrations/{reg_id}/payment-proof")
        self.assertEqual(res_ok.status_code, 200)

        # Clean up test file
        if test_file_path and test_file_path.exists():
            try:
                test_file_path.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    unittest.main()
