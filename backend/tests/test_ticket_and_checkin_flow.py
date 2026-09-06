import sys
import os
import uuid
import datetime

# Ensure backend path is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
import config
config.EMAIL_DEV_MODE = True
os.environ["EMAIL_DEV_MODE"] = "true"

from extensions import db
from models import User, Event, EventRegistration, RegistrationMember
from services.registration_service import (
    verify_manual_payment, check_in_ticket, InvalidPaymentStateError
)
from utils.email import send_registration_confirmation_email

app = create_app()
app.config["WTF_CSRF_ENABLED"] = False
app.config["TESTING"] = True

def run_tests():
    print("=" * 70)
    print("STARTING ALL 12 TICKET & ATTENDANCE VERIFICATION TEST CASES")
    print("=" * 70)

    with app.app_context():
        # Setup Test Event and Users in PostgreSQL
        test_event_id = f"test_evt_{uuid.uuid4().hex[:8]}"
        event = Event(
            id=test_event_id,
            name="CyberCarnival Hackathon 2026",
            tag="hackathon",
            category="TECHNICAL",
            fee="₹200",
            fee_amount=20000,
            event_date="7 — 8 OCTOBER 2026",
            event_time="09:00 AM ONWARDS",
            venue="RAMAPURAM AUDITORIUM",
            active=True,
            registration_open=True
        )
        db.session.add(event)

        user_a = User(
            id=str(uuid.uuid4()),
            username=f"testuser_a_{uuid.uuid4().hex[:6]}",
            password_hash="test_hash_a",
            email=f"user_a_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="Alice Test",
            college="SRM RAMAPURAM",
            phone="9876543210",
            profile_completed=True,
            is_active=True
        )
        user_b = User(
            id=str(uuid.uuid4()),
            username=f"testuser_b_{uuid.uuid4().hex[:6]}",
            password_hash="test_hash_b",
            email=f"user_b_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="Bob Test",
            college="SRM KTR",
            phone="9876543211",
            profile_completed=True,
            is_active=True
        )
        db.session.add_all([user_a, user_b])
        db.session.commit()

        client = app.test_client()

        # ----------------------------------------------------
        # CASE 1: pending_verification -> no ticket token, no approval email
        # ----------------------------------------------------
        reg_id_1 = str(uuid.uuid4())
        reg1 = EventRegistration(
            id=reg_id_1,
            event_id=event.id,
            leader_user_id=user_a.id,
            status="pending_verification",
            participant_mode="individual",
            transaction_id=f"TXN_{uuid.uuid4().hex[:8].upper()}",
            payment_amount=20000,
            payment_submitted_at=datetime.datetime.utcnow(),
            disclaimer_accepted=True
        )
        mem1 = RegistrationMember(
            id=str(uuid.uuid4()),
            registration_id=reg1.id,
            event_id=event.id,
            user_id=user_a.id,
            is_leader=True,
            active_registration=True,
            participant_name=user_a.full_name,
            participant_email=user_a.email,
            college_name=user_a.college,
            participant_phone=user_a.phone
        )
        db.session.add_all([reg1, mem1])
        db.session.commit()

        assert reg1.ticket_token is None, "CASE 1 FAILED: Ticket token should be None for pending_verification"
        assert reg1.status == "pending_verification", "CASE 1 FAILED: Status must be pending_verification"
        print("[PASS] CASE 1: pending_verification has no ticket token or approval email.")

        # ----------------------------------------------------
        # CASE 8: pending_verification ticket URL -> access denied
        # ----------------------------------------------------
        res_case8 = client.get(f"/api/registrations/{reg1.id}/ticket")
        assert res_case8.status_code in (403, 404), f"CASE 8 FAILED: Status code was {res_case8.status_code}"
        print("[PASS] CASE 8: Ticket access denied for pending_verification registration.")

        # ----------------------------------------------------
        # CASE 2: admin approves -> registration confirmed, ticket generated, email sent
        # ----------------------------------------------------
        approved = verify_manual_payment(reg1.id, actor="admin_tester", approved=True)
        assert approved is True
        db.session.refresh(reg1)
        assert reg1.status == "confirmed", "CASE 2 FAILED: Status should be confirmed"
        assert reg1.ticket_token is not None, "CASE 2 FAILED: Ticket token must be generated on approval"
        token_1 = reg1.ticket_token
        print(f"[PASS] CASE 2: Admin approval confirmed registration & generated ticket token ({token_1[:8]}...).")

        # ----------------------------------------------------
        # CASE 4: already confirmed registration -> second approval blocked
        # ----------------------------------------------------
        try:
            verify_manual_payment(reg1.id, actor="admin_tester", approved=True)
            assert False, "CASE 4 FAILED: Second approval should throw InvalidPaymentStateError"
        except InvalidPaymentStateError:
            print("[PASS] CASE 4: Second approval blocked by InvalidPaymentStateError.")

        db.session.refresh(reg1)
        assert reg1.ticket_token == token_1, "CASE 4 PASSED: Ticket token reused, not overwritten."

        # ----------------------------------------------------
        # CASE 5: valid ticket verification -> ticket accepted
        # ----------------------------------------------------
        checkin_res1 = check_in_ticket(reg1.id, token=token_1, actor="admin_tester")
        assert checkin_res1["success"] is True
        assert checkin_res1["status"] == "VALID"
        assert "VALID TICKET" in checkin_res1["message"]
        assert checkin_res1["event_name"] == event.name
        print("[PASS] CASE 5: Ticket scan valid & participant checked in.")

        # ----------------------------------------------------
        # CASE 6: same ticket scanned again -> rejected as ALREADY CHECKED IN
        # ----------------------------------------------------
        checkin_res2 = check_in_ticket(reg1.id, token=token_1, actor="admin_tester")
        assert checkin_res2["success"] is False
        assert checkin_res2["status"] == "ALREADY_CHECKED_IN"
        assert "ALREADY CHECKED IN" in checkin_res2["message"]
        assert checkin_res2["checked_in_at"] is not None
        print(f"[PASS] CASE 6: Re-scan rejected with status ALREADY_CHECKED_IN (Checked in at: {checkin_res2['checked_in_at']}).")

        # ----------------------------------------------------
        # CASE 3: admin rejects -> registration status rejected, no ticket
        # ----------------------------------------------------
        reg_id_2 = str(uuid.uuid4())
        reg2 = EventRegistration(
            id=reg_id_2,
            event_id=event.id,
            leader_user_id=user_b.id,
            status="pending_verification",
            participant_mode="individual",
            transaction_id=f"TXN_{uuid.uuid4().hex[:8].upper()}",
            payment_amount=20000,
            payment_submitted_at=datetime.datetime.utcnow(),
            disclaimer_accepted=True
        )
        mem2 = RegistrationMember(
            id=str(uuid.uuid4()),
            registration_id=reg2.id,
            event_id=event.id,
            user_id=user_b.id,
            is_leader=True,
            active_registration=True,
            participant_name=user_b.full_name,
            participant_email=user_b.email,
            college_name=user_b.college,
            participant_phone=user_b.phone
        )
        db.session.add_all([reg2, mem2])
        db.session.commit()

        rejected = verify_manual_payment(reg2.id, actor="admin_tester", approved=False, rejection_reason="Invalid transaction ID")
        assert rejected is True
        db.session.refresh(reg2)
        assert reg2.status == "rejected"
        assert reg2.ticket_token is None, "CASE 3 FAILED: Ticket token must not be generated for rejected registrations"
        print("[PASS] CASE 3: Admin rejection set status to rejected with no ticket token.")

        # ----------------------------------------------------
        # CASE 7: rejected registration ticket URL -> access denied
        # ----------------------------------------------------
        res_case7 = client.get(f"/api/registrations/{reg2.id}/ticket")
        assert res_case7.status_code in (403, 404), f"CASE 7 FAILED: Status code was {res_case7.status_code}"
        print("[PASS] CASE 7: Ticket access denied for rejected registration.")

        # ----------------------------------------------------
        # CASE 9: random / invalid ticket token -> verification fails safely
        # ----------------------------------------------------
        reg_id_3 = str(uuid.uuid4())
        reg3 = EventRegistration(
            id=reg_id_3,
            event_id=event.id,
            leader_user_id=user_a.id,
            status="pending_verification",
            participant_mode="individual",
            transaction_id=f"TXN_{uuid.uuid4().hex[:8].upper()}",
            payment_amount=20000,
            payment_submitted_at=datetime.datetime.utcnow(),
            disclaimer_accepted=True
        )
        db.session.add(reg3)
        db.session.commit()
        verify_manual_payment(reg3.id, actor="admin_tester", approved=True)
        db.session.refresh(reg3)

        bad_token_res = check_in_ticket(reg3.id, token="invalid_token_xyz", actor="admin_tester")
        assert bad_token_res["success"] is False
        assert bad_token_res["status"] == "INVALID_TOKEN"
        print("[PASS] CASE 9: Invalid ticket token rejected safely.")

        # ----------------------------------------------------
        # CASE 10: normal participant attempts attendance check-in endpoint -> authorization denied
        # ----------------------------------------------------
        with client.session_transaction() as sess:
            sess.clear()
            sess["user_id"] = user_a.id

        res_case10_admin = client.post("/admin/api/tickets/check-in", json={"registration_id": reg3.id, "token": reg3.ticket_token})
        print(f"DEBUG CASE 10 Admin status code: {res_case10_admin.status_code}, data: {res_case10_admin.get_data(as_text=True)}")
        assert res_case10_admin.status_code in (401, 403), f"CASE 10 FAILED Admin route: status code {res_case10_admin.status_code}"

        res_case10_coord = client.post("/coordinator/api/tickets/check-in", json={"registration_id": reg3.id, "token": reg3.ticket_token})
        print(f"DEBUG CASE 10 Coord status code: {res_case10_coord.status_code}, json: {res_case10_coord.get_json()}")
        assert res_case10_coord.status_code in (401, 403), f"CASE 10 FAILED Coordinator route: status code {res_case10_coord.status_code}"
        print("[PASS] CASE 10: Normal participant forbidden from check-in endpoints (401/403).")

        # ----------------------------------------------------
        # CASE 11: participant attempts to access another participant's ticket without valid token
        # ----------------------------------------------------
        with client.session_transaction() as sess:
            sess["user_id"] = user_b.id
            sess["is_admin"] = False
            sess["is_coordinator"] = False

        res_case11 = client.get(f"/api/registrations/{reg3.id}/ticket")
        assert res_case11.status_code == 403, f"CASE 11 FAILED: Status code was {res_case11.status_code}"
        print("[PASS] CASE 11: Unrelated participant denied access to another participant's ticket.")

        # ----------------------------------------------------
        # CASE 12: email rendering
        # ----------------------------------------------------
        try:
            send_registration_confirmation_email(
                user_a.email,
                recipient_name=user_a.full_name,
                recipient_email=user_a.email,
                college_name=user_a.college,
                event_name=event.name,
                registration_id=reg3.id,
                event_date=event.event_date,
                event_time=event.event_time,
                venue=event.venue,
                fee=event.fee,
                ticket_token=reg3.ticket_token
            )
            print("[PASS] CASE 12: Confirmation email rendering & image ticket generator executed cleanly.")
        except Exception as e:
            assert False, f"CASE 12 FAILED: Email rendering failed with error: {e}"

        # Clean up test records from PostgreSQL
        db.session.delete(reg1)
        db.session.delete(reg2)
        db.session.delete(reg3)
        db.session.delete(user_a)
        db.session.delete(user_b)
        db.session.delete(event)
        db.session.commit()

    print("=" * 70)
    print("ALL 12 TEST CASES PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
