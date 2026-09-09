import sys
from app import app
from extensions import db
from models import User, Event, EventRegistration, RegistrationMember
from services import user_service

def test_auth_and_user_model():
    print("=== STARTING AUTH & DATABASE VERIFICATION ===")
    with app.app_context():
        # 1. Verify Google user creation in PostgreSQL / SQLAlchemy
        test_email = "test_user_pg@example.com"
        test_google_sub = "google_sub_123456789"
        test_name = "Postgres Test User"

        # Ensure clean state for test email
        existing = user_service.get_user_by_email(test_email)
        if existing:
            db.session.delete(existing)
            db.session.commit()

        user1 = user_service.get_or_create_google_user(
            email=test_email,
            google_sub=test_google_sub,
            full_name=test_name,
        )

        assert user1.id is not None, "User ID should be generated"
        assert user1.email == test_email, "Email should match"
        assert user1.google_sub == test_google_sub, "Google Sub should match"
        assert user1.auth_provider == "google", "Auth provider should be google"
        print("[OK] New Google OAuth user created successfully:", user1.id)

        # 2. Verify returning Google user (duplicate prevention)
        user2 = user_service.get_or_create_google_user(
            email=test_email,
            google_sub=test_google_sub,
            full_name=test_name,
        )

        assert user1.id == user2.id, "Duplicate user must NOT be created for same Google identity"
        print("[OK] Duplicate prevention verified: Same Google account returned existing user ID")

        # 3. Verify public API representation security (no password hash returned)
        pub_dict = user1.to_public_dict()
        assert "password_hash" not in pub_dict, "password_hash must NEVER be exposed in public dict"
        assert "google_sub" not in pub_dict, "google_sub should not be in public user dict"
        assert pub_dict["email"] == test_email
        print("[OK] API Security verified: Sensitive fields excluded from public user payload")

        # 4. Verify My Events query with authenticated user identity
        registrations = (
            EventRegistration.query.join(RegistrationMember, EventRegistration.id == RegistrationMember.registration_id)
            .filter(RegistrationMember.user_id == user1.id, EventRegistration.status == "confirmed")
            .all()
        )
        assert isinstance(registrations, list)
        print(f"[OK] My Events query executed successfully for user identity ({len(registrations)} registrations found)")

        # Cleanup test user
        db.session.delete(user1)
        db.session.commit()
        print("[OK] Test user cleaned up cleanly")

    print("=== ALL AUTH & DATABASE VERIFICATION CHECKS PASSED ===")

if __name__ == "__main__":
    test_auth_and_user_model()
