import sys
from app import app
from routes.auth import verify_turnstile_token

def test_turnstile_captcha_verification():
    print("=== STARTING CLOUDFLARE TURNSTILE CAPTCHA VERIFICATION TESTS ===")
    
    # 1. Test missing / empty token
    is_valid, msg = verify_turnstile_token("", "127.0.0.1")
    assert not is_valid, "Empty token must be rejected"
    assert msg == "Please complete the security verification.", f"Unexpected error msg: {msg}"
    print("[OK] Test 1 Passed: Empty Turnstile token rejected with correct error message")

    # 2. Test API endpoint behavior via Flask Test Client
    with app.test_client() as client:
        # 2a. Direct API login call without Turnstile token -> MUST REJECT
        res = client.post("/api/auth/login", json={"username": "admin", "password": "adminpass"})
        assert res.status_code == 400, f"Expected HTTP 400 when CAPTCHA is missing, got {res.status_code}"
        data = res.get_json()
        assert data.get("error") == "Please complete the security verification.", f"Unexpected error: {data}"
        print("[OK] Test 2a Passed: Direct API login attempt without CAPTCHA rejected on server with HTTP 400")

        # 2b. Direct API login call with invalid Turnstile token -> MUST REJECT
        res = client.post("/api/auth/login", json={
            "username": "admin",
            "password": "adminpass",
            "turnstile_token": "INVALID_TOKEN"
        })
        assert res.status_code in (400, 401), f"Expected HTTP 400 or 401, got {res.status_code}"
        print("[OK] Test 2b Passed: Direct API login attempt verified and handled securely")

        # 2c. Direct API register call without Turnstile token -> MUST REJECT
        res = client.post("/api/auth/register", json={"username": "newuser", "email": "newuser@example.com", "password": "password123"})
        assert res.status_code == 400, f"Expected HTTP 400 when CAPTCHA is missing on registration, got {res.status_code}"
        data = res.get_json()
        assert data.get("error") == "Please complete the security verification.", f"Unexpected error: {data}"
        print("[OK] Test 2c Passed: Direct API registration attempt without CAPTCHA rejected on server with HTTP 400")

        # 2d. Direct API register call with invalid Turnstile token -> MUST REJECT
        res = client.post("/api/auth/register", json={
            "username": "newuser",
            "email": "newuser@example.com",
            "password": "password123",
            "turnstile_token": "INVALID_TOKEN"
        })
        assert res.status_code == 400, f"Expected HTTP 400 on invalid CAPTCHA registration, got {res.status_code}"
        print("[OK] Test 2d Passed: Direct API registration attempt with invalid token rejected with HTTP 400")

    print("=== ALL CLOUDFLARE TURNSTILE CAPTCHA TESTS PASSED ===")

if __name__ == "__main__":
    test_turnstile_captcha_verification()
