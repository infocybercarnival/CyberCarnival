import sys
import uuid
from pathlib import Path
import pytest

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
from extensions import db
import models
from models import User, Event, EventRegistration, RegistrationMember
from services.registration_service import (
    register_for_event, verify_manual_payment,
    UnknownMemberTokenError
)

app = create_app()

class TestTeamAdditionAndVerificationFlow:

    @pytest.fixture(autouse=True)
    def setup_data(self):
        with app.app_context():
            db.create_all()

            # Create team-enabled event
            evt_team = Event(
                name=f"Team Hackathon {uuid.uuid4().hex[:4]}",
                category="TECHNICAL",
                fee="₹500",
                fee_amount=50000,
                min_team_size=2,
                max_team_size=4,
                max_teams=50,
                coordinator_username=f"coord_team_{uuid.uuid4().hex[:6]}",
                coordinator_password_hash="pbkdf2:sha256:dummy",
                coordinator_login_active=True
            )

            # Create another event for coordinator isolation checks
            evt_other = Event(
                name=f"Other Event {uuid.uuid4().hex[:4]}",
                category="NON-TECHNICAL",
                fee="₹200",
                fee_amount=20000,
                min_team_size=1,
                max_team_size=2,
                max_teams=50,
                coordinator_username=f"coord_other_{uuid.uuid4().hex[:6]}",
                coordinator_password_hash="pbkdf2:sha256:dummy",
                coordinator_login_active=True
            )

            db.session.add(evt_team)
            db.session.add(evt_other)
            db.session.commit()

            # Create Team Leader
            leader = User(
                cybercarnival_token=f"CC{uuid.uuid4().hex[:8].upper()}",
                username=f"leader_{uuid.uuid4().hex[:6]}",
                password_hash="dummy",
                email=f"leader_{uuid.uuid4().hex[:6]}@srmist.edu.in",
                full_name="Leader Person",
                phone="9876543210",
                college="SRM Ramapuram",
                profile_completed=True
            )

            # Create Teammate 1
            m1 = User(
                cybercarnival_token=f"CC{uuid.uuid4().hex[:8].upper()}",
                username=f"m1_{uuid.uuid4().hex[:6]}",
                password_hash="dummy",
                email=f"m1_{uuid.uuid4().hex[:6]}@srmist.edu.in",
                full_name="Member One",
                phone="9876543211",
                college="SRM Ramapuram",
                profile_completed=True
            )

            # Create Teammate 2
            m2 = User(
                cybercarnival_token=f"CC{uuid.uuid4().hex[:8].upper()}",
                username=f"m2_{uuid.uuid4().hex[:6]}",
                password_hash="dummy",
                email=f"m2_{uuid.uuid4().hex[:6]}@srmist.edu.in",
                full_name="Member Two",
                phone="9876543212",
                college="SRM Ramapuram",
                profile_completed=True
            )

            # Create Teammate 3
            m3 = User(
                cybercarnival_token=f"CC{uuid.uuid4().hex[:8].upper()}",
                username=f"m3_{uuid.uuid4().hex[:6]}",
                password_hash="dummy",
                email=f"m3_{uuid.uuid4().hex[:6]}@srmist.edu.in",
                full_name="Member Three",
                phone="9876543213",
                college="SRM Ramapuram",
                profile_completed=True
            )

            # Create Teammate 4 (Overflow)
            m4 = User(
                cybercarnival_token=f"CC{uuid.uuid4().hex[:8].upper()}",
                username=f"m4_{uuid.uuid4().hex[:6]}",
                password_hash="dummy",
                email=f"m4_{uuid.uuid4().hex[:6]}@srmist.edu.in",
                full_name="Member Four Overflow",
                phone="9876543214",
                college="SRM Ramapuram",
                profile_completed=True
            )

            db.session.add_all([leader, m1, m2, m3, m4])
            db.session.commit()

            self.evt_team_id = evt_team.id
            self.evt_team_coord_user = evt_team.coordinator_username
            self.evt_other_id = evt_other.id
            self.evt_other_coord_user = evt_other.coordinator_username

            self.leader_id = leader.id
            self.leader_email = leader.email
            self.leader_token = leader.cybercarnival_token

            self.m1_id = m1.id
            self.m1_email = m1.email
            self.m1_token = m1.cybercarnival_token

            self.m2_id = m2.id
            self.m2_email = m2.email
            self.m2_token = m2.cybercarnival_token

            self.m3_id = m3.id
            self.m3_email = m3.email
            self.m3_token = m3.cybercarnival_token

            self.m4_id = m4.id
            self.m4_email = m4.email
            self.m4_token = m4.cybercarnival_token

            self.client = app.test_client()

        yield

        with app.app_context():
            db.session.remove()

    # 1 & 2. Successful team registration with multiple members
    def test_successful_team_registration_and_db_persistence(self):
        with app.app_context():
            with self.client.session_transaction() as sess:
                sess["user_id"] = self.leader_id
                sess["email"] = self.leader_email

            res = self.client.post("/api/registrations", json={
                "event_id": self.evt_team_id,
                "participant_mode": "team",
                "team_name": "Cyber Titans",
                "member_tokens": [self.m1_token, self.m2_token],
                "participants": [
                    {
                        "participant_name": "Leader Person",
                        "participant_email": self.leader_email,
                        "college_name": "SRM Ramapuram",
                        "participant_phone": "9876543210"
                    },
                    {
                        "participant_name": "Member One",
                        "participant_email": self.m1_email,
                        "college_name": "SRM Ramapuram",
                        "participant_phone": "9876543211"
                    },
                    {
                        "participant_name": "Member Two",
                        "participant_email": self.m2_email,
                        "college_name": "SRM Ramapuram",
                        "participant_phone": "9876543212"
                    }
                ]
            })

            assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
            data = res.get_json()
            reg_id = data["id"]

            # 9. Verify saved in database atomically
            reg = db.session.get(EventRegistration, reg_id)
            assert reg is not None
            assert reg.team_name == "Cyber Titans"
            assert reg.participant_mode == "team"
            assert len(reg.members) == 3

            leader_m = [m for m in reg.members if m.is_leader][0]
            assert leader_m.user_id == self.leader_id

            teammates = [m for m in reg.members if not m.is_leader]
            assert len(teammates) == 2
            teammate_user_ids = {m.user_id for m in teammates}
            assert self.m1_id in teammate_user_ids
            assert self.m2_id in teammate_user_ids

    # 4. Minimum team size validation
    def test_minimum_team_size_validation(self):
        with app.app_context():
            with self.client.session_transaction() as sess:
                sess["user_id"] = self.leader_id
                sess["email"] = self.leader_email

            # min_team_size is 2. Sending 0 teammates (total 1) in team mode should fail.
            res = self.client.post("/api/registrations", json={
                "event_id": self.evt_team_id,
                "participant_mode": "team",
                "team_name": "Too Small Squad",
                "member_tokens": [],
                "participants": [
                    {
                        "participant_name": "Leader Person",
                        "participant_email": self.leader_email,
                        "college_name": "SRM Ramapuram",
                        "participant_phone": "9876543210"
                    }
                ]
            })
            assert res.status_code in [422, 400]
            assert "team size must be between 2 and 4" in res.get_json().get("error", "").lower()

    # 5. Maximum team size validation
    def test_maximum_team_size_validation(self):
        with app.app_context():
            with self.client.session_transaction() as sess:
                sess["user_id"] = self.leader_id
                sess["email"] = self.leader_email

            # max_team_size is 4. Sending 4 teammates (total 5) should fail.
            res = self.client.post("/api/registrations", json={
                "event_id": self.evt_team_id,
                "participant_mode": "team",
                "team_name": "Too Large Squad",
                "member_tokens": [
                    self.m1_token,
                    self.m2_token,
                    self.m3_token,
                    self.m4_token
                ],
                "participants": [
                    {"participant_name": "Leader Person", "participant_email": self.leader_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543210"},
                    {"participant_name": "Member One", "participant_email": self.m1_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543211"},
                    {"participant_name": "Member Two", "participant_email": self.m2_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543212"},
                    {"participant_name": "Member Three", "participant_email": self.m3_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543213"},
                    {"participant_name": "Member Four Overflow", "participant_email": self.m4_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543214"}
                ]
            })
            assert res.status_code in [422, 400]
            assert "team size must be between 2 and 4" in res.get_json().get("error", "").lower()

    # 6 & 7. Duplicate member token and email prevention
    def test_duplicate_member_token_prevention(self):
        with app.app_context():
            with self.client.session_transaction() as sess:
                sess["user_id"] = self.leader_id

            res = self.client.post("/api/registrations", json={
                "event_id": self.evt_team_id,
                "participant_mode": "team",
                "team_name": "Duplicate Token Squad",
                "member_tokens": [self.m1_token, self.m1_token],
                "participants": [
                    {"participant_name": "Leader Person", "participant_email": self.leader_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543210"},
                    {"participant_name": "Member One", "participant_email": self.m1_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543211"},
                    {"participant_name": "Member One Dup", "participant_email": self.m1_email, "college_name": "SRM Ramapuram", "participant_phone": "9876543211"}
                ]
            })
            assert res.status_code in [422, 400]
            err_data = res.get_json()
            assert "validation failed" in err_data.get("error", "").lower() or "duplicate" in str(err_data).lower()

    # 10. Failed registration rolls back database transaction cleanly
    def test_failed_registration_rollback(self):
        with app.app_context():
            leader = db.session.get(User, self.leader_id)
            count_before = RegistrationMember.query.count()
            try:
                register_for_event(leader, {
                    "event_id": self.evt_team_id,
                    "participant_mode": "team",
                    "team_name": "Rollback Test",
                    "member_tokens": ["NON_EXISTENT_TOKEN_12345"]
                })
            except UnknownMemberTokenError:
                pass
            count_after = RegistrationMember.query.count()
            assert count_before == count_after, "Failed registration left orphan records!"

    # 11. Admin can view complete team details
    def test_admin_view_team_details(self):
        with app.app_context():
            # Create a registration first
            reg = EventRegistration(
                event_id=self.evt_team_id,
                team_name="Admin View Team",
                leader_user_id=self.leader_id,
                participant_mode="team",
                status="pending_verification",
                payment_amount=50000
            )
            db.session.add(reg)
            db.session.flush()

            m_leader = RegistrationMember(
                registration_id=reg.id,
                event_id=self.evt_team_id,
                user_id=self.leader_id,
                is_leader=True,
                participant_name="Leader Person",
                participant_email=self.leader_email,
                college_name="SRM Ramapuram",
                participant_phone="9876543210"
            )
            m_member = RegistrationMember(
                registration_id=reg.id,
                event_id=self.evt_team_id,
                user_id=self.m1_id,
                is_leader=False,
                participant_name="Member One",
                participant_email=self.m1_email,
                college_name="SRM Ramapuram",
                participant_phone="9876543211"
            )
            db.session.add_all([m_leader, m_member])
            db.session.commit()

            with self.client.session_transaction() as sess:
                sess["admin_username"] = "admin"

            res = self.client.get(f"/admin/api/registrations/{reg.id}")
            assert res.status_code == 200
            data = res.get_json()
            assert data["team_name"] == "Admin View Team"
            assert data["member_count"] == 2
            assert len(data["members"]) == 2
            emails = {m["email"] for m in data["members"]}
            assert self.leader_email in emails
            assert self.m1_email in emails

    # 12. Unauthorized users cannot access another team's payment page
    def test_unauthorized_user_access_prevention(self):
        with app.app_context():
            reg = EventRegistration(
                event_id=self.evt_team_id,
                team_name="Private Team",
                leader_user_id=self.leader_id,
                participant_mode="team",
                status="pending_payment",
                payment_amount=50000
            )
            db.session.add(reg)
            db.session.commit()

            # Random user trying to access
            with self.client.session_transaction() as sess:
                sess["user_id"] = self.m4_id

            res = self.client.get(f"/api/events/{self.evt_team_id}/payment/{reg.id}")
            assert res.status_code == 403
            assert "not authorized" in res.get_json().get("error", "").lower()

    # 13. Coordinator access respects event isolation
    def test_coordinator_event_isolation(self):
        with app.app_context():
            reg = EventRegistration(
                event_id=self.evt_team_id,
                team_name="Team Hackers",
                leader_user_id=self.leader_id,
                participant_mode="team",
                status="confirmed",
                payment_amount=50000
            )
            db.session.add(reg)
            db.session.commit()

            # Coordinator for evt_other tries to view participants of evt_team
            with self.client.session_transaction() as sess:
                sess["coordinator_username"] = self.evt_other_coord_user
                sess["coordinator_event_id"] = self.evt_other_id

            res = self.client.get(f"/coordinator/api/events/{self.evt_team_id}/participants")
            assert res.status_code == 403
            assert "not authorized" in res.get_json().get("error", "").lower()

            # Assigned coordinator for evt_team accesses participants
            with self.client.session_transaction() as sess:
                sess["coordinator_username"] = self.evt_team_coord_user
                sess["coordinator_event_id"] = self.evt_team_id

            res_assigned = self.client.get(f"/coordinator/api/events/{self.evt_team_id}/participants")
            assert res_assigned.status_code == 200

    # 14. Payment verification updates whole team's registration status
    def test_payment_verification_applies_to_team(self):
        with app.app_context():
            reg = EventRegistration(
                event_id=self.evt_team_id,
                team_name="Payment Team",
                leader_user_id=self.leader_id,
                participant_mode="team",
                status="pending_verification",
                transaction_id=f"TXN_{uuid.uuid4().hex[:10]}",
                payment_amount=50000
            )
            db.session.add(reg)
            db.session.flush()

            m_leader = RegistrationMember(
                registration_id=reg.id,
                event_id=self.evt_team_id,
                user_id=self.leader_id,
                is_leader=True,
                participant_name="Leader Person"
            )
            db.session.add(m_leader)
            db.session.commit()

            # Verify manual payment by admin
            success = verify_manual_payment(reg.id, "admin", True)
            assert success is True
            db.session.refresh(reg)
            assert reg.status == "confirmed"
            assert reg.ticket_token is not None
