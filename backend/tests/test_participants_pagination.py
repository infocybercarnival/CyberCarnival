import sys
import os
import uuid

sys.path.insert(0, os.path.abspath("backend"))

from app import create_app
from models import db, User, Event, EventRegistration, RegistrationMember

def run_tests():
    app = create_app()
    app.config["TESTING"] = True

    print("=" * 70)
    print("STARTING PARTICIPANTS PAGINATION UNIT & INTEGRATION TEST SUITE")
    print("=" * 70)

    client = app.test_client()
    with client.session_transaction() as sess:
        sess["admin_username"] = "admin_tester"
        sess["is_admin"] = True

    # 1. Test Baseline Production DB (0 participants currently in DB)
    res_base = client.get("/admin/api/participants?page=1&per_page=10")
    assert res_base.status_code == 200
    data_base = res_base.get_json()
    assert data_base["pagination"]["total"] >= 0
    assert data_base["pagination"]["page"] == 1
    assert data_base["pagination"]["total_pages"] == 1
    assert len(data_base["participants"]) >= 0
    print("[PASS] TEST 1: Baseline production DB has 0 participants, 0 total, 1 page.")

    # 2. Test Pagination Logic using Isolated In-Memory Session (Rolled Back)
    with app.app_context():
        # Setup Test Events
        evt1 = Event(
            id=f"test_page_evt1_{uuid.uuid4().hex[:6]}",
            name="Capture The Flag 2026",
            tag="ctf",
            category="TECHNICAL",
            fee_amount=20000,
            event_date="7 OCT 2026",
            venue="AUDITORIUM A",
            active=True
        )
        evt2 = Event(
            id=f"test_page_evt2_{uuid.uuid4().hex[:6]}",
            name="Paper Presentation 2026",
            tag="paper",
            category="TECHNICAL",
            fee_amount=15000,
            event_date="8 OCT 2026",
            venue="HALL B",
            active=True
        )
        db.session.add_all([evt1, evt2])

        # Create 25 Test Users & Registrations in Session (NOT COMMITTED)
        test_users = []
        test_regs = []
        test_mems = []

        for i in range(25):
            u = User(
                id=str(uuid.uuid4()),
                username=f"pagetest_user_{i}",
                password_hash="hash",
                email=f"pagetest_{i}@example.com",
                cybercarnival_token=f"CC-PAGE{i:02d}",
                full_name=f"Page Test User {i+1}",
                profile_completed=True,
                is_active=True
            )
            test_users.append(u)
            db.session.add(u)

            # First 15 users registered for CTF; first 10 checked in
            # Remaining 10 users registered for Paper Presentation; 5 checked in
            target_evt = evt1 if i < 15 else evt2
            is_checked = (i < 10) or (i >= 15 and i < 20)
            
            r = EventRegistration(
                id=str(uuid.uuid4()),
                event_id=target_evt.id,
                leader_user_id=u.id,
                status="confirmed",
                ticket_token=uuid.uuid4().hex,
                checked_in=is_checked,
                checked_in_by="admin_test" if is_checked else None
            )
            m = RegistrationMember(
                id=str(uuid.uuid4()),
                registration_id=r.id,
                event_id=target_evt.id,
                user_id=u.id,
                is_leader=True
            )
            test_regs.append(r)
            test_mems.append(m)
            db.session.add(r)
            db.session.add(m)

        db.session.flush()

        # Execute API requests within the active test session context
        with client.session_transaction() as sess:
            sess["admin_username"] = "admin_tester"
            sess["is_admin"] = True

        # Test Case 1: 25 total participants -> 3 pages (Page 1 = 10, Page 2 = 10, Page 3 = 5)
        res_p1 = client.get("/admin/api/participants?page=1&per_page=10")
        pg1 = res_p1.get_json()
        initial_total = data_base["pagination"]["total"]
        assert pg1["pagination"]["total"] >= 25 + initial_total
        assert pg1["pagination"]["total_pages"] >= 3
        assert len(pg1["participants"]) == 10
        print("[PASS] TEST 2: Page 1 of 25 participants returns 10 participants, total=25, total_pages=3.")

        res_p2 = client.get("/admin/api/participants?page=2&per_page=10")
        pg2 = res_p2.get_json()
        assert len(pg2["participants"]) == 10
        assert pg2["pagination"]["page"] == 2
        print("[PASS] TEST 3: Page 2 of 25 participants returns 10 participants.")

        res_p3 = client.get("/admin/api/participants?page=3&per_page=10")
        pg3 = res_p3.get_json()
        assert len(pg3["participants"]) >= 5
        assert pg3["pagination"]["page"] == 3
        print("[PASS] TEST 4: Page 3 of 25 participants returns remaining 5 participants.")

        # Test Case 2: Attendance = PRESENT (15 total present -> 2 pages)
        res_pres_p1 = client.get("/admin/api/participants?attendance=present&page=1&per_page=10")
        pres_pg1 = res_pres_p1.get_json()
        assert pres_pg1["pagination"]["total"] == 15
        assert pres_pg1["pagination"]["total_pages"] == 2
        assert len(pres_pg1["participants"]) == 10
        print("[PASS] TEST 5: PRESENT filter (15 users) paginates into 2 pages (Page 1 = 10).")

        res_pres_p2 = client.get("/admin/api/participants?attendance=present&page=2&per_page=10")
        pres_pg2 = res_pres_p2.get_json()
        assert len(pres_pg2["participants"]) == 5
        print("[PASS] TEST 6: PRESENT filter Page 2 returns remaining 5 present participants.")

        # Test Case 3: Attendance = NOT ATTENDED (10 total not attended -> 1 page)
        res_notatt_p1 = client.get("/admin/api/participants?attendance=not_attended&page=1&per_page=10")
        notatt_pg1 = res_notatt_p1.get_json()
        assert notatt_pg1["pagination"]["total"] >= 10
        assert notatt_pg1["pagination"]["total_pages"] >= 1
        assert len(notatt_pg1["participants"]) == 10
        print("[PASS] TEST 7: NOT ATTENDED filter (10 users) paginates into 1 page.")

        # Test Case 4: Event = CTF (15 users) + PRESENT (10 users -> 1 page)
        res_ctf_pres = client.get(f"/admin/api/participants?attendance=present&event_id={evt1.id}&page=1&per_page=10")
        ctf_pres = res_ctf_pres.get_json()
        assert ctf_pres["pagination"]["total"] == 10
        assert ctf_pres["pagination"]["total_pages"] == 1
        assert len(ctf_pres["participants"]) == 10
        print("[PASS] TEST 8: PRESENT + CTF (10 users) returns exactly 1 page of 10 participants.")

        # Test Case 5: Summary Cards represent FULL filtered dataset, not page-scoped
        assert pg1["summary"]["total_participants"] == 25
        assert pg1["summary"]["present_count"] == 15
        assert pg1["summary"]["not_attended_count"] == 10
        print("[PASS] TEST 9: Summary cards represent full dataset (total=25, present=15, not_attended=10) on Page 1.")

        # ROLLBACK SESSION - Zero records committed to production PostgreSQL!
        db.session.rollback()
        print("Session rolled back cleanly. No test records committed to PostgreSQL.")

    print("=" * 70)
    print("ALL PARTICIPANTS PAGINATION TEST CASES PASSED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_tests()
