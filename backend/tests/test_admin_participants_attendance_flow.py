import sys
import os
import uuid
import datetime

# Ensure backend path is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
import config
config.EMAIL_DEV_MODE = True
os.environ["EMAIL_DEV_MODE"] = "true"

from extensions import db
from models import User, Event, EventRegistration, RegistrationMember
from services.registration_service import verify_manual_payment, check_in_ticket

app = create_app()
app.config["WTF_CSRF_ENABLED"] = False
app.config["TESTING"] = True

def run_tests():
    print("=" * 70)
    print("STARTING ALL 18 ADMIN PARTICIPANTS ATTENDANCE TEST CASES")
    print("=" * 70)

    with app.app_context():
        initial_p_count = db.session.query(RegistrationMember.user_id).join(EventRegistration, RegistrationMember.registration_id == EventRegistration.id).filter(EventRegistration.checked_in == True, EventRegistration.status == 'confirmed').distinct().count()

        # Setup Test Events in PostgreSQL
        evt1_id = f"test_evt1_{uuid.uuid4().hex[:6]}"
        evt2_id = f"test_evt2_{uuid.uuid4().hex[:8]}"

        event1 = Event(
            id=evt1_id,
            name="Capture The Flag 2026",
            tag="ctf",
            category="TECHNICAL",
            fee_amount=20000,
            event_date="7 OCT 2026",
            venue="AUDITORIUM A",
            active=True
        )
        event2 = Event(
            id=evt2_id,
            name="Paper Presentation 2026",
            tag="paper",
            category="TECHNICAL",
            fee_amount=15000,
            event_date="8 OCT 2026",
            venue="HALL B",
            active=True
        )
        db.session.add_all([event1, event2])

        # Create Test Users
        u_none = User(
            id=str(uuid.uuid4()),
            username=f"p_none_{uuid.uuid4().hex[:6]}",
            password_hash="hash",
            email=f"none_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="User NoReg",
            profile_completed=True,
            is_active=True
        )
        u_unattended = User(
            id=str(uuid.uuid4()),
            username=f"p_unatt_{uuid.uuid4().hex[:6]}",
            password_hash="hash",
            email=f"unatt_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="User Unattended",
            profile_completed=True,
            is_active=True
        )
        u_single = User(
            id=str(uuid.uuid4()),
            username=f"p_single_{uuid.uuid4().hex[:6]}",
            password_hash="hash",
            email=f"single_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="User SingleAttended",
            profile_completed=True,
            is_active=True
        )
        u_multi = User(
            id=str(uuid.uuid4()),
            username=f"p_multi_{uuid.uuid4().hex[:6]}",
            password_hash="hash",
            email=f"multi_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="User MultiAttended",
            profile_completed=True,
            is_active=True
        )
        u_partial = User(
            id=str(uuid.uuid4()),
            username=f"p_partial_{uuid.uuid4().hex[:6]}",
            password_hash="hash",
            email=f"partial_{uuid.uuid4().hex[:6]}@srmist.edu.in",
            cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}",
            full_name="User PartialAttended",
            profile_completed=True,
            is_active=True
        )
        db.session.add_all([u_none, u_unattended, u_single, u_multi, u_partial])
        db.session.commit()

        # Registrations setup
        # u_unattended -> confirmed for event1, but NO check-in
        reg_unatt = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_unattended.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_unatt = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_unatt.id, event_id=event1.id, user_id=u_unattended.id, is_leader=True)
        db.session.add_all([reg_unatt, mem_unatt])
        db.session.commit()
        verify_manual_payment(reg_unatt.id, actor="admin1", approved=True)

        # u_single -> confirmed for event1, checked-in
        reg_single = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_single.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_single = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_single.id, event_id=event1.id, user_id=u_single.id, is_leader=True)
        db.session.add_all([reg_single, mem_single])
        db.session.commit()
        verify_manual_payment(reg_single.id, actor="admin1", approved=True)
        db.session.refresh(reg_single)
        check_in_ticket(reg_single.id, token=reg_single.ticket_token, actor="verifier_admin_alpha")

        # u_multi -> confirmed for event1 & event2, checked in to BOTH
        reg_multi1 = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_multi.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_multi1 = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_multi1.id, event_id=event1.id, user_id=u_multi.id, is_leader=True)
        reg_multi2 = EventRegistration(
            id=str(uuid.uuid4()), event_id=event2.id, leader_user_id=u_multi.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_multi2 = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_multi2.id, event_id=event2.id, user_id=u_multi.id, is_leader=True)
        db.session.add_all([reg_multi1, mem_multi1, reg_multi2, mem_multi2])
        db.session.commit()
        verify_manual_payment(reg_multi1.id, actor="admin1", approved=True)
        verify_manual_payment(reg_multi2.id, actor="admin1", approved=True)
        db.session.refresh(reg_multi1); db.session.refresh(reg_multi2)
        check_in_ticket(reg_multi1.id, token=reg_multi1.ticket_token, actor="verifier_admin_alpha")
        check_in_ticket(reg_multi2.id, token=reg_multi2.ticket_token, actor="coordinator_beta")

        # u_partial -> registered for event1 & event2, checked in ONLY to event1
        reg_part1 = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_partial.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_part1 = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_part1.id, event_id=event1.id, user_id=u_partial.id, is_leader=True)
        reg_part2 = EventRegistration(
            id=str(uuid.uuid4()), event_id=event2.id, leader_user_id=u_partial.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_part2 = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_part2.id, event_id=event2.id, user_id=u_partial.id, is_leader=True)
        db.session.add_all([reg_part1, mem_part1, reg_part2, mem_part2])
        db.session.commit()
        verify_manual_payment(reg_part1.id, actor="admin1", approved=True)
        verify_manual_payment(reg_part2.id, actor="admin1", approved=True)
        db.session.refresh(reg_part1); db.session.refresh(reg_part2)
        check_in_ticket(reg_part1.id, token=reg_part1.ticket_token, actor="verifier_admin_alpha")

        client = app.test_client()

        # Set admin session
        with client.session_transaction() as sess:
            sess["admin_username"] = "admin_master"
            sess["is_admin"] = True

        # Fetch all participants from API
        res_all = client.get("/admin/api/participants")
        assert res_all.status_code == 200, f"API error: {res_all.status_code}"
        data_all = res_all.get_json()
        parts_list = data_all["participants"]
        parts_map = {p["id"]: p for p in parts_list}

        # ----------------------------------------------------
        # TEST 1: Participant with no registrations
        # ----------------------------------------------------
        p_none_info = parts_map[u_none.id]
        assert p_none_info["has_registrations"] is False
        assert p_none_info["overall_attendance"] == "NOT_ATTENDED"
        print("[PASS] TEST 1: Participant with no registrations is NOT_ATTENDED.")

        # ----------------------------------------------------
        # TEST 2: Participant with confirmed registration but no check-in
        # ----------------------------------------------------
        p_unatt_info = parts_map[u_unattended.id]
        assert p_unatt_info["has_registrations"] is True
        assert p_unatt_info["overall_attendance"] == "NOT_ATTENDED"
        assert p_unatt_info["attended_events_count"] == 0
        print("[PASS] TEST 2: Confirmed registration without check-in is NOT_ATTENDED.")

        # ----------------------------------------------------
        # TEST 3: Participant checked in to one event
        # ----------------------------------------------------
        p_single_info = parts_map[u_single.id]
        assert p_single_info["overall_attendance"] == "PRESENT"
        assert p_single_info["attended_events_count"] == 1
        assert p_single_info["attended_events"][0]["event_id"] == event1.id
        print("[PASS] TEST 3: Participant checked in to 1 event is PRESENT.")

        # ----------------------------------------------------
        # TEST 4: Participant checked in to multiple events
        # ----------------------------------------------------
        p_multi_info = parts_map[u_multi.id]
        assert p_multi_info["overall_attendance"] == "PRESENT"
        assert p_multi_info["attended_events_count"] == 2
        print("[PASS] TEST 4: Participant checked in to multiple events shows all attended events.")

        # ----------------------------------------------------
        # TEST 5: Participant registered for multiple events but attended only one
        # ----------------------------------------------------
        p_partial_info = parts_map[u_partial.id]
        assert p_partial_info["overall_attendance"] == "PRESENT"
        assert len(p_partial_info["attended_events"]) == 1
        assert len(p_partial_info["unattended_events"]) == 1
        assert p_partial_info["attended_events"][0]["event_id"] == event1.id
        assert p_partial_info["unattended_events"][0]["event_id"] == event2.id
        print("[PASS] TEST 5: Partial attendance lists attended vs unattended events correctly.")

        # ----------------------------------------------------
        # TEST 6: PRESENT filter
        # ----------------------------------------------------
        res_present = client.get("/admin/api/participants?attendance=present")
        data_present = res_present.get_json()["participants"]
        present_ids = {p["id"] for p in data_present}
        assert u_single.id in present_ids and u_multi.id in present_ids and u_partial.id in present_ids
        assert u_unattended.id not in present_ids and u_none.id not in present_ids
        print("[PASS] TEST 6: PRESENT filter returns only checked-in participants.")

        # ----------------------------------------------------
        # TEST 7: NOT ATTENDED filter
        # ----------------------------------------------------
        res_not_att = client.get("/admin/api/participants?attendance=not_attended")
        data_not_att = res_not_att.get_json()["participants"]
        not_att_ids = {p["id"] for p in data_not_att}
        assert u_unattended.id in not_att_ids and u_none.id not in not_att_ids
        assert u_single.id not in not_att_ids and u_multi.id not in not_att_ids
        print("[PASS] TEST 7: NOT ATTENDED filter returns only non-checked-in participants.")

        # ----------------------------------------------------
        # TEST 8: ALL filter
        # ----------------------------------------------------
        res_all_flt = client.get("/admin/api/participants?attendance=all")
        data_all_flt = res_all_flt.get_json()["participants"]
        all_ids = {p["id"] for p in data_all_flt}
        assert u_none.id in all_ids and u_single.id in all_ids and u_multi.id in all_ids
        print("[PASS] TEST 8: ALL filter returns all participants.")

        # ----------------------------------------------------
        # TEST 9: Event filter
        # ----------------------------------------------------
        res_evt2 = client.get(f"/admin/api/participants?event_id={event2.id}")
        data_evt2 = res_evt2.get_json()["participants"]
        evt2_ids = {p["id"] for p in data_evt2}
        assert u_multi.id in evt2_ids and u_partial.id in evt2_ids
        assert u_single.id not in evt2_ids
        print("[PASS] TEST 9: Event filter returns participants registered for Event 2.")

        # ----------------------------------------------------
        # TEST 10: PRESENT + Event filter combination
        # ----------------------------------------------------
        res_pres_evt2 = client.get(f"/admin/api/participants?attendance=present&event_id={event2.id}")
        data_pres_evt2 = res_pres_evt2.get_json()["participants"]
        pres_evt2_ids = {p["id"] for p in data_pres_evt2}
        assert u_multi.id in pres_evt2_ids
        # u_partial was registered for event2 but NOT checked in for event2!
        assert u_partial.id not in pres_evt2_ids
        print("[PASS] TEST 10: PRESENT + Event filter returns only users checked in for that event.")

        # ----------------------------------------------------
        # TEST 11: Rejected registration is not counted as attendance
        # ----------------------------------------------------
        reg_rej = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_none.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_rej = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_rej.id, event_id=event1.id, user_id=u_none.id, is_leader=True)
        db.session.add_all([reg_rej, mem_rej])
        db.session.commit()
        verify_manual_payment(reg_rej.id, actor="admin1", approved=False, rejection_reason="Bad proof")
        
        res_check_rej = client.get(f"/admin/api/participants")
        parts_rej_map = {p["id"]: p for p in res_check_rej.get_json()["participants"]}
        assert parts_rej_map[u_none.id]["overall_attendance"] == "NOT_ATTENDED"
        print("[PASS] TEST 11: Rejected registration does not grant PRESENT attendance.")

        # ----------------------------------------------------
        # TEST 12: pending_verification is not counted as attendance
        # ----------------------------------------------------
        u_pend = User(
            id=str(uuid.uuid4()), username=f"p_pend_{uuid.uuid4().hex[:6]}", password_hash="h",
            email=f"pend_{uuid.uuid4().hex[:6]}@srmist.edu.in", cybercarnival_token=f"CC-{uuid.uuid4().hex[:6].upper()}", profile_completed=True, is_active=True
        )
        db.session.add(u_pend); db.session.commit()
        reg_pend = EventRegistration(
            id=str(uuid.uuid4()), event_id=event1.id, leader_user_id=u_pend.id,
            status="pending_verification", participant_mode="individual", transaction_id=f"TXN_{uuid.uuid4().hex[:6]}"
        )
        mem_pend = RegistrationMember(id=str(uuid.uuid4()), registration_id=reg_pend.id, event_id=event1.id, user_id=u_pend.id, is_leader=True)
        db.session.add_all([reg_pend, mem_pend]); db.session.commit()

        res_check_pend = client.get("/admin/api/participants")
        parts_pend_map = {p["id"]: p for p in res_check_pend.get_json()["participants"]}
        assert parts_pend_map[u_pend.id]["overall_attendance"] == "NOT_ATTENDED"
        print("[PASS] TEST 12: pending_verification status is NOT_ATTENDED.")

        # ----------------------------------------------------
        # TEST 13: Duplicate ticket scan remains blocked
        # ----------------------------------------------------
        dup_scan = check_in_ticket(reg_single.id, token=reg_single.ticket_token, actor="admin_scanner")
        assert dup_scan["success"] is False
        assert dup_scan["status"] in ("ALREADY_CHECKED_IN", "ALREADY_PRESENT")
        print("[PASS] TEST 13: Duplicate ticket scan blocked with ALREADY_CHECKED_IN.")

        # ----------------------------------------------------
        # TEST 14: Unauthorized user cannot modify attendance
        # ----------------------------------------------------
        with client.session_transaction() as sess:
            sess.clear()
            sess["user_id"] = u_single.id
        res_unauth = client.post("/admin/api/tickets/check-in", json={"registration_id": reg_single.id, "token": reg_single.ticket_token})
        assert res_unauth.status_code in (401, 403)
        print("[PASS] TEST 14: Non-admin participant forbidden from check-in endpoints.")

        # ----------------------------------------------------
        # TEST 15: Admin can see attendance
        # ----------------------------------------------------
        with client.session_transaction() as sess:
            sess["admin_username"] = "admin_master"
            sess["is_admin"] = True
        res_admin_view = client.get("/admin/api/participants")
        assert res_admin_view.status_code == 200
        print("[PASS] TEST 15: Admin authorized to view participant attendance data.")

        # ----------------------------------------------------
        # TEST 16 & 17: Correct checked_in_at timestamp & checked_in_by displayed
        # ----------------------------------------------------
        p_single_att = parts_map[u_single.id]["attended_events"][0]
        assert p_single_att["checked_in_at"] is not None
        assert p_single_att["checked_in_at_formatted"] is not None
        assert p_single_att["checked_in_by"] == "verifier_admin_alpha"
        print(f"[PASS] TEST 16 & 17: Timestamps ({p_single_att['checked_in_at_formatted']}) & verifier ({p_single_att['checked_in_by']}) accurately exposed.")

        # ----------------------------------------------------
        # TEST 18: No duplicate participant count when a participant attends multiple events
        # ----------------------------------------------------
        summary_counts = data_all["summary"]
        assert summary_counts["present_count"] == initial_p_count + 3 # initial DB present count + (u_single, u_multi, u_partial)
        print(f"[PASS] TEST 18: Summary count accurately counts distinct present participants ({summary_counts['present_count']} total = {initial_p_count} initial + 3 new test users).")

        # Cleanup test records
        db.session.delete(reg_unatt); db.session.delete(mem_unatt)
        db.session.delete(reg_single); db.session.delete(mem_single)
        db.session.delete(reg_multi1); db.session.delete(mem_multi1)
        db.session.delete(reg_multi2); db.session.delete(mem_multi2)
        db.session.delete(reg_part1); db.session.delete(mem_part1)
        db.session.delete(reg_part2); db.session.delete(mem_part2)
        db.session.delete(reg_rej); db.session.delete(mem_rej)
        db.session.delete(reg_pend); db.session.delete(mem_pend)
        db.session.delete(u_none); db.session.delete(u_unattended)
        db.session.delete(u_single); db.session.delete(u_multi)
        db.session.delete(u_partial); db.session.delete(u_pend)
        db.session.delete(event1); db.session.delete(event2)
        db.session.commit()

    print("=" * 70)
    print("ALL 18 ADMIN PARTICIPANTS ATTENDANCE TEST CASES PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
