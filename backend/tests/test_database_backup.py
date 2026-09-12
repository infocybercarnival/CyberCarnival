import os
import sys
import unittest
import subprocess
from unittest.mock import patch, MagicMock, ANY

# Ensure backend path is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
from extensions import db
import services.backup_service as backup_service
from services.backup_service import (
    PgDumpNotFoundError,
    DatabaseConnectionConfigError,
    BackupExecutionError,
    UnsupportedDatabaseTypeError,
    generate_database_backup,
    _generate_postgres_backup,
)

app = create_app()
app.config["WTF_CSRF_ENABLED"] = False
app.config["TESTING"] = True


class DatabaseBackupTestCase(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        with app.app_context():
            db.create_all()

    def tearDown(self):
        with app.app_context():
            db.session.remove()

    def test_gitignore_does_not_ignore_legitimate_sql_files(self):
        """Test that .gitignore rules do NOT globally ignore all *.sql files so schema files stay tracked."""
        repo_root = os.path.abspath(os.path.join(backend_dir, ".."))
        gitignore_path = os.path.join(repo_root, ".gitignore")
        self.assertTrue(os.path.exists(gitignore_path), ".gitignore file should exist in repo root")

        with open(gitignore_path, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f.readlines()]

        # Ensure dangerous global *.sql is NOT present
        self.assertNotIn("*.sql", lines, "Dangerous global '*.sql' rule must NOT be in .gitignore")

        # Ensure targeted backup rules are present
        self.assertIn("cybercarnival_backup_*.sql", lines)
        self.assertIn("cybercarnival_sqlite_backup_*.sql", lines)
        self.assertIn("*.dump", lines)

        # Verify real files schema and seed exist and are intact
        schema_path = os.path.join(backend_dir, "schema_postgres_final.sql")
        seed_path = os.path.join(backend_dir, "seed_production_events.sql")
        self.assertTrue(os.path.exists(schema_path), "schema_postgres_final.sql must exist")
        self.assertTrue(os.path.exists(seed_path), "seed_production_events.sql must exist")

    def test_unauthenticated_access_blocked(self):
        """Test that unauthenticated requests to /admin/api/database-backup return 401."""
        response = self.client.get("/admin/api/database-backup")
        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertIn("error", data)
        self.assertEqual(data["error"], "authentication required")

    def test_non_admin_user_blocked(self):
        """Test that participant users without admin session are blocked (401)."""
        with self.client.session_transaction() as sess:
            sess["user_id"] = "participant_user_123"
            # Explicitly no admin_username
        response = self.client.get("/admin/api/database-backup")
        self.assertEqual(response.status_code, 401)

    @patch("shutil.which", return_value="/usr/bin/pg_dump")
    @patch("subprocess.run")
    def test_authorized_admin_backup_success(self, mock_subprocess, mock_which):
        """Test authorized admin can successfully request a PostgreSQL database backup."""
        def fake_subprocess_run(cmd, stdout=None, stderr=None, env=None, timeout=None, check=False):
            if stdout:
                stdout.write(b"-- PostgreSQL database dump\nCREATE TABLE test (id INT);\n")
            mock_proc = MagicMock()
            mock_proc.returncode = 0
            mock_proc.stderr = b""
            return mock_proc

        mock_subprocess.side_effect = fake_subprocess_run

        with patch("config.SQLALCHEMY_DATABASE_URI", "postgresql://admin_user:secret_pass_99@127.0.0.1:5432/cybercarnival_db"):
            with self.client.session_transaction() as sess:
                sess["admin_username"] = "superadmin"

            response = self.client.get("/admin/api/database-backup")
            self.assertEqual(response.status_code, 200)

            # Check Headers
            self.assertIn("Content-Disposition", response.headers)
            self.assertTrue(response.headers["Content-Disposition"].startswith("attachment;"))
            self.assertIn("cybercarnival_backup_", response.headers["Content-Disposition"])
            self.assertNotIn("sqlite", response.headers["Content-Disposition"].lower())
            self.assertIn(".sql", response.headers["Content-Disposition"])
            self.assertIn("no-store", response.headers.get("Cache-Control", ""))

            # Check body content
            self.assertIn(b"CREATE TABLE test", response.data)

            # Verify subprocess call security: shell=True was NEVER passed
            self.assertTrue(mock_subprocess.called)
            kwargs = mock_subprocess.call_args[1]
            self.assertFalse(kwargs.get("shell", False))

            cmd = mock_subprocess.call_args[0][0]
            self.assertIsInstance(cmd, list)
            self.assertEqual(cmd[0], "/usr/bin/pg_dump")
            self.assertIn("-h", cmd)
            self.assertIn("127.0.0.1", cmd)
            self.assertIn("-U", cmd)
            self.assertIn("admin_user", cmd)

            # Verify password was passed safely in env dictionary
            env_passed = kwargs.get("env", {})
            self.assertEqual(env_passed.get("PGPASSWORD"), "secret_pass_99")

            # Verify password was NOT exposed in command args
            for arg in cmd:
                self.assertNotIn("secret_pass_99", arg)

    @patch("shutil.which", return_value=None)
    def test_missing_pg_dump_handled_without_fallback(self, mock_which):
        """Test missing pg_dump binary returns 503 error and does NOT silently fall back to SQLite."""
        with patch("config.SQLALCHEMY_DATABASE_URI", "postgresql://user:pass@localhost:5432/cybercarnival"):
            with self.client.session_transaction() as sess:
                sess["admin_username"] = "superadmin"

            with patch("services.backup_service._generate_sqlite_backup") as mock_sqlite_fallback:
                response = self.client.get("/admin/api/database-backup")
                self.assertEqual(response.status_code, 503)
                data = response.get_json()
                self.assertIn("error", data)
                self.assertIn("pg_dump", data["error"])
                # Ensure SQLite fallback was NEVER invoked
                self.assertFalse(mock_sqlite_fallback.called)

    @patch("shutil.which", return_value="/usr/bin/pg_dump")
    @patch("subprocess.run")
    def test_pg_dump_failure_never_falls_back_to_sqlite(self, mock_subprocess, mock_which):
        """Test pg_dump command failure returns 500 error cleanly and NEVER falls back to SQLite."""
        mock_proc = MagicMock()
        mock_proc.returncode = 1
        mock_proc.stderr = b"pg_dump: error: connection to server at localhost failed"
        mock_subprocess.return_value = mock_proc

        with patch("config.SQLALCHEMY_DATABASE_URI", "postgresql://admin_user:wrong_pass@localhost:5432/cybercarnival"):
            with self.client.session_transaction() as sess:
                sess["admin_username"] = "superadmin"

            with patch("services.backup_service._generate_sqlite_backup") as mock_sqlite_fallback:
                response = self.client.get("/admin/api/database-backup")
                self.assertEqual(response.status_code, 500)
                data = response.get_json()
                self.assertIn("error", data)
                self.assertNotIn("wrong_pass", data["error"])
                self.assertNotIn("localhost", data["error"])
                # Ensure SQLite fallback was NEVER invoked
                self.assertFalse(mock_sqlite_fallback.called)

    def test_credentials_not_exposed_in_filename_or_response(self):
        """Test that database credentials are never leaked in filenames or responses."""
        sensitive_pass = "super_secret_db_password_XYZ999"
        db_uri = f"postgresql://dbadmin:{sensitive_pass}@db.cybercarnival.org:5432/prod_db"

        with patch("shutil.which", return_value="/usr/bin/pg_dump"):
            with patch("subprocess.run") as mock_sub:
                def fake_run(cmd, stdout=None, **kwargs):
                    if stdout:
                        stdout.write(b"-- Dump file")
                    m = MagicMock()
                    m.returncode = 0
                    return m
                mock_sub.side_effect = fake_run

                with patch("config.SQLALCHEMY_DATABASE_URI", db_uri):
                    with self.client.session_transaction() as sess:
                        sess["admin_username"] = "superadmin"

                    res = self.client.get("/admin/api/database-backup")
                    self.assertEqual(res.status_code, 200)
                    cd = res.headers.get("Content-Disposition", "")
                    self.assertNotIn(sensitive_pass, cd)
                    self.assertNotIn(sensitive_pass, str(res.data))

    def test_temp_file_cleaned_up_after_response(self):
        """Test that the temporary database backup file is deleted after HTTP response."""
        with self.client.session_transaction() as sess:
            sess["admin_username"] = "superadmin"

        with patch("config.SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"):
            res = self.client.get("/admin/api/database-backup")
            self.assertEqual(res.status_code, 200)

            # Extract filename from header
            cd = res.headers.get("Content-Disposition", "")
            self.assertIn("cybercarnival_sqlite_backup_", cd)

    def test_sqlite_dev_backup_distinct_filename(self):
        """Test SQLite dev/test backup uses distinct filename prefix (cybercarnival_sqlite_backup_)."""
        with app.app_context():
            with patch("config.SQLALCHEMY_DATABASE_URI", "sqlite:///:memory:"):
                temp_path, filename = generate_database_backup()
                self.assertTrue(os.path.exists(temp_path))
                self.assertTrue(filename.startswith("cybercarnival_sqlite_backup_"))
                self.assertTrue(filename.endswith(".sql"))
                os.remove(temp_path)


if __name__ == "__main__":
    unittest.main()
