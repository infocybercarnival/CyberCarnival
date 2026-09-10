import os
import sys
import unittest
from pathlib import Path

backend_dir = str(Path(__file__).resolve().parent.parent)
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import config
from app import create_app
from extensions import db
from models import User, OAuthFlow

class TestGoogleOAuthRouting(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.app.config['WTF_CSRF_ENABLED'] = False
        config.GOOGLE_CLIENT_ID = "test-google-client-id"
        config.GOOGLE_CLIENT_SECRET = "test-google-client-secret"
        config.TURNSTILE_SECRET_KEY = "test-turnstile-secret"
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()
        db.create_all()

    def tearDown(self):
        db.session.rollback()
        self.app_context.pop()

    def test_01_google_login_source_session(self):
        """TEST 1 & 2: Initiation from login/register sets OAuthFlow DB record"""
        with self.client as client:
            res = client.post('/api/auth/google/login', json={
                'turnstile_token': 'dummy',
                'source': 'login'
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('auth_url', data)
            flow = OAuthFlow.query.filter_by(source='login').order_by(OAuthFlow.created_at.desc()).first()
            self.assertIsNotNone(flow)
            self.assertEqual(flow.source, 'login')

        with self.client as client:
            res = client.post('/api/auth/google/login', json={
                'turnstile_token': 'dummy',
                'source': 'register'
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('auth_url', data)
            flow = OAuthFlow.query.filter_by(source='register').order_by(OAuthFlow.created_at.desc()).first()
            self.assertIsNotNone(flow)
            self.assertEqual(flow.source, 'register')

    def test_03_04_callback_error_redirects(self):
        """TEST 3 & 4: Callback cancellation/error redirects to initiating page"""
        # From login
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            flow = OAuthFlow.query.filter_by(source='login').order_by(OAuthFlow.created_at.desc()).first()
            res = client.get(f'/api/auth/google/callback?error=access_denied&state={flow.state}')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=oauth_cancelled'))

        # From register
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'register'})
            flow = OAuthFlow.query.filter_by(source='register').order_by(OAuthFlow.created_at.desc()).first()
            res = client.get(f'/api/auth/google/callback?error=access_denied&state={flow.state}')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/register?error=oauth_cancelled'))

    def test_05_invalid_state_rejected(self):
        """TEST 5: Invalid OAuth state rejected & redirects to originating page"""
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            res = client.get('/api/auth/google/callback?code=badcode&state=badstate')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=invalid_state'))

        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'register'})
            res = client.get('/api/auth/google/callback?code=badcode&state=badstate')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=invalid_state'))

    def test_06_token_exchange_failure_redirect(self):
        """TEST 6: Token exchange failure redirects to originating page"""
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            flow = OAuthFlow.query.filter_by(source='login').order_by(OAuthFlow.created_at.desc()).first()
            valid_state = flow.state
            
            res = client.get(f'/api/auth/google/callback?code=invalid_auth_code&state={valid_state}')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=token_exchange_failed'))

if __name__ == '__main__':
    unittest.main()
