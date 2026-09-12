import datetime
import os
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse
from sqlalchemy.engine import make_url

import config
from utils.logger import get_logger

logger = get_logger("backup_service")


class BackupError(Exception):
    """Base exception for database backup operations."""
    pass


class PgDumpNotFoundError(BackupError):
    """Raised when pg_dump binary is missing on the host system."""
    pass


class DatabaseConnectionConfigError(BackupError):
    """Raised when database URI is invalid or missing."""
    pass


class UnsupportedDatabaseTypeError(BackupError):
    """Raised when database dialect is not supported for native backup."""
    pass


class BackupExecutionError(BackupError):
    """Raised when backup command execution fails."""
    pass


def get_database_uri() -> str:
    uri = getattr(config, "SQLALCHEMY_DATABASE_URI", None) or os.environ.get("DATABASE_URL", "")
    if not uri:
        raise DatabaseConnectionConfigError("DATABASE_URL or SQLALCHEMY_DATABASE_URI is not configured.")
    return uri


def get_database_backend(db_uri: str) -> str:
    """Returns normalized database backend name ('postgresql', 'sqlite', etc.)."""
    try:
        url = make_url(db_uri)
        return url.get_backend_name()
    except Exception as exc:
        if db_uri.startswith("sqlite"):
            return "sqlite"
        if db_uri.startswith("postgres"):
            return "postgresql"
        raise DatabaseConnectionConfigError(f"Failed to parse database connection URI: {exc}") from exc


def generate_database_backup() -> tuple[str, str]:
    """
    Generates a timestamped native PostgreSQL dump (using pg_dump without shell=True)
    or an explicitly labeled SQLite SQL dump for local dev/test mode.

    PostgreSQL failures NEVER fall back to SQLite.

    Returns:
        tuple[str, str]: (absolute_temporary_file_path, downloadable_filename)
    """
    db_uri = get_database_uri()
    backend_name = get_database_backend(db_uri)
    timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d_%H%M%S")

    if backend_name == "postgresql":
        filename = f"cybercarnival_backup_{timestamp}.sql"
    elif backend_name == "sqlite":
        # Distinct, dev/test-only filename so it can NEVER be mistaken for a PostgreSQL migration backup
        filename = f"cybercarnival_sqlite_backup_{timestamp}.sql"
    else:
        raise UnsupportedDatabaseTypeError(
            f"Database engine '{backend_name}' is not supported for backup export."
        )

    temp_file = tempfile.NamedTemporaryFile(
        suffix=".sql",
        prefix=f"{filename.replace('.sql', '')}_",
        delete=False
    )
    temp_path = temp_file.name
    temp_file.close()

    try:
        if backend_name == "postgresql":
            # PostgreSQL Native Backup via pg_dump. Fails hard if pg_dump missing or errors out.
            # MUST NEVER silently fall back to SQLite!
            _generate_postgres_backup(db_uri, temp_path)
            return temp_path, filename

        elif backend_name == "sqlite":
            _generate_sqlite_backup(db_uri, temp_path)
            return temp_path, filename

    except Exception:
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception:
                pass
        raise

    raise UnsupportedDatabaseTypeError(f"Unsupported database engine '{backend_name}'.")


def _generate_sqlite_backup(db_uri: str, temp_path: str) -> None:
    from extensions import db

    # Remove prefix sqlite:/// or sqlite://
    clean_uri = db_uri.replace("sqlite:///", "").replace("sqlite://", "")
    db_path = clean_uri.split("?")[0] if "?" in clean_uri else clean_uri

    if not db_path or db_path == ":memory:":
        # In-memory SQLite connection dump
        conn = db.session.connection().connection
        with open(temp_path, "w", encoding="utf-8") as f_out:
            for line in conn.iterdump():
                f_out.write(f"{line}\n")
    else:
        # File-based SQLite dump
        conn = sqlite3.connect(db_path)
        try:
            with open(temp_path, "w", encoding="utf-8") as f_out:
                for line in conn.iterdump():
                    f_out.write(f"{line}\n")
        finally:
            conn.close()


def _generate_postgres_backup(db_uri: str, temp_path: str) -> None:
    pg_dump_bin = shutil.which("pg_dump")
    if not pg_dump_bin:
        logger.error("pg_dump binary not found in system PATH")
        raise PgDumpNotFoundError("PostgreSQL pg_dump utility is not installed or not in PATH on the server.")

    url = make_url(db_uri)

    host = url.host or "localhost"
    port = str(url.port or 5432)
    user = url.username or "postgres"
    password = url.password or ""
    dbname = url.database or ""

    if not dbname:
        raise DatabaseConnectionConfigError("PostgreSQL database name could not be parsed from database URI.")

    # Secure subprocess invocation: shell=True is NEVER used
    cmd = [
        pg_dump_bin,
        "-h", host,
        "-p", port,
        "-U", user,
        "-d", dbname,
        "-F", "p",  # plain SQL text format
        "--no-owner",
        "--no-acl",
    ]

    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    try:
        with open(temp_path, "wb") as f_out:
            result = subprocess.run(
                cmd,
                stdout=f_out,
                stderr=subprocess.PIPE,
                env=env,
                timeout=120,
                check=False,
            )

        if result.returncode != 0:
            error_msg = result.stderr.decode("utf-8", errors="replace") if result.stderr else "Unknown error"
            logger.error("pg_dump process failed with returncode %d: %s", result.returncode, error_msg)
            raise BackupExecutionError("PostgreSQL database dump (pg_dump) failed to execute successfully.")

    except subprocess.TimeoutExpired:
        logger.error("pg_dump execution timed out after 120 seconds")
        raise BackupExecutionError("Database backup operation timed out.")
    except BackupError:
        raise
    except Exception as exc:
        logger.exception("Unexpected error during PostgreSQL database backup execution")
        raise BackupExecutionError("An error occurred while creating the PostgreSQL database backup.") from exc
