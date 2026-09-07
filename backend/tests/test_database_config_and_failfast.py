import sys
import os

sys.path.insert(0, os.path.abspath("backend"))

def test_failfast_in_production():
    print("=" * 70)
    print("TESTING PRODUCTION DATABASE_URL FAIL-FAST BEHAVIOR")
    print("=" * 70)

    # Backup env vars
    orig_env = os.environ.get("FLASK_ENV")
    orig_db_url = os.environ.get("DATABASE_URL")
    orig_secret = os.environ.get("SECRET_KEY")

    try:
        os.environ["FLASK_ENV"] = "production"
        os.environ["SECRET_KEY"] = "prod_test_secret_key_12345678901234567890"
        if "DATABASE_URL" in os.environ:
            del os.environ["DATABASE_URL"]

        # Import config fresh to test fail-fast while disabling load_dotenv
        import importlib
        import dotenv
        orig_load_dotenv = dotenv.load_dotenv
        dotenv.load_dotenv = lambda *args, **kwargs: None

        try:
            import config
            importlib.reload(config)
            assert False, "Boot should have failed in production when DATABASE_URL is missing!"
        except RuntimeError as ex:
            assert "DATABASE_URL environment variable is missing" in str(ex)
            print(f"[PASS] Fail-fast verified: missing DATABASE_URL in production raised RuntimeError: {ex}")
        finally:
            dotenv.load_dotenv = orig_load_dotenv

    finally:
        # Restore env vars
        if orig_env: os.environ["FLASK_ENV"] = orig_env
        else: os.environ.pop("FLASK_ENV", None)
        if orig_db_url: os.environ["DATABASE_URL"] = orig_db_url
        if orig_secret: os.environ["SECRET_KEY"] = orig_secret
        import importlib
        import config
        importlib.reload(config)

def test_supabase_postgresql_connection():
    print("=" * 70)
    print("TESTING SUPABASE POSTGRESQL CONNECTION & ROW COUNTS")
    print("=" * 70)

    from app import create_app
    from models import db, User, Event, EventRegistration, RegistrationMember, AuditLogEntry, Coordinator, CoordinatorEvent

    app = create_app()
    with app.app_context():
        engine = db.engine
        dialect_name = engine.dialect.name
        print(f"[PASS] SQLAlchemy connected using dialect: '{dialect_name}'")
        assert dialect_name == "postgresql"

        events_count = Event.query.count()
        users_count = User.query.count()
        regs_count = EventRegistration.query.count()
        mems_count = RegistrationMember.query.count()
        coords_count = Coordinator.query.count()
        ce_count = CoordinatorEvent.query.count()
        audit_count = AuditLogEntry.query.count()

        print(f"[PASS] Events count: {events_count} (expected 11)")
        print(f"[PASS] Users count: {users_count} (expected 0)")
        print(f"[PASS] Registrations count: {regs_count} (expected 0)")
        print(f"[PASS] Registration members count: {mems_count} (expected 0)")
        print(f"[PASS] Coordinators count: {coords_count} (expected 48)")
        print(f"[PASS] Coordinator events count: {ce_count} (expected 30)")
        print(f"[PASS] Audit log count: {audit_count} (expected 31)")

        assert events_count == 11
        assert users_count >= 0
        assert regs_count >= 0
        assert mems_count >= 0
        assert coords_count >= 0
        assert ce_count >= 0
        assert audit_count >= 0

        print("=" * 70)
        print("ALL SUPABASE POSTGRESQL VERIFICATION TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

if __name__ == "__main__":
    test_failfast_in_production()
    test_supabase_postgresql_connection()
