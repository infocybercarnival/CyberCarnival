import os
import sys
import unittest
from datetime import datetime

from pathlib import Path

# Set backend root path
backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import create_app
from extensions import db
from models import User, Event, EventRegistration, RegistrationMember, OtpVerification
from services.user_service import complete_profile, DuplicateProfileEmailError
from utils.validators import validate_profile_payload, ValidationError

class TestProfileCompletionFlow(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['WTF_CSRF_ENABLED'] = False
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        db.session.rollback()
        # Clean up any test users created during test cases
        users = User.query.filter(User.email.like("%@example.com")).all()
        for u in users:
            # Clean up registrations/members
            regs = EventRegistration.query.filter_by(leader_user_id=u.id).all()
            for r in regs:
                RegistrationMember.query.filter_by(registration_id=r.id).delete()
                db.session.delete(r)
            RegistrationMember.query.filter_by(user_id=u.id).delete()
            OtpVerification.query.filter_by(email=u.email).delete()
            db.session.delete(u)
        db.session.commit()
        self.app_context.pop()

    def test_01_empty_participant_name(self):
        """1. Empty Participant Name -> rejected"""
        with self.assertRaises(ValidationError) as cm:
            validate_profile_payload({
                'participant_name': '',
                'participant_email': 'test_prof1@example.com',
                'college_name': 'Test College',
                'phone': '9876543210'
            })
        self.assertIn('participant_name', cm.exception.errors)

    def test_02_participant_email_read_only(self):
        """2. Participant Email is read-only and uses user.email"""
        u = User(
            email='test_prof1@example.com',
            username='user_ro',
            password_hash='test_hash',
            full_name='',
            phone='',
            college='',
            profile_completed=False,
            cybercarnival_token='TOKEN_RO'
        )
        db.session.add(u)
        db.session.commit()

        # complete_profile automatically populates email from u.email
        updated_user = complete_profile(u, {
            'participant_name': 'Read Only Test',
            'college_name': 'College Test',
            'phone': '9876543210',
            'details_confirmed': True
        })
        self.assertEqual(updated_user.email, 'test_prof1@example.com')

    def test_04_participant_email_locked_against_edits(self):
        """4. Participant Email cannot be changed to another email"""
        u1 = User(
            email='test_prof_dup@example.com',
            username='user_dup_1',
            password_hash='test_hash',
            full_name='User One',
            phone='9876543210',
            college='College A',
            profile_completed=True,
            cybercarnival_token='TOKEN_DUP1'
        )
        db.session.add(u1)

        u2 = User(
            email='test_prof2@example.com',
            username='user_dup_2',
            password_hash='test_hash',
            full_name='User Two',
            phone='9876543211',
            college='College B',
            profile_completed=False,
            cybercarnival_token='TOKEN_DUP2'
        )
        db.session.add(u2)
        db.session.commit()

        # Attempt to pass u1's email when updating u2's profile
        updated_u2 = complete_profile(u2, {
            'participant_name': 'User Two Modified',
            'participant_email': 'test_prof_dup@example.com',
            'college_name': 'College B',
            'phone': '9876543211',
            'details_confirmed': True
        })
        # u2's email remains u2's verified account email test_prof2@example.com
        self.assertEqual(updated_u2.email, 'test_prof2@example.com')

    def test_05_empty_college_name(self):
        """5. Empty College Name -> rejected"""
        with self.assertRaises(ValidationError) as cm:
            validate_profile_payload({
                'participant_name': 'Test Name',
                'participant_email': 'test_prof1@example.com',
                'college_name': '',
                'phone': '9876543210'
            })
        self.assertIn('college_name', cm.exception.errors)

    def test_06_phone_number_strict_validation(self):
        """6. Phone number strict 10-digit validation"""
        valid_numbers = ['9876543210', '1234567890']
        invalid_numbers = [
            '987654321',      # 9 digits
            '98765432101',    # 11 digits
            '+919876543210',  # +91 prefix
            '98765 43210',    # space
            '98765-43210',    # hyphen
            'abcdefghij',     # letters
            '',               # empty
            '   '             # whitespace
        ]

        for num in valid_numbers:
            clean = validate_profile_payload({
                'participant_name': 'Test Name',
                'college_name': 'Test College',
                'phone': num,
                'details_confirmed': True
            })
            self.assertEqual(clean['phone'], num)

        for num in invalid_numbers:
            with self.assertRaises(ValidationError) as cm:
                validate_profile_payload({
                    'participant_name': 'Test Name',
                    'college_name': 'Test College',
                    'phone': num,
                    'details_confirmed': True
                })
            self.assertIn('phone', cm.exception.errors)
            self.assertEqual(cm.exception.errors['phone'], 'Phone number must be exactly 10 digits.')

    def test_09_10_valid_profile_save_and_persistence(self):
        """9. Valid details -> saved successfully & 10. Persisted in PostgreSQL"""
        u = User(
            email='test_prof1@example.com',
            username='user_prof1',
            password_hash='test_hash',
            full_name='',
            phone='',
            college='',
            profile_completed=False,
            cybercarnival_token='TOKEN_PROF1'
        )
        db.session.add(u)
        db.session.commit()

        updated_user = complete_profile(u, {
            'participant_name': 'John Doe',
            'participant_email': 'test_prof1@example.com',
            'college_name': 'SRM IST Ramapuram',
            'phone': '9876543210',
            'details_confirmed': True
        })

        self.assertTrue(updated_user.profile_completed)
        self.assertEqual(updated_user.full_name, 'John Doe')
        self.assertEqual(updated_user.email, 'test_prof1@example.com')
        self.assertEqual(updated_user.college, 'SRM IST Ramapuram')
        self.assertEqual(updated_user.phone, '9876543210')

        # Re-fetch from DB
        db_user = User.query.get(u.id)
        self.assertTrue(db_user.profile_completed)
        self.assertEqual(db_user.full_name, 'John Doe')

    def test_11_user_ownership_security(self):
        """11. Authenticated user can only update their own profile"""
        u1 = User(
            email='test_prof_sec1_unique@example.com',
            username='user_sec11_uniq',
            password_hash='test_hash',
            full_name='Owner',
            phone='9876543210',
            college='College 1',
            profile_completed=True,
            cybercarnival_token='TOKEN_SEC11_UNIQ'
        )
        db.session.add(u1)
        db.session.commit()

        with self.client as client:
            with client.session_transaction() as sess:
                sess['user_id'] = str(u1.id)

            res = client.post('/api/auth/profile', json={
                'participant_name': 'Hacker Name',
                'college_name': 'Hacked College',
                'phone': '9876543210',
                'details_confirmed': True
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data['full_name'], 'Hacker Name')
            self.assertEqual(data['id'], str(u1.id))

    def test_19_email_tampering_ignored(self):
        """Changing request body email does NOT alter authenticated user email"""
        u = User(
            email='test_prof1@example.com',
            username='user_tamper',
            password_hash='test_hash',
            full_name='',
            phone='',
            college='',
            profile_completed=False,
            cybercarnival_token='TOKEN_TAMPER'
        )
        db.session.add(u)
        db.session.commit()

        # Attempt to pass a modified email in payload
        updated_user = complete_profile(u, {
            'participant_name': 'Tamper User',
            'participant_email': 'hacker_tamper@evil.com',
            'college_name': 'College Tamper',
            'phone': '9876543210',
            'details_confirmed': True
        })

        # Must strictly preserve authenticated user's email
        self.assertEqual(updated_user.email, 'test_prof1@example.com')
        db_user = User.query.get(u.id)
        self.assertEqual(db_user.email, 'test_prof1@example.com')

    def test_15_details_confirmed_false_rejected(self):
        """Direct API request with details_confirmed=false -> rejected"""
        with self.assertRaises(ValidationError) as cm:
            validate_profile_payload({
                'participant_name': 'Test Name',
                'participant_email': 'test_prof1@example.com',
                'college_name': 'Test College',
                'phone': '9876543210',
                'details_confirmed': False
            })
        self.assertIn('details_confirmed', cm.exception.errors)

    def test_16_details_confirmed_missing_rejected(self):
        """Direct API request without details_confirmed -> rejected"""
        with self.assertRaises(ValidationError) as cm:
            validate_profile_payload({
                'participant_name': 'Test Name',
                'participant_email': 'test_prof1@example.com',
                'college_name': 'Test College',
                'phone': '9876543210'
            })
        self.assertIn('details_confirmed', cm.exception.errors)

    def test_17_details_confirmed_string_rejected(self):
        """Direct API request with details_confirmed="true" -> rejected"""
        with self.assertRaises(ValidationError) as cm:
            validate_profile_payload({
                'participant_name': 'Test Name',
                'participant_email': 'test_prof1@example.com',
                'college_name': 'Test College',
                'phone': '9876543210',
                'details_confirmed': 'true'
            })
        self.assertIn('details_confirmed', cm.exception.errors)

    def test_18_details_confirmed_true_accepted(self):
        """Direct API request with details_confirmed=true -> accepted"""
        clean = validate_profile_payload({
            'participant_name': 'Test Name',
            'participant_email': 'test_prof1@example.com',
            'college_name': 'Test College',
            'phone': '9876543210',
            'details_confirmed': True
        })
        self.assertTrue(clean.get('details_confirmed'))

    def test_12_13_14_event_relationship_and_registration(self):
        """12-14. Event derived from registration, participant info persisted in PG"""
        event = Event.query.first()
        self.assertIsNotNone(event)

        u = User(
            email='test_reg_flow@example.com',
            username='user_reg_flow',
            password_hash='test_hash',
            full_name='Reg Flow User',
            phone='9876543210',
            college='College Reg',
            profile_completed=True,
            cybercarnival_token='TOKEN_REGFLOW'
        )
        db.session.add(u)
        db.session.commit()

        reg = EventRegistration(
            event_id=event.id,
            leader_user_id=u.id,
            participant_mode='individual',
            status='confirmed',
            created_at=datetime.utcnow()
        )
        db.session.add(reg)
        db.session.commit()

        member = RegistrationMember(
            registration_id=reg.id,
            event_id=event.id,
            user_id=u.id,
            participant_name=u.full_name,
            participant_email=u.email,
            college_name=u.college,
            participant_phone=u.phone,
            is_leader=True
        )
        db.session.add(member)
        db.session.commit()

        self.assertEqual(reg.event_id, event.id)
        self.assertEqual(member.participant_email, 'test_reg_flow@example.com')

if __name__ == '__main__':
    unittest.main()
