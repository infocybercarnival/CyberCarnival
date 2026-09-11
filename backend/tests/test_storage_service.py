import unittest
from unittest.mock import patch, MagicMock

import config
from services import storage_service, registration_service


class TestStorageService(unittest.TestCase):

    def test_is_supabase_storage_configured(self):
        with patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            self.assertTrue(storage_service.is_supabase_storage_configured())

        with patch.object(config, "SUPABASE_URL", ""):
            self.assertFalse(storage_service.is_supabase_storage_configured())

    def test_get_public_asset_url(self):
        with patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
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

        with patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
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

        with patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            signed_url = storage_service.get_signed_payment_proof_url("supabase:payment-proofs/u1/r1.png")
            self.assertEqual(signed_url, "https://xyz.supabase.co/storage/v1/object/sign/payment-proofs/u1/r1.png?token=abc")

    @patch("requests.delete")
    def test_delete_file_supabase(self, mock_delete):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_delete.return_value = mock_resp

        with patch.object(config, "SUPABASE_URL", "https://xyz.supabase.co"), \
             patch.object(config, "SUPABASE_SERVICE_ROLE_KEY", "secret-key"):
            deleted = storage_service.delete_file("supabase:payment-proofs/u1/r1.png")
            self.assertTrue(deleted)
            mock_delete.assert_called_once()

    @patch("services.registration_service.get_registration")
    @patch("services.registration_service.db.session")
    @patch("services.storage_service.delete_file")
    def test_delete_registration_cleans_up_supabase_storage(self, mock_delete_file, mock_db_session, mock_get_reg):
        mock_reg = MagicMock()
        mock_reg.payment_proof_filename = "supabase:payment-proofs/user1/reg1_12345.png"
        mock_get_reg.return_value = mock_reg

        result = registration_service.delete_registration("reg-12345")
        self.assertTrue(result)
        mock_db_session.delete.assert_called_once_with(mock_reg)
        mock_db_session.commit.assert_called_once()
        mock_delete_file.assert_called_once_with("supabase:payment-proofs/user1/reg1_12345.png")

    def test_route_redirect_imports(self):
        from routes.registration import redirect as reg_redirect
        from routes.admin_api import redirect as admin_redirect
        self.assertIsNotNone(reg_redirect)
        self.assertIsNotNone(admin_redirect)


if __name__ == "__main__":
    unittest.main()
