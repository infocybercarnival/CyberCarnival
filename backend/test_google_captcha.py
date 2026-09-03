import sys
from app import app

def test_google_login_captcha_verification():
    print("=== STARTING GOOGLE OAUTH MANDATORY CAPTCHA VERIFICATION TESTS ===")

    with app.test_client() as client:
        # 1. Access Google Login endpoint without Turnstile token -> MUST REJECT
        res = client.get("/api/auth/google/login?format=json")
        assert res.status_code == 400, f"Expected HTTP 400 when CAPTCHA is missing, got {res.status_code}"
        data = res.get_json()
        assert data.get("error") == "Please complete the security verification.", f"Unexpected error: {data}"
        print("[OK] Test 1 Passed: Direct Google Login call without Turnstile token rejected with HTTP 400")

        # 2. Access Google Callback directly without CAPTCHA verification -> MUST REJECT
        res = client.get("/api/auth/google/callback?code=dummy_code&state=dummy_state")
        assert res.status_code == 302, f"Expected redirect, got {res.status_code}"
        assert "error=captcha_failed" in res.headers["Location"] or "register" in res.headers["Location"]
        print("[OK] Test 2 Passed: Direct Google Callback attempt without CAPTCHA verification rejected with redirect to register page")

    print("=== ALL GOOGLE OAUTH MANDATORY CAPTCHA TESTS PASSED ===")

if __name__ == "__main__":
    test_google_login_captcha_verification()
