import os
import sys
import unittest

backend_dir = r"c:\Resume Projects\cybercarnival\cyber_carnival_deploy\CyberCarnival\backend"
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

import config
from app import create_app
from extensions import db
from models import User

class TestGoogleOAuthRouting(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.config['TESTING'] = True
        self.client = self.app.test_client()
        self.app_context = self.app.app_context()
        self.app_context.push()

    def tearDown(self):
        db.session.rollback()
        self.app_context.pop()

    def test_01_google_login_source_session(self):
        """TEST 1 & 2: Initiation from login/register sets session['oauth_source']"""
        with self.client as client:
            # Login initiation
            res = client.post('/api/auth/google/login', json={
                'turnstile_token': 'dummy',
                'source': 'login'
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('auth_url', data)
            with client.session_transaction() as sess:
                self.assertEqual(sess.get('oauth_source'), 'login')
                self.assertIsNotNone(sess.get('oauth_state'))
                self.assertIsNotNone(sess.get('code_verifier'))

        with self.client as client:
            # Register initiation
            res = client.post('/api/auth/google/login', json={
                'turnstile_token': 'dummy',
                'source': 'register'
            })
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertIn('auth_url', data)
            with client.session_transaction() as sess:
                self.assertEqual(sess.get('oauth_source'), 'register')

    def test_03_04_callback_error_redirects(self):
        """TEST 3 & 4: Callback cancellation/error redirects to initiating page"""
        # From login
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            res = client.get('/api/auth/google/callback?error=access_denied')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=oauth_cancelled'))

        # From register
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'register'})
            res = client.get('/api/auth/google/callback?error=access_denied')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/register?error=oauth_cancelled'))

    def test_05_invalid_state_rejected(self):
        """TEST 5: Invalid OAuth state rejected & redirects to originating page"""
        # From login with bad state
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            res = client.get('/api/auth/google/callback?code=badcode&state=badstate')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=invalid_state'))

        # From register with bad state
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'register'})
            res = client.get('/api/auth/google/callback?code=badcode&state=badstate')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/register?error=invalid_state'))

    def test_06_token_exchange_failure_redirect(self):
        """TEST 6: Token exchange failure redirects to originating page"""
        with self.client as client:
            client.post('/api/auth/google/login', json={'turnstile_token': 'dummy', 'source': 'login'})
            with client.session_transaction() as sess:
                valid_state = sess.get('oauth_state')
            
            # Send valid state but fake code that google token endpoint will fail on
            res = client.get(f'/api/auth/google/callback?code=invalid_auth_code&state={valid_state}')
            self.assertEqual(res.status_code, 302)
            self.assertTrue(res.location.endswith('/login?error=token_exchange_failed'))

if __name__ == '__main__':
    unittest.main()
